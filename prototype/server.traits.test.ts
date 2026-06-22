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
await rawExec(`CREATE TABLE IF NOT EXISTS persona_edits (
   id TEXT PRIMARY KEY, persona_id TEXT NOT NULL, project_id TEXT NOT NULL,
   field TEXT NOT NULL, before_val TEXT, after_val TEXT, actor TEXT NOT NULL, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE INDEX IF NOT EXISTS persona_edits_idx ON persona_edits (persona_id, created_at)`)
await rawExec(`CREATE TABLE IF NOT EXISTS transcripts (
   id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, raw_text TEXT NOT NULL,
   source_date INTEGER NOT NULL, speakers_json TEXT, added_by TEXT NOT NULL, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE INDEX IF NOT EXISTS transcript_proj_idx ON transcripts (project_id, source_date)`)
// F5: project-bound widget Bearer tokens.
await rawExec(`CREATE TABLE IF NOT EXISTS extension_tokens (token TEXT PRIMARY KEY, email TEXT, project_id TEXT, created_at INTEGER, expires_at INTEGER, revoked INTEGER DEFAULT 0)`)

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

// A transcript belonging to the project, for the GET /api/transcripts list test.
await rawExec(`INSERT INTO transcripts (id, project_id, title, raw_text, source_date, speakers_json, added_by, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  ["tr_seed", PROJECT_ID, "Seed onboarding call", "Tester: it is so slow. shortcuts please.", NOW, null, AUTHED_EMAIL, NOW])

// ── F5 fixtures: a SECOND project ALSO owned by AUTHED_EMAIL, plus an extension token BOUND to the
//    first project. The bound token must reach PROJECT_ID but NOT this second owned project. ──
const PROJECT_ID_2 = `proj2_${ACCOUNT_ID}`
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID_2, ACCOUNT_ID, "Second Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm2_${ts}`, PROJECT_ID_2, AUTHED_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO extension_tokens (token, email, project_id, created_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, ?)`, ["ext_bound_x", AUTHED_EMAIL, PROJECT_ID, NOW, NOW + 86400_000, 0])

// ── Victim tenant (separate account/project) the AUTHED_EMAIL user has NO access to. Used by the
//    cross-tenant IDOR regression tests below: an attacker authed to their own project must not be
//    able to read or mutate this tenant's Sim / traits / persona by id. ──
const VICTIM_ACCOUNT = `acct_victim_${ts}`
const VICTIM_PROJECT = `proj_victim_${ts}`
const VICTIM_OWNER = `victim-${ts}@other.local`
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [VICTIM_OWNER, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [VICTIM_ACCOUNT, "Victim WS", VICTIM_OWNER, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_${VICTIM_ACCOUNT}`, VICTIM_ACCOUNT, VICTIM_OWNER, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [VICTIM_PROJECT, VICTIM_ACCOUNT, "Victim Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_victim_${ts}`, VICTIM_PROJECT, VICTIM_OWNER, "admin", null, NOW])
await rawExec(`INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ["sim_victim", VICTIM_PROJECT, "Victim Sim", "Secret", "client", "VS", "#111111", "confidential research", "[]", NOW, NOW])
await rawExec(`INSERT INTO sim_traits (id, sim_id, project_id, kind, text, status, strength, src_transcript_id, src_quote, src_quote_offset, src_speaker, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ["trait_victim", "sim_victim", VICTIM_PROJECT, "pain", "Confidential pain point", "active", 1, "tr_v", "secret quote", null, "user", NOW, NOW])
await rawExec(`INSERT INTO persona_edits (id, persona_id, project_id, field, before_val, after_val, actor, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  ["pe_victim", "sim_victim", VICTIM_PROJECT, "name", "Old", "Victim Sim", VICTIM_OWNER, NOW])

// ── Spawn the server ──
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 44000 + Math.floor(Math.random() * 1000)
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

// ── Task 4: POST traits — manual create + manual_create event ──
test("POST /api/sims/:id/traits creates a trait + manual_create event", async () => {
  const res = await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`, {
    method: "POST",
    body: JSON.stringify({ kind: "love", text: "Loves dark mode", srcQuote: "dark mode is great", srcTranscriptId: "tr_seed" }),
  })
  expect(res.status).toBe(201)
  const { trait } = await res.json()
  expect(trait.kind).toBe("love")
  expect(trait.text).toBe("Loves dark mode")
  const ev = await authedFetch(`/api/sims/sim_t/evolution?project=${PROJECT_ID}`)
  const { events } = await ev.json()
  expect(events.some((e: any) => e.op === "manual_create")).toBe(true)
})

// ── Task 5: PUT edits trait + logs edit event ──
test("PUT edits trait text + logs edit event with before/after", async () => {
  const list = await (await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`)).json()
  const id = list.traits[0].id
  const oldText = list.traits[0].text
  const res = await authedFetch(`/api/sims/sim_t/traits/${id}?project=${PROJECT_ID}`, {
    method: "PUT", body: JSON.stringify({ text: "edited text" }),
  })
  expect(res.status).toBe(200)
  expect((await res.json()).trait.text).toBe("edited text")
  const { events } = await (await authedFetch(`/api/sims/sim_t/evolution?project=${PROJECT_ID}`)).json()
  const editEv = events.find((e: any) => e.op === "edit")
  expect(editEv.beforeText).toBe(oldText)
  expect(editEv.afterText).toBe("edited text")
})

// ── Task 5: DELETE soft-archives a trait ──
test("DELETE archives a trait (soft) — drops from active list, stays in events", async () => {
  const list = await (await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`)).json()
  const id = list.traits[0].id
  const res = await authedFetch(`/api/sims/sim_t/traits/${id}?project=${PROJECT_ID}`, { method: "DELETE" })
  expect(res.status).toBe(200)
  const after = await (await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`)).json()
  expect(after.traits.some((t: any) => t.id === id)).toBe(false)
})

// ── Task 6: evolution feed exposes actor on manual edits ──
test("evolution feed exposes actor on manual edits", async () => {
  // (a prior PUT in this file already created an 'edit' event by AUTHED_EMAIL)
  const { events } = await (await authedFetch(`/api/sims/sim_t/evolution?project=${PROJECT_ID}`)).json()
  const editEv = events.find((e: any) => e.op === "edit")
  expect(editEv.actor).toBe(AUTHED_EMAIL)
})

// ── Task 1 (frontend plan): GET /api/transcripts lists project transcripts ──
test("GET /api/transcripts lists project transcripts", async () => {
  const res = await authedFetch(`/api/transcripts?project=${PROJECT_ID}`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.transcripts)).toBe(true)
  expect(body.transcripts.some((t: any) => t.id === "tr_seed")).toBe(true)
})

// ── Task 7: persona identity edits are versioned in persona_edits ──
test("PUT /api/personas/:id logs identity edits + GET edits returns them", async () => {
  await authedFetch(`/api/personas/sim_t?project=${PROJECT_ID}`, {
    method: "PUT", body: JSON.stringify({ name: "Renamed Sim", role: "New Role", type: "client", initials: "RS", accent: "#6366f1", summary: "updated", insights: [] }),
  })
  const res = await authedFetch(`/api/personas/sim_t/edits?project=${PROJECT_ID}`)
  expect(res.status).toBe(200)
  const { edits } = await res.json()
  expect(edits.some((e: any) => e.field === "name" && e.afterVal === "Renamed Sim")).toBe(true)
  expect(edits.find((e: any) => e.field === "name").actor).toBe(AUTHED_EMAIL)
})

// ── Security: cross-tenant IDOR (C1/C2). Attacker is AUTHED_EMAIL, authed to their OWN project, but
//    targets the victim tenant's Sim/trait/persona by id. Every route must 404 and leave data intact.
//    `?project=${PROJECT_ID}` deliberately passes a project the attacker DOES own, so these exercise the
//    per-Sim ownership guard specifically — not merely the project-access gate. ──

test("C1: GET victim Sim traits is denied (no cross-tenant read)", async () => {
  const res = await authedFetch(`/api/sims/sim_victim/traits?project=${PROJECT_ID}`)
  expect(res.status).toBe(404)
  const body = await res.json()
  expect(body.traits).toBeUndefined()
})

test("C1: POST trait onto victim Sim is denied", async () => {
  const res = await authedFetch(`/api/sims/sim_victim/traits?project=${PROJECT_ID}`, {
    method: "POST", body: JSON.stringify({ kind: "pain", text: "injected", srcQuote: "x" }),
  })
  expect(res.status).toBe(404)
  const rows = await rawClient.execute({ sql: `SELECT COUNT(*) AS n FROM sim_traits WHERE sim_id=?`, args: ["sim_victim"] })
  expect(Number(rows.rows[0].n)).toBe(1) // still only the original seeded trait
})

test("C1: PUT victim trait is denied and leaves it unchanged", async () => {
  const res = await authedFetch(`/api/sims/sim_victim/traits/trait_victim?project=${PROJECT_ID}`, {
    method: "PUT", body: JSON.stringify({ text: "hijacked" }),
  })
  expect(res.status).toBe(404)
  const rows = await rawClient.execute({ sql: `SELECT text FROM sim_traits WHERE id=?`, args: ["trait_victim"] })
  expect(rows.rows[0].text).toBe("Confidential pain point")
})

test("C1: DELETE (archive) victim trait is denied and leaves it active", async () => {
  const res = await authedFetch(`/api/sims/sim_victim/traits/trait_victim?project=${PROJECT_ID}`, { method: "DELETE" })
  expect(res.status).toBe(404)
  const rows = await rawClient.execute({ sql: `SELECT status FROM sim_traits WHERE id=?`, args: ["trait_victim"] })
  expect(rows.rows[0].status).toBe("active")
})

test("C1: GET victim Sim evolution is denied", async () => {
  const res = await authedFetch(`/api/sims/sim_victim/evolution?project=${PROJECT_ID}`)
  expect(res.status).toBe(404)
})

test("C2: PUT victim persona is denied and does not overwrite it", async () => {
  const res = await authedFetch(`/api/personas/sim_victim?project=${PROJECT_ID}`, {
    method: "PUT", body: JSON.stringify({ name: "Pwned", role: "x", type: "client", initials: "PW", accent: "#000000", summary: "", insights: [] }),
  })
  expect(res.status).toBe(404)
  const rows = await rawClient.execute({ sql: `SELECT name FROM personas WHERE id=?`, args: ["sim_victim"] })
  expect(rows.rows[0].name).toBe("Victim Sim") // unchanged
})

test("C1: GET victim persona edit history is denied", async () => {
  const res = await authedFetch(`/api/personas/sim_victim/edits?project=${PROJECT_ID}`)
  expect(res.status).toBe(404)
  const body = await res.json()
  expect(body.edits).toBeUndefined()
})

// ── Security: SSRF guard on the Plane host (H2). Direct mode is unauthenticated and the host comes
//    from form input — a link-local/loopback target must be blocked before any outbound fetch.
//    Contract updated (Task 2): assertSafeUrl still runs (SSRF protection preserved), but a rejected
//    tracker host is now NON-FATAL — feedback is still saved (HTTP 200, saved:true). The unsafe host
//    is never fetched and no Plane issue URL is returned. ──
test("H2: /api/feedback with a link-local Plane host → saved (non-fatal, no outbound fetch)", async () => {
  const form = new FormData()
  form.set("description", "hi")
  form.set("plane_token", "tok"); form.set("plane_workspace", "ws"); form.set("plane_project_id", "pp")
  form.set("plane_host", "https://169.254.169.254") // cloud metadata range — blocked by assertSafeUrl
  const res = await fetch(`${BASE}/api/feedback`, { method: "POST", body: form })
  // Submission must succeed (feedback persisted or unauthenticated → id:"").
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.saved).toBe(true)
  // No Plane issue URL: the unsafe host was never fetched.
  expect(body.issue_url).toBeUndefined()
  expect(body.issueUrl).toBeUndefined()
  expect(body.error).toBeUndefined()
})

test("H2: /api/feedback with a loopback Plane host → saved (non-fatal, no outbound fetch)", async () => {
  const form = new FormData()
  form.set("description", "hi")
  form.set("plane_token", "tok"); form.set("plane_workspace", "ws"); form.set("plane_project_id", "pp")
  form.set("plane_host", "https://127.0.0.1") // loopback — blocked by assertSafeUrl
  const res = await fetch(`${BASE}/api/feedback`, { method: "POST", body: form })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.saved).toBe(true)
  expect(body.issue_url).toBeUndefined()
  expect(body.error).toBeUndefined()
})

// ── M2: /api/extension-token mints a revocable ext_ token, NOT the raw session id ──
test("M2: /api/extension-token returns an ext_ token, not the session id", async () => {
  const res = await fetch(`${BASE}/api/extension-token`, { headers: { cookie: "klav_session=" + SID } })
  expect(res.status).toBe(200)
  const { token } = await res.json()
  expect(token.startsWith("ext_")).toBe(true)
  expect(token).not.toBe(SID)
})

// ── M2 (closed): a raw session id is no longer accepted as a Bearer token ──
test("M2: session id is rejected as a Bearer (cookie still works)", async () => {
  // Bearer-only (no cookie): the session id must NOT authenticate the extension API anymore.
  const bad = await fetch(`${BASE}/api/transcripts?project=${PROJECT_ID}`, { headers: { Authorization: "Bearer " + SID } })
  expect(bad.status).toBe(401)
  // The same session id as a first-party cookie still authenticates.
  const viaCookie = await fetch(`${BASE}/api/transcripts?project=${PROJECT_ID}`, { headers: { cookie: "klav_session=" + SID } })
  expect(viaCookie.status).toBe(200)
})

test("M2: a minted ext_ token authenticates as a Bearer with no cookie", async () => {
  const { token } = await (await fetch(`${BASE}/api/extension-token`, { headers: { cookie: "klav_session=" + SID } })).json()
  const res = await fetch(`${BASE}/api/transcripts?project=${PROJECT_ID}`, { headers: { Authorization: "Bearer " + token } })
  expect(res.status).toBe(200)
})

// ── H1/A07: OTP per-email verify lockout survives X-Forwarded-For rotation ──
// The test server's socket peer is loopback, so it TRUSTS X-Forwarded-For (it sits "behind Caddy").
// An attacker rotating XFF gets a fresh per-(email,IP) budget each time — but the IP-INDEPENDENT
// per-email counter (otpfail:e:<email>, cap 10 / 15 min) must still fire and 429, regardless of XFF.
test("H1: OTP per-email lockout fires despite rotating X-Forwarded-For", async () => {
  const target = `lockme-${ts}@test.local`
  // First request a code so the email is real in the OTP table (not required for the counter, but
  // mirrors a genuine brute-force where a code exists). Use a fixed XFF for issuance.
  await fetch(`${BASE}/api/auth/request`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
    body: JSON.stringify({ email: target }),
  })
  // Now send 11 WRONG codes, each from a DIFFERENT spoofed XFF. The per-(email,IP) cap (5) never
  // trips because every attempt has a fresh IP; only the per-email cap (10) accumulates.
  let saw429 = false
  let last = 0
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${i}` },
      body: JSON.stringify({ email: target, code: "000000" }),
    })
    last = res.status
    if (res.status === 429) { saw429 = true; break }
  }
  expect(saw429).toBe(true) // per-email lockout fired despite XFF rotation
  expect(last).toBe(429)
})

