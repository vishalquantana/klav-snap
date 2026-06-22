import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
const file = join(tmpdir(), `klav-fbfields-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, insertFeedback, listFeedback, feedbackById } = await import("./db")
await applySchema(db!)
const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const P = `proj_fbf_${RUN}`

test("listFeedback exposes suggestedBug/sourceQuote/citedTraitIds/sourceDate", async () => {
  await insertFeedback({
    projectId: P, simId: `sim_${RUN}`, observation: "label is wrong",
    sentiment: "frustrated", severity: "high", screenshotId: `shot_${RUN}`,
    suggestedBug: { title: "Fix label", body: "the CTA says Submit not Save", severity: "high" },
    citedTraitIds: ["t1"], sourceQuote: "I hate when labels lie", sourceDate: 1750000000000,
  })
  const rows = await listFeedback(P, { limit: 5 })
  expect(rows.length).toBe(1)
  const r = rows[0]
  expect(r.suggestedBug).toEqual({ title: "Fix label", body: "the CTA says Submit not Save", severity: "high" })
  expect(r.sourceQuote).toBe("I hate when labels lie")
  expect(r.citedTraitIds).toEqual(["t1"])
  expect(r.sourceDate).toBe(1750000000000)
  expect(r.observation).toBe("label is wrong") // existing field still works
})

test("source attribution: urlHost (embed site) + sourceReferrer (where they came from) round-trip", async () => {
  const PS = `proj_src_${RUN}`
  const id = await insertFeedback({
    projectId: PS, observation: "checkout button dead",
    urlHost: "shop.acme.com", urlPath: "/cart",
    sourceReferrer: "https://www.google.com/",
  })
  const rows = await listFeedback(PS, { limit: 5 })
  expect(rows.length).toBe(1)
  expect(rows[0].urlHost).toBe("shop.acme.com")        // the external site the widget is embedded on
  expect(rows[0].sourceReferrer).toBe("https://www.google.com/") // the upstream traffic source
  // feedbackById (used by the lead alert + connector ticket body) must also expose it.
  const one = await feedbackById(PS, id)
  expect(one.sourceReferrer).toBe("https://www.google.com/")
})
