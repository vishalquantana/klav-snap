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

/** Minimal page-state shape stepCacheKey needs (a TrajectoryStep or a persisted TrailStep both fit). */
interface PageStateStep { action: StepAction; url?: string; domHash?: string }

/**
 * The single exported convention for a step's cache_key (page-state fingerprint).
 * cache_key = SHA256(method, normalized-url, trailId|domHash#selector, projectId).
 *
 * cache_key is NO LONGER a uniqueness key (uniqueness is per (project_id, step_id)); it is a stored
 * page-state fingerprint. Layer D's Tier-2 reuses THIS helper so the recomputed key matches what
 * crystallize wrote. Folding trailId + selector keeps it stable per (trail, step, element).
 */
export async function stepCacheKey(
  projectId: string,
  trailId: string,
  step: PageStateStep,
  selector: string,
): Promise<string> {
  const url = step.url ?? ""
  const domHash = step.domHash ?? ""
  return cacheKey(methodFor(step.action), url, `${trailId}|${domHash}#${selector}`, projectId)
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

    // Seed a cache row for every step that resolves a concrete element — every actionable step AND
    // every assert-with-selector step. This guarantees the heal path always has a row to update so a
    // step never re-heals forever (spec §6.4 + fix #3).
    const sel = resolvedSelector(step)
    if (sel) {
      const key = await stepCacheKey(projectId, trailId, step, sel)
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