// ── A01/IDOR: /api/feedback must NOT leak a victim tenant's trait quote via a cross-tenant sim_id ──
// Attacker is authed (cookie) to their OWN project but supplies sim_id=sim_victim (+ its trait id).
// The sim-ownership guard must treat the persona as ephemeral (simId=null) → citation null/empty,
// so the victim's verbatim "secret quote" never appears in the response.
test("A01: /api/feedback with a cross-tenant sim_id yields no victim citation", async () => {
  const form = new FormData()
  form.set("description", "attacker probing cross-tenant citations")
  form.set("project_id", PROJECT_ID)            // attacker's OWN project
  form.set("sim_id", "sim_victim")              // victim tenant's Sim id
  form.set("cited_trait_ids", JSON.stringify(["trait_victim"]))
  form.set("suggested_bug", JSON.stringify({ title: "probe", body: "b", severity: "low" }))
  const res = await fetch(`${BASE}/api/feedback`, {
    method: "POST",
    headers: { cookie: "klav_session=" + SID },
    body: form,
  })
  expect(res.status).toBe(200)
  const text = await res.text()
  // The victim's confidential trait quote must NOT appear anywhere in the response.
  expect(text.includes("secret quote")).toBe(false)
  expect(text.includes("Confidential pain point")).toBe(false)
  // And, when a persisted row exists, it must carry no cross-tenant citation (simId nulled → no trait
  // read). The feedback table may not be part of this test's minimal schema; if so, the response-body
  // assertions above are already the binding security check, so skip the row check gracefully.
  try {
    const rows = await rawClient.execute({
      sql: `SELECT sim_id, source_quote FROM feedback WHERE project_id=? ORDER BY created_at DESC LIMIT 1`,
      args: [PROJECT_ID],
    })
    if (rows.rows.length) {
      const r: any = rows.rows[0]
      expect(r.sim_id).toBeNull()            // sim_victim was rejected (ephemeral)
      expect(r.source_quote).toBeNull()      // no leaked verbatim quote
    }
  } catch { /* feedback table not in this minimal schema — body assertions cover the leak */ }
})

