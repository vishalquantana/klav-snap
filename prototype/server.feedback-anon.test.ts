// Task 3: First-party anonymous intake on POST /api/feedback.
// Subprocess-against-temp-DB pattern: raw-seed a temp SQLite DB, spawn the real server,
// hit it over HTTP, kill in afterAll. Mirrors server.feedback-widget.test.ts.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-fanon-${ts}.db`)

// 32-byte AES-GCM key for this test run (all-42 bytes, matches connectors test pattern)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

// Seed via raw client — never import shared db module (avoids module-singleton contamination).
const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// Minimal schema — only the tables the /api/feedback handler touches.
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, plan TEXT NOT NULL DEFAULT 'free', created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', modal_config_json TEXT DEFAULT '{}', widget_mode TEXT NOT NULL DEFAULT 'support', widget_cta_url TEXT, widget_notify_email TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, suggested_bug_json TEXT, cited_trait_ids_json TEXT, source_quote TEXT, source_transcript_id TEXT, source_date INTEGER, plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT, contact_email TEXT, updated_at INTEGER, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS ticket_exports (id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL, project_id TEXT NOT NULL, connector_id TEXT NOT NULL, type TEXT NOT NULL, external_key TEXT, external_url TEXT, status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT, feedback_id TEXT, screenshot_id TEXT, meta_json TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sim_traits (id TEXT PRIMARY KEY, sim_id TEXT NOT NULL, project_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', strength INTEGER NOT NULL DEFAULT 1, src_transcript_id TEXT NOT NULL, src_quote TEXT NOT NULL, src_quote_offset INTEGER, src_speaker TEXT, area TEXT, issue_type TEXT, severity TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_texports_feedback ON ticket_exports(feedback_id)`)

// Seed project p1 (account a1)
const now = Date.now()
await rawExec(
  `INSERT INTO accounts (id, name, owner_email, domain, plan, created_at) VALUES ('a1', 'Test Account', 'owner@test.local', 'test.local', 'free', ?)`,
  [now]
)
await rawExec(
  `INSERT INTO projects (id, account_id, name, status, review_mode, observability_mode, modal_config_json, widget_mode, widget_cta_url, widget_notify_email, created_at, updated_at) VALUES ('p1', 'a1', 'Test Project', 'active', 'auto', 'named', '{}', 'leadgen', 'https://klavity.quantana.top/onboarding', 'lead@x.com', ?, ?)`,
  [now, now]
)

// ── Spawn the server on a random port ─────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 34000 + Math.floor(Math.random() * 1000)
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
      // No KLAV_TEST_ALLOW_LOOPBACK — link-local must stay blocked by assertSafeUrl.
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  // Wait until server is ready (max 10s), polling /favicon.svg.
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
      if (r && r.status < 500) break
    } catch { /* not ready yet */ }
    await Bun.sleep(150)
  }
})

afterAll(() => {
  serverProc?.kill()
  rawClient.close()
})

// ── Test 1: anonymous first-party submit persists with null actor ─────────────
test("anonymous first-party submit persists with null actor", async () => {
  const fd = new FormData()
  fd.set("description", "anon bug"); fd.set("page_url", "https://klavity.quantana.top/snap"); fd.set("project_id", "p1")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd, headers: { origin: BASE } })
  expect(r.status).toBe(200)
  const j = await r.json(); expect(j.saved).toBe(true); expect(j.id).toBeTruthy()
  // row persisted to p1 with null actor
  const row = await rawClient.execute({ sql: "SELECT project_id, actor_email FROM feedback WHERE id=?", args: [j.id] })
  expect(row.rows[0].project_id).toBe("p1")
  expect(row.rows[0].actor_email).toBeNull()
})

// ── Test 2: cross-origin anonymous is GATED by the project's report gate ──────
// p1's gate defaults to 'email', so a foreign-origin report WITHOUT an email is rejected (400),
// but WITH a valid email it's accepted and persisted (end-user files without a Klavity account).
test("cross-origin anonymous without the required email is rejected (400)", async () => {
  const fd = new FormData()
  fd.set("description", "x"); fd.set("project_id", "p1")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd, headers: { origin: "https://evil.example" } })
  expect(r.status).toBe(400)
})

test("cross-origin anonymous WITH a valid email is accepted + stores the contact", async () => {
  const fd = new FormData()
  fd.set("description", "foreign bug"); fd.set("project_id", "p1"); fd.set("reporter_email", "reporter@test.local")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd, headers: { origin: "https://customer.example" } })
  expect(r.status).toBe(200)
  const j = await r.json(); expect(j.saved).toBe(true); expect(j.id).toBeTruthy()
  const row = await rawClient.execute({ sql: "SELECT project_id, actor_email, contact_email FROM feedback WHERE id=?", args: [j.id] })
  expect(row.rows[0].project_id).toBe("p1")
  expect(row.rows[0].actor_email).toBeNull()
  expect(row.rows[0].contact_email).toBe("reporter@test.local")
})

// ── Happy path: the exact shape the widget submits (text + email + page_url + referrer) → 200 ──
// Regression guard for the P1 400: an email-gated widget submit must succeed end-to-end and create
// the report with the reporter captured as the contact.
test("happy path: widget submit (description + reporter_email + page_url + referrer) returns 200 and creates the report", async () => {
  const fd = new FormData()
  fd.set("description", "[bug] the Pay button does nothing on first click")
  fd.set("project_id", "p1")
  fd.set("reporter_email", "shopper@test.local")
  fd.set("page_url", "https://customer.example/checkout")
  fd.set("referrer", "https://www.google.com/")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd, headers: { origin: "https://customer.example" } })
  expect(r.status).toBe(200)
  const j = await r.json()
  expect(j.saved).toBe(true)
  expect(j.id).toBeTruthy()
  const row = await rawClient.execute({ sql: "SELECT observation, contact_email, url_host FROM feedback WHERE id=?", args: [j.id] })
  expect(row.rows[0].contact_email).toBe("shopper@test.local")
  expect(row.rows[0].url_host).toBe("customer.example")
  expect(String(row.rows[0].observation)).toContain("Pay button")
})

// ── Test 3: over the per-IP cap → 429 ────────────────────────────────────────
test("over the per-IP cap → 429", async () => {
  const hammer = async () => { const fd = new FormData(); fd.set("description","x"); fd.set("project_id","p1"); return fetch(`${BASE}/api/feedback`, { method:"POST", body: fd, headers: { origin: BASE } }) }
  let got429 = false
  // Test 1 above already consumed 1 slot; fire 25 more to ensure we hit the cap of 20.
  for (let i = 0; i < 25; i++) { const r = await hammer(); if (r.status === 429) { got429 = true; break } }
  expect(got429).toBe(true)
})

// ── Test 4: no-Origin anonymous does NOT persist (deferred surface stays closed) ──
test("no-Origin anonymous with a valid project_id does NOT persist (deferred surface stays closed)", async () => {
  const before = await rawClient.execute({ sql: "SELECT COUNT(*) c FROM feedback WHERE project_id=?", args: ["p1"] })
  const fd = new FormData(); fd.set("description", "no-origin probe"); fd.set("project_id", "p1")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd }) // NO origin header
  expect(r.status).toBe(200) // still 200 (legacy behavior), but no new row
  const after = await rawClient.execute({ sql: "SELECT COUNT(*) c FROM feedback WHERE project_id=?", args: ["p1"] })
  expect(Number(after.rows[0].c)).toBe(Number(before.rows[0].c))
})
