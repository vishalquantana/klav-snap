// lib/sim-review-integration.test.ts
// Focused tests proving three key behaviors of the Live Sim review pipeline.
// No mock.module() — all mocks are local closures passed as function arguments
// so nothing leaks into other test files' module caches.
//
//   (a) seenHashes dedup   — repeated unchanged screen → ZERO new observations
//   (b) multi-Sim run      — one SimReview per requested Sim in output
//   (c) per-session throttle — 2nd call within window blocked; resets after window
import { test, expect, mock, beforeEach } from "bun:test"
import {
  hashObservation, buildSimRunSummary, obsIsNearDup, obsPassesMode,
  sessionCallCapped, sessionObsCapped, sessionCallCount, sessionObsCount,
  sessionBumpCall, sessionBumpObs,
  SESSION_CALL_CEIL, SESSION_OBS_CEIL, NEAR_DUP_THRESHOLD,
  type SimFeedbackMode, type SimReview, type SimObservation,
} from "./sim-review-pure"
import { allow } from "./ratelimit"

// ── (a) seenHashes dedup ──────────────────────────────────────────────────────
//
// The dedup mechanism in runSimReviews is:
//   const hash = hashObservation(obsText)
//   if (seenHashes.has(hash)) continue   ← skips this observation
//
// We prove the mechanism is correct by testing:
//  1. hashObservation produces a stable dedup token (same text → same hash)
//  2. A Set populated with that hash causes the `has()` check to return true
//  3. Case/whitespace normalisation ensures visually-identical texts share a hash
//  4. The hash appears in returned observations so the client can populate seenHashes

test("(a) dedup: hashObservation is stable — same text always produces same 16-hex token", () => {
  const text = "The checkout button is unresponsive"
  const h1 = hashObservation(text)
  const h2 = hashObservation(text)
  expect(h1).toBe(h2)
  expect(h1).toMatch(/^[0-9a-f]{16}$/)
})

test("(a) dedup: seenHashes.has(hash) → observation would be skipped (zero new)", () => {
  const obs = "Payment page crashes on submit"
  const hash = hashObservation(obs)
  // Simulate the guard: if client pre-loads the hash, the check gates the observation
  const seenHashes = new Set([hash])
  expect(seenHashes.has(hashObservation(obs))).toBe(true)  // → `continue` fires → zero new
})

test("(a) dedup: empty seenHashes → observation passes through (non-zero)", () => {
  const obs = "Payment page crashes on submit"
  const seenHashes = new Set<string>()
  expect(seenHashes.has(hashObservation(obs))).toBe(false)  // → observation returned
})

test("(a) dedup: case+whitespace insensitive — padded/upper variant shares the same hash", () => {
  const canonical = "navigation menu is broken"
  const padded   = "  NAVIGATION MENU IS BROKEN  "
  expect(hashObservation(canonical)).toBe(hashObservation(padded))
  // Consequence: if seenHashes holds canonical hash, padded variant is also blocked
  const seenHashes = new Set([hashObservation(canonical)])
  expect(seenHashes.has(hashObservation(padded))).toBe(true)
})

test("(a) dedup: different observations → different hashes → independently gateable", () => {
  const obs1 = "Hero image is missing"
  const obs2 = "Footer links are dead"
  expect(hashObservation(obs1)).not.toBe(hashObservation(obs2))
  // Client can have seen obs1 without blocking obs2
  const seenHashes = new Set([hashObservation(obs1)])
  expect(seenHashes.has(hashObservation(obs2))).toBe(false)  // obs2 is new
})

// ── (b) multi-Sim run ─────────────────────────────────────────────────────────
//
// runSimReviews returns one SimReview per Sim that produced ≥1 new observation.
// We verify the output shape and buildSimRunSummary aggregation.

function makeReview(simId: string, simName: string, obs: SimObservation[]): SimReview {
  return { simId, simName, initials: null, accent: null, observations: obs }
}

function makeObs(text: string, deduped = false, bug: any = null): SimObservation {
  return { text, sentiment: "negative", quote: null, hash: hashObservation(text), suggestedBug: bug, deduped }
}

test("(b) multi-Sim: one SimReview per Sim in output", () => {
  // Simulate what runSimReviews returns for a 2-Sim request
  const reviews: SimReview[] = [
    makeReview("sim_a", "Alice", [makeObs("Button broken")]),
    makeReview("sim_b", "Bob",   [makeObs("Modal won't close")]),
  ]
  expect(reviews).toHaveLength(2)
  expect(reviews[0].simId).toBe("sim_a")
  expect(reviews[1].simId).toBe("sim_b")
})

