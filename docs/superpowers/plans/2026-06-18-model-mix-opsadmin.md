# Weighted Model Mix in /opsadmin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an ops admin set a weighted mix of OpenRouter models from `/opsadmin`; every AI call picks a model by weight, logged to the existing `ai_calls` ledger. Ships qwen3-vl live as the majority of the mix.

**Architecture:** Pure helpers (`MODEL_CHOICES`, `pickModel`, form parse/validate, percent display) live in a new `prototype/lib/models.ts` so they're unit-testable without booting the server. Weights persist in the existing `schema_meta` table (no restart needed), cached in-process. `chat()` resolves the model per call via `pickModel`. `/opsadmin` gets a "Model mix" form + an `isOpsAdmin`-gated POST route.

**Tech Stack:** Bun, TypeScript, Turso/libsql, server-rendered HTML (no client framework), `bun:test`.

## Global Constraints

- Runtime is **Bun**; server is `prototype/server.ts` (`Bun.serve`). DB is the `db!` singleton in `prototype/lib/db.ts`. Importing `server.ts` boots the server — so all unit-tested logic lives in importable lib modules, NOT `server.ts`.
- New persistence reuses the existing `schema_meta(key TEXT PRIMARY KEY, value TEXT)` table — key `model_weights`, value = JSON. No new table. Upsert via `INSERT … ON CONFLICT(key) DO UPDATE SET value=excluded.value`.
- Weights are **relative, auto-normalized**; a model at weight 0 is disabled. If no weights / all zero → fall back to `KLAV_MODEL` (the `MODEL` const).
- Mix applies to **all AI calls** (extract, reconcile, react) — i.e. inside `chat()`.
- Model list is a **curated shortlist in code** (`MODEL_CHOICES`); only those ids are valid weight keys (typo-proof).
- `chat()` must log the **actually-picked** model to `ai_calls.model` (not the env default).
- Access: `/opsadmin` GET and the new `POST /opsadmin/model-mix` return **404** (`new Response("Not found",{status:404})`) for non-ops (`!me || !isOpsAdmin(me)`) — never 403.
- **Seed default on first boot only:** if `model_weights` is unset, seed `DEFAULT_WEIGHTS` (qwen3-vl 50 / gemini-2.5-flash 40 / gemini-3.1-flash-lite 10). Never clobber existing weights on redeploy.
- Security: every data value interpolated into HTML goes through `escapeHtml` (already imported in server.ts).
- SemVer lockstep: this release **0.9.0 → 0.10.0** across CHANGELOG top entry, `docs/PRD.md` header, and all 5 manifests (`/package.json`, `packages/core/package.json`, `packages/extension/package.json`, `packages/sdk/package.json`, `packages/extension/manifest.json`).
- `Math.random()`/`Date.now()` are fine here (this is app code, not a workflow script).
- Tests run from `prototype/`: `cd prototype && bun test lib/<file>.test.ts`.

## File Structure

- `prototype/lib/models.ts` — **create**: `MODEL_CHOICES`, `MODEL_CHOICE_IDS`, `DEFAULT_WEIGHTS`, `pickModel`, `parseWeightsForm`, `weightsToPct`. Pure, no I/O.
- `prototype/lib/models.test.ts` — **create**: unit tests for the pure helpers.
- `prototype/lib/db.ts` — **modify**: `getModelWeights`, `setModelWeights` (schema_meta).
- `prototype/lib/model-weights.test.ts` — **create**: hermetic round-trip tests for the db accessors.
- `prototype/server.ts` — **modify**: imports; weights cache + `getActiveWeights`/`refreshWeightsCache`; seed on boot; `chat()` per-call pick; `renderOpsAdmin` "Model mix" panel + CSS; GET `/opsadmin` passes `modelMix`; new `POST /opsadmin/model-mix` route.
- `CHANGELOG.md`, `docs/PRD.md`, 5 manifests — **modify**: 0.10.0 bump.

---

### Task 1: Pure model helpers (`lib/models.ts`)

**Files:**
- Create: `prototype/lib/models.ts`
- Test: `prototype/lib/models.test.ts`

