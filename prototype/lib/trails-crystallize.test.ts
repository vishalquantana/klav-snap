// Layer B: crystallizer turns a resolved trajectory into Trail + steps + seeded locator_cache (via Layer A).
// Hermetic local libsql, mirrors lib/trails.test.ts.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-crystallize-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema, migrateV2 } = await import("./db")

beforeAll(async () => {
  const db = reconnectDb("file:" + file)
  await applySchema(db)
  await migrateV2(db)
})

const { crystallize } = await import("./trails-crystallize")
const T = await import("./trails")
const { cacheKey } = await import("./trails-types")

const sampleTrajectory = {
  name: "Checkout",
  intent: "log in, add the $20 plan, check out",
  baseUrl: "https://app.test/",
  authorKind: "llm" as const,
  createdBy: "agent@klavity",
  steps: [
    { action: "navigate" as const, actionValue: "https://app.test/login", url: "https://app.test/", domHash: "d0" },
    { action: "type" as const, actionValue: "user@test.dev", url: "https://app.test/login", domHash: "d1",
      target: { role: "textbox", accessibleName: "Email", resolvedSelector: "#email" } },
    { action: "type" as const, actionValue: "hunter2", url: "https://app.test/login", domHash: "d1",
      target: { role: "textbox", accessibleName: "Password", resolvedSelector: "#password" } },
    { action: "click" as const, url: "https://app.test/login", domHash: "d1",
      target: { role: "button", accessibleName: "Sign in", resolvedSelector: "#submit" } },
    { action: "assert" as const, checkpoint: { description: "dashboard visible" }, url: "https://app.test/app", domHash: "d2",
      target: { role: "heading", text: "Dashboard", resolvedSelector: ".dashboard h1" } },
  ],
}

test("crystallize persists a Trail with the trajectory metadata", async () => {
  const { trailId } = await crystallize("proj_A", sampleTrajectory)
  expect(trailId).toMatch(/^trl_/)
  const trail = await T.getTrail("proj_A", trailId)
  expect(trail?.name).toBe("Checkout")
  expect(trail?.intent).toBe("log in, add the $20 plan, check out")
  expect(trail?.baseUrl).toBe("https://app.test/")
  expect(trail?.authorKind).toBe("llm")
  expect(trail?.status).toBe("draft")
  // cross-project isolation
  expect(await T.getTrail("proj_other", trailId)).toBeNull()
})

test("crystallize writes one trail_step per trajectory step, in order, fingerprint only (no resolvedSelector in target_json)", async () => {
  const { trailId, stepIds } = await crystallize("proj_A", sampleTrajectory)
  expect(stepIds).toHaveLength(5)
  const steps = await T.listTrailSteps("proj_A", trailId)
  expect(steps.map((s) => s.idx)).toEqual([0, 1, 2, 3, 4])
  expect(steps.map((s) => s.action)).toEqual(["navigate", "type", "type", "click", "assert"])
  // fingerprint round-trips
  expect(steps[1].target?.accessibleName).toBe("Email")
  // resolvedSelector must NOT be duplicated into target_json (single source of truth = locator_cache)
  expect((steps[1].target as any)?.resolvedSelector).toBeUndefined()
  // checkpoint preserved
  expect(steps[4].checkpoint?.description).toBe("dashboard visible")
})

test("crystallize seeds one locator_cache row per actionable step (skips navigate), keyed by cacheKey", async () => {
  const { trailId, stepIds, cacheKeys } = await crystallize("proj_A", sampleTrajectory)
  const steps = await T.listTrailSteps("proj_A", trailId)

  // navigate (idx 0) is NOT actionable -> no cache row
  expect(await T.getCacheForStep("proj_A", stepIds[0])).toBeNull()

  // the 4 actionable steps each have a cache row with the resolved selector
  const emailCache = await T.getCacheForStep("proj_A", stepIds[1])
  expect(emailCache?.resolvedSelector).toBe("#email")
  expect(emailCache?.source).toBe("crystallize")
  expect(emailCache?.confidence).toBe(1)
  expect(emailCache?.fingerprint?.accessibleName).toBe("Email")

  expect((await T.getCacheForStep("proj_A", stepIds[3]))?.resolvedSelector).toBe("#submit")
  expect((await T.getCacheForStep("proj_A", stepIds[4]))?.resolvedSelector).toBe(".dashboard h1")

  // returned cacheKeys: present for actionable steps, recomputable, 64-hex, retrievable.
  // dom-hash is salted with trailId + the resolved selector so two actions on the same page (and
  // two Trails replaying the same page) don't collide under the UNIQUE cache_key.
  const expectedKey = await cacheKey("ACTION", "https://app.test/login", `${trailId}|d1#` + "#email", "proj_A")
  expect(cacheKeys[stepIds[1]]).toBe(expectedKey)
  // email and password (same url+domHash) get DISTINCT keys -> both rows persist
  expect(cacheKeys[stepIds[2]]).not.toBe(cacheKeys[stepIds[1]])
  expect((await T.getCacheForStep("proj_A", stepIds[2]))?.resolvedSelector).toBe("#password")
  expect(cacheKeys[stepIds[1]]).toMatch(/^[0-9a-f]{64}$/)
  expect(cacheKeys[stepIds[0]]).toBeUndefined() // navigate not cached
  const byKey = await T.getLocatorByKey("proj_A", cacheKeys[stepIds[1]])
  expect(byKey?.resolvedSelector).toBe("#email")
})
