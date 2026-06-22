import { describe, it, expect } from "vitest"
import {
  djb2,
  computeContentHash,
  shouldSkipReview,
  isSignificantNode,
  hasSignificantMutations,
} from "./sims-watch"

// ── djb2 ─────────────────────────────────────────────────────────────────────────────────

describe("djb2", () => {
  it("returns a non-negative integer", () => {
    expect(djb2("hello")).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(djb2("hello"))).toBe(true)
  })

  it("is stable — same input always produces the same hash", () => {
    expect(djb2("test")).toBe(djb2("test"))
    expect(djb2("klavity")).toBe(djb2("klavity"))
  })

  it("produces different hashes for different inputs", () => {
    expect(djb2("foo")).not.toBe(djb2("bar"))
    expect(djb2("")).not.toBe(djb2("x"))
  })

  it("handles empty string", () => {
    expect(typeof djb2("")).toBe("number")
    expect(djb2("")).toBeGreaterThanOrEqual(0)
  })
})

// ── computeContentHash ───────────────────────────────────────────────────────────────────

describe("computeContentHash", () => {
  const base = [0, 3000, 1280, 800, "My Page", "/home"] as const

  it("is stable — same inputs always produce the same hash", () => {
    expect(computeContentHash(...base)).toBe(computeContentHash(...base))
  })

  it("returns a non-empty string", () => {
    expect(computeContentHash(...base).length).toBeGreaterThan(0)
  })

  it("changes when the URL path changes", () => {
    const a = computeContentHash(0, 3000, 1280, 800, "Title", "/page-a")
    const b = computeContentHash(0, 3000, 1280, 800, "Title", "/page-b")
    expect(a).not.toBe(b)
  })

  it("changes when document height changes (new content loaded)", () => {
    const a = computeContentHash(0, 3000, 1280, 800, "T", "/x")
    const b = computeContentHash(0, 5000, 1280, 800, "T", "/x")
    expect(a).not.toBe(b)
  })

  it("changes when the page title changes", () => {
    const a = computeContentHash(0, 3000, 1280, 800, "Home", "/")
    const b = computeContentHash(0, 3000, 1280, 800, "Dashboard", "/")
    expect(a).not.toBe(b)
  })

  it("buckets scroll to 50px — micro-scrolls within the same bucket share a hash", () => {
    // 100 and 120 both round to the 100-bucket (Math.round(100/50)=2, Math.round(120/50)=2)
    const a = computeContentHash(100, 3000, 1280, 800, "T", "/x")
    const b = computeContentHash(120, 3000, 1280, 800, "T", "/x")
    expect(a).toBe(b)
  })

  it("produces distinct hashes across scroll buckets", () => {
    // 100 (bucket 100) vs 150 (bucket 150) are different buckets
    const a = computeContentHash(100, 3000, 1280, 800, "T", "/x")
    const c = computeContentHash(150, 3000, 1280, 800, "T", "/x")
    expect(a).not.toBe(c)
  })

  it("scrollY=0 is distinct from scrollY=50", () => {
    const a = computeContentHash(0, 3000, 1280, 800, "T", "/x")
    const b = computeContentHash(50, 3000, 1280, 800, "T", "/x")
    expect(a).not.toBe(b)
  })
})

// ── shouldSkipReview ─────────────────────────────────────────────────────────────────────

describe("shouldSkipReview", () => {
  const empty = new Set<string>()
  const MIN = 30_000 // 30s

  it("skips when elapsed time is less than minIntervalMs", () => {
    expect(shouldSkipReview("h", empty, 1000, 1000 + MIN - 1, MIN)).toBe(true)
  })

  it("allows exactly at minIntervalMs boundary", () => {
    expect(shouldSkipReview("h", empty, 1000, 1000 + MIN, MIN)).toBe(false)
  })

  it("allows when well past minIntervalMs with an unseen hash", () => {
    expect(shouldSkipReview("h", empty, 0, 999_999, MIN)).toBe(false)
  })

  it("skips when the hash is already in seenHashes (content unchanged)", () => {
    const seen = new Set(["h1"])
    expect(shouldSkipReview("h1", seen, 0, 999_999, MIN)).toBe(true)
  })

  it("allows when hash is new even though interval has elapsed", () => {
    const seen = new Set(["other"])
    expect(shouldSkipReview("h1", seen, 0, 999_999, MIN)).toBe(false)
  })

  it("interval check takes priority — skips even with an unseen hash if too soon", () => {
    const seen = new Set<string>()
    expect(shouldSkipReview("brand-new", seen, 999_000, 999_001, MIN)).toBe(true)
  })
})

// ── isSignificantNode ────────────────────────────────────────────────────────────────────

/** Helper to build a minimal Element-like mock for pure testing. */
function mockEl(opts: {
  tag?: string
  role?: string
  className?: string
  size?: { w: number; h: number }
  offsetSize?: { w: number; h: number }
}): Element {
  const { tag = "DIV", role, className = "", size, offsetSize } = opts
  return {
    tagName: tag.toUpperCase(),
    getAttribute: (k: string) => (k === "role" ? (role ?? null) : null),
    className,
    getBoundingClientRect: size
      ? () => ({ width: size.w, height: size.h, top: 0, left: 0, bottom: size.h, right: size.w })
      : undefined,
    offsetHeight: offsetSize?.h ?? 0,
    offsetWidth: offsetSize?.w ?? 0,
  } as unknown as Element
}

