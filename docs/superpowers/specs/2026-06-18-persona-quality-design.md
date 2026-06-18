# Design: Persona Insight Quality — specificity + recurrence/regression

**Date:** 2026-06-18
**Status:** Approved (design + adversarial critique done), ready for implementation plan
**Author:** brainstormed with dev2@quantana.com.au; designed + critiqued via parallel workflow

## Problem

Klavity persona ("Sim") insights are (1) too abstract — "export is slow" rather
than naming the concrete artifact (which label/button/flow/screen), the technical
nature, and a severity — so reactions and filed bugs are vague; and (2) have no
recurrence/regression awareness — when a previously-resolved pain resurfaces,
nothing marks "raised before (date) → happened again (date)", and the Sim's
reactions carry no memory ("I flagged this label months ago and it's back").
Motivating story: a client found a label issue long ago and was disappointed it
recurred.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Specificity | add typed nullable columns `area`, `issue_type`, `severity` to `sim_traits` (+ snapshot on `trait_events`), mirrored in `InsightCacheItem`/`ReconcileOp`/extract shapes |
| `issue_type` | **closed enum**: `label-copy \| layout \| performance \| flow \| error-handling \| accessibility \| visual` (clean dashboard facets) |
| Recurrence lineage | **`reopen` op** — feed RECONCILE_SYS the recently contradicted/superseded traits so the LLM **reactivates the SAME trait id** when an issue returns (this is the fix that makes regression actually fire) |
| Recurrence storage | DERIVED from `trait_events` along the (now-connected) lineage — no denormalized recurrence column |
| Migration location | **`initDb`/`applySchema`** (additive `columnExists`+`ALTER`, like `accounts.domain`) — **NOT `migrateV2`** (which early-returns on every existing prod DB) |
| Disappointment voice | gated on **regression only** (resolved-then-returned), NOT on mere `timesRaised>=2` — else personas sound perpetually aggrieved |
| severity → Plane | **guidance only** in v1 (REACT_SYS gets `trait.severity`; the LLM-produced `suggestedBug.severity` is grounded by it). Full Plane-body/severity plumbing is out of scope. |

## Architecture (Approach B, refined per critique)

### Why the two HIGH critique blockers are addressed
1. **Trait lineage across resolution (the killer issue).** Today `supersede` mints
   a NEW trait id and `contradict` + active-only reconcile force a re-emerged pain
   onto a brand-new `add` id — so "regression = reinforce-after-contradict on the
   SAME id" would essentially never fire. **Fix: the `reopen` op.** `reconcileSim`
   now also passes a small set of recently contradicted/superseded traits to
   RECONCILE_SYS; RECONCILE_SYS may emit `reopen` (targeting a resolved trait id)
   when that same issue resurfaces. `applyReconcileOps` handles `reopen` by setting
   the trait `status` back to `active`, bumping strength, and emitting a
   `trait_events` row `op='reopen'` carrying the new quote/sourceDate. Recurrence
   then derives from the connected event chain on that id.
2. **Migration placement.** The `ALTER TABLE sim_traits/trait_events ADD COLUMN ...`
   go in `initDb`/`applySchema` (unconditional, `columnExists`-guarded), NOT in the
   flag-guarded `migrateV2`. A migrate test seeds a DB with `migrated_v2` already
   set and asserts the columns appear after boot.

