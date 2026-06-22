import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-simruns-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
await rawClient.execute("PRAGMA journal_mode=WAL")
await rawClient.execute("PRAGMA busy_timeout=5000")
async function rawExec(sql: string, args: any[] = []) { await rawClient.execute({ sql, args }) }

await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS sim_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  sim_ids_json TEXT,
  screenshot_id TEXT,
  reactions_json TEXT,
  label TEXT,
  error_msg TEXT,
  actor_email TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
)`)

const ADMIN_EMAIL = `vishal@quantana.com.au`
const ADMIN_SID = `sess_sr_${ts}`
const ACCOUNT_ID = `acct_sr_${ts}`
const PROJECT_ID = `proj_sr_${ts}`
const RUN_ID_1 = `simrun_sr1_${ts}`
const RUN_ID_2 = `simrun_sr2_${ts}`
const NOW = Date.now()

await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "SR Workspace", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_sr_${ts}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "SR Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_sr_${ts}`, PROJECT_ID, ADMIN_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])

// Seed runs
await rawExec(`INSERT INTO sim_runs (id, project_id, url, status, sim_ids_json, reactions_json, actor_email, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  [RUN_ID_1, PROJECT_ID, "http://example.com/login", "done", JSON.stringify(["sim1"]), JSON.stringify([{ simId: "sim1", simName: "Hat 1", observations: [{ text: "Observation 1", sentiment: "frustrated", suggestedBug: { title: "Bug 1", severity: "high" } }] }]), ADMIN_EMAIL, NOW - 2000])
await rawExec(`INSERT INTO sim_runs (id, project_id, url, status, sim_ids_json, error_msg, actor_email, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  [RUN_ID_2, PROJECT_ID, "http://example.com/checkout", "error", JSON.stringify(["sim1"]), "Vision model crashed", ADMIN_EMAIL, NOW - 1000])

let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 44000 + Math.floor(Math.random() * 1000)
  BASE = `http://localhost:${serverPort}`
  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env, PORT: String(serverPort),
      TURSO_DATABASE_URL: "file:" + srvDbFile, TURSO_AUTH_TOKEN: "",
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

const authCookie = () => `klav_session=${ADMIN_SID}`
const get = (path: string) => fetch(`${BASE}${path}`, { headers: { Cookie: authCookie() } })

test("GET /sim-runs redirects to /login when signed out", async () => {
  const res = await fetch(`${BASE}/sim-runs`, { redirect: "manual" })
  expect([301, 302, 303, 307, 308]).toContain(res.status)
  expect(res.headers.get("location") || "").toContain("/login")
})

test("GET /sim-runs serves the sim-runs HTML when signed in", async () => {
  const res = await get("/sim-runs")
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type") || "").toContain("text/html")
  const html = await res.text()
  expect(html.toLowerCase()).toContain("sim runs")
})

test("GET /api/sims/runs lists recent runs for the project", async () => {
  const res = await get(`/api/sims/runs?project=${PROJECT_ID}`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.runs)).toBe(true)
  expect(body.runs.length).toBe(2)
  // Ordered newest first
  expect(body.runs[0].id).toBe(RUN_ID_2)
  expect(body.runs[0].status).toBe("error")
  expect(body.runs[1].id).toBe(RUN_ID_1)
  expect(body.runs[1].status).toBe("done")
  expect(body.runs[1].reactions[0].simName).toBe("Hat 1")
})

test("GET /api/sims/runs/:runId returns a single run", async () => {
  const res = await get(`/api/sims/runs/${RUN_ID_1}`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.run.id).toBe(RUN_ID_1)
  expect(body.run.url).toBe("http://example.com/login")
  expect(body.run.reactions[0].observations[0].text).toBe("Observation 1")
  expect(body.run.reactions[0].observations[0].suggestedBug.severity).toBe("high")
})
