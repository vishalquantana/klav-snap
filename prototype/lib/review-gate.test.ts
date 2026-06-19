// P3b focused test: the /api/sim/review guardrail ORDERING (§5, binding). reviewGate is a pure decision
// function over already-resolved state, so we can assert the exact first-failing gate + reason for each
// combination WITHOUT mocking HTTP/AI/S3 — and assert that a fully-allowed call proceeds (ok:true).
import { test, expect } from "bun:test"
import { reviewGate, reviewDedupeKey, reviewDay, type ReviewGateInput, type ReviewGateResult } from "./db"

// A state where EVERY gate passes; each test flips exactly one earlier gate to assert ordering.
const ALLOW: ReviewGateInput = {
  authed: true, reviewMode: "auto", consentStatus: "granted",
  allowlistMatch: true, alreadyReviewed: false, budgetConsumed: true,
}

test("fully-allowed call proceeds", () => {
  const r = reviewGate(ALLOW)
  expect(r.ok).toBe(true)
})

test("gate ordering: each blocked reason fires in order a→f", () => {
  // a. auth — unauthenticated blocks first even if everything else would also fail.
  expect(reviewGate({ ...ALLOW, authed: false, reviewMode: "paused", consentStatus: "revoked", allowlistMatch: false, alreadyReviewed: true, budgetConsumed: false }))
    .toMatchObject({ ok: false, reason: "unauthorized", status: 401 })
  // b. admin pause (review_mode==='paused') blocks before consent/allowlist/dedupe/budget.
  expect(reviewGate({ ...ALLOW, reviewMode: "paused", consentStatus: "revoked", allowlistMatch: false, alreadyReviewed: true, budgetConsumed: false }))
    .toMatchObject({ ok: false, reason: "paused", status: 423 })
  // b. user pause (consent 'paused') and revoke both block at the user-pause gate, before consent-granted.
  expect(reviewGate({ ...ALLOW, consentStatus: "paused", allowlistMatch: false, alreadyReviewed: true, budgetConsumed: false }))
    .toMatchObject({ ok: false, reason: "userPaused", status: 423 })
  expect(reviewGate({ ...ALLOW, consentStatus: "revoked" }))
    .toMatchObject({ ok: false, reason: "userPaused", status: 423 })
  // c. consent must be 'granted' — null/absent consent → needsConsent (before allowlist).
  expect(reviewGate({ ...ALLOW, consentStatus: null, allowlistMatch: false, alreadyReviewed: true, budgetConsumed: false }))
    .toMatchObject({ ok: false, reason: "needsConsent", status: 412 })
  // d. ALLOWLIST-ONLY — off-allowlist blocks before dedupe/budget (never review off-allowlist).
  expect(reviewGate({ ...ALLOW, allowlistMatch: false, alreadyReviewed: true, budgetConsumed: false }))
    .toMatchObject({ ok: false, reason: "offAllowlist", status: 403 })
  // e. dedupe — already reviewed short-circuits (200) before budget is consumed.
  expect(reviewGate({ ...ALLOW, alreadyReviewed: true, budgetConsumed: false }))
    .toMatchObject({ ok: false, reason: "alreadyReviewed", status: 200 })
  // f. budget — only reached when a–e pass; exhausted → budgetExhausted (429).
  expect(reviewGate({ ...ALLOW, budgetConsumed: false }))
    .toMatchObject({ ok: false, reason: "budgetExhausted", status: 429 })
})

test("allowlist gate is binding regardless of consent/budget (never review off-allowlist)", () => {
  // Even fully consented + budget available, an off-allowlist URL is refused.
  expect(reviewGate({ ...ALLOW, allowlistMatch: false }))
    .toMatchObject({ ok: false, reason: "offAllowlist" })
})

test("reviewDedupeKey: stable per (sim,path,domSig); path normalized, domSig participates", () => {
  expect(reviewDedupeKey("sim_1", "/billing/", "abc")).toBe(reviewDedupeKey("sim_1", "/billing", "abc"))
  expect(reviewDedupeKey("sim_1", "/Billing", "abc")).toBe("sim_1|/billing|abc")
  // different dom signature → different key (page changed → re-review allowed)
  expect(reviewDedupeKey("sim_1", "/billing", "abc")).not.toBe(reviewDedupeKey("sim_1", "/billing", "xyz"))
  // different sim → different key
  expect(reviewDedupeKey("sim_1", "/billing", "abc")).not.toBe(reviewDedupeKey("sim_2", "/billing", "abc"))
  // absent domSig → path-level dedupe ('' sig)
  expect(reviewDedupeKey("sim_1", "/billing", null)).toBe("sim_1|/billing|")
})

