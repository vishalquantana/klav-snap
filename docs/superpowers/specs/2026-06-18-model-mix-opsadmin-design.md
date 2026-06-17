# Design: Weighted Model Mix in `/opsadmin`

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan
**Author:** brainstormed with dev2@quantana.com.au
**Builds on:** v0.9.0 `ai_calls` ledger + `/opsadmin` (and the ffdd28e fire-and-forget `chat()` hotfix)

## Problem

All AI calls use a single fixed model (`process.env.KLAV_MODEL`,
`google/gemini-2.5-flash`). The team wants to (a) try other OpenRouter models —
starting with `qwen/qwen3-vl-235b-a22b-instruct` — without a redeploy, and
(b) run a **weighted mix** of models so feedback gets variety ("the user doesn't
care which model as long as they get interesting insights"). A single fixed
model is just the degenerate case of a mix (`{model: 100%}`), so the general
solution is a weighted allocation, configured live from `/opsadmin`.

Because `ai_calls.model` is already logged per call, making the model vary per
call turns the existing "By type & model" panel and per-model spend into a live
A/B/C comparison for free.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Mix scope | **All AI calls** (extract, reconcile, react) use the mix |
| Weight entry | **Relative weights, auto-normalized** (a model at 0 is disabled) |
| Model list | **Curated shortlist in code** (typo-proof; editable) |
| Persistence | **DB (`schema_meta`)** so changes take effect with no restart |
| Initial weights | **qwen3-heavy trial**, seeded on first boot only if unset: qwen3-vl 50 / gemini-2.5-flash 40 / gemini-3.1-flash-lite 10 |
| UI | New "Model mix" section on `/opsadmin`; plain form POST, no client JS framework |

## Architecture

### 1. Pure helpers in a new module `prototype/lib/models.ts`

To stay unit-testable without booting `Bun.serve` (importing `server.ts` starts
the server), the curated list and pure logic live in `lib/models.ts`:
`MODEL_CHOICES` (id + label + indicative price), `MODEL_CHOICE_IDS`,
`DEFAULT_WEIGHTS`, `pickModel(weights, choiceIds, fallback, rnd)`,
`parseWeightsForm(raw, choiceIds)`, `weightsToPct(weights, choiceIds)`. Only
`MODEL_CHOICES` ids are valid weight keys. `price` is a display hint, not billed.

### 2. Storage + accessors (`prototype/lib/db.ts`)

Reuse `schema_meta(key,value)` (no new table) — key `model_weights` → JSON.
`getModelWeights(): Promise<Record<string,number>>` (`{}` if absent/invalid);
`setModelWeights(weights)` upserts via `ON CONFLICT(key) DO UPDATE`.

### 3. Per-call model pick + cache (`prototype/server.ts`)

In-process weights cache (loaded at boot, refreshed on save, 30s TTL safety):
`getActiveWeights()` / `refreshWeightsCache()`. `chat()` resolves the model once
per call — `pickModel(await getActiveWeights(), MODEL_CHOICE_IDS, MODEL, Math.random())`
— uses it in the OpenRouter request body **and** in `recordAiCall({ model, … })`
so the ledger records the model actually used. `MODEL`/`KLAV_MODEL` is the
fallback. NOTE: `chat()` was hotfixed (ffdd28e) to fire-and-forget the ledger
write with a 90s AbortController timeout; the model pick is added without
reintroducing any `await` of the ledger in the response path.

### 4. `/opsadmin` UI + save route

A "Model mix" panel in `renderOpsAdmin`: one numeric weight input per
`MODEL_CHOICES` row (label, indicative price, current normalized %), in a
`<form method=POST action="/opsadmin/model-mix">` with a Save button. The save
route `POST /opsadmin/model-mix` is `isOpsAdmin`-gated (404 otherwise), parses
`req.formData()`, whitelists ids + coerces non-negative integers via
`parseWeightsForm`, persists, refreshes the cache, and redirects to `/opsadmin`.

### 5. Seed on first boot

After `initDb()`, if `getModelWeights()` is empty, seed `DEFAULT_WEIGHTS`
(qwen3-heavy). Idempotent — seeds only when unset, so later UI edits survive
redeploys. This is what makes qwen3 go live on deploy with no env change.

### 6. Testing (TDD)

- `pickModel` (injected `rnd`): normalization; single non-zero always picked;
  all-zero/empty → fallback; unknown id ignored; 0-weight never picked; bucket
  boundaries. `parseWeightsForm`: coerce/whitelist/floor/negative→0.
  `weightsToPct`: normalize, all-zero→0.
- `getModelWeights`/`setModelWeights` round-trip + empty-on-absent +
  invalid-JSON→{} (hermetic libsql).

## Out of scope (this spec)

- Per-task (text vs vision) separate mixes — global mix only.
- Live OpenRouter catalog fetch / dynamic pricing — curated static list.
- Free-text model ids.
- Feedback triggering & dedup (separate spec — extension content script).

## Deployment / housekeeping

- Minor bump **0.9.0 → 0.10.0**; SemVer lockstep (CHANGELOG + PRD + 5 manifests).
- No new env var; qwen3-heavy default self-seeds on first boot.
- Deploy per the usual flow, then **explicit `systemctl restart klav`** as root +
  polled health (the `deploy.sh`-skips-restart gotcha).
- Verify: `/opsadmin` Model-mix panel shows qwen3 at ~50%; a few AI actions record
  varying models in "By type & model".

## File touch list

- `prototype/lib/models.ts` (new) — shortlist + pure helpers.
- `prototype/lib/db.ts` — `getModelWeights`/`setModelWeights`.
- `prototype/server.ts` — imports; cache + `getActiveWeights`/`refreshWeightsCache`;
  seed on boot; `chat()` per-call pick; "Model mix" panel; `POST /opsadmin/model-mix`.
- `prototype/lib/*.test.ts` — `models`, weights round-trip.
- `CHANGELOG.md`, `docs/PRD.md`, 5 manifests — version bump.
