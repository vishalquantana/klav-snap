import { test, expect } from "bun:test"
import { cacheKey } from "./trails-types"

test("cacheKey is a stable 64-char hex digest", async () => {
  const k = await cacheKey("click", "https://app.test/checkout?b=2&a=1", "domhash123", "proj_A")
  expect(k).toMatch(/^[0-9a-f]{64}$/)
  const again = await cacheKey("click", "https://app.test/checkout?b=2&a=1", "domhash123", "proj_A")
  expect(again).toBe(k)
})

test("cacheKey normalizes query-param order and ignores the URL fragment", async () => {
  const a = await cacheKey("click", "https://app.test/x?a=1&b=2#frag", "h", "proj_A")
  const b = await cacheKey("click", "https://app.test/x?b=2&a=1", "h", "proj_A")
  expect(a).toBe(b)
})

test("cacheKey is sensitive to project, method, url path, and dom hash", async () => {
  const base = await cacheKey("click", "https://app.test/x", "h", "proj_A")
  expect(await cacheKey("type", "https://app.test/x", "h", "proj_A")).not.toBe(base)
  expect(await cacheKey("click", "https://app.test/y", "h", "proj_A")).not.toBe(base)
  expect(await cacheKey("click", "https://app.test/x", "h2", "proj_A")).not.toBe(base)
  expect(await cacheKey("click", "https://app.test/x", "h", "proj_B")).not.toBe(base)
})