**Interfaces:**
- Produces:
  - `type ModelChoice = { id: string; label: string; price: string }`
  - `MODEL_CHOICES: ModelChoice[]`
  - `MODEL_CHOICE_IDS: string[]`
  - `DEFAULT_WEIGHTS: Record<string, number>`
  - `pickModel(weights: Record<string, number>, choiceIds: string[], fallback: string, rnd: number): string`
  - `parseWeightsForm(raw: Record<string, unknown>, choiceIds: string[]): Record<string, number>`
  - `weightsToPct(weights: Record<string, number>, choiceIds: string[]): Record<string, number>`

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/models.test.ts`:

```ts
import { test, expect } from "bun:test"
import { MODEL_CHOICES, MODEL_CHOICE_IDS, DEFAULT_WEIGHTS, pickModel, parseWeightsForm, weightsToPct } from "./models"

const IDS = MODEL_CHOICE_IDS

test("MODEL_CHOICES: ids unique, include qwen3 + the seeded defaults", () => {
  expect(new Set(IDS).size).toBe(IDS.length)
  expect(IDS).toContain("qwen/qwen3-vl-235b-a22b-instruct")
  for (const id of Object.keys(DEFAULT_WEIGHTS)) expect(IDS).toContain(id)
})

test("pickModel: all-zero / empty weights → fallback", () => {
  expect(pickModel({}, IDS, "fallback/model", 0.5)).toBe("fallback/model")
  expect(pickModel({ [IDS[0]]: 0 }, IDS, "fallback/model", 0.99)).toBe("fallback/model")
})

test("pickModel: single non-zero id is always chosen regardless of rnd", () => {
  const w = { [IDS[0]]: 7 }
  for (const r of [0, 0.25, 0.5, 0.999]) expect(pickModel(w, IDS, "fb", r)).toBe(IDS[0])
})

test("pickModel: weighted buckets by cumulative weight", () => {
  // a=30, b=10 over [a,b] order → rnd<0.75 → a, else b
  const a = IDS[0], b = IDS[1]
  const w = { [a]: 30, [b]: 10 }
  expect(pickModel(w, [a, b], "fb", 0.0)).toBe(a)
  expect(pickModel(w, [a, b], "fb", 0.74)).toBe(a)
  expect(pickModel(w, [a, b], "fb", 0.76)).toBe(b)
  expect(pickModel(w, [a, b], "fb", 0.999)).toBe(b)
})

test("pickModel: ids not in choiceIds are ignored", () => {
  const w = { "evil/unknown": 100, [IDS[0]]: 5 }
  expect(pickModel(w, IDS, "fb", 0.5)).toBe(IDS[0]) // unknown id never selected
})

test("parseWeightsForm: coerces to non-negative ints, drops unknown keys, blanks→0", () => {
  const raw = { [IDS[0]]: "5", [IDS[1]]: "abc", [IDS[2]]: "-3", "evil/x": "99" }
  const out = parseWeightsForm(raw, IDS)
  expect(out[IDS[0]]).toBe(5)
  expect(out[IDS[1]]).toBe(0) // non-numeric → 0
  expect(out[IDS[2]]).toBe(0) // negative → 0
  expect("evil/x" in out).toBe(false) // unknown key not present
  expect(Object.keys(out).sort()).toEqual([...IDS].sort())
})

test("parseWeightsForm: floors fractional input", () => {
  expect(parseWeightsForm({ [IDS[0]]: "4.9" }, IDS)[IDS[0]]).toBe(4)
})

