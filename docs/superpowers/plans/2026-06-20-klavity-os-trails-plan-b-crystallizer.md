# Klavity OS — Trails: Plan B (Crystallizer + Codegen)

**Date:** 2026-06-20
**Layer:** B — pure, no browser, no LLM. Sits on Layer A query helpers (`lib/trails.ts`) and types (`lib/trails-types.ts`).
**Spec:** `docs/superpowers/specs/2026-06-20-klavity-os-trails-design.md` §2.2 ("Crystallize"), §4 ("Crystallizer").

## Intent

The authoring agent (or human-demo recorder) produces a **trajectory**: an ordered list of *resolved* steps — each already grounded to a concrete `resolvedSelector` plus a multi-signal `Fingerprint`, the `url` it occurred on, and a `domHash` of that page. The flaky LLM/demo run is thrown away; the **crystal** is the durable artifact.

Crystallizing turns that trajectory into three things (spec §2.2):
1. a persisted **Trail + trail_steps** (via Layer A helpers) — the canonical SQLite spec;
2. **seeded locator_cache rows**, one per *actionable* step, keyed by `cacheKey(method, url, domHash, projectId)` — the zero-LLM replay hot path;
3. an **exportable standalone Playwright test as a STRING** — ownable, no lock-in ("static tests too", success criterion §10).

This layer is **pure orchestration + string templating**: no browser, no LLM, no network. It only calls Layer A and `cacheKey`.

## Input shape

```ts
type TrajectoryStep = {
  action: StepAction                 // navigate | click | type | select | assert | wait
  actionValue?: string               // url to navigate, text to type, option to select, ms to wait
  target?: Fingerprint & { resolvedSelector?: string }  // resolved target (selector + fingerprint)
  checkpoint?: { description: string }
  url: string                        // page URL this step executed on
  domHash: string                    // hash of the DOM at execution time (cache-key salt)
}

type Trajectory = {
  name: string
  intent?: string
  baseUrl: string
  authorKind?: AuthorKind            // default 'llm'
  createdBy?: string
  steps: TrajectoryStep[]
}
```

`target.resolvedSelector` is the concrete Playwright selector chosen at authoring time (e.g. `#pay`, `[data-testid=email]`, `getByRole(...)` is NOT pre-baked — we store a CSS/attr selector string for determinism). The remaining `Fingerprint` fields (role/accessibleName/text/testId/domPath/bbox/screenshotKey) ride along for Tier-1/Tier-2 healing later.

## Outputs

### `crystallize(projectId, trajectory) -> { trailId; stepIds; cacheKeys }`  (lib/trails-crystallize.ts)

1. `createTrail(projectId, { name, intent, baseUrl, authorKind: traj.authorKind ?? 'llm', createdBy })`.
2. For each trajectory step at index `i`:
   - `addTrailStep(projectId, trailId, { idx: i, action, actionValue, target: <Fingerprint only>, checkpoint })`.
   - **Actionable step** = has a `target.resolvedSelector` (i.e. it touches an element: click/type/select, and asserts that target an element). For each actionable step:
     - `key = await cacheKey(methodFor(action), step.url, step.domHash, projectId)`
     - `upsertLocatorCache(projectId, { trailId, stepId, cacheKey: key, resolvedSelector, fingerprint, confidence: 1.0, source: 'crystallize' })`
   - `navigate` / `wait` / target-less `assert` steps seed **no** cache row (nothing to resolve).
3. Return `{ trailId, stepIds, cacheKeys }` (cacheKeys aligned to actionable steps).

`methodFor(action)`: `navigate -> 'GET'`, everything else -> `'ACTION'` (method is only a cache-key salt component here; the runner recomputes with the same convention).

DRY: store **only** the `Fingerprint` portion in `trail_steps.target_json` (the resolvedSelector lives in `locator_cache.resolved_selector` — single source of truth for the selector, no duplication). Codegen reads the selector from the trajectory at generation time / from cache at replay time.

### `generatePlaywright(trail, steps, selectors) -> string`  (lib/trails-codegen.ts)

Pure function. `trail: Trail`, `steps: TrailStep[]` (ordered), `selectors: Record<stepId, string>` (resolved selector per actionable step — from cache or trajectory). Emits importable `@playwright/test` code:

- header: `import { test, expect } from '@playwright/test'`
- `test('<trail.name>', async ({ page }) => { ... })`
- first line: `await page.goto('<baseUrl>')`
- per step, by action:
  - `navigate` → `await page.goto('<actionValue>')`
  - `click` → `await page.click('<selector>')`
  - `type` → `await page.fill('<selector>', '<actionValue>')`
  - `select` → `await page.selectOption('<selector>', '<actionValue>')`
  - `wait` → `await page.waitForTimeout(<actionValue|0>)` (placeholder; runner uses condition-waits, but the *exported standalone* file must run on its own)
  - `assert` with checkpoint → `await expect(page.locator('<selector>')).toBeVisible(); // <description>` (selector present) OR `// checkpoint: <description>` as a comment + `expect(true).toBeTruthy()` when no selector (keeps it runnable; description preserved verbatim).
- All string literals single-quote-escaped.

This is the "no lock-in" artifact: a user can copy it into their own repo and run `npx playwright test`.

## Tests (TDD)

`lib/trails-crystallize.test.ts` (hermetic local libsql, mirrors `trails.test.ts`):
- A sample 5-step trajectory (navigate, type email, type password, click submit, assert dashboard-visible-with-target) crystallizes:
  - trail persisted with `authorKind='llm'`, status `draft`, correct baseUrl/intent.
  - `listTrailSteps` returns 5 steps in order, target Fingerprint round-trips (resolvedSelector NOT in target_json), checkpoint round-trips.
  - one `locator_cache` row **per actionable step** (4: 2 type + 1 click + 1 asserting-element), verified via `getCacheForStep` and `getLocatorByKey(cacheKey)`; navigate seeds none.
  - returned `cacheKeys` are 64-hex and match `cacheKey(...)` recomputation.
  - cross-project: `getTrail('other', trailId)` is null.

`lib/trails-codegen.test.ts` (pure, no DB):
- generated string contains `import { test, expect } from '@playwright/test'`, `page.goto('https://app.test/')`, a line per step using the resolved selector (`page.fill('#email', ...)`, `page.click('#submit')`), an `expect(...)` for the checkpoint, and the checkpoint description text.
- single-quotes in values are escaped (no broken JS).

## Out of scope (YAGNI)

No file writing, no `playwright.config` emission, no TypeScript compile/lint of the output, no per-step trace, no healing. Just: trajectory → DB rows + cache + one code string.
