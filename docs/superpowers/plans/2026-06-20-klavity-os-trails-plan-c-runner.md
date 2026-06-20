# Klavity OS — Trails: Layer C (Runner) plan

**Date:** 2026-06-20
**Layer:** C — the smallest runnable end-to-end system (deterministic replay + Tier 1 self-heal, zero LLM).
**Depends on:** Layer A (`lib/trails-types.ts`, `lib/trails.ts`), Layer B (`lib/trails-crystallize.ts`, `lib/trails-codegen.ts`).

## Goal

Walk a crystallized Trail against a real page with a real (Playwright) browser, with **zero LLM**:

- **Tier 0 (cache):** use the cached resolved CSS selector verbatim. If it resolves + is actionable, that's a `cache` tier step.
- **Tier 1 (candidate):** on a cache miss (selector no longer matches), try, in order:
  1. cached selector (already failed → skip)
  2. `role` + accessible-name (Playwright `getByRole({ name })`)
  3. visible `text` (`getByText`)
  4. `data-testid` (`[data-testid="…"]`)
  5. structural `domPath` fingerprint
  First candidate that resolves to exactly-one actionable element wins → `candidate` tier, `healed: true`, and the **healed selector is persisted back to `locator_cache`** (`source: 'heal'`) under the SAME cache key so the next Walk is Tier 0 again.
- **Tier 2 (vision):** NOT built in this layer. If Tier 0 and Tier 1 both fail we record an **AMBER** `run_step` with `tier: 'vision'`, `diagnosis: 'locator_drift'`, `healed: false` — a "needs-vision" marker. **Never fake a heal, never silent-green.**

## Trust guardrails honored (spec §6)

- Confidence-gated: a Tier 1 heal lands at confidence 0.9 (the spec ≥0.9 bar); a clean Tier 0 hit is 1.0.
- Never-override-assertion: a checkpoint (`assert`) that cannot be satisfied is **RED**, never healed away.
- Fail-loud: a genuinely-removed actionable element (all tiers exhausted) is **RED** (queues no silent green). A drift that Tier 1 can't reach but is non-assertive degrades to AMBER (needs-vision), never green.
- Walk verdict = worst step verdict (red > amber > green).

## Cache-key convention (MUST match Layer B exactly — Layer B KEY DEVIATION note)

`method = navigate ? 'GET' : 'ACTION'`;
`domHashComponent = `${trailId}|${step.domHash}#${cachedSelector}``;
`key = cacheKey(method, step.url, domHashComponent, projectId)`.

BUT the runner reads the per-step cache via `getCacheForStep(projectId, stepId)` (DRY: selector lives only in `locator_cache.resolved_selector`, never in `step.target`). When it heals, it re-uses **that row's existing `cacheKey`** for the upsert (ON CONFLICT updates in place), so we never need to recompute the salted key at runtime — we already hold the row. This sidesteps the recompute-convention trap entirely while staying consistent with Layer B.

## Public interface

```ts
interface WalkOptions { fixtureUrl: string; headless?: boolean }
interface WalkSummary {
  runId: string; verdict: Verdict; llmCalls: 0
  steps: { stepId: string; idx: number; tier: Tier; verdict: Verdict; healed: boolean }[]
  healedCount: number
}
async function walkTrail(projectId: string, trailId: string, opts: WalkOptions): Promise<WalkSummary>
```

`fixtureUrl` overrides the trail's `baseUrl` (and any per-step `navigate` to the same origin) so one Trail can be re-walked against the original mockup and a renamed/regressed variant.

## Step execution

`navigate` → `page.goto` (fixtureUrl on first nav). `type` → resolve + `fill`. `click` → resolve + `click`. `select` → resolve + `selectOption`. `assert` → resolve (if a target) + assert visible; checkpoint-only assert (no target) → pass (kept runnable, like codegen). `wait` → condition wait (here: `waitForLoadState`, never a blind sleep per spec §8).

## Resolution detail

Resolver returns `{ tier, selector, confidence, healed }` or throws `ElementGone`.
- Tier 0: `page.locator(cachedSelector)` — if `.count() === 1` and visible → hit.
- Tier 1 candidates built from the step's stored `Fingerprint` (`getCacheForStep().fingerprint` or `step.target`). Each candidate validated the same way (exactly-one + visible). On hit → upsert heal back to cache under the existing key.
- Exhausted → throw → caller records AMBER (needs-vision) for non-assert, RED for assert / for the "element genuinely gone" case where even the fingerprint has no match AND it was actionable. Distinguish: an actionable click/type whose element is gone = RED (can't perform the action — fail-loud); an `assert` whose element is gone = RED.

(The smallest-system rule: a missing actionable element is RED — we cannot perform the user action, so the flow is broken. AMBER-needs-vision is reserved for the case where we *could* see candidates but none cleared the bar — represented here by the vision tier marker. For Layer C's three e2e cases the meaningful outcomes are GREEN / GREEN-healed / RED.)

## Tests (TDD, real Chromium)

`lib/trails-runner.e2e.test.ts`:
1. crystallize checkout trail vs `checkout-mockup.html`, walk → **GREEN**, every step `tier: 'cache'`, `llmCalls: 0`.
2. same trail vs `checkout-mockup-renamed.html` (primary button id/class changed, role+accessible-name preserved) → primary-button step heals **Tier 1 `candidate`** by role+name, Walk still **GREEN**, `llmCalls: 0`, healed selector persisted (`source: 'heal'`).
3. variant with the primary button **removed** → **RED**, never silent green.

Fixtures: `test-fixtures/checkout-mockup.html`, `checkout-mockup-renamed.html`, `checkout-mockup-removed.html` loaded via `file://` URLs.

## Fallback (only if browser blocked)

If Chromium could not launch in the sandbox, degrade to a linkedom/JSDOM resolver unit test of the candidate ladder and report it honestly. (Outcome: it launched — full real-Chromium e2e ran.)
