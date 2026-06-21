// C1: data-retention sweep deletes expired OTPs + sessions (and would purge expired screenshots).
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-retention-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
process.env.KLAV_SECRET = Buffer.from(new Uint8Array(32).fill(3)).toString("base64")

const { db, applySchema, migrateV2, createOtp, createSession, insertScreenshot } = await import("./db")
const { runRetentionSweep } = await import("./retention")

await applySchema(db!)
await migrateV2(db!)

test("sweep deletes expired OTPs but keeps live ones", async () => {
  const now = Date.now()
  await createOtp("expired@test.local", "111111", now - 1000)   // already expired
  await createOtp("live@test.local", "222222", now + 60_000)    // still valid

  const res = await runRetentionSweep(now)
  expect(res.otps).toBeGreaterThanOrEqual(1)

  const expired = await db!.execute({ sql: "SELECT COUNT(*) c FROM login_otps WHERE email=?", args: ["expired@test.local"] })
  const live = await db!.execute({ sql: "SELECT COUNT(*) c FROM login_otps WHERE email=?", args: ["live@test.local"] })
  expect(Number((expired.rows[0] as any).c)).toBe(0)
  expect(Number((live.rows[0] as any).c)).toBe(1)
})

test("sweep deletes expired sessions but keeps live ones", async () => {
  const now = Date.now()
  await createSession("sess_expired_raw", "sx@test.local", now - 1000)
  await createSession("sess_live_raw", "sl@test.local", now + 60_000)

  const res = await runRetentionSweep(now)
  expect(res.sessions).toBeGreaterThanOrEqual(1)

  const expired = await db!.execute({ sql: "SELECT COUNT(*) c FROM sessions WHERE email=?", args: ["sx@test.local"] })
  const live = await db!.execute({ sql: "SELECT COUNT(*) c FROM sessions WHERE email=?", args: ["sl@test.local"] })
  expect(Number((expired.rows[0] as any).c)).toBe(0)
  expect(Number((live.rows[0] as any).c)).toBe(1)
})

test("sweep leaves un-expired and NULL-expiry screenshots untouched", async () => {
  const now = Date.now()
  // expires_at NULL → never expires; expires_at in the future → not yet expired. Neither should be
  // deleted, so deleteObject (which needs S3 config) is never called.
  await insertScreenshot({ projectId: "proj_x", s3Key: "uploads/keep-null.png", bucket: "b", contentType: "image/png", expiresAt: null })
  await insertScreenshot({ projectId: "proj_x", s3Key: "uploads/keep-future.png", bucket: "b", contentType: "image/png", expiresAt: now + 60_000 })

  const res = await runRetentionSweep(now)
  expect(res.screenshots).toBe(0)

  const cnt = await db!.execute({ sql: "SELECT COUNT(*) c FROM screenshots", args: [] })
  expect(Number((cnt.rows[0] as any).c)).toBe(2)
})