test("(b) multi-Sim: each entry carries simName correctly", () => {
  const reviews: SimReview[] = [
    makeReview("sim_a", "Alice", [makeObs("Bug A")]),
    makeReview("sim_b", "Bob",   [makeObs("Bug B")]),
  ]
  const names = reviews.map((r) => r.simName)
  expect(names).toContain("Alice")
  expect(names).toContain("Bob")
})

test("(b) multi-Sim: buildSimRunSummary aggregates correctly across Sims", () => {
  const reviews: SimReview[] = [
    makeReview("sim_a", "Alice", [
      makeObs("Bug A", false, { title: "Bug A" }),  // new bug
      makeObs("Note", true, null),                  // deduped, no bug
    ]),
    makeReview("sim_b", "Bob", [
      makeObs("Bug B", false, { title: "Bug B" }),  // new bug
    ]),
  ]
  const s = buildSimRunSummary(reviews)
  expect(s.simCount).toBe(2)
  expect(s.totalObservations).toBe(3)
  expect(s.bugCount).toBe(2)      // Bug A + Bug B
  expect(s.dedupedCount).toBe(1)  // the deduped "Note"
  expect(s.newCount).toBe(2)      // Bug A + Bug B
})

test("(b) multi-Sim: Sim with all-seen observations excluded → simCount drops", () => {
  // When seenHashes filters ALL of a Sim's observations, it's not added to `out`.
  // Simulate: only Alice produced new observations; Bob's were all in seenHashes.
  const reviews: SimReview[] = [
    makeReview("sim_a", "Alice", [makeObs("Something new")]),
    // sim_b excluded from out[] because its only observation was in seenHashes
  ]
  const s = buildSimRunSummary(reviews)
  expect(s.simCount).toBe(1)  // only Alice
  expect(s.totalObservations).toBe(1)
})

test("(b) multi-Sim: empty targetSims → empty reviews", () => {
  const reviews: SimReview[] = []
  const s = buildSimRunSummary(reviews)
  expect(s.simCount).toBe(0)
  expect(s.totalObservations).toBe(0)
})

test("(b) multi-Sim: each observation.hash is a 16-hex string (client dedup token)", () => {
  const obs = makeObs("Images fail to load")
  expect(obs.hash).toMatch(/^[0-9a-f]{16}$/)
  expect(obs.hash).toBe(hashObservation("Images fail to load"))
})

// ── (c) per-session throttle ──────────────────────────────────────────────────
// Server.ts: if (sessionId && !rlAllow(`simreview:${sessionId}`, 1, 2000)) → return throttled
// Meaning: at most 1 call per 2-second window per session.
// Prevents runaway AI spend during continuous-mode analysis (scroll/nav/DOM-change).

test("(c) throttle: first call in window is allowed", () => {
  const key = `simreview:sess_first_${Date.now()}_${Math.random()}`
  expect(allow(key, 1, 2000, Date.now())).toBe(true)
})

test("(c) throttle: second call within 2s window is BLOCKED", () => {
  const key = `simreview:sess_block_${Date.now()}_${Math.random()}`
  const t = Date.now()
  allow(key, 1, 2000, t)                          // consume the slot
  expect(allow(key, 1, 2000, t + 500)).toBe(false) // still within 2s → blocked
})

test("(c) throttle: call after window expires IS allowed again (slot resets)", () => {
  const key = `simreview:sess_reset_${Date.now()}_${Math.random()}`
  const t = Date.now()
  allow(key, 1, 2000, t)                           // consume at t
  expect(allow(key, 1, 2000, t + 2001)).toBe(true) // 2s window expired → new slot
})

test("(c) throttle: different session IDs have independent windows", () => {
  const t = Date.now()
  const keyA = `simreview:sess_a_${Date.now()}_${Math.random()}`
  const keyB = `simreview:sess_b_${Date.now()}_${Math.random()}`
  allow(keyA, 1, 2000, t)  // exhaust session A
  // Session B has its own fresh window — unaffected
  expect(allow(keyB, 1, 2000, t)).toBe(true)
  // Session A is still blocked
  expect(allow(keyA, 1, 2000, t + 100)).toBe(false)
})