test("weightsToPct: normalizes to integer percents; all-zero → all 0", () => {
  const a = IDS[0], b = IDS[1]
  const pct = weightsToPct({ [a]: 3, [b]: 1 }, [a, b])
  expect(pct[a]).toBe(75)
  expect(pct[b]).toBe(25)
  const zero = weightsToPct({}, [a, b])
  expect(zero[a]).toBe(0)
  expect(zero[b]).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/models.test.ts`
Expected: FAIL — `Cannot find module "./models"` (file not created yet).

- [ ] **Step 3: Write the implementation**

Create `prototype/lib/models.ts`:

```ts
// Curated OpenRouter model shortlist + pure helpers for the /opsadmin weighted model mix.
// No I/O here so it's unit-testable without booting the server. Prices are indicative
// display hints (in/out per 1M tokens) — they are NOT billed, and may drift from OpenRouter.
export type ModelChoice = { id: string; label: string; price: string }

export const MODEL_CHOICES: ModelChoice[] = [
  { id: "qwen/qwen3-vl-235b-a22b-instruct", label: "Qwen3-VL 235B", price: "$0.20 / $0.88" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", price: "$0.30 / $2.50" },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", price: "$0.25 / $1.50" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", price: "$1.00 / $5.00" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", price: "$0.25 / $2.00" },
]

export const MODEL_CHOICE_IDS: string[] = MODEL_CHOICES.map((c) => c.id)

// Seeded on first boot only (see server.ts). qwen3-heavy trial.
export const DEFAULT_WEIGHTS: Record<string, number> = {
  "qwen/qwen3-vl-235b-a22b-instruct": 50,
  "google/gemini-2.5-flash": 40,
  "google/gemini-3.1-flash-lite": 10,
}

// Weighted random pick. rnd ∈ [0,1). Considers only ids in choiceIds with weight > 0.
// Returns fallback when nothing is eligible.
export function pickModel(weights: Record<string, number>, choiceIds: string[], fallback: string, rnd: number): string {
  const entries = choiceIds
    .map((id) => [id, Number(weights[id]) || 0] as const)
    .filter(([, w]) => w > 0)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return fallback
  let r = rnd * total
  for (const [id, w] of entries) { r -= w; if (r < 0) return id }
  return entries[entries.length - 1][0] // float-rounding safety
}

// Validate+coerce raw form values → clean weights: only known ids, non-negative integers (else 0).
export function parseWeightsForm(raw: Record<string, unknown>, choiceIds: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of choiceIds) {
    const v = Math.floor(Number(raw[id]))
    out[id] = Number.isFinite(v) && v > 0 ? v : 0
  }
  return out
}

// Normalized integer percentages for display (sum ≈ 100; all 0 when total is 0).
export function weightsToPct(weights: Record<string, number>, choiceIds: string[]): Record<string, number> {
  const total = choiceIds.reduce((s, id) => s + (Number(weights[id]) || 0), 0)
  const out: Record<string, number> = {}
  for (const id of choiceIds) out[id] = total > 0 ? Math.round(((Number(weights[id]) || 0) / total) * 100) : 0
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/models.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/models.ts prototype/lib/models.test.ts
git commit -m "feat(model-mix): curated model shortlist + pure pick/parse/pct helpers"
```

---

### Task 2: Weights persistence (`getModelWeights` / `setModelWeights`)

**Files:**
- Modify: `prototype/lib/db.ts` (add after the AI-call ledger functions, near the end of the ops section)
- Test: `prototype/lib/model-weights.test.ts`

**Interfaces:**
- Consumes: `db` singleton, `applySchema` (existing).
- Produces:
  - `getModelWeights(): Promise<Record<string, number>>` — reads `schema_meta` key `model_weights`; `{}` if absent/invalid.
  - `setModelWeights(weights: Record<string, number>): Promise<void>` — upserts the JSON.

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/model-weights.test.ts`:

```ts
// Hermetic: point the module's `db` singleton at a fresh LOCAL libsql file before importing ./db.
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-mw-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { db, applySchema, getModelWeights, setModelWeights } = await import("./db")
await applySchema(db!)

test("getModelWeights: empty when unset", async () => {
  expect(await getModelWeights()).toEqual({})
})

test("setModelWeights → getModelWeights round-trip", async () => {
  const w = { "qwen/qwen3-vl-235b-a22b-instruct": 50, "google/gemini-2.5-flash": 40 }
  await setModelWeights(w)
  expect(await getModelWeights()).toEqual(w)
  // upsert overwrites
  await setModelWeights({ "openai/gpt-5-mini": 100 })
  expect(await getModelWeights()).toEqual({ "openai/gpt-5-mini": 100 })
})

test("getModelWeights: invalid JSON in the row → {}", async () => {
  await db!.execute({ sql: "INSERT INTO schema_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: ["model_weights", "not json {"] })
  expect(await getModelWeights()).toEqual({})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/model-weights.test.ts`
Expected: FAIL — `getModelWeights`/`setModelWeights` are not exported from `./db`.

- [ ] **Step 3: Write the implementation**

In `prototype/lib/db.ts`, after the `opsTodaySpend` function (end of the AI-call ledger section added in v0.9.0), add:

```ts
// ── model mix (/opsadmin) ── persisted weighted model selection, stored in schema_meta. ──
export async function getModelWeights(): Promise<Record<string, number>> {
  const r = await db!.execute({ sql: "SELECT value FROM schema_meta WHERE key=?", args: ["model_weights"] })
  if (!r.rows.length) return {}
  try {
    const o = JSON.parse(String((r.rows[0] as any).value))
    return o && typeof o === "object" && !Array.isArray(o) ? o : {}
  } catch { return {} }
}
export async function setModelWeights(weights: Record<string, number>): Promise<void> {
  await db!.execute({
    sql: "INSERT INTO schema_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    args: ["model_weights", JSON.stringify(weights)],
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/model-weights.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/db.ts prototype/lib/model-weights.test.ts
git commit -m "feat(model-mix): persist model weights in schema_meta (get/set accessors)"
```

---

### Task 3: Wire `chat()` to the mix + cache + seed on boot

**Files:**
- Modify: `prototype/server.ts` — db import (`prototype/server.ts:2`); new models import; weights cache helpers + seed (after `await initDb()`, ~`prototype/server.ts:21`); `chat()` per-call pick (`prototype/server.ts:75-109`).

**Interfaces:**
- Consumes: `MODEL_CHOICE_IDS`, `pickModel`, `DEFAULT_WEIGHTS` from `./lib/models`; `getModelWeights`, `setModelWeights` from `./lib/db`.
- Produces (internal): `getActiveWeights(): Promise<Record<string,number>>`, `refreshWeightsCache(): Promise<void>` (used by Task 4's route).

> No new unit test (the pick logic is covered in Task 1; cache/seed are integration). Verify via build smoke (Step 5) + the existing suite.

- [ ] **Step 1: Add the models import**

In `prototype/server.ts`, immediately after the existing `import … from "./lib/connection"` line near the top of the import block (the imports end around `prototype/server.ts:9`), add a new line:

```ts
import { MODEL_CHOICES, MODEL_CHOICE_IDS, DEFAULT_WEIGHTS, pickModel, parseWeightsForm, weightsToPct } from "./lib/models"
```

(`MODEL_CHOICES`, `parseWeightsForm`, `weightsToPct` are used by Task 4 — importing them now is fine.)

- [ ] **Step 2: Add `getModelWeights`/`setModelWeights` to the db import**

In the `import { … } from "./lib/db"` list at `prototype/server.ts:2`, append `getModelWeights, setModelWeights` (alongside the `ops*` functions already imported).

- [ ] **Step 3: Add the weights cache + seed after initDb**

Find `await initDb()` (around `prototype/server.ts:21`). Immediately after it, add:

```ts
// Model mix (/opsadmin): in-process cache of the weighted model selection. Seed the qwen3-heavy
// default on first boot ONLY (never clobber weights set later via the UI).
let weightsCache: Record<string, number> = {}
let weightsCacheAt = 0
async function refreshWeightsCache() { weightsCache = await getModelWeights(); weightsCacheAt = Date.now() }
async function getActiveWeights(): Promise<Record<string, number>> {
  if (Date.now() - weightsCacheAt > 30_000) await refreshWeightsCache()
  return weightsCache
}
if (Object.keys(await getModelWeights()).length === 0) await setModelWeights(DEFAULT_WEIGHTS)
await refreshWeightsCache()
```

- [ ] **Step 4: Resolve the model per call inside `chat()`**

In `chat()`, after the line `const label = ctx?.type || "chat"` (`prototype/server.ts:77`), add:

```ts
  const model = pickModel(await getActiveWeights(), MODEL_CHOICE_IDS, MODEL, Math.random())
```

Then replace the two uses of the env default with `model`:
- In the request body (`prototype/server.ts:85`): change `model: MODEL,` to `model,`.
- In the `recordAiCall({ … })` call (`prototype/server.ts:103`): change `model: MODEL,` to `model,`.

(`MODEL` remains defined and is now the fallback passed into `pickModel`.)

- [ ] **Step 5: Build smoke + suite**

Run: `cd prototype && bun build server.ts --target=bun --outfile=/tmp/klav-build-check.js`
Expected: builds clean (no type/parse/import errors).

Run: `cd prototype && bun test`
Expected: PASS — all existing tests plus Tasks 1–2 tests, no regressions.

- [ ] **Step 6: Commit**

```bash
git add prototype/server.ts
git commit -m "feat(model-mix): chat() picks model per call by weight; cache + first-boot seed"
```

---

### Task 4: `/opsadmin` Model-mix panel + save route

**Files:**
- Modify: `prototype/server.ts` — `renderOpsAdmin` param type (`prototype/server.ts:234-241`), CSS in the `<style>` block (before `</style>`), the panel HTML (after the cards `</div>`, ~`prototype/server.ts:285`); GET `/opsadmin` data (`prototype/server.ts:956-963`); new `POST /opsadmin/model-mix` route (after the GET block, ~`prototype/server.ts:964`).

**Interfaces:**
- Consumes: `MODEL_CHOICES`, `weightsToPct`, `parseWeightsForm`, `MODEL_CHOICE_IDS` from `./lib/models` (imported in Task 3); `getActiveWeights`, `refreshWeightsCache` (Task 3); `setModelWeights` (Task 2 via db import); `isOpsAdmin`, `redirect`, `escapeHtml` (existing).
- Produces: `GET /opsadmin` renders the Model-mix panel; `POST /opsadmin/model-mix` persists weights (404 for non-ops) and redirects back.

> No new unit test (form parse/validate is covered by Task 1's `parseWeightsForm` tests; the route is integration). Verify via build smoke + a live gating smoke (Step 6).

- [ ] **Step 1: Extend the `renderOpsAdmin` parameter type**

In `prototype/server.ts`, in the `renderOpsAdmin(d: { … })` type (ends `prototype/server.ts:240` with `today: number; cap: number; offset: number`), add a `modelMix` field. Change that line to:

```ts
  today: number; cap: number; offset: number
  modelMix: { choices: { id: string; label: string; price: string; weight: number; pct: number }[] }
```

- [ ] **Step 2: Add CSS for inputs/buttons**

In `renderOpsAdmin`'s returned HTML, the `<style>…</style>` block ends with `</style>`. Immediately before that `</style>`, insert:

```css
  input[type=number]{background:#0b0c10;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 6px;width:80px;text-align:right}
  button{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer}
```

- [ ] **Step 3: Add the Model-mix panel**

In the returned HTML, the totals cards block ends with `  </div>` immediately before `  <div class="panel"><h2>Today vs daily cap</h2>` (`prototype/server.ts:286`). Insert this panel between them (i.e. right after the cards `</div>` at line 285, before the "Today vs daily cap" panel):

```ts
  <div class="panel"><h2>Model mix</h2>
    <p class="sub" style="margin:-4px 0 12px">Relative weights — each AI call picks a model at random by weight. Set 0 to disable. Saved live (no redeploy).</p>
    <form method="POST" action="/opsadmin/model-mix">
      <table><thead><tr><th>Model</th><th>Price in/out /Mtok</th><th class="r">Weight</th><th class="r">Share</th></tr></thead><tbody>
      ${d.modelMix.choices.map(c => `<tr><td>${escapeHtml(c.label)}<br><small class="sub">${escapeHtml(c.id)}</small></td><td class="sub">${escapeHtml(c.price)}</td><td class="r"><input type="number" name="${escapeHtml(c.id)}" value="${c.weight}" min="0" step="1"></td><td class="r">${c.pct}%</td></tr>`).join("")}
      </tbody></table>
      <div style="margin-top:12px"><button type="submit">Save mix</button></div>
    </form>
  </div>
```

(Note: this is inside a template literal, so the `${…}` interpolations are evaluated. `c.weight`/`c.pct` are numbers; `c.id`/`c.label`/`c.price` are escaped.)

- [ ] **Step 4: Pass `modelMix` into the GET /opsadmin render**

In the GET `/opsadmin` handler (`prototype/server.ts:956-963`), after the `const [totals, …] = await Promise.all([…])` block and before the `renderOpsAdmin({ … })` call, add:

```ts
      const weights = await getActiveWeights()
      const pct = weightsToPct(weights, MODEL_CHOICE_IDS)
      const modelMix = { choices: MODEL_CHOICES.map(c => ({ id: c.id, label: c.label, price: c.price, weight: Number(weights[c.id]) || 0, pct: pct[c.id] })) }
```

Then add `modelMix` to the `renderOpsAdmin({ … })` argument (change `… cap: OPS_DAILY_CAP_USD, offset }` to `… cap: OPS_DAILY_CAP_USD, offset, modelMix }`).

- [ ] **Step 5: Add the POST save route**

Immediately after the GET `/opsadmin` handler's closing `}` (`prototype/server.ts:964`), add:

```ts
    if (req.method === "POST" && path === "/opsadmin/model-mix") {
      if (!me || !isOpsAdmin(me)) return new Response("Not found", { status: 404 }) // hide route from non-ops
      const form = await req.formData()
      const raw: Record<string, unknown> = {}
      for (const id of MODEL_CHOICE_IDS) raw[id] = form.get(id)
      await setModelWeights(parseWeightsForm(raw, MODEL_CHOICE_IDS))
      await refreshWeightsCache()
      return redirect("/opsadmin")
    }
```

- [ ] **Step 6: Build smoke + live gating smoke**

Run: `cd prototype && bun build server.ts --target=bun --outfile=/tmp/klav-build-check.js`
Expected: clean build.

Live smoke against a LOCAL temp DB (never prod Turso). Run:

```bash
cd prototype
TMPDB="file:$(mktemp -u /tmp/klav-mmsmoke-XXXX.db)"
env -u TURSO_AUTH_TOKEN TURSO_DATABASE_URL="$TMPDB" OPS_ADMIN_EMAILS="vishal@quantana.com.au" PORT=4398 KLAV_BASE_URL="http://localhost:4398" \
  bun run server.ts > /tmp/klav-mmsmoke.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:4398/ && break; sleep 1; done
echo "GET /opsadmin unauth (expect 404): $(curl -s -o /dev/null -w '%{http_code}' http://localhost:4398/opsadmin)"
echo "POST /opsadmin/model-mix unauth (expect 404): $(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:4398/opsadmin/model-mix)"
echo "seeded weights row:"; grep -c model_weights /tmp/klav-mmsmoke.log >/dev/null 2>&1; echo "(boot log:)"; tail -3 /tmp/klav-mmsmoke.log
kill $SRV 2>/dev/null; rm -f /tmp/klav-mmsmoke.log
```

Expected: both routes return `404` unauthenticated; the server boots clean ("Turso connected, schema ready"). (Authenticated render is verified manually post-deploy.)

- [ ] **Step 7: Commit**

```bash
git add prototype/server.ts
git commit -m "feat(model-mix): /opsadmin model-mix panel + POST save route (404-gated)"
```

---

### Task 5: Release 0.10.0 housekeeping

**Files:**
- Modify: `CHANGELOG.md`, `docs/PRD.md`, `package.json`, `packages/core/package.json`, `packages/extension/package.json`, `packages/sdk/package.json`, `packages/extension/manifest.json`

**Interfaces:** none (docs/config only).

- [ ] **Step 1: Bump all 5 manifests 0.9.0 → 0.10.0**

Set `"version": "0.10.0"` in each (each currently has `"version": "0.9.0",`): `package.json`, `packages/core/package.json`, `packages/extension/package.json`, `packages/sdk/package.json`, `packages/extension/manifest.json`.

- [ ] **Step 2: Update PRD header**

In `docs/PRD.md` line 3 (`> **Version:** \`0.9.0\` …`), change `0.9.0` to `0.10.0` (only the version token).

- [ ] **Step 3: Add the CHANGELOG entry**

`CHANGELOG.md` uses a `## [Unreleased]` heading convention. If a `## [Unreleased]` heading exists, rename it to `## [0.10.0] — 2026-06-18` and add the `### Added` block below it (above any existing subsections). If there is NO `## [Unreleased]` heading (because 0.9.0 consumed it), insert a brand-new entry directly below the changelog's intro block and above the `## [0.9.0]` entry:

```markdown
## [0.10.0] — 2026-06-18

### Added
- **Weighted model mix in `/opsadmin`.** Ops admins can set a relative-weight mix
  across a curated OpenRouter shortlist (Qwen3-VL, Gemini 2.5 Flash, Gemini 3.1
  Flash-Lite, Claude Haiku 4.5, GPT-5 mini); every AI call picks a model by weight
  and records it in the `ai_calls` ledger, turning the "By type & model" panel into
  a live A/B comparison. Weights persist in `schema_meta` (no redeploy) and seed a
  qwen3-heavy default (qwen3-vl 50 / gemini-2.5-flash 40 / gemini-3.1-flash-lite 10)
  on first boot. New `POST /opsadmin/model-mix` route, 404-gated like the dashboard.
```

- [ ] **Step 4: Verify suite + build still pass**

Run: `cd prototype && bun test`
Expected: PASS (all suites, incl. Tasks 1–2).

Run: `cd prototype && bun build server.ts --target=bun --outfile=/tmp/klav-build-check.js`
Expected: clean build.

Confirm no manifest still says `0.9.0`.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/PRD.md package.json packages/core/package.json packages/extension/package.json packages/sdk/package.json packages/extension/manifest.json
git commit -m "chore: release 0.10.0 — weighted model mix in /opsadmin"
```

---

## Deployment (after all tasks — follow deploy memory)

1. `git push origin master` (after merge).
2. Deploy on the box, then **explicit restart** (deploy.sh skips it via `su - klav -c`):
   `ssh root@66.135.20.62 "su - klav -c 'bash /opt/klav/deploy/deploy.sh'"` then
   `ssh root@66.135.20.62 'systemctl restart klav'`, then poll `curl 127.0.0.1:4317/` for 200 (~10s boot).
3. No new env var. The qwen3-heavy default seeds itself on first boot (only if unset).
4. Verify: log in as an ops admin → `/opsadmin` shows the Model-mix panel with qwen3 at ~50%; change a weight + Save → redirects back with updated %; trigger a couple of AI actions and confirm `ai_calls` records varying models in "By type & model".

## Self-Review Notes

- **Spec coverage:** all-AI-calls mix ✓ (Task 3 `chat()`); relative weights auto-normalized + 0-disables ✓ (Task 1 `pickModel`/`weightsToPct`); curated shortlist in code ✓ (Task 1); DB persistence via schema_meta, live ✓ (Task 2 + cache Task 3); qwen3-heavy seed first-boot-only ✓ (Task 3); `/opsadmin` panel + POST route 404-gated ✓ (Task 4); logs picked model ✓ (Task 3 Step 4); tests for pickModel/parse/pct/round-trip ✓ (Tasks 1–2); SemVer lockstep ✓ (Task 5). Per-task text-vs-vision split and live catalog fetch correctly excluded (spec out-of-scope).
- **Placeholder scan:** none — all steps carry concrete code/commands.
- **Type consistency:** `pickModel(weights, choiceIds, fallback, rnd)`, `parseWeightsForm(raw, choiceIds)`, `weightsToPct(weights, choiceIds)`, `getModelWeights`/`setModelWeights`, `getActiveWeights`/`refreshWeightsCache`, and the `renderOpsAdmin` `modelMix.choices[{id,label,price,weight,pct}]` shape match across Tasks 1–4.
