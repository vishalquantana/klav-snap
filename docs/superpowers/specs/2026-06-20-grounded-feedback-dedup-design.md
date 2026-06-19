# Design: Grounded Sim Feedback + Suggested-Bug Dedup

**Date:** 2026-06-20
**Status:** Approved (design); ready for implementation plan
**Author:** brainstormed with dev2@quantana.com.au
**Parent:** `docs/backlog/recurring-issue-memory.md` — this is the trustworthy **write-path foundation** (Phase 1 capabilities #1 grounding + #2 dedup) that the recurrence memory and cited conversational recall later build on.

## Problem

Two gaps in how Klavity Sims produce feedback today:

1. **Quotes are unverified.** `EXTRACT_SYS` / `RECONCILE_SYS` *ask* the LLM for a "short verbatim quote from the transcript," but nothing checks the returned quote actually appears in the transcript's `raw_text`. The locator field `src_quote_offset` (on `sim_traits`) and `quote_offset` (on `trait_events`) already exist but are hardcoded `null`. So a Sim's feedback citation can surface a paraphrased, smoothed-over, or fabricated quote presented as a real verbatim line — exactly the "synthetic-credibility" risk the parent backlog doc (§5/§7) is built to avoid.

2. **Suggested bugs are never deduped.** The `feedback` table has no dedup key. Every review that yields a `suggestedBug` inserts a fresh `feedback` row, and the auto-copy connector files a fresh external ticket. During a QA pass against an **unchanged older build**, the same screens are re-encountered repeatedly → the same suggested bug → duplicate feedback rows and duplicate Plane/Jira/etc. tickets pile up.

Both problems share one missing primitive: a stable **issue identity** — what makes two pieces of feedback "the same issue," and what real evidence backs it.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Quote mismatch handling | **Snap-then-flag**: exact match → fuzzy snap to closest real span → else keep LLM text, `verified=false`. Never fabricate. |
| Dedup issue identity | **Hybrid**: deterministic key (exact, fast path) + semantic fallback for paraphrase. |
| Semantic fallback impl | **Lexical similarity** (normalized trigram/token cosine, pure fn) — NO new vector-embedding infra in v1; true embeddings are a future swap behind the same interface. |
| On duplicate | **Collapse + bump recurrence**: do NOT insert a new feedback row, do NOT auto-copy a new ticket; bump a recurrence counter + record the re-sighting date on the existing row. |
| Migration location | `initDb`/`applySchema` additive `columnExists`+`ALTER` (the locked pattern from the persona-quality spec) — NOT `migrateV2`. |
| Read-path UI | **Out of scope v1** (highlight exact line in Sim Studio, verified badge) — write-path foundation only. |

## Subsystem A — Verbatim-line grounding

**Goal:** every trait quote that backs a Sim's feedback is provably the exact line in the source transcript, or honestly flagged when it isn't.

### Pure helper — `groundQuote(rawText, quote) → { quote, offset, verified }`

New pure function in `lib/provenance.ts`:

1. **Exact match** — `rawText.indexOf(quote)`. Hit → `{ quote, offset, verified: true }`.
2. **Fuzzy snap** — normalize whitespace / smart-quotes / case on both sides; slide a window over `rawText` for the best-scoring span by token overlap. If the best score ≥ threshold (default **0.85**, a tunable const), snap to the **real** substring from `rawText` and its offset → `{ quote: realSpan, offset, verified: true }`.
3. **Flag** — best score < threshold → `{ quote, offset: null, verified: false }`. Keeps the LLM text but is honest that it is not anchored. Never fabricates.

`verified` is tri-state at the storage layer: `true` (anchored), `false` (LLM text, unanchored), `null` (grounding not attempted — legacy trait with no recoverable transcript).

### Wiring — no new AI calls

- Thread the transcript `rawText` into the context object passed to `applyReconcileOps` (`{ simId, projectId, transcriptId, sourceDate, rawText }`).
- `mkTrait` and the `reinforce` / `refine` / `supersede` / `reopen` writes already populate `srcQuote` / `srcQuoteOffset` / `srcSpeaker` — they now call `groundQuote(ctx.rawText, o.quote)` and use the returned `quote` + `offset` + set `srcVerified`.
- `baseEvt` snapshots the same grounded `quote` + `quoteOffset` + `verified` onto every `trait_events` row (incl. both events `supersede` emits).
- **Legacy seed path** (`ensureTraitsSeeded`): seeds from `insights_json` with `srcTranscriptId='legacy_import'` and no recoverable transcript text → these stay `verified=null` (unknown, not false). No change needed; grounding meaningfully applies to reconcile writes against a real transcript. Grounding brand-new-persona first seeds against their originating transcript is a noted follow-up (the spec's "populate organically as new transcripts reconcile").
- `resolveCitations` already returns `sourceQuote`; it gains `sourceQuoteVerified` so the bit rides the feedback payload to the surface.

### Schema (additive, `columnExists`+`ALTER` in `initDb`)

- `sim_traits.src_verified INTEGER` (0 | 1 | null).
- `trait_events.verified INTEGER` (0 | 1 | null).
- The offset columns (`sim_traits.src_quote_offset`, `trait_events.quote_offset`) already exist — newly populated, not added.

## Subsystem B — Suggested-bug dedup (collapse + bump recurrence)

**Goal:** on an unchanged build, the same suggested bug collapses into the existing report instead of spawning a new ticket — and that collapse records a recurrence signal for the later memory feature.

### Issue identity (hybrid)

- **Exact key** — pure `issueKeyFor({ projectId, urlPath, issueType, citedTraitIds }) → string`: a hash of `projectId | normalizedUrlPath | issueType | sortedCitedTraitIds`. Deterministic, perfect on an unchanged build, no LLM. `normalizedUrlPath` strips query/hash and trailing slash.
- **Semantic fallback** — pure `lexicalSim(a, b) → number` (0..1): normalized trigram/token cosine over bug title + observation. When the exact key misses, compare against recent feedback rows (within a bounded window) in the same project (optionally same `urlPath`); a score ≥ threshold (default **0.82**, tunable) counts as the same issue. Lexical, not vector — pure, deterministic, unit-testable; a true-embedding implementation can later replace `lexicalSim` behind the same signature. (Dedup matches on issue identity only; ticket-status-aware dedup — e.g. not collapsing into a closed ticket — is a later concern.)

### Flow — at feedback insertion (`server.ts` review path, ~line 1257)

Before `insertFeedback`, for any reaction carrying a `suggestedBug`:

1. Compute `issueKey`. Look up the most recent existing feedback row in the project by `issue_key`.
2. On miss, run the semantic fallback over recent feedback; a match adopts that row's `issue_key`.
3. **Miss (new issue)** → insert as today, additionally storing `issue_key`, `recurrence_count = 1`, `last_seen_at = now`, `recurrence_dates_json = [today]`. Auto-copy connector fires as today.
4. **Hit (duplicate)** → do **not** insert, do **not** auto-copy. On the existing row: `recurrence_count += 1`, append today to `recurrence_dates_json`, set `last_seen_at = now`. Return the existing feedback id with `deduped: true` in the review response.

Reactions **without** a `suggestedBug` (pure observations) are inserted unchanged — dedup applies only to filed-bug feedback.

### Connector safety

The dedup decision happens **before** the auto-copy connector is invoked, so a recurring bug on an unchanged build never spawns a second external ticket. (Ticket source is Plane — `plane.quantana.top`, workspace `qbuilder`, prod `proj_32948ecf`.)

### Schema (additive, `columnExists`+`ALTER` in `initDb`)

- `feedback.issue_key TEXT`
- `feedback.recurrence_count INTEGER DEFAULT 1`
- `feedback.recurrence_dates_json TEXT`
- `feedback.last_seen_at INTEGER`
- `CREATE INDEX feedback_issue_idx ON feedback (project_id, issue_key)`

## Components (isolation)

- `groundQuote(rawText, quote)` — pure; exact → fuzzy → flag.
- `issueKeyFor(parts)` — pure; deterministic hash.
- `lexicalSim(a, b)` — pure; normalized trigram/token cosine. The single seam a future embedding swap replaces.
- `dedupeSuggestedBug(projectId, candidate, lookups)` — orchestration helper (server) wrapping key lookup + semantic fallback + the insert-or-bump decision; returns `{ feedbackId, deduped }`.
- The server review path just wires these in; `applyReconcileOps` gains `rawText` in its context and calls `groundQuote`.

Each is independently testable: pure fns take inputs → outputs; the dedupe helper takes (candidate, existing rows) → decision.

## Testing (TDD, pure-first — mirrors `provenance.test.ts`)

1. `groundQuote`: exact hit → real offset, verified true; whitespace/case/smart-quote variant ≥ threshold → snaps to the real span + verified true; unrelated text < threshold → original text, offset null, verified false; empty/short quote → safe defaults.
2. `applyReconcileOps`: with `rawText` in ctx, a create/reinforce/refine/supersede/reopen carries a grounded offset + `srcVerified`, and every emitted `trait_events` row snapshots `quote_offset` + `verified` (incl. both supersede emits). Absent `rawText` → verified null.
3. `issueKeyFor`: same parts (any citedTraitIds order) → same key; different issueType / path / project → different key; path normalization (query/hash/trailing slash) holds.
4. `lexicalSim`: identical → ~1; paraphrase ≥ threshold; unrelated < threshold.
5. Server: two reviews producing an identical suggested bug → **one** feedback row, `recurrence_count = 2`, `recurrence_dates_json` has two dates, and **no** second `ticket_exports` row. A genuinely different bug → a second row. A pure observation (no suggestedBug) → inserted, never deduped.
6. Migration: a DB with the old schema → new columns present after boot; existing rows survive (null defaults); idempotent on re-run.
7. Full existing `bun test` suite stays green as the regression gate.

## File touch list

- `prototype/lib/provenance.ts` — `groundQuote`; `applyReconcileOps` ctx gains `rawText` + grounds every quote write/event snapshot; `Trait`/`TraitEventRow` gain `srcVerified`/`verified`.
- `prototype/lib/provenance.test.ts` — `groundQuote` table (RED first); grounded carry through `applyReconcileOps` + event snapshots.
- `prototype/lib/db.ts` — `initDb` additive ALTERs (`sim_traits.src_verified`, `trait_events.verified`, the 4 feedback dedup columns + index), `columnExists`-guarded; row mappers + insert/update SQL; `issueKeyFor`, `lexicalSim`, dedup lookup + bump helpers (or co-located in a small `lib/dedup.ts`); `FeedbackInsert` gains the dedup fields.
- `prototype/lib/dedup.test.ts` (NEW) — `issueKeyFor`, `lexicalSim` tables.
- `prototype/server.ts` — reconcile path passes `rawText` into `applyReconcileOps`; the `/api/feedback` path (before `insertFeedback` + auto-copy) and the `/api/sim/review` path call the dedupe helper; `resolveCitations` returns `sourceQuoteVerified` + `issueType`.
- `prototype/server.traits.test.ts` (or a new `server.dedup.test.ts`) — duplicate suggested bug → one row + recurrence bump + no second ticket export; distinct bug → new row.
- `prototype/lib/migrate.test.ts` — old-schema DB → new columns appear after boot; idempotent.
- `docs/PRD.md`, `CHANGELOG.md`, 5 manifests — version bump (next MINOR; reconcile at merge time).

## Out of scope (v1)

- Read-path UI: highlighting the exact line in Sim Studio Source/Transcript tabs; a "verified ✓ / unverified ⚠" badge on feedback.
- The conversational "have users hit X before?" cited recall (parent doc Part 2).
- True vector embeddings for the semantic fallback (lexical for now; same interface).
- Cross-project clustering; per-project dedup-strategy config.
- Backfilling `src_verified` on existing traits (populate organically as new transcripts reconcile).

## Open questions (sensible defaults shipped; revisit with telemetry)

- Fuzzy-snap threshold (~0.85) and lexical-dedup threshold (~0.82) — shipped as tunable consts.
- Whether the semantic fallback scans same-`urlPath` only vs whole-project recent open feedback (default: same project, recent window; path as a score boost not a hard filter).
- Whether a recurrence bump should also post a comment on the existing external ticket — deferred (chosen behavior is collapse + bump only; external comment is a later option).
