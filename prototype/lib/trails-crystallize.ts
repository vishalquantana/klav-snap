// Layer B (orchestration, pure of browser/LLM): resolved trajectory -> Trail + steps + seeded locator_cache.
// The flaky author run is discarded; the crystal (DB rows + cache + exportable code) is the durable artifact.
import type { Fingerprint, StepAction, AuthorKind, Trail, TrailStep } from "./trails-types"
import { cacheKey } from "./trails-types"
import { createTrail, addTrailStep, upsertLocatorCache, listTrailSteps } from "./trails"
import { generatePlaywright } from "./trails-codegen"

export interface TrajectoryStep {
  action: StepAction
  actionValue?: string
  /** Resolved target: a concrete selector + multi-signal fingerprint. */
  target?: Fingerprint & { resolvedSelector?: string }
  checkpoint?: { description: string }
  /** Page URL this step executed on (cache-key salt). */
  url: string
  /** Hash of the DOM at execution time (cache-key salt). */
  domHash: string
}

export interface Trajectory {
  name: string
  intent?: string
  baseUrl: string
  authorKind?: AuthorKind
  createdBy?: string
  steps: TrajectoryStep[]
}

export interface CrystallizeResult {
  trailId: string
  /** stepIds aligned to trajectory.steps order. */
  stepIds: string[]
  /** stepId -> cacheKey, only for actionable (cached) steps. */
  cacheKeys: Record<string, string>
}

// Method is only a cache-key salt component; the runner uses the same convention to recompute.
function methodFor(action: StepAction): string {
  return action === "navigate" ? "GET" : "ACTION"
}

// The spec cacheKey identifies a (method, url, dom-hash, project) page-state. The UNIQUE cache_key
// means two cache rows can never share a key, but two actionable steps legitimately can share a
// page+DOM (email then password on one login screen), and two Trails in one project can replay the
// same page. We make the key per-(trail,step,element) deterministic by folding the trail id + the
// step's resolved selector into the dom-hash component. The runner recomputes with the same
// convention (it holds the trail id and the cache's resolved selector).
function domHashFor(trailId: string, step: TrajectoryStep, selector: string): string {
  return `${trailId}|${step.domHash}#${selector}`
}

// Actionable = touches a concrete element (has a resolved selector) => gets a cache row.
function resolvedSelector(step: TrajectoryStep): string | undefined {
  return step.target?.resolvedSelector
}

// Strip resolvedSelector so target_json holds the Fingerprint only (selector lives in locator_cache).
function fingerprintOnly(target: TrajectoryStep["target"]): Fingerprint | undefined {
  if (!target) return undefined
  const { resolvedSelector: _drop, ...fp } = target
  return fp
}

/**
 * Crystallize a resolved trajectory into a persisted Trail.
 * Project-scoped (projectId first). Pure of browser/LLM — only Layer A helpers + cacheKey.
 */
export async function crystallize(projectId: string, traj: Trajectory): Promise<CrystallizeResult> {
  const trailId = await createTrail(projectId, {
    name: traj.name,
    intent: traj.intent,
    baseUrl: traj.baseUrl,
    authorKind: traj.authorKind ?? "llm",
    createdBy: traj.createdBy,
  })

  const stepIds: string[] = []
  const cacheKeys: Record<string, string> = {}

  for (let i = 0; i < traj.steps.length; i++) {
    const step = traj.steps[i]
    const stepId = await addTrailStep(projectId, trailId, {
      idx: i,
      action: step.action,
      actionValue: step.actionValue,
      target: fingerprintOnly(step.target),
      checkpoint: step.checkpoint,
    })
    stepIds.push(stepId)

    const sel = resolvedSelector(step)
    if (sel) {
      const key = await cacheKey(methodFor(step.action), step.url, domHashFor(trailId, step, sel), projectId)
      await upsertLocatorCache(projectId, {
        trailId,
        stepId,
        cacheKey: key,
        resolvedSelector: sel,
        fingerprint: fingerprintOnly(step.target),
        confidence: 1.0,
        source: "crystallize",
      })
      cacheKeys[stepId] = key
    }
  }

  return { trailId, stepIds, cacheKeys }
}

/**
 * Convenience: load a crystallized Trail's steps and emit the exportable Playwright string.
 * Pure read + codegen. selectors come from the trajectory map (stepId -> selector).
 */
export async function crystallizeToCode(
  projectId: string,
  trail: Trail,
  selectors: Record<string, string>,
): Promise<string> {
  const steps: TrailStep[] = await listTrailSteps(projectId, trail.id)
  return generatePlaywright(trail, steps, selectors)
}
