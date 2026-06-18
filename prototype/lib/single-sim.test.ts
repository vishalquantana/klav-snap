import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-ssv-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const {
  db,
  applySchema,
  insertTranscript,
  insertTrait,
  insertTraitEvent,
  transcriptById,
  sourceTranscriptsForSim,
} = await import("./db")

await applySchema(db!)

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const P = `proj_ssv_${RUN}`
const OTHER = `proj_other_${RUN}`
const SIM = `sim_${RUN}`

test("transcriptById is project-scoped", async () => {
  const tid = await insertTranscript({
    projectId: P,
    title: "Q1 call",
    rawText: "hello world",
    sourceDate: 1000,
    addedBy: "a@x.com",
  })
  expect((await transcriptById(P, tid))?.rawText).toBe("hello world")
  expect(await transcriptById(OTHER, tid)).toBeNull() // wrong project → null
})

test("sourceTranscriptsForSim: distinct trait_event transcripts, newest-first, excludes legacy_import", async () => {
  const t1 = await insertTranscript({ projectId: P, title: "Call A", rawText: "a", sourceDate: 100, addedBy: "a@x.com" })
  const t2 = await insertTranscript({ projectId: P, title: "Call B", rawText: "b", sourceDate: 300, addedBy: "b@x.com" })

  // Insert a trait using the real Trait shape from provenance.ts
  const traitId = `tr_${RUN}`
  await insertTrait({
    id: traitId,
    simId: SIM,
    projectId: P,
    kind: "pain",
    text: "slow",
    status: "active",
    strength: 1,
    srcTranscriptId: t1,
    srcQuote: "ugh",
    srcQuoteOffset: null,
    srcSpeaker: "a",
    createdAt: 1,
    updatedAt: 1,
  })

  // Insert trait events — real TraitEventRow shape (createdAt required)
  await insertTraitEvent({
    traitId,
    simId: SIM,
    transcriptId: t1,
    op: "create",
    beforeText: null,
    afterText: "slow",
    quote: "ugh",
    quoteOffset: null,
    speaker: "a",
    sourceDate: 100,
    reason: null,
    createdAt: Date.now(),
  })
  await insertTraitEvent({
    traitId,
    simId: SIM,
    transcriptId: t2,
    op: "reinforce",
    beforeText: null,
    afterText: "slow",
    quote: "still slow",
    quoteOffset: null,
    speaker: "b",
    sourceDate: 300,
    reason: null,
    createdAt: Date.now(),
  })
  // A legacy_import event — must be excluded from results
  await insertTraitEvent({
    traitId,
    simId: SIM,
    transcriptId: "legacy_import",
    op: "create",
    beforeText: null,
    afterText: "slow",
    quote: "",
    quoteOffset: null,
    speaker: null,
    sourceDate: 0,
    reason: null,
    createdAt: Date.now(),
  })

  const out = await sourceTranscriptsForSim(SIM, P)
  // newest sourceDate first (t2=300 > t1=100), distinct, no legacy_import
  expect(out.map((t) => t.id)).toEqual([t2, t1])
  expect(out[0].title).toBe("Call B")
})
