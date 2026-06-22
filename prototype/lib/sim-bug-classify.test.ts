import { test, expect } from "bun:test"
import { classifySimObservation } from "./sim-bug-classify"

// ── Broken/stuck/blocked phrases from the spec all flag as bugs ────────────────
test("the spec's broken-state phrases all flag", () => {
  const cases = [
    "The dashboard never loads for me.",
    "It's stuck loading and won't finish.",
    "Page is still loading after a minute.",
    "The whole panel is blank.",
    "I just see empty boxes where the data should be.",
    "Only skeleton loaders, no content.",
    "I cannot see any of my tickets.",
    "Clicking it is a dead end.",
    "It throws an error when I submit.",
    "Nothing happens when I click the button.",
    "This feature is completely broken.",
  ]
  for (const c of cases) {
    const v = classifySimObservation(c)
    expect(v.flagged).toBe(true)
    expect(v.severity === "high" || v.severity === "medium").toBe(true)
    expect(v.signals.length).toBeGreaterThan(0)
  }
})

// ── Severity tiers: hard breakage = high (auto-accept), softer = medium (triage) ──
test("hard breakage is high severity", () => {
  expect(classifySimObservation("the page never loads").severity).toBe("high")
  expect(classifySimObservation("nothing happens when I click").severity).toBe("high")
  expect(classifySimObservation("the checkout is broken").severity).toBe("high")
  expect(classifySimObservation("the app crashed").severity).toBe("high")
  expect(classifySimObservation("the form is not working").severity).toBe("high")
  expect(classifySimObservation("I'm stuck on the loading screen").severity).toBe("high")
  expect(classifySimObservation("got a 404 not found").severity).toBe("high")
})

test("empty/loading states are medium severity", () => {
  expect(classifySimObservation("still loading the results").severity).toBe("medium")
  expect(classifySimObservation("just empty boxes here").severity).toBe("medium")
  expect(classifySimObservation("only skeleton screens show").severity).toBe("medium")
  expect(classifySimObservation("there's a spinner that keeps going").severity).toBe("medium")
})

// ── No false positives on positive / neutral observations ─────────────────────
test("positive observations do NOT flag", () => {
  const ok = [
    "The page loads fast and everything works.",
    "Loaded instantly, looks great.",
    "No errors at all — smooth checkout.",
    "Works fine, no issues.",
    "The layout renders correctly and looks clean.",
    "I love how quickly the dashboard comes up.",
    "Signed up without a problem.",
  ]
  for (const c of ok) {
    const v = classifySimObservation(c)
    expect(v.flagged).toBe(false)
    expect(v.severity).toBeNull()
  }
})

test("negated 'error' does not flag", () => {
  expect(classifySimObservation("there were no errors during signup").flagged).toBe(false)
  expect(classifySimObservation("the flow is error-free").flagged).toBe(false)
  expect(classifySimObservation("zero errors, completed fine").flagged).toBe(false)
})

// ── A real bug still flags even if the sentence also has a positive clause ─────
test("hard signal wins even alongside a positive clause", () => {
  const v = classifySimObservation("Homepage looks great, but the cart never loads.")
  expect(v.flagged).toBe(true)
  expect(v.severity).toBe("high")
  expect(v.signals).toContain("never loads")
})

// ── Sentiment nudges the ambiguous (soft) tier ────────────────────────────────
test("a soft signal under a positive sentence is suppressed, but frustrated sentiment keeps it", () => {
  // "blank" alone with a positive frame → suppressed
  expect(classifySimObservation("Clean, blank canvas — looks good.", "happy").flagged).toBe(false)
  // same soft signal but the Sim is frustrated → keep it
  expect(classifySimObservation("It's just blank.", "frustrated").flagged).toBe(true)
})

// ── Empty / junk input is safe ────────────────────────────────────────────────
test("empty or non-string input returns not-flagged", () => {
  expect(classifySimObservation("").flagged).toBe(false)
  expect(classifySimObservation(null).flagged).toBe(false)
  expect(classifySimObservation(undefined).flagged).toBe(false)
  expect(classifySimObservation(42 as unknown).flagged).toBe(false)
})
