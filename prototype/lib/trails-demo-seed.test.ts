// Plan G Task 4 — seedDemoTrails idempotency + URL shape. Run twice → exactly one set; fixture Trails
// point at the app-served /trails-demo/* copies.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-seed-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
beforeAll(async () => { const db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const T = await import("./trails")
const { seedDemoTrails } = await import("./trails-demo-seed")

test("seedDemoTrails is idempotent (run twice → one set) and points fixture trails at /trails-demo", async () => {
  const a = await seedDemoTrails("proj_seed", "https://klavity.test")
  expect(a.created).toBeGreaterThanOrEqual(3)
  const b = await seedDemoTrails("proj_seed", "https://klavity.test")
  expect(b.created).toBe(0) // nothing re-created
  const trails = await T.listTrails("proj_seed")
  const names = trails.map(t => t.name)
  expect(names).toContain("Demo · baseline")
  expect(names).toContain("Demo · drift (heals)")
  expect(names).toContain("Demo · regression")
  const baseline = trails.find(t => t.name === "Demo · baseline")!
  expect(baseline.baseUrl).toContain("/trails-demo/journey/landing.html")
})
