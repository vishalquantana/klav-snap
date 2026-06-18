import { describe, it, expect } from "vitest"
import { parseScriptConfig, gateMessage } from "../src/widget-lib"

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
