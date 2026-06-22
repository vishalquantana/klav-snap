import { test, expect } from "bun:test"
import { SCREENSHOTS, resolveScreenshotConfig, mbLabel } from "./screenshot-config"

test("defaults: enabled, server cap, default acl", () => {
  const c = resolveScreenshotConfig({})
  expect(c.enabled).toBe(true)
  expect(c.maxBytes).toBe(SCREENSHOTS.maxBytes)
  expect(c.acl).toBe(SCREENSHOTS.defaultAcl)
})

test("null / non-object settings fall back to defaults", () => {
  expect(resolveScreenshotConfig(null).enabled).toBe(true)
  expect(resolveScreenshotConfig(undefined).maxBytes).toBe(SCREENSHOTS.maxBytes)
  expect(resolveScreenshotConfig("nope").enabled).toBe(true)
})

test("project can disable capture", () => {
  expect(resolveScreenshotConfig({ screenshots: { enabled: false } }).enabled).toBe(false)
})

test("project can LOWER the size cap but never raise it", () => {
  expect(resolveScreenshotConfig({ screenshots: { maxSizeMb: 2 } }).maxBytes).toBe(2 * 1024 * 1024)
  // asking for more than the server ceiling is clamped down
  expect(resolveScreenshotConfig({ screenshots: { maxSizeMb: 9999 } }).maxBytes).toBe(SCREENSHOTS.maxBytes)
})

test("project can pin acl; invalid acl ignored", () => {
  expect(resolveScreenshotConfig({ screenshots: { acl: "public-read" } }).acl).toBe("public-read")
  expect(resolveScreenshotConfig({ screenshots: { acl: "bogus" } }).acl).toBe(SCREENSHOTS.defaultAcl)
})

test("mbLabel formats bytes", () => {
  expect(mbLabel(8 * 1024 * 1024)).toBe("8MB")
})
