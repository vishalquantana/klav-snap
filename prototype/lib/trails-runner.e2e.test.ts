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

test("(ii) Tier 1 heals a cosmetic rename by role+accessible-name -> still GREEN, zero LLM, healed selector persisted", async () => {
  const projectId = "proj_heal"
  const { trailId, stepIds } = await crystallize(projectId, checkoutTrajectory())

  // Same crystallized trail, pointed at the page where #signin id/class changed but role+name preserved.
  const summary = await walkTrail(projectId, trailId, { fixtureUrl: fixtureUrl("checkout-mockup-renamed.html") })

  expect(summary.verdict).toBe("green")
  expect(summary.llmCalls).toBe(0)
  expect(summary.healedCount).toBeGreaterThanOrEqual(1)

  // the Sign in step (idx 2) healed via Tier 1 candidate, the rest stayed cache
  const signInStep = summary.steps.find((s) => s.idx === 2)!
  expect(signInStep.tier).toBe("candidate")
  expect(signInStep.healed).toBe(true)
  expect(signInStep.verdict).toBe("green")

  // healed selector persisted back to locator_cache with source 'heal' (next Walk is Tier 0 again)
  const healed = await T.getCacheForStep(projectId, stepIds[2])
  expect(healed?.source).toBe("heal")
  expect(healed?.resolvedSelector).not.toBe("#signin")
  // it now points at the renamed element
  expect(healed?.resolvedSelector).toContain("auth-submit-x9")
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