### Specificity
- `EXTRACT_SYS` / `RECONCILE_SYS`: each insight/op emits `{kind, text, quote, area, issueType, severity}`. `extractPersonas`/`reconcileSim` sanitize (severity ∈ {high,medium,low,null}; issueType ∈ the closed enum or null; area trimmed string or null) the same way `kind` is validated today. **Both** the extract path and the reconcile op-sanitizer must thread the new fields (critique: easy to drop one).
- `applyReconcileOps` carries `area/issueType/severity` through `mkTrait` and the reinforce/refine/supersede/**reopen** writes, and snapshots them onto every `TraitEventRow` (incl. BOTH events `supersede` emits). `insightsFromTraits`/`rebuildInsightsJson` copy them into the cache (C1 guard unchanged; absent → null, back-compat).

### Recurrence (derived)
- New pure `recurrenceFromEvents(eventsForTrait)` → `{firstRaised, lastRaised, timesRaised, regressed, priorResolvedAt}`. **regressed = a `reopen` (or reinforce/re-add) event after a `contradict`/`supersede` on the connected line**; recurrence = `timesRaised >= 2`.
- React path: build a per-trait memory block (from `listTraitEvents` + `recurrenceFromEvents`) and attach to the persona JSON. **REACT_SYS voices disappointment + the "raised before X → again Y" line ONLY when `regressed` is true.** `resolveCitations` returns recurrence per **each** cited trait (not just `matched[0]`) and surfaces the strongest regression.
- `/api/sims/:id/evolution` annotates a post-resolution `reopen`/reinforce as a regression marker.

### Performance note (critique gap)
`listTraitEvents(simId)` is a full per-Sim scan with no per-trait filter, called in
the latency-sensitive `/api/sim/review` loop. Plan: fetch events once per review
(not per cited trait) and group in memory; if needed add a `trait_id` filter to
`listTraitEvents`.

## Staging
- **Stage 1**: migration (in `initDb`) + columns + `EXTRACT_SYS`/`RECONCILE_SYS` prompt changes + extract/reconcile sanitizers + cache copy. Improves new extractions; no read-path dependency.
- **Stage 2**: `reopen` op end-to-end (prompt + `reconcileSim` recently-resolved feed + `applyReconcileOps` handling + event) + `recurrenceFromEvents` + REACT_SYS memory wiring (regression-gated) + citation/evolution surfacing.

## Out of scope (v1)
- Denormalized recurrence/regression columns or a `regress` state column (derive instead).
- Bulk LLM re-extraction/backfill of `area/severity` on existing traits (populate organically; recurrence works prospectively on connected lineage).
- Full Plane-body severity plumbing (`buildIssueHtml` signature change) — severity is LLM guidance in v1.

## Open questions (sensible defaults shipped; revisit)
- Severity taxonomy reuses suggestedBug's high|medium|low (no 4th tier in v1).
- Whether a regression auto-bumps `suggestedBug.severity` — v1 annotates only (no auto-bump).
- Legacy `legacy_import` traits have no resolving events → regression is prospective-only for them; PRD notes this.

## File touch list
- `prototype/server.ts` — EXTRACT_SYS/RECONCILE_SYS/REACT_SYS prompt updates; `reconcileSim` feeds recently-resolved traits + sanitizes new fields + `reopen`; react path builds regression-gated memory; `resolveCitations` per-cited-trait recurrence; `/api/sims/:id/evolution` regression marker.
- `prototype/lib/provenance.ts` — `Trait`/`ReconcileOp`/`TraitEventRow` gain `area/issueType/severity`; `applyReconcileOps` handles `reopen` + carries fields + snapshots events; new pure `recurrenceFromEvents`; `TraitEventOp` gains `'reopen'`.
- `prototype/lib/db.ts` — `initDb` additive ALTERs (sim_traits + trait_events) `columnExists`-guarded; row mappers + insert/update SQL + `listTraitEvents` (optional trait_id filter); `getRecentlyResolvedTraits(simId)` for the reopen feed.
- `prototype/lib/provenance.test.ts` — `recurrenceFromEvents` (RED first); `applyReconcileOps` field-carry + `reopen`; field snapshot on both supersede events.
- `prototype/lib/migrate.test.ts` — flag-already-set DB → columns appear after boot; idempotent.
- `docs/PRD.md` (regression-is-prospective note), `CHANGELOG.md`, 5 manifests — version bump (reconcile at merge time).

## Test strategy (TDD)
Pure-first, mirroring `provenance.test.ts`:
1. `recurrenceFromEvents`: create+reinforce → {timesRaised:2, regressed:false}; create+contradict+**reopen** → regressed:true, priorResolvedAt=contradict.sourceDate, lastRaised=reopen.sourceDate; single create → regressed:false; empty → safe defaults.
2. `applyReconcileOps`: `reopen` reactivates the same id (status active, strength bump, event `op='reopen'`); area/issueType/severity carried into mkTrait/reinforce/refine/supersede/reopen and snapshotted on every event (incl. both supersede emits); absent → null.
3. extract + reconcile sanitizers: severity clamped, issueType constrained to the enum or null, area trimmed; new fields preserved on BOTH paths.
4. Migration: DB with `migrated_v2` set → `columnExists` true after boot; existing rows survive null; idempotent on re-run.
5. `insightsFromTraits`/cache: new fields copied; absent serialize null (back-compat). `rebuildInsightsJson` C1 guard unchanged.
6. Surfacing: seeded create+contradict+reopen → `resolveCitations` returns regression summary; REACT memory block present ONLY when regressed; a 2×-reinforced-never-resolved trait produces NO disappointment voice.
Full existing `bun test` suite stays green as the regression gate.
