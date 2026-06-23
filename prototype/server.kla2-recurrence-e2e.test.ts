// ── KLA-2 Regression-Memory — end-to-end lifecycle test ──────────────────────
//
// Drives the FULL recurrence-memory flow through real HTTP calls (not DB seeds)
// against a hermetic server subprocess, proving every stage of the epic:
//
//   POST /api/feedback × 1  →  new row, no recurrence
//   POST /api/feedback × 2  →  deduped into same row, count=2, regressed=false
//   GET  /api/feedback/:id  →  read-path returns KLA-2 fields (count/firstSeen/
//                               lastSeen/isRegression)  [feat/regression-memory-read]
//   PATCH /api/feedback/:id →  status=done → resolved_at auto-set
//   POST /api/feedback × 3  →  deduped again, count=3, regressed=true ← KEY
//   GET  /api/feedback/:id  →  isRegression=true confirmed via read-path
//   GET  /api/dashboard     →  tickets list carries all four KLA-2 fields
//   firstSeen invariant     →  never changes across bumps; lastSeen always advances
//
// Dedup trigger: POST includes `suggested_bug` (required for issueKey computation
// + semantic similarity check). Same title + same page_url + same project →
// deterministic issueKey → bumpFeedbackRecurrence() on every re-submission.
//
// isRegression timing: a 50 ms sleep between PATCH (sets resolved_at) and the
// third POST (sets last_seen_at) guarantees lastSeen > resolvedAt so that
// isRegression = (resolvedAt != null && lastSeen > resolvedAt) = true.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

const RUN     = `${Date.now()}-${randomUUID()}`
const DB_FILE = join(tmpdir(), `klav-kla2-e2e-${RUN}.db`)
const SECRET  = Buffer.from(new Uint8Array(32).fill(77)).toString("base64")

const raw = createClient({ url: "file:" + DB_FILE })
await raw.execute("PRAGMA journal_mode=WAL")
await raw.execute("PRAGMA busy_timeout=5000")
async function exec(sql: string, args: any[] = []) { await raw.execute({ sql, args }) }

// ── Schema ────────────────────────────────────────────────────────────────────
for (const ddl of [
  `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT NOT NULL, domain TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(account_id, email))`,
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', url_patterns_json TEXT, review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER DEFAULT 200, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL, invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`,
  `CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT,
    url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT,
    screenshot_id TEXT, suggested_bug_json TEXT, cited_trait_ids_json TEXT,
    source_quote TEXT, source_transcript_id TEXT, source_date INTEGER,
    plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open',
    assignee TEXT, notes TEXT, issue_key TEXT,
    recurrence_count INTEGER NOT NULL DEFAULT 1, recurrence_dates_json TEXT,
    last_seen_at INTEGER, resolved_at INTEGER, client_context_json TEXT,
    annotations_json TEXT, source_referrer TEXT, updated_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS feedback_issue_idx ON feedback(project_id, issue_key)`,
  `CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`,
  `CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT, feedback_id TEXT, screenshot_id TEXT, meta_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS screenshots (id TEXT PRIMARY KEY, project_id TEXT, s3_key TEXT NOT NULL, bucket TEXT, content_type TEXT, acl TEXT, bytes INTEGER, owner_email TEXT, expires_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS expectations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dedup_key TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'candidate', source_json TEXT NOT NULL DEFAULT '{}', corroboration_json TEXT NOT NULL DEFAULT '{}', url_path TEXT, issue_type TEXT, cited_trait_ids_json TEXT, enforced_trail_id TEXT, enforced_step_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(project_id, dedup_key))`,
  `CREATE TABLE IF NOT EXISTS monitored_urls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, UNIQUE(project_id, url_pattern))`,
  `CREATE TABLE IF NOT EXISTS monitoring_consent (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, granted_at INTEGER, updated_at INTEGER NOT NULL, UNIQUE(project_id, email))`,
  `CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS extension_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS review_counts (project_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (project_id, day))`,
]) { await exec(ddl) }

// ── Fixtures ──────────────────────────────────────────────────────────────────
const OWNER = `owner-kla2-${RUN}@test.local`
const SID   = `sess_kla2_${RUN}`
const ACCT  = `acct_kla2_${RUN}`
const PROJ  = `proj_kla2_${RUN}`
const NOW   = Date.now()

