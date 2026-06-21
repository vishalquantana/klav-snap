import { test, expect } from "bun:test"
import { initialFeedbackStatus } from "./db"

test("high severity is auto-accepted as an open bug", () => {
  expect(initialFeedbackStatus("high")).toBe("open")
})

test("non-high severity lands in the triage queue as new", () => {
  expect(initialFeedbackStatus("medium")).toBe("new")
  expect(initialFeedbackStatus("low")).toBe("new")
  expect(initialFeedbackStatus(null)).toBe("new")
  expect(initialFeedbackStatus(undefined)).toBe("new")
})
