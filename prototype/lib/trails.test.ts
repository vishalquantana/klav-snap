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

test("locator_cache enforces a UNIQUE (project_id, step_id) — per-step identity, not cache_key", async () => {
  const idx = await db.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type='index' AND name='lc_key_uq'",
    args: [],
  })
  expect(idx.rows.length).toBe(1)
  const sql = String((idx.rows[0] as any).sql)
  expect(sql).toContain("project_id")
  expect(sql).toContain("step_id")
  // cache_key is no longer the uniqueness key (Layer B's salt hack is gone)
  expect(sql).not.toContain("(cache_key)")
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

test("upsertLocatorCache inserts then updates on (project_id, step_id) conflict (heal overwrites in place)", async () => {
  const trail = await T.createTrail("proj_A", { name: "C", baseUrl: "https://app.test/" })
  const step = await T.addTrailStep("proj_A", trail, { idx: 0, action: "click" })
  const key = "deadbeef".repeat(8) // 64 hex chars

  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: key, resolvedSelector: "#pay", confidence: 1, source: "crystallize" })
  let row = await T.getCacheForStep("proj_A", step)
  expect(row?.resolvedSelector).toBe("#pay")
  expect(row?.source).toBe("crystallize")

  // a heal with a DIFFERENT cache_key (page-state fingerprint changed) still updates the SAME step row.
  const healKey = "feedface".repeat(8)
  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: healKey, resolvedSelector: "[data-testid=pay]", confidence: 0.93, source: "heal" })
  row = await T.getCacheForStep("proj_A", step)
  expect(row?.resolvedSelector).toBe("[data-testid=pay]") // overwritten, not duplicated
  expect(row?.source).toBe("heal")
  expect(row?.confidence).toBeCloseTo(0.93)
  expect(row?.cacheKey).toBe(healKey) // cache_key still stored as the page-state fingerprint

  const both = await db.execute({ sql: "SELECT COUNT(*) c FROM locator_cache WHERE project_id=? AND step_id=?", args: ["proj_A", step] })
  expect(Number(both.rows[0].c)).toBe(1) // one row per step
})

test("getCacheForStep + cross-project isolation", async () => {
  const trail = await T.createTrail("proj_A", { name: "C2", baseUrl: "https://app.test/" })
  const step = await T.addTrailStep("proj_A", trail, { idx: 0, action: "click" })
  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: "a".repeat(64), resolvedSelector: "#x" })
  expect((await T.getCacheForStep("proj_A", step))?.resolvedSelector).toBe("#x")
  expect(await T.getCacheForStep("proj_B", step)).toBeNull()
})

test("walk lifecycle: start → addRunStep → finish, with reads", async () => {
  const trail = await T.createTrail("proj_A", { name: "W", baseUrl: "https://app.test/" })
  const step = await T.addTrailStep("proj_A", trail, { idx: 0, action: "click" })
  const walk = await T.startWalk("proj_A", trail)
  expect(walk).toMatch(/^walk_/)
  expect((await T.getWalk("proj_A", walk))?.status).toBe("running")

  await T.addRunStep("proj_A", { runId: walk, trailId: trail, stepId: step, idx: 0, tier: "cache", verdict: "green", confidence: 1 })
  await T.addRunStep("proj_A", { runId: walk, trailId: trail, stepId: step, idx: 1, tier: "vision", verdict: "amber", confidence: 0.7, diagnosis: "locator_drift", healed: true, evidence: { note: "re-resolved" } })

  await T.finishWalk("proj_A", walk, { status: "amber", llmCalls: 1, summary: { healed: 1 } })
  const w = await T.getWalk("proj_A", walk)
  expect(w?.status).toBe("amber")
  expect(w?.llmCalls).toBe(1)
  expect(w?.finishedAt).toBeGreaterThan(0)

  const rs = await T.listRunSteps("proj_A", walk)
  expect(rs.map((s) => s.verdict)).toEqual(["green", "amber"])
  expect(rs[1].healed).toBe(true)
  expect(rs[1].diagnosis).toBe("locator_drift")
  expect(rs[1].evidence?.note).toBe("re-resolved")

  expect((await T.listWalks("proj_A", trail))[0].id).toBe(walk)
})

test("recordFinding dedups by dedup_key and bumps recurrence instead of duplicating", async () => {
  const trail = await T.createTrail("proj_A", { name: "F", baseUrl: "https://app.test/" })
  const walk = await T.startWalk("proj_A", trail)
  const a = await T.recordFinding("proj_A", { runId: walk, trailId: trail, kind: "regression", title: "Checkout button gone", confidence: 0.95, dedupKey: "checkout-gone" })
  expect(a.deduped).toBe(false)
  expect(a.recurrence).toBe(1)

  const b = await T.recordFinding("proj_A", { runId: walk, trailId: trail, kind: "regression", title: "Checkout button gone (again)", confidence: 0.96, dedupKey: "checkout-gone" })
  expect(b.deduped).toBe(true)
  expect(b.recurrence).toBe(2)

  const all = await T.listFindings("proj_A")
  expect(all.filter((f) => f.dedupKey === "checkout-gone").length).toBe(1) // collapsed, not duplicated
  expect(all[0].recurrence).toBe(2)
})

test("listFindings filters by status; setFindingStatus transitions and records connectorRef", async () => {
  const trail = await T.createTrail("proj_A", { name: "F2", baseUrl: "https://app.test/" })
  const walk = await T.startWalk("proj_A", trail)
  const f = await T.recordFinding("proj_A", { runId: walk, trailId: trail, kind: "visual", title: "Layout shift", confidence: 0.5, dedupKey: "layout-1", status: "queued" })
  expect((await T.listFindings("proj_A", { status: "queued" })).some((x) => x.id === f.id)).toBe(true)
  await T.setFindingStatus("proj_A", f.id, "filed", "plane:ISSUE-12")
  const filed = (await T.listFindings("proj_A", { status: "filed" })).find((x) => x.id === f.id)
  expect(filed?.connectorRef).toBe("plane:ISSUE-12")
  expect((await T.listFindings("proj_A", { status: "queued" })).some((x) => x.id === f.id)).toBe(false)
})
