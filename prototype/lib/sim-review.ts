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

// Re-export pure helpers so callers only need one import path.
export { hashObservation, decodeDataUrl, splitUrl, buildSimRunSummary, type SimObservation, type SimReview } from "./sim-review-pure"
import { hashObservation } from "./sim-review-pure"
import type { SimObservation, SimReview } from "./sim-review-pure"

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
  seenHashes?: Set<string>
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
export async function runSimReviews(opts: SimRunOptions): Promise<SimReview[]> {
  const {
    projectId, urlPath, urlHost, pageUrl, imageB64, mediaType,
    targetSims, actorEmail, screenshotId, seenHashes = new Set(),
    reactFn, resolveCitationsFn, autoCopy, markSeen, db,
  } = opts

  const out: SimReview[] = []

  for (let i = 0; i < targetSims.length; i++) {
    const sim = targetSims[i]

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
    } catch { /* non-fatal — fall back to plain sim */ }

    // LLM call: get this Sim's reactions to the current page.
    let rawReactions: any[] = []
    try {
      const { data } = await reactFn(simWithMemory, imageB64, mediaType, urlPath || pageUrl)
      rawReactions = Array.isArray(data?.reactions) ? data.reactions : []
    } catch (e: any) {
      console.error(`sim-review reactFn [${sim.id}] (non-fatal):`, e?.message || e)
      continue
    }

    const observations: SimObservation[] = []

    for (const r of rawReactions) {
      const obsText = String(r?.observation ?? "").trim()
      if (!obsText) continue

      const hash = hashObservation(obsText)

      // SESSION DEDUP: if the client has already shown this observation this session, skip it.
      if (seenHashes.has(hash)) continue

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

      observations.push({
        text: obsText,
        sentiment: r?.sentiment ?? null,
        quote: citation.sourceQuote,
        hash,
        suggestedBug: bug ?? null,
        feedbackId,
        deduped,
        recurrence: recurrenceMem,
      })
    }

    // Activity spine — R6 observability; only log when we actually produced observations.
    if (rawReactions.length > 0) {
      await insertActivity({
        projectId, type: "review_run", actorEmail, simId: sim.id,
        urlHost, urlPath, screenshotId, meta: { observations: rawReactions.length, new: observations.length },
      })
    }
    markSeen?.(opts.seenKeys[i])

    // Only include the Sim in output if it has at least one new observation.
    if (observations.length > 0) {
      out.push({ simId: sim.id, simName: sim.name, initials: sim.initials ?? null, accent: sim.accent ?? null, observations })
    }
  }

  return out
}
