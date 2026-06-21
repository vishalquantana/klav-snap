// P3a provenance core — PURE, LLM-free, DB-free reconcile logic.
// `applyReconcileOps` takes a Sim's current ACTIVE trait set + a list of structured ops
// (the shape an LLM reconcile call would emit, but this function never calls an LLM) and
// returns the trait writes, the append-only trait_event rows, and the rebuilt active-trait set.
// The route layer (P3a step 2/3) persists these via the db helpers; the test layer asserts them.

export type TraitKind = "pain" | "want" | "love"
export type TraitStatus = "active" | "superseded" | "contradicted" | "archived"
export type ReconcileOpName = "add" | "reinforce" | "refine" | "contradict" | "supersede" | "reopen"
export type TraitEventOp = "create" | "reinforce" | "refine" | "contradict" | "supersede" | "reopen" | "manual_create" | "edit" | "manual_archive"

// A trait as it lives in `sim_traits`.
export type Trait = {
  id: string
  simId: string
  projectId: string
  kind: TraitKind
  text: string
  status: TraitStatus
  strength: number
  srcTranscriptId: string
  srcQuote: string
  srcQuoteOffset: number | null
  srcSpeaker: string | null
  srcVerified?: boolean | null
  createdAt: number
  updatedAt: number
  area?: string | null
  issueType?: string | null
  severity?: string | null
}

// The structured op an LLM reconcile returns. `traitId` targets an existing trait for
// reinforce/refine/contradict/supersede/reopen; `add` creates a new trait (traitId ignored).
export type ReconcileOp = {
  op: ReconcileOpName
  kind: TraitKind
  text: string
  quote: string
  quoteOffset?: number | null
  speaker?: string | null
  traitId?: string
  reason?: string
  area?: string | null
  issueType?: string | null
  severity?: string | null
}

// Context the caller supplies: the transcript this reconcile pass is grounded in + id/clock fns.
export type ReconcileCtx = {
  simId: string
  projectId: string
  transcriptId: string
  sourceDate: number
  rawText?: string | null
  now?: number
  newId?: () => string // injectable for deterministic tests
}

// A pending write to `sim_traits`. `mode='insert'` is a brand-new active trait; `mode='update'`
// updates an existing trait's mutable columns (text/status/strength/provenance/updatedAt).
export type TraitWrite = {
  mode: "insert" | "update"
  trait: Trait
}

// A row destined for the append-only `trait_events` audit table.
export type TraitEventRow = {
  traitId: string
  simId: string
  transcriptId: string
  op: TraitEventOp
  beforeText: string | null
  afterText: string | null
  quote: string
  quoteOffset: number | null
  verified?: boolean | null
  speaker: string | null
  sourceDate: number
  reason: string | null
  createdAt: number
  area?: string | null
  issueType?: string | null
  severity?: string | null
  actor?: string | null
}

export type ReconcileResult = {
  traitWrites: TraitWrite[]
  traitEvents: TraitEventRow[]
  activeTraits: Trait[] // rebuilt set: ACTIVE traits only, after applying every op
}

let _counter = 0
function defaultNewId(): string {
  // deterministic-ish fallback; tests inject newId for stable assertions.
  _counter += 1
  return "trait_" + Date.now().toString(36) + "_" + _counter
}

// ── Quote grounding: verify/anchor an LLM-returned quote against the transcript text. ──
// Pure. Returns the real substring + char offset when found; flags (verified:false) when not.
const GROUND_DICE_THRESHOLD = 0.85

// 1:1 char substitutions (length-preserving so offsets stay valid against the ORIGINAL raw).
function subsChars(s: string): string {
  // 1:1 length-preserving substitutions so offsets stay valid against the ORIGINAL raw.
  return s
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes \u2018 \u2019 \u2192 '
    .replace(/[\u201c\u201d]/g, '"')   // curly double quotes \u201c \u201d \u2192 "
    .replace(/[\u2013\u2014]/g, "-")   // en/em dash \u2013 \u2014 \u2192 -
    .replace(/\u00a0/g, " ")           // non-breaking space \u00a0 \u2192 regular space
}
function normTokens(s: string): Set<string> {
  return new Set(subsChars(s).toLowerCase().replace(/\s+/g, " ").trim().split(" ").filter(Boolean))
}
function tokenDice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return (2 * inter) / (a.size + b.size)
}
// Line spans with their start offset in raw (skips blank lines).
function lineSpans(raw: string): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = []
  let i = 0
  for (const line of raw.split("\n")) {
    const start = i
    const end = i + line.length
    if (line.trim()) out.push({ start, end, text: line })
    i = end + 1 // account for the consumed "\n"
  }
  return out
}

