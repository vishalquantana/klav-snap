import { describe, it, expect } from "vitest"
import { parseScriptConfig, gateMessage, isFirstParty, buildFeedbackForm } from "../src/widget-lib"

describe("parseScriptConfig", () => {
  it("reads data-project and derives backend origin from src", () => {
    const cfg = parseScriptConfig({ dataset: { project: "P1" }, src: "https://klavity.quantana.top/widget.js?v=1" })
    expect(cfg.projectId).toBe("P1")
    expect(cfg.backendUrl).toBe("https://klavity.quantana.top")
    expect(cfg.identity).toBeUndefined()
    expect(cfg.metadata).toBeUndefined()
  })

  it("parses data-user-* identity and data-meta JSON metadata (G5)", () => {
    const cfg = parseScriptConfig({
      dataset: { project: "P1", userId: "u_42", userEmail: "a@b.com", userName: "Ada", meta: '{"plan":"pro","tenant":"acme"}' },
      src: "https://klavity.quantana.top/widget.js",
    })
    expect(cfg.identity).toEqual({ id: "u_42", email: "a@b.com", name: "Ada" })
    expect(cfg.metadata).toEqual({ plan: "pro", tenant: "acme" })
  })

  it("ignores malformed data-meta without throwing (G5)", () => {
    const cfg = parseScriptConfig({ dataset: { project: "P1", meta: "{not json" }, src: "https://klavity.quantana.top/widget.js" })
    expect(cfg.metadata).toBeUndefined()
  })
})

describe("gateMessage", () => {
  it("maps known reasons to friendly copy", () => {
    expect(gateMessage("offAllowlist")).toMatch(/watch list/i)
    expect(gateMessage("budgetExhausted")).toMatch(/budget/i)
    expect(gateMessage("paused")).toMatch(/paused/i)
    expect(gateMessage("anythingElse")).toMatch(/couldn.t run/i)
  })
})

describe("isFirstParty", () => {
  it("true when script origin equals backend origin", () => {
    expect(isFirstParty("https://klavity.quantana.top", "https://klavity.quantana.top")).toBe(true)
  })
  it("false for a customer origin", () => {
    expect(isFirstParty("https://app.acme.com", "https://klavity.quantana.top")).toBe(false)
  })
})

describe("buildFeedbackForm", () => {
  it("includes text fields and decodes a data-url screenshot to a Blob", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo=" // tiny valid base64
    const fd = buildFeedbackForm({ description: "bug", pageUrl: "https://x/y", projectId: "p1", screenshots: [png] })
    expect(fd.get("description")).toBe("bug")
    expect(fd.get("page_url")).toBe("https://x/y")
    expect(fd.get("project_id")).toBe("p1")
    const shot = fd.getAll("screenshots")[0] as File
    expect(shot).toBeInstanceOf(Blob)
    expect((shot as File).type).toBe("image/png")
  })
  it("attaches replay_events as a JSON array when present", () => {
    const events = [{ type: 4, timestamp: 1 }, { type: 2, timestamp: 2 }, { type: 3, timestamp: 3 }]
    const fd = buildFeedbackForm({ description: "bug", pageUrl: "https://x/y", projectId: "p1", screenshots: [], replayEvents: events })
    const raw = fd.get("replay_events")
    expect(typeof raw).toBe("string")
    expect(JSON.parse(raw as string)).toHaveLength(3)
  })
  it("omits replay_events when the buffer is empty/absent", () => {
    const fd = buildFeedbackForm({ description: "bug", pageUrl: "https://x/y", projectId: "p1", screenshots: [] })
    expect(fd.get("replay_events")).toBeNull()
    const fd2 = buildFeedbackForm({ description: "bug", pageUrl: "https://x/y", projectId: "p1", screenshots: [], replayEvents: [] })
    expect(fd2.get("replay_events")).toBeNull()
  })
})
