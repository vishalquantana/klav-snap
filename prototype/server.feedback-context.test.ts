// G2/G3/G5: the no-install widget (and any /api/feedback poster) attaches captured dev-tools context
// (console + network + UA/screen/viewport) and custom identity/metadata, and the server persists it
// to feedback.client_context_json. Subprocess-against-temp-DB pattern (mirrors feedback-anon test).

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-fctx-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) { await rawClient.execute({ sql, args }) }

// Minimal schema — the server's initDb migration adds client_context_json on startup.
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

const now = Date.now()
await rawExec(`INSERT INTO accounts (id, name, owner_email, domain, plan, created_at) VALUES ('a1', 'Test', 'owner@test.local', 'test.local', 'free', ?)`, [now])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, observability_mode, modal_config_json, widget_mode, widget_cta_url, widget_notify_email, created_at, updated_at) VALUES ('p1', 'a1', 'Test Project', 'active', 'auto', 'named', '{}', 'support', '', '', ?, ?)`, [now, now])

let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 35000 + Math.floor(Math.random() * 1000)
  BASE = `http://localhost:${serverPort}`
  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(serverPort), TURSO_DATABASE_URL: "file:" + srvDbFile, TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET, KLAV_BASE_URL: BASE, KLAV_ALLOWED_DOMAINS: "test.local",
      KLAV_DEV_SHOW_OTP: "1", SENDGRID_API_KEY: "", KLAV_MAIL_FROM: "", OPENROUTER_API_KEY: "test-key",
    },
    stdout: "pipe", stderr: "pipe",
  })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/favicon.svg`).catch(() => null); if (r && r.status < 500) break } catch {}
    await Bun.sleep(150)
  }
})

afterAll(() => { serverProc?.kill(); rawClient.close() })

test("widget-style submit persists captured context (console + network + env + identity/metadata)", async () => {
  const context = {
    pageUrl: "https://klavity.quantana.top/snap",
    userAgent: "Mozilla/5.0 TestUA", screenSize: "1920x1080", viewportSize: "1280x720",
    consoleErrors: [
      { message: "a log line", timestamp: 1, level: "log" },
      { message: "TypeError: boom", timestamp: 2, level: "error" },
    ],
    networkFailures: [
      { url: "https://api.x/ok?token=SECRET", status: 200, method: "GET", timestamp: 1, durationMs: 12 },
      { url: "https://api.x/bad", status: 500, method: "POST", timestamp: 2, durationMs: 30 },
    ],
    identity: { id: "u_42", email: "user@acme.com" },
    metadata: { plan: "pro", tenant: "acme" },
  }
  const fd = new FormData()
  fd.set("description", "context bug")
  fd.set("page_url", context.pageUrl)
  fd.set("project_id", "p1")
  fd.set("context", JSON.stringify(context))
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd, headers: { origin: BASE } })
  expect(r.status).toBe(200)
  const j = await r.json(); expect(j.saved).toBe(true); expect(j.id).toBeTruthy()

  const row = await rawClient.execute({ sql: "SELECT client_context_json FROM feedback WHERE id=?", args: [j.id] })
  expect(row.rows.length).toBe(1)
  const stored = JSON.parse(String(row.rows[0].client_context_json))
  expect(stored.userAgent).toBe("Mozilla/5.0 TestUA")
  expect(stored.screenSize).toBe("1920x1080")
  expect(stored.viewportSize).toBe("1280x720")
  // all console levels captured
  expect(stored.consoleErrors.map((e: any) => e.level)).toEqual(["log", "error"])
  // all network requests captured (incl. the 200), with timing
  expect(stored.networkFailures.length).toBe(2)
  expect(stored.networkFailures[0].status).toBe(200)
  expect(stored.networkFailures[0].durationMs).toBe(12)
  // identity + metadata surfaced
  expect(stored.identity.id).toBe("u_42")
  expect(stored.metadata.plan).toBe("pro")
})

test("malformed context field does not break the submission", async () => {
  const fd = new FormData()
  fd.set("description", "bad ctx"); fd.set("page_url", "https://klavity.quantana.top/x"); fd.set("project_id", "p1")
  fd.set("context", "{not valid json")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd, headers: { origin: BASE } })
  expect(r.status).toBe(200)
  const j = await r.json(); expect(j.saved).toBe(true)
  const row = await rawClient.execute({ sql: "SELECT client_context_json FROM feedback WHERE id=?", args: [j.id] })
  expect(row.rows[0].client_context_json).toBeNull()
})
