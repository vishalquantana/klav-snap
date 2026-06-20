// Layer E — Trails dashboard aggregator unit test. Hermetic local libsql, seeded via Layer A helpers.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-tdash-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema, migrateV2 } = await import("./db")
let db: any
beforeAll(async () => { db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const T = await import("./trails")
const D = await import("./trails-dashboard")

test("trailsDashboardData returns trails, recent walks, the queued review queue, and precision", async () => {
  const proj = "proj_dash"
  const trail = await T.createTrail(proj, { name: "Checkout", baseUrl: "https://x.test", authorKind: "human" })
  const walk = await T.startWalk(proj, trail)
  await T.finishWalk(proj, walk, { status: "amber", llmCalls: 1 })
  // One queued (amber_heal) + one already-filed regression (should NOT appear in the queue).
  await T.recordFinding(proj, { runId: walk, trailId: trail, kind: "amber_heal", title: "unsure heal", confidence: 0.7, dedupKey: "q1" })
  const reg = await T.recordFinding(proj, { runId: walk, trailId: trail, kind: "regression", title: "gone", confidence: 0.95, dedupKey: "q2" })
  await T.setFindingStatus(proj, reg.id, "filed")

  const d = await D.trailsDashboardData(proj)
  expect(d.trails.map((t) => t.id)).toContain(trail)
  expect(d.recentWalks.map((w) => w.id)).toContain(walk)
  expect(d.recentWalks[0].status).toBe("amber")
  expect(d.queue.every((f) => f.status === "queued")).toBe(true)
  expect(d.queue.some((f) => f.title === "unsure heal")).toBe(true)
  expect(d.queue.some((f) => f.title === "gone")).toBe(false)
  // 1 filed, 0 dismissed → precision 1.
  expect(d.precision.filed).toBe(1)
  expect(d.precision.dismissed).toBe(0)
  expect(d.precision.precision).toBeCloseTo(1)
})

test("trailsDashboardData is project-scoped (no cross-project bleed)", async () => {
  const a = "proj_iso_a", b = "proj_iso_b"
  const ta = await T.createTrail(a, { name: "A", baseUrl: "https://a.test" })
  await T.createTrail(b, { name: "B", baseUrl: "https://b.test" })
  const d = await D.trailsDashboardData(a)
  expect(d.trails.map((t) => t.id)).toEqual([ta])
})
