// Layer E — Trails dashboard route tests via the subprocess-server harness.
// Mirrors server.connectors.test.ts exactly: a dedicated temp DB seeded via a RAW createClient (never
// the shared db singleton), the server subprocess spawned against the same file: DB, and HTTP hits with
// a klav_session cookie. NO real Plane/network — the only mutating route here is dismiss; file is not
// exercised against a real connector (no auto-copy connector is seeded).

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-trails-srv-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) { await rawClient.execute({ sql, args }) }

// ── Schema (only the tables this suite needs; mirrors applySchema/migrateV2 DDL) ──
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS trails (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, intent TEXT NOT NULL DEFAULT '', base_url TEXT NOT NULL, baseline_ref TEXT, author_kind TEXT NOT NULL DEFAULT 'human', status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS trail_runs (id TEXT PRIMARY KEY, trail_id TEXT NOT NULL, project_id TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'running', llm_calls INTEGER NOT NULL DEFAULT 0, summary_json TEXT, started_at INTEGER NOT NULL, finished_at INTEGER)`)
await rawExec(`CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, run_id TEXT NOT NULL, step_id TEXT, trail_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, evidence_json TEXT, ground_quote TEXT, confidence REAL NOT NULL DEFAULT 0, dedup_key TEXT NOT NULL, recurrence INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'queued', connector_ref TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
// run_steps (player timeline) + walk_replays (gzipped rrweb segments) — mirrors applySchema DDL.
await rawExec(`CREATE TABLE IF NOT EXISTS run_steps (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, trail_id TEXT NOT NULL, step_id TEXT NOT NULL, project_id TEXT NOT NULL, idx INTEGER NOT NULL, tier TEXT NOT NULL DEFAULT 'none', verdict TEXT NOT NULL DEFAULT 'skip', confidence REAL NOT NULL DEFAULT 0, diagnosis TEXT, healed INTEGER NOT NULL DEFAULT 0, evidence_json TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS walk_replays (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, project_id TEXT NOT NULL, segments_gz TEXT NOT NULL, n_segments INTEGER, n_events INTEGER, created_at INTEGER NOT NULL)`)
// connectors table, seeded but left EMPTY on purpose: the file→400 'no connector' assertion below must
// prove the realFiler no-auto-copy-connector branch (returns null), not a swallowed error on a missing table.
await rawExec(`CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`)

// ── Fixtures ─────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = `admin-${ts}@test.local`
const MEMBER_EMAIL = `member-${ts}@test.local`
const ADMIN_SID = `sess_admin_${ts}`
const MEMBER_SID = `sess_member_${ts}`
const ACCOUNT_ID = `acct_${ts}`
const PROJECT_ID = `proj_${ACCOUNT_ID}`
const TRAIL_ID = `trl_${ts}`
const WALK_ID = `walk_${ts}`
const QUEUED_FINDING_ID = `find_q_${ts}`
const REG_FINDING_ID = `find_r_${ts}`
const NOW = Date.now()

await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Test Workspace", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_${ACCOUNT_ID}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Default Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_admin_${ts}`, PROJECT_ID, ADMIN_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [MEMBER_EMAIL, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_member_${ts}`, PROJECT_ID, MEMBER_EMAIL, "member", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [MEMBER_SID, MEMBER_EMAIL, NOW, NOW + 86400_000])

// Trail + a finished AMBER Walk + two queued findings (one amber_heal, one regression).
await rawExec(`INSERT INTO trails (id, project_id, name, intent, base_url, author_kind, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [TRAIL_ID, PROJECT_ID, "Checkout", "log in and check out", "https://shop.test", "human", "active", ADMIN_EMAIL, NOW, NOW])
await rawExec(`INSERT INTO trail_runs (id, trail_id, project_id, trigger, status, llm_calls, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [WALK_ID, TRAIL_ID, PROJECT_ID, "manual", "amber", 2, NOW, NOW + 1000])
await rawExec(`INSERT INTO findings (id, project_id, run_id, step_id, trail_id, kind, title, evidence_json, ground_quote, confidence, dedup_key, recurrence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [QUEUED_FINDING_ID, PROJECT_ID, WALK_ID, null, TRAIL_ID, "amber_heal", "Healed Checkout but unconfirmed", JSON.stringify({ rationale: "label moved", fromSelector: "#checkout", toSelector: ".pay" }), "label moved", 0.7, "k_amber", 1, "queued", NOW, NOW])
await rawExec(`INSERT INTO findings (id, project_id, run_id, step_id, trail_id, kind, title, evidence_json, ground_quote, confidence, dedup_key, recurrence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [REG_FINDING_ID, PROJECT_ID, WALK_ID, null, TRAIL_ID, "regression", "Checkout gone", JSON.stringify({ rationale: "element absent" }), "element absent", 0.95, "k_reg", 1, "queued", NOW, NOW])

// A saved rrweb replay for WALK_ID: two per-page segments + matching run_steps (one AMBER heal). The
// gzip encoding must match getReplay (base64(gzip(JSON.stringify(segments)))).
const REPLAY_SEGMENTS = [
  { idx: 0, url: "file:///cart.html", events: [{ type: 2, t: 1 }, { type: 3, t: 2 }] },
  { idx: 6, url: "file:///confirm.html", events: [{ type: 2, t: 3 }, { type: 3, t: 4 }] },
]
const REPLAY_GZ = Buffer.from(Bun.gzipSync(Buffer.from(JSON.stringify(REPLAY_SEGMENTS)))).toString("base64")
await rawExec(`INSERT INTO walk_replays (id, run_id, project_id, segments_gz, n_segments, n_events, created_at) VALUES (?,?,?,?,?,?,?)`,
  [`rep_${ts}`, WALK_ID, PROJECT_ID, REPLAY_GZ, 2, 4, NOW])
await rawExec(`INSERT INTO run_steps (id, run_id, trail_id, step_id, project_id, idx, tier, verdict, confidence, healed, evidence_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  [`rs0_${ts}`, WALK_ID, TRAIL_ID, `st0_${ts}`, PROJECT_ID, 5, "candidate", "amber", 0.95, 1, JSON.stringify({ healed: true }), NOW])
await rawExec(`INSERT INTO run_steps (id, run_id, trail_id, step_id, project_id, idx, tier, verdict, confidence, healed, evidence_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  [`rs1_${ts}`, WALK_ID, TRAIL_ID, `st1_${ts}`, PROJECT_ID, 6, "cache", "green", 1, 0, JSON.stringify({}), NOW])

// ── Second project B (for IDOR / cross-project tests). MEMBER_EMAIL is NOT a member of project B. ──
const ACCOUNT_B_ID = `acctB_${ts}`
const PROJECT_B_ID = `proj_${ACCOUNT_B_ID}`
const TRAIL_B_ID = `trlB_${ts}`
const WALK_B_ID = `walkB_${ts}`
const B_FINDING_ID = `find_b_${ts}`
const OWNER_B_EMAIL = `ownerB-${ts}@test.local`
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [OWNER_B_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_B_ID, "Other Workspace", OWNER_B_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_${ACCOUNT_B_ID}`, ACCOUNT_B_ID, OWNER_B_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_B_ID, ACCOUNT_B_ID, "Project B", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_ownerB_${ts}`, PROJECT_B_ID, OWNER_B_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO trails (id, project_id, name, intent, base_url, author_kind, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [TRAIL_B_ID, PROJECT_B_ID, "B Trail", "", "https://b.test", "human", "active", OWNER_B_EMAIL, NOW, NOW])
await rawExec(`INSERT INTO trail_runs (id, trail_id, project_id, trigger, status, llm_calls, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [WALK_B_ID, TRAIL_B_ID, PROJECT_B_ID, "manual", "red", 1, NOW, NOW + 1000])
await rawExec(`INSERT INTO findings (id, project_id, run_id, step_id, trail_id, kind, title, evidence_json, ground_quote, confidence, dedup_key, recurrence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [B_FINDING_ID, PROJECT_B_ID, WALK_B_ID, null, TRAIL_B_ID, "amber_heal", "B finding", JSON.stringify({ rationale: "b" }), "b", 0.7, "k_b", 1, "queued", NOW, NOW])

// A dedicated Trail for the walk-trigger smoke: an UNREACHABLE base_url so the spawned server's
// background walk fails fast (no real Chromium work matters — the route returns right after startWalk).
const WALK_TRAIL_ID = `trl_walk_${ts}`
await rawExec(`INSERT INTO trails (id, project_id, name, intent, base_url, author_kind, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [WALK_TRAIL_ID, PROJECT_ID, "Walk smoke", "", "https://invalid.test/", "human", "active", ADMIN_EMAIL, NOW, NOW])

async function findingStatus(id: string): Promise<string | null> {
  const r = await rawClient.execute({ sql: `SELECT status FROM findings WHERE id=?`, args: [id] })
  return r.rows.length ? String((r.rows[0] as any).status) : null
}

async function trailRunCount(trailId: string): Promise<number> {
  const r = await rawClient.execute({ sql: `SELECT COUNT(*) AS n FROM trail_runs WHERE trail_id=?`, args: [trailId] })
  return Number((r.rows[0] as any).n)
}

// ── Spawn the server ──────────────────────────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  // Unique port band (41xxx) so this subprocess server can't collide with another suite's.
  // The old 19xxx band was shared with server.connectors (19000-19999) and overlapped
  // server.inbound-webhook (19500-19899); under bun's concurrent file execution a port clash
  // meant our readiness probe hit the OTHER suite's server, whose DB has no MEMBER_SID, so every
  // authed route 401'd — the intermittent CI red. No other test uses 4xxxx.
  serverPort = 41000 + Math.floor(Math.random() * 1000)
  BASE = `http://localhost:${serverPort}`
  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(serverPort),
      TURSO_DATABASE_URL: "file:" + srvDbFile,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET,
      KLAV_BASE_URL: BASE,
      KLAV_ALLOWED_DOMAINS: "test.local",
      KLAV_DEV_SHOW_OTP: "1",
      SENDGRID_API_KEY: "",
      KLAV_MAIL_FROM: "",
      OPENROUTER_API_KEY: "test-key",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
      if (r && r.status < 500) break
    } catch { /* not ready */ }
    await Bun.sleep(150)
  }
})

afterAll(() => { serverProc?.kill(); rawClient.close() })

function authCookie(sid: string) { return `klav_session=${sid}` }
async function api(method: string, path: string, body: any, sid: string) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: authCookie(sid) },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────────

test("GET /api/trails/dashboard returns trails, walks, queue, precision (project-scoped, authed)", async () => {
  const r = await api("GET", `/api/trails/dashboard?project=${PROJECT_ID}`, null, MEMBER_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(Array.isArray(b.trails)).toBe(true)
  expect(b.trails.some((t: any) => t.id === TRAIL_ID)).toBe(true)
  expect(Array.isArray(b.recentWalks)).toBe(true)
  expect(b.recentWalks.some((w: any) => w.id === WALK_ID && w.status === "amber")).toBe(true)
  expect(Array.isArray(b.queue)).toBe(true)
  expect(b.queue.length).toBe(2)
  expect(b.precision).toBeDefined()
  expect(b.precision.precision).toBeNull() // nothing filed/dismissed yet
})

test("GET /api/trails/dashboard is 401 without a session", async () => {
  const r = await fetch(`${BASE}/api/trails/dashboard?project=${PROJECT_ID}`)
  expect(r.status).toBe(401)
})

test("POST /api/trails/findings/:id/dismiss removes it from the queue", async () => {
  const r = await api("POST", `/api/trails/findings/${QUEUED_FINDING_ID}/dismiss?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)

  const after = await api("GET", `/api/trails/dashboard?project=${PROJECT_ID}`, null, MEMBER_SID)
  const b = await after.json()
  expect(b.queue.some((f: any) => f.id === QUEUED_FINDING_ID)).toBe(false)
  // The dismissed finding now counts against precision (0 filed, 1 dismissed → 0).
  expect(b.precision.dismissed).toBe(1)
  expect(b.precision.precision).toBeCloseTo(0)
})

test("POST /api/trails/findings/:id/file returns 400 when the project has no connector", async () => {
  const r = await api("POST", `/api/trails/findings/${REG_FINDING_ID}/file?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(400)
  expect((await r.json()).ok).toBe(false)
})

test("dismissing a foreign-project finding id under my project is blocked (B's finding unchanged)", async () => {
  // MEMBER is a member of project A only. Targeting B's finding id but scoped to ?project=A:
  // the project-scoped lookup finds nothing → 404, and B's finding is never touched (no cross-project write).
  const r = await api("POST", `/api/trails/findings/${B_FINDING_ID}/dismiss?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(404)
  expect(await findingStatus(B_FINDING_ID)).toBe("queued")
})

test("requesting a project the user is NOT a member of returns 403", async () => {
  const r = await api("POST", `/api/trails/findings/${B_FINDING_ID}/dismiss?project=${PROJECT_B_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(403)
  expect(await findingStatus(B_FINDING_ID)).toBe("queued")
})

test("POST .../dismiss on a non-existent finding id returns 404 (not a misleading 200)", async () => {
  const r = await api("POST", `/api/trails/findings/find_nope_${ts}/dismiss?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(404)
  expect((await r.json()).ok).toBe(false)
})

test("GET /api/trails/walks/:runId/replay returns segments + steps when authed (project-scoped)", async () => {
  const r = await api("GET", `/api/trails/walks/${WALK_ID}/replay?project=${PROJECT_ID}`, null, MEMBER_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(b.runId).toBe(WALK_ID)
  expect(Array.isArray(b.segments)).toBe(true)
  expect(b.segments.length).toBe(2)
  expect(b.segments[0].events.length).toBe(2)
  expect(b.segments[1].url).toContain("confirm.html")
  // steps included so the player can mark verdicts / seek to the failing step.
  expect(Array.isArray(b.steps)).toBe(true)
  expect(b.steps.some((s: any) => s.verdict === "amber")).toBe(true)
})

test("GET /api/trails/walks/:runId/replay is 401 without a session", async () => {
  const r = await fetch(`${BASE}/api/trails/walks/${WALK_ID}/replay?project=${PROJECT_ID}`)
  expect(r.status).toBe(401)
})

test("GET /api/trails/walks/:runId/replay is 404 when the walk has no replay", async () => {
  const r = await api("GET", `/api/trails/walks/walk_noreplay_${ts}/replay?project=${PROJECT_ID}`, null, MEMBER_SID)
  expect(r.status).toBe(404)
})

test("GET /api/trails/dashboard flags walks that have a replay (hasReplay)", async () => {
  const r = await api("GET", `/api/trails/dashboard?project=${PROJECT_ID}`, null, MEMBER_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  const w = b.recentWalks.find((x: any) => x.id === WALK_ID)
  expect(w).toBeDefined()
  expect(w.hasReplay).toBe(true)
})

test("the trails page references the rrweb-player replay assets", async () => {
  const r = await fetch(`${BASE}/trails`, { headers: { Cookie: `klav_session=${MEMBER_SID}` } })
  const html = await r.text()
  expect(html).toContain("rrweb-player")
  expect(html).toContain("/api/trails/walks/")
})

test("POST /api/trails/:id/walk triggers a walk and returns a runId (authed)", async () => {
  const r = await api("POST", `/api/trails/${WALK_TRAIL_ID}/walk?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(200)
  const b = await r.json(); expect(b.runId).toMatch(/^walk_/)
})
test("POST /api/trails/:id/walk is 401 without a session", async () => {
  const r = await fetch(`${BASE}/api/trails/${WALK_TRAIL_ID}/walk?project=${PROJECT_ID}`, { method: "POST" })
  expect(r.status).toBe(401)
})
test("POST /api/trails/:id/walk is 404 for an unknown trail", async () => {
  const r = await api("POST", `/api/trails/trl_nope_${ts}/walk?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(404)
})
test("walking a foreign-project trail id under my project is blocked (no walk started for B)", async () => {
  // MEMBER is a member of project A only. Targeting B's trail id but scoped to ?project=A: runWalkNow's
  // getTrail is project-scoped → finds nothing → 404, and critically NO trail_runs row is minted for
  // TRAIL_B (the slot is never even reserved). Mirrors the dismiss-IDOR test, for the walk route.
  const before = await trailRunCount(TRAIL_B_ID)
  const r = await api("POST", `/api/trails/${TRAIL_B_ID}/walk?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(404)
  expect(await trailRunCount(TRAIL_B_ID)).toBe(before)
})

test("GET /trails-demo/journey/landing.html serves the bundled demo fixture (no auth)", async () => {
  const r = await fetch(`${BASE}/trails-demo/journey/landing.html`)
  expect(r.status).toBe(200)
  const html = await r.text()
  expect(html.toLowerCase()).toContain("<html")
})

test("GET /trails-demo with path traversal is rejected", async () => {
  const r = await fetch(`${BASE}/trails-demo/..%2f..%2fserver.ts`)
  expect(r.status).toBe(404)
})

test("GET /trails serves the dashboard page when authed", async () => {
  const r = await fetch(`${BASE}/trails`, { headers: { Cookie: `klav_session=${MEMBER_SID}` } })
  expect(r.status).toBe(200)
  const html = await r.text()
  expect(html).toContain("Trails")
  expect(html).toContain("/api/trails/dashboard")
})

test("the trails page has a per-trail Run affordance that POSTs the walk route", async () => {
  const r = await fetch(`${BASE}/trails`, { headers: { Cookie: `klav_session=${MEMBER_SID}` } })
  const html = await r.text()
  // The Run button marker + the walk-trigger route the page POSTs to.
  expect(html).toContain("data-run")
  expect(html).toContain("/walk")
  expect(html).toContain("Run")
})
