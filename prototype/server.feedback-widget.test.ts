// Task 2: CORS on /api/feedback + non-fatal Plane host.
// Subprocess-against-temp-DB pattern: raw-seed a temp SQLite DB, spawn the real server,
// hit it over HTTP, kill in afterAll. Mirrors server.connectors.test.ts.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-fw-${ts}.db`)

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
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, suggested_bug_json TEXT, cited_trait_ids_json TEXT, source_quote TEXT, source_transcript_id TEXT, source_date INTEGER, plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT, updated_at INTEGER, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS ticket_exports (id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL, project_id TEXT NOT NULL, connector_id TEXT NOT NULL, type TEXT NOT NULL, external_key TEXT, external_url TEXT, status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT, feedback_id TEXT, screenshot_id TEXT, meta_json TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sim_traits (id TEXT PRIMARY KEY, sim_id TEXT NOT NULL, project_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', strength INTEGER NOT NULL DEFAULT 1, src_transcript_id TEXT NOT NULL, src_quote TEXT NOT NULL, src_quote_offset INTEGER, src_speaker TEXT, area TEXT, issue_type TEXT, severity TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_texports_feedback ON ticket_exports(feedback_id)`)

// ── Spawn the server on a random port ─────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 37000 + Math.floor(Math.random() * 1000)
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

// ── Test 1: OPTIONS preflight returns CORS headers ────────────────────────────
test("OPTIONS /api/feedback returns CORS preflight headers", async () => {
  const r = await fetch(`${BASE}/api/feedback`, { method: "OPTIONS" })
  expect(r.status).toBeLessThan(400)
  expect(r.headers.get("access-control-allow-origin")).toBe("*")
  expect((r.headers.get("access-control-allow-methods") || "").toUpperCase()).toContain("POST")
})

// ── Test 2: POST with link-local plane_host → 200 saved:true (non-fatal tracker) ──
// The SSRF guard (assertSafeUrl) must still run and reject the unsafe host, but the
// submission must succeed because feedback was already persisted (or skipped, if
// unauthenticated). No outbound fetch to 169.254.x must occur.
test("POST /api/feedback with a link-local plane_host still saves (non-fatal tracker)", async () => {
  const fd = new FormData()
  fd.set("description", "regression: link-local plane host must not 400")
  fd.set("page_url", "https://klavity.quantana.top/dashboard")
  fd.set("plane_host", "http://169.254.169.254")
  fd.set("plane_workspace", "w")
  fd.set("plane_project_id", "p")
  fd.set("plane_token", "t")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd })
  expect(r.status).toBe(200)
  const j = await r.json()
  expect(j.saved).toBe(true)
  // No Plane issue URL should be returned — the unsafe host was never fetched.
  expect(j.issue_url).toBeUndefined()
  expect(j.issueUrl).toBeUndefined()
})

// ── Test 3: POST success response carries CORS headers ────────────────────────
// A no-creds submission (no plane_token) should return 200 with CORS headers readable
// cross-origin (access-control-allow-origin: *).
test("POST /api/feedback success response carries CORS headers", async () => {
  const fd = new FormData()
  fd.set("description", "test CORS on success path")
  fd.set("page_url", "https://example.com/page")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd })
  expect(r.status).toBe(200)
  expect(r.headers.get("access-control-allow-origin")).toBe("*")
  const j = await r.json()
  expect(j.saved).toBe(true)
})
