// prototype/lib/expectations.test.ts
import { test, expect } from "bun:test"
import { mergeSource, shouldValidate, nextStatus, matchExpectation, RECURRENCE_VALIDATE_N } from "./expectations"

test("mergeSource sets the flag and bumps recurrence", () => {
  const c0 = { snap: false, sim: false, recurrence: 0 }
  const c1 = mergeSource(c0, "snap")
  expect(c1).toEqual({ snap: true, sim: false, recurrence: 1 })
  const c2 = mergeSource(c1, "sim")
  expect(c2).toEqual({ snap: true, sim: true, recurrence: 2 })
})

test("shouldValidate: cross-source agreement OR recurrence>=N", () => {
  expect(shouldValidate({ snap: true, sim: true, recurrence: 1 })).toBe(true)
  expect(shouldValidate({ snap: true, sim: false, recurrence: 1 })).toBe(false)
  expect(shouldValidate({ snap: false, sim: true, recurrence: RECURRENCE_VALIDATE_N })).toBe(true)
})

test("nextStatus promotes candidate only; enforced is terminal", () => {
  expect(nextStatus("candidate", { snap: true, sim: true, recurrence: 2 })).toBe("validated")
  expect(nextStatus("candidate", { snap: true, sim: false, recurrence: 1 })).toBe("candidate")
  expect(nextStatus("enforced", { snap: true, sim: true, recurrence: 9 })).toBe("enforced")
})

test("matchExpectation finds a lexical near-duplicate, else null", () => {
  const existing = [{ id: "e1", title: "Finish button missing on onboarding" }]
  expect(matchExpectation({ title: "finish button is missing on the onboarding screen" }, existing)).toBe("e1")
  expect(matchExpectation({ title: "Payment gateway integration request" }, existing)).toBe(null)
})