describe("isSignificantNode", () => {
  it("ignores SCRIPT elements", () => {
    expect(isSignificantNode(mockEl({ tag: "SCRIPT" }))).toBe(false)
  })
  it("ignores STYLE elements", () => {
    expect(isSignificantNode(mockEl({ tag: "STYLE" }))).toBe(false)
  })
  it("ignores META elements", () => {
    expect(isSignificantNode(mockEl({ tag: "META" }))).toBe(false)
  })
  it("ignores NOSCRIPT elements", () => {
    expect(isSignificantNode(mockEl({ tag: "NOSCRIPT" }))).toBe(false)
  })

  it("treats role=dialog as significant", () => {
    expect(isSignificantNode(mockEl({ role: "dialog" }))).toBe(true)
  })
  it("treats role=main as significant", () => {
    expect(isSignificantNode(mockEl({ role: "main" }))).toBe(true)
  })
  it("treats role=complementary as significant", () => {
    expect(isSignificantNode(mockEl({ role: "complementary" }))).toBe(true)
  })
  it("treats role=feed as significant", () => {
    expect(isSignificantNode(mockEl({ role: "feed" }))).toBe(true)
  })

  it("detects modal class-name pattern", () => {
    expect(isSignificantNode(mockEl({ className: "modal-container" }))).toBe(true)
  })
  it("detects chat class-name pattern", () => {
    expect(isSignificantNode(mockEl({ className: "chat-panel" }))).toBe(true)
  })
  it("detects drawer class-name pattern", () => {
    expect(isSignificantNode(mockEl({ className: "right-drawer open" }))).toBe(true)
  })
  it("detects notification class-name pattern", () => {
    expect(isSignificantNode(mockEl({ className: "notification-toast" }))).toBe(true)
  })

  it("treats a large element (100×100) as significant via getBoundingClientRect", () => {
    expect(isSignificantNode(mockEl({ size: { w: 100, h: 100 } }))).toBe(true)
  })
  it("rejects an element just below the 100×100 threshold", () => {
    expect(isSignificantNode(mockEl({ size: { w: 99, h: 100 } }))).toBe(false)
    expect(isSignificantNode(mockEl({ size: { w: 100, h: 99 } }))).toBe(false)
  })

  it("falls back to offsetHeight/Width when getBoundingClientRect is absent", () => {
    expect(isSignificantNode(mockEl({ offsetSize: { w: 200, h: 150 } }))).toBe(true)
    expect(isSignificantNode(mockEl({ offsetSize: { w: 50, h: 50 } }))).toBe(false)
  })

  it("ignores an unstyled empty DIV (no role, no class, no size)", () => {
    expect(isSignificantNode(mockEl({}))).toBe(false)
  })
})

// ── hasSignificantMutations ───────────────────────────────────────────────────────────────

/** Build a minimal MutationRecord-like object for testing. */
function mutRecord(type: "childList" | "attributes" | "characterData", addedNodes: unknown[] = []): MutationRecord {
  return {
    type,
    addedNodes: addedNodes as unknown as NodeList,
    removedNodes: [] as unknown as NodeList,
    target: null as unknown as Node,
    attributeName: null,
    attributeNamespace: null,
    nextSibling: null,
    previousSibling: null,
    oldValue: null,
  } as unknown as MutationRecord
}

/** Build a mock Node with nodeType=1 (ELEMENT_NODE) and the given element properties. */
function mockNode(elOpts: Parameters<typeof mockEl>[0]): Node {
  return { nodeType: 1, ...mockEl(elOpts) } as unknown as Node
}

describe("hasSignificantMutations", () => {
  it("returns false for an empty batch", () => {
    expect(hasSignificantMutations([])).toBe(false)
  })

  it("returns false for attribute-only mutations (type=attributes)", () => {
    expect(hasSignificantMutations([mutRecord("attributes")])).toBe(false)
  })

  it("returns false for character-data mutations (type=characterData)", () => {
    expect(hasSignificantMutations([mutRecord("characterData")])).toBe(false)
  })

  it("returns false when no nodes were added", () => {
    expect(hasSignificantMutations([mutRecord("childList", [])])).toBe(false)
  })

  it("returns true when a dialog element is added", () => {
    const dialog = mockNode({ role: "dialog" })
    expect(hasSignificantMutations([mutRecord("childList", [dialog])])).toBe(true)
  })

  it("returns true when a large-area element is added", () => {
    const bigDiv = mockNode({ size: { w: 400, h: 300 } })
    expect(hasSignificantMutations([mutRecord("childList", [bigDiv])])).toBe(true)
  })

  it("returns false when only a small SPAN is added", () => {
    const span = mockNode({ tag: "SPAN", size: { w: 50, h: 20 } })
    expect(hasSignificantMutations([mutRecord("childList", [span])])).toBe(false)
  })

  it("returns false when only a SCRIPT element is added", () => {
    const script = mockNode({ tag: "SCRIPT" })
    expect(hasSignificantMutations([mutRecord("childList", [script])])).toBe(false)
  })

  it("returns false for a text node added (nodeType !== 1)", () => {
    const textNode = { nodeType: 3 } as unknown as Node
    expect(hasSignificantMutations([mutRecord("childList", [textNode])])).toBe(false)
  })

  it("returns true when at least one of several mutations is significant", () => {
    const small = mockNode({ tag: "SPAN", size: { w: 20, h: 10 } })
    const modal = mockNode({ className: "modal-overlay" })
    expect(hasSignificantMutations([
      mutRecord("childList", [small]),
      mutRecord("childList", [modal]),
    ])).toBe(true)
  })

  it("returns false when all added nodes are insignificant", () => {
    const a = mockNode({ tag: "SPAN", size: { w: 10, h: 10 } })
    const b = mockNode({ tag: "SPAN", size: { w: 20, h: 20 } })
    expect(hasSignificantMutations([mutRecord("childList", [a, b])])).toBe(false)
  })
})
