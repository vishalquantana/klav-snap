// Sim Studio backend: versioned trait + persona editing endpoints.
// Subprocess-against-temp-DB pattern mirroring server.connectors.test.ts:
// raw-seed a temp DB, spawn the real server subprocess, hit it over authed HTTP.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-traits-srv-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// ── Schema (mirrors applySchema for the tables these routes touch) ──
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
// sim_traits / trait_events — base + additive columns (area/issue_type/severity/actor) inline so inserts work.
await rawExec(`CREATE TABLE IF NOT EXISTS sim_traits (
   id TEXT PRIMARY KEY, sim_id TEXT NOT NULL, project_id TEXT NOT NULL,
   kind TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
   strength INTEGER NOT NULL DEFAULT 1,
   src_transcript_id TEXT NOT NULL, src_quote TEXT NOT NULL, src_quote_offset INTEGER,
   src_speaker TEXT, area TEXT, issue_type TEXT, severity TEXT,
   created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE INDEX IF NOT EXISTS trait_sim_idx ON sim_traits (sim_id, status)`)
await rawExec(`CREATE TABLE IF NOT EXISTS trait_events (
   id TEXT PRIMARY KEY, trait_id TEXT NOT NULL, sim_id TEXT NOT NULL, transcript_id TEXT NOT NULL,
   op TEXT NOT NULL, before_text TEXT, after_text TEXT, quote TEXT NOT NULL, quote_offset INTEGER,
   speaker TEXT, source_date INTEGER NOT NULL, reason TEXT,
   area TEXT, issue_type TEXT, severity TEXT, actor TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE INDEX IF NOT EXISTS trait_evt_idx ON trait_events (trait_id, created_at)`)

// ── Fixtures ──
const AUTHED_EMAIL = `studio-${ts}@test.local`
const SID = `sess_studio_${ts}`
const ACCOUNT_ID = `acct_${ts}`
const PROJECT_ID = `proj_${ACCOUNT_ID}`
const NOW = Date.now()

await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [AUTHED_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Studio WS", AUTHED_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_${ACCOUNT_ID}`, ACCOUNT_ID, AUTHED_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Default Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_${ts}`, PROJECT_ID, AUTHED_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [SID, AUTHED_EMAIL, NOW, NOW + 86400_000])

// Persona sim_t + two active traits for it.
await rawExec(`INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ["sim_t", PROJECT_ID, "Test Sim", "Tester", "client", "TS", "#6366f1", "a sim", "[]", NOW, NOW])
await rawExec(`INSERT INTO sim_traits (id, sim_id, project_id, kind, text, status, strength, src_transcript_id, src_quote, src_quote_offset, src_speaker, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ["trait_seed_1", "sim_t", PROJECT_ID, "pain", "Hates slow load", "active", 1, "tr_seed", "it is so slow", null, "user", NOW, NOW])
await rawExec(`INSERT INTO sim_traits (id, sim_id, project_id, kind, text, status, strength, src_transcript_id, src_quote, src_quote_offset, src_speaker, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ["trait_seed_2", "sim_t", PROJECT_ID, "want", "Wants keyboard shortcuts", "active", 1, "tr_seed", "shortcuts please", null, "user", NOW + 1, NOW + 1])

// ── Spawn the server ──
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 20000 + Math.floor(Math.random() * 1000)
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

afterAll(() => {
  serverProc?.kill()
  rawClient.close()
})

// ── Auth helper ──
function authedFetch(path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      cookie: "klav_session=" + SID,
      Authorization: "Bearer " + SID,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  })
}

// ── Task 3: GET traits ──
test("GET /api/sims/:id/traits returns active traits", async () => {
  const res = await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.simId).toBe("sim_t")
  expect(Array.isArray(body.traits)).toBe(true)
  expect(body.traits.length).toBe(2)
  expect(body.traits[0]).toHaveProperty("srcQuote")
})
