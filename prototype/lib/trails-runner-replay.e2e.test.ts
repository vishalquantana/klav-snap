// Plan E2 Task 2 — opt-in rrweb capture during a real-Chromium multi-page Walk.
// Reuses the existing journey trajectory shape + fixtures. Asserts:
//   - replay:true captures ≥2 per-page segments (the journey navigates landing→login→products→cart→confirm)
//     with events > 0, and a segment exists at/around the Checkout (idx 5) heal boundary;
//   - replay OFF (default) stores NOTHING (default-off proof, engine behavior unchanged).
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const file = join(tmpdir(), `klav-replay-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
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
const R = await import("./trails-replay")

const landingOf = (dir: string) =>
  pathToFileURL(resolve(import.meta.dir, "..", "test-fixtures", dir, "landing.html")).href

// Same crystallized journey shape as lib/trails-journey.e2e.test.ts: concrete #id selectors, click-
// driven multi-page navigation (no explicit navigate steps), final order-confirmation assert.
function journeyTrajectory() {
  const base = landingOf("journey")
  return {
    name: "Buy a widget end-to-end",
    intent: "land, sign in, add a widget to the cart, check out, reach the order confirmation",
    baseUrl: base,
    authorKind: "llm" as const,
    createdBy: "agent@klavity",
    steps: [
      { action: "click" as const, url: base, domHash: "landing",
        target: { role: "button", accessibleName: "Start", text: "Start", testId: "start-link", resolvedSelector: "#start" } },
      { action: "type" as const, actionValue: "buyer@test.dev", url: base, domHash: "login",
        target: { role: "textbox", accessibleName: "Email", testId: "email-input", resolvedSelector: "#email" } },
      { action: "click" as const, url: base, domHash: "login",
        target: { role: "button", accessibleName: "Sign in", text: "Sign in", testId: "signin-btn", resolvedSelector: "#signin" } },
      { action: "click" as const, url: base, domHash: "products",
        target: { role: "button", accessibleName: "Add to cart", text: "Add to cart", testId: "add-to-cart-btn", resolvedSelector: "#add-to-cart" } },
      { action: "click" as const, url: base, domHash: "products",
        target: { role: "button", accessibleName: "Cart", text: "Cart", testId: "cart-link", resolvedSelector: "#cart" } },
      { action: "click" as const, url: base, domHash: "cart",
        target: { role: "button", accessibleName: "Checkout", text: "Checkout", testId: "checkout-link", resolvedSelector: "#checkout" } },
      { action: "assert" as const, checkpoint: { description: "order confirmation shown" }, url: base, domHash: "confirm",
        target: { role: "heading", accessibleName: "Order confirmed", text: "Order confirmed", testId: "order-confirmation", resolvedSelector: "#order-confirmation" } },
    ],
  }
}

const IDX_CHECKOUT = 5 // the cart Checkout step (the drift point)

test("replay:true captures per-page rrweb segments for a multi-page walk (drift-t1, Tier-1 heal)", async () => {
  const projectId = "proj_replay_e2e"
  const { trailId } = await crystallize(projectId, journeyTrajectory())

  const summary = await walkTrail(projectId, trailId, { fixtureUrl: landingOf("journey-drift-t1"), replay: true })

  // Sanity: the walk itself still behaves like Layer C/D (AMBER heal at Checkout, no model call).
  expect(summary.verdict).toBe("amber")
  expect(summary.llmCalls).toBe(0)

  const segs = await R.getReplay(projectId, summary.runId)
  expect(segs).not.toBeNull()
  // Multiple documents recorded → multiple segments (landing/login/products/cart/confirm).
  expect(segs!.length).toBeGreaterThanOrEqual(2)
  // Total events captured across all pages.
  const totalEvents = segs!.reduce((n, s) => n + s.events.length, 0)
  expect(totalEvents).toBeGreaterThan(0)
  // Every segment carries a url + a non-negative idx boundary tag.
  for (const s of segs!) {
    expect(typeof s.url).toBe("string")
    expect(s.url.length).toBeGreaterThan(0)
    expect(s.idx).toBeGreaterThanOrEqual(0)
  }
  // The cart page (where the Checkout heal happened, idx 5) is captured: a segment whose boundary
  // sits at or before the Checkout step and at least one segment AFTER it (the confirm page).
  expect(segs!.some((s) => s.idx <= IDX_CHECKOUT)).toBe(true)
  expect(segs!.some((s) => s.idx > IDX_CHECKOUT)).toBe(true)
}, 60000)

test("replay OFF (default) stores nothing — engine behavior unchanged", async () => {
  const projectId = "proj_replay_off"
  const { trailId } = await crystallize(projectId, journeyTrajectory())
  const summary = await walkTrail(projectId, trailId, { fixtureUrl: landingOf("journey") })
  expect(summary.verdict).toBe("green")
  expect(await R.getReplay(projectId, summary.runId)).toBeNull()
}, 60000)
