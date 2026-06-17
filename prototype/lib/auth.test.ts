import { test, expect } from "bun:test"
import { isOpsAdmin } from "./auth"

test("isOpsAdmin: allowlist membership is case-insensitive, trims spaces", () => {
  process.env.OPS_ADMIN_EMAILS = "vishal@quantana.com.au, dev2@quantana.com.au"
  expect(isOpsAdmin("vishal@quantana.com.au")).toBe(true)
  expect(isOpsAdmin("VISHAL@Quantana.com.AU")).toBe(true)
  expect(isOpsAdmin("dev2@quantana.com.au")).toBe(true)
  expect(isOpsAdmin("random@quantana.com.au")).toBe(false)
  expect(isOpsAdmin(null)).toBe(false)
  expect(isOpsAdmin(undefined)).toBe(false)
  expect(isOpsAdmin("")).toBe(false)
})

test("isOpsAdmin: empty/unset list → nobody is ops admin (fail closed)", () => {
  process.env.OPS_ADMIN_EMAILS = ""
  expect(isOpsAdmin("vishal@quantana.com.au")).toBe(false)
})