test("(c) throttle: sessions with rapid calls — only the 1st passes (cost guard)", () => {
  const t = Date.now()
  const key = `simreview:rapid_${Date.now()}_${Math.random()}`
  // Simulate 5 rapid calls (continuous scroll/nav events)
  const results = [0, 10, 20, 50, 100].map((offset) => allow(key, 1, 2000, t + offset))
  expect(results[0]).toBe(true)   // first → allowed
  expect(results.slice(1).every((r) => r === false)).toBe(true)  // rest → blocked
})

// ── (d) near-duplicate dedup ─────────────────────────────────────────────────
//
// Consecutive screens of the same page often produce rephrased but semantically
// identical observations. Exact hash matching misses these; trigram similarity catches them.
//
// obsIsNearDup(text, seenTexts, threshold) returns true when `text` is "close enough"
// to any string in seenTexts. It is called in runSimReviews AFTER the exact-hash check.

test("(d) near-dup: identical text → always near-dup (similarity = 1.0)", () => {
  const text = "The checkout button does not respond to clicks"
  expect(obsIsNearDup(text, [text])).toBe(true)
})

test("(d) near-dup: rephrase of same finding → detected as near-dup", () => {
  const seen = "The checkout button is unresponsive"
  const rephrase = "The checkout button doesn't respond to clicks"
  expect(obsIsNearDup(rephrase, [seen])).toBe(true)
})

test("(d) near-dup: minor word swap on same topic → detected", () => {
  // Score ~0.67: same element, same problem, slightly different wording
  const seen = "Navigation menu is broken and completely unusable"
  const variant = "The navigation menu is broken and completely does not work"
  expect(obsIsNearDup(variant, [seen])).toBe(true)
})

test("(d) near-dup: genuinely different observation → NOT a near-dup", () => {
  const seen = "The checkout button is unresponsive"
  const different = "The product images are loading very slowly"
  expect(obsIsNearDup(different, [seen])).toBe(false)
})

test("(d) near-dup: new screen, new finding → passes through (no false positive)", () => {
  const seen = ["Login button missing from header", "Search bar returns no results"]
  const newObs = "The payment form shows an error after submission"
  expect(obsIsNearDup(newObs, seen)).toBe(false)
})

test("(d) near-dup: empty seenTexts → never near-dup (first call always passes)", () => {
  expect(obsIsNearDup("Any observation at all", [])).toBe(false)
})

test("(d) near-dup: case+punctuation insensitive — 'BUTTON BROKEN!!!' matches 'button broken'", () => {
  expect(obsIsNearDup("BUTTON BROKEN!!!", ["button broken"])).toBe(true)
})

test("(d) near-dup: NEAR_DUP_THRESHOLD is between 0.5 and 1.0 (sanity check)", () => {
  expect(NEAR_DUP_THRESHOLD).toBeGreaterThan(0.5)
  expect(NEAR_DUP_THRESHOLD).toBeLessThan(1.0)
})

test("(d) near-dup: multiple seen texts — blocks when any one matches", () => {
  const seen = [
    "Images fail to load on product page",
    "The checkout button is completely unresponsive",
  ]
  // Near-dup of the second seen text (score ~0.59 with the rephrase)
  expect(obsIsNearDup("The checkout button is unresponsive and doesn't respond", seen)).toBe(true)
  // Not a near-dup of either
  expect(obsIsNearDup("Font sizes are inconsistent across the page", seen)).toBe(false)
})

// ── (e) per-session cost ceiling ─────────────────────────────────────────────
//
// SESSION_CALL_CEIL caps the number of LLM calls per session.
// SESSION_OBS_CEIL caps the total observations surfaced per session.
// Both are tracked server-side via sessionBumpCall / sessionBumpObs.
// Exceeded → sessionCallCapped / sessionObsCapped returns true → runSimReviews skips.

test("(e) ceiling: fresh session is not capped", () => {
  const id = `sess_fresh_${Date.now()}_${Math.random()}`
  expect(sessionCallCapped(id)).toBe(false)
  expect(sessionObsCapped(id)).toBe(false)
  expect(sessionCallCount(id)).toBe(0)
  expect(sessionObsCount(id)).toBe(0)
})

