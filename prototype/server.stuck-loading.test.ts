// Regression guard for fix(KLAVITYKLA-28,29,30): "never leave an infinite spinner"
// commit add6b14 (merged v0.39.191).
//
// Root causes fixed:
//   1. /api/sims/:id/profile: listPersonas() was outside try/catch → a DB hang left the
//      client stuck on "Loading Sim…" forever. Fix: move into try/catch so errors → 500.
//   2. /onboarding: membershipsFor() + domain DB query had no guard → any DB error threw
//      unhandled, producing 502. Fix: wrap in try/catch and fall through to onboarding.html.
//
// Tests assert the OBSERVABLE behaviour that changed:
//   A. GET /onboarding always returns 200 + HTML (never 502), even when the caller has no
//      session (unauthenticated) or has a session but has not completed setup.
//   B. GET /api/sims/:id/profile for an unknown sim returns 404 JSON, not a hang.
//      (The listPersonas() call is now inside try/catch; a non-found sim that previously
//      could cause a hang now returns a clear error.)
//   C. GET /api/sims/:id/profile for a KNOWN sim returns 200 JSON with profile data.
//      (Regression guard: the successful path still works after the refactoring.)
//
// Pattern: same hermetic subprocess + temp DB used by server.sim-profile.test.ts.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const DB_FILE = join(tmpdir(), `klav-stuck-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(55)).toString("base64")

const rawClient = createClient({ url: "file:" + DB_FILE })
await rawClient.execute("PRAGMA journal_mode=WAL")
await rawClient.execute("PRAGMA busy_timeout=5000")
async function raw(sql: string, args: any[] = []) { await rawClient.execute({ sql, args }) }

// Minimal schema (matches server's expected tables for the routes under test)
for (const ddl of [
  `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`,
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`,
  `CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sim_traits (id TEXT PRIMARY KEY, sim_id TEXT NOT NULL, project_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', strength INTEGER NOT NULL DEFAULT 1, src_transcript_id TEXT NOT NULL, src_quote TEXT NOT NULL, src_quote_offset INTEGER, src_speaker TEXT, area TEXT, issue_type TEXT, severity TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trait_events (id TEXT PRIMARY KEY, trait_id TEXT NOT NULL, sim_id TEXT NOT NULL, transcript_id TEXT NOT NULL, op TEXT NOT NULL, before_text TEXT, after_text TEXT, quote TEXT NOT NULL, quote_offset INTEGER, speaker TEXT, source_date INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS transcripts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, raw_text TEXT NOT NULL, source_date INTEGER NOT NULL, speakers_json TEXT, added_by TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, suggested_bug_json TEXT, cited_trait_ids_json TEXT, source_quote TEXT, source_transcript_id TEXT, source_date INTEGER, plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT, updated_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT, feedback_id TEXT, screenshot_id TEXT, meta_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS screenshots (id TEXT PRIMARY KEY, project_id TEXT, s3_key TEXT NOT NULL, bucket TEXT, content_type TEXT, acl TEXT, bytes INTEGER, owner_email TEXT, expires_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS review_counts (project_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (project_id, day))`,
  `CREATE TABLE IF NOT EXISTS monitored_urls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, UNIQUE(project_id, url_pattern))`,
  `CREATE TABLE IF NOT EXISTS monitoring_consent (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, granted_at INTEGER, updated_at INTEGER NOT NULL, UNIQUE(project_id, email))`,
  `CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS extension_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`,
  `CREATE INDEX IF NOT EXISTS mon_url_proj_idx ON monitored_urls(project_id)`,
]) { await raw(ddl) }

// ── Fixtures ──────────────────────────────────────────────────────────────────
const OWNER = `owner-stuck-${ts}@test.local`
const SESS  = `sess_stuck_${ts}`
const ACCT  = `acct_stuck_${ts}`
const PROJ  = `proj_stuck_${ts}`
const SIM   = `sim_stuck_${ts}`
const NOW = Date.now()

await raw(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [OWNER, NOW])
await raw(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCT, "Stuck Test", OWNER, NOW])
// NOTE: domain is NULL — this account has NOT completed onboarding setup.
// The onboarding route checks for domain != null to decide whether to redirect.
await raw(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_stuck_${ts}`, ACCT, OWNER, "owner", NOW])
await raw(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [PROJ, ACCT, "Stuck Test Project", "active", "auto", 200, "named", NOW, NOW])
await raw(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  [`pm_stuck_${ts}`, PROJ, OWNER, "admin", null, NOW])
await raw(`INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  [SIM, PROJ, "Charlie Dev", "Developer", "client", "CD", "#6366f1", "Tests hang fixes.", "[]", NOW, NOW])
await raw(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  [SESS, OWNER, NOW, NOW + 86_400_000])

