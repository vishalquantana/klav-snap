// G4 — Two-way status sync: inbound webhook receiver.
// Spins a real server subprocess against a fresh temp DB (mirrors server.connectors.test.ts).
// Verifies: signature gating (GitHub HMAC + Plane shared-secret), external-id → feedback mapping,
// status reflection, and spoofing guards (bad sig, unknown issue, unsupported type).

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-inbound-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) { await rawClient.execute({ sql, args }) }

// Minimal schema (mirror of applySchema for the tables we touch).
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
await rawExec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_texports_feedback ON ticket_exports(feedback_id)`)

const ADMIN_EMAIL = `admin-${ts}@test.local`
const ADMIN_SID = `sess_admin_${ts}`
const ACCOUNT_ID = `acct_${ts}`
const PROJECT_ID = `proj_${ACCOUNT_ID}`
const NOW = Date.now()

await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "WS", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_${ACCOUNT_ID}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "P", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_admin_${ts}`, PROJECT_ID, ADMIN_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])

// Feedback rows + their external links (one per provider).
const GH_FID = `fb_gh_${ts}`
const PLANE_FID = `fb_plane_${ts}`
const JIRA_FID = `fb_jira_${ts}`
const LINEAR_FID = `fb_linear_${ts}`
await rawExec(`INSERT INTO feedback (id, project_id, observation, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [GH_FID, PROJECT_ID, "GH-linked bug", "high", "open", NOW])
await rawExec(`INSERT INTO feedback (id, project_id, observation, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [PLANE_FID, PROJECT_ID, "Plane-linked bug", "high", "open", NOW])
await rawExec(`INSERT INTO feedback (id, project_id, observation, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [JIRA_FID, PROJECT_ID, "Jira-linked bug", "high", "open", NOW])
await rawExec(`INSERT INTO feedback (id, project_id, observation, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [LINEAR_FID, PROJECT_ID, "Linear-linked bug", "high", "open", NOW])

const GH_SECRET = "gh-webhook-secret-xyz"
const PLANE_SECRET = "plane-webhook-secret-abc"
const JIRA_SECRET = "jira-webhook-token-123"
const LINEAR_SECRET = "linear-webhook-secret-456"

let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

async function api(method: string, path: string, body: any, sid: string) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `klav_session=${sid}` },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

// Compute GitHub-style X-Hub-Signature-256 = sha256=hex(HMAC(secret, body)).
async function ghSign(secret: string, body: string): Promise<string> {
  return "sha256=" + (await hmacHex(secret, body))
}
// Linear signs the raw body as bare hex HMAC-SHA256 (no "sha256=" prefix) in Linear-Signature.
async function linSign(secret: string, body: string): Promise<string> {
  return await hmacHex(secret, body)
}
async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)))
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("")
}

beforeAll(async () => {
  serverPort = 19500 + Math.floor(Math.random() * 400)
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
      OPENROUTER_API_KEY: "test-key",
    },
    stdout: "pipe", stderr: "pipe",
  })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
    if (r && r.status < 500) break
    await Bun.sleep(150)
  }

  // Create the connectors via the API so inbound_secret is encrypted at rest the real way,
  // then wire each to its feedback row with a successful ticket_export (external_key).
  const ghRes = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "github", name: "GH",
    config: { owner: "o", repo: "r", token: "ghp_x", inbound_secret: GH_SECRET }, autoCopy: false,
  }, ADMIN_SID)
  const ghConn = (await ghRes.json()).connector
  await rawExec(`INSERT INTO ticket_exports (id, feedback_id, project_id, connector_id, type, external_key, external_url, status, error, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [`exp_gh_${ts}`, GH_FID, PROJECT_ID, ghConn.id, "github", "#321", "https://gh/issues/321", "ok", null, NOW, ADMIN_EMAIL])

  const planeRes = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "plane", name: "Plane",
    config: { workspace: "ws", project_id: "pp", token: "key", inbound_secret: PLANE_SECRET }, autoCopy: false,
  }, ADMIN_SID)
  const planeConn = (await planeRes.json()).connector
  await rawExec(`INSERT INTO ticket_exports (id, feedback_id, project_id, connector_id, type, external_key, external_url, status, error, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [`exp_plane_${ts}`, PLANE_FID, PROJECT_ID, planeConn.id, "plane", "55", "https://plane/issues/x", "ok", null, NOW, ADMIN_EMAIL])

  const jiraRes = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "jira", name: "Jira",
    config: { host: "https://x.atlassian.net", email: "a@b.c", token: "t", project_key: "PROJ", inbound_secret: JIRA_SECRET }, autoCopy: false,
  }, ADMIN_SID)
  const jiraConn = (await jiraRes.json()).connector
  await rawExec(`INSERT INTO ticket_exports (id, feedback_id, project_id, connector_id, type, external_key, external_url, status, error, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [`exp_jira_${ts}`, JIRA_FID, PROJECT_ID, jiraConn.id, "jira", "PROJ-42", "https://x.atlassian.net/browse/PROJ-42", "ok", null, NOW, ADMIN_EMAIL])

  const linearRes = await api("POST", `/api/projects/${PROJECT_ID}/connectors`, {
    type: "linear", name: "Linear",
    config: { api_key: "lin_x", team_id: "TEAM", inbound_secret: LINEAR_SECRET }, autoCopy: false,
  }, ADMIN_SID)
  const linearConn = (await linearRes.json()).connector
  await rawExec(`INSERT INTO ticket_exports (id, feedback_id, project_id, connector_id, type, external_key, external_url, status, error, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [`exp_linear_${ts}`, LINEAR_FID, PROJECT_ID, linearConn.id, "linear", "ENG-42", "https://linear.app/x/issue/ENG-42", "ok", null, NOW, ADMIN_EMAIL])
})

