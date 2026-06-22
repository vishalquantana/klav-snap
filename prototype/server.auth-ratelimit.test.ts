// H1: OTP throttling at the HTTP layer. Spawns the real server against a fresh temp DB (the server's
// initDb builds the full schema on boot) and drives the auth flow over HTTP. Each test uses a distinct
// X-Forwarded-For IP + email so the per-process rate-limit windows don't bleed across cases.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-authrl-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  const port = 31000 + Math.floor(Math.random() * 1000)
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
})

afterAll(() => serverProc?.kill())

// Distinct source IP per test isolates the per-IP window; distinct email isolates the per-email window.
function reqCode(email: string, ip: string) {
  return fetch(`${BASE}/api/auth/request`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email }),
  })
}
function verify(email: string, code: string, ip: string) {
  return fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, code }),
  })
}

test("OTP request is throttled per email after 5 in the window (H1)", async () => {
  const email = `rl-req-${ts}@test.local`
  const ip = "203.0.113.1"
  for (let i = 0; i < 5; i++) {
    const r = await reqCode(email, ip)
    expect(r.status).toBe(200)
  }
  const sixth = await reqCode(email, ip)
  expect(sixth.status).toBe(429)
  expect(sixth.headers.get("retry-after")).toBe("900")
})

test("OTP verify locks out after 5 wrong codes for an (email,IP) (H1)", async () => {
  const email = `rl-lock-${ts}@test.local`
  const ip = "203.0.113.2"
  await reqCode(email, ip) // a real code exists; we deliberately send wrong ones
  for (let i = 0; i < 5; i++) {
    const r = await verify(email, "000000", ip)
    expect(r.status).toBe(401) // invalid code
  }
  const locked = await verify(email, "000000", ip)
  expect(locked.status).toBe(429)
  expect(locked.headers.get("retry-after")).toBe("900")
})

test("a fresh OTP request invalidates the prior code (M1)", async () => {
  const email = `rl-m1-${ts}@test.local`
  const ip = "203.0.113.3"
  const r1 = await reqCode(email, ip)
  const code1 = (await r1.json()).devCode as string
  const r2 = await reqCode(email, ip)
  const code2 = (await r2.json()).devCode as string
  expect(code1).toBeTruthy(); expect(code2).toBeTruthy()
  // Old code must no longer verify…
  const old = await verify(email, code1, ip)
  expect(old.status).toBe(401)
  // …the newest one does (and clears any failure counter).
  const fresh = await verify(email, code2, ip)
  expect(fresh.status).toBe(200)
  expect((await fresh.json()).ok).toBe(true)
})

test("successful verify clears the failure counter (H1)", async () => {
  const email = `rl-clear-${ts}@test.local`
  const ip = "203.0.113.4"
  const r1 = await reqCode(email, ip)
  const code = (await r1.json()).devCode as string
  // 4 wrong (below the 5 lockout threshold)…
  for (let i = 0; i < 4; i++) expect((await verify(email, "111111", ip)).status).toBe(401)
  // …then a correct one succeeds and resets the counter.
  const ok = await verify(email, code, ip)
  expect(ok.status).toBe(200)
})
