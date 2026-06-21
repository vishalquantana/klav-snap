import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-triage-rec-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { db, applySchema, migrateV2, insertFeedback, bumpFeedbackRecurrence, feedbackById } = await import("./db")
await applySchema(db!)
await migrateV2(db!)

const P = `proj_rec_${Date.now()}`

test("a 'new' item is promoted to 'open' when recurrence reaches 3", async () => {
  const id = await insertFeedback({ projectId: P, observation: "low sev recurring", severity: "low", issueKey: "rk1" })
  expect((await feedbackById(P, id)).status).toBe("new")
  await bumpFeedbackRecurrence(id, 1)   // count 2, still new
  expect((await feedbackById(P, id)).status).toBe("new")
  await bumpFeedbackRecurrence(id, 2)   // count 3 -> promote
  expect((await feedbackById(P, id)).status).toBe("open")
})

test("recurrence never resurrects a dismissed item", async () => {
  const id = await insertFeedback({ projectId: P, observation: "dismissed recurring", severity: "low", issueKey: "rk2" })
  // simulate a triage dismiss
  await db!.execute({ sql: "UPDATE feedback SET status='dismissed' WHERE id=?", args: [id] })
  await bumpFeedbackRecurrence(id, 1)
  await bumpFeedbackRecurrence(id, 2)   // count 3, but dismissed
  expect((await feedbackById(P, id)).status).toBe("dismissed")
})
