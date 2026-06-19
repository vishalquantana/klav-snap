import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-trails-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema, migrateV2 } = await import("./db")

let db: any
beforeAll(async () => {
  db = reconnectDb("file:" + file)
  await applySchema(db)
  await migrateV2(db)
})

test("applySchema creates all six Trail tables", async () => {
  const names = ["trails", "trail_steps", "locator_cache", "trail_runs", "run_steps", "findings"]
  for (const n of names) {
    const r = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      args: [n],
    })
    expect(r.rows.length, `table ${n} should exist`).toBe(1)
  }
})

test("locator_cache enforces a UNIQUE cache_key", async () => {
  const idx = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='index' AND name='lc_key_uq'",
    args: [],
  })
  expect(idx.rows.length).toBe(1)
})

const T = await import("./trails")

test("createTrail + getTrail round-trip, scoped by project", async () => {
  const id = await T.createTrail("proj_A", { name: "Checkout", intent: "buy the $20 plan", baseUrl: "https://app.test/" })
  expect(id).toMatch(/^trl_/)
  const got = await T.getTrail("proj_A", id)
  expect(got?.name).toBe("Checkout")
  expect(got?.intent).toBe("buy the $20 plan")
  expect(got?.status).toBe("draft")
  expect(await T.getTrail("proj_B", id)).toBeNull() // cross-project isolation
})

test("addTrailStep + listTrailSteps preserves order and round-trips target/checkpoint", async () => {
  const trail = await T.createTrail("proj_A", { name: "Login", baseUrl: "https://app.test/" })
  await T.addTrailStep("proj_A", trail, { idx: 1, action: "type", actionValue: "user@test.dev", target: { role: "textbox", accessibleName: "Email" } })
  await T.addTrailStep("proj_A", trail, { idx: 0, action: "navigate", actionValue: "https://app.test/login" })
  await T.addTrailStep("proj_A", trail, { idx: 2, action: "assert", checkpoint: { description: "dashboard visible" } })
  const steps = await T.listTrailSteps("proj_A", trail)
  expect(steps.map((s) => s.idx)).toEqual([0, 1, 2])
  expect(steps[1].target?.accessibleName).toBe("Email")
  expect(steps[2].checkpoint?.description).toBe("dashboard visible")
})

test("setTrailStatus updates status", async () => {
  const id = await T.createTrail("proj_A", { name: "S", baseUrl: "https://app.test/" })
  await T.setTrailStatus("proj_A", id, "active")
  expect((await T.getTrail("proj_A", id))?.status).toBe("active")
})

test("upsertLocatorCache inserts then updates on cache_key conflict (heal overwrites)", async () => {
  const trail = await T.createTrail("proj_A", { name: "C", baseUrl: "https://app.test/" })
  const step = await T.addTrailStep("proj_A", trail, { idx: 0, action: "click" })
  const key = "deadbeef".repeat(8) // 64 hex chars

  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: key, resolvedSelector: "#pay", confidence: 1, source: "crystallize" })
  let row = await T.getLocatorByKey("proj_A", key)
  expect(row?.resolvedSelector).toBe("#pay")
  expect(row?.source).toBe("crystallize")

  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: key, resolvedSelector: "[data-testid=pay]", confidence: 0.93, source: "heal" })
  row = await T.getLocatorByKey("proj_A", key)
  expect(row?.resolvedSelector).toBe("[data-testid=pay]") // overwritten, not duplicated
  expect(row?.source).toBe("heal")
  expect(row?.confidence).toBeCloseTo(0.93)

  const both = await db.execute({ sql: "SELECT COUNT(*) c FROM locator_cache WHERE cache_key=?", args: [key] })
  expect(Number(both.rows[0].c)).toBe(1)
})

test("getCacheForStep + cross-project isolation", async () => {
  const trail = await T.createTrail("proj_A", { name: "C2", baseUrl: "https://app.test/" })
  const step = await T.addTrailStep("proj_A", trail, { idx: 0, action: "click" })
  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: "a".repeat(64), resolvedSelector: "#x" })
  expect((await T.getCacheForStep("proj_A", step))?.resolvedSelector).toBe("#x")
  expect(await T.getCacheForStep("proj_B", step)).toBeNull()
})
