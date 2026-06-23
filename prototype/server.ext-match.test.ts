// GET /api/extension/match — hermetic server test.
// Spins a real server subprocess against a fresh temp DB, seeds a project +
// monitored URL, and exercises the auth, matching, and isolation guarantees.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-extmatch-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
await rawClient.execute("PRAGMA journal_mode=WAL")
await rawClient.execute("PRAGMA busy_timeout=5000")

async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// ── Minimal schema — mirrors prototype/lib/db.ts initDb columns exactly ──────
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT NOT NULL, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', url_patterns_json TEXT, review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER DEFAULT 200, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL, invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS monitored_urls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, UNIQUE(project_id, url_pattern))`)
await rawExec(`CREATE TABLE IF NOT EXISTS extension_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)

// ── Seed data ─────────────────────────────────────────────────────────────────
const NOW = Date.now()
const MEMBER_EMAIL = "member@test.local"
const OTHER_EMAIL  = "other@test.local"
const ACCOUNT_ID   = "acc_test"
const PROJECT_ID   = "proj_match_test"
const PROJECT_ID_2 = "proj_match_second"
const PROJECT_ID_OFF = "proj_no_match_test"
const PROJECT_ID_PRIVATE = "proj_private_match"
const TOKEN_MEMBER = "ext_membertoken000"
const TOKEN_OTHER  = "ext_othertoken000"
const TOKEN_BOUND_MATCH = "ext_boundmatch000"
const TOKEN_BOUND_OFF = "ext_boundoff000"

await rawExec(`INSERT INTO users VALUES (?, ?, ?)`, [MEMBER_EMAIL, "Member", NOW])
await rawExec(`INSERT INTO users VALUES (?, ?, ?)`, [OTHER_EMAIL,  "Other",  NOW])
await rawExec(`INSERT INTO accounts VALUES (?, ?, ?, ?, ?)`, [ACCOUNT_ID, "Test Acc", MEMBER_EMAIL, null, NOW])
await rawExec(`INSERT INTO account_members VALUES (?, ?, ?, ?, ?)`, ["am1", ACCOUNT_ID, MEMBER_EMAIL, "member", NOW])
await rawExec(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Match Project", "active", null, "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID_2, ACCOUNT_ID, "Second Match Project", "active", null, "auto", 200, "named", NOW + 1, NOW + 1])
await rawExec(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID_OFF, ACCOUNT_ID, "Offsite Project", "active", null, "auto", 200, "named", NOW + 2, NOW + 2])
await rawExec(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID_PRIVATE, ACCOUNT_ID, "Private Match Project", "active", null, "auto", 200, "named", NOW + 3, NOW + 3])
await rawExec(`INSERT INTO project_members VALUES (?, ?, ?, ?, ?, ?)`, ["pm1", PROJECT_ID, MEMBER_EMAIL, "member", null, NOW])
await rawExec(`INSERT INTO project_members VALUES (?, ?, ?, ?, ?, ?)`, ["pm2", PROJECT_ID_2, MEMBER_EMAIL, "member", null, NOW])
await rawExec(`INSERT INTO project_members VALUES (?, ?, ?, ?, ?, ?)`, ["pm3", PROJECT_ID_OFF, MEMBER_EMAIL, "member", null, NOW])
await rawExec(`INSERT INTO monitored_urls VALUES (?, ?, ?, ?, ?)`, ["mu1", PROJECT_ID, "bigidea.quantana.top", 1, NOW])
await rawExec(`INSERT INTO monitored_urls VALUES (?, ?, ?, ?, ?)`, ["mu2", PROJECT_ID_2, "bigidea.quantana.top", 1, NOW])
await rawExec(`INSERT INTO monitored_urls VALUES (?, ?, ?, ?, ?)`, ["mu3", PROJECT_ID_OFF, "different.example.com", 1, NOW])
await rawExec(`INSERT INTO monitored_urls VALUES (?, ?, ?, ?, ?)`, ["mu4", PROJECT_ID_PRIVATE, "bigidea.quantana.top", 1, NOW])
// other user is NOT a project member
await rawExec(`INSERT INTO extension_tokens VALUES (?, ?, ?, ?, ?, ?)`, [TOKEN_MEMBER, MEMBER_EMAIL, null, NOW, NOW + 86400000, 0])
await rawExec(`INSERT INTO extension_tokens VALUES (?, ?, ?, ?, ?, ?)`, [TOKEN_OTHER,  OTHER_EMAIL,  null, NOW, NOW + 86400000, 0])
await rawExec(`INSERT INTO extension_tokens VALUES (?, ?, ?, ?, ?, ?)`, [TOKEN_BOUND_MATCH, MEMBER_EMAIL, PROJECT_ID_2, NOW, NOW + 86400000, 0])
await rawExec(`INSERT INTO extension_tokens VALUES (?, ?, ?, ?, ?, ?)`, [TOKEN_BOUND_OFF, MEMBER_EMAIL, PROJECT_ID_OFF, NOW, NOW + 86400000, 0])

let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  const port = 32200 + Math.floor(Math.random() * 500)
  BASE = `http://localhost:${port}`
  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: "file:" + srvDbFile,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET,
      KLAV_BASE_URL: BASE,
      KLAV_ALLOWED_DOMAINS: "test.local",
      KLAV_DEV_SHOW_OTP: "1",
      SENDGRID_API_KEY: "",
    },
    stdout: "ignore",
    stderr: "ignore",
  })
  // Wait for server to be ready
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok || r.status < 500) break } catch { /**/ }
    await new Promise(r => setTimeout(r, 200))
  }
})

afterAll(() => {
  serverProc?.kill()
  rawClient.close()
})

const MONITORED_URL = "https://bigidea.quantana.top/dashboard"
const OFF_URL       = "https://totally-different-site.io/page"

// ── Tests ─────────────────────────────────────────────────────────────────────

test("401 when no Authorization header", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`)
  expect(r.status).toBe(401)
})

test("empty projects when url is missing / blank", async () => {
  const r = await fetch(`${BASE}/api/extension/match`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("empty projects when url does not match any allowlist", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(OFF_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("returns matching project for member on monitored URL", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body.projects)).toBe(true)
  expect(body.projects.length).toBeGreaterThan(0)
  const ids = body.projects.map((p: any) => p.projectId)
  expect(ids).toContain(PROJECT_ID)
  expect(body.projects.find((p: any) => p.projectId === PROJECT_ID)?.name).toBe("Match Project")
})

test("returns only accessible projects whose allowlist matches the url", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  const ids = body.projects.map((p: any) => p.projectId).sort()
  expect(ids).toEqual([PROJECT_ID, PROJECT_ID_2].sort())
  expect(ids).not.toContain(PROJECT_ID_OFF)
  expect(ids).not.toContain(PROJECT_ID_PRIVATE)
})

test("bound project token is constrained to its project even when other accessible projects match", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_BOUND_MATCH}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([{ projectId: PROJECT_ID_2, name: "Second Match Project" }])
})

test("bound project token returns empty when only other accessible projects match", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_BOUND_OFF}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("non-member gets empty list — no existence disclosure", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_OTHER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("returns empty list for non-http url", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent("ftp://bad.example.com/")}`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const r = await fetch(`${BASE}/api/extension/match`, { method: "OPTIONS" })
  expect(r.status).toBe(204)
  expect(r.headers.get("access-control-allow-origin")).toBeTruthy()
})
