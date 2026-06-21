import { test, expect } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-triage-bf-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file; delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, migrateV2, insertFeedback, backfillTriageV1, feedbackById } = await import("./db")
await applySchema(db!); await migrateV2(db!)
const P = `proj_bf_${Date.now()}`

test("backfill re-triages legacy open rows by the auto-accept rule, idempotently", async () => {
  // Force everything to legacy 'open' first (pre-feature state).
  const low = await insertFeedback({ projectId: P, severity: "low" })
  const high = await insertFeedback({ projectId: P, severity: "high" })
  const rec = await insertFeedback({ projectId: P, severity: "low" })
  await db!.execute({ sql: "UPDATE feedback SET status='open' WHERE project_id=?", args: [P] })
  await db!.execute({ sql: "UPDATE feedback SET recurrence_count=3 WHERE id=?", args: [rec] })
  const done = await insertFeedback({ projectId: P, severity: "low" })
  await db!.execute({ sql: "UPDATE feedback SET status='done' WHERE id=?", args: [done] })

  await backfillTriageV1(db!)
  expect((await feedbackById(P, low)).status).toBe("new")    // demoted to triage
  expect((await feedbackById(P, high)).status).toBe("open")  // high stays accepted
  expect((await feedbackById(P, rec)).status).toBe("open")   // recurring stays accepted
  expect((await feedbackById(P, done)).status).toBe("done")  // done untouched

  // idempotent: a second run, after accepting `low`, must not re-demote it
  await db!.execute({ sql: "UPDATE feedback SET status='open' WHERE id=?", args: [low] })
  await backfillTriageV1(db!)
  expect((await feedbackById(P, low)).status).toBe("open")
})
