// One-off backfill: create a CLEAN, deduplicated set of 7 curated bug tickets in the qbuilder Plane
// project (05ea72ad, the proj_32948ecf connector target) synthesized from Klavity dogfooding feedback,
// then mark the related source feedback rows as exported (plane_issue_key / plane_issue_url + a
// ticket_exports row). Does NOT create one issue per raw row.
//
// Idempotent two ways: (a) an issue is matched by exact title — if it already exists in Plane we reuse
// its key and never re-create; (b) source rows are only keyed when plane_issue_key IS NULL.
//
// Run server-side with the prod env loaded:
//   ssh root@66.135.20.62 'set -a; . /etc/klav/klav.env; set +a; cd /opt/klav/prototype; \
//     BACKFILL_DRY=1 /home/klav/.bun/bin/bun scripts/backfill-curated-plane.ts'   # inspect first
//   ...then drop BACKFILL_DRY for the live run.
import { createClient, type Client } from "@libsql/client"
import { decryptSecret } from "../lib/crypto"

const DRY = process.env.BACKFILL_DRY === "1"
const CONNECTOR_PROJECT = process.env.BACKFILL_CONNECTOR_PROJECT || "proj_32948ecf-a7bb" // owns the qbuilder Plane connector
const BIGIDEA = "proj_6d574acf"
const WEBSITE = "proj_5a9b422f"

type Status = "fixed" | "in_progress" | "queued"
type Row = { id: string; projectId: string; observation: string; urlPath: string; planeKey: string | null }
type Curated = {
  slug: string
  title: string
  body: string
  priority: "urgent" | "high" | "medium" | "low" | "none"
  status: Status
  match: (r: Row) => boolean
}

const has = (s: string, ...kw: string[]) => { const l = (s || "").toLowerCase(); return kw.some(k => l.includes(k)) }
const inProj = (r: Row, p: string) => r.projectId.startsWith(p)

// The 7 curated tickets (clean title + synthesized description + status/priority). `match` picks the
// raw feedback rows each one synthesizes.
const TICKETS: Curated[] = [
  {
    slug: "klavity-dashboard-cold-slow",
    title: "[Klavity] Dashboard loading & empty states feel cold and slow",
    priority: "medium", status: "fixed",
    body: "Synthesized from ~10 dogfooding Sim observations on /dashboard. The dashboard felt slow to load, the \"Loading your project…\" copy and empty placeholder boxes read as cold/uninviting, and the empty states lacked clarity about what would appear and why. Fixed in v0.39.100 (faster load, warmer empty states, clearer guidance).\n\nSource: Klavity dogfooding.",
    // Dashboard-context AND a complaint signal — most /dashboard Sim observations are positive/neutral
    // ("fantastic", "delighted"); we only synthesize the ones expressing the cold/slow/empty problem.
    match: r => inProj(r, CONNECTOR_PROJECT)
      && (has(r.urlPath, "dashboard") || has(r.observation, "dashboard"))
      && has(r.observation, "load", "loading", "empty", "cold", "slow", "uninviting", "placeholder", "blank", "nothing here", "sluggish", "spinner", "wait", "dull", "boring"),
  },
  {
    slug: "klavity-single-ticket-layout",
    title: "[Klavity] Single-ticket page layout was redundant",
    priority: "low", status: "fixed",
    body: "The single-ticket page repeated the title and showed a stray \"satisfied\" label; the layout was reorganized to title-on-top, image-left, details-right. Fixed in v0.39.100.\n\nSource: Klavity dogfooding.",
    // Specific to the single-ticket PAGE layout — require ticket-page context AND a layout signal
    // ("ticket"/"satisfied" alone appear in tons of generic Sim observations).
    match: r => inProj(r, CONNECTOR_PROJECT)
      && has(r.observation, "single ticket", "ticket page", "ticket view", "ticket detail", "single-ticket")
      && has(r.observation, "redundant", "repeat", "title", "layout", "reorganiz", "duplicat"),
  },
  {
    slug: "bigidea-widget-upload-progress",
    title: "[Bigidea] Widget submit upload is slow with no progress indicator",
    priority: "high", status: "in_progress",
    body: "Submitting a report through the widget is slow and gives no feedback while the screenshot uploads. Add a progress bar (~10s) so users know it's working. In progress.\n\nSource: Bigidea dogfooding.",
    match: r => inProj(r, BIGIDEA) && has(r.observation, "upload", "progress", "submit", "slow", "spinner", "loading"),
  },
  {
    slug: "bigidea-rightclick-drag-menu",
    title: "[Bigidea] Right-click-drag shows the previous context menu without closing it",
    priority: "medium", status: "in_progress",
    body: "Right-click-dragging leaves the previous right-click menu open instead of closing it, so a stale menu lingers. In progress.\n\nSource: Bigidea dogfooding.",
    match: r => inProj(r, BIGIDEA) && has(r.observation, "right-click", "right click", "rightclick", "drag", "context menu", "previous menu"),
  },
  {
    slug: "bigidea-widget-active-close-scroll",
    title: "[Bigidea] Widget active state invisible; close/edit icon cut off; tall screens need scroll",
    priority: "medium", status: "in_progress",
    body: "Three related widget issues: the active state isn't visible, the close/edit icon is cut off, and on tall screens the panel needs to scroll. Cutoff + scroll fixed; active-state indicator still in progress.\n\nSource: Bigidea dogfooding.",
    match: r => inProj(r, BIGIDEA) && has(r.observation, "active state", "active indicator", "not visible", "close icon", "edit icon", "cut off", "cutoff", "scroll", "tall"),
  },
  {
    slug: "website-leadgen-form-dull",
    title: "[Website] Leadgen bug-report form looks dull and off-brand",
    priority: "low", status: "queued",
    body: "The leadgen bug-report form looks dull/white, doesn't match the home-page background, and has no micro-animations. Queued.\n\nSource: Website dogfooding.",
    match: r => inProj(r, WEBSITE) && has(r.observation, "dull", "white", "background", "leadgen", "lead gen", "form", "match", "boring"),
  },
  {
    slug: "website-sharp-capture-align",
    title: "[Website] Sharp option unclear; capture-button icon/text misaligned; missing icon micro-animations",
    priority: "low", status: "queued",
    body: "The \"Sharp\" option was unclear, the capture button's icon and text weren't middle-aligned, and icon micro-animations were missing. Sharp-clarity fixed; alignment + animations queued.\n\nSource: Website dogfooding.",
    match: r => inProj(r, WEBSITE) && has(r.observation, "sharp", "capture", "align", "middle", "icon", "animation"),
  },
]

