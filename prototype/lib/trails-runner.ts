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
  startWalk, addRunStep, finishWalk, recordFinding,
} from "./trails"
import { stepCacheKey } from "./trails-crystallize"
import { decideFromVision, type VisionResolver, type VisionInput } from "./trails-vision"

export interface WalkOptions {
  /** Concrete URL to walk against (overrides the trail's baseUrl). file:// or http(s)://. */
  fixtureUrl: string
  headless?: boolean
  /**
   * Tier-2 vision resolver (Layer D). INJECTABLE: a mock in tests, the real OpenRouter adapter in
   * prod. When ABSENT the runner behaves exactly like Layer C (RED + needsVision on exhaustion) —
   * backward-compatible. When present, an exhausted step hands off to vision (heal/regression/low-conf).
   */
  vision?: VisionResolver
  /** Confidence gate for a vision heal (spec §6.3). Default 0.9. */
  confidenceGate?: number
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
  /** Count of Tier-2 vision model calls (Layer D). 0 on the zero-LLM hot path / no resolver. */
  llmCalls: number
  steps: WalkStepSummary[]
  healedCount: number
}

const CACHE_CONFIDENCE = 1.0

// Tier-1 candidate confidence varies by signal strength so Layer D's future >=0.9 gate has real
// signal (not a flat tautology). With fix #1 ALL heals are AMBER regardless of confidence; this is
// purely to differentiate signal quality for the later confidence gate.
type CandidateSignal = "role+name" | "text" | "testid" | "domPath"
const SIGNAL_CONFIDENCE: Record<CandidateSignal, number> = {
  "role+name": 0.95, // role + accessible-name: strongest semantic anchor
  testid: 0.92,
  text: 0.88,
  domPath: 0.8, // structural: weakest, most brittle
}

// Escape a string for safe embedding inside a double-quoted CSS attribute selector value.
// Backslash first, then double-quote (e.g. data-testid value containing a `"`).
function escAttr(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

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
  /** Which Tier-1 signal matched (only set on a heal). */
  candidateSignal?: CandidateSignal
}

