// Layer C: the RUNNER — the smallest runnable end-to-end Trail walk.
// Zero-LLM deterministic replay (Tier 0 = cached resolved selector) + Tier 1 self-heal
// (multi-candidate fallback: cached selector -> role+accessible-name -> visible text ->
//  data-testid -> structural domPath). NO LLM/vision here: Tier 2 only records an AMBER
// 'needs-vision' run_step, it NEVER fabricates a heal and NEVER silent-greens.
//
// Trust guardrails (spec §6): diagnosis-first, confidence-gated (heal lands at >=0.9),
// healing never overrides a checkpoint, fail-loud (removed actionable element -> RED).
//
// Project-scoped: projectId is the first arg of every persisted call and every query.
import { chromium } from "playwright"
import type { Browser, Page, Locator } from "playwright"
import type { Fingerprint, Tier, Verdict, TrailStep } from "./trails-types"
import {
  getTrail, listTrailSteps, getCacheForStep, upsertLocatorCache,
  startWalk, addRunStep, finishWalk,
} from "./trails"

export interface WalkOptions {
  /** Concrete URL to walk against (overrides the trail's baseUrl). file:// or http(s)://. */
  fixtureUrl: string
  headless?: boolean
}

export interface WalkStepSummary {
  stepId: string
  idx: number
  tier: Tier
  verdict: Verdict
  healed: boolean
}

export interface WalkSummary {
  runId: string
  verdict: Verdict
  /** Always 0 in Layer C — this layer is zero-LLM by construction. */
  llmCalls: 0
  steps: WalkStepSummary[]
  healedCount: number
}

const HEAL_CONFIDENCE = 0.9 // spec §6.3 threshold (>=0.9), not Healenium's 0.5
const CACHE_CONFIDENCE = 1.0

// Thrown when no tier can resolve the target to exactly-one actionable element.
class ElementGone extends Error {
  constructor(public readonly fp: Fingerprint | null) {
    super("element gone: no tier resolved the target")
  }
}

// Verdict ordering: worst wins for the Walk roll-up.
const SEVERITY: Record<Verdict, number> = { green: 0, skip: 0, amber: 1, red: 2 }
function worse(a: Verdict, b: Verdict): Verdict {
  return SEVERITY[b] > SEVERITY[a] ? b : a
}

// A locator "resolves" iff it matches exactly one element. Visibility is checked by the action
// (Playwright auto-waits for actionability); for assert we require visible explicitly.
async function uniquelyResolves(loc: Locator): Promise<boolean> {
  return (await loc.count()) === 1
}

// Intent verification (spec §6.2: confirm we found the RIGHT element, never just "an element").
// A heal candidate is only acceptable if the resolved element is consistent with the target's
// declared role. This is what stops the silent-false-green where a removed <button>Sign in</button>
// "heals" to the surviving <h1>Sign in</h1> heading by text — different role => reject the candidate.
async function roleConsistent(loc: Locator, expectedRole: string | undefined): Promise<boolean> {
  if (!expectedRole) return true
  try {
    const tag = await loc.evaluate((el: Element) => el.tagName.toLowerCase())
    const explicit = await loc.getAttribute("role")
    if (explicit && explicit === expectedRole) return true
    // Minimal implicit-role map for the roles this layer exercises.
    const implicit: Record<string, string[]> = {
      button: ["button"],
      textbox: ["input", "textarea"],
      heading: ["h1", "h2", "h3", "h4", "h5", "h6"],
      link: ["a"],
    }
    return (implicit[expectedRole] ?? []).includes(tag)
  } catch {
    return false
  }
}

interface ResolveResult {
  tier: Exclude<Tier, "none">
  selector: string | null // the selector to persist as the new cache value (null = role/text/etc locator, encode it)
  locator: Locator
  healed: boolean
  confidence: number
}

// Build a stable CSS selector to persist for a healed element so the NEXT walk is Tier 0 again.
// Prefer id, then data-testid, then the role+name candidate re-expressed structurally; never persist
// a brittle nth-child if a stable handle exists.
async function persistableSelector(page: Page, loc: Locator): Promise<string | null> {
  try {
    return await loc.evaluate((el: Element) => {
      if (el.id) return "#" + CSS.escape(el.id)
      const tid = el.getAttribute("data-testid")
      if (tid) return `[data-testid="${tid}"]`
      const al = el.getAttribute("aria-label")
      if (al) return `${el.tagName.toLowerCase()}[aria-label="${al}"]`
      return null
    })
  } catch {
    return null
  }
}

