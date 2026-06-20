// Plan E2 Task 1 — walk_replays storage round-trip (gzip) + project scoping.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
const file = join(tmpdir(), `klav-replay-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
let db: any
beforeAll(async () => {
  db = reconnectDb("file:" + file)
  await applySchema(db)
  await migrateV2(db)
})
const R = await import("./trails-replay")

test("saveReplay/getReplay round-trips segments and compresses; project-scoped", async () => {
  const segs = [
    { idx: 0, url: "file:///landing.html", events: Array.from({ length: 50 }, (_, i) => ({ type: 3, t: i, d: "evt" })) },
    { idx: 5, url: "file:///cart.html", events: [{ type: 2, t: 999 }] },
  ]
  await R.saveReplay("proj_R", "walk_1", segs)
  const got = await R.getReplay("proj_R", "walk_1")
  expect(got).toHaveLength(2)
  expect(got![1].url).toContain("cart.html")
  expect(got![0].events).toHaveLength(50)
  expect(got![1].idx).toBe(5)
  // cross-project read returns null (no leak)
  expect(await R.getReplay("proj_OTHER", "walk_1")).toBeNull()
  // a runId with no replay returns null
  expect(await R.getReplay("proj_R", "walk_nope")).toBeNull()
  const row = await db.execute({ sql: "SELECT segments_gz, n_events, n_segments FROM walk_replays WHERE run_id=?", args: ["walk_1"] })
  expect(Number(row.rows[0].n_events)).toBe(51)
  expect(Number(row.rows[0].n_segments)).toBe(2)
  // compression: the stored base64 gzip is shorter than the raw JSON
  expect(String(row.rows[0].segments_gz).length).toBeLessThan(JSON.stringify(segs).length)
})
