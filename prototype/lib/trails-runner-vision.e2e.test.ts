// Layer D: Tier-2 vision heal / regression / low-confidence, end-to-end against REAL Chromium.
// The VisionResolver is INJECTED as a mock — NO real network. Proves the runner's Tier-0/1-exhausted
// handoff becomes a real AMBER heal (never green), a grounded regression finding, or a queue-only
// amber_heal — and that with NO resolver the behavior is the unchanged Layer C RED + needsVision.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const file = join(tmpdir(), `klav-runner-vision-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
let db: any
beforeAll(async () => { db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })

const T = await import("./trails")
const { crystallize } = await import("./trails-crystallize")
const { walkTrail } = await import("./trails-runner")
import type { VisionResolver } from "./trails-vision"

const FIX = (name: string) => pathToFileURL(resolve(import.meta.dir, "..", "test-fixtures", name)).href
const PROJ = "proj_vis"

// A single-step trail whose Sign-in target resolves Tier-0 (#signin) on the BASELINE fixture, but is
// undiscoverable by Tier-0/1 on the MOVED/REMOVED fixtures (id/testid/role-name/text/structure all
// changed or gone) — so ONLY the (mock) vision can place it. Mirrors the real crystallize signature:
// crystallize(projectId, Trajectory{ steps[].target.resolvedSelector }).
async function seedTrail(): Promise<string> {
  const { trailId } = await crystallize(PROJ, {
    name: "Sign in",
    baseUrl: FIX("checkout-mockup.html"),
    authorKind: "llm",
    steps: [
      { action: "click", intent: "click the Sign in button", url: FIX("checkout-mockup.html"), domHash: "h0",
        target: { role: "button", accessibleName: "Sign in", text: "Sign in", testId: "signin-btn", resolvedSelector: "#signin" } },
    ],
  } as any)
  return trailId
}

// A single-step ASSERT trail whose checkpoint target resolves Tier-0 (#signin) on the BASELINE
// fixture but is gone from every Tier-0/1 anchor on the moved/removed fixtures — so it reaches the
// vision tier. §6.5: an assert whose target is gone is a HARD checkpoint failure and must NEVER be
// vision-downgraded to amber_heal, regardless of what the model classifies.
async function seedAssertTrail(): Promise<string> {
  const { trailId } = await crystallize(PROJ, {
    name: "Sign in visible",
    baseUrl: FIX("checkout-mockup.html"),
    authorKind: "llm",
    steps: [
      { action: "assert", intent: "the Sign in button is visible", url: FIX("checkout-mockup.html"), domHash: "h0",
        checkpoint: { description: "Sign in button visible" },
        target: { role: "button", accessibleName: "Sign in", text: "Sign in", testId: "signin-btn", resolvedSelector: "#signin" } },
    ],
  } as any)
  return trailId
}

// A 2-step trail: step 0 clicks the (vision-resolved) Sign in; step 1 types into #email which still
// exists Tier-0 on the moved fixture. Used to prove the walk CONTINUES past a failing vision step.
async function seedTwoStepTrail(): Promise<string> {
  const { trailId } = await crystallize(PROJ, {
    name: "Sign in then type",
    baseUrl: FIX("checkout-mockup.html"),
    authorKind: "llm",
    steps: [
      { action: "click", intent: "click the Sign in button", url: FIX("checkout-mockup.html"), domHash: "h0",
        target: { role: "button", accessibleName: "Sign in", text: "Sign in", testId: "signin-btn", resolvedSelector: "#signin" } },
      { action: "type", intent: "type the email", url: FIX("checkout-mockup.html"), domHash: "h1", actionValue: "a@b.test",
        target: { role: "textbox", accessibleName: "Email", text: "", testId: "email-input", resolvedSelector: "#email" } },
    ],
  } as any)
  return trailId
}

