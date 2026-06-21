import { test, expect, beforeAll } from "bun:test"
import { signImageToken, verifyImageToken } from "./imgsign"

beforeAll(() => {
  // 32-byte base64 key (any value works for HMAC sign/verify symmetry).
  process.env.KLAV_SECRET = Buffer.alloc(32, 7).toString("base64")
})

test("sign → verify round-trips the screenshot id", () => {
  const id = "shot_abc-123"
  const tok = signImageToken(id)
  expect(tok.startsWith(id + ".")).toBe(true)
  expect(verifyImageToken(tok)).toBe(id)
})

test("a tampered signature is rejected", () => {
  const tok = signImageToken("shot_x")
  const tampered = tok.slice(0, -1) + (tok.endsWith("a") ? "b" : "a")
  expect(verifyImageToken(tampered)).toBeNull()
})

test("a tampered id (same sig) is rejected", () => {
  const tok = signImageToken("shot_x")
  const sig = tok.slice(tok.lastIndexOf(".") + 1)
  expect(verifyImageToken("shot_y." + sig)).toBeNull()
})

test("malformed tokens are rejected, not thrown", () => {
  expect(verifyImageToken("")).toBeNull()
  expect(verifyImageToken("nodot")).toBeNull()
  expect(verifyImageToken(".onlysig")).toBeNull()
  expect(verifyImageToken("shot_x.")).toBeNull()
})

test("signatures are unguessable without the key (different key → no verify)", () => {
  const tok = signImageToken("shot_z")
  process.env.KLAV_SECRET = Buffer.alloc(32, 9).toString("base64")
  expect(verifyImageToken(tok)).toBeNull()
  process.env.KLAV_SECRET = Buffer.alloc(32, 7).toString("base64") // restore
})
