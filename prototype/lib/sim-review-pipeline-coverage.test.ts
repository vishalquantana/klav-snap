import { beforeAll, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { unlinkSync } from "node:fs"

const DB_FILE = join(tmpdir(), `klav-sim-review-pipeline-${Date.now()}-${randomUUID()}.db`)
const PROJECT_ID = `proj_sim_review_pipeline_${Date.now()}`
const ACTOR = "sim-review-pipeline@test.local"

function rmDb() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(DB_FILE + suffix) } catch {}
  }
}

rmDb()
process.env.TURSO_DATABASE_URL = "file:" + DB_FILE
delete process.env.TURSO_AUTH_TOKEN

const dbMod = await import("./db")
const { runSimReviews, hashObservation } = await import("./sim-review")
type SimRunOptions = Parameters<typeof runSimReviews>[0]

beforeAll(async () => {
  const c = dbMod.reconnectDb("file:" + DB_FILE)
  await dbMod.applySchema(c)
  await dbMod.migrateV2(c)
})

const emptyCitation = {
  citedTraitIds: [],
  sourceQuote: null,
  speaker: null,
  sourceTranscriptId: null,
  sourceDate: null,
  issueType: null,
  sourceQuoteVerified: null,
  recurrence: null,
}

function baseRun(overrides: Partial<SimRunOptions> = {}) {
  return runSimReviews({
    projectId: PROJECT_ID,
    urlPath: "/pricing",
    urlHost: "example.test",
    pageUrl: "https://example.test/pricing",
    imageB64: "iVBORw0KGgo=",
    mediaType: "image/png",
    targetSims: [],
    actorEmail: ACTOR,
    screenshotId: "shot_test",
    seenKeys: [],
    reactFn: async () => ({ data: { reactions: [] } }),
    resolveCitationsFn: async () => emptyCitation,
    db: dbMod.db,
    ...overrides,
  })
}

test("runSimReviews injects persona description context for a zero-trait Sim", async () => {
  let promptedSim: any = null

  const reviews = await baseRun({
    targetSims: [{
      id: `sim_desc_${Date.now()}`,
      name: "Morgan Buyer",
      role: "Procurement Lead",
      summary: "Evaluates enterprise tools for compliance and rollout risk.",
      insights: [],
      initials: "MB",
      accent: "#6366f1",
    }],
    seenKeys: ["desc-key"],
    reactFn: async (sim) => {
      promptedSim = sim
      return { data: { reactions: [{ observation: "The compliance promise is visible.", sentiment: "positive" }] } }
    },
  })

  expect(reviews).toHaveLength(1)
  expect(promptedSim?.insights).toHaveLength(1)
  expect(promptedSim.insights[0]).toMatchObject({
    traitId: "_persona_description",
    kind: "description",
    strength: 0.5,
  })
  expect(promptedSim.insights[0].text).toContain("Procurement Lead")
  expect(promptedSim.insights[0].text).toContain("compliance and rollout risk")
})

test("runSimReviews filters already-seen observation hashes but keeps new observations", async () => {
  const oldText = "The primary CTA is hard to find"
  const newText = "The pricing proof is clear"

  const reviews = await baseRun({
    targetSims: [{
      id: `sim_seen_hash_${Date.now()}`,
      name: "Seen Hash Sim",
      role: "Buyer",
      summary: "Checks conversion clarity.",
      insights: [{ traitId: "trait_existing", kind: "want", text: "Needs clear purchase signals." }],
      initials: "SH",
      accent: "#8b5cf6",
    }],
    seenKeys: ["seen-hash-key"],
    seenHashes: new Set([hashObservation(oldText)]),
    reactFn: async () => ({
      data: {
        reactions: [
          { observation: oldText, sentiment: "negative" },
          { observation: newText, sentiment: "positive" },
        ],
      },
    }),
  })

  expect(reviews).toHaveLength(1)
  expect(reviews[0].observations.map((o) => o.observation)).toEqual([newText])
  expect(reviews[0].observations[0].hash).toBe(hashObservation(newText))
})

test("reviewDedupeKey-style per-Sim seen set only skips the matching Sim", async () => {
  const { reviewDedupeKey } = dbMod
  const sims = [
    { id: "sim_a", name: "A" },
    { id: "sim_b", name: "B" },
  ]
  const seen = new Set([reviewDedupeKey("sim_a", "/pricing", "dom-1")])
  const keys = sims.map((sim) => reviewDedupeKey(sim.id, "/pricing/", "dom-1"))
  const active = sims.filter((_, i) => !seen.has(keys[i])).map((sim) => sim.id)

  expect(keys[0]).not.toBe(keys[1])
  expect(active).toEqual(["sim_b"])
})
