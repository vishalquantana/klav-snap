// E1/E2: bearer credentials (session ids, extension tokens) and OTP codes are stored HASHED at rest,
// never as the raw value, while lookups still resolve the raw credential the client presents.
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-tokhash-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
process.env.KLAV_SECRET = Buffer.from(new Uint8Array(32).fill(9)).toString("base64")

const {
  db,
  applySchema,
  migrateV2,
  createSession,
  getSession,
  deleteSession,
  issueExtensionToken,
  getExtensionTokenInfo,
  revokeExtensionToken,
  createOtp,
  verifyOtp,
} = await import("./db")
const { sha256hex } = await import("./crypto")

await applySchema(db!)
await migrateV2(db!)

test("E1 sessions: stored id is sha256(raw), raw still resolves, logout deletes", async () => {
  const raw = "sess_raw_abc123"
  await createSession(raw, "u@test.local", Date.now() + 60_000)

  // Stored value is the hash, NOT the raw token.
  const r = await db!.execute({ sql: "SELECT id FROM sessions WHERE email=?", args: ["u@test.local"] })
  expect(r.rows.length).toBe(1)
  expect(String((r.rows[0] as any).id)).toBe(sha256hex(raw))
  expect(String((r.rows[0] as any).id)).not.toBe(raw)

  // Raw token still resolves (client presents raw).
  expect(await getSession(raw)).toBe("u@test.local")

  // Logout (presents raw) deletes the hashed row.
  await deleteSession(raw)
  expect(await getSession(raw)).toBeNull()
})

test("E1 sessions: dual-read fallback resolves a legacy plaintext row", async () => {
  // Simulate a pre-E1 row stored as raw plaintext.
  const legacyRaw = "legacy_plain_sess"
  await db!.execute({ sql: "INSERT INTO sessions (id,email,created_at,expires_at) VALUES (?,?,?,?)", args: [legacyRaw, "legacy@test.local", Date.now(), Date.now() + 60_000] })
  expect(await getSession(legacyRaw)).toBe("legacy@test.local")
  // logout still clears the legacy row
  await deleteSession(legacyRaw)
  expect(await getSession(legacyRaw)).toBeNull()
})

test("E1 extension tokens: stored token is hashed, raw resolves, revoke works", async () => {
  const raw = await issueExtensionToken("ext@test.local", "proj_x", 60_000)
  expect(raw.startsWith("ext_")).toBe(true)

  const r = await db!.execute({ sql: "SELECT token FROM extension_tokens WHERE email=?", args: ["ext@test.local"] })
  expect(r.rows.length).toBe(1)
  expect(String((r.rows[0] as any).token)).toBe(sha256hex(raw))
  expect(String((r.rows[0] as any).token)).not.toBe(raw)

  const info = await getExtensionTokenInfo(raw)
  expect(info?.email).toBe("ext@test.local")
  expect(info?.projectId).toBe("proj_x")

  await revokeExtensionToken(raw)
  expect(await getExtensionTokenInfo(raw)).toBeNull()
})

test("E2 OTP: stored code is hashed; verify matches hashed input, single-use", async () => {
  const email = "otp@test.local"
  await createOtp(email, "123456", Date.now() + 60_000)

  const r = await db!.execute({ sql: "SELECT code FROM login_otps WHERE email=? AND used=0", args: [email] })
  expect(r.rows.length).toBe(1)
  expect(String((r.rows[0] as any).code)).toBe(sha256hex("123456"))
  expect(String((r.rows[0] as any).code)).not.toBe("123456")

  // Wrong code fails.
  expect(await verifyOtp(email, "000000")).toBe(false)
  // Correct code succeeds once…
  expect(await verifyOtp(email, "123456")).toBe(true)
  // …then is consumed (single-use).
  expect(await verifyOtp(email, "123456")).toBe(false)
})
