// server.regression-memory-read.test.ts
// Tests the KLA-2 enriched read path: the four recurrence-memory fields
// (recurrenceCount, firstSeen, lastSeen, isRegression) on:
//   - GET /api/feedback/:id    — single report
//   - GET /api/dashboard       — tickets list
//
// Hermetic: real server subprocess + temp SQLite DB. Seeds one
// regressed ticket (seen after resolved) and one fresh single-occurrence
// ticket so we can assert graceful behaviour for both cases.

import { afterAll, beforeAll, expect, test } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { unlinkSync } from "node:fs"

const RUN      = `${Date.now()}-${randomUUID()}`
const DB_FILE  = join(tmpdir(), `klav-regread-${RUN}.db`)
const SECRET   = Buffer.from(new Uint8Array(32).fill(99)).toString("base64")

function rmDb() {
  for (const s of ["", "-wal", "-shm"]) {
    try { unlinkSync(DB_FILE + s) } catch {}
  }
}
rmDb()

const raw = createClient({ url: "file:" + DB_FILE })
await raw.execute("PRAGMA journal_mode=WAL")
await raw.execute("PRAGMA busy_timeout=5000")

async function exec(sql: string, args: any[] = []) {
  await raw.execute({ sql, args })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const OWNER   = `owner-regread-${RUN}@test.local`
const OUTSIDE = `outside-regread-${RUN}@test.local`
const SID     = `sess_regread_owner_${RUN}`
const SID_OUT = `sess_regread_outside_${RUN}`
const ACCT    = `acct_regread_${RUN}`
const PROJ    = `proj_regread_${RUN}`
const NOW     = Date.now()

// Timestamps for the regressed ticket
const FIRST_SEEN  = NOW - 20 * 86_400_000   // 20 days ago
const RESOLVED_AT = NOW - 10 * 86_400_000   // 10 days ago (marked done)
const RESURFACED  = NOW -  3 * 86_400_000   // 3 days ago (came back → regression)

const FB_REGRESSED  = `fb_regrread_regressed_${RUN}`
const FB_FRESH      = `fb_regrread_fresh_${RUN}`
const ISSUE_KEY     = `ik_regread_${RUN}`

// ── Schema + seed ─────────────────────────────────────────────────────────────
await exec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await exec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await exec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT NOT NULL, domain TEXT, created_at INTEGER NOT NULL)`)
await exec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', url_patterns_json TEXT, review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER DEFAULT 200, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await exec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL, invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await exec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await exec(`CREATE TABLE IF NOT EXISTS expectations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dedup_key TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'candidate', source_json TEXT NOT NULL DEFAULT '{}', corroboration_json TEXT NOT NULL DEFAULT '{}', url_path TEXT, issue_type TEXT, cited_trait_ids_json TEXT, enforced_trail_id TEXT, enforced_step_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(project_id, dedup_key))`)
await exec(`CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT,
  observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, suggested_bug_json TEXT,
  cited_trait_ids_json TEXT, source_quote TEXT, source_transcript_id TEXT, source_date INTEGER,
  plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT,
  issue_key TEXT, recurrence_count INTEGER NOT NULL DEFAULT 1, recurrence_dates_json TEXT,
  last_seen_at INTEGER, resolved_at INTEGER, client_context_json TEXT, annotations_json TEXT,
  source_referrer TEXT, updated_at INTEGER, created_at INTEGER NOT NULL
)`)

await exec(`INSERT INTO users VALUES (?, ?, ?)`,  [OWNER,   "Owner",   NOW])
await exec(`INSERT INTO users VALUES (?, ?, ?)`,  [OUTSIDE, "Outside", NOW])
await exec(`INSERT INTO sessions VALUES (?, ?, ?, ?)`, [SID,     OWNER,   NOW, NOW + 86_400_000])
await exec(`INSERT INTO sessions VALUES (?, ?, ?, ?)`, [SID_OUT, OUTSIDE, NOW, NOW + 86_400_000])
await exec(`INSERT INTO accounts VALUES (?, ?, ?, ?, ?)`, [ACCT, "Regrread Acct", OWNER, null, NOW])
await exec(`INSERT INTO account_members VALUES (?, ?, ?, ?, ?)`, [`am_regread_${RUN}`, ACCT, OWNER, "owner", NOW])
await exec(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [PROJ, ACCT, "Regrread Project", "active", null, "auto", 200, "named", NOW, NOW])
await exec(`INSERT INTO project_members VALUES (?, ?, ?, ?, ?, ?)`,
  [`pm_regread_${RUN}`, PROJ, OWNER, "admin", null, NOW])

// Ticket that regressed: resolved at RESOLVED_AT, then resurfaced at RESURFACED
await exec(`INSERT INTO feedback
  (id, project_id, observation, severity, status, issue_key,
   recurrence_count, recurrence_dates_json, last_seen_at, resolved_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
  FB_REGRESSED, PROJ, "Payment button breaks on submit", "high", "done", ISSUE_KEY,
  3, JSON.stringify([FIRST_SEEN, RESOLVED_AT, RESURFACED]), RESURFACED, RESOLVED_AT, FIRST_SEEN,
])

