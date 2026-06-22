// lib/recurrence-memory.test.ts
// Unit tests for the pure helpers in recurrence-memory.ts.
// No DB required — buildSummary/ordinal are side-effect-free.
import { test, expect } from "bun:test"
import { ordinal, buildSummary } from "./recurrence-memory"

// ── ordinal ─────────────────────────────────────────────────────────────────

test("ordinal: 1st, 2nd, 3rd, then -th", () => {
  expect(ordinal(1)).toBe("1st")
  expect(ordinal(2)).toBe("2nd")
  expect(ordinal(3)).toBe("3rd")
  expect(ordinal(4)).toBe("4th")
  expect(ordinal(10)).toBe("10th")
})

test("ordinal: teen exceptions (11, 12, 13 all -th)", () => {
  expect(ordinal(11)).toBe("11th")
  expect(ordinal(12)).toBe("12th")
  expect(ordinal(13)).toBe("13th")
  // 111, 112, 113 follow mod100 → also -th
  expect(ordinal(111)).toBe("111th")
  expect(ordinal(112)).toBe("112th")
  expect(ordinal(113)).toBe("113th")
})

test("ordinal: 21st, 22nd, 23rd resume normal pattern", () => {
  expect(ordinal(21)).toBe("21st")
  expect(ordinal(22)).toBe("22nd")
  expect(ordinal(23)).toBe("23rd")
  expect(ordinal(100)).toBe("100th")
})

// ── buildSummary ─────────────────────────────────────────────────────────────

const D = new Date("2026-06-01T00:00:00Z").getTime()

test("buildSummary: first occurrence, no Sim", () => {
  const s = buildSummary(1, D, null)
  expect(s).toContain("First occurrence")
  expect(s).toContain("2026-06-01")
  expect(s).toContain("previous reporter")
  expect(s).not.toContain("occurrence.") // "First occurrence" phrasing, not "Xth occurrence."
})

test("buildSummary: first occurrence with Sim name", () => {
  const s = buildSummary(1, D, "Alice")
  expect(s).toContain("First occurrence")
  expect(s).toContain("Alice")
  expect(s).toContain("(Sim)")
  expect(s).not.toContain("previous reporter")
})

test("buildSummary: 2nd occurrence, Sim name", () => {
  const ts = new Date("2026-06-10T00:00:00Z").getTime()
  const s = buildSummary(2, ts, "Alice")
  expect(s).toContain("2nd occurrence")
  expect(s).toContain("Alice")
  expect(s).toContain("2026-06-10")
})

test("buildSummary: 4th occurrence, no Sim", () => {
  const ts = new Date("2026-06-15T00:00:00Z").getTime()
  const s = buildSummary(4, ts, null)
  expect(s).toContain("4th occurrence")
  expect(s).toContain("previous reporter")
  expect(s).toContain("2026-06-15")
})

test("buildSummary: large count uses correct ordinal (11th)", () => {
  const s = buildSummary(11, D, "Bob")
  expect(s).toContain("11th occurrence")
  expect(s).toContain("Bob")
})

test("buildSummary: 21st uses correct ordinal", () => {
  const s = buildSummary(21, D, null)
  expect(s).toContain("21st occurrence")
})