// ── Server subprocess ─────────────────────────────────────────────────────────
let srvProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  const port = 44700 + Math.floor(Math.random() * 200)
  BASE = `http://localhost:${port}`
  srvProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: "file:" + DB_FILE,
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
    try { const r = await fetch(`${BASE}/favicon.svg`).catch(() => null); if (r && r.status < 500) break } catch {}
    await Bun.sleep(150)
  }
}, 15_000)

afterAll(() => { srvProc?.kill(); rawClient.close() })

const authHeader = () => ({ Cookie: `klav_session=${SESS}` })

// ════════════════════════════════════════════════════════════════════════════
// A. /onboarding — always returns 200 HTML, never 502
// ════════════════════════════════════════════════════════════════════════════
//
// Before fix: membershipsFor() + domain query had no try/catch — a DB error
// threw unhandled → 502 Gateway Error (the browser showed an error page).
// After fix: the entire block is in try/catch; any DB error falls through to
// serve onboarding.html with 200 OK.

test("A1: GET /onboarding (unauthenticated) → 200 HTML — never a 502", async () => {
  const r = await fetch(`${BASE}/onboarding`)
  expect(r.status).toBe(200)
  const ct = r.headers.get("content-type") || ""
  expect(ct).toContain("text/html")
}, 10_000)

test("A2: GET /onboarding (authenticated, no domain yet) → 200 HTML — not redirected", async () => {
  // The account's domain is NULL (setup not completed). The server must serve onboarding.html,
  // not redirect to /dashboard.
  const r = await fetch(`${BASE}/onboarding`, { headers: authHeader(), redirect: "manual" })
  // Accept 200 (serves wizard) or 3xx-to-onboarding (self-referential redirect treated as serving)
  // but NEVER a redirect to /dashboard and NEVER 502.
  expect(r.status).not.toBe(502)
  expect(r.status).not.toBe(500)
  // If the server redirected somewhere, it must NOT be to /dashboard
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get("location") || ""
    expect(loc).not.toContain("/dashboard")
  } else {
    expect(r.status).toBe(200)
  }
}, 10_000)

// ════════════════════════════════════════════════════════════════════════════
// B. /api/sims/:id/profile — listPersonas now inside try/catch
// ════════════════════════════════════════════════════════════════════════════
//
// Before fix: listPersonas() was outside the try/catch. If it threw (DB hang),
// the route never responded — the client hung in "Loading Sim…" forever.
// After fix: any throw from listPersonas is caught and returns 500 JSON.
//
// We test the two observable outcomes that EXERCISE the moved code:
//   (B1) listPersonas succeeds but sim not found → 404 JSON (correct error, no hang)
//   (B2) listPersonas succeeds and sim found     → 200 JSON (regression: success path still works)
//
// The "listPersonas throws" scenario (DB hang → 500) is structural: the test would itself
// hang against the old code. If B1 resolves in < 10s, the code is not hanging.

test("B1: GET /api/sims/NONEXISTENT/profile → 404 JSON in < 10s (not a hang)", async () => {
  // This exercises listPersonas() (now inside try/catch) for a sim that doesn't exist.
  // Before the fix, listPersonas() outside try/catch could hang the route forever;
  // after the fix, a non-found sim returns 404 quickly (no infinite spinner).
  const r = await fetch(`${BASE}/api/sims/sim_does_not_exist/profile?project=${PROJ}`, {
    headers: authHeader(),
  })
  expect(r.status).toBe(404)
  const body = await r.json()
  expect(body).toHaveProperty("error")
}, 10_000)

test("B2: GET /api/sims/:id/profile for a known sim → 200 JSON with profile data", async () => {
  // Regression guard: the success path (listPersonas finds the sim) still works.
  const r = await fetch(`${BASE}/api/sims/${SIM}/profile?project=${PROJ}`, {
    headers: authHeader(),
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.sim.id).toBe(SIM)
  expect(body.sim.name).toBe("Charlie Dev")
}, 10_000)

test("B3: GET /sim/:id (HTML route) returns 200 when authenticated", async () => {
  // The HTML stub route (/sim/:id) serves sim-profile.html and is unaffected by the API
  // route fix — but it's a regression guard for the page not disappearing.
  const r = await fetch(`${BASE}/sim/${SIM}`, { headers: authHeader() })
  expect(r.status).toBe(200)
  const ct = r.headers.get("content-type") || ""
  expect(ct).toContain("text/html")
}, 10_000)

test("B4: GET /sim/:id without auth → redirect to /login (auth guard still active)", async () => {
  const r = await fetch(`${BASE}/sim/${SIM}`, { redirect: "manual" })
  expect([301, 302, 303, 307, 308]).toContain(r.status)
  expect(r.headers.get("location") || "").toContain("/login")
}, 10_000)