// A 2-step trail proving the heal is a TRUE end-to-end action, not a resolve-and-click no-op: step 0
// heals+clicks the (moved) Sign in; clicking #totally-new-id un-hides #checkout. Step 1 asserts the
// now-revealed #add-plan is visible — Tier-0 on the moved fixture, so it only passes if the healed
// click actually fired its onclick.
async function seedHealThenEffectTrail(): Promise<string> {
  const { trailId } = await crystallize(PROJ, {
    name: "Sign in then checkout visible",
    baseUrl: FIX("checkout-mockup.html"),
    authorKind: "llm",
    steps: [
      { action: "click", intent: "click the Sign in button", url: FIX("checkout-mockup.html"), domHash: "h0",
        target: { role: "button", accessibleName: "Sign in", text: "Sign in", testId: "signin-btn", resolvedSelector: "#signin" } },
      { action: "assert", intent: "the Add plan button is visible after sign in", url: FIX("checkout-mockup.html"), domHash: "h1",
        checkpoint: { description: "Add plan visible" },
        target: { role: "button", accessibleName: "Add the $20 plan", text: "Add $20 plan", testId: "add-plan-btn", resolvedSelector: "#add-plan" } },
    ],
  } as any)
  return trailId
}

// Resolver that throws — simulates a timed-out / malformed / network-erroring vision call.
const visionThrows: VisionResolver = async () => { throw new Error("vision upstream 503 / timeout") }

const visionHeal: VisionResolver = async () => ({ found: true, selector: "#totally-new-id", confidence: 0.95, classification: "moved", rationale: "the Sign in button moved into the top bar" })
const visionRemoved: VisionResolver = async () => ({ found: false, selector: null, confidence: 0.9, classification: "removed", rationale: "no Sign in affordance exists anymore" })
const visionLowConf: VisionResolver = async () => ({ found: true, selector: "#maybe", confidence: 0.6, classification: "moved", rationale: "unsure" })

test("Tier-2 heal → AMBER (never green), selector persisted, llmCalls=1, no finding", async () => {
  const trailId = await seedTrail()
  const walk = await walkTrail(PROJ, trailId, { fixtureUrl: FIX("checkout-mockup-moved.html"), vision: visionHeal })
  expect(walk.verdict).toBe("amber")
  expect(walk.llmCalls).toBe(1)
  const steps = await T.listRunSteps(PROJ, walk.runId)
  expect(steps[0].verdict).toBe("amber"); expect(steps[0].tier).toBe("vision"); expect(steps[0].healed).toBe(true)
  expect((steps[0].evidence as any).toSelector).toBe("#totally-new-id")
  expect(await T.listFindings(PROJ)).toHaveLength(0) // a heal is not a bug
  // The healed selector is persisted so the next walk is Tier 0 again.
  const cache = await T.getCacheForStep(PROJ, steps[0].stepId)
  expect(cache?.resolvedSelector).toBe("#totally-new-id")
  expect(cache?.source).toBe("heal")
})

test("Tier-2 heal is a true end-to-end action (its click has the intended observable DOM effect)", async () => {
  const trailId = await seedHealThenEffectTrail()
  const walk = await walkTrail(PROJ, trailId, { fixtureUrl: FIX("checkout-mockup-moved.html"), vision: visionHeal })
  const steps = await T.listRunSteps(PROJ, walk.runId)
  // Step 0 healed via vision (AMBER click).
  const s0 = steps.find((s) => s.idx === 0)!
  expect(s0.healed).toBe(true); expect(s0.verdict).toBe("amber")
  // Step 1 asserts #add-plan (revealed only by the healed click's onclick) is visible → GREEN.
  // If the heal were a resolve-and-click no-op, #checkout stays hidden and this assert would be RED.
  const s1 = steps.find((s) => s.idx === 1)!
  expect(s1.verdict).toBe("green")
})

test("Tier-2 regression → RED + grounded finding (auto-file-eligible kind)", async () => {
  const trailId = await seedTrail()
  const walk = await walkTrail(PROJ, trailId, { fixtureUrl: FIX("checkout-mockup-removed.html"), vision: visionRemoved })
  expect(walk.verdict).toBe("red"); expect(walk.llmCalls).toBe(1)
  const fs = await T.listFindings(PROJ, { status: "queued" })
  const f = fs.find((x) => x.kind === "regression")
  expect(f).toBeTruthy()
  expect(f!.groundQuote).toContain("Sign in")
})

