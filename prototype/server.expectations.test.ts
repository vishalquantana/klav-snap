// Layer E — Expectations graduation endpoints (enforce/confirm/retire) via subprocess-server harness.
// Mirrors server.trails.test.ts exactly: a dedicated temp DB seeded via a RAW createClient (never
// the shared db singleton), the server subprocess spawned against the same file: DB, and HTTP hits with
// a klav_session cookie. The /enforce route calls OpenRouter — that route is NOT exercised here.
// We only test: GET expectations, POST enforce/confirm (hand-built draft), and POST retire.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-expectations-srv-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
async function rawExec(sql: string, args: any[] = []) { await rawClient.execute({ sql, args }) }

// ── Schema (mirrors applySchema/migrateV2 DDL — only tables this suite needs) ──
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS trails (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, intent TEXT NOT NULL DEFAULT '', base_url TEXT NOT NULL, baseline_ref TEXT, author_kind TEXT NOT NULL DEFAULT 'human', status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS trail_runs (id TEXT PRIMARY KEY, trail_id TEXT NOT NULL, project_id TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'running', llm_calls INTEGER NOT NULL DEFAULT 0, summary_json TEXT, started_at INTEGER NOT NULL, finished_at INTEGER)`)
await rawExec(`CREATE TABLE IF NOT EXISTS trail_steps (id TEXT PRIMARY KEY, trail_id TEXT NOT NULL, project_id TEXT NOT NULL, idx INTEGER NOT NULL, action TEXT NOT NULL, action_value TEXT, target_json TEXT, checkpoint_json TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, run_id TEXT NOT NULL, step_id TEXT, trail_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, evidence_json TEXT, ground_quote TEXT, confidence REAL NOT NULL DEFAULT 0, dedup_key TEXT NOT NULL, recurrence INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'queued', connector_ref TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS run_steps (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, trail_id TEXT NOT NULL, step_id TEXT NOT NULL, project_id TEXT NOT NULL, idx INTEGER NOT NULL, tier TEXT NOT NULL DEFAULT 'none', verdict TEXT NOT NULL DEFAULT 'skip', confidence REAL NOT NULL DEFAULT 0, diagnosis TEXT, healed INTEGER NOT NULL DEFAULT 0, evidence_json TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS walk_replays (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, project_id TEXT NOT NULL, segments_gz TEXT NOT NULL, n_segments INTEGER, n_events INTEGER, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS expectations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  area TEXT,
  url_path TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  corroboration_json TEXT NOT NULL DEFAULT '{}',
  dedup_key TEXT NOT NULL,
  enforced_step_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`)

// ── Fixtures ─────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = `admin-${ts}@test.local`
const ADMIN_SID = `sess_admin_${ts}`
const ACCOUNT_ID = `acct_${ts}`
const PROJECT_ID = `proj_${ACCOUNT_ID}`
const TRAIL_ID = `trl_${ts}`
const STEP_ID = `ts_seed_${ts}`
const STEP_ID_1 = `ts_seed1_${ts}`
const EXP_VALIDATED_ID = `exp_val_${ts}`
const EXP_RETIRE_ID = `exp_ret_${ts}`
const EXP_ENFORCED_ID = `exp_enf_${ts}`
const ENFORCED_STEP_ID = `ts_enforced_seed_${ts}`
const NOW = Date.now()

// Users, account, project, session
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Test Workspace", ADMIN_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_${ACCOUNT_ID}`, ACCOUNT_ID, ADMIN_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Default Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_admin_${ts}`, PROJECT_ID, ADMIN_EMAIL, "admin", null, NOW])
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [ADMIN_SID, ADMIN_EMAIL, NOW, NOW + 86400_000])

// A trail with two steps (idx 0 and 1) for idx-ordering tests
await rawExec(`INSERT INTO trails (id, project_id, name, intent, base_url, author_kind, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [TRAIL_ID, PROJECT_ID, "Checkout", "log in and check out", "https://shop.test", "human", "active", ADMIN_EMAIL, NOW, NOW])
await rawExec(`INSERT INTO trail_steps (id, trail_id, project_id, idx, action, action_value, target_json, checkpoint_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [STEP_ID, TRAIL_ID, PROJECT_ID, 0, "click", null, JSON.stringify({ role: "button", name: "Checkout" }), null, NOW])
await rawExec(`INSERT INTO trail_steps (id, trail_id, project_id, idx, action, action_value, target_json, checkpoint_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [STEP_ID_1, TRAIL_ID, PROJECT_ID, 1, "navigate", "https://shop.test/confirm", null, null, NOW])

// A pre-enforced step for the retire-removes-step test
await rawExec(`INSERT INTO trail_steps (id, trail_id, project_id, idx, action, action_value, target_json, checkpoint_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [ENFORCED_STEP_ID, TRAIL_ID, PROJECT_ID, 99, "assert", null, JSON.stringify({ role: "button", name: "Cart" }), JSON.stringify({ kind: "visible", description: "Cart count visible" }), NOW])

// A validated expectation (to test enforce/confirm)
await rawExec(
  `INSERT INTO expectations (id, project_id, title, area, url_path, status, source_refs_json, corroboration_json, dedup_key, enforced_step_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [EXP_VALIDATED_ID, PROJECT_ID, "Finish button must be visible after checkout", "checkout", "/checkout", "validated",
   JSON.stringify([{ kind: "snap", id: "snap1" }, { kind: "sim", id: "sim1" }]),
   JSON.stringify({ snap: true, sim: true, recurrence: 0 }),
   `dedup_val_${ts}`, null, NOW, NOW]
)

// A second validated expectation (to test retire — no enforced step)
await rawExec(
  `INSERT INTO expectations (id, project_id, title, area, url_path, status, source_refs_json, corroboration_json, dedup_key, enforced_step_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [EXP_RETIRE_ID, PROJECT_ID, "Cart count must be visible in header", "cart", "/cart", "validated",
   JSON.stringify([{ kind: "snap", id: "snap2" }, { kind: "sim", id: "sim2" }]),
   JSON.stringify({ snap: true, sim: true, recurrence: 0 }),
   `dedup_ret_${ts}`, null, NOW, NOW]
)

// A pre-enforced expectation (to test retire removes the trail step)
await rawExec(
  `INSERT INTO expectations (id, project_id, title, area, url_path, status, source_refs_json, corroboration_json, dedup_key, enforced_step_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [EXP_ENFORCED_ID, PROJECT_ID, "Cart badge must be visible in header", "cart", "/cart", "enforced",
   JSON.stringify([{ kind: "snap", id: "snap3" }, { kind: "sim", id: "sim3" }]),
   JSON.stringify({ snap: true, sim: true, recurrence: 0 }),
   `dedup_enf_${ts}`, ENFORCED_STEP_ID, NOW, NOW]
)

// ── Spawn the server ──────────────────────────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  serverPort = 33000 + Math.floor(Math.random() * 1000)
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

test("GET /api/expectations?status=validated returns the seeded validated expectation", async () => {
  const r = await api("GET", `/api/expectations?project=${PROJECT_ID}&status=validated`, null, ADMIN_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(Array.isArray(b.expectations)).toBe(true)
  expect(b.expectations.some((e: any) => e.id === EXP_VALIDATED_ID)).toBe(true)
  expect(b.expectations.some((e: any) => e.id === EXP_RETIRE_ID)).toBe(true)
  expect(b.expectations.every((e: any) => e.status === "validated")).toBe(true)
})

test("GET /api/expectations is 401 without a session", async () => {
  const r = await fetch(`${BASE}/api/expectations?project=${PROJECT_ID}`)
  expect(r.status).toBe(401)
})

test("GET /api/expectations returns all expectations when no status filter", async () => {
  const r = await api("GET", `/api/expectations?project=${PROJECT_ID}`, null, ADMIN_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(Array.isArray(b.expectations)).toBe(true)
  expect(b.expectations.length).toBeGreaterThanOrEqual(2)
})

test("POST /api/expectations/:id/enforce/confirm writes an assert step and flips status to enforced", async () => {
  // Hand-built valid draft (no network call needed)
  const draft = {
    trailId: TRAIL_ID,
    afterStepIdx: 0,
    action: "assert",
    target: { role: "button", name: "Finish" },
    checkpoint: { kind: "visible", description: "Finish button is visible after checkout" },
  }

  const r = await api("POST", `/api/expectations/${EXP_VALIDATED_ID}/enforce/confirm?project=${PROJECT_ID}`, { draft }, ADMIN_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(typeof b.stepId).toBe("string")
  expect(b.stepId).toMatch(/^ts_/)

  // Verify the trail_steps row was inserted with action='assert' and checkpoint_json containing "visible"
  const stepRow = await rawClient.execute({ sql: "SELECT * FROM trail_steps WHERE id=?", args: [b.stepId] })
  expect(stepRow.rows.length).toBe(1)
  const step = stepRow.rows[0] as any
  expect(step.action).toBe("assert")
  expect(step.checkpoint_json).toContain("visible")
  expect(step.trail_id).toBe(TRAIL_ID)
  expect(step.project_id).toBe(PROJECT_ID)
  expect(Number(step.idx)).toBe(1) // afterStepIdx 0 → idx 1

  // Verify target_json
  const target = JSON.parse(step.target_json)
  expect(target.role).toBe("button")
  expect(target.name).toBe("Finish")
})

test("GET /api/expectations?status=enforced includes the expectation after confirm", async () => {
  const r = await api("GET", `/api/expectations?project=${PROJECT_ID}&status=enforced`, null, ADMIN_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(Array.isArray(b.expectations)).toBe(true)
  expect(b.expectations.some((e: any) => e.id === EXP_VALIDATED_ID)).toBe(true)
  const exp = b.expectations.find((e: any) => e.id === EXP_VALIDATED_ID)
  expect(exp.status).toBe("enforced")
  expect(typeof exp.enforcedStepId).toBe("string")
})

test("POST /api/expectations/:id/enforce/confirm with invalid draft returns 400", async () => {
  // Missing action field → validateAssertionDraft returns null
  const r = await api("POST", `/api/expectations/${EXP_RETIRE_ID}/enforce/confirm?project=${PROJECT_ID}`, { draft: { trailId: TRAIL_ID, afterStepIdx: 0 } }, ADMIN_SID)
  expect(r.status).toBe(400)
})

test("POST /api/expectations/:id/enforce/confirm a second time returns 409", async () => {
  // The EXP_VALIDATED_ID was already confirmed in an earlier test, so it is now status='enforced'.
  // Try to confirm it again with a valid draft — should reject with 409.
  const draft = {
    trailId: TRAIL_ID,
    afterStepIdx: 0,
    action: "assert",
    target: { role: "button", name: "Retry" },
    checkpoint: { kind: "visible", description: "Retry button is visible" },
  }
  const r = await api("POST", `/api/expectations/${EXP_VALIDATED_ID}/enforce/confirm?project=${PROJECT_ID}`, { draft }, ADMIN_SID)
  expect(r.status).toBe(409)
  expect((await r.json()).error).toBe("not validated")
})

test("POST /api/expectations/:id/retire flips status to retired", async () => {
  const r = await api("POST", `/api/expectations/${EXP_RETIRE_ID}/retire?project=${PROJECT_ID}`, {}, ADMIN_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(b.ok).toBe(true)

  // Verify status in DB
  const row = await rawClient.execute({ sql: "SELECT status FROM expectations WHERE id=?", args: [EXP_RETIRE_ID] })
  expect(String((row.rows[0] as any).status)).toBe("retired")
})

test("GET /api/expectations?status=retired includes the retired expectation", async () => {
  const r = await api("GET", `/api/expectations?project=${PROJECT_ID}&status=retired`, null, ADMIN_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(Array.isArray(b.expectations)).toBe(true)
  expect(b.expectations.some((e: any) => e.id === EXP_RETIRE_ID)).toBe(true)
})

test("POST /api/expectations/:id/enforce/confirm is 404 for a non-existent expectation", async () => {
  const draft = {
    trailId: TRAIL_ID,
    afterStepIdx: 0,
    action: "assert",
    target: { role: "button", name: "Finish" },
    checkpoint: { kind: "visible", description: "Finish visible" },
  }
  const r = await api("POST", `/api/expectations/exp_nope_${ts}/enforce/confirm?project=${PROJECT_ID}`, { draft }, ADMIN_SID)
  expect(r.status).toBe(404)
})

test("POST /api/expectations/:id/retire is 401 without a session", async () => {
  const r = await fetch(`${BASE}/api/expectations/${EXP_RETIRE_ID}/retire?project=${PROJECT_ID}`, { method: "POST" })
  expect(r.status).toBe(401)
})

test("idx ordering on graduation: afterStepIdx:0 shifts existing idx-1 step to idx-2, new step at idx-1, no duplicate idx", async () => {
  // EXP_VALIDATED_ID was already confirmed in earlier tests — use a fresh validated expectation
  const EXP_IDX_ID = `exp_idx_${ts}`
  await rawClient.execute({
    sql: `INSERT INTO expectations (id, project_id, title, area, url_path, status, source_refs_json, corroboration_json, dedup_key, enforced_step_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [EXP_IDX_ID, PROJECT_ID, "Idx ordering test expectation", "test", "/test", "validated",
      JSON.stringify([{ kind: "snap", id: "snap_idx" }]),
      JSON.stringify({ snap: true, sim: false, recurrence: 0 }),
      `dedup_idx_${ts}`, null, NOW, NOW],
  })
  const draft = {
    trailId: TRAIL_ID,
    afterStepIdx: 0,
    action: "assert",
    target: { role: "button", name: "Order Summary" },
    checkpoint: { kind: "visible", description: "Order Summary visible after click" },
  }
  const r = await api("POST", `/api/expectations/${EXP_IDX_ID}/enforce/confirm?project=${PROJECT_ID}`, { draft }, ADMIN_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(typeof b.stepId).toBe("string")

  // Query all steps for this trail ordered by idx
  const stepsRes = await rawClient.execute({ sql: "SELECT id, idx FROM trail_steps WHERE trail_id=? AND project_id=? ORDER BY idx ASC", args: [TRAIL_ID, PROJECT_ID] })
  const steps = stepsRes.rows as any[]

  // The new assert step should be at idx 1
  const newStep = steps.find((s: any) => s.id === b.stepId)
  expect(newStep).toBeDefined()
  expect(Number(newStep.idx)).toBe(1)

  // The originally-idx-1 step (STEP_ID_1) must have shifted to idx 2
  const shiftedStep = steps.find((s: any) => s.id === STEP_ID_1)
  expect(shiftedStep).toBeDefined()
  expect(Number(shiftedStep.idx)).toBeGreaterThanOrEqual(2)

  // No two steps share an idx
  const idxValues = steps.map((s: any) => Number(s.idx))
  const uniqueIdxValues = new Set(idxValues)
  expect(uniqueIdxValues.size).toBe(idxValues.length)
})

test("foreign trailId in enforce/confirm returns 422", async () => {
  // Seed a fresh validated expectation to avoid 409 from a prior confirm
  const EXP_FOREIGN_ID = `exp_foreign_${ts}`
  await rawClient.execute({
    sql: `INSERT INTO expectations (id, project_id, title, area, url_path, status, source_refs_json, corroboration_json, dedup_key, enforced_step_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [EXP_FOREIGN_ID, PROJECT_ID, "Foreign trail test expectation", "test", "/test", "validated",
      JSON.stringify([{ kind: "snap", id: "snap_foreign" }]),
      JSON.stringify({ snap: true, sim: false, recurrence: 0 }),
      `dedup_foreign_${ts}`, null, NOW, NOW],
  })
  const draft = {
    trailId: "trl_nonexistent_foreign_garbage",
    afterStepIdx: 0,
    action: "assert",
    target: { role: "button", name: "Pay" },
    checkpoint: { kind: "visible", description: "Pay button visible" },
  }
  const r = await api("POST", `/api/expectations/${EXP_FOREIGN_ID}/enforce/confirm?project=${PROJECT_ID}`, { draft }, ADMIN_SID)
  expect(r.status).toBe(422)
  const b = await r.json()
  expect(b.error).toBe("trail not found")
})

test("retire removes the enforced trail step from trail_steps", async () => {
  // Verify the enforced step exists before retire
  const beforeRes = await rawClient.execute({ sql: "SELECT id FROM trail_steps WHERE id=? AND project_id=?", args: [ENFORCED_STEP_ID, PROJECT_ID] })
  expect(beforeRes.rows.length).toBe(1)

  const r = await api("POST", `/api/expectations/${EXP_ENFORCED_ID}/retire?project=${PROJECT_ID}`, {}, ADMIN_SID)
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)

  // The enforced step should be gone
  const afterRes = await rawClient.execute({ sql: "SELECT id FROM trail_steps WHERE id=? AND project_id=?", args: [ENFORCED_STEP_ID, PROJECT_ID] })
  expect(afterRes.rows.length).toBe(0)

  // The expectation should be retired
  const expRes = await rawClient.execute({ sql: "SELECT status FROM expectations WHERE id=?", args: [EXP_ENFORCED_ID] })
  expect(String((expRes.rows[0] as any).status)).toBe("retired")
})