// Fresh single-occurrence ticket — no regression, no recurrence
await exec(`INSERT INTO feedback
  (id, project_id, observation, severity, status,
   recurrence_count, recurrence_dates_json, last_seen_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
  FB_FRESH, PROJ, "Tooltip overlaps button on mobile", "low", "open",
  1, JSON.stringify([NOW]), NOW, NOW,
])

let srv: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  const port = 46200 + Math.floor(Math.random() * 600)
  BASE = `http://localhost:${port}`
  srv = Bun.spawn(["bun", "run", "server.ts"], {
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
})

afterAll(() => { srv?.kill(); raw.close(); rmDb() })

function get(path: string, sid = SID) {
  return fetch(`${BASE}${path}`, { headers: { cookie: `klav_session=${sid}` } })
}

// ── GET /api/feedback/:id — single enriched report ────────────────────────────

test("GET /api/feedback/:id returns recurrenceCount, firstSeen, lastSeen for a regressed ticket", async () => {
  const r = await get(`/api/feedback/${encodeURIComponent(FB_REGRESSED)}`)
  expect(r.status).toBe(200)
  const { report } = await r.json()

  expect(report.id).toBe(FB_REGRESSED)
  expect(report.recurrenceCount).toBe(3)
  expect(report.firstSeen).toBe(FIRST_SEEN)
  expect(report.lastSeen).toBe(RESURFACED)
  expect(report.isRegression).toBe(true)
})

test("GET /api/feedback/:id returns isRegression=false for a fresh single-occurrence ticket", async () => {
  const r = await get(`/api/feedback/${encodeURIComponent(FB_FRESH)}`)
  expect(r.status).toBe(200)
  const { report } = await r.json()

  expect(report.recurrenceCount).toBe(1)
  expect(report.firstSeen).toBe(NOW)
  expect(report.isRegression).toBe(false)
})

test("GET /api/feedback/:id returns 404 for a ticket in another project", async () => {
  // OUTSIDE has no project membership — their session can't see PROJECT's feedback
  const r = await get(`/api/feedback/${encodeURIComponent(FB_REGRESSED)}`, SID_OUT)
  expect(r.status).toBe(404)
})

test("GET /api/feedback/:id redirects unauthenticated GET to login (no data leak)", async () => {
  // The server redirects unauthenticated GET requests to /login (302) so callers
  // can't probe whether a feedback ID exists. Use redirect:"manual" to observe the
  // raw 302 before fetch follows it to the login page.
  const r = await fetch(`${BASE}/api/feedback/${encodeURIComponent(FB_REGRESSED)}`, { redirect: "manual" })
  expect(r.status).toBe(302)
})

// ── GET /api/dashboard — tickets list enrichment ──────────────────────────────

test("GET /api/dashboard includes recurrenceCount/firstSeen/lastSeen/isRegression on each ticket", async () => {
  const r = await get(`/api/dashboard?project=${encodeURIComponent(PROJ)}`)
  expect(r.status).toBe(200)
  const body = await r.json()

  const tickets: any[] = body.tickets ?? []
  expect(tickets.length).toBeGreaterThan(0)

  const regressed = tickets.find((t: any) => t.id === FB_REGRESSED)
  expect(regressed).toBeDefined()
  expect(regressed.recurrenceCount).toBe(3)
  expect(regressed.firstSeen).toBe(FIRST_SEEN)
  expect(regressed.lastSeen).toBe(RESURFACED)
  expect(regressed.isRegression).toBe(true)

  const fresh = tickets.find((t: any) => t.id === FB_FRESH)
  expect(fresh).toBeDefined()
  expect(fresh.recurrenceCount).toBe(1)
  expect(fresh.isRegression).toBe(false)
})

test("GET /api/dashboard: regressed ticket has lastSeen > firstSeen", async () => {
  const r = await get(`/api/dashboard?project=${encodeURIComponent(PROJ)}`)
  const { tickets } = await r.json()
  const t = tickets.find((x: any) => x.id === FB_REGRESSED)
  expect(t.lastSeen).toBeGreaterThan(t.firstSeen)
})
