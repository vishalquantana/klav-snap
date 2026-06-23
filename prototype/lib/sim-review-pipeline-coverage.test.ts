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

// ── Concurrency: parallel Phase 1 (error isolation + all-Sims-run) ───────────

test("runSimReviews: all N Sims produce output when all reactFns succeed", async () => {
  // Three Sims, each returning one distinct observation — all three should appear in output.
  const sims = [
    { id: `sim_par_a_${Date.now()}`, name: "Alice", role: "Buyer", summary: "Checks clarity.", insights: [], initials: "A", accent: "#6366f1" },
    { id: `sim_par_b_${Date.now()}`, name: "Bob",   role: "Dev",   summary: "Checks perf.",   insights: [], initials: "B", accent: "#8b5cf6" },
    { id: `sim_par_c_${Date.now()}`, name: "Carol", role: "PM",    summary: "Checks flow.",   insights: [], initials: "C", accent: "#a78bfa" },
  ]
  const calledIds: string[] = []

  const reviews = await baseRun({
    targetSims: sims,
    seenKeys: sims.map((_, i) => `par-key-${i}`),
    reactFn: async (sim) => {
      calledIds.push(sim.id)
      return { data: { reactions: [{ observation: `Observation from ${sim.name}`, sentiment: "negative" }] } }
    },
  })

  // All three Sims were called.
  expect(calledIds.sort()).toEqual(sims.map((s) => s.id).sort())
  // All three produced output (each has one unique observation).
  expect(reviews).toHaveLength(3)
  const names = reviews.map((r) => r.simName).sort()
  expect(names).toEqual(["Alice", "Bob", "Carol"])
})

test("runSimReviews: one Sim's reactFn throwing does NOT prevent other Sims from running", async () => {
  // Sim B's reactFn throws — Sims A and C must still produce their observations.
  const sims = [
    { id: `sim_iso_a_${Date.now()}`, name: "Alice", role: "Buyer", summary: "Clarity checker.", insights: [], initials: "A", accent: "#6366f1" },
    { id: `sim_iso_b_${Date.now()}`, name: "Bob",   role: "Dev",   summary: "Perf checker.",   insights: [], initials: "B", accent: "#8b5cf6" },
    { id: `sim_iso_c_${Date.now()}`, name: "Carol", role: "PM",    summary: "Flow checker.",   insights: [], initials: "C", accent: "#a78bfa" },
  ]

  const reviews = await baseRun({
    targetSims: sims,
    seenKeys: sims.map((_, i) => `iso-key-${i}`),
    reactFn: async (sim) => {
      if (sim.name === "Bob") throw new Error("OpenRouter timeout")
      return { data: { reactions: [{ observation: `${sim.name} saw an issue`, sentiment: "negative" }] } }
    },
  })

  // Bob is skipped (reactFn threw) but Alice and Carol still produce output.
  const names = reviews.map((r) => r.simName).sort()
  expect(names).toEqual(["Alice", "Carol"])
  expect(reviews).toHaveLength(2)
})
