// Unit tests for the in-process fixed-window rate limiter. Deterministic via the injected `now`.
import { test, expect, beforeEach } from "bun:test"
import { allow, record, count, retryAfterMs, clear, _resetAll } from "./ratelimit"

beforeEach(() => _resetAll())

test("allow permits up to limit then blocks within the window", () => {
  const t0 = 1_000_000
  expect(allow("k", 3, 1000, t0)).toBe(true)   // 1
  expect(allow("k", 3, 1000, t0)).toBe(true)   // 2
  expect(allow("k", 3, 1000, t0)).toBe(true)   // 3
  expect(allow("k", 3, 1000, t0)).toBe(false)  // 4 — over
  expect(allow("k", 3, 1000, t0)).toBe(false)
})

test("window resets after windowMs elapses", () => {
  const t0 = 2_000_000
  expect(allow("k", 1, 1000, t0)).toBe(true)
  expect(allow("k", 1, 1000, t0)).toBe(false)
  expect(allow("k", 1, 1000, t0 + 1000)).toBe(true) // new window
})

test("keys are independent", () => {
  const t0 = 3_000_000
  expect(allow("a", 1, 1000, t0)).toBe(true)
  expect(allow("a", 1, 1000, t0)).toBe(false)
  expect(allow("b", 1, 1000, t0)).toBe(true) // different key unaffected
})

test("record increments a failure counter; count peeks without incrementing", () => {
  const t0 = 4_000_000
  expect(count("f", t0)).toBe(0)
  expect(record("f", 1000, t0)).toBe(1)
  expect(record("f", 1000, t0)).toBe(2)
  expect(count("f", t0)).toBe(2) // peek, no increment
  expect(count("f", t0)).toBe(2)
})

test("clear resets a failure counter (success path)", () => {
  const t0 = 5_000_000
  record("f", 1000, t0); record("f", 1000, t0)
  expect(count("f", t0)).toBe(2)
  clear("f")
  expect(count("f", t0)).toBe(0)
})

test("retryAfterMs reflects remaining window", () => {
  const t0 = 6_000_000
  allow("k", 1, 1000, t0)
  expect(retryAfterMs("k", t0)).toBe(1000)
  expect(retryAfterMs("k", t0 + 400)).toBe(600)
  expect(retryAfterMs("k", t0 + 1000)).toBe(0) // expired
})

test("lockout pattern: count gate + record on failure + clear on success", () => {
  const t0 = 7_000_000
  const MAX = 5
  const key = "otpfail:u@x:1.2.3.4"
  // 5 failures
  for (let i = 0; i < MAX; i++) {
    expect(count(key, t0) >= MAX).toBe(false) // not yet locked
    record(key, 1000, t0)
  }
  expect(count(key, t0) >= MAX).toBe(true) // now locked
  clear(key) // successful verify elsewhere would clear
  expect(count(key, t0) >= MAX).toBe(false)
})
