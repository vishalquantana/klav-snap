# Persona Insight Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes. Read the spec first: `docs/superpowers/specs/2026-06-18-persona-quality-design.md` (full design + critique rationale).

**Goal:** Persona insights name the concrete artifact/issueType/severity, and a resurfaced (previously resolved) issue is detected as a regression and voiced with disappointment.

**Architecture:** Typed nullable columns (`area`,`issue_type`,`severity`) on `sim_traits` + snapshot on `trait_events` for specificity; a `reopen` op that reactivates the SAME trait id so recurrence/regression derive from a connected `trait_events` chain. Migration lives in `initDb` (NOT `migrateV2`). Disappointment voice is gated on regression only.

**Tech Stack:** Bun, TypeScript, Turso/libsql, OpenRouter prompts, `bun:test`.

## Global Constraints

- Work entirely in the worktree `/Users/vishalkumar/Downloads/qbug/klav-snap/.claude/worktrees/persona-quality`.
- **Migration placement (critique blocker):** additive `columnExists`-guarded `ALTER TABLE sim_traits/trait_events ADD COLUMN ...` go in `initDb`/`applySchema` (like `accounts.domain`), **NOT `migrateV2`** (it early-returns on existing prod DBs). All new columns nullable + additive; existing rows survive; idempotent.
- **Lineage (critique blocker):** recurrence must NOT key on a single trait id surviving resolution (it doesn't — `supersede` mints a new id, `contradict`+active-only reconcile force re-emergence to a new `add`). Fix: the **`reopen` op** — `reconcileSim` feeds recently contradicted/superseded traits to RECONCILE_SYS, which emits `reopen` (targeting a resolved id); `applyReconcileOps` reactivates that id (status→active, strength bump, event `op='reopen'`).
- `issue_type` is a **closed enum**: `label-copy|layout|performance|flow|error-handling|accessibility|visual` (or null). `severity` ∈ `high|medium|low|null`. Sanitize in BOTH the extract path and the reconcile op-sanitizer.
- **Disappointment voice gated on REGRESSION only** (resolved-then-returned), never on `timesRaised>=2` alone.
- `severity` is **LLM guidance** in v1 (REACT_SYS receives it); do NOT add Plane-body/severity plumbing (`buildIssueHtml` unchanged).
- Recurrence is **derived** from `trait_events` (no recurrence/regressed column). Read events once per review (not per cited trait); group in memory; optional `trait_id` filter on `listTraitEvents`.
- Back-compat: `InsightCacheItem` new fields optional; `rebuildInsightsJson` C1 guard unchanged; legacy `legacy_import` traits → regression is prospective-only (note in PRD).
- TDD, pure-first (mirror `provenance.test.ts`). Tests: `cd prototype && bun test`. Full suite stays green as the regression gate.
- SemVer lockstep at merge time.

## File Structure
- `prototype/lib/provenance.ts` — types + `applyReconcileOps` (`reopen` + field-carry + event snapshot) + `recurrenceFromEvents` (pure) + `TraitEventOp` adds `'reopen'`.
- `prototype/lib/db.ts` — `initDb` additive ALTERs; row mappers + insert/update SQL + `listTraitEvents` filter + `getRecentlyResolvedTraits`.
- `prototype/server.ts` — prompts (EXTRACT/RECONCILE/REACT) + sanitizers (both paths) + reconcile recently-resolved feed + react memory (regression-gated) + `resolveCitations` per-cited-trait + evolution marker.
- Tests: `provenance.test.ts`, `migrate.test.ts`.

---

### Task 1: Additive migration in `initDb` + migrate test (TDD)

**Files:** Modify `prototype/lib/db.ts`; modify `prototype/lib/migrate.test.ts`.

- [ ] **Step 1: Write failing migrate test** — seed a DB with `schema_meta` `migrated_v2` ALREADY set and the OLD `sim_traits` shape (no new columns); after `initDb`/`applySchema`, assert `columnExists(sim_traits,'area'|'issue_type'|'severity')` and same for `trait_events`; existing rows survive with null; idempotent on second boot.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the `columnExists`-guarded `ALTER TABLE ... ADD COLUMN` for both tables in `initDb` (next to the `accounts.domain` add), NOT in `migrateV2`.
- [ ] **Step 4: Run → PASS** (`cd prototype && bun test lib/migrate.test.ts`).
- [ ] **Step 5: Commit** `feat(persona): additive area/issueType/severity columns via initDb (prod-safe)`.

---

### Task 2: provenance.ts — types, `reopen`, field-carry, `recurrenceFromEvents` (TDD)

**Files:** Modify `prototype/lib/provenance.ts`; modify `prototype/lib/provenance.test.ts`.

**Produces:** `Trait`/`ReconcileOp`/`TraitEventRow` gain `area?/issueType?/severity?`; `TraitEventOp` adds `'reopen'`; `applyReconcileOps` handles `reopen` (reactivate same id, strength+1, event) and carries the 3 fields through mkTrait/reinforce/refine/supersede/reopen + snapshots them on every `TraitEventRow`; pure `recurrenceFromEvents(events) -> { firstRaised, lastRaised, timesRaised, regressed, priorResolvedAt }`.

- [ ] **Step 1: Write failing tests** — `recurrenceFromEvents`: create+reinforce→{timesRaised:2,regressed:false}; create+contradict+reopen→{regressed:true, priorResolvedAt=contradict.sourceDate, lastRaised=reopen.sourceDate}; single create→regressed:false; empty→safe defaults. `applyReconcileOps`: `reopen` reactivates the same id (status active, strength bump, `op='reopen'` event); fields carried into mkTrait + refreshed on reinforce + replaced on refine/supersede/reopen + snapshotted on BOTH supersede events; absent→null.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** in provenance.ts.
- [ ] **Step 4: Run → PASS** (`cd prototype && bun test lib/provenance.test.ts`).
- [ ] **Step 5: Commit** `feat(persona): reopen op + typed fields + recurrenceFromEvents (pure)`.

---

### Task 3: db.ts — row mappers, SQL, events filter, recently-resolved query

**Files:** Modify `prototype/lib/db.ts` (+ extend a db-backed test if present).

**Produces:** `insertTrait`/`updateTrait`/`rowToTrait` + `insertTraitEvent`/`listTraitEvents`/`rowToTraitEvent` read/write the 3 new fields; `listTraitEvents(simId, { traitId? })` optional filter; `getRecentlyResolvedTraits(simId, limit)` returns recently contradicted/superseded traits (id, kind, text, area, issueType) for the reopen feed.

- [ ] **Step 1: Write failing test** — insert a trait with area/issueType/severity → `listTraits` returns them; insert events with snapshot fields → `listTraitEvents` returns them; `getRecentlyResolvedTraits` returns only contradicted/superseded, newest-first.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the SQL/mapper/query changes (additive columns from Task 1 exist).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(persona): persist+read typed fields; getRecentlyResolvedTraits for reopen`.

---

### Task 4: server.ts — prompts, sanitizers, reopen feed, regression-gated reactions

**Files:** Modify `prototype/server.ts`.

- [ ] **Step 1:** Update EXTRACT_SYS (emit area/issueType[enum]/severity per insight, name the concrete artifact), RECONCILE_SYS (same fields per op + `reopen` guidance + the recently-resolved list), REACT_SYS (receive per-trait recurrence memory; voice disappointment + "raised before X → again Y" ONLY when regressed).
- [ ] **Step 2:** Sanitize the new fields in BOTH `extractPersonas` and the `reconcileSim` op-sanitizer (clamp severity, constrain issueType to the enum, trim area). In `/api/transcripts`, pass `getRecentlyResolvedTraits(simId)` into `reconcileSim`.
- [ ] **Step 3:** React path: fetch `listTraitEvents(simId)` once, group by trait, compute `recurrenceFromEvents`, attach regression-gated memory to the persona JSON before `reactToPage`. `resolveCitations` returns recurrence per EACH cited trait (surface strongest regression, not `matched[0]` only). `/api/sims/:id/evolution`: mark a post-resolution reopen/reinforce as a regression.
- [ ] **Step 4: Verify** — `cd prototype && bun build server.ts --target=bun --outfile=/tmp/pq.js` clean; `bun test` full suite green; add/extend a test asserting a 2×-reinforced-never-resolved trait yields NO disappointment memory, while create+contradict+reopen yields a regression summary via `resolveCitations`.
- [ ] **Step 5: Commit** `feat(persona): specific-issue prompts + reopen feed + regression-gated reaction memory`.

---

### Task 5: Housekeeping (version + changelog + PRD note)

- [ ] **Step 1:** Bump 5 manifests + PRD + CHANGELOG (next minor; reconcile at merge). PRD: note regression detection is prospective (needs a clean resolve→reopen on connected lineage; legacy import excluded). CHANGELOG: "Persona insights now name the concrete UX/technical issue (area/type/severity) and detect regressions — when a resolved pain resurfaces, the Sim reacts with 'I flagged this before, and it's back'."
- [ ] **Step 2:** Full suite green; build clean.
- [ ] **Step 3: Commit** `chore: release <ver> — persona insight specificity + recurrence/regression`.

## Self-Review Notes
Covers spec: typed fields + enum issueType ✓ (T1-T4); reopen lineage ✓ (T2 apply, T3 query, T4 feed/prompt); migration in initDb + flag-set test ✓ (T1); recurrence derived + regression-gated voice ✓ (T2, T4); severity=guidance ✓ (T4, no Plane plumbing); back-compat/null + C1 guard ✓; events read once per review ✓ (T4). No placeholders; pure-logic tasks (T1,T2) carry concrete test cases.