test("reviewDay: UTC YYYY-MM-DD", () => {
  expect(reviewDay(Date.UTC(2026, 5, 17, 23, 59))).toBe("2026-06-17")
  expect(/^\d{4}-\d{2}-\d{2}$/.test(reviewDay())).toBe(true)
})

// ── Ad-hoc bypass tests (Task 1) ──────────────────────────────────────────────────────────────────

const base = {
  authed: true,
  reviewMode: 'auto' as string | null,
  consentStatus: 'granted' as string | null,
  allowlistMatch: true,
  alreadyReviewed: false,
  budgetConsumed: true,
}

test('adhoc bypasses allowlist, consent, pause and dedupe when authed + budget', () => {
  const r = reviewGate({
    ...base,
    adhoc: true,
    reviewMode: 'paused',
    consentStatus: null,
    allowlistMatch: false,
    alreadyReviewed: true,
  })
  expect(r.ok).toBe(true)
})

test('adhoc still blocks when not authed', () => {
  const r = reviewGate({ ...base, adhoc: true, authed: false })
  expect(r).toEqual({ ok: false, reason: 'unauthorized', status: 401, message: 'Sign in to continue.' })
})

test('adhoc still blocks when budget exhausted', () => {
  const r = reviewGate({ ...base, adhoc: true, allowlistMatch: false, budgetConsumed: false })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.reason).toBe('budgetExhausted')
})

test('non-adhoc behaviour unchanged (off-allowlist still blocks)', () => {
  const r = reviewGate({ ...base, allowlistMatch: false })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.reason).toBe('offAllowlist')
})

// ── End Ad-hoc bypass tests ───────────────────────────────────────────────────────────────────────

test("content-sig dedup: same (sim,path,sig) spends budget at most once", () => {
  // Two review attempts arrive for the same sim+urlPath with the SAME content signature.
  // The dedupe key is identical for both, so the seen-set hit on attempt 2 means alreadyReviewed=true
  // and the gate returns 'alreadyReviewed' (200) WITHOUT consuming budget a second time.
  const simId = "sim_abc"
  const urlPath = "/billing/"
  const contentSig = "sha256-opaque-content-hash-v1"

  // Shared seen-set (like the endpoint maintains per-project-day, or in-memory for the pure logic test).
  const seen = new Set<string>()

  // Budget counter: tracks how many times a slot would be consumed.
  let budgetConsumeCount = 0
  const BASE: Omit<ReviewGateInput, "alreadyReviewed" | "budgetConsumed"> = {
    authed: true,
    reviewMode: "auto",
    consentStatus: "granted",
    allowlistMatch: true,
  }

  // Helper: simulate one review attempt using the same pure helpers the endpoint uses.
  function attempt(): ReviewGateResult {
    const key = reviewDedupeKey(simId, urlPath, contentSig)
    const alreadyReviewed = seen.has(key)
    // Budget is "consumed" (slot taken) only if not already reviewed — mirrors real endpoint logic
    // where tryConsumeReviewBudget is only called after the dedupe gate passes.
    const budgetConsumed = !alreadyReviewed ? (budgetConsumeCount++, true) : false
    const result = reviewGate({ ...BASE, alreadyReviewed, budgetConsumed })
    if (result.ok) seen.add(key)
    return result
  }

  // Attempt 1: fresh — gate should pass (ok:true) and consume budget once.
  const r1 = attempt()
  expect(r1.ok).toBe(true)
  expect(budgetConsumeCount).toBe(1)
  // The key is now in the seen-set.
  expect(seen.has(reviewDedupeKey(simId, urlPath, contentSig))).toBe(true)

  // Attempt 2: identical sig — gate must return alreadyReviewed (200), budget NOT consumed again.
  const r2 = attempt()
  expect(r2).toMatchObject({ ok: false, reason: "alreadyReviewed", status: 200 })
  expect(budgetConsumeCount).toBe(1) // still 1 — no second spend

  // Sanity: a DIFFERENT sig on the same (sim,path) gets its own key and IS allowed through.
  const key2 = reviewDedupeKey(simId, urlPath, "sha256-different-hash")
  expect(seen.has(key2)).toBe(false)
  const r3 = reviewGate({ ...BASE, alreadyReviewed: false, budgetConsumed: true })
  expect(r3.ok).toBe(true)
})
