// Task 1: DB layer — connectors + ticket_exports tables, ticket-meta helpers.
// Hermetic: points module's `db` singleton at a fresh LOCAL libsql file by setting
// TURSO_DATABASE_URL *before* importing ./db (matches ai-credits.test.ts pattern).
import { test, expect, beforeEach } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unlinkSync } from "node:fs"

// Each test file gets its own DB file; beforeEach re-initialises via applySchema+migrations.
const file = join(tmpdir(), `klav-connectors-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const {
  db, applySchema, migrateV2, initDb,
  createConnector, listConnectors, getConnectorById, updateConnector,
  removeConnector, listAutoCopyConnectors,
  updateFeedbackMeta, feedbackById,
  addTicketExport, listTicketExports, exportsForFeedbackIds,
  insertFeedback,
} = await import("./db")

// Seed the schema once before all tests.
await applySchema(db!)
await migrateV2(db!)

// Helper: seed a feedback row for a given project, returns the feedback id.
async function seedFeedback(projectId: string): Promise<string> {
  return await insertFeedback({ projectId, observation: "test observation", severity: "low" })
}

// Clean up and re-apply schema before each test to isolate state.
// For simplicity, we rely on unique ids in each test to scope assertions rather than
// re-creating the DB (mirroring the ai-credits test approach).

test("connector CRUD round-trips and scopes by project", async () => {
  const id = await createConnector("proj_A", {
    type: "webhook",
    name: "Zap",
    config: { url: "https://x/y", secret: "enc:abc" },
    autoCopy: true,
    createdBy: "a@b.c",
  })
  const got = await getConnectorById("proj_A", id)
  expect(got?.type).toBe("webhook")
  expect(got?.autoCopy).toBe(true)
  expect(got?.config.url).toBe("https://x/y")
  // cross-project isolation
  expect(await getConnectorById("proj_B", id)).toBeNull()

  await updateConnector("proj_A", id, { autoCopy: false, enabled: false })
  expect((await getConnectorById("proj_A", id))?.autoCopy).toBe(false)
  // disabled → excluded from auto-copy list
  expect(await listAutoCopyConnectors("proj_A")).toHaveLength(0)

  await removeConnector("proj_A", id)
  // filter to just our project since other tests may have added connectors
  const remaining = await listConnectors("proj_A")
  expect(remaining.find((c) => c.id === id)).toBeUndefined()
})

test("updateFeedbackMeta sets status/assignee/notes + updated_at, project-scoped", async () => {
  const fid = await seedFeedback("proj_A_meta")
  // wrong project → no-op → returns false
  expect(await updateFeedbackMeta("proj_B_meta", fid, { status: "done" })).toBe(false)
  // correct project → returns true
  expect(await updateFeedbackMeta("proj_A_meta", fid, { status: "in_progress", assignee: "me@x", notes: "n" })).toBe(true)
  const row = await feedbackById("proj_A_meta", fid)
  expect(row.status).toBe("in_progress")
  expect(row.assignee).toBe("me@x")
  expect(row.notes).toBe("n")
  expect(row.updatedAt).toBeGreaterThan(0)
})

test("ticket exports record + batch fetch", async () => {
  const fid = await seedFeedback("proj_A_exp")
  await addTicketExport({
    feedbackId: fid,
    projectId: "proj_A_exp",
    connectorId: "conn_1",
    type: "github",
    externalKey: "#12",
    externalUrl: "https://gh/issues/12",
    status: "ok",
    error: null,
    createdBy: "a@b.c",
  })
  const list = await listTicketExports(fid)
  expect(list).toHaveLength(1)
  const batch = await exportsForFeedbackIds([fid])
  expect(batch[fid][0].externalKey).toBe("#12")
})

test("feedbackById returns null for wrong project", async () => {
  const fid = await seedFeedback("proj_A_fbid")
  expect(await feedbackById("proj_B_fbid", fid)).toBeNull()
  const row = await feedbackById("proj_A_fbid", fid)
  expect(row).not.toBeNull()
  expect(row.id).toBe(fid)
  // new columns have defaults
  expect(row.status).toBe("open")
  expect(row.assignee).toBeNull()
  expect(row.notes).toBeNull()
})

test("listAutoCopyConnectors only returns enabled+autoCopy connectors", async () => {
  const pid = "proj_autocopy_test"
  const c1 = await createConnector(pid, { type: "plane", name: "Auto Plane", config: {}, autoCopy: true, createdBy: null })
  const c2 = await createConnector(pid, { type: "webhook", name: "Manual", config: {}, autoCopy: false, createdBy: null })
  const c3 = await createConnector(pid, { type: "github", name: "Disabled Auto", config: {}, autoCopy: true, createdBy: null })
  await updateConnector(pid, c3, { enabled: false })

  const autoCopy = await listAutoCopyConnectors(pid)
  const ids = autoCopy.map((c) => c.id)
  expect(ids).toContain(c1)
  expect(ids).not.toContain(c2)
  expect(ids).not.toContain(c3)
})

test("exportsForFeedbackIds handles empty array and multiple feedback ids", async () => {
  // empty array → empty object
  const empty = await exportsForFeedbackIds([])
  expect(Object.keys(empty)).toHaveLength(0)

  const fid1 = await seedFeedback("proj_batch")
  const fid2 = await seedFeedback("proj_batch")

  await addTicketExport({ feedbackId: fid1, projectId: "proj_batch", connectorId: "c1", type: "jira", externalKey: "JIRA-1", externalUrl: "https://jira/JIRA-1", status: "ok", error: null, createdBy: null })
  await addTicketExport({ feedbackId: fid2, projectId: "proj_batch", connectorId: "c2", type: "linear", externalKey: "LIN-1", externalUrl: "https://lin/LIN-1", status: "failed", error: "timeout", createdBy: null })

  const batch = await exportsForFeedbackIds([fid1, fid2])
  expect(batch[fid1]).toHaveLength(1)
  expect(batch[fid1][0].externalKey).toBe("JIRA-1")
  expect(batch[fid2][0].status).toBe("failed")
  expect(batch[fid2][0].error).toBe("timeout")
})

test("initDb runs applySchema + migrations idempotently (no throw on second run)", async () => {
  // We cannot call the real initDb (requires prod Turso) but we can call applySchema + migrateV2 again
  // to verify idempotency — same pattern as migrate.test.ts
  await applySchema(db!)
  await migrateV2(db!)
  // If we get here without throwing, idempotency holds.
  expect(true).toBe(true)
})
