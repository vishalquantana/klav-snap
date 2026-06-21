// Task 4: Triage-aware dashboard counts.
// Imports computeDashboardInsights from lib/db (NOT server.ts — server.ts calls Bun.serve()
// at module load, which would start a listener and hang tests).

import { test, expect } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-triage-ins-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file; delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, migrateV2, insertFeedback } = await import("./lib/db")
const { computeDashboardInsights } = await import("./lib/db")
await applySchema(db!); await migrateV2(db!)
const P = `proj_ins_${Date.now()}`

async function setStatus(id: string, s: string) { await db!.execute({ sql: "UPDATE feedback SET status=? WHERE id=?", args: [s, id] }) }

test("openBySeverity counts only accepted (open/in_progress) bugs; needsTriage counts new", async () => {
  const a = await insertFeedback({ projectId: P, severity: "high", sentiment: "frustrated", urlPath: "/checkout" }) // born open
  const b = await insertFeedback({ projectId: P, severity: "low", sentiment: "confused", urlPath: "/settings" })   // born new
  const c = await insertFeedback({ projectId: P, severity: "medium", urlPath: "/settings" })                       // born new
  await setStatus(c, "dismissed")
  const ins = await computeDashboardInsights(P)
  expect(ins.openBySeverity.high).toBe(1)   // a only
  expect(ins.openBySeverity.low).toBe(0)    // b is new, not counted
  expect(ins.needsTriage).toBe(1)           // b only (c dismissed)
  expect(ins.sentiment.total).toBe(2)       // a + b ; c dismissed excluded
})
