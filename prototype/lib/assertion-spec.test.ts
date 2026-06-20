import { test, expect } from "bun:test"
import { validateAssertionDraft } from "./assertion-spec"

test("accepts a visible-assert with a target", () => {
  const d = validateAssertionDraft({ trailId: "trl_1", afterStepIdx: 2, action: "assert",
    target: { role: "button", name: "Finish" }, checkpoint: { kind: "visible", description: "Finish button is visible" } })
  expect(d).not.toBeNull()
  expect(d!.target.name).toBe("Finish")
})

test("rejects empty target or non-visible checkpoint", () => {
  expect(validateAssertionDraft({ trailId: "t", afterStepIdx: 0, action: "assert", target: {}, checkpoint: { kind: "visible", description: "x" } })).toBeNull()
  expect(validateAssertionDraft({ trailId: "t", afterStepIdx: 0, action: "assert", target: { text: "Finish" }, checkpoint: { kind: "textPresent", description: "x" } })).toBeNull()
})
