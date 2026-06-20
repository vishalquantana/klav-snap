// Plan G Task 6 — the trigger driven by the REAL walkTrail (no stub) against the app-served demo
// fixtures (file:// equivalents of /trails-demo/*). Proves runWalkNow produces real verdicts + a saved
// replay end to end:
//   baseline   → GREEN + replay (≥1 segment)
//   drift      → AMBER + a fromSelector→toSelector heal-diff in a run_step's evidence
//   regression → RED + a grounded 'regression' finding (mock vision resolver injected via deps.walk)
// Pointing baseUrl at the bundled public/ dir makes seedDemoTrails build
// `${baseUrl}/trails-demo/<variant>/landing.html` resolve to the real served copies — no network.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join, resolve } from "node:path"; import { pathToFileURL } from "node:url"
const file = join(tmpdir(), `klav-trigger-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
beforeAll(async () => { const db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const T = await import("./trails")
const { seedDemoTrails, DEMO_TRAIL_NAMES } = await import("./trails-demo-seed")
const { runWalkNow } = await import("./trails-trigger")
const { walkTrail } = await import("./trails-runner")
const { CHROMIUM_PROD_ARGS, isWalkInFlight } = await import("./trails-browser")
const R = await import("./trails-replay")
import type { VisionResolver } from "./trails-vision"

// baseUrl = the bundled public/ dir → ${baseUrl}/trails-demo/journey/landing.html resolves to the
// served fixture copies committed in Task 4.
const PUBLIC_ORIGIN = pathToFileURL(resolve(import.meta.dir, "..", "public")).href.replace(/\/+$/, "")
const PROJ = "proj_e2e"

const waitDone = async (runId: string) => {
  for (let i = 0; i < 300; i++) {
    const w = await T.getWalk(PROJ, runId)
    // The single walk-slot releases a microtask AFTER finishWalk writes the row, so also wait for the
    // slot to clear before returning — otherwise the next runWalkNow could race into a WalkBusyError.
    if (w && w.status !== "running" && !isWalkInFlight()) return w
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error("walk did not finish")
}

let trailIds: Record<string, string>
beforeAll(async () => { trailIds = (await seedDemoTrails(PROJ, PUBLIC_ORIGIN)).trailIds })

test("baseline demo trail → GREEN with a saved replay (≥1 segment)", async () => {
  const { runId } = await runWalkNow(PROJ, trailIds[DEMO_TRAIL_NAMES.baseline])
  const walk = await waitDone(runId)
  expect(walk.status).toBe("green")
  const segs = await R.getReplay(PROJ, runId)
  expect(segs).not.toBeNull()
  expect(segs!.length).toBeGreaterThanOrEqual(1)
}, 60000)

test("drift demo trail → AMBER with a fromSelector→toSelector heal-diff in evidence", async () => {
  const { runId } = await runWalkNow(PROJ, trailIds[DEMO_TRAIL_NAMES.drift])
  const walk = await waitDone(runId)
  expect(walk.status).toBe("amber")
  const steps = await T.listRunSteps(PROJ, runId)
  const healed = steps.find(s => s.healed && (s.evidence as any)?.fromSelector)
  expect(healed).toBeTruthy()
  expect((healed!.evidence as any).fromSelector).toBe("#checkout")
  expect((healed!.evidence as any).toSelector).toBeTruthy()
}, 60000)

test("regression demo trail (mock vision 'removed') → RED + a grounded regression finding", async () => {
  // The regression demo is the ONE Trail flagged to allow vision: inject a mock resolver via a custom
  // deps.walk that calls walkTrail with vision, adopting the trigger's runId.
  const visionRemoved: VisionResolver = async () => ({
    found: false, selector: null, confidence: 0.95, classification: "removed",
    rationale: "there is no Checkout/pay affordance on the cart page anymore",
  })
  const trailId = trailIds[DEMO_TRAIL_NAMES.regression]
  const { runId } = await runWalkNow(PROJ, trailId, {
    walk: async (projectId, tId, rId) => {
      const trail = await T.getTrail(projectId, tId)
      const s = await walkTrail(projectId, tId, {
        fixtureUrl: trail!.baseUrl, replay: true, launchArgs: CHROMIUM_PROD_ARGS, vision: visionRemoved, runId: rId,
      })
      return { verdict: s.verdict, llmCalls: s.llmCalls }
    },
  })
  const walk = await waitDone(runId)
  expect(walk.status).toBe("red")
  const findings = (await T.listFindings(PROJ)).filter(f => f.runId === runId && f.kind === "regression")
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings[0].groundQuote).toBeTruthy()
}, 60000)
