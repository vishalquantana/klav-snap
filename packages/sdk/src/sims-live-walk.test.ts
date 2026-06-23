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

async function settleWalk(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1)
  expect(document.querySelector(".klav-walker")).toBeTruthy()
  await vi.advanceTimersByTimeAsync(1500)
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
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("SimsLive walk + outline choreography", () => {
  it("walks to a region-backed target and pins a halo bubble", async () => {
    makeTarget()
    SimsLive.deploy("all", [SIM])

    const obs: LiveObservation = {
      text: "The checkout button is exactly where I need it.",
      sentiment: "satisfied",
      region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
      targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
    }
    SimsLive.renderFeedback(SIM.id, SIM.name, [obs])

    await settleWalk()

    expect(document.querySelector(".klav-halo")).toBeTruthy()
    expect(document.querySelector(".klav-pin")).toBeTruthy()
    expect(document.querySelector(".ksl-bubble")).toBeNull()
  })

  it("falls back to visible text matching when the model returns no region", async () => {
    makeTarget("Pricing checkout guarantee")
    SimsLive.deploy("all", [SIM])

    SimsLive.renderFeedback(SIM.id, SIM.name, [{
      text: "The pricing checkout guarantee is reassuring.",
      sentiment: "delighted",
      region: null,
    }])

    await settleWalk()

    expect(document.querySelector(".klav-halo")).toBeTruthy()
    expect(document.querySelector(".klav-pin")).toBeTruthy()
  })

  it("undeploy removes queued walkers, halos, and pins", async () => {
    makeTarget()
    SimsLive.deploy("all", [SIM])
    SimsLive.renderFeedback(SIM.id, SIM.name, [{
      text: "The checkout button is hard to miss.",
      sentiment: "neutral",
      region: { x: 120 / 1280, y: 150 / 720, w: 240 / 1280, h: 90 / 720 },
      targetViewport: { scrollX: 0, scrollY: 0, width: 1280, height: 720 },
    }])
    await settleWalk()

    SimsLive.undeploy()

    expect(document.querySelector(".klav-walker")).toBeNull()
    expect(document.querySelector(".klav-halo")).toBeNull()
    expect(document.querySelector(".klav-pin")).toBeNull()
  })
})
