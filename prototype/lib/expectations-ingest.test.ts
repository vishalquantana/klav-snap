// prototype/lib/expectations-ingest.test.ts
import { test, expect } from "bun:test"
import { createClient } from "@libsql/client"
import { applySchema } from "./db"
import { ingestSnapOrSim } from "./expectations-ingest"
import { listExpectations } from "./expectations-db"
import { issueKeyFor } from "./dedup"

test("a Sim then a Snap on the same screen+issue auto-validate one expectation", async () => {
  const c = createClient({ url: "file::memory:" }); await applySchema(c)
  const dedupKey = issueKeyFor({ projectId: "p1", urlPath: "/onboarding", issueType: "label-copy", citedTraitIds: ["t1"] })
  await ingestSnapOrSim(c, { projectId: "p1", feedbackId: "fb_a", isSnap: false, title: "Finish button missing", dedupKey, urlPath: "/onboarding", issueType: "label-copy", citedTraitIds: ["t1"] })
  await ingestSnapOrSim(c, { projectId: "p1", feedbackId: "fb_b", isSnap: true,  title: "Finish button missing", dedupKey, urlPath: "/onboarding", issueType: "label-copy", citedTraitIds: ["t1"] })
  const list = await listExpectations(c, "p1")
  expect(list.length).toBe(1)
  expect(list[0].status).toBe("validated")
})

test("ingest never throws on a bad client", async () => {
  const dedupKey = "somekey"
  // @ts-expect-error intentionally broken client
  await ingestSnapOrSim(null, { projectId: "p1", feedbackId: "x", isSnap: true, title: "t", dedupKey })
  expect(true).toBe(true)
})
