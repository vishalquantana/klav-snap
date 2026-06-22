// lib/sim-review.test.ts
// Pure unit tests for sim-review.ts helpers.
// No DB, no OpenRouter — only the testable pure functions.
import { test, expect } from "bun:test"
import { hashObservation, decodeDataUrl, splitUrl, buildSimRunSummary, type SimReview } from "./sim-review-pure"

// ── hashObservation ──────────────────────────────────────────────────────────

test("hashObservation: returns 16 hex chars", () => {
  const h = hashObservation("Button is broken")
  expect(h).toHaveLength(16)
  expect(h).toMatch(/^[0-9a-f]{16}$/)
})

test("hashObservation: same text → same hash (stable dedup key)", () => {
  const a = hashObservation("The checkout button is unresponsive")
  const b = hashObservation("The checkout button is unresponsive")
  expect(a).toBe(b)
})

test("hashObservation: different text → different hash", () => {
  const a = hashObservation("Checkout button broken")
  const b = hashObservation("Image carousel missing")
  expect(a).not.toBe(b)
})

test("hashObservation: case-insensitive and trim-insensitive", () => {
  const a = hashObservation("  BUTTON IS BROKEN  ")
  const b = hashObservation("button is broken")
  expect(a).toBe(b)
})

test("hashObservation: handles empty string without throwing", () => {
  const h = hashObservation("")
  expect(h).toHaveLength(16)
})

// ── decodeDataUrl ────────────────────────────────────────────────────────────

test("decodeDataUrl: valid base64 PNG data URL", () => {
  // Minimal 1x1 PNG as base64
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  const r = decodeDataUrl(`data:image/png;base64,${b64}`)
  expect(r).not.toBeNull()
  expect(r!.contentType).toBe("image/png")
  expect(r!.base64).toBe(b64)
  expect(r!.bytes.length).toBeGreaterThan(0)
})

test("decodeDataUrl: JPEG content type", () => {
  const b64 = btoa("fake-jpeg-bytes")
  const r = decodeDataUrl(`data:image/jpeg;base64,${b64}`)
  expect(r).not.toBeNull()
  expect(r!.contentType).toBe("image/jpeg")
})

test("decodeDataUrl: returns null for garbage input", () => {
  expect(decodeDataUrl("not-a-data-url")).toBeNull()
  expect(decodeDataUrl("")).toBeNull()
})

test("decodeDataUrl: defaults contentType to image/png when absent", () => {
  const b64 = btoa("bytes")
  const r = decodeDataUrl(`data:;base64,${b64}`)
  expect(r?.contentType).toBe("image/png")
})

// ── splitUrl ─────────────────────────────────────────────────────────────────

test("splitUrl: full URL → host + path, strips query+fragment", () => {
  const { urlHost, urlPath } = splitUrl("https://app.example.com/pricing?plan=pro#top")
  expect(urlHost).toBe("app.example.com")
  expect(urlPath).toBe("/pricing")
})

test("splitUrl: empty string → nulls", () => {
  const { urlHost, urlPath } = splitUrl("")
  expect(urlHost).toBeNull()
  expect(urlPath).toBeNull()
})

test("splitUrl: path-only fallback when URL is unparseable", () => {
  const { urlHost, urlPath } = splitUrl("/dashboard?foo=bar")
  expect(urlHost).toBeNull()
  expect(urlPath).toBe("/dashboard")
})

test("splitUrl: root path preserved", () => {
  const { urlPath } = splitUrl("https://klavity.quantana.top/")
  expect(urlPath).toBe("/")
})

// ── buildSimRunSummary ────────────────────────────────────────────────────────

test("buildSimRunSummary: empty reviews → all zeros", () => {
  const s = buildSimRunSummary([])
  expect(s.simCount).toBe(0)
  expect(s.totalObservations).toBe(0)
  expect(s.bugCount).toBe(0)
  expect(s.dedupedCount).toBe(0)
  expect(s.newCount).toBe(0)
})

test("buildSimRunSummary: counts across multiple Sims", () => {
  const reviews: SimReview[] = [
    {
      simId: "s1", simName: "Alice",
      observations: [
        { text: "obs1", sentiment: "negative", quote: null, hash: "aaa", suggestedBug: { title: "Bug A" }, deduped: false },
        { text: "obs2", sentiment: "neutral", quote: null, hash: "bbb", suggestedBug: null, deduped: true },
      ],
    },
    {
      simId: "s2", simName: "Bob",
      observations: [
        { text: "obs3", sentiment: "negative", quote: "quote", hash: "ccc", suggestedBug: { title: "Bug B" }, deduped: false },
      ],
    },
  ]
  const s = buildSimRunSummary(reviews)
  expect(s.simCount).toBe(2)
  expect(s.totalObservations).toBe(3)
  expect(s.bugCount).toBe(2)   // obs1 + obs3
  expect(s.dedupedCount).toBe(1) // obs2
  expect(s.newCount).toBe(2)   // obs1 + obs3
})
