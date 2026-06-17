// P3b focused tests: the atomic per-project-per-day budget cap + prefix/glob URL matching.
// Hermetic: point the module's `db` singleton at a fresh LOCAL libsql file by setting
// TURSO_DATABASE_URL *before* importing ./db (the client is created at import time).
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-budget-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const {
  db, applySchema, tryConsumeReviewBudget, reviewBudgetUsed,
  addMonitoredUrl, matchMonitored, patternMatchesUrl, setMonitoredUrlEnabled, listMonitoredUrls,
} = await import("./db")

await applySchema(db!)

test("tryConsumeReviewBudget: allows up to budget, then blocks (atomic cap)", async () => {
  const pid = "proj_budget_a"
  const day = "2026-06-17"
  const budget = 3
  // First `budget` calls succeed and increment the counter 1..3.
  expect(await tryConsumeReviewBudget(pid, day, budget)).toBe(true)
  expect(await tryConsumeReviewBudget(pid, day, budget)).toBe(true)
  expect(await tryConsumeReviewBudget(pid, day, budget)).toBe(true)
  expect(await reviewBudgetUsed(pid, day)).toBe(3)
  // At cap → all further calls deny and the count does NOT exceed the budget.
  expect(await tryConsumeReviewBudget(pid, day, budget)).toBe(false)
  expect(await tryConsumeReviewBudget(pid, day, budget)).toBe(false)
  expect(await reviewBudgetUsed(pid, day)).toBe(3)
})

test("tryConsumeReviewBudget: per-(project,day) isolation + zero/negative budget always denies", async () => {
  const day = "2026-06-18"
  expect(await tryConsumeReviewBudget("proj_x", day, 1)).toBe(true)
  expect(await tryConsumeReviewBudget("proj_x", day, 1)).toBe(false) // x capped
  expect(await tryConsumeReviewBudget("proj_y", day, 1)).toBe(true)  // y independent
  expect(await tryConsumeReviewBudget("proj_x", "2026-06-19", 1)).toBe(true) // next day resets
  expect(await tryConsumeReviewBudget("proj_z", day, 0)).toBe(false) // budget 0 → deny
  expect(await tryConsumeReviewBudget("proj_z", day, -5)).toBe(false)
})

test("tryConsumeReviewBudget: concurrent calls never exceed the cap", async () => {
  const pid = "proj_concurrent"
  const day = "2026-06-20"
  const budget = 10
  const results = await Promise.all(Array.from({ length: 50 }, () => tryConsumeReviewBudget(pid, day, budget)))
  const granted = results.filter(Boolean).length
  expect(granted).toBe(budget)
  expect(await reviewBudgetUsed(pid, day)).toBe(budget)
})

test("patternMatchesUrl: prefix/glob only (no regex), host+path, query/fragment stripped", () => {
  // plain prefix on a path boundary
  expect(patternMatchesUrl("app.example.com/billing", "https://app.example.com/billing/invoices?x=1")).toBe(true)
  expect(patternMatchesUrl("app.example.com/billing", "https://app.example.com/billing")).toBe(true)
  expect(patternMatchesUrl("app.example.com/billing", "https://app.example.com/billingABC")).toBe(false) // boundary
  expect(patternMatchesUrl("app.example.com/billing", "https://app.example.com/dashboard")).toBe(false)
  // scheme + trailing slash + query/fragment are normalized away
  expect(patternMatchesUrl("app.example.com/", "https://app.example.com")).toBe(true)
  expect(patternMatchesUrl("app.example.com/x", "http://app.example.com/x/#frag")).toBe(true)
  // glob wildcard
  expect(patternMatchesUrl("app.example.com/*/settings", "https://app.example.com/team/settings")).toBe(true)
  expect(patternMatchesUrl("app.example.com/*/settings", "https://app.example.com/team/billing")).toBe(false)
  // regex metacharacters are treated literally (NOT regex)
  expect(patternMatchesUrl("app.example.com/a.b", "https://app.example.com/aXb")).toBe(false)
  expect(patternMatchesUrl("app.example.com/a.b", "https://app.example.com/a.b")).toBe(true)
  // different host never matches
  expect(patternMatchesUrl("app.example.com/x", "https://evil.com/x")).toBe(false)
  // empty pattern never matches
  expect(patternMatchesUrl("", "https://app.example.com/x")).toBe(false)
})

test("matchMonitored: returns first ENABLED allowlist match, else null", async () => {
  const pid = "proj_match"
  await addMonitoredUrl(pid, "app.acme.com/billing")
  const offId = await addMonitoredUrl(pid, "app.acme.com/secret")
  // disable the /secret pattern → must not match even though the URL would
  const rows = await listMonitoredUrls(pid)
  const secret = rows.find(r => r.urlPattern === "app.acme.com/secret")!
  await setMonitoredUrlEnabled(pid, secret.id, false)

  const m = await matchMonitored(pid, "https://app.acme.com/billing/plan")
  expect(m?.urlPattern).toBe("app.acme.com/billing")
  expect(await matchMonitored(pid, "https://app.acme.com/secret/x")).toBeNull() // disabled
  expect(await matchMonitored(pid, "https://app.acme.com/other")).toBeNull()    // no pattern
  expect(await matchMonitored("proj_no_rules", "https://app.acme.com/billing")).toBeNull()
})
