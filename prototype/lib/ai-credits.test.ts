// AI-credit logging: writer + ops-dashboard aggregates. Hermetic — point the module's `db`
// singleton at a fresh LOCAL libsql file by setting TURSO_DATABASE_URL *before* importing ./db.
// Bun shares one module registry across test files, so global SUMs (opsTotals/opsTodaySpend) are
// asserted as deltas over a baseline, and group-by reads are filtered to this run's unique
// model/project ids — never assume the ai_calls table is empty.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-aicredits-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const {
  reconnectDb, applySchema, recordAiCall,
  opsTotals, opsDaily, opsByProject, opsByTypeModel, opsRecentCalls, opsTodaySpend,
} = await import("./db")

// Shared Bun registry → re-point the db singleton at THIS file's DB before our tests run.
let db: any
beforeAll(async () => {
  db = reconnectDb("file:" + file)
  await applySchema(db)
})

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const MODEL = `test-model-${RUN}`
const P = (s: string) => `proj_${s}_${RUN}`

test("recordAiCall + opsTotals: sums cost/tokens/count (delta over baseline)", async () => {
  const base = await opsTotals()
  await recordAiCall({ type: "extract", model: MODEL, actorEmail: "a@x.com", projectId: P("a"), inputTokens: 100, outputTokens: 50, costUsd: 0.01 })
  await recordAiCall({ type: "react", model: MODEL, actorEmail: "b@x.com", projectId: P("b"), inputTokens: 200, outputTokens: 80, costUsd: 0.02 })
  const t = await opsTotals()
  expect(t.callCount - base.callCount).toBe(2)
  expect(t.totalInputTokens - base.totalInputTokens).toBe(300)
  expect(t.totalOutputTokens - base.totalOutputTokens).toBe(130)
  expect(Number((t.totalCost - base.totalCost).toFixed(4))).toBe(0.03)
})

test("opsByProject: groups by project, sorted by cost desc, counts calls", async () => {
  const rows = (await opsByProject()).filter(r => r.projectId === P("a") || r.projectId === P("b"))
  expect(rows.map(r => r.projectId)).toEqual([P("b"), P("a")]) // b (0.02) before a (0.01)
  expect(rows.find(r => r.projectId === P("a"))!.calls).toBe(1)
})

test("opsByTypeModel: groups by (type, model)", async () => {
  const rows = (await opsByTypeModel()).filter(r => r.model === MODEL)
  expect(rows.length).toBe(2)
  expect(rows.map(r => r.type).sort()).toEqual(["extract", "react"])
})

test("opsRecentCalls: newest first, our rows present, nullable fields preserved", async () => {
  const rows = (await opsRecentCalls(200, 0)).filter(r => r.model === MODEL)
  expect(rows.length).toBe(2)
  expect(rows[0].type).toBe("react") // inserted second → newest first
  expect(rows[0].costUsd).toBe(0.02)
  expect(rows[0].ok).toBe(true)
})

test("opsTodaySpend + opsDaily: today's spend reflects inserts", async () => {
  expect(await opsTodaySpend()).toBeGreaterThanOrEqual(0.03)
  const daily = await opsDaily(30)
  expect(daily.length).toBeGreaterThan(0)
  expect(typeof daily[0].day).toBe("string")
})

test("recordAiCall: nullable cost/tokens stored as null, ok defaults true", async () => {
  await recordAiCall({ type: "persona", model: MODEL, actorEmail: null, projectId: null })
  const row = (await opsRecentCalls(1, 0))[0]
  expect(row.type).toBe("persona")
  expect(row.costUsd).toBeNull()
  expect(row.inputTokens).toBeNull()
  expect(row.ok).toBe(true)
})
