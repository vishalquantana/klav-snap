import { test, expect } from "bun:test"
import { successCopy } from "./widget-lib"

test("support mode → status hook, email shown, no CTA", () => {
  const s = successCopy("support", "https://x/onboarding")
  expect(s.showEmail).toBe(true); expect(s.showCta).toBe(false)
  expect(s.headline.toLowerCase()).toContain("filed")
})
test("leadgen mode → email + CTA to ctaUrl", () => {
  const s = successCopy("leadgen", "https://klavity.quantana.top/onboarding")
  expect(s.showEmail).toBe(true); expect(s.showCta).toBe(true)
  expect(s.ctaUrl).toBe("https://klavity.quantana.top/onboarding")
})
test("off mode → no email, no CTA", () => {
  const s = successCopy("off", "https://x/onboarding")
  expect(s.showEmail).toBe(false); expect(s.showCta).toBe(false)
})
