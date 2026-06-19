// Layer C: the smallest runnable end-to-end Trail runner. REAL Chromium (Playwright).
// Tier 0 cached replay -> Tier 1 multi-candidate self-heal (role+name -> text -> testid -> structural).
// NO LLM / vision in this layer: Tier 2 just records an AMBER 'needs-vision' marker, never fakes a heal.
// Hermetic local libsql, mirrors lib/trails-crystallize.test.ts.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const file = join(tmpdir(), `klav-runner-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema, migrateV2 } = await import("./db")

beforeAll(async () => {
  const db = reconnectDb("file:" + file)
  await applySchema(db)
  await migrateV2(db)
})

const { crystallize } = await import("./trails-crystallize")
const { walkTrail } = await import("./trails-runner")
const T = await import("./trails")

const fixtureUrl = (name: string) =>
  pathToFileURL(resolve(import.meta.dir, "../test-fixtures", name)).href

// A checkout trail: type email, type password, click Sign in, click Add plan, assert confirmation.
// Selectors are the "crystallized" concrete CSS from the baseline page.
function checkoutTrajectory() {
  return {
    name: "Login and add plan",
    intent: "log in, add the $20 plan",
    baseUrl: "https://app.test/",
    authorKind: "llm" as const,
    createdBy: "agent@klavity",
    steps: [
      { action: "type" as const, actionValue: "user@test.dev", url: "https://app.test/", domHash: "d1",
        target: { role: "textbox", accessibleName: "Email", testId: "email-input", resolvedSelector: "#email" } },
      { action: "type" as const, actionValue: "hunter2", url: "https://app.test/", domHash: "d1",
        target: { role: "textbox", accessibleName: "Password", testId: "password-input", resolvedSelector: "#password" } },
      { action: "click" as const, url: "https://app.test/", domHash: "d1",
        target: { role: "button", accessibleName: "Sign in", text: "Sign in", testId: "signin-btn", resolvedSelector: "#signin" } },
      { action: "click" as const, url: "https://app.test/", domHash: "d2",
        target: { role: "button", accessibleName: "Add the $20 plan", text: "Add $20 plan", testId: "add-plan-btn", resolvedSelector: "#add-plan" } },
      { action: "assert" as const, checkpoint: { description: "plan added to cart" }, url: "https://app.test/", domHash: "d2",
        target: { role: undefined, text: "Plan added to cart", testId: "confirmation", resolvedSelector: "#confirmation" } },
    ],
  }
}

test("(i) walks GREEN on the unchanged mockup with tier 'cache' on every step and zero LLM", async () => {
  const projectId = "proj_green"
  const { trailId } = await crystallize(projectId, checkoutTrajectory())

  const summary = await walkTrail(projectId, trailId, { fixtureUrl: fixtureUrl("checkout-mockup.html") })

  expect(summary.verdict).toBe("green")
  expect(summary.llmCalls).toBe(0)
  // every actionable step resolved from cache (the navigate-less trail has 5 steps)
  for (const s of summary.steps) {
    expect(s.tier).toBe("cache")
    expect(s.verdict).toBe("green")
    expect(s.healed).toBe(false)
  }

  // persisted: Walk + run_steps recorded via Layer A
  const walk = await T.getWalk(projectId, summary.runId)
  expect(walk?.status).toBe("green")
  expect(walk?.llmCalls).toBe(0)
  const runSteps = await T.listRunSteps(projectId, summary.runId)
  expect(runSteps).toHaveLength(5)
  expect(runSteps.every((r) => r.tier === "cache")).toBe(true)
}, 30000)

test("(ii) Tier 1 heals a cosmetic rename by role+accessible-name -> AMBER (healed-but-unconfirmed, never green), zero LLM, healed selector persisted", async () => {
  const projectId = "proj_heal"
  const { trailId, stepIds } = await crystallize(projectId, checkoutTrajectory())

  // Same crystallized trail, pointed at the page where #signin id/class changed but role+name preserved.
  const summary = await walkTrail(projectId, trailId, { fixtureUrl: fixtureUrl("checkout-mockup-renamed.html") })

  // spec §6.3: a healed-but-unconfirmed step is AMBER, never GREEN -> the Walk rolls up to AMBER.
  expect(summary.verdict).toBe("amber")
  expect(summary.llmCalls).toBe(0)
  expect(summary.healedCount).toBeGreaterThanOrEqual(1)

  // the Sign in step (idx 2) healed via Tier 1 candidate; the action still executed, but verdict is AMBER.
  const signInStep = summary.steps.find((s) => s.idx === 2)!
  expect(signInStep.tier).toBe("candidate")
  expect(signInStep.healed).toBe(true)
  expect(signInStep.verdict).toBe("amber")

  // healed selector persisted back to locator_cache with source 'heal' (next Walk is Tier 0 again)
  const healed = await T.getCacheForStep(projectId, stepIds[2])
  expect(healed?.source).toBe("heal")
  expect(healed?.resolvedSelector).not.toBe("#signin")
  // it now points at the renamed element
  expect(healed?.resolvedSelector).toContain("auth-submit-x9")
}, 30000)

