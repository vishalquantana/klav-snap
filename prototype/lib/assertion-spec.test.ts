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

test("rejects missing or empty trailId", () => {
  expect(validateAssertionDraft({ trailId: "", afterStepIdx: 0, action: "assert", target: { text: "x" }, checkpoint: { kind: "visible", description: "y" } })).toBeNull()
})

test("rejects non-assert action", () => {
  expect(validateAssertionDraft({ trailId: "t", afterStepIdx: 0, action: "click", target: { text: "x" }, checkpoint: { kind: "visible", description: "y" } })).toBeNull()
})

test("rejects negative or non-finite afterStepIdx", () => {
  expect(validateAssertionDraft({ trailId: "t", afterStepIdx: -1, action: "assert", target: { text: "x" }, checkpoint: { kind: "visible", description: "y" } })).toBeNull()
  expect(validateAssertionDraft({ trailId: "t", afterStepIdx: NaN, action: "assert", target: { text: "x" }, checkpoint: { kind: "visible", description: "y" } })).toBeNull()
})

test("rejects blank checkpoint description", () => {
  expect(validateAssertionDraft({ trailId: "t", afterStepIdx: 0, action: "assert", target: { text: "x" }, checkpoint: { kind: "visible", description: "   " } })).toBeNull()
})
