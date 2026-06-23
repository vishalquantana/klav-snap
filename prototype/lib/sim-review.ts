// lib/sim-review.ts
// Core Sim-review logic for the Live Sim feature: "customers in the room while you build."
// Sims react LIVE to whatever page the admin is currently browsing — on demand and
// continuously (each scroll/nav fires a new call). Distinct from Trails/AutoSim (autonomous).
//
// Key design constraints for continuous mode:
//   1. SESSION DEDUP: each observation gets a stable hash; the client sends seenHashes so
//      the server only returns NEW observations and never repeats itself mid-session.
//   2. COST GUARD: budget gate in server.ts already blocks exhausted projects; per-session
//      throttle here prevents runaway continuous-mode hammering.
//   3. RECURRING-ISSUE MEMORY (KLA-2): deduped reactions carry a RecurrenceMemory so the
//      client knows "this was already filed by Alice 3 days ago."
import type { Client } from "@libsql/client"
import { insertFeedback, bumpFeedbackRecurrence, findFeedbackByIssueKey, listRecentFeedbackForDedup, insertActivity, listTraits, listTraitEvents } from "./db"
import { issueKeyFor, chooseDedup } from "./dedup"
import { classifySimObservation } from "./sim-bug-classify"
import { recurrenceFromEvents, type Trait, type TraitEventRow } from "./provenance"
import { ingestSnapOrSim } from "./expectations-ingest"
import { buildRecurrenceMemory } from "./recurrence-memory"

// Re-export everything from the pure module so callers only need one import path.
export {
  hashObservation, decodeDataUrl, splitUrl, buildSimRunSummary,
  obsIsNearDup, obsPassesMode, parseRegion,
  sessionCallCapped, sessionObsCapped, sessionCallCount, sessionObsCount,
  sessionSeenTexts, sessionBumpCall, sessionBumpObs,
  SESSION_CALL_CEIL, SESSION_OBS_CEIL, NEAR_DUP_THRESHOLD, SESSION_TTL_MS,
  type SimFeedbackMode, type ObsRegion, type SimObservation, type SimReview,
} from "./sim-review-pure"
import { hashObservation, obsIsNearDup, obsPassesMode, parseRegion, sessionCallCapped, sessionObsCapped, sessionObsCount, sessionBumpCall, sessionBumpObs, sessionSeenTexts, SESSION_CALL_CEIL, SESSION_OBS_CEIL } from "./sim-review-pure"
import type { SimFeedbackMode, SimObservation, SimReview } from "./sim-review-pure"

export type SimReactFn = (
  sim: any,
  imageB64: string,
  mediaType: string,
  pageUrl: string,
) => Promise<{ data: any }>

export type ResolveCitationsFn = (
  simId: string | null,
  citedTraitIds: any,
  projectId?: string | null,
  pre?: any,
) => Promise<{
  citedTraitIds: string[]; sourceQuote: string | null; speaker: string | null
  sourceTranscriptId: string | null; sourceDate: number | null
  issueType: string | null; sourceQuoteVerified: boolean | null
  recurrence: any | null
}>

export interface SimRunOptions {
  projectId: string
  urlPath: string | null
  urlHost: string | null
  pageUrl: string
  imageB64: string
  mediaType: string
  targetSims: any[]
  actorEmail: string
  screenshotId: string
  seenKeys: string[]
  // CLIENT-SIDE dedup: exact hashes the client has already displayed this session.
  seenHashes?: Set<string>
  // SESSION TRACKING: an opaque id for the browse session. When provided:
  //   - per-session LLM call ceiling (SESSION_CALL_CEIL) is enforced
  //   - per-session observation ceiling (SESSION_OBS_CEIL) is enforced
  //   - near-duplicate texts from prior calls are filtered (NEAR_DUP_THRESHOLD)
  sessionId?: string
  // FEEDBACK MODE: which observations to surface. Default "all". See SimFeedbackMode.
  mode?: SimFeedbackMode
  // ADHOC / MANUAL TRIGGER: when true, seenHashes and near-dup dedup are skipped.
  // Use for explicit "Deploy all Sims" / boot triggers where the admin expects fresh
  // bubbles even on a page they've seen before. Continuous background watch should
  // keep adhoc=false (default) so repeats are suppressed.
  adhoc?: boolean
  reactFn: SimReactFn
  resolveCitationsFn: ResolveCitationsFn
  autoCopy?: (feedbackId: string, projectId: string, actor: string) => void
  markSeen?: (key: string) => void
  db: Client | null
}