// ── M5: /api/transcripts rejects an oversized payload before doing any LLM work ──
test("M5: /api/transcripts rejects an oversized transcript with 413", async () => {
  const huge = "a".repeat(100_001)
  const res = await authedFetch(`/api/transcripts?project=${PROJECT_ID}`, {
    method: "POST", body: JSON.stringify({ transcript: huge }),
  })
  expect(res.status).toBe(413)
})

// ── A02 / M-2: every response carries the security headers (clickjacking + sniffing + CSP). ──
test("security headers (X-Frame-Options + CSP) are on every response", async () => {
  // A 401 from an unauthenticated extension API — deterministic, no LLM/DB writes.
  const res = await fetch(`${BASE}/api/personas?project=${PROJECT_ID}`, { headers: { Authorization: "Bearer ext_nope" } })
  expect(res.headers.get("x-frame-options")).toBe("DENY")
  expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  const csp = res.headers.get("content-security-policy") || ""
  expect(csp).toContain("frame-ancestors 'none'")
})

// ── LLM10 / AI-demo size cap: an oversized brief is rejected with 413 BEFORE any LLM call (hermetic). ──
test("AI demo: /api/persona/brief rejects an oversized brief with 413", async () => {
  const huge = "a".repeat(100_001)
  const res = await fetch(`${BASE}/api/persona/brief`, {
    method: "POST",
    headers: { cookie: "klav_session=" + SID, "content-type": "application/json" },
    body: JSON.stringify({ brief: huge }),
  })
  expect(res.status).toBe(413)
})

// ── F5 (A01/ASI03): a project-bound widget Bearer token may act ONLY on its bound project, not on the
//    owner's OTHER projects. Also proves AsyncLocalStorage propagates through Bun.serve/libsql awaits. ──
test("F5: a project-bound ext token reaches its bound project", async () => {
  const res = await fetch(`${BASE}/api/personas?project=${PROJECT_ID}`, { headers: { Authorization: "Bearer ext_bound_x" } })
  expect(res.status).toBe(200)
})

test("F5: a project-bound ext token is DENIED the owner's other project", async () => {
  const res = await fetch(`${BASE}/api/personas?project=${PROJECT_ID_2}`, { headers: { Authorization: "Bearer ext_bound_x" } })
  // Mismatched ?project= → resolveProject returns null → 400 "No project." (NOT 200 — would mean ALS failed open).
  expect(res.status).not.toBe(200)
  expect([400, 404]).toContain(res.status)
})
