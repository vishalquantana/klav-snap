// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { installRegionDrag } from "./region-drag"

const down = (x: number, y: number) => document.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: x, clientY: y, bubbles: true }))
const move = (x: number, y: number) => document.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }))
const up = (x: number, y: number) => document.dispatchEvent(new MouseEvent("mouseup", { button: 2, clientX: x, clientY: y, bubbles: true }))

describe("installRegionDrag", () => {
  it("right-click-drag fires onRegion with the selected viewport rect + suppresses the next menu", () => {
    const onRegion = vi.fn()
    const h = installRegionDrag({ onRegion })
    down(100, 120); move(140, 170); up(300, 420)
    expect(onRegion).toHaveBeenCalledTimes(1)
    expect(onRegion.mock.calls[0][0]).toEqual({ x: 100, y: 120, w: 200, h: 300 }) // normalized from start→end
    expect(h.suppressNextMenu()).toBe(true)
    h.destroy()
  })

  it("normalizes a drag made up-and-to-the-left", () => {
    const onRegion = vi.fn()
    const h = installRegionDrag({ onRegion })
    down(300, 400); move(280, 380); up(100, 150) // dragged toward the origin
    expect(onRegion.mock.calls[0][0]).toEqual({ x: 100, y: 150, w: 200, h: 250 })
    h.destroy()
  })

  it("a plain right-click (no drag) does NOT capture and does NOT suppress the menu", () => {
    const onRegion = vi.fn()
    const h = installRegionDrag({ onRegion })
    down(50, 50); up(52, 51) // moved < threshold (6)
    expect(onRegion).not.toHaveBeenCalled()
    expect(h.suppressNextMenu()).toBe(false) // → host still shows its context menu
    h.destroy()
  })

  it("ignores presses on own UI (isOwnTarget) and when shouldIgnore() is true", () => {
    const a = vi.fn(); const hA = installRegionDrag({ onRegion: a, isOwnTarget: () => true })
    down(10, 10); move(90, 90); up(90, 90)
    expect(a).not.toHaveBeenCalled(); hA.destroy()

    const b = vi.fn(); const hB = installRegionDrag({ onRegion: b, shouldIgnore: () => true })
    down(10, 10); move(90, 90); up(90, 90)
    expect(b).not.toHaveBeenCalled(); hB.destroy()
  })

  it("a drag smaller than minSize does not capture", () => {
    const onRegion = vi.fn()
    const h = installRegionDrag({ onRegion, minSize: 20 })
    down(0, 0); move(10, 10); up(10, 10) // 10×10 < 20
    expect(onRegion).not.toHaveBeenCalled()
    h.destroy()
  })

  it("a left-click drag is ignored (only right button starts a region)", () => {
    const onRegion = vi.fn()
    const h = installRegionDrag({ onRegion })
    document.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 0, clientY: 0, bubbles: true }))
    move(100, 100); up(100, 100)
    expect(onRegion).not.toHaveBeenCalled()
    h.destroy()
  })
})