// Build a stable CSS selector to persist for a healed element so the NEXT walk is Tier 0 again.
// Prefer id, then data-testid, then the role+name candidate re-expressed structurally; never persist
// a brittle nth-child if a stable handle exists.
async function persistableSelector(page: Page, loc: Locator): Promise<string | null> {
  try {
    return await loc.evaluate((el: Element) => {
      // esc must be inlined: this runs in the page context, not the runner module scope.
      const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
      if (el.id) return "#" + CSS.escape(el.id)
      const tid = el.getAttribute("data-testid")
      if (tid) return `[data-testid="${esc(tid)}"]`
      const al = el.getAttribute("aria-label")
      if (al) return `${el.tagName.toLowerCase()}[aria-label="${esc(al)}"]`
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
        return { tier: "candidate", selector: await persistableSelector(page, loc), locator: loc, healed: true, confidence: SIGNAL_CONFIDENCE["role+name"], candidateSignal: "role+name" }
      }
    }
    // 2. visible text — but only if the resolved element's role matches the target's (intent
    //    verification): a removed <button> must NOT heal onto a same-text <h1>.
    if (fp.text) {
      const loc = page.getByText(fp.text, { exact: true })
      if ((await uniquelyResolves(loc)) && (await roleConsistent(loc, fp.role))) {
        return { tier: "candidate", selector: await persistableSelector(page, loc), locator: loc, healed: true, confidence: SIGNAL_CONFIDENCE.text, candidateSignal: "text" }
      }
    }
    // 3. data-testid (escape embedded backslash/double-quote in the value)
    if (fp.testId) {
      const tidSel = `[data-testid="${escAttr(fp.testId)}"]`
      const loc = page.locator(tidSel)
      if ((await uniquelyResolves(loc)) && (await roleConsistent(loc, fp.role))) {
        return { tier: "candidate", selector: tidSel, locator: loc, healed: true, confidence: SIGNAL_CONFIDENCE.testid, candidateSignal: "testid" }
      }
    }
    // 4. structural domPath
    if (fp.domPath) {
      const loc = page.locator(fp.domPath)
      if ((await uniquelyResolves(loc)) && (await roleConsistent(loc, fp.role))) {
        return { tier: "candidate", selector: fp.domPath, locator: loc, healed: true, confidence: SIGNAL_CONFIDENCE.domPath, candidateSignal: "domPath" }
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
  let llmCalls = 0

  try {
    const page: Page = await browser.newPage()
    await page.goto(opts.fixtureUrl)

    for (const step of steps) {
      const { tier, verdict, healed, llmCalls: stepLlm } = await runOneStep(projectId, runId, trail.id, page, step, opts)
      stepSummaries.push({ stepId: step.id, idx: step.idx, tier, verdict, healed })
      if (healed) healedCount++
      llmCalls += stepLlm
      walkVerdict = worse(walkVerdict, verdict)
    }

    await finishWalk(projectId, runId, {
      status: walkVerdict,
      llmCalls,
      summary: { healedCount, stepCount: steps.length },
    })
    return { runId, verdict: walkVerdict, llmCalls, steps: stepSummaries, healedCount }
  } catch (e) {
    // Anything thrown (e.g. an unreachable fixtureUrl) must STILL finalize the run — never leave it
    // 'running'. The Walk is RED and the error is recorded in the summary for the trace viewer.
    await finishWalk(projectId, runId, {
      status: "red",
      llmCalls,
      summary: { healedCount, stepCount: steps.length, error: String(e) },
    })
    return { runId, verdict: "red", llmCalls, steps: stepSummaries, healedCount }
  } finally {
    await browser.close()
  }
}

interface OneStepResult { tier: Tier; verdict: Verdict; healed: boolean; llmCalls: number }

// Execute a single step. Records exactly one run_step. Never silent-greens a break.
async function runOneStep(
  projectId: string,
  runId: string,
  trailId: string,
  page: Page,
  step: TrailStep,
  opts: WalkOptions,
): Promise<OneStepResult> {
  const fixtureUrl = opts.fixtureUrl
  // navigate / wait have no element to resolve.
  if (step.action === "navigate") {
    // In Layer C the whole walk is scoped to fixtureUrl; re-navigate to it (origin already loaded).
    await page.goto(step.actionValue && /^https?:|^file:/.test(step.actionValue) ? step.actionValue : fixtureUrl)
    await addRunStep(projectId, { runId, trailId, stepId: step.id, idx: step.idx, tier: "none", verdict: "green", confidence: 1, healed: false, evidence: { action: "navigate" } })
    return { tier: "none", verdict: "green", healed: false, llmCalls: 0 }
  }
  if (step.action === "wait") {
    // Condition-based wait, never a blind sleep (spec §8).
    await page.waitForLoadState("networkidle").catch(() => {})
    await addRunStep(projectId, { runId, trailId, stepId: step.id, idx: step.idx, tier: "none", verdict: "green", confidence: 1, healed: false, evidence: { action: "wait" } })
    return { tier: "none", verdict: "green", healed: false, llmCalls: 0 }
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
    return { tier: "none", verdict: "green", healed: false, llmCalls: 0 }
  }

  let resolved: ResolveResult
  try {
    resolved = await resolveTarget(page, cachedSelector, fp)
  } catch (e) {
    if (e instanceof ElementGone) {
      // All deterministic tiers (0/1) are exhausted. Diagnosis-first: this is locator_drift we could
      // not safely heal without a model.
      //
      // Layer D Tier-2: if an injectable vision resolver is provided, hand off to it. The resolver
      // sees a screenshot + DOM snapshot + the step intent/target/candidate-selectors and decides
      // heal / regression / low-confidence. decideFromVision applies the spec §6 trust gates:
      //   - heal           → AMBER (never green, §6.3) + role-consistency re-check (§6.2) + act
      //                       + persist healed selector + reviewable evidence diff (§6.4).
      //   - regression     → RED + grounded, deduped finding (kind 'regression', auto-file-eligible).
      //   - amber_low_conf → AMBER + queue-only finding (kind 'amber_heal'); never act on an
      //                       unconfirmed target (§6.3).
      // §6.5 (healing never overrides a checkpoint): if the gone step is an ASSERT, runVisionTier2
      // short-circuits at its TOP to a hard RED 'regression' BEFORE consulting the model — an assert
      // whose target could not be deterministically resolved is a checkpoint failure, never a heal
      // and never an amber_heal, regardless of what vision would classify.
      if (opts.vision) {
        return await runVisionTier2(projectId, runId, trailId, page, step, opts, fp, cachedSelector, isAssert)
      }
      // No resolver → unchanged Layer C behavior: RED + needs-vision handoff marker (never green).
      const verdict: Verdict = "red"
      await addRunStep(projectId, {
        runId, trailId, stepId: step.id, idx: step.idx,
        tier: "vision", verdict, confidence: 0, diagnosis: "locator_drift", healed: false,
        evidence: { reason: "element_gone", needsVision: true, fingerprint: fp, cachedSelector, checkpoint: step.checkpoint?.description ?? null },
      })
      return { tier: "vision", verdict, healed: false, llmCalls: 0 }
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
    return { tier: resolved.tier, verdict, healed: false, llmCalls: 0 }
  }

  // Capture the pre-heal selector BEFORE the upsert overwrites it (heal-as-reviewable-diff, §6.4).
  const fromSelector = cachedSelector ?? cacheRow?.resolvedSelector ?? null

  // Heal persistence: a Tier 1 candidate hit is written back to the cache (per (project_id, step_id),
  // ON CONFLICT updates in place) so the next Walk is deterministic Tier 0 again — heal-as-cache-update.
  // Persist UNCONDITIONALLY when healed && selector: if no cache row existed, upsert a fresh one so a
  // step never re-heals forever (fix #3). The cache_key is recomputed via the crystallize convention.
  if (resolved.healed && resolved.selector) {
    const cKey = cacheRow?.cacheKey ?? (await stepCacheKey(projectId, trailId, step, resolved.selector))
    await upsertLocatorCache(projectId, {
      trailId,
      stepId: step.id,
      cacheKey: cKey,
      resolvedSelector: resolved.selector,
      fingerprint: fp ?? undefined,
      confidence: resolved.confidence,
      source: "heal",
    })
  }

  // spec §6.3: a healed-but-unconfirmed step is AMBER, never GREEN. The action still executed; the
  // Walk rolls up to AMBER (worst-of). A non-healed cache/Tier-0 hit stays GREEN.
  const verdict: Verdict = resolved.healed ? "amber" : "green"

  // spec §6.4: persist the reviewable diff into the run_step evidence (recoverable from/to selectors).
  const evidence: Record<string, unknown> = resolved.healed
    ? {
        healed: true,
        fromSelector,
        toSelector: resolved.selector,
        tier: resolved.tier,
        confidence: resolved.confidence,
        candidateSignal: resolved.candidateSignal,
        checkpoint: step.checkpoint?.description ?? null,
      }
    : { selector: resolved.selector, healed: false, checkpoint: step.checkpoint?.description ?? null }

  await addRunStep(projectId, {
    runId, trailId, stepId: step.id, idx: step.idx,
    tier: resolved.tier, verdict, confidence: resolved.confidence,
    diagnosis: resolved.healed ? "locator_drift" : undefined, healed: resolved.healed,
    evidence,
  })
  return { tier: resolved.tier, verdict, healed: resolved.healed, llmCalls: 0 }
}

// ── Layer D Tier-2: vision-LLM re-resolution at the Tier-0/1-exhausted point ──
// Always counts as exactly one model call (llmCalls: 1). Reuses the existing roleConsistent() gate,
// upsertLocatorCache, recordFinding, and addRunStep — no duplication. NEVER green: a heal is AMBER.
async function runVisionTier2(
  projectId: string,
  runId: string,
  trailId: string,
  page: Page,
  step: TrailStep,
  opts: WalkOptions,
  fp: Fingerprint | null,
  cachedSelector: string | null,
  isAssert: boolean,
): Promise<OneStepResult> {
  const gate = opts.confidenceGate ?? 0.9

  // §6.5 — HARD checkpoint guardrail, BEFORE any model I/O. Reaching the vision tier means Tier-0/1
  // exhausted the deterministic resolvers: the assert's target is GONE. Healing never overrides a
  // checkpoint, so this is a regression (RED), auto-file-eligible — NEVER a heal, NEVER amber_heal,
  // regardless of what the model would classify (moved / low-confidence / restyled). No model call.
  if (isAssert) {
    const title = `Checkpoint target gone: ${fp?.accessibleName ?? fp?.text ?? step.checkpoint?.description ?? step.action}`
    await recordFinding(projectId, {
      runId, trailId, stepId: step.id, kind: "regression", title,
      evidence: { reason: "checkpoint_gone", target: fp, pageUrl: opts.fixtureUrl, checkpoint: step.checkpoint?.description ?? null },
      groundQuote: title, confidence: 1,
      dedupKey: `${trailId}:${step.id}:checkpoint-gone`,
    })
    await addRunStep(projectId, {
      runId, trailId, stepId: step.id, idx: step.idx,
      tier: "vision", verdict: "red", confidence: 1, diagnosis: "regression", healed: false,
      evidence: { reason: "checkpoint_gone", target: fp, cachedSelector, needsVision: false, checkpoint: step.checkpoint?.description ?? null },
    })
    return { tier: "vision", verdict: "red", healed: false, llmCalls: 0 }
  }

  // Capture the perceptual + structural context the resolver needs.
  const shot = (await page.screenshot()).toString("base64")
  const dom = await page.content()
  const candidateSelectors: string[] = []
  if (cachedSelector) candidateSelectors.push(cachedSelector)
  if (fp?.testId) candidateSelectors.push(`[data-testid="${escAttr(fp.testId)}"]`)
  if (fp?.domPath) candidateSelectors.push(fp.domPath)

  const visionInput: VisionInput = {
    screenshotB64: shot,
    mediaType: "image/png",
    domSnapshot: dom,
    pageUrl: opts.fixtureUrl,
    intent: step.checkpoint?.description ?? step.action,
    action: step.action,
    target: fp ?? {},
    candidateSelectors,
  }
  const result = await opts.vision!(visionInput, { projectId })
  const decision = decideFromVision(result, gate)

  const domExcerpt = dom.slice(0, 2000)

  // ── regression: do NOT act → RED + grounded, deduped finding (auto-file-eligible kind) ──
  if (decision.outcome === "regression") {
    const title = `Target gone: ${fp?.accessibleName ?? fp?.text ?? step.action}`
    await recordFinding(projectId, {
      runId, trailId, stepId: step.id, kind: "regression", title,
      evidence: { rationale: decision.rationale, target: fp, pageUrl: opts.fixtureUrl, domExcerpt },
      groundQuote: decision.rationale, confidence: decision.confidence,
      dedupKey: `${trailId}:${step.id}:gone`,
    })
    await addRunStep(projectId, {
      runId, trailId, stepId: step.id, idx: step.idx,
      tier: "vision", verdict: "red", confidence: decision.confidence, diagnosis: "regression", healed: false,
      evidence: { reason: "vision_regression", classification: result.classification, rationale: decision.rationale, target: fp, needsVision: false, checkpoint: step.checkpoint?.description ?? null },
    })
    return { tier: "vision", verdict: "red", healed: false, llmCalls: 1 }
  }

  // ── heal: confirm intent (role consistency, §6.2), act, AMBER, persist + reviewable diff ──
  if (decision.outcome === "heal" && decision.selector) {
    const loc = page.locator(decision.selector)
    const ACTION_TIMEOUT = 5000
    const ok =
      (await uniquelyResolves(loc)) &&
      (await roleConsistent(loc, fp?.role)) &&
      // An assert is never vision-healed green (§6.5): only actionable steps heal.
      !isAssert
    if (ok) {
      try {
        switch (step.action) {
          case "type": await loc.fill(step.actionValue ?? "", { timeout: ACTION_TIMEOUT }); break
          case "click": await loc.click({ timeout: ACTION_TIMEOUT }); break
          case "select": await loc.selectOption(step.actionValue ?? "", { timeout: ACTION_TIMEOUT }); break
        }
        // Persist the healed selector so the NEXT walk is Tier 0 again (heal-as-cache-update, §6.4).
        const cacheRow = await getCacheForStep(projectId, step.id)
        const cKey = cacheRow?.cacheKey ?? (await stepCacheKey(projectId, trailId, step, decision.selector))
        await upsertLocatorCache(projectId, {
          trailId, stepId: step.id, cacheKey: cKey, resolvedSelector: decision.selector,
          fingerprint: fp ?? undefined, confidence: decision.confidence, source: "heal",
        })
        await addRunStep(projectId, {
          runId, trailId, stepId: step.id, idx: step.idx,
          tier: "vision", verdict: "amber", confidence: decision.confidence, diagnosis: "locator_drift", healed: true,
          evidence: {
            healed: true, fromSelector: cachedSelector, toSelector: decision.selector,
            tier: "vision", confidence: decision.confidence, candidateSignal: "vision",
            rationale: decision.rationale, classification: result.classification,
            checkpoint: step.checkpoint?.description ?? null,
          },
        })
        return { tier: "vision", verdict: "amber", healed: true, llmCalls: 1 }
      } catch {
        // The vision selector resolved + was role-consistent but the action itself failed — fall
        // through to the low-confidence/unconfirmed handling below (never a silent green).
      }
    }
    // Resolver claimed a heal but we could NOT confirm it (no unique match / wrong role / action
    // failed). Treat as unconfirmed → AMBER + queue-only finding; do NOT act, do NOT persist.
    return await fileAmberHeal(projectId, runId, trailId, step, opts, fp, decision.rationale, decision.confidence, result.classification)
  }

  // ── amber_low_conf: never act on an unconfirmed target → AMBER + queue-only finding ──
  return await fileAmberHeal(projectId, runId, trailId, step, opts, fp, decision.rationale, decision.confidence, result.classification)
}

// AMBER + queue-only (kind 'amber_heal') finding for a healed-but-unconfirmed step (§6.3 / Layer E
// auto-file convention). The element is NOT acted on and the cache is NOT mutated.
async function fileAmberHeal(
  projectId: string, runId: string, trailId: string, step: TrailStep, opts: WalkOptions,
  fp: Fingerprint | null, rationale: string, confidence: number, classification: string,
): Promise<OneStepResult> {
  await recordFinding(projectId, {
    runId, trailId, stepId: step.id, kind: "amber_heal",
    title: `Low-confidence heal: ${fp?.accessibleName ?? fp?.text ?? step.action}`,
    evidence: { rationale, target: fp, pageUrl: opts.fixtureUrl, classification },
    groundQuote: rationale, confidence, dedupKey: `${trailId}:${step.id}:lowconf`,
  })
  await addRunStep(projectId, {
    runId, trailId, stepId: step.id, idx: step.idx,
    tier: "vision", verdict: "amber", confidence, diagnosis: "locator_drift", healed: false,
    evidence: { reason: "vision_low_confidence", classification, rationale, needsVision: false, checkpoint: step.checkpoint?.description ?? null },
  })
  return { tier: "vision", verdict: "amber", healed: false, llmCalls: 1 }
}
