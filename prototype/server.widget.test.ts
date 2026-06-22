// Task 2: POST /api/widget/token + CORS/OPTIONS for widget API.
// Spin a real server subprocess against a fresh temp DB and hit it with HTTP.
// Mirrors the hermetic pattern used in server.connectors.test.ts.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Dedicated temp DB for the subprocess ──────────────────────────────────────
const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-widget-${ts}.db`)

// 32-byte AES-GCM key for this test run (all-42 bytes)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

// ── Seed the DB via a raw client (NOT the shared db module) ──────────────────
const rawClient = createClient({ url: "file:" + srvDbFile })

async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// Minimal schema (mirrors applySchema from db.ts)
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
await rawExec(`CREATE TABLE IF NOT EXISTS monitored_urls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, UNIQUE(project_id, url_pattern))`)
await rawExec(`CREATE TABLE IF NOT EXISTS monitoring_consent (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, granted_at INTEGER, updated_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS extension_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0)`)
await rawExec(`CREATE INDEX IF NOT EXISTS ext_tok_email_idx ON extension_tokens(email)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS mon_url_proj_idx ON monitored_urls(project_id)`)

// ── Seed fixtures ─────────────────────────────────────────────────────────────
const ADMIN_EMAIL = `admin-widget-${ts}@test.local`
const ADMIN_SID = `sess_widget_${ts}`

const ACCOUNT_ID = `acct_w_${ts}`
const PROJECT_ID = `proj_w_${ts}`
const NOW = Date.now()

// Account + admin user
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Widget Test Workspace", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_w_${ts}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Widget Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_w_${ts}`, PROJECT_ID, ADMIN_EMAIL, "admin", null, NOW])

// Session
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])

// One enabled monitored URL: app.acme.com/*
await rawExec(`INSERT INTO monitored_urls (id, project_id, url_pattern, enabled, created_at) VALUES (?, ?, ?, ?, ?)`, [`mu_w_${ts}`, PROJECT_ID, "app.acme.com/*", 1, NOW])

// ── Spawn the server on a random port ─────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let base: string
const projectId = PROJECT_ID
const sessionCookie = `klav_session=${ADMIN_SID}`

beforeAll(async () => {
  serverPort = 47000 + Math.floor(Math.random() * 1000)
  base = `http://localhost:${serverPort}`

  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(serverPort),
      TURSO_DATABASE_URL: "file:" + srvDbFile,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET,
      KLAV_BASE_URL: base,
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
      const r = await fetch(`${base}/favicon.svg`).catch(() => null)
      if (r && r.status < 500) break
    } catch { /* not ready yet */ }
    await Bun.sleep(150)
  }
})

afterAll(() => {
  serverProc?.kill()
  rawClient.close()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

test("OPTIONS /api/sim/review returns 204 with permissive CORS", async () => {
  const r = await fetch(base + "/api/sim/review", { method: "OPTIONS" })
  expect(r.status).toBe(204)
  expect(r.headers.get("access-control-allow-origin")).toBe("*")
  expect((r.headers.get("access-control-allow-headers") || "").toLowerCase()).toContain("authorization")
})

// ── Cross-origin widget CORS: reflect the request Origin ──────────────────────
// Regression for the bug where the widget on a customer domain (e.g. bigidea.quantana.top)
// got "No Access-Control-Allow-Origin header" on /api/widget/ping (preflight) and
// /api/projects/:id/config. With an Origin header present we must REFLECT it (not just "*").
const X_ORIGIN = "https://bigidea.quantana.top"

test("OPTIONS /api/widget/ping preflight reflects the request Origin", async () => {
  const r = await fetch(base + "/api/widget/ping", {
    method: "OPTIONS",
    headers: { origin: X_ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  })
  expect(r.status).toBe(204)
  expect(r.headers.get("access-control-allow-origin")).toBe(X_ORIGIN)
  expect((r.headers.get("vary") || "")).toContain("Origin")
  expect((r.headers.get("access-control-allow-methods") || "").toUpperCase()).toContain("POST")
})

test("GET /api/projects/:id/config reflects the request Origin (widget config fetch)", async () => {
  const r = await fetch(base + "/api/projects/" + projectId + "/config", { headers: { origin: X_ORIGIN } })
  expect(r.status).toBe(200)
  expect(r.headers.get("access-control-allow-origin")).toBe(X_ORIGIN)
})

test("POST /api/widget/ping real response carries the reflected Origin", async () => {
  const r = await fetch(base + "/api/widget/ping", {
    method: "POST",
    headers: { "content-type": "application/json", origin: X_ORIGIN },
    body: JSON.stringify({ project_id: projectId }),
  })
  expect(r.headers.get("access-control-allow-origin")).toBe(X_ORIGIN)
})

test("POST /api/widget/token rejects when not signed in", async () => {
  const r = await fetch(base + "/api/widget/token", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, origin: "https://app.acme.com" }),
  })
  expect(r.status).toBe(401)
})

