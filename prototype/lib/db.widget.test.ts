import { test, expect } from "bun:test"
import { hostOfPattern } from "./db"

test("hostOfPattern strips scheme, path and wildcard to the bare host", () => {
  expect(hostOfPattern("https://app.acme.com/*")).toBe("app.acme.com")
  expect(hostOfPattern("app.acme.com/billing")).toBe("app.acme.com")
  expect(hostOfPattern("APP.ACME.COM/x?y=1")).toBe("app.acme.com")
  expect(hostOfPattern("")).toBe("")
})