const STATUS_GROUP: Record<Status, string[]> = {
  fixed: ["completed"],
  in_progress: ["started"],
  queued: ["unstarted", "backlog"],
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function planeGetAll(base: string, token: string): Promise<any[]> {
  const out: any[] = []
  let url: string | null = `${base}/issues/?per_page=100`
  for (let i = 0; url && i < 20; i++) {
    const r: any = await fetch(url, { headers: { "X-API-Key": token } })
    if (!r.ok) break
    const d: any = await r.json()
    out.push(...(d.results || []))
    url = d.next_page_results && d.next_cursor ? `${base}/issues/?per_page=100&cursor=${d.next_cursor}` : null
  }
  return out
}

export async function runCuratedBackfill(client: Client, log: (s: string) => void = console.log) {
  // 1) Load the qbuilder Plane connector (config + decrypted token).
  // project_id is stored as the full id (proj_32948ecf-a7bb-…); CONNECTOR_PROJECT is a stable prefix.
  const cRows = (await client.execute({
    sql: "SELECT id, project_id, config FROM connectors WHERE project_id LIKE ? AND type='plane' AND enabled=1 ORDER BY created_at ASC LIMIT 1",
    args: [CONNECTOR_PROJECT + "%"],
  })).rows
  if (!cRows.length) throw new Error(`No enabled Plane connector on ${CONNECTOR_PROJECT}*`)
  const connectorId = String(cRows[0].id)
  const cfg = JSON.parse(String(cRows[0].config) || "{}")
  for (const k of ["token", "inbound_secret"]) if (cfg[k]) { try { cfg[k] = await decryptSecret(cfg[k]) } catch { cfg[k] = "" } }
  const host = String(cfg.host || "https://api.plane.so").replace(/\/$/, "")
  const workspace = String(cfg.workspace), project_id = String(cfg.project_id), token = String(cfg.token)
  const base = `${host}/api/v1/workspaces/${workspace}/projects/${project_id}`
  log(`connector ${connectorId} → ${host} ws=${workspace} project=${project_id}`)

  // 2) Load every candidate feedback row (a real bug report OR a Sim observation) across the 3 projects.
  const fbRows = (await client.execute({
    sql: `SELECT id, project_id, COALESCE(observation,'') observation, COALESCE(url_path,'') url_path, plane_issue_key
          FROM feedback WHERE (observation IS NOT NULL AND observation<>'')
          ORDER BY created_at ASC`,
    args: [],
  })).rows.map((x: any): Row => ({ id: String(x.id), projectId: String(x.project_id), observation: String(x.observation), urlPath: String(x.url_path), planeKey: x.plane_issue_key != null ? String(x.plane_issue_key) : null }))

  // 3) Assign rows to tickets — first match wins (a row belongs to exactly one ticket).
  const assigned = new Map<string, Row[]>()
  for (const t of TICKETS) assigned.set(t.slug, [])
  for (const r of fbRows) {
    const t = TICKETS.find(t => t.match(r))
    if (t) assigned.get(t.slug)!.push(r)
  }

  // States (for status) — fetched once.
  let states: any[] = []
  try { const sr: any = await fetch(`${base}/states/`, { headers: { "X-API-Key": token } }); if (sr.ok) states = (await sr.json()).results || [] } catch {}
  const stateIdFor = (st: Status): string | null => {
    for (const g of STATUS_GROUP[st]) { const s = states.find(s => s.group === g); if (s) return String(s.id) }
    return null
  }

  // Idempotency: existing issues by title.
  const existing = DRY ? [] : await planeGetAll(base, token)
  const byTitle = new Map(existing.map((i: any) => [String(i.name), i]))

  const results: { slug: string; title: string; key: string; url: string; rows: string[]; created: boolean }[] = []
  for (const t of TICKETS) {
    const rows = assigned.get(t.slug)!
    const unkeyed = rows.filter(r => !r.planeKey)
    log(`\n# ${t.title}\n  matched ${rows.length} feedback rows (${unkeyed.length} un-keyed) [${t.status}/${t.priority}]`)
    for (const r of rows.slice(0, 30)) log(`    - ${r.projectId} ${r.id}: ${r.observation.replace(/\s+/g, " ").slice(0, 90)}`)
    if (DRY) { results.push({ slug: t.slug, title: t.title, key: "(dry)", url: "", rows: unkeyed.map(r => r.id), created: false }); continue }

    // Create (or reuse) the Plane issue.
    let issue = byTitle.get(t.title)
    let created = false
    if (!issue) {
      const body: any = { name: t.title, description_html: t.body, priority: t.priority }
      const sid = stateIdFor(t.status); if (sid) body.state = sid
      const cr: any = await fetch(`${base}/issues/`, { method: "POST", headers: { "X-API-Key": token, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!cr.ok) { log(`  ✗ create failed HTTP ${cr.status}: ${(await cr.text().catch(() => "")).slice(0, 160)}`); continue }
      issue = await cr.json(); created = true
      await sleep(400) // be polite to Plane
    }
    const key = issue.sequence_id != null ? String(issue.sequence_id) : String(issue.id)
    const webBase = host.replace(/\/api$/, "")
    const url = `${webBase}/${workspace}/projects/${project_id}/issues/${issue.id}`

    // Key the un-keyed source rows + record a ticket_exports row each (idempotent: NULL-only update).
    for (const r of unkeyed) {
      await client.execute({ sql: "UPDATE feedback SET plane_issue_key=?, plane_issue_url=? WHERE id=? AND (plane_issue_key IS NULL OR plane_issue_key='')", args: [key, url, r.id] })
      await client.execute({
        sql: "INSERT INTO ticket_exports (id, feedback_id, project_id, connector_id, type, external_key, external_url, status, error, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        args: [`tex_${crypto.randomUUID()}`, r.id, r.projectId, connectorId, "plane", key, url, "ok", null, Date.now(), "backfill-curated"],
      })
    }
    log(`  ${created ? "✓ created" : "↻ reused"} ${key} — keyed ${unkeyed.length} rows — ${url}`)
    results.push({ slug: t.slug, title: t.title, key, url, rows: unkeyed.map(r => r.id), created })
  }

  // Unmatched candidate rows (no ticket) — report so nothing is silently lost.
  const matchedIds = new Set(Array.from(assigned.values()).flat().map(r => r.id))
  const unmatched = fbRows.filter(r => !matchedIds.has(r.id) && !r.planeKey)
  return { results, unmatched }
}

if (import.meta.main) {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL
  if (!url) { console.error("No TURSO_DATABASE_URL in env"); process.exit(1) }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined })
  if (process.env.BACKFILL_DIAG === "1") {
    console.log("=== CONNECTORS ===")
    for (const x of (await client.execute("SELECT id, project_id, type, name, enabled, auto_copy FROM connectors")).rows)
      console.log(`${x.id}\tproj=${x.project_id}\t${x.type}\ten=${x.enabled} auto=${x.auto_copy}\t${x.name}`)
    console.log("\n=== FEEDBACK BY PROJECT (total / observation-rows / null-plane-key) ===")
    for (const x of (await client.execute("SELECT project_id, COUNT(*) n, SUM(CASE WHEN observation IS NOT NULL AND observation<>'' THEN 1 ELSE 0 END) obs, SUM(CASE WHEN (plane_issue_key IS NULL OR plane_issue_key='') THEN 1 ELSE 0 END) nullkey FROM feedback GROUP BY project_id ORDER BY n DESC")).rows)
      console.log(`${x.project_id}\ttotal=${x.n}\tobs=${x.obs}\tnullkey=${x.nullkey}`)
    process.exit(0)
  }
  const { results, unmatched } = await runCuratedBackfill(client)
  console.log(`\n=== ${DRY ? "DRY RUN — no changes" : "LIVE"} ===`)
  for (const r of results) console.log(`${r.key}\t${r.created ? "created" : (DRY ? "would-create" : "reused")}\t${r.rows.length} rows\t${r.title}`)
  console.log(`\nunmatched candidate rows (left untouched): ${unmatched.length}`)
  for (const r of unmatched.slice(0, 40)) console.log(`  ${r.projectId} ${r.id}: ${r.observation.replace(/\s+/g, " ").slice(0, 90)}`)
}