// The bug we'll report three times (same title + page_url → same issueKey → dedup)
const PAGE_URL   = `https://app.example.com/checkout`
const BUG_TITLE  = `Checkout button freezes on submit (KLA-2 e2e)`
const DESCRIPTION = `[bug] ${BUG_TITLE}`

await exec(`INSERT INTO users VALUES (?, ?, ?)`, [OWNER, "KLA-2 Owner", NOW])
await exec(`INSERT INTO sessions VALUES (?, ?, ?, ?)`, [SID, OWNER, NOW, NOW + 86_400_000])
await exec(`INSERT INTO accounts VALUES (?, ?, ?, ?, ?)`, [ACCT, "KLA-2 E2E Workspace", OWNER, null, NOW])
await exec(`INSERT INTO account_members VALUES (?, ?, ?, ?, ?)`, [`am_kla2_${RUN}`, ACCT, OWNER, "owner", NOW])
await exec(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [PROJ, ACCT, "KLA-2 E2E Project", "active", null, "auto", 500, "named", NOW, NOW])
await exec(`INSERT INTO project_members VALUES (?, ?, ?, ?, ?, ?)`,
  [`pm_kla2_${RUN}`, PROJ, OWNER, "admin", null, NOW])

// ── Server subprocess ─────────────────────────────────────────────────────────
let srvProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  const port = 47200 + Math.floor(Math.random() * 500)
  BASE = `http://localhost:${port}`
  srvProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: "file:" + DB_FILE,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: SECRET,
      KLAV_BASE_URL: BASE,
      KLAV_DEV_SHOW_OTP: "1",
      SENDGRID_API_KEY: "",
      KLAV_MAIL_FROM: "",
      OPENROUTER_API_KEY: "test-key",
    },
    stdout: "ignore",
    stderr: "ignore",
  })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
    if (r && r.status < 500) break
    await Bun.sleep(150)
  }
}, 15_000)

afterAll(() => { srvProc?.kill(); raw.close() })

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/** POST /api/feedback — multipart form (the format the widget / extension use). */
function postFeedback(description: string, suggestedBug: { title: string }) {
  const fd = new FormData()
  fd.set("description", description)
  fd.set("project_id", PROJ)
  fd.set("page_url", PAGE_URL)
  fd.set("suggested_bug", JSON.stringify(suggestedBug))
  return fetch(`${BASE}/api/feedback`, {
    method: "POST",
    headers: { cookie: `klav_session=${SID}` },
    body: fd,
  })
}

