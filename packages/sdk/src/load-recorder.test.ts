import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { resolveRecorderUrl, injectRecorderScript, __resetRecorderLoaderForTests, type RrwebGlobal } from "./load-recorder"

describe("resolveRecorderUrl", () => {
  it("resolves the vendor path against the cross-origin backend, not the host page", () => {
    expect(resolveRecorderUrl("https://klavity.quantana.top"))
      .toBe("https://klavity.quantana.top/vendor/klv-buffer.min.js")
  })
  it("tolerates a trailing slash on backendUrl (no double slash)", () => {
    expect(resolveRecorderUrl("https://klavity.quantana.top/"))
      .toBe("https://klavity.quantana.top/vendor/klv-buffer.min.js")
  })
  it("handles empty backendUrl without throwing", () => {
    expect(resolveRecorderUrl("")).toBe("/vendor/klv-buffer.min.js")
  })
})

describe("injectRecorderScript", () => {
  let appended: any[]
  beforeEach(() => {
    __resetRecorderLoaderForTests()
    appended = []
    const w = globalThis as any
    delete w.rrweb
    // Minimal DOM stub: createElement returns an object whose onload we can fire on append.
    const head = {
      appendChild(node: any) {
        appended.push(node)
        // Simulate async script load on next microtask, letting the test set window.rrweb first.
        Promise.resolve().then(() => node.__fire && node.__fire())
      },
    }
    vi.stubGlobal("document", {
      head,
      documentElement: head,
      createElement: () => {
        const node: any = { tagName: "SCRIPT" }
        node.__fire = () => node.onload && node.onload()
        return node
      },
    })
    vi.stubGlobal("window", w)
  })
  afterEach(() => { vi.unstubAllGlobals(); __resetRecorderLoaderForTests() })

  it("resolves with the rrweb global once the script loads", async () => {
    const fake: RrwebGlobal = { record: () => () => {} }
    // When the injected script 'loads', it has set window.rrweb.
    const head = (document as any).head
    const orig = head.appendChild
    head.appendChild = (node: any) => {
      ;(globalThis as any).rrweb = fake
      orig.call(head, node)
    }
    const g = await injectRecorderScript("https://b.example")
    expect(g).toBe(fake)
    expect(appended.length).toBe(1)
    expect(appended[0].src).toBe("https://b.example/vendor/klv-buffer.min.js")
  })

  it("resolves null when the script loads but exposes no record fn", async () => {
    const g = await injectRecorderScript("https://b.example")
    expect(g).toBeNull()
  })

  it("resolves null on script error and never throws", async () => {
    const head = (document as any).head
    head.appendChild = (node: any) => { Promise.resolve().then(() => node.onerror && node.onerror()) }
    const g = await injectRecorderScript("https://b.example")
    expect(g).toBeNull()
  })

  it("injects the script only once and reuses the cached promise", async () => {
    const p1 = injectRecorderScript("https://b.example")
    const p2 = injectRecorderScript("https://b.example")
    expect(p1).toBe(p2)
    await p1
    expect(appended.length).toBe(1)
  })

  it("short-circuits to an already-present rrweb global without injecting", async () => {
    const fake: RrwebGlobal = { record: () => () => {} }
    ;(globalThis as any).rrweb = fake
    const g = await injectRecorderScript("https://b.example")
    expect(g).toBe(fake)
    expect(appended.length).toBe(0)
  })
})