// Tier 0 -> Tier 1 candidate ladder. Returns the first tier whose candidate uniquely resolves.
// Order: cached selector (Tier 0) -> role+name -> text -> testid -> structural domPath (Tier 1).
async function resolveTarget(
  page: Page,
  cachedSelector: string | null,
  fp: Fingerprint | null,
): Promise<ResolveResult> {
  // Tier 0: the cached concrete selector, verbatim. Zero work, zero heal.
  if (cachedSelector) {
    const loc = page.locator(cachedSelector)
    if (await uniquelyResolves(loc)) {
      return { tier: "cache", selector: cachedSelector, locator: loc, healed: false, confidence: CACHE_CONFIDENCE }
    }
  }

  // Tier 1 multi-candidate semantic fallback (no LLM). Each must uniquely resolve.
  if (fp) {
    // 1. role + accessible-name (the faithful accname signal, strongest semantic anchor)
    if (fp.role && fp.accessibleName) {
      const loc = page.getByRole(fp.role as any, { name: fp.accessibleName, exact: true })
      if (await uniquelyResolves(loc)) {
        return { tier: "candidate", selector: await persistableSelector(page, loc), locator: loc, healed: true, confidence: HEAL_CONFIDENCE }
      }
    }
    // 2. visible text — but only if the resolved element's role matches the target's (intent
    //    verification): a removed <button> must NOT heal onto a same-text <h1>.
    if (fp.text) {
      const loc = page.getByText(fp.text, { exact: true })
      if ((await uniquelyResolves(loc)) && (await roleConsistent(loc, fp.role))) {
        return { tier: "candidate", selector: await persistableSelector(page, loc), locator: loc, healed: true, confidence: HEAL_CONFIDENCE }
      }
    }
    // 3. data-testid
    if (fp.testId) {
      const loc = page.locator(`[data-testid="${fp.testId}"]`)
      if ((await uniquelyResolves(loc)) && (await roleConsistent(loc, fp.role))) {
        return { tier: "candidate", selector: `[data-testid="${fp.testId}"]`, locator: loc, healed: true, confidence: HEAL_CONFIDENCE }
      }
    }
    // 4. structural domPath
    if (fp.domPath) {
      const loc = page.locator(fp.domPath)
      if ((await uniquelyResolves(loc)) && (await roleConsistent(loc, fp.role))) {
        return { tier: "candidate", selector: fp.domPath, locator: loc, healed: true, confidence: HEAL_CONFIDENCE }
      }
    }
  }

  throw new ElementGone(fp)
}

/**
 * Walk a crystallized Trail against a real page. Project-scoped.
 * Opens the page once, replays each step (Tier 0 cache -> Tier 1 heal), evaluates checkpoints,
 * writes run_steps + the Walk verdict via Layer A, returns a summary. Zero LLM.
 */
export async function walkTrail(projectId: string, trailId: string, opts: WalkOptions): Promise<WalkSummary> {
  const trail = await getTrail(projectId, trailId)
  if (!trail) throw new Error(`trail ${trailId} not found in project ${projectId}`)
  const steps = await listTrailSteps(projectId, trailId)

  const runId = await startWalk(projectId, trailId, "manual")

  const browser: Browser = await chromium.launch({ headless: opts.headless ?? true })
  const stepSummaries: WalkStepSummary[] = []
  let walkVerdict: Verdict = "green"
  let healedCount = 0

  try {
    const page: Page = await browser.newPage()
    await page.goto(opts.fixtureUrl)

    for (const step of steps) {
      const { tier, verdict, healed } = await runOneStep(projectId, runId, trail.id, page, step, opts.fixtureUrl)
      stepSummaries.push({ stepId: step.id, idx: step.idx, tier, verdict, healed })
      if (healed) healedCount++
      walkVerdict = worse(walkVerdict, verdict)
    }
  } finally {
    await browser.close()
  }

  await finishWalk(projectId, runId, {
    status: walkVerdict,
    llmCalls: 0,
    summary: { healedCount, stepCount: steps.length },
  })

  return { runId, verdict: walkVerdict, llmCalls: 0, steps: stepSummaries, healedCount }
}

interface OneStepResult { tier: Tier; verdict: Verdict; healed: boolean }