// ── Internal dedup helpers ────────────────────────────────────────────────────

async function findDuplicateFeedback(args: {
  projectId: string; urlPath: string | null; issueType: string | null
  citedTraitIds: string[]; title: string; observation: string
}): Promise<string | null> {
  const issueKey = issueKeyFor({
    projectId: args.projectId, urlPath: args.urlPath ?? "/",
    issueType: args.issueType, citedTraitIds: args.citedTraitIds,
  })
  const exact = await findFeedbackByIssueKey(args.projectId, issueKey)
  const recent = exact ? [] : await listRecentFeedbackForDedup(args.projectId, 50)
  return chooseDedup({ title: args.title, observation: args.observation }, exact, recent)
}

function issueKeyForFeedback(projectId: string, urlPath: string | null, issueType: string | null, citedTraitIds: string[]): string {
  return issueKeyFor({ projectId, urlPath: urlPath ?? "/", issueType, citedTraitIds })
}

// ── Core review loop ──────────────────────────────────────────────────────────

/**
 * Run the Sim review loop for a set of target Sims against one screenshot.
 *
 * SESSION DEDUP: observations whose hash is in opts.seenHashes are dropped from
 * the output (client already showed them this session). Each returned observation
 * carries a `hash` the client appends to its seenHashes set.
 *
 * RECURRING ISSUE MEMORY: deduped observations carry a RecurrenceMemory (KLA-2)
 * so the response shows "this was 3rd occurrence, first filed by Alice (Sim)."
 */
// Maximum number of Sims whose vision/LLM calls run in-flight simultaneously within
// one /api/sim/review request. Keeps N-Sim latency at ~max(one call) instead of
// N × 7 s while bounding concurrent OpenRouter load. Increase only if the model
// provider's rate limits allow it.
export const SIM_REVIEW_CONCURRENCY = 4

// Concurrency-capped async map: runs `fn` over `items` with at most `limit`
// promises in-flight at any time. Preserves input order in the returned array.
async function poolMap<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

// Internal type: the output of Phase 1 (trait loading + vision call) for one Sim.
// null means the Sim was skipped (session ceiling hit or reactFn threw).
type SimPhase1 = {
  sim: any
  simIndex: number
  simWithMemory: any
  citePre: { traits: Trait[]; eventsByTrait: Map<string, TraitEventRow[]> } | undefined
  rawReactions: any[]
} | null

