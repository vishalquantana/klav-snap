import { test, expect } from "bun:test"
import { decideFromVision, type VisionResult } from "./trails-vision"

const base = (o: Partial<VisionResult>): VisionResult => ({ found: true, selector: "#x", confidence: 0.95, classification: "moved", rationale: "moved down", ...o })

test("removed classification → regression, never a heal", () => {
  const d = decideFromVision(base({ classification: "removed", found: false, selector: null }))
  expect(d.outcome).toBe("regression")
  expect(d.selector).toBeNull()
  expect(d.diagnosis).toBe("regression")
})

test("found + high confidence + not removed → heal (locator_drift)", () => {
  const d = decideFromVision(base({ confidence: 0.95 }))
  expect(d.outcome).toBe("heal")
  expect(d.selector).toBe("#x")
  expect(d.diagnosis).toBe("locator_drift")
})

test("found but below gate → amber_low_conf (file for review, never pass)", () => {
  const d = decideFromVision(base({ confidence: 0.7 }))
  expect(d.outcome).toBe("amber_low_conf")
  expect(d.diagnosis).toBe("locator_drift")
})

test("custom gate is honored", () => {
  expect(decideFromVision(base({ confidence: 0.85 }), 0.8).outcome).toBe("heal")
  expect(decideFromVision(base({ confidence: 0.85 }), 0.9).outcome).toBe("amber_low_conf")
})
