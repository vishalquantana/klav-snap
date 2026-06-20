// CENTERPIECE: a realistic MULTI-PAGE journey walked end-to-end against REAL Chromium (Playwright).
// Proves the Klavity OS Trails promise: run a series of steps across multiple pages navigated by
// CLICKING, confirm the system works, and if something changed mid-journey, AI heals that step and the
// walk RESUMES and completes the rest — reaching the final order-confirmation page.
//
// The journey: landing --[click Start]--> login --[type email + click Sign in]--> products
//   --[click Add to cart, then Cart]--> cart --[click Checkout]--> confirm (order-confirmation element).
//
// One crystallized trail (concrete #id selectors = page-agnostic CSS) walked against four fixture
// dirs that share the SAME relative filenames so click-driven RELATIVE-href navigation stays within
// whichever dir the walk entered:
//   journey/            baseline — everything resolves Tier-0
//   journey-drift-t1/   cart Checkout keeps role=button + name "Checkout" but id/class change → Tier-1 heal
//   journey-drift-t2/   cart Checkout fully relabeled → only a (mock) vision model can place it → Tier-2 heal
//   journey-regression/ cart Checkout genuinely removed → RED regression, journey cannot complete
//
// Does NOT change Layer A–D behavior. Mirrors the conventions of the existing trails e2e suites
// (hermetic local libsql, crystallize(projectId, Trajectory), walkTrail(projectId, trailId, opts)).
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const file = join(tmpdir(), `klav-journey-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema, migrateV2 } = await import("./db")
beforeAll(async () => {
  const db = reconnectDb("file:" + file)
  await applySchema(db)
  await migrateV2(db)
})

const T = await import("./trails")
const { crystallize } = await import("./trails-crystallize")
const { walkTrail } = await import("./trails-runner")
import type { VisionResolver } from "./trails-vision"

// landing.html of a given variant directory (e.g. "journey", "journey-drift-t1").
const landingOf = (dir: string) =>
  pathToFileURL(resolve(import.meta.dir, "..", "test-fixtures", dir, "landing.html")).href

// The crystallized journey. resolvedSelector is the concrete #id from the BASELINE pages; these are
// page-agnostic CSS so the runner resolves them Tier-0 on whatever page the click-navigation landed
// on. Navigation itself is click-driven (no explicit navigate steps): each click on a relative-href
// link/submit takes the page to the next file in the same directory.
function journeyTrajectory() {
  const base = landingOf("journey")
  return {
    name: "Buy a widget end-to-end",
    intent: "land, sign in, add a widget to the cart, check out, reach the order confirmation",
    baseUrl: base,
    authorKind: "llm" as const,
    createdBy: "agent@klavity",
    steps: [
      // landing.html: click Start -> login.html
      { action: "click" as const, url: base, domHash: "landing",
        target: { role: "button", accessibleName: "Start", text: "Start", testId: "start-link", resolvedSelector: "#start" } },
      // login.html: type the email
      { action: "type" as const, actionValue: "buyer@test.dev", url: base, domHash: "login",
        target: { role: "textbox", accessibleName: "Email", testId: "email-input", resolvedSelector: "#email" } },
      // login.html: click Sign in -> submits form -> products.html
      { action: "click" as const, url: base, domHash: "login",
        target: { role: "button", accessibleName: "Sign in", text: "Sign in", testId: "signin-btn", resolvedSelector: "#signin" } },
      // products.html: click Add to cart (reveals the "Added to cart" message, no nav)
      { action: "click" as const, url: base, domHash: "products",
        target: { role: "button", accessibleName: "Add to cart", text: "Add to cart", testId: "add-to-cart-btn", resolvedSelector: "#add-to-cart" } },
      // products.html: click Cart -> cart.html
      { action: "click" as const, url: base, domHash: "products",
        target: { role: "button", accessibleName: "Cart", text: "Cart", testId: "cart-link", resolvedSelector: "#cart" } },
      // cart.html: click Checkout -> confirm.html  ← THE DRIFT POINT across the four variants
      { action: "click" as const, url: base, domHash: "cart",
        target: { role: "button", accessibleName: "Checkout", text: "Checkout", testId: "checkout-link", resolvedSelector: "#checkout" } },
      // confirm.html: assert the order-confirmation element is present — the FINAL checkpoint that
      // proves the multi-page journey completed (and, in the drift cases, RESUMED past the heal).
      { action: "assert" as const, checkpoint: { description: "order confirmation shown" }, url: base, domHash: "confirm",
        target: { role: "heading", accessibleName: "Order confirmed", text: "Order confirmed", testId: "order-confirmation", resolvedSelector: "#order-confirmation" } },
    ],
  }
}

const IDX_CHECKOUT = 5 // the cart Checkout step (the drift point)
const IDX_CONFIRM = 6 // the final order-confirmation assert

// Mock Tier-2 resolver for journey-drift-t2: returns the relocated/relabeled Checkout selector.
const visionMovedCheckout: VisionResolver = async () => ({
  found: true, selector: "#proceed-to-payment", confidence: 0.95, classification: "moved",
  rationale: "the Checkout affordance was relabeled to 'Proceed to payment' but is the same control",
})

// Mock Tier-2 resolver for journey-regression: the Checkout affordance is genuinely gone.
const visionRemovedCheckout: VisionResolver = async () => ({
  found: false, selector: null, confidence: 0.95, classification: "removed",
  rationale: "there is no Checkout/pay affordance on the cart page anymore",
})

// ── 1. BASELINE: full multi-page journey completes deterministically (every step Tier-0 cache) ──
test("BASELINE journey/ walks GREEN: every step tier 'cache', zero LLM, reaches the order-confirmation checkpoint", async () => {
  const projectId = "proj_journey_baseline"
  const { trailId, stepIds } = await crystallize(projectId, journeyTrajectory())

  const summary = await walkTrail(projectId, trailId, { fixtureUrl: landingOf("journey") })

  expect(summary.verdict).toBe("green")
  expect(summary.llmCalls).toBe(0)
  expect(summary.healedCount).toBe(0)

  // Every step resolved Tier-0 from cache; the click-driven navigation carried the page across all
  // five files without a single heal.
  for (const s of summary.steps) {
    expect(s.tier).toBe("cache")
    expect(s.verdict).toBe("green")
    expect(s.healed).toBe(false)
  }

  // The FINAL checkpoint on confirm.html passed → the full multi-page journey completed.
  const runSteps = await T.listRunSteps(projectId, summary.runId)
  expect(runSteps).toHaveLength(7)
  const confirm = runSteps.find((r) => r.idx === IDX_CONFIRM)!
  expect(confirm.verdict).toBe("green")
  expect(confirm.tier).toBe("cache")

  const walk = await T.getWalk(projectId, summary.runId)
  expect(walk?.status).toBe("green")
  expect(walk?.llmCalls).toBe(0)
  // No findings on a clean run.
  expect(await T.listFindings(projectId)).toHaveLength(0)
  // Sanity: the confirmation step's cache row is the crystallize seed (never healed).
  const confirmCache = await T.getCacheForStep(projectId, stepIds[IDX_CONFIRM])
  expect(confirmCache?.source).toBe("crystallize")
}, 60000)

// ── 2. THE HEADLINE: Tier-1 heal mid-journey, then RESUME and COMPLETE to confirm.html ──
test("TIER-1 HEAL + RESUME journey-drift-t1/: Checkout heals via role+accessible-name (AMBER, zero LLM), persisted as 'heal', journey RESUMES and REACHES the order-confirmation checkpoint", async () => {
  const projectId = "proj_journey_t1"
  const { trailId, stepIds } = await crystallize(projectId, journeyTrajectory())

  const summary = await walkTrail(projectId, trailId, { fixtureUrl: landingOf("journey-drift-t1") })

  // Any heal rolls the walk up to AMBER, with no model call.
  expect(summary.verdict).toBe("amber")
  expect(summary.llmCalls).toBe(0)
  expect(summary.healedCount).toBe(1)

  const runSteps = await T.listRunSteps(projectId, summary.runId)
  expect(runSteps).toHaveLength(7)

  // The Checkout step (idx 5) healed via the Tier-1 role+accessible-name candidate.
  const checkout = runSteps.find((r) => r.idx === IDX_CHECKOUT)!
  expect(checkout.tier).toBe("candidate")
  expect(checkout.healed).toBe(true)
  expect(checkout.verdict).toBe("amber")
  expect((checkout.evidence as any).candidateSignal).toBe("role+name")
  // The reviewable diff: pre-heal #checkout missed, post-heal points at the renamed element.
  expect((checkout.evidence as any).fromSelector).toBe("#checkout")
  expect((checkout.evidence as any).toSelector).toContain("pay-now-btn")

  // The healed selector is persisted (source 'heal') so the next walk is Tier-0 again.
  const healedCache = await T.getCacheForStep(projectId, stepIds[IDX_CHECKOUT])
  expect(healedCache?.source).toBe("heal")
  expect(healedCache?.resolvedSelector).not.toBe("#checkout")
  expect(healedCache?.resolvedSelector).toContain("pay-now-btn")

  // THE PROOF OF RESUME: the healed click actually navigated to confirm.html, and the FINAL
  // order-confirmation checkpoint (idx 6) passed GREEN. Heal → resume → complete, not just heal.
  const confirm = runSteps.find((r) => r.idx === IDX_CONFIRM)!
  expect(confirm.verdict).toBe("green")
  expect(confirm.tier).toBe("cache")
  expect(confirm.healed).toBe(false)

  // No regression / amber_heal findings — a clean Tier-1 heal files nothing.
  const findings = (await T.listFindings(projectId)).filter((f) => f.runId === summary.runId)
  expect(findings).toHaveLength(0)
}, 60000)

// ── 3. Tier-2 vision heal mid-journey, then RESUME and COMPLETE to confirm.html ──
test("TIER-2 VISION HEAL + RESUME journey-drift-t2/: relabeled Checkout placed by mock vision (AMBER, llmCalls 1), journey RESUMES and REACHES the order-confirmation checkpoint", async () => {
  const projectId = "proj_journey_t2"
  const { trailId, stepIds } = await crystallize(projectId, journeyTrajectory())

  const summary = await walkTrail(projectId, trailId, {
    fixtureUrl: landingOf("journey-drift-t2"),
    vision: visionMovedCheckout,
  })

  expect(summary.verdict).toBe("amber")
  expect(summary.llmCalls).toBe(1) // exactly one Tier-2 model call, at the Checkout step
  expect(summary.healedCount).toBe(1)

  const runSteps = await T.listRunSteps(projectId, summary.runId)
  expect(runSteps).toHaveLength(7)

  // The Checkout step healed via Tier-2 vision (tier 'vision', AMBER, healed).
  const checkout = runSteps.find((r) => r.idx === IDX_CHECKOUT)!
  expect(checkout.tier).toBe("vision")
  expect(checkout.healed).toBe(true)
  expect(checkout.verdict).toBe("amber")
  expect((checkout.evidence as any).toSelector).toBe("#proceed-to-payment")
  expect((checkout.evidence as any).classification).toBe("moved")

  // Vision-healed selector persisted (source 'heal').
  const healedCache = await T.getCacheForStep(projectId, stepIds[IDX_CHECKOUT])
  expect(healedCache?.source).toBe("heal")
  expect(healedCache?.resolvedSelector).toBe("#proceed-to-payment")

  // THE PROOF OF RESUME: the vision-healed click navigated to confirm.html and the FINAL checkpoint
  // passed GREEN.
  const confirm = runSteps.find((r) => r.idx === IDX_CONFIRM)!
  expect(confirm.verdict).toBe("green")
  expect(confirm.tier).toBe("cache")

  // A heal is not a bug: no regression finding for this run.
  const findings = (await T.listFindings(projectId)).filter((f) => f.runId === summary.runId)
  expect(findings.some((f) => f.kind === "regression")).toBe(false)
}, 60000)

// ── 4. REGRESSION: Checkout genuinely removed → RED + grounded finding, journey CANNOT complete ──
test("REGRESSION journey-regression/: removed Checkout → RED with a grounded 'regression' finding, the journey does NOT silently complete", async () => {
  const projectId = "proj_journey_regression"
  const { trailId, stepIds } = await crystallize(projectId, journeyTrajectory())

  const summary = await walkTrail(projectId, trailId, {
    fixtureUrl: landingOf("journey-regression"),
    vision: visionRemovedCheckout,
  })

  expect(summary.verdict).toBe("red")
  expect(summary.llmCalls).toBe(1) // one vision call diagnosed 'removed'
  expect(summary.healedCount).toBe(0)

  const runSteps = await T.listRunSteps(projectId, summary.runId)

  // The Checkout step is RED (regression), not healed, no silent green.
  const checkout = runSteps.find((r) => r.idx === IDX_CHECKOUT)!
  expect(checkout.verdict).toBe("red")
  expect(checkout.healed).toBe(false)
  expect(checkout.diagnosis).toBe("regression")

  // A grounded 'regression' finding exists, scoped to THIS run + the Checkout step.
  const findings = (await T.listFindings(projectId)).filter(
    (f) => f.runId === summary.runId && f.stepId === stepIds[IDX_CHECKOUT],
  )
  const regression = findings.find((f) => f.kind === "regression")
  expect(regression).toBeTruthy()
  expect(regression!.groundQuote).toBeTruthy()
  expect(findings.some((f) => f.kind === "amber_heal")).toBe(false)

  // THE PROOF OF FAIL-LOUD: the journey did NOT reach a passing order-confirmation. The walk never
  // navigated to confirm.html, so the final checkpoint is NOT a green cache hit.
  const confirm = runSteps.find((r) => r.idx === IDX_CONFIRM)
  if (confirm) {
    expect(confirm.verdict).not.toBe("green")
  }
  const walk = await T.getWalk(projectId, summary.runId)
  expect(walk?.status).toBe("red")
}, 60000)
