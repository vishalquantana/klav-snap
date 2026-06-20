// prototype/lib/expectations-db.test.ts
import { test, expect } from "bun:test"
import { createClient } from "@libsql/client"
import { applySchema } from "./db"
import { upsertExpectation, listExpectations, getExpectation, setExpectationEnforced } from "./expectations-db"

async function fresh() { const c = createClient({ url: "file::memory:" }); await applySchema(c); return c }

test("first source creates a candidate", async () => {
  const c = await fresh()
  const e = await upsertExpectation(c, { projectId: "p1", title: "Finish button missing", urlPath: "/onboarding", dedupKey: "k1", source: { kind: "sim", id: "fb_1" } })
  expect(e.status).toBe("candidate")
  expect(e.corroboration).toEqual({ snap: false, sim: true, recurrence: 1 })
  expect(e.sourceRefs).toEqual([{ kind: "sim", id: "fb_1" }])
})

test("snap + sim on same dedup_key collapses and auto-validates", async () => {
  const c = await fresh()
  await upsertExpectation(c, { projectId: "p1", title: "Finish button missing", dedupKey: "k1", source: { kind: "sim", id: "fb_1" } })
  const e = await upsertExpectation(c, { projectId: "p1", title: "Finish button missing", dedupKey: "k1", source: { kind: "snap", id: "fb_2" } })
  expect(e.status).toBe("validated")
  expect(e.corroboration).toEqual({ snap: true, sim: true, recurrence: 2 })
  expect((await listExpectations(c, "p1")).length).toBe(1) // collapsed, not duplicated
})

test("lexical near-duplicate collapses even with a different dedup_key", async () => {
  const c = await fresh()
  await upsertExpectation(c, { projectId: "p1", title: "Finish button missing on onboarding", dedupKey: "k1", source: { kind: "sim", id: "s1" } })
  const e = await upsertExpectation(c, { projectId: "p1", title: "Finish button is missing on onboarding", dedupKey: "k2", source: { kind: "snap", id: "s2" } })
  expect((await listExpectations(c, "p1")).length).toBe(1)
  expect(e.status).toBe("validated")
})

test("setExpectationEnforced flips status + records step", async () => {
  const c = await fresh()
  const e = await upsertExpectation(c, { projectId: "p1", title: "x", dedupKey: "k1", source: { kind: "snap", id: "s1" } })
  await setExpectationEnforced(c, e.id, "ts_99")
  const got = await getExpectation(c, e.id)
  expect(got!.status).toBe("enforced")
  expect(got!.enforcedStepId).toBe("ts_99")
})
