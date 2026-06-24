// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SimsLive, type LiveObservation } from "./sims-live"

const SIM = { id: "sim_walk", name: "Alex Walker", initials: "AW", accent: "#7c3aed" }

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function setRect(el: HTMLElement, r: DOMRect): void {
  el.getBoundingClientRect = vi.fn(() => r)
  Object.defineProperty(el, "offsetHeight", { value: r.height, configurable: true })
  Object.defineProperty(el, "offsetWidth", { value: r.width, configurable: true })
}

function makeTarget(text = "Checkout button pricing area"): HTMLElement {
  const target = document.createElement("div")
  target.id = "target"
  target.textContent = text
  target.style.display = "block"
  document.body.appendChild(target)
  setRect(target, rect(120, 150, 240, 90))

  Object.defineProperty(document, "elementFromPoint", { value: vi.fn(() => target), configurable: true })
  Object.defineProperty(document, "elementsFromPoint", { value: vi.fn(() => [target, document.body]), configurable: true })
  return target
}

function dockShadow(): ShadowRoot | null {
  return (document.querySelector("#klav-sims-live") as HTMLElement | null)?.shadowRoot ?? null
}

async function settleWalk(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1)
  expect(document.querySelector(".klav-walker")).toBeTruthy()
  await vi.advanceTimersByTimeAsync(1500)
}

async function settleMarkers(): Promise<HTMLElement[]> {
  await vi.advanceTimersByTimeAsync(1900)
  return Array.from(document.querySelectorAll(".klav-pin-marker")) as HTMLElement[]
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ""
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true })
  Object.defineProperty(window, "innerHeight", { value: 720, configurable: true })
  Object.defineProperty(window, "scrollX", { value: 0, configurable: true, writable: true })
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true })
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  vi.spyOn(window, "scrollTo").mockImplementation((arg1: ScrollToOptions | number, arg2?: number) => {
    if (typeof arg1 === "object") {
      Object.defineProperty(window, "scrollX", { value: Number(arg1.left || 0), configurable: true, writable: true })
      Object.defineProperty(window, "scrollY", { value: Number(arg1.top || 0), configurable: true, writable: true })
    } else {
      Object.defineProperty(window, "scrollX", { value: Number(arg1 || 0), configurable: true, writable: true })
      Object.defineProperty(window, "scrollY", { value: Number(arg2 || 0), configurable: true, writable: true })
    }
  })
  SimsLive.undeploy()
})