afterAll(() => { serverProc?.kill(); rawClient.close() })

async function feedbackStatus(fid: string): Promise<string> {
  const r = await rawClient.execute({ sql: "SELECT status FROM feedback WHERE id=?", args: [fid] })
  return String((r.rows[0] as any).status)
}

// ── GitHub inbound ────────────────────────────────────────────────────────────

test("github webhook: valid signature + closed action flips feedback → done", async () => {
  const payload = JSON.stringify({ action: "closed", issue: { number: 321, state: "closed" } })
  const sig = await ghSign(GH_SECRET, payload)
  const r = await fetch(`${BASE}/api/connectors/github/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig, "X-GitHub-Event": "issues" },
    body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(GH_FID)).toBe("done")
})

test("github webhook: reopened flips feedback back → open", async () => {
  const payload = JSON.stringify({ action: "reopened", issue: { number: 321, state: "open" } })
  const sig = await ghSign(GH_SECRET, payload)
  const r = await fetch(`${BASE}/api/connectors/github/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig, "X-GitHub-Event": "issues" },
    body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(GH_FID)).toBe("open")
})

test("github webhook: BAD signature is rejected (401) and does NOT change status", async () => {
  // First set a known status
  await rawClient.execute({ sql: "UPDATE feedback SET status='open' WHERE id=?", args: [GH_FID] })
  const payload = JSON.stringify({ action: "closed", issue: { number: 321, state: "closed" } })
  const r = await fetch(`${BASE}/api/connectors/github/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=" + "0".repeat(64), "X-GitHub-Event": "issues" },
    body: payload,
  })
  expect(r.status).toBe(401)
  expect(await feedbackStatus(GH_FID)).toBe("open") // unchanged → spoof blocked
})

test("github webhook: missing signature header is rejected (401)", async () => {
  const payload = JSON.stringify({ action: "closed", issue: { number: 321, state: "closed" } })
  const r = await fetch(`${BASE}/api/connectors/github/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
  })
  expect(r.status).toBe(401)
})

test("github webhook: unknown issue number → 200 no-op (signature valid)", async () => {
  const payload = JSON.stringify({ action: "closed", issue: { number: 99999, state: "closed" } })
  const sig = await ghSign(GH_SECRET, payload)
  const r = await fetch(`${BASE}/api/connectors/github/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
    body: payload,
  })
  // We accept-and-ignore unknown issues (don't leak which ids exist).
  expect(r.status).toBe(200)
})

test("github webhook: non-status action (labeled) is a 200 no-op", async () => {
  await rawClient.execute({ sql: "UPDATE feedback SET status='open' WHERE id=?", args: [GH_FID] })
  const payload = JSON.stringify({ action: "labeled", issue: { number: 321, state: "open" } })
  const sig = await ghSign(GH_SECRET, payload)
  const r = await fetch(`${BASE}/api/connectors/github/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
    body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(GH_FID)).toBe("open")
})

// ── Plane inbound ───────────────────────────────────────────────────────────

test("plane webhook: valid shared-secret + completed group flips feedback → done", async () => {
  const payload = JSON.stringify({ event: "issue", data: { sequence_id: 55, state__group: "completed" } })
  const r = await fetch(`${BASE}/api/connectors/plane/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Plane-Signature": PLANE_SECRET },
    body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(PLANE_FID)).toBe("done")
})

test("plane webhook: started group → in_progress", async () => {
  const payload = JSON.stringify({ event: "issue", data: { sequence_id: 55, state__group: "started" } })
  const r = await fetch(`${BASE}/api/connectors/plane/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Plane-Signature": PLANE_SECRET },
    body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(PLANE_FID)).toBe("in_progress")
})