export async function runSimReviews(opts: SimRunOptions): Promise<SimReview[]> {
  const {
    projectId, urlPath, urlHost, pageUrl, imageB64, mediaType,
    targetSims, actorEmail, screenshotId, seenHashes = new Set(),
    sessionId, mode = "all", adhoc = false,
    reactFn, resolveCitationsFn, autoCopy, markSeen, db,
  } = opts

  const out: SimReview[] = []

  // ── Phase 1: trait loading + vision LLM call — run concurrently ───────────
  // Each Sim's DB reads and the ~7 s reactFn call are independent; running them in
  // parallel collapses N-Sim latency from N × 7 s → ~max(7 s).
  // Session call-ceiling checks are synchronous (JS is single-threaded) so they are
  // consistent across concurrent entries. At most SIM_REVIEW_CONCURRENCY extra calls
  // can slip past a saturating ceiling — acceptable for abuse prevention. Error
  // isolation: a thrown reactFn returns null and does not cancel sibling Sims.
  const phase1: SimPhase1[] = await poolMap(targetSims, SIM_REVIEW_CONCURRENCY, async (sim, simIndex) => {
    // ── Per-session LLM call ceiling ─────────────────────────────────────────
    // Guard BEFORE the LLM call so we never spend budget when capped.
    if (sessionId && sessionCallCapped(sessionId)) {
      console.log(`[sim-review] session ${sessionId} call ceiling (${SESSION_CALL_CEIL}) reached — skipping sim ${sim.id}`)
      return null
    }

    // Build regression-gated recurrence memory for this Sim's traits (avoids N+1 per reaction).
    let simWithMemory: any = sim
    let citePre: { traits: Trait[]; eventsByTrait: Map<string, TraitEventRow[]> } | undefined
    try {
      const allSimEvents: TraitEventRow[] = await listTraitEvents(sim.id, { projectId })
      const eventsByTrait = new Map<string, TraitEventRow[]>()
      for (const e of allSimEvents) {
        const arr = eventsByTrait.get(e.traitId) ?? []
        arr.push(e)
        eventsByTrait.set(e.traitId, arr)
      }
      citePre = { traits: await listTraits(sim.id, { projectId }), eventsByTrait }
      const insights = Array.isArray(sim.insights) ? sim.insights : []
      const insightsWithMemory = insights.map((ins: any) => {
        const traitId = ins.traitId
        if (!traitId) return ins
        const evts = eventsByTrait.get(traitId) ?? []
        const rec = recurrenceFromEvents(evts)
        if (!rec.regressed) return ins  // no disappointment for mere recurrence
        return {
          ...ins,
          recurrenceMemory: {
            regressed: true, firstRaised: rec.firstRaised, lastRaised: rec.lastRaised,
            priorResolvedAt: rec.priorResolvedAt, timesRaised: rec.timesRaised,
          },
        }
      })
      simWithMemory = { ...sim, insights: insightsWithMemory }

      // ── Description fallback for zero-trait Sims ─────────────────────────
      // When a Sim has no extracted traits yet (new Sim, no transcripts processed),
      // the prompt has nothing to "ground reactions in". We synthesize a minimal
      // persona-level insight from the Sim's summary/role so the LLM has enough
      // context to react in-character off the screenshot alone.
      if (!insightsWithMemory.length && (sim.summary || sim.role)) {
        const descText = [sim.role, sim.summary].filter(Boolean).join(". ")
        simWithMemory = {
          ...simWithMemory,
          insights: [{
            traitId: "_persona_description",
            kind: "description",
            text: descText.slice(0, 300),
            strength: 0.5,
          }],
        }
      }
    } catch { /* non-fatal — fall back to plain sim */ }

    // LLM call: get this Sim's reactions to the current page.
    let rawReactions: any[] = []
    try {
      const { data } = await reactFn(simWithMemory, imageB64, mediaType, urlPath || pageUrl)
      rawReactions = Array.isArray(data?.reactions) ? data.reactions : []
    } catch (e: any) {
      console.error(`sim-review reactFn [${sim.id}] (non-fatal):`, e?.message || e)
      return null  // error isolation: skip this Sim without cancelling siblings
    }
    // Count this LLM call toward the session ceiling regardless of how many observations survive.
    if (sessionId) sessionBumpCall(sessionId)

    return { sim, simIndex, simWithMemory, citePre, rawReactions }
  })

  // ── Phase 2: reaction processing — serial for consistent session state ─────
  // Near-dup matching, citation resolution, DB writes, and the session observation
  // ceiling all mutate shared session state; keeping this serial ensures each Sim
  // sees the accumulated seen-texts from its predecessors and the ceiling is respected.
  for (const p1 of phase1) {
    if (!p1) continue
    const { sim, simIndex, citePre, rawReactions } = p1
    const i = simIndex

    const observations: SimObservation[] = []
    // Fetch server-side seen texts once per Sim (for near-dup matching across consecutive screens).
    // Near-dup is also skipped for adhoc/manual triggers so fresh bubbles always render.
    const serverSeenTexts = (!adhoc && sessionId) ? sessionSeenTexts(sessionId) : []

    for (const r of rawReactions) {
      const obsText = String(r?.observation ?? "").trim()
      if (!obsText) continue

      const hash = hashObservation(obsText)

      // 1. CLIENT-SIDE exact dedup: skip when hash already seen THIS session.
      //    BYPASSED for adhoc/manual deploys — the admin expects fresh bubbles
      //    even on a page they've browsed before.
      if (!adhoc && seenHashes.has(hash)) continue

      // 2. SERVER-SIDE near-dup: catches rephrased versions of the same finding across
      //    consecutive screens. Also bypassed for adhoc so all current observations surface.
      if (!adhoc && serverSeenTexts.length > 0 && obsIsNearDup(obsText, serverSeenTexts)) continue

      const citation = await resolveCitationsFn(sim.id, r?.citedTraitIds, projectId, citePre)
      let bug = r?.suggestedBug

      // Heuristic classifier: elevate broken/stuck/blocked observations to bug candidates.
      if (!bug) {
        const verdict = classifySimObservation(obsText, r?.sentiment)
        if (verdict.flagged) {
          bug = { title: obsText.slice(0, 90) || "Sim-flagged issue", body: obsText, severity: verdict.severity, simFlagged: true, signals: verdict.signals }
        }
      }

      // Feedback dedup + persistence.
      let feedbackId: string | undefined
      let deduped = false
      let recurrenceMem: any = null

      if (bug) {
        const dedupedInto = await findDuplicateFeedback({
          projectId, urlPath, issueType: citation.issueType,
          citedTraitIds: citation.citedTraitIds,
          title: String(bug?.title || ""), observation: obsText,
        })
        if (dedupedInto) {
          await bumpFeedbackRecurrence(dedupedInto, Date.now())
          feedbackId = dedupedInto
          deduped = true
          if (db) {
            try { recurrenceMem = await buildRecurrenceMemory(db, dedupedInto, projectId) }
            catch (e: any) { console.warn("[sim-review] recurrence-memory skipped:", e?.message || e) }
          }
        } else {
          feedbackId = await insertFeedback({
            projectId, simId: sim.id, actorEmail, urlHost, urlPath,
            observation: obsText || null, sentiment: r?.sentiment ?? null,
            severity: bug?.severity ?? null, screenshotId, suggestedBug: bug,
            citedTraitIds: citation.citedTraitIds.length ? citation.citedTraitIds : null,
            sourceQuote: citation.sourceQuote, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate,
            issueKey: issueKeyForFeedback(projectId, urlPath, citation.issueType, citation.citedTraitIds),
          })
          if (feedbackId) autoCopy?.(feedbackId, projectId, actorEmail)
          // Feed into expectations spine.
          if (feedbackId && db) {
            await ingestSnapOrSim(db, {
              projectId, feedbackId, isSnap: false,
              title: (bug?.title ?? obsText).slice(0, 200),
              dedupKey: issueKeyForFeedback(projectId, urlPath, citation.issueType, citation.citedTraitIds),
              urlPath: urlPath ?? null, issueType: citation.issueType ?? null,
              citedTraitIds: Array.isArray(citation.citedTraitIds) ? citation.citedTraitIds.map(String) : [],
            })
          }
        }
      }

      const assembled: SimObservation = {
        observation: obsText,
        sentiment: r?.sentiment ?? null,
        severity: bug?.severity ?? null,
        quote: citation.sourceQuote,
        hash,
        // region: parse model output; accept both "region" (new) and "box" (legacy field name).
        region: parseRegion(r?.region ?? r?.box),
        suggestedBug: bug ?? null,
        feedbackId,
        deduped,
        recurrence: recurrenceMem,
      }

      // FEEDBACK MODE filter: applied after full assembly so sentiment + suggestedBug are set.
      if (!obsPassesMode(assembled, mode)) continue

      observations.push(assembled)
    }

    // ── Per-session observation ceiling ──────────────────────────────────────
    // Cap observations surfaced this session to avoid flooding the UI and
    // burning excessive budget over a long browse session. Trim to fit under the ceiling.
    let finalObservations = observations
    if (sessionId && observations.length > 0) {
      const remaining = SESSION_OBS_CEIL - sessionObsCount(sessionId)
      if (remaining <= 0) {
        finalObservations = []  // ceiling already hit
      } else if (observations.length > remaining) {
        finalObservations = observations.slice(0, remaining)  // trim to fit
      }
      if (finalObservations.length > 0) {
        sessionBumpObs(sessionId, finalObservations.map(o => o.observation))
      }
    }

    // Activity spine — R6 observability; only log when we actually produced observations.
    if (rawReactions.length > 0) {
      await insertActivity({
        projectId, type: "review_run", actorEmail, simId: sim.id,
        urlHost, urlPath, screenshotId,
        meta: { reactions: rawReactions.length, new: finalObservations.length },
      })
    }
    markSeen?.(opts.seenKeys[i])

    // Only include the Sim in output if it has at least one new observation.
    if (finalObservations.length > 0) {
      out.push({ simId: sim.id, simName: sim.name, initials: sim.initials ?? null, accent: sim.accent ?? null, observations: finalObservations })
    }
  }

  return out
}