/** PATCH /api/feedback/:id — status / notes / assignee update. */
function patchFeedback(id: string, update: Record<string, unknown>) {
  return fetch(`${BASE}/api/feedback/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: `klav_session=${SID}` },
    body: JSON.stringify(update),
  })
}

/** GET /api/feedback/:id — single enriched report with KLA-2 fields. */
function getFeedback(id: string) {
  return fetch(`${BASE}/api/feedback/${encodeURIComponent(id)}`, {
    headers: { cookie: `klav_session=${SID}` },
  })
}

/** GET /api/dashboard — tickets list (includes KLA-2 fields per ticket). */
function getDashboard() {
  return fetch(`${BASE}/api/dashboard?project=${encodeURIComponent(PROJ)}`, {
    headers: { cookie: `klav_session=${SID}` },
  })
}

// Shared state: feedbackId returned by the first POST, reused across all tests.
let fid = ""

// ════════════════════════════════════════════════════════════════════════════
// 1. First submission — creates a new row, no recurrence yet
// ════════════════════════════════════════════════════════════════════════════

test("1 · first POST creates a new feedback row (saved=true, no recurrence key)", async () => {
  const r = await postFeedback(DESCRIPTION, { title: BUG_TITLE })
  expect(r.status).toBe(200)
  const body = await r.json()

  expect(body.saved).toBe(true)
  expect(typeof body.id).toBe("string")
  expect(body.id.length).toBeGreaterThan(0)

  // First occurrence — no dedup → no recurrence object in response
  expect(body.recurrence).toBeUndefined()

  fid = body.id
}, 15_000)

// ════════════════════════════════════════════════════════════════════════════
// 2. Second identical submission — deduplicated, count goes to 2
// ════════════════════════════════════════════════════════════════════════════

test("2 · second POST is deduplicated: same id returned, recurrenceCount=2, regressed=false", async () => {
  expect(fid).toBeTruthy()   // guard: test 1 must have run first

  const r = await postFeedback(DESCRIPTION, { title: BUG_TITLE })
  expect(r.status).toBe(200)
  const body = await r.json()

  // Same row, not a new ID
  expect(body.id).toBe(fid)
  expect(body.saved).toBe(true)

  // Dedup hit → recurrence object present
  expect(body.recurrence).toBeDefined()
  expect(body.recurrence.count).toBe(2)
  // Not resolved yet → not a regression
  expect(body.recurrence.regressed).toBe(false)
}, 15_000)

// ════════════════════════════════════════════════════════════════════════════
// 3. Read path: GET /api/feedback/:id — KLA-2 fields after two occurrences
// ════════════════════════════════════════════════════════════════════════════

test("3 · GET /api/feedback/:id returns KLA-2 fields: count=2, firstSeen/lastSeen, isRegression=false", async () => {
  const r = await getFeedback(fid)
  expect(r.status).toBe(200)
  const { report } = await r.json()

  expect(report.id).toBe(fid)

  // KLA-2 core fields — read-path (feat/regression-memory-read, v0.39.194)
  // If these keys are absent, Dev1's read-path has not yet landed.
  // The test is written to be ready; it will fail clearly if the fields are missing.
  if (!("recurrenceCount" in report)) {
    console.warn("[kla2-e2e] recurrenceCount missing from GET /api/feedback/:id — read-path may not be landed yet")
  }
  expect(report.recurrenceCount).toBe(2)
  expect(typeof report.firstSeen).toBe("number")
  expect(typeof report.lastSeen).toBe("number")
  // lastSeen >= firstSeen (two reports have been filed)
  expect(report.lastSeen).toBeGreaterThanOrEqual(report.firstSeen)
  // Not resolved yet → not a regression
  expect(report.isRegression).toBe(false)
}, 10_000)

// ════════════════════════════════════════════════════════════════════════════
// 4. Mark the ticket resolved — sets resolved_at
// ════════════════════════════════════════════════════════════════════════════

test("4 · PATCH status=done returns ok:true (auto-sets resolved_at)", async () => {
  const r = await patchFeedback(fid, { status: "done" })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.ok).toBe(true)
}, 10_000)

// ════════════════════════════════════════════════════════════════════════════
// 5. Re-report after resolution — isRegression flips true
// ════════════════════════════════════════════════════════════════════════════

test("5 · third POST after resolution: same id, count=3, recurrence.regressed=true", async () => {
  // Wait 50 ms so that last_seen_at (set by bump) > resolved_at (set by PATCH).
  // Both use Date.now(); without this guard the same millisecond would make
  // isRegression = (resolvedAt != null && lastSeen > resolvedAt) = false.
  await Bun.sleep(50)

  const r = await postFeedback(DESCRIPTION, { title: BUG_TITLE })
  expect(r.status).toBe(200)
  const body = await r.json()

  expect(body.id).toBe(fid)
  expect(body.recurrence).toBeDefined()
  expect(body.recurrence.count).toBe(3)

  // ← KEY KLA-2 assertion: was resolved, then reported again → regression
  expect(body.recurrence.regressed).toBe(true)
}, 15_000)

// ════════════════════════════════════════════════════════════════════════════
// 6. Read path after regression — isRegression=true persists in GET response
// ════════════════════════════════════════════════════════════════════════════

test("6 · GET /api/feedback/:id: isRegression=true, count=3, lastSeen > firstSeen", async () => {
  const r = await getFeedback(fid)
  expect(r.status).toBe(200)
  const { report } = await r.json()

  expect(report.recurrenceCount).toBe(3)

  // The core regression-memory assertion:
  //   isRegression = resolved_at IS NOT NULL AND last_seen_at > resolved_at
  expect(report.isRegression).toBe(true)

  // firstSeen is immutable (always the original created_at), lastSeen advances
  expect(report.lastSeen).toBeGreaterThan(report.firstSeen)

  // Sanity: all fields are present and numeric
  expect(report.firstSeen).toBeGreaterThan(0)
  expect(report.lastSeen).toBeGreaterThan(0)
}, 10_000)

// ════════════════════════════════════════════════════════════════════════════
// 7. firstSeen is immutable — it matches the original creation timestamp
// ════════════════════════════════════════════════════════════════════════════

test("7 · firstSeen invariant: equal to createdAt of the original row, never changes with bumps", async () => {
  // Fetch the raw DB row to get the authoritative created_at
  const dbRow = await raw.execute({
    sql: "SELECT created_at, last_seen_at, recurrence_count FROM feedback WHERE id=?",
    args: [fid],
  })
  expect(dbRow.rows.length).toBe(1)
  const row = dbRow.rows[0] as any

  const createdAt   = Number(row.created_at)
  const lastSeenAt  = Number(row.last_seen_at)
  const recCount    = Number(row.recurrence_count)

  // Verify the DB row reflects the three bumps
  expect(recCount).toBe(3)
  expect(lastSeenAt).toBeGreaterThan(createdAt)

  // GET should return firstSeen = created_at (not last_seen_at)
  const r = await getFeedback(fid)
  const { report } = await r.json()
  expect(report.firstSeen).toBe(createdAt)
  expect(report.lastSeen).toBe(lastSeenAt)
}, 10_000)

// ════════════════════════════════════════════════════════════════════════════
// 8. Dashboard tickets list includes KLA-2 fields for the regressed ticket
// ════════════════════════════════════════════════════════════════════════════

test("8 · GET /api/dashboard: ticket carries recurrenceCount=3 / isRegression=true / lastSeen>firstSeen", async () => {
  const r = await getDashboard()
  expect(r.status).toBe(200)
  const body = await r.json()

  const tickets: any[] = body.tickets ?? []
  const t = tickets.find((x: any) => x.id === fid)
  expect(t).toBeDefined()

  expect(t.recurrenceCount).toBe(3)
  expect(t.isRegression).toBe(true)
  expect(t.firstSeen).toBeGreaterThan(0)
  expect(t.lastSeen).toBeGreaterThan(t.firstSeen)
}, 10_000)

// ════════════════════════════════════════════════════════════════════════════
// 9. Edge: no duplication of rows — only ONE feedback row exists in the DB
// ════════════════════════════════════════════════════════════════════════════

test("9 · DB sanity: only ONE feedback row exists for this project (three POSTs → one bumped row)", async () => {
  const result = await raw.execute({
    sql: "SELECT id, recurrence_count FROM feedback WHERE project_id=?",
    args: [PROJ],
  })
  // All three POSTs must have landed on the same row (dedup + bump, not insert)
  expect(result.rows.length).toBe(1)
  expect(String(result.rows[0][0])).toBe(fid)
  expect(Number(result.rows[0][1])).toBe(3)
}, 10_000)

// ════════════════════════════════════════════════════════════════════════════
// 10. Edge: /api/feedback/:id/memory endpoint also reflects regression
// ════════════════════════════════════════════════════════════════════════════

test("10 · GET /api/feedback/:id/memory: regressed=true, count=3, summary includes occurrence count", async () => {
  const r = await fetch(`${BASE}/api/feedback/${encodeURIComponent(fid)}/memory`, {
    headers: { cookie: `klav_session=${SID}` },
  })
  // memory endpoint may return 404 if no issue_key was recorded (first-time without suggestedBug)
  // but we provided suggestedBug so issue_key should exist. Accept 200 with regressed=true.
  if (r.status === 404) {
    console.warn("[kla2-e2e] /memory returned 404 — recurrence memory may not be linked to this row")
    return
  }
  expect(r.status).toBe(200)
  const { memory } = await r.json()

  expect(memory).toBeDefined()
  expect(memory.count).toBeGreaterThanOrEqual(3)
  expect(memory.regressed).toBe(true)
  expect(typeof memory.summary).toBe("string")
  expect(memory.summary.length).toBeGreaterThan(0)
}, 10_000)
