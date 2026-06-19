import { describe, it, expect } from "vitest"
import { parseScriptConfig, gateMessage, isFirstParty, buildFeedbackForm } from "../src/widget-lib"

describe("parseScriptConfig", () => {
  it("reads data-project and derives backend origin from src", () => {
    const cfg = parseScriptConfig({ dataset: { project: "P1" }, src: "https://klavity.quantana.top/widget.js?v=1" })
    expect(cfg.projectId).toBe("P1")
    expect(cfg.backendUrl).toBe("https://klavity.quantana.top")
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
})
