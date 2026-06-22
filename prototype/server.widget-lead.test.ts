// Task 4: POST /api/widget/lead — attaches contact_email + fire-and-forget email alert.
// Subprocess-against-temp-DB pattern: raw-seed a temp SQLite DB, spawn the real server,
// hit it over HTTP, kill in afterAll. Mirrors server.projects-config-widget.test.ts.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-wl-${ts}.db`)

// 32-byte AES-GCM key for this test run (all-42 bytes, matches other test pattern)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

// Seed via raw client — never import shared db module (avoids module-singleton contamination).
const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// Minimal schema — projects needs widget columns (+ modal_config_json); feedback needs contact_email.
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

// Seed project p1 with widget_notify_email and a feedback row fb1 in p1.
const now = Date.now()
await rawExec(
  `INSERT INTO accounts (id, name, owner_email, plan, created_at) VALUES ('a1', 'Test Account', 'test@test.com', 'free', ?)`,
  [now]
)
await rawExec(
  `INSERT INTO projects (id, account_id, name, status, review_mode, observability_mode, modal_config_json, widget_mode, widget_notify_email, created_at, updated_at) VALUES ('p1', 'a1', 'Test Project', 'active', 'auto', 'named', '{}', 'leadgen', 'lead@x.com', ?, ?)`,
  [now, now]
)
await rawExec(
  `INSERT INTO feedback (id, project_id, observation, url_host, url_path, created_at) VALUES ('fb1', 'p1', 'Button is broken', 'example.com', '/dashboard', ?)`,
  [now]
)

// ── Spawn the server on a random port ─────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 46000 + Math.floor(Math.random() * 1000)
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
      // Deliberately no SENDGRID_API_KEY — sendLeadAlert will throw internally,
      // but the fire-and-forget wrapper swallows it → endpoint still returns 200.
      KLAV_MAIL_FROM: "",
      OPENROUTER_API_KEY: "test-key",
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

test("attaches contact_email and returns ok", async () => {
  const r = await fetch(`${BASE}/api/widget/lead`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ project_id: "p1", feedback_id: "fb1", email: "buyer@co.com" }),
  })
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)
  const row = await rawClient.execute({ sql: "SELECT contact_email FROM feedback WHERE id=?", args: ["fb1"] })
  expect(row.rows[0].contact_email).toBe("buyer@co.com")
})

test("rejects bad email", async () => {
  const r = await fetch(`${BASE}/api/widget/lead`, { method:"POST", headers:{ "content-type":"application/json", origin: BASE }, body: JSON.stringify({ project_id:"p1", feedback_id:"fb1", email:"nope" }) })
  expect(r.status).toBe(400)
})

test("rejects feedback from another project", async () => {
  const r = await fetch(`${BASE}/api/widget/lead`, { method:"POST", headers:{ "content-type":"application/json", origin: BASE }, body: JSON.stringify({ project_id:"other", feedback_id:"fb1", email:"a@b.com" }) })
  expect(r.status).toBe(404)
})

test("cross-origin lead is accepted (project-scoped, not first-party only)", async () => {
  // The widget runs on the customer's own site, so a lead must attach from any origin. Abuse is
  // bounded by the per-IP rate limit and the (project_id, feedback_id) pair — only a real row updates.
  const r = await fetch(`${BASE}/api/widget/lead`, { method:"POST", headers:{ "content-type":"application/json", origin:"https://customer.example" }, body: JSON.stringify({ project_id:"p1", feedback_id:"fb1", email:"a@b.com" }) })
  expect(r.status).toBe(200)
})
