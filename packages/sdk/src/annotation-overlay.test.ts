import { describe, it, expect } from "vitest"
import { clampRect, pinPosition, type Rect } from "./annotation-overlay"

// ── clampRect ─────────────────────────────────────────────────────────────────

describe("clampRect", () => {
  it("passes a rect that fits entirely within the viewport unchanged", () => {
    const r: Rect = { x: 100, y: 50, w: 200, h: 100 }
    expect(clampRect(r, 1280, 720)).toEqual(r)
  })

  it("clamps x to 0 when rect starts left of the viewport", () => {
    const r = clampRect({ x: -20, y: 50, w: 100, h: 80 }, 1280, 720)
    expect(r.x).toBe(0)
    expect(r.w).toBe(100)   // width unchanged when x is clamped to 0
  })

  it("reduces width so the right edge stays within the viewport", () => {
    // x=1200 w=200 on a 1280-wide viewport → width should be clamped to 80
    const r = clampRect({ x: 1200, y: 0, w: 200, h: 50 }, 1280, 720)
    expect(r.x).toBe(1200)
    expect(r.w).toBe(80)
  })

  it("reduces height so the bottom edge stays within the viewport", () => {
    // y=700 h=200 on a 720-tall viewport → height should be clamped to 20
    const r = clampRect({ x: 0, y: 700, w: 100, h: 200 }, 1280, 720)
    expect(r.y).toBe(700)
    expect(r.h).toBe(20)
  })

  it("clamps y to 0 and leaves height unchanged when rect starts above the viewport", () => {
    const r = clampRect({ x: 0, y: -10, w: 100, h: 50 }, 1280, 720)
    expect(r.y).toBe(0)
    expect(r.h).toBe(50)
  })

  it("enforces a minimum width and height of 1", () => {
    // rect entirely outside viewport → clamped to a 1×1 sliver
    const r = clampRect({ x: 2000, y: 2000, w: 10, h: 10 }, 1280, 720)
    expect(r.w).toBeGreaterThanOrEqual(1)
    expect(r.h).toBeGreaterThanOrEqual(1)
  })

  it("does not mutate the input rect", () => {
    const orig: Rect = { x: -5, y: 200, w: 50, h: 50 }
    clampRect(orig, 1280, 720)
    expect(orig.x).toBe(-5)   // unchanged
  })
})

// ── pinPosition ───────────────────────────────────────────────────────────────

describe("pinPosition", () => {
  const VW = 1280, VH = 720
  const PIN_W = 224, PIN_H = 96

  it("places the pin above the rect when there is sufficient space", () => {
    // rect at y=300 — plenty of space above for a 96px-tall pin + 14px gap + 10px margin
    const rect: Rect = { x: 200, y: 300, w: 300, h: 80 }
    const { top, below } = pinPosition(rect, PIN_W, PIN_H, VW, VH)
    expect(below).toBe(false)
    expect(top).toBeLessThan(rect.y)   // pin top is above the halo top
  })

  it("flips below the rect when there is not enough space above", () => {
    // rect at y=50 — only 50px above, not enough for 96 + 14 + 10
    const rect: Rect = { x: 200, y: 50, w: 300, h: 80 }
    const { top, below } = pinPosition(rect, PIN_W, PIN_H, VW, VH)
    expect(below).toBe(true)
    expect(top).toBeGreaterThan(rect.y)   // pin top is below the halo top
  })

  it("left-aligns the pin to the rect x within margin bounds", () => {
    const rect: Rect = { x: 200, y: 300, w: 300, h: 80 }
    const { left } = pinPosition(rect, PIN_W, PIN_H, VW, VH)
    expect(left).toBe(200)   // rect.x fits without clamping
  })

  it("clamps the left edge so the pin never overflows the right viewport edge", () => {
    // rect starting at x=1200 — PIN_W=224 would overflow past 1280
    const rect: Rect = { x: 1200, y: 300, w: 100, h: 80 }
    const { left } = pinPosition(rect, PIN_W, PIN_H, VW, VH)
    expect(left + PIN_W).toBeLessThanOrEqual(VW - 10)   // 10px margin from right edge
  })

  it("clamps the left edge to the margin when the rect starts near the left edge", () => {
    const rect: Rect = { x: 2, y: 300, w: 100, h: 80 }
    const { left } = pinPosition(rect, PIN_W, PIN_H, VW, VH)
    expect(left).toBeGreaterThanOrEqual(10)   // default margin = 10
  })

  it("respects a custom margin", () => {
    const rect: Rect = { x: 2, y: 300, w: 100, h: 80 }
    const { left } = pinPosition(rect, PIN_W, PIN_H, VW, VH, 20)
    expect(left).toBeGreaterThanOrEqual(20)
  })

  it("returns { below: false } exactly when the rect has enough space above (boundary)", () => {
    // Space above = rect.y - pinHEst - GAP(14) - margin(10) = 0 means exactly fits
    // rect.y = 120, pinH = 96 → space = 120 - 96 - 14 = 10 ≥ margin(10) → fits above
    const rect: Rect = { x: 100, y: 120, w: 200, h: 60 }
    const { below } = pinPosition(rect, PIN_W, 96, VW, VH, 10)
    expect(below).toBe(false)
  })

  it("flips below when available space is exactly 1px short", () => {
    // rect.y = 119, pinH = 96 → space = 119 - 96 - 14 = 9 < margin(10) → flips below
    const rect: Rect = { x: 100, y: 119, w: 200, h: 60 }
    const { below } = pinPosition(rect, PIN_W, 96, VW, VH, 10)
    expect(below).toBe(true)
  })
})