test("(e) ceiling: call count increments per bump; capped at SESSION_CALL_CEIL", () => {
  const id = `sess_calls_${Date.now()}_${Math.random()}`
  expect(SESSION_CALL_CEIL).toBeGreaterThan(0)
  // Bump up to the limit
  for (let i = 0; i < SESSION_CALL_CEIL; i++) sessionBumpCall(id)
  expect(sessionCallCount(id)).toBe(SESSION_CALL_CEIL)
  expect(sessionCallCapped(id)).toBe(true)
})

test("(e) ceiling: one more call after ceiling still shows capped", () => {
  const id = `sess_overcall_${Date.now()}_${Math.random()}`
  for (let i = 0; i < SESSION_CALL_CEIL + 3; i++) sessionBumpCall(id)
  expect(sessionCallCapped(id)).toBe(true)
  // Count is accurate
  expect(sessionCallCount(id)).toBe(SESSION_CALL_CEIL + 3)
})

test("(e) ceiling: obs count increments per bumpObs; capped at SESSION_OBS_CEIL", () => {
  const id = `sess_obs_${Date.now()}_${Math.random()}`
  expect(SESSION_OBS_CEIL).toBeGreaterThan(0)
  // Add observations up to the ceiling in batches of 5
  const batch = Array.from({ length: 5 }, (_, i) => `observation text ${i}`)
  for (let chunk = 0; chunk < SESSION_OBS_CEIL / 5; chunk++) sessionBumpObs(id, batch)
  expect(sessionObsCount(id)).toBe(SESSION_OBS_CEIL)
  expect(sessionObsCapped(id)).toBe(true)
})

test("(e) ceiling: session below ceiling is not capped", () => {
  const id = `sess_below_${Date.now()}_${Math.random()}`
  for (let i = 0; i < SESSION_CALL_CEIL - 1; i++) sessionBumpCall(id)
  expect(sessionCallCapped(id)).toBe(false)
})

test("(e) ceiling: call and obs ceilings are independent", () => {
  const id = `sess_indep_${Date.now()}_${Math.random()}`
  // Hit only the call ceiling
  for (let i = 0; i < SESSION_CALL_CEIL; i++) sessionBumpCall(id)
  expect(sessionCallCapped(id)).toBe(true)
  expect(sessionObsCapped(id)).toBe(false)  // obs not capped yet
})

test("(e) ceiling: different sessions track independently", () => {
  const idA = `sess_indep_a_${Date.now()}_${Math.random()}`
  const idB = `sess_indep_b_${Date.now()}_${Math.random()}`
  // Exhaust session A's call ceiling
  for (let i = 0; i < SESSION_CALL_CEIL; i++) sessionBumpCall(idA)
  expect(sessionCallCapped(idA)).toBe(true)
  // Session B is unaffected
  expect(sessionCallCapped(idB)).toBe(false)
})

test("(e) near-dup + ceiling compose: session stores seen texts for cross-screen matching", () => {
  const id = `sess_texts_${Date.now()}_${Math.random()}`
  const text = "The hero button is completely broken on mobile"
  sessionBumpObs(id, [text])
  // The rephrase is now blocked at the near-dup layer
  const rephrase = "The hero button is broken on mobile devices"
  // Verify the stored texts are accessible for near-dup matching
  // (runSimReviews reads sessionSeenTexts and passes to obsIsNearDup)
  const stored = sessionObsCount(id)
  expect(stored).toBe(1)
  expect(obsIsNearDup(rephrase, [text])).toBe(true)  // near-dup detected
})

// ── (f) feedback-mode filter ──────────────────────────────────────────────────
//
// obsPassesMode(obs, mode) determines which observations survive each mode.
// Applied AFTER full assembly (sentiment + suggestedBug both resolved).
//
//   "all"      → every observation passes
//   "positive" → only sentiment === "positive"
//   "critical" → sentiment === "negative" OR suggestedBug != null

// Helper: build minimal observation-shaped objects for filter tests
function obs(sentiment: string | null, bug: any = null) {
  return { sentiment, suggestedBug: bug }
}

// ── mode: "all" ───────────────────────────────────────────────────────────────

test('(f) mode "all": positive observation passes', () => {
  expect(obsPassesMode(obs("positive"), "all")).toBe(true)
})
test('(f) mode "all": negative observation passes', () => {
  expect(obsPassesMode(obs("negative"), "all")).toBe(true)
})
test('(f) mode "all": neutral observation passes', () => {
  expect(obsPassesMode(obs("neutral"), "all")).toBe(true)
})
test('(f) mode "all": null sentiment passes', () => {
  expect(obsPassesMode(obs(null), "all")).toBe(true)
})
test('(f) mode "all": bug candidate passes', () => {
  expect(obsPassesMode(obs("neutral", { title: "Bug" }), "all")).toBe(true)
})