export function groundQuote(
  rawText: string | null,
  quote: string,
): { quote: string; offset: number | null; verified: boolean | null } {
  const q = (quote ?? "").trim()
  if (rawText == null) return { quote: q, offset: null, verified: null }
  if (!q) return { quote: q, offset: null, verified: false }

  // 1) exact substring
  const exact = rawText.indexOf(q)
  if (exact >= 0) return { quote: q, offset: exact, verified: true }

  // 2) length-preserving char-normalized substring (curly quotes, dashes, nbsp)
  const subOffset = subsChars(rawText).indexOf(subsChars(q))
  if (subOffset >= 0) return { quote: rawText.slice(subOffset, subOffset + q.length), offset: subOffset, verified: true }

  // 3) fuzzy snap to the best-scoring line
  const qTokens = normTokens(q)
  if (qTokens.size === 0) return { quote: q, offset: null, verified: false }
  let best = { score: 0, start: -1, end: -1 }
  for (const sp of lineSpans(rawText)) {
    const score = tokenDice(qTokens, normTokens(sp.text))
    if (score > best.score) best = { score, start: sp.start, end: sp.end }
  }
  if (best.score >= GROUND_DICE_THRESHOLD && best.start >= 0) {
    const trimmedLine = rawText.slice(best.start, best.end)
    const leadingWs = trimmedLine.length - trimmedLine.trimStart().length
    return { quote: trimmedLine.trim(), offset: best.start + leadingWs, verified: true }
  }
  return { quote: q, offset: null, verified: false }
}

/**
 * Apply a list of reconcile ops to a Sim's current trait set.
 *
 * Rules:
 *  - 'add'        → new active trait (insert) + 'create' event.
 *  - 'reinforce'  → same trait, strength+1, provenance refreshed to the new quote + 'reinforce' event.
 *  - 'refine'     → same trait, text replaced (before/after captured), strength+1 + 'refine' event.
 *  - 'contradict' → old trait marked 'contradicted' (NOT deleted) + 'contradict' event. Append-only.
 *  - 'supersede'  → old trait marked 'superseded' (NOT deleted), a NEW active trait carries the
 *                   replacement text + a 'supersede' event on the OLD trait referencing the new one.
 *  - The rebuilt active-trait set contains only status==='active' traits after all ops.
 *  - A target traitId that is missing (or already inactive) is treated defensively as an 'add'.
 */
