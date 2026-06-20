// Plan G — idempotent demo-Trail seed. Gives a fresh project real Trails so /trails has data the
// moment you click Run: a GREEN baseline, an AMBER Tier-1 heal (drift), a RED regression, and a
// dogfood Trail walking the real public landing. Re-running never duplicates (keyed by Trail name
// per project). The fixture Trails reuse the EXACT 7-step journey trajectory shape from
// lib/trails-journey.e2e.test.ts, pointed at the app-served /trails-demo/* copies.
//
// URL convention: every fixture Trail's baseUrl is `${baseUrl}/trails-demo/<variant>/landing.html`.
// `baseUrl` is the app origin (e.g. https://klavity.quantana.top); the e2e passes a file:// origin
// whose /trails-demo/<variant> resolves to the bundled public/trails-demo copies.
import type { Trajectory } from "./trails-crystallize"
import { crystallize } from "./trails-crystallize"
import { listTrails } from "./trails"

const NAME_BASELINE = "Demo · baseline"
const NAME_DRIFT = "Demo · drift (heals)"
const NAME_REGRESSION = "Demo · regression"
const NAME_DOGFOOD = "Dogfood · landing"

// The shared 7-step click-driven journey (landing→login→products→cart→confirm), concrete #id
// selectors (page-agnostic CSS), final order-confirmation assert. Verbatim shape from the journey
// e2e; only `base` (the per-variant landing URL) differs.
function journeyTrajectory(name: string, base: string): Trajectory {
  return {
    name,
    intent: "land, sign in, add a widget to the cart, check out, reach the order confirmation",
    baseUrl: base,
    authorKind: "llm",
    createdBy: "demo@klavity",
    steps: [
      { action: "click", url: base, domHash: "landing",
        target: { role: "button", accessibleName: "Start", text: "Start", testId: "start-link", resolvedSelector: "#start" } },
      { action: "type", actionValue: "buyer@test.dev", url: base, domHash: "login",
        target: { role: "textbox", accessibleName: "Email", testId: "email-input", resolvedSelector: "#email" } },
      { action: "click", url: base, domHash: "login",
        target: { role: "button", accessibleName: "Sign in", text: "Sign in", testId: "signin-btn", resolvedSelector: "#signin" } },
      { action: "click", url: base, domHash: "products",
        target: { role: "button", accessibleName: "Add to cart", text: "Add to cart", testId: "add-to-cart-btn", resolvedSelector: "#add-to-cart" } },
      { action: "click", url: base, domHash: "products",
        target: { role: "button", accessibleName: "Cart", text: "Cart", testId: "cart-link", resolvedSelector: "#cart" } },
      { action: "click", url: base, domHash: "cart",
        target: { role: "button", accessibleName: "Checkout", text: "Checkout", testId: "checkout-link", resolvedSelector: "#checkout" } },
      { action: "assert", checkpoint: { description: "order confirmation shown" }, url: base, domHash: "confirm",
        target: { role: "heading", accessibleName: "Order confirmed", text: "Order confirmed", testId: "order-confirmation", resolvedSelector: "#order-confirmation" } },
    ],
  }
}

// A minimal 1-step GREEN dogfood Trail against the real public landing: assert the page's own <title>
// heading is present. checkpoint-only soft target keeps it page-agnostic (no fixture coupling).
function dogfoodTrajectory(base: string): Trajectory {
  return {
    name: NAME_DOGFOOD,
    intent: "the public landing page loads",
    baseUrl: base,
    authorKind: "llm",
    createdBy: "demo@klavity",
    steps: [
      { action: "assert", checkpoint: { description: "landing page loaded" }, url: base, domHash: "landing" },
    ],
  }
}

/**
 * Idempotently seed the demo Trails for a project. Skips any Trail whose `name` already exists for the
 * project (so re-running on boot never duplicates). `baseUrl` is the app origin used to build the
 * served fixture URLs. `dogfoodUrl` defaults to the public production landing. Returns how many were
 * newly created and a name→trailId map for the ones present.
 */
export async function seedDemoTrails(
  projectId: string,
  baseUrl: string,
  dogfoodUrl = "https://klavity.quantana.top/",
): Promise<{ created: number; trailIds: Record<string, string> }> {
  const origin = baseUrl.replace(/\/+$/, "")
  const fixture = (variant: string) => `${origin}/trails-demo/${variant}/landing.html`

  const specs: Array<{ name: string; traj: Trajectory }> = [
    { name: NAME_BASELINE, traj: journeyTrajectory(NAME_BASELINE, fixture("journey")) },
    { name: NAME_DRIFT, traj: journeyTrajectory(NAME_DRIFT, fixture("journey-drift-t1")) },
    { name: NAME_REGRESSION, traj: journeyTrajectory(NAME_REGRESSION, fixture("journey-regression")) },
    { name: NAME_DOGFOOD, traj: dogfoodTrajectory(dogfoodUrl) },
  ]

  const existing = new Map((await listTrails(projectId)).map((t) => [t.name, t.id]))
  const trailIds: Record<string, string> = {}
  let created = 0
  for (const { name, traj } of specs) {
    const have = existing.get(name)
    if (have) { trailIds[name] = have; continue }
    const { trailId } = await crystallize(projectId, traj)
    trailIds[name] = trailId
    created++
  }
  return { created, trailIds }
}

export const DEMO_TRAIL_NAMES = {
  baseline: NAME_BASELINE, drift: NAME_DRIFT, regression: NAME_REGRESSION, dogfood: NAME_DOGFOOD,
} as const
