import { describe, it, expect } from "vitest"
import { planScrollStitch, clampCaptureHeight } from "./sharp-capture"

describe("planScrollStitch", () => {
  it("steps by viewport height and clamps the last frame flush to the bottom", () => {
    // 2000px page, 800px viewport → frames at 0, 800, and 1200 (=2000-800, the bottom-aligned last frame)
    expect(planScrollStitch(2000, 800)).toEqual([0, 800, 1200])
  })

  it("returns a single frame when the page fits in one viewport", () => {
    expect(planScrollStitch(500, 800)).toEqual([0])
    expect(planScrollStitch(800, 800)).toEqual([0])
  })

  it("an exact multiple has no overlapping final frame", () => {
    expect(planScrollStitch(1600, 800)).toEqual([0, 800])
  })

  it("the last entry always equals max(0, fullHeight - viewportHeight)", () => {
    const ys = planScrollStitch(3001, 900)
    expect(ys[ys.length - 1]).toBe(3001 - 900)
    expect(ys[0]).toBe(0)
  })

  it("degrades safely on a zero/negative viewport", () => {
    expect(planScrollStitch(2000, 0)).toEqual([0])
  })
})

describe("clampCaptureHeight", () => {
  it("passes a short page through unchanged", () => {
    expect(clampCaptureHeight(4000, 2)).toBe(4000)
  })

  it("caps a tall page so the canvas stays within the browser limit", () => {
    // scale 2 → max CSS height 16000/2 = 8000
    expect(clampCaptureHeight(50000, 2)).toBe(8000)
  })

  it("accounts for the capture scale (DPR)", () => {
    expect(clampCaptureHeight(50000, 1)).toBe(16000)
    expect(clampCaptureHeight(50000, 3, 15000)).toBe(5000)
  })

  it("degrades safely on a zero scale", () => {
    expect(clampCaptureHeight(4000, 0)).toBe(4000)
  })
})
