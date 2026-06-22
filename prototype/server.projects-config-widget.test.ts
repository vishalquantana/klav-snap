// Task: Unified per-project config endpoint — appearance + widget mode/cta/notify.
// Spins a real server subprocess against a fresh temp DB and hits it with HTTP.
// Mirrors the hermetic pattern used in server.connectors.test.ts.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Dedicated temp DB for the subprocess ─────────────────────────────────────
const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-cfg-widget-${ts}.db`)

// 32-byte AES-GCM key for this test run (all-42 bytes)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

// ── Seed the DB via a raw client (NOT the shared db module) ──────────────────
const rawClient = createClient({ url: "file:" + srvDbFile })

async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// Minimal schema for the tables we need (mirrors applySchema from db.ts).
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, plan TEXT NOT NULL DEFAULT 'free', created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
// projects table includes modal_config_json and widget columns
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', modal_config_json TEXT DEFAULT '{}', widget_mode TEXT NOT NULL DEFAULT 'support', widget_cta_url TEXT, widget_notify_email TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, suggested_bug_json TEXT, cited_trait_ids_json TEXT, source_quote TEXT, source_transcript_id TEXT, source_date INTEGER, plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT, updated_at INTEGER, contact_email TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS ticket_exports (id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL, project_id TEXT NOT NULL, connector_id TEXT NOT NULL, type TEXT NOT NULL, external_key TEXT, external_url TEXT, status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT, feedback_id TEXT, screenshot_id TEXT, meta_json TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS monitored_urls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, UNIQUE(project_id, url_pattern))`)
await rawExec(`CREATE TABLE IF NOT EXISTS monitoring_consent (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, granted_at INTEGER, updated_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS extension_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS mon_url_proj_idx ON monitored_urls(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS ext_tok_email_idx ON extension_tokens(email)`)

// ── Seed fixtures ─────────────────────────────────────────────────────────────
const ADMIN_EMAIL = `admin-cfg-${ts}@test.local`
const MEMBER_EMAIL = `member-cfg-${ts}@test.local`
const ADMIN_SID = `sess_cfg_admin_${ts}`
const MEMBER_SID = `sess_cfg_member_${ts}`

const ACCOUNT_ID = `acct_cfg_${ts}`
// Project with widget_mode='leadgen' pre-seeded to test the public GET
const PROJECT_LEADGEN_ID = `proj_lg_${ts}`
// Project with default widget_mode='support' for the save test
const PROJECT_DEFAULT_ID = `proj_def_${ts}`
const NOW = Date.now()

// Account + admin user
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, plan, created_at) VALUES (?, ?, ?, ?, ?)`, [ACCOUNT_ID, "Config Test Workspace", ADMIN_EMAIL, "free", NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_cfg_${ts}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])

// Project with leadgen mode pre-set + a modal_config_json
await rawExec(
  `INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, modal_config_json, widget_mode, widget_cta_url, widget_notify_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [PROJECT_LEADGEN_ID, ACCOUNT_ID, "Leadgen Project", "active", "auto", 200, "named", '{"theme":"dark"}', "leadgen", "https://example.com/cta", "lead@secret.com", NOW, NOW]
)
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_lg_${ts}`, PROJECT_LEADGEN_ID, ADMIN_EMAIL, "admin", null, NOW])

// Project with default widget settings for the POST test
await rawExec(
  `INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, modal_config_json, widget_mode, widget_cta_url, widget_notify_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [PROJECT_DEFAULT_ID, ACCOUNT_ID, "Default Project", "active", "auto", 200, "named", '{}', "support", null, null, NOW, NOW]
)
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_def_${ts}`, PROJECT_DEFAULT_ID, ADMIN_EMAIL, "admin", null, NOW])

// Member user (non-admin on the default project)
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [MEMBER_EMAIL, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_mem_${ts}`, PROJECT_DEFAULT_ID, MEMBER_EMAIL, "member", ADMIN_EMAIL, NOW])

// Sessions
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [MEMBER_SID, MEMBER_EMAIL, NOW, NOW + 86400_000])

// ── Spawn the server on a random port ─────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 40000 + Math.floor(Math.random() * 1000)
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

  // Wait until the server is ready (max 10s)
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function authCookie(sid: string) { return `klav_session=${sid}` }

async function apiGet(path: string, sid?: string) {
  return fetch(`${BASE}${path}`, {
    headers: sid ? { Cookie: authCookie(sid) } : {},
  })
}

