// server.test-otp.test.ts
// Security gate tests for the KLAV_TEST_OTP bypass.
//
// Gating contract (must hold or fail loudly):
//   ACCEPTED only when ALL THREE hold simultaneously:
//     1. KLAV_TEST_OTP env var is set (truthy)
//     2. code presented is exactly "666666"
//     3. email is listed in KLAV_TEST_OTP_EMAILS (comma-separated)
//   REJECTED (→ 401, normal OTP path) when ANY condition fails:
//     - KLAV_TEST_OTP unset / falsy
//     - email not in allowlist
//     - code ≠ "666666" (even with KLAV_TEST_OTP set + allowlisted email)

import { test, expect, beforeAll, afterAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unlinkSync } from "node:fs"

const RUN = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const ALLOWED_EMAIL = `otp-allowed-${RUN}@test.local`
const BLOCKED_EMAIL = `otp-blocked-${RUN}@test.local`
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(77)).toString("base64")
const TEST_OTP_CODE = "666666"
const BASE_PORT_ON = 38100 + Math.floor(Math.random() * 200)
const BASE_PORT_OFF = 38300 + Math.floor(Math.random() * 200)

function rmDb(f: string) {
  for (const s of ["", "-wal", "-shm"]) { try { unlinkSync(f + s) } catch {} }
}

// ── Server A: KLAV_TEST_OTP=1 with one allowlisted email ─────────────────────
const dbOn = join(tmpdir(), `klav-testotp-on-${RUN}.db`)
let srvOn: ReturnType<typeof Bun.spawn>
let BASE_ON: string

// ── Server B: no KLAV_TEST_OTP set (production-like) ─────────────────────────
const dbOff = join(tmpdir(), `klav-testotp-off-${RUN}.db`)
let srvOff: ReturnType<typeof Bun.spawn>
let BASE_OFF: string

beforeAll(async () => {
  rmDb(dbOn); rmDb(dbOff)
  BASE_ON = `http://localhost:${BASE_PORT_ON}`
  BASE_OFF = `http://localhost:${BASE_PORT_OFF}`

  const commonEnv = {
    ...process.env,
    TURSO_AUTH_TOKEN: "",
    KLAV_SECRET: TEST_SECRET,
    KLAV_DEV_SHOW_OTP: "1",
    SENDGRID_API_KEY: "",
    KLAV_MAIL_FROM: "",
    OPENROUTER_API_KEY: "test-key",
    KLAV_ALLOWED_DOMAINS: "test.local",
  }

  srvOn = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...commonEnv,
      PORT: String(BASE_PORT_ON),
      TURSO_DATABASE_URL: "file:" + dbOn,
      KLAV_BASE_URL: BASE_ON,
      KLAV_TEST_OTP: "1",
      KLAV_TEST_OTP_EMAILS: `${ALLOWED_EMAIL}, extra@test.local`,  // allowlist with whitespace
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  srvOff = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...commonEnv,
      PORT: String(BASE_PORT_OFF),
      TURSO_DATABASE_URL: "file:" + dbOff,
      KLAV_BASE_URL: BASE_OFF,
      // KLAV_TEST_OTP intentionally absent — must not accept 666666
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  // Wait for both servers to be ready.
  const ready = async (base: string) => {
    const dl = Date.now() + 12_000
    while (Date.now() < dl) {
      const r = await fetch(`${base}/favicon.svg`).catch(() => null)
      if (r && r.status < 500) return
      await Bun.sleep(150)
    }
    throw new Error(`server ${base} did not start in time`)
  }
  await Promise.all([ready(BASE_ON), ready(BASE_OFF)])
})

afterAll(() => {
  srvOn?.kill(); srvOff?.kill()
  rmDb(dbOn); rmDb(dbOff)
})

function verify(base: string, email: string, code: string) {
  return fetch(`${base}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.2" },
    body: JSON.stringify({ email, code }),
  })
}
function request(base: string, email: string) {
  return fetch(`${base}/api/auth/request`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.2" },
    body: JSON.stringify({ email }),
  })
}

// ── ACCEPT cases (KLAV_TEST_OTP=1, allowlisted email, correct code) ──────────

test("test OTP 666666 is accepted for an allowlisted email when KLAV_TEST_OTP=1", async () => {
  const r = await verify(BASE_ON, ALLOWED_EMAIL, TEST_OTP_CODE)
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.ok).toBe(true)
  // returns a redirect + session cookie — same shape as a normal successful verify
  expect(body.redirect).toMatch(/\/(dashboard|onboarding)/)
  expect(r.headers.get("set-cookie")).toContain("klav_session=")
})

test("allowlist parsing trims whitespace — second email in list also works", async () => {
  const r = await verify(BASE_ON, "extra@test.local", TEST_OTP_CODE)
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)
})

// ── REJECT cases — each must be treated as invalid (401) ─────────────────────

test("666666 is REJECTED for a non-allowlisted email even when KLAV_TEST_OTP=1", async () => {
  const r = await verify(BASE_ON, BLOCKED_EMAIL, TEST_OTP_CODE)
  expect(r.status).toBe(401)
  const body = await r.json()
  expect(body.ok).toBeUndefined()
  expect(body.error).toBeTruthy()
})

test("666666 is REJECTED when KLAV_TEST_OTP is NOT set (production-like server)", async () => {
  // The production server has no test OTP env — 666666 must be a normal wrong code.
  const r = await verify(BASE_OFF, ALLOWED_EMAIL, TEST_OTP_CODE)
  expect(r.status).toBe(401)
})

test("a non-666666 code is rejected for an allowlisted email even when KLAV_TEST_OTP=1 (bypass is code-specific)", async () => {
  // First get a real OTP so the email's request is valid.
  await request(BASE_ON, ALLOWED_EMAIL)
  const r = await verify(BASE_ON, ALLOWED_EMAIL, "123456")
  expect(r.status).toBe(401)
})

test("normal OTP flow still works on the KLAV_TEST_OTP=1 server (bypass doesn't break real auth)", async () => {
  const email = `otp-normal-${RUN}@test.local`
  const reqR = await request(BASE_ON, email)
  expect(reqR.status).toBe(200)
  const { devCode } = await reqR.json()
  expect(devCode).toBeTruthy()
  const r = await verify(BASE_ON, email, devCode)
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)
})
