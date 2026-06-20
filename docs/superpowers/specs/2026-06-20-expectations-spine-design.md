# Expectations Spine + Graduation — Design (thin slice)

> Status: approved design (2026-06-20). First sub-project of the "Discover → Enforce, client-feedback-as-spine" re-architecture. Later sub-projects (out of scope here): described-archetype Sims, decision-criteria→expectations, transcript-genre routing, speaker labelling, embedding-corroboration.

## Problem / why

Sim mode (LLM personas reacting to the live product) and AutoSim mode (zero-LLM deterministic Trail replay) today share personas and both *should* honour real client feedback — so the two modes aren't meaningfully differentiated. The differentiation only earns its keep when:

- **Client feedback is the spine** — real Snap reports + validated Sim findings are the ground truth of "what's true about this product," flowing into both modes.
- **Sim = discover** — personas + real feedback surface *new* issues (qualitative, LLM, fresh each run).
- **AutoSim = enforce** — issues that prove real graduate into deterministic, zero-LLM regression checks that run every build.

Today the building blocks ship separately (`feedback`, `sim_traits`, `findings`, Trail `assert` steps, lexical dedup) but nothing connects discovery to enforcement. This slice builds that loop.

## Locked decisions

1. **Scope:** the spine + graduation only (this doc). The four extraction features are later, separate specs.
2. **Mode model:** Discover → Enforce, one loop; an issue graduates from Sim/Snap discovery to an AutoSim check once confirmed.
3. **"Enforced" =** a Trail `assert` step, LLM-translated *once* at graduation + **human-confirmed**; zero-LLM on every replay thereafter (reuses the existing assert engine).
4. **"Validated" trigger =** cross-source corroboration — auto-validate when a real Snap/client report **and** a Sim finding map to the same expectation, **or** recurrence ≥ N (config, default 3). A human still gates the enforce step.

## The spine: `expectations` unifies, it does not copy

A lightweight table that *references* source records and carries the lifecycle — not a duplicate of feedback/findings.

```
expectations(
  id, project_id,
  title,                 -- normalized issue statement
  area, url_path,        -- where it lives
  status,                -- candidate | validated | enforced | retired
  source_refs_json,      -- [{kind:'snap'|'sim'|'finding', id}]   ← one issue, many sources
  corroboration_json,    -- {snap:bool, sim:bool, recurrence:int}
  dedup_key,             -- issueKeyFor (exact) + lexicalSim collapse across sources
  enforced_step_id,      -- trail_steps.id created at graduation (null until enforced)
  created_at, updated_at)
```
Index: `(project_id, status)`, `(project_id, dedup_key)`.

"Client feedback is the spine" becomes literal: a Snap report and a Sim finding about the same thing **collapse into one expectation** via the existing dedup (`lib/dedup.ts`: exact `issueKeyFor` then trigram `lexicalSim`). Embedding-based matching is a deferred upgrade; this slice uses the shipped lexical+exact matcher and **logs** when it declines a near-miss so we can later measure what embeddings would add.

## Lifecycle (the discover→enforce machine)

- **candidate** — written whenever a Snap report, Sim finding, or AutoSim finding lands; hooked into the existing ingest paths. Dedup collapses to an existing expectation or creates one; `source_refs`/`corroboration` updated.
- **candidate → validated** — *automatic* when corroboration fires: (a) `corroboration.snap && corroboration.sim` (a real report and a Sim finding agree), **or** (b) `corroboration.recurrence >= N` (default 3, project-configurable).
- **validated → enforced** — *human* clicks "Enforce" → LLM drafts an assertion → human confirms/edits → written as a Trail assert step; status→enforced, `enforced_step_id` set.
- **enforced → retired** — the assert step is deleted or the issue is won't-fix.

State transitions live in a pure, unit-testable module (no DB): `(expectation, event) → newStatus`.

## Graduation: validated finding → Trail assertion (the one LLM call)

- New `ASSERT_SYS` prompt. Input: the validated expectation (title, grounded quote, area, url, the originating finding's box/target if present) + the candidate target Trail's steps. Output (strict JSON):
  `{trailId, afterStepIdx, action:'assert', target:{role?/name?/text?/selector?}, checkpoint:{kind:'present'|'visible'|'textPresent'|'noConsoleError', value?}}`.
- **Human-confirm UI** shows the drafted assert + which Trail/step it attaches to; the human can edit target/checkpoint, repoint to a different Trail, or reject.
- On confirm → insert a `trail_steps` row using the **existing** assert action + `checkpoint_json` (the runner already turns a failed assert into RED on zero-LLM replay — verify exact assert schema during planning).
- **No suitable Trail** for that url/area → offer a minimal new Trail (navigate → assert), else hold as "validated, awaiting Trail."
- The single graduation call is recorded in `ai_calls` as `type='assert-gen'` (existing ledger + daily cap apply).

## Surfaces / APIs

- **DB:** new `expectations` table + write-hooks in the existing feedback-ingest and finding-ingest paths (additive; no change to existing rows).
- **API (project-scoped, same auth as existing Sim/Trails routes):**
  - `GET /api/expectations?project=&status=` — list
  - `POST /api/expectations/:id/enforce` — LLM draft assertion (returns the draft, persists nothing)
  - `POST /api/expectations/:id/enforce/confirm` — persist the trail_step, set enforced
  - `POST /api/expectations/:id/retire`
- **Dashboard:** an "Expectations" board (extends `/trails` or the Sims dashboard) with Candidate / Validated / Enforced columns; each row shows source badges (Snap · Sim · ×N recurrence), the grounded quote, and the Enforce CTA on validated rows.

## Testing

- **Pure unit:** corroboration matcher (dedup collapse + source-kind tracking), lifecycle transitions (auto-validate triggers, both corroboration paths), assertion-spec validation/shape.
- **Integration:** ingest a Snap report + a Sim finding for the same issue → expectation auto-validates; enforce → confirm → a `trail_steps` assert row exists; a replay with the asserted element missing → RED (reuse the trails-runner harness).
- **Cost:** assert-gen call appears in `ai_calls`; daily-cap reservation respected.

## Out of scope (later sub-projects)

Described-archetype Sims · decision-criteria→expectations · transcript-genre routing · speaker labelling · embedding-based corroboration · auto-enforce without human confirm.

## Risks / open items for planning

- **Lexical-only corroboration** can miss semantically-phrased matches (Snap "can't finish signup" vs Sim "finish button missing"). Accepted for the slice; near-misses are logged. Embeddings are the named upgrade.
- **Exact assert-step schema** (`action`/`checkpoint_json` shape, the `gone-assert→RED` path) must be confirmed against `trails-runner.ts` during planning before the graduation writer is built.
- **Trail targeting** — choosing which Trail/step a new assert attaches to; the human-confirm step is the backstop for a wrong LLM guess.
