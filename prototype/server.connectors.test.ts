// Task 3: Server routes + auto-copy hook + dashboard enrichment.
// Spin a real server subprocess against a fresh temp DB and hit it with HTTP.
// Mirrors the hermetic pattern used in db.connectors.test.ts — fresh file DB, unique ids.
//
// Isolation note: we use a dedicated temp DB file for the subprocess only (srvDbFile), and
// we seed it via `createClient` directly (not via the shared `db` singleton) so that when the
// server subprocess seeds DEFAULT_WEIGHTS into srvDbFile, it does NOT contaminate the shared
// db module singleton that other test files (e.g. model-weights.test.ts) also import.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Set up a dedicated temp DB for the subprocess ────────────────────────────
// This file does NOT import ./lib/db to avoid polluting the shared module singleton.
// All seeding is done via a raw createClient so the singleton is never touched here.

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-srv-${ts}.db`)

// 32-byte AES-GCM key for this test run (all-42 bytes)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

// ── Seed the DB via a raw client (NOT the shared db module) ──────────────────
const rawClient = createClient({ url: "file:" + srvDbFile })

// We need to import applySchema/migrateV2 but via a FRESH module path so Bun doesn't cache it
// as the shared db singleton. We achieve this by importing db.ts with a cache-bust query param.
// Actually: simpler — just seed the DB using raw SQL matching the schema exactly.
// This avoids any module sharing issues.

async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// Minimal schema for the tables we need (mirrors applySchema from db.ts).
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT, updated_at INTEGER, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS ticket_exports (id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL, project_id TEXT NOT NULL, connector_id TEXT NOT NULL, type TEXT NOT NULL, external_key TEXT, external_url TEXT, status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT, feedback_id TEXT, screenshot_id TEXT, meta TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
// Also need model_weights in schema_meta for the server to work without errors
await rawExec(`CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_texports_feedback ON ticket_exports(feedback_id)`)

// ── Seed fixtures ────────────────────────────────────────────────────────────
const ADMIN_EMAIL = `admin-${ts}@test.local`
const MEMBER_EMAIL = `member-${ts}@test.local`
const ADMIN_SID = `sess_admin_${ts}`
const MEMBER_SID = `sess_member_${ts}`

const ACCOUNT_ID = `acct_${ts}`
const PROJECT_ID = `proj_${ACCOUNT_ID}`
const NOW = Date.now()

// Account + admin user
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Test Workspace", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_${ACCOUNT_ID}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Default Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_admin_${ts}`, PROJECT_ID, ADMIN_EMAIL, "admin", null, NOW])

// Member user (non-admin)
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [MEMBER_EMAIL, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_member_${ts}`, PROJECT_ID, MEMBER_EMAIL, "member", ADMIN_EMAIL, NOW])

// Sessions
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [MEMBER_SID, MEMBER_EMAIL, NOW, NOW + 86400_000])

// A feedback row for export tests
const FID = `fb_test_${ts}`
await rawExec(`INSERT INTO feedback (id, project_id, observation, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [FID, PROJECT_ID, "Test bug observation", "high", "open", NOW])

// ── Spawn the server on a random port ────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 19000 + Math.floor(Math.random() * 1000)
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

async function api(method: string, path: string, body: any, sid: string) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie(sid),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

// ── Connector CRUD ────────────────────────────────────────────────────────────

test("GET /api/projects/:id/connectors returns empty list + type catalog", async () => {
  const r = await api("GET", `/api/projects/${PROJECT_ID}/connectors`, null, ADMIN_SID)
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body.connectors)).toBe(true)
  expect(Array.isArray(body.types)).toBe(true)
  expect(body.types.map((t: any) => t.type).sort()).toEqual(["github", "jira", "linear", "plane", "webhook"])
})

test("POST /api/projects/:id/connectors requires admin — member gets 403", async () => {
  const r = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "webhook",
    name: "Test",
    config: { url: "https://webhook.site/abc" },
    autoCopy: false,
  }, MEMBER_SID)
  expect(r.status).toBe(403)
})

test("POST /api/projects/:id/connectors validates config — missing required → 400", async () => {
  // webhook requires 'url'; send without it
  const r = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "webhook",
    name: "Missing URL",
    config: {},
    autoCopy: false,
  }, ADMIN_SID)
  expect(r.status).toBe(400)
  const body = await r.json()
  expect(body.error).toBeTruthy()
})

test("POST /api/projects/:id/connectors creates connector and returns redacted secrets", async () => {
  const r = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "github",
    name: "GitHub Issues",
    config: { owner: "myorg", repo: "myrepo", token: "ghp_supersecret" },
    autoCopy: false,
  }, ADMIN_SID)
  expect(r.status).toBe(201)
  const body = await r.json()
  expect(body.ok).toBe(true)
  expect(body.connector.type).toBe("github")
  // Secret must be redacted
  expect(body.connector.config.token).toBe("")
  expect(body.connector.config.hasToken).toBe(true)
  // Non-secret fields are visible
  expect(body.connector.config.owner).toBe("myorg")
  expect(body.connector.config.repo).toBe("myrepo")
})

