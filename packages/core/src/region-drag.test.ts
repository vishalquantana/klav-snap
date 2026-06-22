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

  it("fires onDragStart ONCE when the drag begins (so the host can dismiss its menu), not on a plain click", () => {
    const onDragStart = vi.fn()
    const h = installRegionDrag({ onRegion: vi.fn(), onDragStart })
    // plain right-click (no movement past threshold) → no drag start
    down(50, 50); up(52, 51)
    expect(onDragStart).not.toHaveBeenCalled()
    // a real drag → onDragStart fires exactly once, on the first qualifying move
    down(100, 100); move(108, 108); move(160, 160); up(160, 160)
    expect(onDragStart).toHaveBeenCalledTimes(1)
    h.destroy()
  })

  it("normalizes a drag made up-and-to-the-left", () => {
    const onRegion = vi.fn()
    const h = installRegionDrag({ onRegion })
    down(300, 400); move(280, 380); up(100, 150) // dragged toward the origin
    expect(onRegion.mock.calls[0][0]).toEqual({ x: 100, y: 150, w: 200, h: 250 })
    h.destroy()
  })

  it("a plain right-click (no drag) does NOT capture and does NOT suppress the menu after release", () => {
    const onRegion = vi.fn()
    const h = installRegionDrag({ onRegion })
    down(50, 50); up(52, 51) // moved < threshold (6)
    expect(onRegion).not.toHaveBeenCalled()
    // After mouseup pressing=false — host's contextmenu event can fire and show its menu.
    expect(h.suppressNextMenu()).toBe(false)
    h.destroy()
  })

  it("suppressNextMenu() returns true WHILE right button is held (pressing), false after release", () => {
    const h = installRegionDrag({ onRegion: vi.fn() })
    down(50, 50)
    // contextmenu fires synchronously with mousedown on macOS — must be suppressed while pressing
    expect(h.suppressNextMenu()).toBe(true)
    up(52, 51) // release without drag
    expect(h.suppressNextMenu()).toBe(false)
    h.destroy()
  })

  it("onRightDown fires on every right mousedown (both plain clicks and drags), NOT on left clicks", () => {
    const onRightDown = vi.fn()
    const h = installRegionDrag({ onRegion: vi.fn(), onRightDown })
    // plain right-click
    down(50, 50); up(52, 51)
    expect(onRightDown).toHaveBeenCalledTimes(1)
    // right-click-drag
    down(100, 100); move(110, 110); up(200, 200)
    expect(onRightDown).toHaveBeenCalledTimes(2)
    // left click — should NOT fire
    document.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 0, clientY: 0, bubbles: true }))
    expect(onRightDown).toHaveBeenCalledTimes(2)
    h.destroy()
  })

  it("onRightDown does NOT fire when shouldIgnore() is true or isOwnTarget() is true", () => {
    const onRightDown = vi.fn()
    const hA = installRegionDrag({ onRegion: vi.fn(), onRightDown, shouldIgnore: () => true })
    down(10, 10); up(10, 10)
    expect(onRightDown).not.toHaveBeenCalled()
    hA.destroy()

    const onRightDown2 = vi.fn()
    const hB = installRegionDrag({ onRegion: vi.fn(), onRightDown: onRightDown2, isOwnTarget: () => true })
    down(10, 10); up(10, 10)
    expect(onRightDown2).not.toHaveBeenCalled()
    hB.destroy()
  })

  it("onPlainRightClick fires on mouseup when no drag, with the release coordinates", () => {
    const onPlainRightClick = vi.fn()
    const h = installRegionDrag({ onRegion: vi.fn(), onPlainRightClick })
    down(50, 50); up(53, 52) // < threshold (6) → plain click
    expect(onPlainRightClick).toHaveBeenCalledTimes(1)
    expect(onPlainRightClick).toHaveBeenCalledWith(53, 52)
    h.destroy()
  })

  it("onPlainRightClick does NOT fire when a drag occurred", () => {
    const onPlainRightClick = vi.fn()
    const h = installRegionDrag({ onRegion: vi.fn(), onPlainRightClick })
    down(100, 100); move(110, 110); up(200, 200)
    expect(onPlainRightClick).not.toHaveBeenCalled()
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