afterEach(() => {
  SimsLive.undeploy()
  SimsLive.onTriage = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("SimsLive walk + outline choreography", () => {
  it("renders a collapsed marker first, then walks and expands on marker click", async () => {
    makeTarget()
    SimsLive.deploy("all", [SIM])

    const obs: LiveObservation = {
      text: "The checkout button is confusing and hard to trust.",
      sentiment: "confused",
      region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
      targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
    }
    SimsLive.renderFeedback(SIM.id, SIM.name, [obs])

    const markers = await settleMarkers()
    expect(markers).toHaveLength(1)
    expect(document.querySelector(".klav-walker")).toBeNull()
    expect(document.querySelector(".klav-halo")).toBeNull()
    expect(document.querySelector(".klav-pin")).toBeNull()

    markers[0].click()
    await settleWalk()

    expect(document.querySelector(".klav-halo")).toBeTruthy()
    expect(document.querySelector(".klav-pin")).toBeTruthy()
    expect(document.querySelectorAll(".klav-pin")).toHaveLength(1)
    expect(document.querySelector(".ksl-bubble")).toBeNull()

    const trackBtn = document.querySelector(".klav-pin-triage") as HTMLButtonElement
    const onTriage = vi.fn()
    SimsLive.onTriage = onTriage
    expect(trackBtn.textContent).toContain("Track as Bug")
    trackBtn.click()
    expect(onTriage).toHaveBeenCalledWith(obs, SIM.name)
  })

  it("falls back to visible text matching when the model returns no region", async () => {
    makeTarget("Pricing checkout guarantee")
    SimsLive.deploy("all", [SIM])

    SimsLive.renderFeedback(SIM.id, SIM.name, [{
      text: "The pricing checkout guarantee is confusing.",
      sentiment: "confused",
      region: null,
    }])

    const markers = await settleMarkers()
    expect(markers).toHaveLength(1)
    markers[0].dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }))
    await settleWalk()

    expect(document.querySelector(".klav-halo")).toBeTruthy()
    expect(document.querySelector(".klav-pin")).toBeTruthy()
  })

  it("keeps only one observation expanded and dims the rest", async () => {
    makeTarget()
    SimsLive.deploy("all", [SIM])

    SimsLive.renderFeedback(SIM.id, SIM.name, [
      {
        text: "The checkout button feels blocked.",
        sentiment: "blocked",
        region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
        targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
      },
      {
        text: "The checkout pricing feels broken.",
        sentiment: "confused",
        region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
        targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
      },
    ])

    const markers = await settleMarkers()
    expect(markers).toHaveLength(2)
    const counter = dockShadow()?.querySelector(".ksl-more-counter") as HTMLButtonElement
    expect(counter.textContent).toBe("+2 more")
    counter.click()
    await settleWalk()
    expect(document.querySelectorAll(".klav-pin")).toHaveLength(1)
    expect(counter.textContent).toBe("+1 more")
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)

    markers[0].click()
    await settleWalk()
    expect(document.querySelectorAll(".klav-pin")).toHaveLength(1)
    expect(document.querySelectorAll(".klav-halo")).toHaveLength(1)
    expect(markers[0].classList.contains("is-active")).toBe(true)
    expect(markers[1].classList.contains("is-dim")).toBe(true)

    markers[1].click()
    await settleWalk()
    expect(document.querySelectorAll(".klav-pin")).toHaveLength(1)
    expect(document.querySelectorAll(".klav-halo")).toHaveLength(1)
    expect(markers[0].classList.contains("is-dim")).toBe(true)
    expect(markers[1].classList.contains("is-active")).toBe(true)
  })

  it("dock click focuses that Sim's annotation and Escape collapses back to pins", async () => {
    makeTarget()
    SimsLive.deploy("all", [SIM])
    SimsLive.renderFeedback(SIM.id, SIM.name, [{
      text: "The checkout button feels blocked.",
      sentiment: "blocked",
      region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
      targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
    }])

    const markers = await settleMarkers()
    expect(markers).toHaveLength(1)
    const slot = dockShadow()?.querySelector(".ksl-slot") as HTMLElement
    slot.click()
    await settleWalk()
    expect(document.querySelector(".klav-pin")).toBeTruthy()

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    expect(document.querySelector(".klav-pin")).toBeNull()
    expect(document.querySelector(".klav-halo")).toBeNull()
    expect(document.querySelector(".klav-pin-marker")).toBeTruthy()

    markers[0].click()
    await settleWalk()
    expect(document.querySelector(".klav-pin")).toBeTruthy()
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }))
    await vi.advanceTimersByTimeAsync(260)
    expect(document.querySelector(".klav-pin")).toBeNull()
    expect(document.querySelector(".klav-halo")).toBeNull()
  })

  it("queues offscreen observations and reveals their pins when the target enters the viewport", async () => {
    const target = makeTarget()
    setRect(target, rect(120, 1000, 240, 90))
    let ioCallback: IntersectionObserverCallback | null = null
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal("IntersectionObserver", vi.fn((cb: IntersectionObserverCallback) => {
      ioCallback = cb
      return { observe, disconnect, unobserve: vi.fn(), takeRecords: vi.fn(() => []) }
    }))

    SimsLive.deploy("all", [SIM])
    SimsLive.renderFeedback(SIM.id, SIM.name, [{
      text: "The checkout button feels blocked.",
      sentiment: "blocked",
      region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
      targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
    }])

    await vi.advanceTimersByTimeAsync(250)
    expect(document.querySelector(".klav-pin-marker")).toBeNull()
    const counter = dockShadow()?.querySelector(".ksl-more-counter") as HTMLButtonElement
    expect(counter.textContent).toBe("+1 more")
    expect(observe).toHaveBeenCalledWith(target)

    setRect(target, rect(120, 150, 240, 90))
    ioCallback?.([{ isIntersecting: true, intersectionRatio: 0.6, target } as IntersectionObserverEntry], {} as IntersectionObserver)
    await vi.advanceTimersByTimeAsync(1700)

    expect(disconnect).toHaveBeenCalled()
    expect(document.querySelectorAll(".klav-pin-marker")).toHaveLength(1)
    expect(document.querySelector(".klav-pin")).toBeNull()
    expect(counter.textContent).toBe("+1 more")
  })

  it("undeploy removes queued walkers, halos, expanded bubbles, and markers", async () => {
    makeTarget()
    SimsLive.deploy("all", [SIM])
    SimsLive.renderFeedback(SIM.id, SIM.name, [{
      text: "The checkout button feels blocked.",
      sentiment: "blocked",
      region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
      targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
    }])
    const markers = await settleMarkers()
    markers[0].click()
    await settleWalk()

    SimsLive.undeploy()

    expect(document.querySelector(".klav-walker")).toBeNull()
    expect(document.querySelector(".klav-halo")).toBeNull()
    expect(document.querySelector(".klav-pin")).toBeNull()
    expect(document.querySelector(".klav-pin-marker")).toBeNull()
  })

  it("does not render positive or neutral observations on-page", async () => {
    makeTarget()
    SimsLive.deploy("all", [SIM])

    SimsLive.renderFeedback(SIM.id, SIM.name, [
      {
        text: "The checkout button is exactly where I need it.",
        sentiment: "satisfied",
        region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
        targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
      },
      {
        text: "The pricing section is neutral.",
        sentiment: "neutral",
        region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
        targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
      },
    ])
    await vi.advanceTimersByTimeAsync(2000)

    expect(document.querySelector(".klav-walker")).toBeNull()
    expect(document.querySelector(".klav-halo")).toBeNull()
    expect(document.querySelector(".klav-pin")).toBeNull()
    expect(document.querySelector(".klav-pin-marker")).toBeNull()
    expect(dockShadow()?.querySelector(".ksl-bubble")).toBeNull()
  })
})