test("(ii.b) heal-as-reviewable-diff: both fromSelector (old) and toSelector (new) are recoverable from the run_step evidence", async () => {
  const projectId = "proj_heal_diff"
  const { trailId } = await crystallize(projectId, checkoutTrajectory())

  const summary = await walkTrail(projectId, trailId, { fixtureUrl: fixtureUrl("checkout-mockup-renamed.html") })

  // recover the healed run_step (Sign in, idx 2) and assert the reviewable diff is persisted (spec §6.4)
  const runSteps = await T.listRunSteps(projectId, summary.runId)
  const healedStep = runSteps.find((r) => r.idx === 2)!
  expect(healedStep.healed).toBe(true)
  expect(healedStep.verdict).toBe("amber")
  const ev = healedStep.evidence as any
  expect(ev.healed).toBe(true)
  // pre-heal selector recoverable
  expect(ev.fromSelector).toBe("#signin")
  // post-heal selector recoverable, points at the renamed element
  expect(ev.toSelector).toContain("auth-submit-x9")
  expect(ev.tier).toBe("candidate")
  expect(typeof ev.confidence).toBe("number")
  // candidateSignal records which Tier-1 signal matched
  expect(["role+name", "text", "testid", "domPath"]).toContain(ev.candidateSignal)
}, 30000)

test("(ii.c) Tier-1 confidence varies by signal strength: at least two distinct confidence values across candidate types", async () => {
  const projectId = "proj_mixed"
  const { trailId } = await crystallize(projectId, checkoutTrajectory())

  // Page where Sign-in heals via testid (0.92) and Add-plan heals via role+name (0.95).
  const summary = await walkTrail(projectId, trailId, { fixtureUrl: fixtureUrl("checkout-mockup-mixed-heals.html") })

  expect(summary.verdict).toBe("amber") // any heal -> AMBER
  expect(summary.healedCount).toBeGreaterThanOrEqual(2)

  const runSteps = await T.listRunSteps(projectId, summary.runId)
  const healedConfidences = runSteps.filter((r) => r.healed).map((r) => r.confidence)
  const distinct = new Set(healedConfidences)
  expect(distinct.size).toBeGreaterThanOrEqual(2) // not a flat tautology

  const signals = runSteps.filter((r) => r.healed).map((r) => (r.evidence as any)?.candidateSignal)
  expect(signals).toContain("testid")
  expect(signals).toContain("role+name")
}, 30000)

test("(iii) a genuinely-removed element produces RED, never a silent green", async () => {
  const projectId = "proj_red"
  const { trailId } = await crystallize(projectId, checkoutTrajectory())

  const summary = await walkTrail(projectId, trailId, { fixtureUrl: fixtureUrl("checkout-mockup-removed.html") })

  expect(summary.verdict).toBe("red")
  expect(summary.llmCalls).toBe(0)
  // the Sign in step (idx 2) is the break: not green, all tiers exhausted
  const signInStep = summary.steps.find((s) => s.idx === 2)!
  expect(signInStep.verdict).toBe("red")
  expect(signInStep.healed).toBe(false)

  const walk = await T.getWalk(projectId, summary.runId)
  expect(walk?.status).toBe("red")
}, 30000)

test("(iv) a thrown error inside the Walk finalizes the run as RED/finished (never left 'running'), summary.error set", async () => {
  const projectId = "proj_throw"
  const { trailId } = await crystallize(projectId, checkoutTrajectory())

  // An unreachable fixtureUrl makes page.goto throw -> walkTrail must still finalize the run.
  const summary = await walkTrail(projectId, trailId, { fixtureUrl: "http://127.0.0.1:1/never-resolves" })

  expect(summary.verdict).toBe("red")
  const walk = await T.getWalk(projectId, summary.runId)
  expect(walk?.status).toBe("red")
  expect(walk?.finishedAt).toBeGreaterThan(0)
  expect((walk?.summary as any)?.error).toBeTruthy()
}, 30000)

test("(v) a testId containing a double-quote round-trips through cache and resolves (attr escaping)", async () => {
  const projectId = "proj_quote"
  // A trail whose Sign-in target carries a testId with an embedded double-quote.
  const traj = {
    name: "Quote testid",
    intent: "click the weird-testid button",
    baseUrl: "https://app.test/",
    authorKind: "llm" as const,
    createdBy: "agent@klavity",
    steps: [
      { action: "click" as const, url: "https://app.test/", domHash: "dq",
        target: { role: "button", accessibleName: "Quote", text: "Quote", testId: 'weird"id', resolvedSelector: 'button[data-testid="weird\\"id"]' } },
    ],
  }
  const { trailId, stepIds } = await crystallize(projectId, traj)

  const summary = await walkTrail(projectId, trailId, { fixtureUrl: fixtureUrl("checkout-mockup-quote-testid.html") })

  // The cached selector resolves the element and the click executes (no heal needed) -> GREEN.
  const step = summary.steps[0]
  expect(step.verdict).toBe("green")
  expect(step.tier).toBe("cache")
  // round-trips: the cache row still holds the escaped selector
  const row = await T.getCacheForStep(projectId, stepIds[0])
  expect(row?.resolvedSelector).toContain("weird")
}, 30000)
