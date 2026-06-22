// Sim Profile page: GET /api/sims/:id/profile aggregates persona + traits + feedback(with triage
// outcome) + source transcripts, and GET /sim/:id serves the profile HTML.
// Subprocess-against-temp-DB pattern (mirrors server.triage-patch.test.ts).
import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-simprofile-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) { await rawClient.execute({ sql, args }) }

await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, suggested_bug_json TEXT, cited_trait_ids_json TEXT, source_quote TEXT, source_transcript_id TEXT, source_date INTEGER, plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT, updated_at INTEGER, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE INDEX IF NOT EXISTS fb_sim_idx ON feedback (sim_id, created_at)`)
await rawExec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sim_traits (id TEXT PRIMARY KEY, sim_id TEXT NOT NULL, project_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', strength INTEGER NOT NULL DEFAULT 1, src_transcript_id TEXT NOT NULL, src_quote TEXT NOT NULL, src_quote_offset INTEGER, src_speaker TEXT, area TEXT, issue_type TEXT, severity TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS trait_events (id TEXT PRIMARY KEY, trait_id TEXT NOT NULL, sim_id TEXT NOT NULL, transcript_id TEXT NOT NULL, op TEXT NOT NULL, before_text TEXT, after_text TEXT, quote TEXT NOT NULL, quote_offset INTEGER, speaker TEXT, source_date INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS transcripts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, raw_text TEXT NOT NULL, source_date INTEGER NOT NULL, speakers_json TEXT, added_by TEXT NOT NULL, created_at INTEGER NOT NULL)`)

const ADMIN_EMAIL = `vishal@quantana.com.au`
const ADMIN_SID = `sess_sp_${ts}`
const ACCOUNT_ID = `acct_sp_${ts}`
const PROJECT_ID = `proj_sp_${ts}`
const SIM_ID = `sim_sp_${ts}`
const OTHER_SIM = `sim_other_${ts}`
const TX_ID = `tx_sp_${ts}`
const TRAIT_ID = `trait_sp_${ts}`
const NOW = Date.now()

await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "SP Workspace", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_sp_${ts}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "SP Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_sp_${ts}`, PROJECT_ID, ADMIN_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])

// The Sim and a decoy Sim in the same project
await rawExec(`INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  [SIM_ID, PROJECT_ID, "Sarah Chen", "Procurement Lead", "client", "SC", "#6366f1", "Efficiency-obsessed buyer", JSON.stringify([{ kind: "pain", text: "Slow approvals", quote: "Approvals take forever" }]), NOW, NOW])
await rawExec(`INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  [OTHER_SIM, PROJECT_ID, "Other Sim", "Decoy", "client", "OS", "#999999", "decoy", "[]", NOW, NOW])

// A trait + the source transcript that seeded it (linked via a trait_event)
await rawExec(`INSERT INTO transcripts (id, project_id, title, raw_text, source_date, speakers_json, added_by, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  [TX_ID, PROJECT_ID, "Sarah onboarding call", "Sarah: Approvals take forever.", NOW - 1000, JSON.stringify(["Sarah"]), ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO sim_traits (id, sim_id, project_id, kind, text, status, strength, src_transcript_id, src_quote, src_speaker, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  [TRAIT_ID, SIM_ID, PROJECT_ID, "pain", "Wants faster approvals", "active", 1, TX_ID, "Approvals take forever", "Sarah", NOW, NOW])
await rawExec(`INSERT INTO trait_events (id, trait_id, sim_id, transcript_id, op, quote, source_date, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  [`evt_sp_${ts}`, TRAIT_ID, SIM_ID, TX_ID, "create", "Approvals take forever", NOW - 1000, NOW])

// Feedback the Sim has filed, across triage outcomes
// in_progress = a human triaged it forward (accepted as a real bug). Use this rather than 'open' so the
// server's one-time legacy triage backfill (open+low → new) can't reclassify it before the assertion.
await rawExec(`INSERT INTO feedback (id, project_id, sim_id, observation, severity, suggested_bug_json, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  [`fb_conf_${ts}`, PROJECT_ID, SIM_ID, "checkout dead", "low", JSON.stringify({ title: "Checkout CTA dead" }), "in_progress", NOW - 30])
await rawExec(`INSERT INTO feedback (id, project_id, sim_id, observation, severity, suggested_bug_json, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  [`fb_dism_${ts}`, PROJECT_ID, SIM_ID, "colour off", "low", JSON.stringify({ title: "Brand colour off" }), "dismissed", NOW - 20])
await rawExec(`INSERT INTO feedback (id, project_id, sim_id, observation, severity, suggested_bug_json, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  [`fb_pend_${ts}`, PROJECT_ID, SIM_ID, "still queued", "low", JSON.stringify({ title: "Still in queue" }), "new", NOW - 10])
// Decoy feedback that must NOT show on this Sim's profile
await rawExec(`INSERT INTO feedback (id, project_id, sim_id, observation, severity, status, created_at) VALUES (?,?,?,?,?,?,?)`,
  [`fb_other_${ts}`, PROJECT_ID, OTHER_SIM, "other sim bug", "low", "new", NOW - 5])

let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 43000 + Math.floor(Math.random() * 1000)
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

test("GET /api/sims/:id/profile returns persona + traits + feedback(w/ outcome) + transcripts", async () => {
  const res = await get(`/api/sims/${SIM_ID}/profile?project=${PROJECT_ID}`)
  expect(res.status).toBe(200)
  const body = await res.json()

  // Persona identity (the PROMPT / persona behind the Sim)
  expect(body.sim.id).toBe(SIM_ID)
  expect(body.sim.name).toBe("Sarah Chen")
  expect(body.sim.role).toBe("Procurement Lead")

  // Trait config behind the persona
  expect(Array.isArray(body.traits)).toBe(true)
  expect(body.traits.some((t: any) => t.text === "Wants faster approvals")).toBe(true)

  // Feedback, each tagged with its triage outcome — only this Sim's three reports
  expect(body.feedback.length).toBe(3)
  const byTitle = Object.fromEntries(body.feedback.map((f: any) => [f.title, f.outcome]))
  expect(byTitle["Checkout CTA dead"]).toBe("confirmed")
  expect(byTitle["Brand colour off"]).toBe("dismissed")
  expect(byTitle["Still in queue"]).toBe("pending")
  expect(body.feedback.some((f: any) => f.observation === "other sim bug")).toBe(false)

  // Connected transcript(s) that seeded the Sim
  expect(body.transcripts.some((t: any) => t.id === TX_ID && t.title === "Sarah onboarding call")).toBe(true)
})

test("GET /api/sims/:id/profile 404s for a Sim that isn't in the resolved project", async () => {
  const res = await get(`/api/sims/sim_does_not_exist/profile?project=${PROJECT_ID}`)
  expect(res.status).toBe(404)
})

test("GET /sim/:id serves the profile page HTML when signed in", async () => {
  const res = await get(`/sim/${SIM_ID}`)
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type") || "").toContain("text/html")
  const html = await res.text()
  expect(html.toLowerCase()).toContain("sim")
})

test("GET /sim/:id redirects to /login when signed out", async () => {
  const res = await fetch(`${BASE}/sim/${SIM_ID}`, { redirect: "manual" })
  expect([301, 302, 303, 307, 308]).toContain(res.status)
  expect(res.headers.get("location") || "").toContain("/login")
})
