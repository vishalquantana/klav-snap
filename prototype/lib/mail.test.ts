import { test, expect } from "bun:test"
import { otpEmailHtml } from "./mail.ts"

test("otpEmailHtml renders the code and brand chrome", () => {
  const html = otpEmailHtml("464639")
  // The code is shown prominently.
  expect(html).toContain(">464639</span>")
  // Brand chrome: wordmark, tagline, indigo accent, gradient fallback, expiry.
  expect(html).toContain(">Klavity</div>")
  expect(html).toContain("AI Bug Reporter")
  expect(html).toContain("#6366f1")
  expect(html).toContain("background:#4f46e5;background:linear-gradient")
  expect(html).toContain("10 minutes")
})

test("otpEmailHtml note is deterministic per code and varies across codes", () => {
  expect(otpEmailHtml("111111")).toBe(otpEmailHtml("111111"))
  // Different codes should usually pick different notes (sample a few).
  const notes = new Set(["100000", "200001", "300002", "400003", "500004"].map((c) => {
    const m = otpEmailHtml(c).match(/font-style:italic">([^<]+)</)
    return m ? m[1] : ""
  }))
  expect(notes.size).toBeGreaterThan(1)
})