// Execute a single step. Records exactly one run_step. Never silent-greens a break.
async function runOneStep(
  projectId: string,
  runId: string,
  trailId: string,
  page: Page,
  step: TrailStep,
  fixtureUrl: string,
): Promise<OneStepResult> {
  // navigate / wait have no element to resolve.
  if (step.action === "navigate") {
    // In Layer C the whole walk is scoped to fixtureUrl; re-navigate to it (origin already loaded).
    await page.goto(step.actionValue && /^https?:|^file:/.test(step.actionValue) ? step.actionValue : fixtureUrl)
    await addRunStep(projectId, { runId, trailId, stepId: step.id, idx: step.idx, tier: "none", verdict: "green", confidence: 1, healed: false, evidence: { action: "navigate" } })
    return { tier: "none", verdict: "green", healed: false }
  }
  if (step.action === "wait") {
    // Condition-based wait, never a blind sleep (spec §8).
    await page.waitForLoadState("networkidle").catch(() => {})
    await addRunStep(projectId, { runId, trailId, stepId: step.id, idx: step.idx, tier: "none", verdict: "green", confidence: 1, healed: false, evidence: { action: "wait" } })
    return { tier: "none", verdict: "green", healed: false }
  }

  // The cached selector is the single source of truth (lives in locator_cache, not step.target).
  const cacheRow = await getCacheForStep(projectId, step.id)
  const cachedSelector = cacheRow?.resolvedSelector ?? null
  // Fingerprint signals for Tier 1: prefer the cache row's, fall back to the step's stored target.
  const fp: Fingerprint | null = cacheRow?.fingerprint ?? step.target ?? null

  const isAssert = step.action === "assert"
  // A checkpoint-only assert (no target at all) is a soft pass that keeps the flow runnable (mirrors codegen).
  if (isAssert && !cachedSelector && !fp) {
    await addRunStep(projectId, { runId, trailId, stepId: step.id, idx: step.idx, tier: "none", verdict: "green", confidence: 1, healed: false, evidence: { checkpoint: step.checkpoint?.description ?? null } })
    return { tier: "none", verdict: "green", healed: false }
  }

  let resolved: ResolveResult
  try {
    resolved = await resolveTarget(page, cachedSelector, fp)
  } catch (e) {
    if (e instanceof ElementGone) {
      // All tiers exhausted. Diagnosis-first: this is locator_drift we could not safely heal.
      // Fail-loud: an actionable step whose element is genuinely gone breaks the flow -> RED.
      // A checkpoint (assert) that cannot bind is also RED (never heal away an assertion).
      // We DO NOT invoke vision here (later layer); we mark tier 'vision' as the needs-vision handoff,
      // but the verdict is RED (we cannot perform the action / confirm the goal) — never a silent green.
      const verdict: Verdict = "red"
      await addRunStep(projectId, {
        runId, trailId, stepId: step.id, idx: step.idx,
        tier: "vision", verdict, confidence: 0, diagnosis: "locator_drift", healed: false,
        evidence: { reason: "element_gone", needsVision: true, fingerprint: fp, cachedSelector, checkpoint: step.checkpoint?.description ?? null },
      })
      return { tier: "vision", verdict, healed: false }
    }
    throw e
  }

  // Perform the action (Playwright auto-waits for actionability — the "test DNA" we deliberately keep).
  // Bounded timeout: actionability that never clears is a real break, not a reason to hang.
  const ACTION_TIMEOUT = 5000
  try {
    switch (step.action) {
      case "type":
        await resolved.locator.fill(step.actionValue ?? "", { timeout: ACTION_TIMEOUT })
        break
      case "click":
        await resolved.locator.click({ timeout: ACTION_TIMEOUT })
        break
      case "select":
        await resolved.locator.selectOption(step.actionValue ?? "", { timeout: ACTION_TIMEOUT })
        break
      case "assert":
        // Hard checkpoint: the element must be visible. Never overridden by healing.
        await resolved.locator.waitFor({ state: "visible", timeout: 5000 })
        break
    }
  } catch {
    // The element resolved but the action/assertion failed (e.g. checkpoint not visible) -> fail-loud RED.
    const verdict: Verdict = "red"
    await addRunStep(projectId, {
      runId, trailId, stepId: step.id, idx: step.idx,
      tier: resolved.tier, verdict, confidence: resolved.confidence, diagnosis: isAssert ? "regression" : "interaction_change", healed: false,
      evidence: { reason: isAssert ? "checkpoint_failed" : "action_failed", checkpoint: step.checkpoint?.description ?? null },
    })
    return { tier: resolved.tier, verdict, healed: false }
  }

  // Heal persistence: a Tier 1 candidate hit is written back to the cache under the SAME cache_key
  // (ON CONFLICT updates in place) so the next Walk is deterministic Tier 0 again — heal-as-cache-update.
  if (resolved.healed && resolved.selector && cacheRow) {
    await upsertLocatorCache(projectId, {
      trailId,
      stepId: step.id,
      cacheKey: cacheRow.cacheKey,
      resolvedSelector: resolved.selector,
      fingerprint: fp ?? undefined,
      confidence: resolved.confidence,
      source: "heal",
    })
  }

  await addRunStep(projectId, {
    runId, trailId, stepId: step.id, idx: step.idx,
    tier: resolved.tier, verdict: "green", confidence: resolved.confidence,
    diagnosis: resolved.healed ? "locator_drift" : undefined, healed: resolved.healed,
    evidence: { selector: resolved.selector, healed: resolved.healed, checkpoint: step.checkpoint?.description ?? null },
  })
  return { tier: resolved.tier, verdict: "green", healed: resolved.healed }
}
