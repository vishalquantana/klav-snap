import { afterAll, beforeAll, expect, test } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { unlinkSync } from "node:fs"

const RUN = `${Date.now()}-${randomUUID()}`
const DB_FILE = join(tmpdir(), `klav-sim-review-gates-${RUN}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(63)).toString("base64")

function rmDb() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(DB_FILE + suffix) } catch {}
  }
}
rmDb()

const rawClient = createClient({ url: "file:" + DB_FILE })
await rawClient.execute("PRAGMA journal_mode=WAL")
await rawClient.execute("PRAGMA busy_timeout=5000")

async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

const OWNER_EMAIL = `owner-gates-${RUN}@test.local`
const OUTSIDER_EMAIL = `outsider-gates-${RUN}@test.local`
const OWNER_SID = `sess_owner_gates_${RUN}`
const OUTSIDER_SID = `sess_outsider_gates_${RUN}`
const ACCOUNT_ID = `acct_gates_${RUN}`
const PROJECT_ID = `proj_gates_${RUN}`
const ZERO_BUDGET_PROJECT_ID = `proj_gates_zero_budget_${RUN}`
const SIM_ID = `sim_gates_${RUN}`
const NOW = Date.now()
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

async function seed() {
  await rawExec("INSERT INTO users (email, created_at) VALUES (?, ?)", [OWNER_EMAIL, NOW])
  await rawExec("INSERT INTO users (email, created_at) VALUES (?, ?)", [OUTSIDER_EMAIL, NOW])
  await rawExec("INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)", [OWNER_SID, OWNER_EMAIL, NOW, NOW + 86_400_000])
  await rawExec("INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)", [OUTSIDER_SID, OUTSIDER_EMAIL, NOW, NOW + 86_400_000])

  await rawExec("INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)", [ACCOUNT_ID, "Sim Review Gates", OWNER_EMAIL, NOW])
  await rawExec("INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)", [`am_gates_${RUN}`, ACCOUNT_ID, OWNER_EMAIL, "owner", NOW])

  for (const [projectId, budget] of [[PROJECT_ID, 100], [ZERO_BUDGET_PROJECT_ID, 0]] as const) {
    await rawExec(
      "INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [projectId, ACCOUNT_ID, "Gate Project", "active", "auto", budget, "named", NOW, NOW],
    )
    await rawExec("INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", [`pm_${projectId}`, projectId, OWNER_EMAIL, "admin", null, NOW])
    await rawExec("INSERT INTO monitored_urls (id, project_id, url_pattern, enabled, created_at) VALUES (?, ?, ?, ?, ?)", [`mon_${projectId}`, projectId, "allowed.test/*", 1, NOW])
    await rawExec("INSERT INTO monitoring_consent (id, project_id, email, status, granted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [`con_${projectId}`, projectId, OWNER_EMAIL, "granted", NOW, NOW])
    await rawExec(
      "INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [`${SIM_ID}_${budget}`, projectId, "Gate Sim", "Buyer", "client", "GS", "#6366f1", "Reviews gated pages.", "[]", NOW, NOW],
    )
  }
}

beforeAll(async () => {
  const port = 44000 + Math.floor(Math.random() * 1000)
  BASE = `http://localhost:${port}`

  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: "file:" + DB_FILE,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET,
      KLAV_BASE_URL: BASE,
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
    const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
    if (r && r.status < 500) break
    await Bun.sleep(150)
  }

  await seed()
})

afterAll(() => {
  serverProc?.kill()
  rawClient.close()
  rmDb()
})

function reviewBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    projectId: PROJECT_ID,
    url: "https://allowed.test/pricing",
    screenshotDataUrl: TINY_PNG,
    domSig: `dom-${RUN}`,
    ...overrides,
  })
}

async function postReview(cookie: string | null, overrides: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (cookie) headers.Cookie = `klav_session=${cookie}`
  const res = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers,
    body: reviewBody(overrides),
  })
  return { res, body: await res.json() }
}

test("gate order: auth blocks first with unauthorized", async () => {
  const { res, body } = await postReview(null, {
    projectId: PROJECT_ID,
    url: "https://blocked.test/nope",
  })

  expect(res.status).toBe(401)
  expect(body).toMatchObject({ ok: false, reason: "unauthorized" })
})

test("gate order: project access failure resolves as unauthorized before passive gates", async () => {
  const { res, body } = await postReview(OUTSIDER_SID, {
    projectId: PROJECT_ID,
    url: "https://blocked.test/nope",
  })

  expect(res.status).toBe(401)
  expect(body).toMatchObject({ ok: false, reason: "unauthorized" })
})

test("gate order: consent blocks before allowlist, dedupe, and budget", async () => {
  await rawExec("UPDATE monitoring_consent SET status='revoked' WHERE project_id=? AND email=?", [PROJECT_ID, OWNER_EMAIL])
  const { res, body } = await postReview(OWNER_SID, {
    url: "https://blocked.test/nope",
  })
  await rawExec("UPDATE monitoring_consent SET status='granted' WHERE project_id=? AND email=?", [PROJECT_ID, OWNER_EMAIL])

  expect(res.status).toBe(423)
  expect(body).toMatchObject({ ok: false, reason: "userPaused" })
})

test("gate order: missing granted consent returns needsConsent before allowlist", async () => {
  await rawExec("DELETE FROM monitoring_consent WHERE project_id=? AND email=?", [PROJECT_ID, OWNER_EMAIL])
  const { res, body } = await postReview(OWNER_SID, {
    url: "https://blocked.test/nope",
  })
  await rawExec("INSERT INTO monitoring_consent (id, project_id, email, status, granted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [`con_restore_${RUN}`, PROJECT_ID, OWNER_EMAIL, "granted", NOW, Date.now()])

  expect(res.status).toBe(412)
  expect(body).toMatchObject({ ok: false, reason: "needsConsent" })
})

test("gate order: allowlist blocks before budget and review work", async () => {
  const { res, body } = await postReview(OWNER_SID, {
    url: "https://blocked.test/nope",
  })

  expect(res.status).toBe(403)
  expect(body).toMatchObject({ ok: false, reason: "offAllowlist" })
})

test("gate order: budget is last and returns budgetExhausted after earlier gates pass", async () => {
  const { res, body } = await postReview(OWNER_SID, {
    projectId: ZERO_BUDGET_PROJECT_ID,
    url: "https://allowed.test/pricing",
  })

  expect(res.status).toBe(429)
  expect(body).toMatchObject({ ok: false, reason: "budgetExhausted" })
})
