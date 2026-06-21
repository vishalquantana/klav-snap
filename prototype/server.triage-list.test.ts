import { test, expect } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-triage-list-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file; delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, migrateV2, insertFeedback, listTriageFeedback } = await import("./lib/db")
await applySchema(db!); await migrateV2(db!)
const P = `proj_tl_${Date.now()}`

test("listTriageFeedback returns only new items", async () => {
  await insertFeedback({ projectId: P, severity: "high", observation: "auto accepted" })   // open
  const n = await insertFeedback({ projectId: P, severity: "low", observation: "needs triage", suggestedBug: { title: "Bug X" } }) // new
  const list = await listTriageFeedback(P)
  expect(list.length).toBe(1)
  expect(list[0].id).toBe(n)
  expect(list[0].title).toBe("Bug X")
})