export function applyReconcileOps(
  currentTraits: Trait[],
  ops: ReconcileOp[],
  ctx: ReconcileCtx,
): ReconcileResult {
  const now = ctx.now ?? Date.now()
  const newId = ctx.newId ?? defaultNewId
  const traitWrites: TraitWrite[] = []
  const traitEvents: TraitEventRow[] = []

  // working copy keyed by id; we mutate clones, never the inputs.
  const byId = new Map<string, Trait>()
  for (const t of currentTraits) byId.set(t.id, { ...t })

  const baseEvt = (
    traitId: string,
    op: TraitEventOp,
    beforeText: string | null,
    afterText: string | null,
    o: ReconcileOp,
    reason?: string | null,
  ): TraitEventRow => {
    const g = groundQuote(ctx.rawText ?? null, o.quote)
    return {
    traitId,
    simId: ctx.simId,
    transcriptId: ctx.transcriptId,
    op,
    beforeText,
    afterText,
    quote: g.quote,
    quoteOffset: g.offset,
    verified: g.verified,
    speaker: o.speaker ?? null,
    sourceDate: ctx.sourceDate,
    reason: reason ?? o.reason ?? null,
    createdAt: now,
    area: o.area ?? null,
    issueType: o.issueType ?? null,
    severity: o.severity ?? null,
    }
  }

  const mkTrait = (o: ReconcileOp): Trait => {
    const g = groundQuote(ctx.rawText ?? null, o.quote)
    return {
    id: newId(),
    simId: ctx.simId,
    projectId: ctx.projectId,
    kind: o.kind,
    text: o.text,
    status: "active",
    strength: 1,
    srcTranscriptId: ctx.transcriptId,
    srcQuote: g.quote,
    srcQuoteOffset: g.offset,
    srcVerified: g.verified,
    srcSpeaker: o.speaker ?? null,
    createdAt: now,
    updatedAt: now,
    area: o.area ?? null,
    issueType: o.issueType ?? null,
    severity: o.severity ?? null,
    }
  }

  const addNew = (o: ReconcileOp) => {
    const t = mkTrait(o)
    byId.set(t.id, t)
    traitWrites.push({ mode: "insert", trait: { ...t } })
    traitEvents.push(baseEvt(t.id, "create", null, t.text, o))
  }

  for (const o of ops) {
    const target = o.traitId ? byId.get(o.traitId) : undefined
    const targetActive = target && target.status === "active" ? target : undefined

    switch (o.op) {
      case "add": {
        addNew(o)
        break
      }
      case "reinforce": {
        if (!targetActive) { addNew(o); break }
        const g = groundQuote(ctx.rawText ?? null, o.quote)
        targetActive.strength += 1
        targetActive.srcTranscriptId = ctx.transcriptId
        targetActive.srcQuote = g.quote
        targetActive.srcQuoteOffset = g.offset
        targetActive.srcVerified = g.verified
        targetActive.srcSpeaker = o.speaker ?? null
        targetActive.updatedAt = now
        targetActive.area = o.area ?? null
        targetActive.issueType = o.issueType ?? null
        targetActive.severity = o.severity ?? null
        traitWrites.push({ mode: "update", trait: { ...targetActive } })
        traitEvents.push(baseEvt(targetActive.id, "reinforce", targetActive.text, targetActive.text, o))
        break
      }
      case "refine": {
        if (!targetActive) { addNew(o); break }
        const g = groundQuote(ctx.rawText ?? null, o.quote)
        const before = targetActive.text
        targetActive.text = o.text
        targetActive.strength += 1
        targetActive.srcTranscriptId = ctx.transcriptId
        targetActive.srcQuote = g.quote
        targetActive.srcQuoteOffset = g.offset
        targetActive.srcVerified = g.verified
        targetActive.srcSpeaker = o.speaker ?? null
        targetActive.updatedAt = now
        targetActive.area = o.area ?? null
        targetActive.issueType = o.issueType ?? null
        targetActive.severity = o.severity ?? null
        traitWrites.push({ mode: "update", trait: { ...targetActive } })
        traitEvents.push(baseEvt(targetActive.id, "refine", before, targetActive.text, o))
        break
      }
      case "contradict": {
        if (!targetActive) {
          // nothing to contradict; defensively record as a new active trait so we don't lose the signal.
          addNew(o)
          break
        }
        const before = targetActive.text
        targetActive.status = "contradicted"
        targetActive.updatedAt = now
        traitWrites.push({ mode: "update", trait: { ...targetActive } })
        traitEvents.push(baseEvt(targetActive.id, "contradict", before, before, o))
        break
      }
      case "supersede": {
        if (!targetActive) { addNew(o); break }
        const before = targetActive.text
        // 1) mark the OLD trait superseded (kept, not deleted).
        targetActive.status = "superseded"
        targetActive.updatedAt = now
        traitWrites.push({ mode: "update", trait: { ...targetActive } })
        // 2) create the NEW replacement active trait.
        const replacement = mkTrait(o)
        byId.set(replacement.id, replacement)
        traitWrites.push({ mode: "insert", trait: { ...replacement } })
        // 3) supersede event on the OLD trait, referencing the new one.
        traitEvents.push(
          baseEvt(targetActive.id, "supersede", before, o.text, o, `superseded_by:${replacement.id}`),
        )
        // and a create event for the new trait's provenance.
        traitEvents.push(baseEvt(replacement.id, "create", null, replacement.text, o))
        break
      }
      case "reopen": {
        // reopen reactivates a currently contradicted or superseded trait (same id).
        // If the target doesn't exist or is already active, fall back to addNew.
        const targetResolved = o.traitId ? byId.get(o.traitId) : undefined
        const isResolved = targetResolved && (targetResolved.status === "contradicted" || targetResolved.status === "superseded")
        if (!isResolved) { addNew(o); break }
        const g = groundQuote(ctx.rawText ?? null, o.quote)
        targetResolved.status = "active"
        targetResolved.strength += 1
        targetResolved.text = o.text
        targetResolved.srcTranscriptId = ctx.transcriptId
        targetResolved.srcQuote = g.quote
        targetResolved.srcQuoteOffset = g.offset
        targetResolved.srcVerified = g.verified
        targetResolved.srcSpeaker = o.speaker ?? null
        targetResolved.updatedAt = now
        targetResolved.area = o.area ?? null
        targetResolved.issueType = o.issueType ?? null
        targetResolved.severity = o.severity ?? null
        traitWrites.push({ mode: "update", trait: { ...targetResolved } })
        traitEvents.push(baseEvt(targetResolved.id, "reopen", null, targetResolved.text, o))
        break
      }
    }
  }

  const activeTraits = [...byId.values()].filter((t) => t.status === "active")
  return { traitWrites, traitEvents, activeTraits }
}

