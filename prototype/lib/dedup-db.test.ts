import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-dedup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const {
  db,
  applySchema,
  migrateV2,
  insertFeedback,
  findFeedbackByIssueKey,
  listRecentFeedbackForDedup,
  bumpFeedbackRecurrence,
  feedbackById,
} = await import("./db")

await applySchema(db!)
await migrateV2(db!)

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const P = `proj_dedup_${RUN}`

test("findFeedbackByIssueKey returns the row; bump increments count + appends date", async () => {
  const id = await insertFeedback({ projectId: P, observation: "export hidden", suggestedBug: { title: "Export hidden" }, issueKey: "k1" })
  const found = await findFeedbackByIssueKey(P, "k1")
  expect(found?.id).toBe(id)

  await bumpFeedbackRecurrence(id, 1750000000000)
  const row = await feedbackById(P, id)
  expect(row.recurrenceCount ?? row.recurrence_count).toBe(2)
  const dates = JSON.parse(row.recurrenceDatesJson ?? row.recurrence_dates_json ?? "[]")
  expect(dates).toContain(1750000000000)
})

test("listRecentFeedbackForDedup returns id/title/observation for the project", async () => {
  await insertFeedback({ projectId: P, observation: "checkout times out", suggestedBug: { title: "Checkout timeout" }, issueKey: "k2" })
  const recent = await listRecentFeedbackForDedup(P, 50)
  expect(recent.some(r => r.title === "Checkout timeout" || r.observation === "checkout times out")).toBe(true)
})