test("Tier-2 low confidence → AMBER + queue-only finding, element NOT acted on", async () => {
  const trailId = await seedTrail()
  const walk = await walkTrail(PROJ, trailId, { fixtureUrl: FIX("checkout-mockup-moved.html"), vision: visionLowConf })
  expect(walk.verdict).toBe("amber")
  expect(walk.llmCalls).toBe(1)
  const steps = await T.listRunSteps(PROJ, walk.runId)
  expect(steps[0].healed).toBe(false) // an unconfirmed target is never acted on / persisted
  const fs = await T.listFindings(PROJ)
  expect(fs.some((x) => x.kind === "amber_heal")).toBe(true)
})

// ── §6.5 trust guardrail: a gone-assert is ALWAYS a hard RED regression, never amber_heal ──
// Even when the vision model says "moved" (would-be heal) OR returns low-confidence, an ASSERT whose
// target could not be deterministically resolved is a checkpoint failure. It must short-circuit to
// RED + a kind 'regression' finding and never resolve to amber_heal / never be acted on.
test("gone ASSERT under visionHeal('moved') → RED regression, NEVER amber heal", async () => {
  const trailId = await seedAssertTrail()
  const walk = await walkTrail(PROJ, trailId, { fixtureUrl: FIX("checkout-mockup-moved.html"), vision: visionHeal })
  expect(walk.verdict).toBe("red")
  const steps = await T.listRunSteps(PROJ, walk.runId)
  expect(steps[0].verdict).toBe("red")
  expect(steps[0].healed).toBe(false)
  expect(steps[0].diagnosis).toBe("regression")
  // Findings are project-scoped & accumulate across tests — scope assertions to THIS run's step.
  const fs = (await T.listFindings(PROJ)).filter((x) => x.stepId === steps[0].stepId && x.runId === walk.runId)
  expect(fs.some((x) => x.kind === "regression")).toBe(true)
  expect(fs.some((x) => x.kind === "amber_heal")).toBe(false)
})

test("gone ASSERT under visionLowConf → RED regression, NEVER amber heal", async () => {
  const trailId = await seedAssertTrail()
  const walk = await walkTrail(PROJ, trailId, { fixtureUrl: FIX("checkout-mockup-moved.html"), vision: visionLowConf })
  expect(walk.verdict).toBe("red")
  const steps = await T.listRunSteps(PROJ, walk.runId)
  expect(steps[0].verdict).toBe("red")
  expect(steps[0].diagnosis).toBe("regression")
  const fs = (await T.listFindings(PROJ)).filter((x) => x.stepId === steps[0].stepId && x.runId === walk.runId)
  expect(fs.some((x) => x.kind === "regression")).toBe(true)
  expect(fs.some((x) => x.kind === "amber_heal")).toBe(false)
})

// ── Per-step resilience: a throwing resolver fails only ITS step; the walk still finalizes & continues ──
test("throwing vision resolver → that step RED with error evidence, walk continues + finalizes", async () => {
  const trailId = await seedTwoStepTrail()
  const walk = await walkTrail(PROJ, trailId, { fixtureUrl: FIX("checkout-mockup-moved.html"), vision: visionThrows })
  // The run must be finalized (not left 'running') and roll up RED.
  expect(walk.verdict).toBe("red")
  const run = await T.getWalk(PROJ, walk.runId)
  expect(run?.status).not.toBe("running")
  const steps = await T.listRunSteps(PROJ, walk.runId)
  // The walk did NOT abort after the failing step 0 — step 1 ran too.
  expect(steps.length).toBe(2)
  const s0 = steps.find((s) => s.idx === 0)!
  expect(s0.verdict).toBe("red")
  expect(s0.tier).toBe("vision")
  expect((s0.evidence as any).needsVision).toBe(true)
  expect((s0.evidence as any).error).toContain("503")
  // Step 1 (#email exists Tier-0 on the moved fixture) still ran GREEN — the walk continued.
  const s1 = steps.find((s) => s.idx === 1)!
  expect(s1.verdict).toBe("green")
})

test("no vision resolver → unchanged RED + needsVision (backward compatible)", async () => {
  const trailId = await seedTrail()
  const walk = await walkTrail(PROJ, trailId, { fixtureUrl: FIX("checkout-mockup-removed.html") })
  expect(walk.verdict).toBe("red")
  expect(walk.llmCalls).toBe(0)
  const steps = await T.listRunSteps(PROJ, walk.runId)
  expect((steps[0].evidence as any).needsVision).toBe(true)
})