// Recompute a persona's insights_json cache from a set of ACTIVE traits.
// Shape matches what the studio/dashboard already read (kind/text/quote), plus the stable traitId
// so the UI can render citation chips. Pure so it is reused both at write-time and in tests.
export type InsightCacheItem = {
  traitId: string
  kind: TraitKind
  text: string
  quote: string
  speaker: string | null
  sourceTranscriptId: string
  strength: number
  area: string | null
  issueType: string | null
  severity: string | null
}
export function insightsFromTraits(activeTraits: Trait[]): InsightCacheItem[] {
  return activeTraits
    .filter((t) => t.status === "active")
    .map((t) => ({
      traitId: t.id,
      kind: t.kind,
      text: t.text,
      quote: t.srcQuote,
      speaker: t.srcSpeaker,
      sourceTranscriptId: t.srcTranscriptId,
      strength: t.strength,
      area: t.area ?? null,
      issueType: t.issueType ?? null,
      severity: t.severity ?? null,
    }))
}

// Pure recurrence computation from a chronologically-ordered list of trait_events for ONE trait line.
// "raised" = create/add/reinforce/refine/reopen ops.
// "resolved" = contradict/supersede ops.
// regressed = true iff at least one raise event occurs AFTER a resolution event.
// priorResolvedAt = the sourceDate of the first resolution that was subsequently followed by a raise.
export type RecurrenceInfo = {
  firstRaised: number | null
  lastRaised: number | null
  timesRaised: number
  regressed: boolean
  priorResolvedAt: number | null
}

const RAISE_OPS = new Set<TraitEventOp>(["create", "reinforce", "refine", "reopen"])
const RESOLVE_OPS = new Set<TraitEventOp>(["contradict", "supersede"])

// ── Citation resolution (pure) ─────────────────────────────────────────────
// Matches an LLM's cited trait ids against a Sim's trait set, picks the primary (first match)
// for the provenance fields, and surfaces the STRONGEST recurrence across all matched traits.
// DB-FREE: the caller passes the Sim's traits + a traitId→events map fetched ONCE per Sim, so a
// reaction loop no longer re-queries trait events per reaction (the N+1). `sourceDate` is resolved
// by the caller (it needs a transcript lookup). Returns null when nothing matches.
//
// `eventsByTrait === null` means the events read was unavailable (e.g. no-DB mode) → recurrence is
// null; an (even empty) Map means events were read → recurrence is always a non-null object.
export type CitationPick = {
  citedTraitIds: string[]
  sourceQuote: string | null
  speaker: string | null
  sourceTranscriptId: string | null
  issueType: string | null
  sourceQuoteVerified: boolean | null
  recurrence: RecurrenceInfo | null
}

export function pickCitation(
  traits: Trait[],
  eventsByTrait: Map<string, TraitEventRow[]> | null,
  citedTraitIds: unknown,
): CitationPick | null {
  if (!Array.isArray(citedTraitIds) || citedTraitIds.length === 0) return null
  const want = new Set(citedTraitIds.map((x) => String(x)))
  const matched = traits.filter((t) => want.has(t.id))
  if (!matched.length) return null
  const primary = matched[0]

  // Strongest recurrence: prefer regressed traits; among ties prefer higher timesRaised.
  let recurrence: RecurrenceInfo | null = null
  if (eventsByTrait !== null) {
    for (const t of matched) {
      const rec = recurrenceFromEvents(eventsByTrait.get(t.id) ?? [])
      if (!recurrence) {
        recurrence = rec
      } else {
        const stronger = (rec.regressed && !recurrence.regressed) ||
          (rec.regressed === recurrence.regressed && rec.timesRaised > recurrence.timesRaised)
        if (stronger) recurrence = rec
      }
    }
  }

  return {
    citedTraitIds: matched.map((t) => t.id),
    sourceQuote: primary.srcQuote || null,
    speaker: primary.srcSpeaker || null,
    sourceTranscriptId: primary.srcTranscriptId || null,
    issueType: primary.issueType ?? null,
    sourceQuoteVerified: primary.srcVerified ?? null,
    recurrence,
  }
}

export function recurrenceFromEvents(events: TraitEventRow[]): RecurrenceInfo {
  if (events.length === 0) {
    return { firstRaised: null, lastRaised: null, timesRaised: 0, regressed: false, priorResolvedAt: null }
  }

  let firstRaised: number | null = null
  let lastRaised: number | null = null
  let timesRaised = 0
  let regressed = false
  let priorResolvedAt: number | null = null
  let lastResolvedAt: number | null = null

  for (const evt of events) {
    if (RAISE_OPS.has(evt.op)) {
      timesRaised += 1
      if (firstRaised === null) firstRaised = evt.sourceDate
      lastRaised = evt.sourceDate
      // if there was a prior resolution before this raise, we have regression
      if (lastResolvedAt !== null && !regressed) {
        regressed = true
        priorResolvedAt = lastResolvedAt
      }
    } else if (RESOLVE_OPS.has(evt.op)) {
      lastResolvedAt = evt.sourceDate
    }
  }

  return { firstRaised, lastRaised, timesRaised, regressed, priorResolvedAt }
}
