// C2: GDPR data export (Art. 15/20) + account erasure (Art. 17). Spawns the real server against a fresh
// temp DB and drives the full login → export → delete flow over HTTP via the session cookie.
import { test, expect, beforeAll, afterAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-gdpr-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  const port = 38000 + Math.floor(Math.random() * 1000)
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

// Log in via OTP and return the session cookie.
async function login(email: string, ip: string): Promise<string> {
  const r1 = await fetch(`${BASE}/api/auth/request`, {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email }),
  })
  const code = (await r1.json()).devCode as string
  const r2 = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, code }),
  })
  expect(r2.status).toBe(200)
  const setCookie = r2.headers.get("set-cookie") || ""
  const m = setCookie.match(/klav_session=([^;]+)/)
  expect(m).toBeTruthy()
  return `klav_session=${m![1]}`
}

test("GET /api/me/export returns the caller's own data; unauthenticated → 401", async () => {
  const email = `export-${ts}@test.local`
  const cookie = await login(email, "198.51.100.10")

  const unauth = await fetch(`${BASE}/api/me/export`)
  expect(unauth.status).toBe(401)

  const r = await fetch(`${BASE}/api/me/export`, { headers: { cookie } })
  expect(r.status).toBe(200)
  const data = await r.json()
  expect(data.email).toBe(email)
  expect(data.account?.email).toBe(email)
  // login bootstraps a default account membership
  expect(Array.isArray(data.accountMemberships)).toBe(true)
  expect(data.accountMemberships.length).toBeGreaterThanOrEqual(1)
  expect(Array.isArray(data.feedback)).toBe(true)
})

test("POST /api/me/delete erases the user; subsequent export no longer finds the account", async () => {
  const email = `delete-${ts}@test.local`
  const cookie = await login(email, "198.51.100.11")

  // Sanity: export shows membership before deletion.
  const before = await fetch(`${BASE}/api/me/export`, { headers: { cookie } })
  expect((await before.json()).accountMemberships.length).toBeGreaterThanOrEqual(1)

  const del = await fetch(`${BASE}/api/me/delete`, { method: "POST", headers: { cookie } })
  expect(del.status).toBe(200)
  const body = await del.json()
  expect(body.ok).toBe(true)
  expect(body.erased).toBe(email)
  // session cookie cleared on self-erase
  expect(del.headers.get("set-cookie") || "").toContain("klav_session=;")

  // The (now-invalid) session cookie no longer authenticates.
  const after = await fetch(`${BASE}/api/me/export`, { headers: { cookie } })
  expect(after.status).toBe(401)

  // Re-login as the same email → brand-new account, no leftover memberships/feedback from before.
  const cookie2 = await login(email, "198.51.100.12")
  const fresh = await fetch(`${BASE}/api/me/export`, { headers: { cookie: cookie2 } })
  const data = await fresh.json()
  expect(data.feedback.length).toBe(0)
})

test("DELETE /api/me erases the caller (alias of POST /api/me/delete)", async () => {
  const email = `delete2-${ts}@test.local`
  const cookie = await login(email, "198.51.100.13")
  const del = await fetch(`${BASE}/api/me`, { method: "DELETE", headers: { cookie } })
  expect(del.status).toBe(200)
  expect((await del.json()).ok).toBe(true)
})