test("POST /api/widget/token rejects an origin not on the allowlist", async () => {
  const r = await fetch(base + "/api/widget/token", {
    method: "POST", headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ projectId, origin: "https://evil.example" }),
  })
  expect(r.status).toBe(403)
})

test("POST /api/widget/token mints a token for a valid session + allowlisted origin", async () => {
  const r = await fetch(base + "/api/widget/token", {
    method: "POST", headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ projectId, origin: "https://app.acme.com" }),
  })
  expect(r.status).toBe(200)
  const j = await r.json()
  expect(j.token).toMatch(/^ext_/)
})

test("the minted token authorizes GET /api/personas via Bearer with CORS header", async () => {
  const t = await (await fetch(base + "/api/widget/token", {
    method: "POST", headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ projectId, origin: "https://app.acme.com" }),
  })).json()
  const r = await fetch(base + "/api/personas?project=" + projectId, {
    headers: { authorization: "Bearer " + t.token },
  })
  expect(r.status).toBe(200)
  expect(r.headers.get("access-control-allow-origin")).toBe("*")
})

test("GET /widget-connect serves HTML", async () => {
  const r = await fetch(base + "/widget-connect?project=" + projectId + "&origin=https://app.acme.com")
  expect(r.status).toBe(200)
  expect((r.headers.get("content-type") || "")).toContain("text/html")
  const html = await r.text()
  expect(html).toContain("klavity-widget-token")
  // Code step offers an escape hatch: resend the code or change the email.
  expect(html).toContain('id="resendBtn"')
  expect(html).toContain('id="changeBtn"')
})

test("GET /widget.js serves javascript", async () => {
  const r = await fetch(base + "/widget.js")
  expect(r.status).toBe(200)
  expect((r.headers.get("content-type") || "")).toContain("javascript")
})

// FIX 1 regression: every error/gate response on widget routes must carry CORS headers so the
// browser (cross-origin) can read the body. With a fresh project and no consent row the gate
// returns needsConsent (412). Node's fetch ignores CORS enforcement, so we check the header is
// present on the wire — that's what the browser needs.
test("POST /api/sim/review gate-failure carries CORS header (error-CORS regression)", async () => {
  // Mint a fresh Bearer token for the seeded project.
  const tokenRes = await fetch(base + "/api/widget/token", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ projectId, origin: "https://app.acme.com" }),
  })
  expect(tokenRes.status).toBe(200)
  const { token } = await tokenRes.json()

  // Hit /api/sim/review with no consent row seeded → gate returns needsConsent 412.
  const r = await fetch(base + "/api/sim/review", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ projectId, url: "https://app.acme.com/page", screenshotDataUrl: "" }),
  })

  // Must NOT be 200 (gate blocked).
  expect(r.status).not.toBe(200)
  // CORS header must be present on the error response so cross-origin browsers can read it.
  expect(r.headers.get("access-control-allow-origin")).toBe("*")
})