async function apiPost(path: string, body: any, sid?: string) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sid ? { Cookie: authCookie(sid) } : {}),
    },
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("public GET /api/projects/:id/config returns widget.mode=leadgen for leadgen project", async () => {
  const r = await apiGet(`/api/projects/${PROJECT_LEADGEN_ID}/config`)
  expect(r.status).toBe(200)
  const body = await r.json() as any
  // Must include modalConfig
  expect(body).toHaveProperty("modalConfig")
  expect(body.modalConfig.theme).toBe("dark")
  // Must include widget with mode=leadgen and ctaUrl
  expect(body).toHaveProperty("widget")
  expect(body.widget.mode).toBe("leadgen")
  expect(body.widget.ctaUrl).toBe("https://example.com/cta")
  // notifyEmail must NOT be present anywhere in the public response
  const raw = JSON.stringify(body)
  expect(raw).not.toContain("lead@secret.com")
  expect(raw).not.toContain("notifyEmail")
  expect(raw).not.toContain("notify_email")
})

test("public GET /api/projects/:id/config falls back to mode=support for default project", async () => {
  const r = await apiGet(`/api/projects/${PROJECT_DEFAULT_ID}/config`)
  expect(r.status).toBe(200)
  const body = await r.json() as any
  expect(body.widget.mode).toBe("support")
  expect(body.widget.ctaUrl).toBe("https://klavity.quantana.top/onboarding")
})

test("admin POST /api/projects/:id/config saves appearance AND widget fields together", async () => {
  const r = await apiPost(`/api/projects/${PROJECT_DEFAULT_ID}/config`, {
    theme: "dark",
    mode: "leadgen",
    cta_url: "https://myapp.com/signup",
    notify_email: "lead@x.com",
  }, ADMIN_SID)
  expect(r.status).toBe(200)
  const body = await r.json() as any
  expect(body.ok).toBe(true)
  // appearance must be reflected in response
  expect(body.modalConfig.theme).toBe("dark")

  // Verify DB has both modal_config_json AND widget columns updated
  const dbCheck = await rawClient.execute({
    sql: "SELECT modal_config_json, widget_mode, widget_cta_url, widget_notify_email FROM projects WHERE id=?",
    args: [PROJECT_DEFAULT_ID],
  })
  const row = dbCheck.rows[0] as any
  // modal_config_json must carry the theme
  const mc = JSON.parse(String(row.modal_config_json || "{}"))
  expect(mc.theme).toBe("dark")
  // widget columns must be updated
  expect(String(row.widget_mode)).toBe("leadgen")
  expect(String(row.widget_cta_url)).toBe("https://myapp.com/signup")
  expect(String(row.widget_notify_email)).toBe("lead@x.com")
})

test("admin GET /api/projects/:id/config?admin=1 returns widget config (no notifyEmail)", async () => {
  const r = await apiGet(`/api/projects/${PROJECT_DEFAULT_ID}/config?admin=1`, ADMIN_SID)
  expect(r.status).toBe(200)
  const body = await r.json() as any
  expect(body).toHaveProperty("modalConfig")
  expect(body).toHaveProperty("pro")
  // widget included for admin GET
  expect(body).toHaveProperty("widget")
  expect(body.widget.mode).toBe("leadgen")
  // notifyEmail still not leaked in admin GET (getWidgetConfig excludes it)
  const raw = JSON.stringify(body)
  expect(raw).not.toContain("notifyEmail")
  expect(raw).not.toContain("notify_email")
})

test("non-admin member POST /api/projects/:id/config → 403", async () => {
  const r = await apiPost(`/api/projects/${PROJECT_DEFAULT_ID}/config`, {
    theme: "light",
    mode: "support",
  }, MEMBER_SID)
  expect(r.status).toBe(403)
})

test("unauthenticated POST /api/projects/:id/config → 401", async () => {
  const r = await apiPost(`/api/projects/${PROJECT_DEFAULT_ID}/config`, {
    theme: "light",
  })
  // No session → 401 (json gate) because config sub-route is below the session gate
  expect([401, 403]).toContain(r.status)
})

test("POST /api/projects/:id/config with invalid theme → 400 and widget not partially saved", async () => {
  // Read current widget_mode before the bad POST
  const before = await rawClient.execute({
    sql: "SELECT widget_mode FROM projects WHERE id=?",
    args: [PROJECT_DEFAULT_ID],
  })
  const modeBefore = String((before.rows[0] as any).widget_mode)

  const r = await apiPost(`/api/projects/${PROJECT_DEFAULT_ID}/config`, {
    theme: "invalid-theme",
    mode: "leadgen",
    notify_email: "shouldnotbesaved@x.com",
  }, ADMIN_SID)
  expect(r.status).toBe(400)

  // widget_mode must NOT have changed (appearance failed → widget not half-saved)
  const after = await rawClient.execute({
    sql: "SELECT widget_mode, widget_notify_email FROM projects WHERE id=?",
    args: [PROJECT_DEFAULT_ID],
  })
  const row = after.rows[0] as any
  expect(String(row.widget_mode)).toBe(modeBefore)
  expect(row.widget_notify_email).not.toBe("shouldnotbesaved@x.com")
})
