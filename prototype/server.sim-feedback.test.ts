// Sim Profile: feedback-by-sim, each annotated with its TRIAGE OUTCOME so the
// profile page can show the Sim "getting better" from triage.
// In-process temp-DB pattern (mirrors server.triage-list.test.ts).
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-sim-fb-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file; delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, migrateV2, insertFeedback, updateFeedbackMeta, listFeedbackForSim, triageOutcome } = await import("./lib/db")
await applySchema(db!); await migrateV2(db!)
const P = `proj_sf_${Date.now()}`
const SIM = `sim_sf_${Date.now()}`
const OTHER = `sim_other_${Date.now()}`

test("triageOutcome maps feedback status to confirmed / dismissed / pending", () => {
  expect(triageOutcome("dismissed")).toBe("dismissed")        // triaged: not a real bug ("no")
  expect(triageOutcome("new")).toBe("pending")                // not yet triaged
  expect(triageOutcome("open")).toBe("confirmed")             // accepted as a real bug ("yes")
  expect(triageOutcome("in_progress")).toBe("confirmed")
  expect(triageOutcome("done")).toBe("confirmed")
  expect(triageOutcome(null)).toBe("pending")                 // default = needs triage
})

test("listFeedbackForSim returns only this Sim's feedback, newest-first, with outcome + title", async () => {
  const confirmedId = await insertFeedback({ projectId: P, simId: SIM, severity: "low", observation: "checkout button dead", suggestedBug: { title: "Checkout CTA does nothing" } })
  await updateFeedbackMeta(P, confirmedId, { status: "open" }) // triage accepted → confirmed
  const dismissedId = await insertFeedback({ projectId: P, simId: SIM, severity: "low", observation: "colour too blue", suggestedBug: { title: "Brand colour off" } })
  await updateFeedbackMeta(P, dismissedId, { status: "dismissed" }) // triage rejected → dismissed
  await insertFeedback({ projectId: P, simId: SIM, severity: "low", observation: "pending one", suggestedBug: { title: "Still in queue" } }) // new → pending
  // Noise that must NOT appear: another Sim, and an anonymous (no-sim) report.
  await insertFeedback({ projectId: P, simId: OTHER, severity: "low", observation: "other sim" })
  await insertFeedback({ projectId: P, simId: null, severity: "low", observation: "anonymous snap" })

  const rows = await listFeedbackForSim(P, SIM)
  expect(rows.length).toBe(3)
  // newest-first ordering
  expect(rows[0].title).toBe("Still in queue")
  expect(rows[0].outcome).toBe("pending")
  const byId = Object.fromEntries(rows.map(r => [r.id, r]))
  expect(byId[confirmedId].outcome).toBe("confirmed")
  expect(byId[confirmedId].title).toBe("Checkout CTA does nothing")
  expect(byId[dismissedId].outcome).toBe("dismissed")
})

test("listFeedbackForSim falls back to the observation when there's no suggested-bug title", async () => {
  const id = await insertFeedback({ projectId: P, simId: SIM, severity: "low", observation: "raw observation only, no LLM bug" })
  const rows = await listFeedbackForSim(P, SIM)
  const row = rows.find(r => r.id === id)!
  expect(row.title).toContain("raw observation only")
})