test("GET /api/projects/:id/connectors lists created connector (redacted)", async () => {
  // Create one
  await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "webhook",
    name: "Zap",
    config: { url: "https://webhook.site/xyz" },
    autoCopy: true,
  }, ADMIN_SID)

  const r = await api("GET", `/api/projects/${PROJECT_ID}/connectors`, null, ADMIN_SID)
  const body = await r.json()
  const zap = body.connectors.find((c: any) => c.name === "Zap")
  expect(zap).toBeTruthy()
  expect(zap.autoCopy).toBe(true)
  // url is not a secret field for webhook, so it's visible
  expect(zap.config.url).toBe("https://webhook.site/xyz")
})

test("PATCH /api/projects/:id/connectors/:cid updates fields", async () => {
  // Create
  const cr = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "webhook",
    name: "Before",
    config: { url: "https://webhook.site/before" },
    autoCopy: false,
  }, ADMIN_SID)
  const { connector } = await cr.json()
  const cid = connector.id

  const r = await api("PATCH", `/api/projects/${PROJECT_ID}/connectors/${cid}`, {
    name: "After",
    autoCopy: true,
  }, ADMIN_SID)
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.ok).toBe(true)
})

test("DELETE /api/projects/:id/connectors/:cid removes connector", async () => {
  // Create
  const cr = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "webhook",
    name: "ToDelete",
    config: { url: "https://webhook.site/todelete" },
    autoCopy: false,
  }, ADMIN_SID)
  const { connector } = await cr.json()
  const cid = connector.id

  const r = await api("DELETE", `/api/projects/${PROJECT_ID}/connectors/${cid}`, null, ADMIN_SID)
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)

  // Should not appear in list
  const list = await api("GET", `/api/projects/${PROJECT_ID}/connectors`, null, ADMIN_SID)
  const body = await list.json()
  expect(body.connectors.find((c: any) => c.id === cid)).toBeUndefined()
})

// ── PATCH /api/feedback/:id ────────────────────────────────────────────────────

test("PATCH /api/feedback/:id rejects invalid status → 400", async () => {
  const r = await api("PATCH", `/api/feedback/${FID}`, { status: "invalid_value" }, ADMIN_SID)
  expect(r.status).toBe(400)
  const body = await r.json()
  expect(body.error).toBeTruthy()
})

test("PATCH /api/feedback/:id updates status/assignee/notes for member", async () => {
  const r = await api("PATCH", `/api/feedback/${FID}`, {
    status: "in_progress",
    assignee: "dev@test.local",
    notes: "Working on it",
  }, MEMBER_SID)
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)
})

test("PATCH /api/feedback/:id cross-project returns 404", async () => {
  const r = await api("PATCH", `/api/feedback/nonexistent_feedback_id_xyz_${ts}`, { status: "done" }, ADMIN_SID)
  expect(r.status).toBe(404)
})

// ── POST /api/feedback/:id/export ─────────────────────────────────────────────

test("POST /api/feedback/:id/export requires admin — member gets 403", async () => {
  // Create a connector first as admin
  const cr = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "webhook",
    name: "Export Test",
    config: { url: "https://webhook.site/export" },
    autoCopy: false,
  }, ADMIN_SID)
  const { connector } = await cr.json()

  const r = await api("POST", `/api/feedback/${FID}/export`, {
    connectorId: connector.id,
  }, MEMBER_SID)
  expect(r.status).toBe(403)
})

test("POST /api/feedback/:id/export with a failing connector returns status:failed and still 200", async () => {
  // Create a webhook with a URL that will fail (invalid host)
  const cr = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "webhook",
    name: "Failing Webhook",
    config: { url: "https://this-host-definitely-does-not-exist-12345.invalid/hook" },
    autoCopy: false,
  }, ADMIN_SID)
  const { connector } = await cr.json()

  const r = await api("POST", `/api/feedback/${FID}/export`, { connectorId: connector.id }, ADMIN_SID)
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.ok).toBe(true)
  expect(body.export.status).toBe("failed")
  expect(typeof body.export.error).toBe("string")
})

test("POST /api/feedback/:id/export inserts export row and returns type/status", async () => {
  // Create a webhook pointing to our own server (which accepts GET but not POST for /favicon.svg,
  // however webhook POSTs to any URL and accepts the response — even 404 counts for route testing)
  // The webhook adapter throws on non-2xx, so a 404 will give us status:"failed".
  // Let's use a connector type that we can control: we verify the SHAPE regardless of ok/failed.
  const cr = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "webhook",
    name: "Shape Test Webhook",
    config: { url: `${BASE}/api/feedback` },  // POST to this endpoint (will 400 - missing desc, but 4xx → failed)
    autoCopy: false,
  }, ADMIN_SID)
  const { connector } = await cr.json()

  const r = await api("POST", `/api/feedback/${FID}/export`, { connectorId: connector.id }, ADMIN_SID)
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.ok).toBe(true)
  // The shape must always include type/status regardless of success
  expect(body.export.type).toBe("webhook")
  expect(["ok", "failed"]).toContain(body.export.status)
})

// ── Dashboard enrichment ───────────────────────────────────────────────────────

test("GET /api/dashboard tickets include status, assignee, exports", async () => {
  const r = await api("GET", `/api/dashboard?project=${PROJECT_ID}`, null, ADMIN_SID)
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body.tickets)).toBe(true)
  // The FID feedback we created should be in tickets (all feedback, not just withTicketOnly)
  const ticket = body.tickets.find((t: any) => t.id === FID)
  expect(ticket).toBeTruthy()
  expect(typeof ticket.status).toBe("string")
  // assignee and exports fields must be present
  expect("assignee" in ticket).toBe(true)
  expect(Array.isArray(ticket.exports)).toBe(true)
})
