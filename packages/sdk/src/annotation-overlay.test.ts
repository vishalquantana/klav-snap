import { afterEach, describe, expect, it, vi } from "vitest"
import { clampRect, pinPosition, type Rect } from "./annotation-overlay"

type FakeElement = {
  tagName: string
  id: string
  className: string
  textContent: string
  dataset: Record<string, string>
  style: Record<string, string>
  children: FakeElement[]
  parentNode: FakeElement | null
  attrs: Record<string, string>
  listeners: Record<string, () => void>
  classList: {
    add: (name: string) => void
    contains: (name: string) => boolean
  }
  appendChild: (child: FakeElement) => FakeElement
  remove: () => void
  setAttribute: (name: string, value: string) => void
  getAttribute: (name: string) => string | null
  addEventListener: (name: string, fn: () => void) => void
  click: () => void
}

function createFakeElement(tagName: string): FakeElement {
  const el = {
    tagName,
    id: "",
    className: "",
    textContent: "",
    dataset: {},
    style: {},
    children: [],
    parentNode: null,
    attrs: {},
    listeners: {},
    classList: {
      add(name: string) {
        const classes = new Set(el.className.split(/\s+/).filter(Boolean))
        classes.add(name)
        el.className = [...classes].join(" ")
      },
      contains(name: string) {
        return el.className.split(/\s+/).includes(name)
      },
    },
    appendChild(child: FakeElement) {
      child.parentNode = el
      el.children.push(child)
      return child
    },
    remove() {
      if (!el.parentNode) return
      el.parentNode.children = el.parentNode.children.filter(child => child !== el)
      el.parentNode = null
    },
    setAttribute(name: string, value: string) {
      el.attrs[name] = value
    },
    getAttribute(name: string) {
      return el.attrs[name] ?? null
    },
    addEventListener(name: string, fn: () => void) {
      el.listeners[name] = fn
    },
    click() {
      el.listeners.click?.()
    },
  } satisfies FakeElement

  return el
}

function createFakeDocument() {
  const head = createFakeElement("head")
  const body = createFakeElement("body")

  const findById = (node: FakeElement, id: string): FakeElement | null => {
    if (node.id === id) return node
    for (const child of node.children) {
      const found = findById(child, id)
      if (found) return found
    }
    return null
  }

  return {
    head,
    body,
    createElement: (tagName: string) => createFakeElement(tagName),
    getElementById: (id: string) => findById(head, id) ?? findById(body, id),
  }
}

async function loadOverlayWithDom(viewport = { innerWidth: 1280, innerHeight: 720 }) {
  vi.resetModules()
  const document = createFakeDocument()
  vi.stubGlobal("document", document)
  vi.stubGlobal("window", viewport)
  const mod = await import("./annotation-overlay")
  return { document, ...mod }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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

// ── showAnnotation / clearAnnotation ─────────────────────────────────────────

describe("annotation DOM API", () => {
  it("creates the overlay and anchors the halo to the rect with padding", async () => {
    const { document, showAnnotation } = await loadOverlayWithDom()

    const id = showAnnotation({ x: 40, y: 50, w: 120, h: 30 }, undefined, { color: "#8b5cf6" })

    expect(id).toBe("klav-ao-1")
    expect(document.getElementById("klav-ao-css")?.tagName).toBe("style")
    const overlay = document.getElementById("klav-ao-overlay")
    expect(overlay).toBeTruthy()
    expect(document.body.children).toContain(overlay)

    const halo = overlay?.children.find(child => child.className === "klav-ao-halo")
    expect(halo?.dataset.aoId).toBe(id)
    expect(halo?.style.left).toBe("35px")
    expect(halo?.style.top).toBe("45px")
    expect(halo?.style.width).toBe("130px")
    expect(halo?.style.height).toBe("40px")
    expect(halo?.style.borderColor).toBe("#8b5cf6")
    expect(halo?.style.boxShadow).toContain("rgba(139,92,246,0.14)")
  })

  it("positions a labeled pin above the halo when there is enough space", async () => {
    const { document, showAnnotation } = await loadOverlayWithDom()

    const id = showAnnotation({ x: 200, y: 300, w: 120, h: 30 }, "Broken CTA", { color: "#6366f1", severity: "medium" })
    const overlay = document.getElementById("klav-ao-overlay")
    const pin = overlay?.children.find(child => child.className === "klav-ao-pin")

    expect(pin?.dataset.aoId).toBe(id)
    expect(pin?.style.left).toBe("195px")
    expect(pin?.style.top).toBe("185px")
    expect(pin?.style.borderLeftColor).toBe("#6366f1")
    expect(pin?.getAttribute("role")).toBe("status")
    expect(pin?.getAttribute("aria-label")).toBe("Annotation: Broken CTA")
    expect(pin?.children[0]?.children[0]?.textContent).toBe("Broken CTA")
    expect(pin?.children[0]?.children[1]?.className).toBe("klav-ao-sev sev-m")
  })

  it("flips a labeled pin below the halo when the rect is near the top", async () => {
    const { document, showAnnotation } = await loadOverlayWithDom()

    showAnnotation({ x: 40, y: 20, w: 100, h: 20 }, "Top issue")
    const overlay = document.getElementById("klav-ao-overlay")
    const pin = overlay?.children.find(child => child.className.includes("klav-ao-pin"))

    expect(pin?.classList.contains("tail-top")).toBe(true)
    expect(pin?.style.left).toBe("35px")
    expect(pin?.style.top).toBe("59px")
  })

  it("clears an unlabeled annotation immediately", async () => {
    const { document, showAnnotation, clearAnnotation } = await loadOverlayWithDom()

    const id = showAnnotation({ x: 40, y: 50, w: 120, h: 30 })
    const overlay = document.getElementById("klav-ao-overlay")
    expect(overlay?.children.length).toBe(1)

    clearAnnotation(id)

    expect(overlay?.children.length).toBe(0)
  })

  it("clears a labeled annotation after the exit animation window", async () => {
    vi.useFakeTimers()
    const { document, showAnnotation, clearAnnotation } = await loadOverlayWithDom()

    const id = showAnnotation({ x: 200, y: 300, w: 120, h: 30 }, "Dismiss me")
    const overlay = document.getElementById("klav-ao-overlay")
    const pin = overlay?.children.find(child => child.className.includes("klav-ao-pin"))
    const halo = overlay?.children.find(child => child.className === "klav-ao-halo")

    clearAnnotation(id)

    expect(pin?.classList.contains("is-out")).toBe(true)
    expect(halo?.style.animation).toBe("klav-ao-pin-out .22s ease-in forwards")
    expect(overlay?.children.length).toBe(2)

    vi.advanceTimersByTime(240)

    expect(overlay?.children.length).toBe(0)
  })

  it("clearAnnotations removes all visible unlabeled annotations", async () => {
    const { document, showAnnotation, clearAnnotations } = await loadOverlayWithDom()

    showAnnotation({ x: 10, y: 20, w: 30, h: 40 })
    showAnnotation({ x: 80, y: 90, w: 30, h: 40 })
    const overlay = document.getElementById("klav-ao-overlay")
    expect(overlay?.children.length).toBe(2)

    clearAnnotations()

    expect(overlay?.children.length).toBe(0)
  })

  it("ignores unknown annotation ids", async () => {
    const { showAnnotation, clearAnnotation } = await loadOverlayWithDom()

    expect(() => clearAnnotation("missing")).not.toThrow()
    expect(showAnnotation({ x: 0, y: 0, w: 10, h: 10 })).toBe("klav-ao-1")
  })
})
