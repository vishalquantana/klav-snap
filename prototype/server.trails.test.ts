// Layer E — Trails dashboard route tests via the subprocess-server harness.
// Mirrors server.connectors.test.ts exactly: a dedicated temp DB seeded via a RAW createClient (never
// the shared db singleton), the server subprocess spawned against the same file: DB, and HTTP hits with
// a klav_session cookie. NO real Plane/network — the only mutating route here is dismiss; file is not
// exercised against a real connector (no auto-copy connector is seeded).

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-trails-srv-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) { await rawClient.execute({ sql, args }) }

// ── Schema (only the tables this suite needs; mirrors applySchema/migrateV2 DDL) ──
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS trails (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, intent TEXT NOT NULL DEFAULT '', base_url TEXT NOT NULL, baseline_ref TEXT, author_kind TEXT NOT NULL DEFAULT 'human', status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS trail_runs (id TEXT PRIMARY KEY, trail_id TEXT NOT NULL, project_id TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'running', llm_calls INTEGER NOT NULL DEFAULT 0, summary_json TEXT, started_at INTEGER NOT NULL, finished_at INTEGER)`)
await rawExec(`CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, run_id TEXT NOT NULL, step_id TEXT, trail_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, evidence_json TEXT, ground_quote TEXT, confidence REAL NOT NULL DEFAULT 0, dedup_key TEXT NOT NULL, recurrence INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'queued', connector_ref TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)

// ── Fixtures ─────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = `admin-${ts}@test.local`
const MEMBER_EMAIL = `member-${ts}@test.local`
const ADMIN_SID = `sess_admin_${ts}`
const MEMBER_SID = `sess_member_${ts}`
const ACCOUNT_ID = `acct_${ts}`
const PROJECT_ID = `proj_${ACCOUNT_ID}`
const TRAIL_ID = `trl_${ts}`
const WALK_ID = `walk_${ts}`
const QUEUED_FINDING_ID = `find_q_${ts}`
const REG_FINDING_ID = `find_r_${ts}`
const NOW = Date.now()

await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Test Workspace", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_${ACCOUNT_ID}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Default Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_admin_${ts}`, PROJECT_ID, ADMIN_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [MEMBER_EMAIL, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_member_${ts}`, PROJECT_ID, MEMBER_EMAIL, "member", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [MEMBER_SID, MEMBER_EMAIL, NOW, NOW + 86400_000])

// Trail + a finished AMBER Walk + two queued findings (one amber_heal, one regression).
await rawExec(`INSERT INTO trails (id, project_id, name, intent, base_url, author_kind, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [TRAIL_ID, PROJECT_ID, "Checkout", "log in and check out", "https://shop.test", "human", "active", ADMIN_EMAIL, NOW, NOW])
await rawExec(`INSERT INTO trail_runs (id, trail_id, project_id, trigger, status, llm_calls, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [WALK_ID, TRAIL_ID, PROJECT_ID, "manual", "amber", 2, NOW, NOW + 1000])
await rawExec(`INSERT INTO findings (id, project_id, run_id, step_id, trail_id, kind, title, evidence_json, ground_quote, confidence, dedup_key, recurrence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [QUEUED_FINDING_ID, PROJECT_ID, WALK_ID, null, TRAIL_ID, "amber_heal", "Healed Checkout but unconfirmed", JSON.stringify({ rationale: "label moved", fromSelector: "#checkout", toSelector: ".pay" }), "label moved", 0.7, "k_amber", 1, "queued", NOW, NOW])
await rawExec(`INSERT INTO findings (id, project_id, run_id, step_id, trail_id, kind, title, evidence_json, ground_quote, confidence, dedup_key, recurrence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [REG_FINDING_ID, PROJECT_ID, WALK_ID, null, TRAIL_ID, "regression", "Checkout gone", JSON.stringify({ rationale: "element absent" }), "element absent", 0.95, "k_reg", 1, "queued", NOW, NOW])

// ── Spawn the server ──────────────────────────────────────────────────────────────
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
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
      if (r && r.status < 500) break
    } catch { /* not ready */ }
    await Bun.sleep(150)
  }
})

afterAll(() => { serverProc?.kill(); rawClient.close() })

function authCookie(sid: string) { return `klav_session=${sid}` }
async function api(method: string, path: string, body: any, sid: string) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: authCookie(sid) },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────────

test("GET /api/trails/dashboard returns trails, walks, queue, precision (project-scoped, authed)", async () => {
  const r = await api("GET", `/api/trails/dashboard?project=${PROJECT_ID}`, null, MEMBER_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(Array.isArray(b.trails)).toBe(true)
  expect(b.trails.some((t: any) => t.id === TRAIL_ID)).toBe(true)
  expect(Array.isArray(b.recentWalks)).toBe(true)
  expect(b.recentWalks.some((w: any) => w.id === WALK_ID && w.status === "amber")).toBe(true)
  expect(Array.isArray(b.queue)).toBe(true)
  expect(b.queue.length).toBe(2)
  expect(b.precision).toBeDefined()
  expect(b.precision.precision).toBeNull() // nothing filed/dismissed yet
})

test("GET /api/trails/dashboard is 401 without a session", async () => {
  const r = await fetch(`${BASE}/api/trails/dashboard?project=${PROJECT_ID}`)
  expect(r.status).toBe(401)
})

test("POST /api/trails/findings/:id/dismiss removes it from the queue", async () => {
  const r = await api("POST", `/api/trails/findings/${QUEUED_FINDING_ID}/dismiss?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)

  const after = await api("GET", `/api/trails/dashboard?project=${PROJECT_ID}`, null, MEMBER_SID)
  const b = await after.json()
  expect(b.queue.some((f: any) => f.id === QUEUED_FINDING_ID)).toBe(false)
  // The dismissed finding now counts against precision (0 filed, 1 dismissed → 0).
  expect(b.precision.dismissed).toBe(1)
  expect(b.precision.precision).toBeCloseTo(0)
})

test("POST /api/trails/findings/:id/file returns 400 when the project has no connector", async () => {
  const r = await api("POST", `/api/trails/findings/${REG_FINDING_ID}/file?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(400)
  expect((await r.json()).ok).toBe(false)
})

test("GET /trails serves the dashboard page when authed", async () => {
  const r = await fetch(`${BASE}/trails`, { headers: { Cookie: `klav_session=${MEMBER_SID}` } })
  expect(r.status).toBe(200)
  const html = await r.text()
  expect(html).toContain("Trails")
  expect(html).toContain("/api/trails/dashboard")
})