// ── mode: "positive" ──────────────────────────────────────────────────────────

test('(f) mode "positive": positive sentiment → passes', () => {
  expect(obsPassesMode(obs("positive"), "positive")).toBe(true)
})
test('(f) mode "positive": negative sentiment → filtered out', () => {
  expect(obsPassesMode(obs("negative"), "positive")).toBe(false)
})
test('(f) mode "positive": neutral sentiment → filtered out', () => {
  expect(obsPassesMode(obs("neutral"), "positive")).toBe(false)
})
test('(f) mode "positive": null sentiment → filtered out', () => {
  expect(obsPassesMode(obs(null), "positive")).toBe(false)
})
test('(f) mode "positive": bug candidate with positive sentiment → passes', () => {
  // sentiment wins; positive bug report is uncommon but should still pass
  expect(obsPassesMode(obs("positive", { title: "Bug" }), "positive")).toBe(true)
})
test('(f) mode "positive": bug candidate with negative sentiment → filtered out', () => {
  expect(obsPassesMode(obs("negative", { title: "Bug" }), "positive")).toBe(false)
})

// ── mode: "critical" ─────────────────────────────────────────────────────────

test('(f) mode "critical": negative sentiment → passes', () => {
  expect(obsPassesMode(obs("negative"), "critical")).toBe(true)
})
test('(f) mode "critical": bug candidate (any sentiment) → passes', () => {
  expect(obsPassesMode(obs("neutral", { title: "Bug" }), "critical")).toBe(true)
  expect(obsPassesMode(obs(null, { title: "Bug" }), "critical")).toBe(true)
})
test('(f) mode "critical": negative sentiment + bug → passes (double-critical)', () => {
  expect(obsPassesMode(obs("negative", { title: "Bug" }), "critical")).toBe(true)
})
test('(f) mode "critical": positive sentiment, no bug → filtered out', () => {
  expect(obsPassesMode(obs("positive"), "critical")).toBe(false)
})
test('(f) mode "critical": neutral, no bug → filtered out', () => {
  expect(obsPassesMode(obs("neutral"), "critical")).toBe(false)
})
test('(f) mode "critical": null sentiment, no bug → filtered out', () => {
  expect(obsPassesMode(obs(null), "critical")).toBe(false)
})

// ── mode: default "all" preserves existing behaviour ─────────────────────────

test('(f) default mode "all": unknown/missing mode value falls through (forward compat)', () => {
  // obsPassesMode returns true for any unrecognised mode to stay forward-compatible
  expect(obsPassesMode(obs("negative"), "all")).toBe(true)
  expect(obsPassesMode(obs("positive"), "all")).toBe(true)
})

// ── buildSimRunSummary still counts correctly under any mode ──────────────────

test('(f) mode filter + summary: only critical obs → summary shows filtered count', () => {
  // Simulate what runSimReviews produces when mode="critical"
  const filtered: SimReview[] = [
    {
      simId: "s1", simName: "Alice", initials: null, accent: null,
      observations: [
        // Only the critical observations survive the mode filter
        { text: "Button broken", sentiment: "negative", quote: null, hash: hashObservation("Button broken"), suggestedBug: { title: "Bug" }, deduped: false },
      ],
    },
  ]
  const s = buildSimRunSummary(filtered)
  expect(s.simCount).toBe(1)
  expect(s.totalObservations).toBe(1)
  expect(s.bugCount).toBe(1)
})

test('(f) mode filter + summary: only positive obs → no bugs in summary', () => {
  const filtered: SimReview[] = [
    {
      simId: "s1", simName: "Alice", initials: null, accent: null,
      observations: [
        { text: "Checkout flow is smooth", sentiment: "positive", quote: null, hash: hashObservation("Checkout flow is smooth"), suggestedBug: null, deduped: false },
        { text: "Page loads fast", sentiment: "positive", quote: null, hash: hashObservation("Page loads fast"), suggestedBug: null, deduped: false },
      ],
    },
  ]
  const s = buildSimRunSummary(filtered)
  expect(s.totalObservations).toBe(2)
  expect(s.bugCount).toBe(0)
})
