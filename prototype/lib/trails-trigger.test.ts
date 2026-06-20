// Plan G Task 3 — runWalkNow trigger unit tests with a STUB walk fn (no browser). Proves: returns a
// runId immediately + finalizes the verdict in the background; a 2nd concurrent call → WalkBusyError;
// a walk that throws finalizes RED + releases the slot (crash isolation); unknown trail throws.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-trigger-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
beforeAll(async () => { const db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const T = await import("./trails")
const { runWalkNow } = await import("./trails-trigger")
const { WalkBusyError, isWalkInFlight } = await import("./trails-browser")

async function seedTrail() {
  return T.createTrail("proj_t", { name: "T", baseUrl: "https://app.test/", authorKind: "llm" })
}
const waitFor = async (pred: () => Promise<boolean>) => { for (let i = 0; i < 100; i++) { if (await pred()) return; await new Promise(r => setTimeout(r, 20)) } throw new Error("timeout") }

test("runWalkNow returns a runId immediately and finalizes the verdict in the background", async () => {
  const trail = await seedTrail()
  const okWalk = async (_p: string, _t: string, _r: string) => ({ verdict: "green" as const, llmCalls: 0 })
  const { runId } = await runWalkNow("proj_t", trail, { walk: okWalk })
  expect(runId).toMatch(/^walk_/)
  await waitFor(async () => (await T.getWalk("proj_t", runId))?.status === "green")
  expect(isWalkInFlight()).toBe(false)
})

test("a 2nd runWalkNow while one is in flight throws WalkBusyError", async () => {
  const trail = await seedTrail()
  let release: () => void = () => {}; const gate = new Promise<void>(r => { release = r })
  const slowWalk = async () => { await gate; return { verdict: "green" as const, llmCalls: 0 } }
  const first = await runWalkNow("proj_t", trail, { walk: slowWalk })
  expect(first.runId).toBeTruthy()
  await expect(runWalkNow("proj_t", trail, { walk: async () => ({ verdict: "green" as const, llmCalls: 0 }) })).rejects.toBeInstanceOf(WalkBusyError)
  release()
  await waitFor(async () => (await T.getWalk("proj_t", first.runId))?.status === "green")
})

test("a walk that throws finalizes the run red and releases the slot (crash isolation)", async () => {
  const trail = await seedTrail()
  const { runId } = await runWalkNow("proj_t", trail, { walk: async () => { throw new Error("kaboom") } })
  await waitFor(async () => (await T.getWalk("proj_t", runId))?.status === "red")
  expect(isWalkInFlight()).toBe(false)
})

test("runWalkNow throws on an unknown trail", async () => {
  await expect(runWalkNow("proj_t", "trl_nope")).rejects.toThrow()
})