test("plane webhook: wrong shared-secret rejected (401), status unchanged", async () => {
  await rawClient.execute({ sql: "UPDATE feedback SET status='open' WHERE id=?", args: [PLANE_FID] })
  const payload = JSON.stringify({ event: "issue", data: { sequence_id: 55, state__group: "completed" } })
  const r = await fetch(`${BASE}/api/connectors/plane/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Plane-Signature": "WRONG" },
    body: payload,
  })
  expect(r.status).toBe(401)
  expect(await feedbackStatus(PLANE_FID)).toBe("open")
})

// ── Jira inbound (shared-secret token: ?token= or X-Klavity-Token header) ──────

test("jira webhook: valid token (query param) + done category flips feedback → done", async () => {
  const payload = JSON.stringify({ webhookEvent: "jira:issue_updated", issue: { key: "PROJ-42", fields: { status: { statusCategory: { key: "done" } } } } })
  const r = await fetch(`${BASE}/api/connectors/jira/webhook?token=${encodeURIComponent(JIRA_SECRET)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(JIRA_FID)).toBe("done")
})

test("jira webhook: valid token (header) + indeterminate → in_progress", async () => {
  const payload = JSON.stringify({ webhookEvent: "jira:issue_updated", issue: { key: "PROJ-42", fields: { status: { statusCategory: { key: "indeterminate" } } } } })
  const r = await fetch(`${BASE}/api/connectors/jira/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Klavity-Token": JIRA_SECRET }, body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(JIRA_FID)).toBe("in_progress")
})

test("jira webhook: wrong token rejected (401), status unchanged", async () => {
  await rawClient.execute({ sql: "UPDATE feedback SET status='open' WHERE id=?", args: [JIRA_FID] })
  const payload = JSON.stringify({ webhookEvent: "jira:issue_updated", issue: { key: "PROJ-42", fields: { status: { statusCategory: { key: "done" } } } } })
  const r = await fetch(`${BASE}/api/connectors/jira/webhook?token=WRONG`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
  })
  expect(r.status).toBe(401)
  expect(await feedbackStatus(JIRA_FID)).toBe("open")
})

test("jira webhook: missing token rejected (401)", async () => {
  const payload = JSON.stringify({ webhookEvent: "jira:issue_updated", issue: { key: "PROJ-42", fields: { status: { statusCategory: { key: "done" } } } } })
  const r = await fetch(`${BASE}/api/connectors/jira/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
  })
  expect(r.status).toBe(401)
})

test("jira webhook: valid token but unknown issue key → 200 no-op", async () => {
  const payload = JSON.stringify({ webhookEvent: "jira:issue_updated", issue: { key: "PROJ-99999", fields: { status: { statusCategory: { key: "done" } } } } })
  const r = await fetch(`${BASE}/api/connectors/jira/webhook?token=${encodeURIComponent(JIRA_SECRET)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
  })
  expect(r.status).toBe(200) // don't leak which ids exist
})

// ── Linear inbound (HMAC-SHA256 Linear-Signature, bare hex) ───────────────────

test("linear webhook: valid signature + completed state flips feedback → done", async () => {
  const payload = JSON.stringify({ type: "Issue", action: "update", data: { identifier: "ENG-42", state: { type: "completed" } } })
  const sig = await linSign(LINEAR_SECRET, payload)
  const r = await fetch(`${BASE}/api/connectors/linear/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json", "Linear-Signature": sig }, body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(LINEAR_FID)).toBe("done")
})

test("linear webhook: started state → in_progress", async () => {
  const payload = JSON.stringify({ type: "Issue", action: "update", data: { identifier: "ENG-42", state: { type: "started" } } })
  const sig = await linSign(LINEAR_SECRET, payload)
  const r = await fetch(`${BASE}/api/connectors/linear/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json", "Linear-Signature": sig }, body: payload,
  })
  expect(r.status).toBe(200)
  expect(await feedbackStatus(LINEAR_FID)).toBe("in_progress")
})

test("linear webhook: BAD signature rejected (401), status unchanged", async () => {
  await rawClient.execute({ sql: "UPDATE feedback SET status='open' WHERE id=?", args: [LINEAR_FID] })
  const payload = JSON.stringify({ type: "Issue", action: "update", data: { identifier: "ENG-42", state: { type: "completed" } } })
  const r = await fetch(`${BASE}/api/connectors/linear/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json", "Linear-Signature": "0".repeat(64) }, body: payload,
  })
  expect(r.status).toBe(401)
  expect(await feedbackStatus(LINEAR_FID)).toBe("open")
})

test("linear webhook: missing signature rejected (401)", async () => {
  const payload = JSON.stringify({ type: "Issue", action: "update", data: { identifier: "ENG-42", state: { type: "completed" } } })
  const r = await fetch(`${BASE}/api/connectors/linear/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
  })
  expect(r.status).toBe(401)
})

test("linear webhook: valid signature but unknown identifier → 200 no-op", async () => {
  const payload = JSON.stringify({ type: "Issue", action: "update", data: { identifier: "ENG-99999", state: { type: "completed" } } })
  const sig = await linSign(LINEAR_SECRET, payload)
  const r = await fetch(`${BASE}/api/connectors/linear/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json", "Linear-Signature": sig }, body: payload,
  })
  expect(r.status).toBe(200) // accept-and-ignore unknown ids
})

// ── Unsupported / malformed ───────────────────────────────────────────────────

test("unsupported connector type → 404", async () => {
  const r = await fetch(`${BASE}/api/connectors/webhook/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  })
  expect(r.status).toBe(404)
})

test("oversized body is rejected (413)", async () => {
  const big = JSON.stringify({ action: "closed", issue: { number: 321 }, pad: "x".repeat(200_000) })
  const sig = await ghSign(GH_SECRET, big)
  const r = await fetch(`${BASE}/api/connectors/github/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
    body: big,
  })
  expect(r.status).toBe(413)
})
