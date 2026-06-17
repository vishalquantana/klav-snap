# AI Credit Logging + `/opsadmin` Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every OpenRouter AI call (tokens + real $ cost) and expose the spend in a private server-rendered `/opsadmin` dashboard gated to an env allowlist.

**Architecture:** All AI calls already funnel through one `chat()` function in `prototype/server.ts`. We add `usage:{include:true}` to the OpenRouter request (so the response carries real `cost`), thread an optional `ctx` (`type`/`email`/`projectId`) into `chat()`, and best-effort write one `ai_calls` row per call. A new `/opsadmin` route (404 to non-ops users) renders aggregates read from `prototype/lib/db.ts`.

**Tech Stack:** Bun, TypeScript, Turso/libsql (`@libsql/client`), server-rendered HTML (no client framework). Tests via `bun:test` with a hermetic local libsql file.

## Global Constraints

- Runtime is **Bun**; the server is a single file `prototype/server.ts` using `Bun.serve`. AI calls go through OpenRouter only.
- DB access is the `db!` singleton from `prototype/lib/db.ts`. New tables go in `applySchema` as `CREATE TABLE IF NOT EXISTS` (additive, idempotent — runs on every boot, safe on live Turso). Never drop/rename existing tables.
- `db!.execute` takes either a SQL string or `{ sql, args }`. Timestamps are epoch **milliseconds** (`Date.now()`).
- Logging must be **best-effort**: a logging failure must never throw into a user request path.
- Access control for `/opsadmin`: env var `OPS_ADMIN_EMAILS` (comma-separated). Non-ops users (incl. logged-out and regular project admins) get **404**, never 403.
- Display-only daily cap env: `OPS_DAILY_CAP_USD` (default `50`). The real cap is enforced by OpenRouter on the key; we do not enforce it.
- Secrets (real keys) live only in gitignored `prototype/.env` — never in committed files. The committed example is `deploy/klav.env.example`.
- SemVer lockstep (project rule): every release moves `CHANGELOG.md` top entry, `docs/PRD.md`, and all 5 manifests (`/package.json`, `packages/core/package.json`, `packages/extension/package.json`, `packages/extension/manifest.json`, `packages/sdk/package.json`) together. This feature: **0.8.1 → 0.9.0**.
- Tests run from the `prototype/` dir, e.g. `cd prototype && bun test lib/<file>.test.ts`.

## File Structure

- `prototype/lib/db.ts` — **modify**: add `ai_calls` table + indexes to `applySchema`; add `AiCallInsert`/`AiCallRow` types, `recordAiCall` writer, and read aggregates (`opsTotals`, `opsDaily`, `opsByProject`, `opsByTypeModel`, `opsRecentCalls`, `opsTodaySpend`).
- `prototype/lib/ai-credits.test.ts` — **create**: hermetic db tests for the writer + aggregates.
- `prototype/lib/auth.ts` — **modify**: add `isOpsAdmin(email)`.
- `prototype/lib/auth.test.ts` — **create**: unit tests for `isOpsAdmin`.
- `prototype/server.ts` — **modify**: `chat()` usage flag + `ctx` + best-effort logging; thread `ctx` through `extractPersonas`/`reactToPage`/`reconcileSim` and their routes; `OPS_DAILY_CAP_USD` const; imports; `/opsadmin` route + `renderOpsAdmin()` HTML helper.
- `deploy/klav.env.example` — **modify**: document `OPS_ADMIN_EMAILS` + `OPS_DAILY_CAP_USD`.
- `CHANGELOG.md`, `docs/PRD.md`, 5 manifests — **modify**: version bump 0.8.1 → 0.9.0.

(`prototype/.env` already updated out-of-band with the new key, `OPS_ADMIN_EMAILS`, and `OPS_DAILY_CAP_USD` — not part of these tasks, not committed.)

---

### Task 1: `ai_calls` schema + writer + read aggregates

**Files:**
- Modify: `prototype/lib/db.ts` (schema block ends `prototype/lib/db.ts:191`; add helpers after `dashboardCounts`, ~`prototype/lib/db.ts:715`)
- Test: `prototype/lib/ai-credits.test.ts`

**Interfaces:**
- Consumes: `db` singleton, `applySchema(c)` from `./db` (existing).
- Produces:
  - `recordAiCall(a: AiCallInsert): Promise<void>`
  - `opsTotals(): Promise<{ totalCost: number; totalInputTokens: number; totalOutputTokens: number; callCount: number }>`
  - `opsDaily(days?: number): Promise<{ day: string; cost: number; calls: number }[]>` (newest day first)
  - `opsByProject(): Promise<{ projectId: string|null; projectName: string|null; cost: number; calls: number }[]>` (cost desc)
  - `opsByTypeModel(): Promise<{ type: string; model: string; cost: number; calls: number }[]>` (cost desc)
  - `opsRecentCalls(limit?: number, offset?: number): Promise<AiCallRow[]>` (newest first)
  - `opsTodaySpend(): Promise<number>`
  - Types `AiCallInsert` and `AiCallRow` (shapes below).

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/ai-credits.test.ts`:

```ts
// AI-credit logging: writer + ops-dashboard aggregates. Hermetic — point the module's `db`
// singleton at a fresh LOCAL libsql file by setting TURSO_DATABASE_URL *before* importing ./db.
// Bun shares one module registry across test files, so global SUMs (opsTotals/opsTodaySpend) are
// asserted as deltas over a baseline, and group-by reads are filtered to this run's unique
// model/project ids — never assume the ai_calls table is empty.
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-aicredits-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const {
  db, applySchema, recordAiCall,
  opsTotals, opsDaily, opsByProject, opsByTypeModel, opsRecentCalls, opsTodaySpend,
} = await import("./db")

await applySchema(db!)

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const MODEL = `test-model-${RUN}`
const P = (s: string) => `proj_${s}_${RUN}`

test("recordAiCall + opsTotals: sums cost/tokens/count (delta over baseline)", async () => {
  const base = await opsTotals()
  await recordAiCall({ type: "extract", model: MODEL, actorEmail: "a@x.com", projectId: P("a"), inputTokens: 100, outputTokens: 50, costUsd: 0.01 })
  await recordAiCall({ type: "react", model: MODEL, actorEmail: "b@x.com", projectId: P("b"), inputTokens: 200, outputTokens: 80, costUsd: 0.02 })
  const t = await opsTotals()
  expect(t.callCount - base.callCount).toBe(2)
  expect(t.totalInputTokens - base.totalInputTokens).toBe(300)
  expect(t.totalOutputTokens - base.totalOutputTokens).toBe(130)
  expect(Number((t.totalCost - base.totalCost).toFixed(4))).toBe(0.03)
})

test("opsByProject: groups by project, sorted by cost desc, counts calls", async () => {
  const rows = (await opsByProject()).filter(r => r.projectId === P("a") || r.projectId === P("b"))
  expect(rows.map(r => r.projectId)).toEqual([P("b"), P("a")]) // b (0.02) before a (0.01)
  expect(rows.find(r => r.projectId === P("a"))!.calls).toBe(1)
})

test("opsByTypeModel: groups by (type, model)", async () => {
  const rows = (await opsByTypeModel()).filter(r => r.model === MODEL)
  expect(rows.length).toBe(2)
  expect(rows.map(r => r.type).sort()).toEqual(["extract", "react"])
})

test("opsRecentCalls: newest first, our rows present, nullable fields preserved", async () => {
  const rows = (await opsRecentCalls(200, 0)).filter(r => r.model === MODEL)
  expect(rows.length).toBe(2)
  expect(rows[0].type).toBe("react") // inserted second → newest first
  expect(rows[0].costUsd).toBe(0.02)
  expect(rows[0].ok).toBe(true)
})

test("opsTodaySpend + opsDaily: today's spend reflects inserts", async () => {
  expect(await opsTodaySpend()).toBeGreaterThanOrEqual(0.03)
  const daily = await opsDaily(30)
  expect(daily.length).toBeGreaterThan(0)
  expect(typeof daily[0].day).toBe("string")
})

test("recordAiCall: nullable cost/tokens stored as null, ok defaults true", async () => {
  await recordAiCall({ type: "persona", model: MODEL, actorEmail: null, projectId: null })
  const row = (await opsRecentCalls(1, 0))[0]
  expect(row.type).toBe("persona")
  expect(row.costUsd).toBeNull()
  expect(row.inputTokens).toBeNull()
  expect(row.ok).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/ai-credits.test.ts`
Expected: FAIL — `recordAiCall`/`opsTotals`/etc. are `undefined` (not exported), or `no such table: ai_calls`.

- [ ] **Step 3: Add the table to `applySchema`**

In `prototype/lib/db.ts`, inside the `stmts` array in `applySchema`, immediately **before** the closing `]` at `prototype/lib/db.ts:191` (i.e. right after the `ext_tok_email_idx` index line), add:

```ts
    // AI-CALL LEDGER — one row per OpenRouter call for the /opsadmin credit dashboard. Additive,
    // idempotent. cost_usd comes from OpenRouter's usage.cost (real credit $); null if absent.
    `CREATE TABLE IF NOT EXISTS ai_calls (
       id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, type TEXT NOT NULL, model TEXT NOT NULL,
       actor_email TEXT, project_id TEXT, input_tokens INTEGER, output_tokens INTEGER,
       cost_usd REAL, ok INTEGER NOT NULL DEFAULT 1)`,
    `CREATE INDEX IF NOT EXISTS ai_calls_created_idx ON ai_calls (created_at)`,
    `CREATE INDEX IF NOT EXISTS ai_calls_proj_idx ON ai_calls (project_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS ai_calls_type_idx ON ai_calls (type, created_at)`,
```

- [ ] **Step 4: Add the writer + aggregates**

In `prototype/lib/db.ts`, after the `dashboardCounts` function (ends ~`prototype/lib/db.ts:715`), add:

```ts
// ── AI-call ledger (/opsadmin) ── one row per OpenRouter call; reads are global (not project-scoped).
export type AiCallInsert = {
  type: string; model: string; actorEmail?: string | null; projectId?: string | null
  inputTokens?: number | null; outputTokens?: number | null; costUsd?: number | null; ok?: boolean
}
export type AiCallRow = {
  id: string; createdAt: number; type: string; model: string
  actorEmail: string | null; projectId: string | null
  inputTokens: number | null; outputTokens: number | null; costUsd: number | null; ok: boolean
}

export async function recordAiCall(a: AiCallInsert): Promise<void> {
  const id = "ai_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO ai_calls (id,created_at,type,model,actor_email,project_id,input_tokens,output_tokens,cost_usd,ok)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [id, Date.now(), a.type, a.model, a.actorEmail ?? null, a.projectId ?? null,
           a.inputTokens ?? null, a.outputTokens ?? null, a.costUsd ?? null, a.ok === false ? 0 : 1],
  })
}

export async function opsTotals(): Promise<{ totalCost: number; totalInputTokens: number; totalOutputTokens: number; callCount: number }> {
  const r = await db!.execute(
    `SELECT COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(input_tokens),0) AS inp,
            COALESCE(SUM(output_tokens),0) AS outp, COUNT(*) AS n FROM ai_calls`)
  const x = r.rows[0] as any
  return { totalCost: Number(x.cost), totalInputTokens: Number(x.inp), totalOutputTokens: Number(x.outp), callCount: Number(x.n) }
}

export async function opsDaily(days = 30): Promise<{ day: string; cost: number; calls: number }[]> {
  const sinceMs = Date.now() - days * 86400000
  const r = await db!.execute({
    sql: `SELECT date(created_at/1000,'unixepoch') AS day, COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS calls
          FROM ai_calls WHERE created_at >= ? GROUP BY day ORDER BY day DESC`,
    args: [sinceMs],
  })
  return r.rows.map((x: any) => ({ day: String(x.day), cost: Number(x.cost), calls: Number(x.calls) }))
}

export async function opsByProject(): Promise<{ projectId: string | null; projectName: string | null; cost: number; calls: number }[]> {
  const r = await db!.execute(
    `SELECT a.project_id AS pid, p.name AS name, COALESCE(SUM(a.cost_usd),0) AS cost, COUNT(*) AS calls
     FROM ai_calls a LEFT JOIN projects p ON p.id = a.project_id
     GROUP BY a.project_id ORDER BY cost DESC`)
  return r.rows.map((x: any) => ({
    projectId: x.pid != null ? String(x.pid) : null,
    projectName: x.name != null ? String(x.name) : null,
    cost: Number(x.cost), calls: Number(x.calls),
  }))
}

export async function opsByTypeModel(): Promise<{ type: string; model: string; cost: number; calls: number }[]> {
  const r = await db!.execute(
    `SELECT type, model, COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS calls
     FROM ai_calls GROUP BY type, model ORDER BY cost DESC`)
  return r.rows.map((x: any) => ({ type: String(x.type), model: String(x.model), cost: Number(x.cost), calls: Number(x.calls) }))
}

function rowToAiCall(x: any): AiCallRow {
  return {
    id: String(x.id), createdAt: Number(x.created_at), type: String(x.type), model: String(x.model),
    actorEmail: x.actor_email != null ? String(x.actor_email) : null,
    projectId: x.project_id != null ? String(x.project_id) : null,
    inputTokens: x.input_tokens != null ? Number(x.input_tokens) : null,
    outputTokens: x.output_tokens != null ? Number(x.output_tokens) : null,
    costUsd: x.cost_usd != null ? Number(x.cost_usd) : null,
    ok: Number(x.ok) === 1,
  }
}
export async function opsRecentCalls(limit = 50, offset = 0): Promise<AiCallRow[]> {
  const r = await db!.execute({ sql: `SELECT * FROM ai_calls ORDER BY created_at DESC LIMIT ? OFFSET ?`, args: [limit, offset] })
  return r.rows.map(rowToAiCall)
}

export async function opsTodaySpend(): Promise<number> {
  const r = await db!.execute(
    `SELECT COALESCE(SUM(cost_usd),0) AS cost FROM ai_calls WHERE date(created_at/1000,'unixepoch') = date('now')`)
  return Number((r.rows[0] as any).cost)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd prototype && bun test lib/ai-credits.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add prototype/lib/db.ts prototype/lib/ai-credits.test.ts
git commit -m "feat(opsadmin): ai_calls ledger table + writer + spend aggregates"
```

---

### Task 2: `isOpsAdmin` access helper

**Files:**
- Modify: `prototype/lib/auth.ts` (add after `emailAllowed`, ~`prototype/lib/auth.ts:24`)
- Test: `prototype/lib/auth.test.ts`

**Interfaces:**
- Produces: `isOpsAdmin(email: string | null | undefined): boolean` — true iff `email` (case-insensitive) is in the `OPS_ADMIN_EMAILS` comma list. Empty/unset list ⇒ always false (fail closed).

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/auth.test.ts`:

```ts
import { test, expect } from "bun:test"
import { isOpsAdmin } from "./auth"

test("isOpsAdmin: allowlist membership is case-insensitive, trims spaces", () => {
  process.env.OPS_ADMIN_EMAILS = "vishal@quantana.com.au, dev2@quantana.com.au"
  expect(isOpsAdmin("vishal@quantana.com.au")).toBe(true)
  expect(isOpsAdmin("VISHAL@Quantana.com.AU")).toBe(true)
  expect(isOpsAdmin("dev2@quantana.com.au")).toBe(true)
  expect(isOpsAdmin("random@quantana.com.au")).toBe(false)
  expect(isOpsAdmin(null)).toBe(false)
  expect(isOpsAdmin(undefined)).toBe(false)
  expect(isOpsAdmin("")).toBe(false)
})

test("isOpsAdmin: empty/unset list → nobody is ops admin (fail closed)", () => {
  process.env.OPS_ADMIN_EMAILS = ""
  expect(isOpsAdmin("vishal@quantana.com.au")).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/auth.test.ts`
Expected: FAIL — `isOpsAdmin` is not exported from `./auth`.

- [ ] **Step 3: Implement `isOpsAdmin`**

In `prototype/lib/auth.ts`, after the `emailAllowed` function (ends `prototype/lib/auth.ts:24`), add:

```ts
// Ops super-admin allowlist for /opsadmin. Distinct from project/account roles. Fail closed:
// an empty or unset OPS_ADMIN_EMAILS means nobody qualifies.
export function isOpsAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const list = (process.env.OPS_ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/auth.ts prototype/lib/auth.test.ts
git commit -m "feat(opsadmin): isOpsAdmin env-allowlist helper"
```

---

### Task 3: Capture every AI call — `chat()` cost + ctx + best-effort logging

**Files:**
- Modify: `prototype/server.ts` — imports (`prototype/server.ts:2` and `:5`); `chat()` (`prototype/server.ts:74-85`); `extractPersonas` (`:103-106`); `reactToPage` (`:107-116`); `reconcileSim` (`:122`); call sites in `/api/transcripts` (`:770`, `:795`), `/api/persona/brief` (`:1192`), `/api/extract` (`:1202`), `/api/react` (`:1210`).

**Interfaces:**
- Consumes: `recordAiCall` from `./lib/db` (Task 1).
- Produces (internal): `chat(messages, maxTokens, jsonMode?, ctx?)` where `ctx?: { type: string; email?: string | null; projectId?: string | null }`; wrappers `extractPersonas(transcript, ctx?)`, `reactToPage(persona, imageB64, mediaType, pageUrl, ctx?)`, `reconcileSim(currentTraits, transcript, ctx?)` with `ctx?: { email?: string | null; projectId?: string | null }`.

> No new automated test in this task — `chat()` performs a live `fetch` to OpenRouter that cannot be unit-tested hermetically. The writer it calls is covered by Task 1; this task's deliverable is verified by Step 6 (typecheck + boot) and the manual smoke in Task 5.

- [ ] **Step 1: Add `recordAiCall` to the db import**

In `prototype/server.ts:2`, the import from `"./lib/db"` is one long list. Add `recordAiCall` to it (e.g. immediately after `screenshotById`):

```ts
// …, reviewGate, reviewDedupeKey, reviewDay, screenshotById, recordAiCall } from "./lib/db"
```

- [ ] **Step 2: Add `isOpsAdmin` to the auth import**

`prototype/server.ts:5` currently reads:

```ts
import { token, otp, emailAllowed, cookie, clearCookie, parseCookies } from "./lib/auth"
```

Change to:

```ts
import { token, otp, emailAllowed, cookie, clearCookie, parseCookies, isOpsAdmin } from "./lib/auth"
```

- [ ] **Step 3: Add the `OPS_DAILY_CAP_USD` constant**

After `prototype/server.ts:17` (the `ENDPOINT` const), add:

```ts
const OPS_DAILY_CAP_USD = Number(process.env.OPS_DAILY_CAP_USD || 50)
```

- [ ] **Step 4: Update `chat()` to request cost + log best-effort**

Replace the whole `chat` function body at `prototype/server.ts:74-85` with:

```ts
async function chat(messages: any[], maxTokens: number, jsonMode = false, ctx?: { type: string; email?: string | null; projectId?: string | null }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json", "HTTP-Referer": BASE, "X-Title": "Klavity" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages, usage: { include: true }, ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data: any = await res.json()
  const content: string = data?.choices?.[0]?.message?.content ?? ""
  const u = data?.usage || {}
  // Best-effort credit ledger — never let a logging failure break the request.
  if (ctx) {
    try {
      await recordAiCall({
        type: ctx.type, model: MODEL, actorEmail: ctx.email ?? null, projectId: ctx.projectId ?? null,
        inputTokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
        outputTokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
        costUsd: typeof u.cost === "number" ? u.cost : null,
      })
    } catch (e: any) { console.error("recordAiCall failed:", e?.message || e) }
  }
  return { content, usage: { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens } }
}
```

- [ ] **Step 5: Thread `ctx` through the three wrappers**

In `prototype/server.ts`, update the wrapper signatures + their `chat(...)` calls:

`extractPersonas` (`:103-106`):
```ts
async function extractPersonas(transcript: string, ctx?: { email?: string | null; projectId?: string | null }) {
  const { content, usage } = await chat([{ role: "system", content: EXTRACT_SYS }, { role: "user", content: "TRANSCRIPT:\n\n" + transcript }], 4000, false, { type: "extract", ...ctx })
  return { data: parseJSON(content), usage }
}
```

`reactToPage` (`:107-116`):
```ts
async function reactToPage(persona: any, imageB64: string, mediaType: string, pageUrl: string, ctx?: { email?: string | null; projectId?: string | null }) {
  const { content, usage } = await chat([
    { role: "system", content: REACT_SYS },
    { role: "user", content: [
      { type: "text", text: "You are this persona:\n" + JSON.stringify(persona, null, 2) + `\n\nReact to this screenshot of ${pageUrl || "(unknown URL)"}.` },
      { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageB64}` } },
    ] },
  ], 2500, false, { type: "react", ...ctx })
  return { data: parseJSON(content), usage }
}
```

`reconcileSim` (`:122-129`) — update the signature at `:122`:
```ts
async function reconcileSim(currentTraits: Trait[], transcript: string, ctx?: { email?: string | null; projectId?: string | null }) {
```
and change the `chat(...)` call's closing line at `prototype/server.ts:129` from:
```ts
  ], 3000)
```
to:
```ts
  ], 3000, false, { type: "reconcile", ...ctx })
```

- [ ] **Step 6: Pass real context at each call site**

`/api/transcripts` — extract (`prototype/server.ts:770`):
```ts
        const { data: extractData, usage: extractUsage } = await extractPersonas(text, { email: meT, projectId })
```
`/api/transcripts` — reconcile (`prototype/server.ts:795`):
```ts
          const { ops, usage } = await reconcileSim(current, text, { email: meT, projectId })
```

`/api/persona/brief` (`prototype/server.ts:1186-1196`) — resolve a best-effort email and pass `persona` ctx. Replace the `chat(...)` line at `:1192` with:
```ts
          const meB = (await sessionEmail(req)) || (await bearerEmail(req))
          const { content, usage } = await chat([{ role: "system", content: sys }, { role: "user", content: "Brief: " + brief }], 1200, true, { type: "persona", email: meB })
```

`/api/extract` (`prototype/server.ts:1198-1205`) — resolve email, pass ctx. Replace the `extractPersonas(transcript)` call at `:1202` block so it reads:
```ts
          const meE = (await sessionEmail(req)) || (await bearerEmail(req))
          const { data, usage } = await extractPersonas(transcript, { email: meE })
```

`/api/react` (`prototype/server.ts:1206-1223`) — resolve email, pass ctx. Replace the `reactToPage(...)` call at `:1210` so it reads:
```ts
          const meRx = (await sessionEmail(req)) || (await bearerEmail(req))
          const { data, usage } = await reactToPage(persona, imageB64, mediaType || "image/png", pageUrl || "", { email: meRx })
```

- [ ] **Step 7: Typecheck + boot smoke**

Run: `cd prototype && bun build server.ts --target=bun --outfile=/tmp/klav-build-check.js`
Expected: builds with no type/parse errors. (This catches signature/import mistakes without needing live OpenRouter.)

- [ ] **Step 8: Commit**

```bash
git add prototype/server.ts
git commit -m "feat(opsadmin): log every AI call (real cost + ctx) via chat() chokepoint"
```

---

### Task 4: `/opsadmin` route + dashboard HTML

**Files:**
- Modify: `prototype/server.ts` — db import (`:2`, add aggregate fns); add `renderOpsAdmin()` helper (near the other top-level helpers, e.g. after `redirect()` at `prototype/server.ts:~119`); add the route right after `prototype/server.ts:861` (`const me = await sessionEmail(req)`), beside the `/dashboard` route at `:864`.

**Interfaces:**
- Consumes: `opsTotals`, `opsDaily`, `opsByProject`, `opsByTypeModel`, `opsRecentCalls`, `opsTodaySpend` from `./lib/db` (Task 1); `isOpsAdmin` (Task 2); `OPS_DAILY_CAP_USD` (Task 3); `escapeHtml` from `./lib/feedback` (already imported at `prototype/server.ts:7`).
- Produces: `GET /opsadmin` → 404 for non-ops; 200 `text/html` for ops admins. Supports `?offset=<n>` for recent-calls paging.

- [ ] **Step 1: Add aggregate functions to the db import**

In `prototype/server.ts:2`, append to the `"./lib/db"` import list: `opsTotals, opsDaily, opsByProject, opsByTypeModel, opsRecentCalls, opsTodaySpend` (alongside `recordAiCall` from Task 3).

- [ ] **Step 2: Add the `renderOpsAdmin` HTML helper**

In `prototype/server.ts`, after the `redirect(...)` helper (~`prototype/server.ts:119`), add:

```ts
function fmtUsd(n: number): string { return "$" + (Number(n) || 0).toFixed(4) }
function renderOpsAdmin(d: {
  totals: { totalCost: number; totalInputTokens: number; totalOutputTokens: number; callCount: number }
  daily: { day: string; cost: number; calls: number }[]
  byProject: { projectId: string | null; projectName: string | null; cost: number; calls: number }[]
  byTypeModel: { type: string; model: string; cost: number; calls: number }[]
  recent: { id: string; createdAt: number; type: string; model: string; actorEmail: string | null; projectId: string | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; ok: boolean }[]
  today: number; cap: number; offset: number
}): string {
  const maxDaily = Math.max(0.0001, ...d.daily.map(x => x.cost))
  const bars = d.daily.slice().reverse().map(x => {
    const h = Math.round((x.cost / maxDaily) * 100)
    return `<div class="bar" title="${escapeHtml(x.day)} · ${fmtUsd(x.cost)} · ${x.calls} calls"><i style="height:${h}%"></i><small>${escapeHtml(x.day.slice(5))}</small></div>`
  }).join("")
  const projRows = d.byProject.map(p =>
    `<tr><td>${escapeHtml(p.projectName || p.projectId || "—")}</td><td class="r">${fmtUsd(p.cost)}</td><td class="r">${p.calls}</td></tr>`).join("") || `<tr><td colspan="3">No data</td></tr>`
  const tmRows = d.byTypeModel.map(t =>
    `<tr><td>${escapeHtml(t.type)}</td><td>${escapeHtml(t.model)}</td><td class="r">${fmtUsd(t.cost)}</td><td class="r">${t.calls}</td></tr>`).join("") || `<tr><td colspan="4">No data</td></tr>`
  const recRows = d.recent.map(c => {
    const when = new Date(c.createdAt).toISOString().replace("T", " ").slice(0, 19)
    return `<tr><td>${escapeHtml(when)}</td><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.actorEmail || "—")}</td><td>${escapeHtml(c.projectId || "—")}</td><td class="r">${c.inputTokens ?? "—"}/${c.outputTokens ?? "—"}</td><td class="r">${c.costUsd != null ? fmtUsd(c.costUsd) : "—"}</td></tr>`
  }).join("") || `<tr><td colspan="6">No calls yet</td></tr>`
  const prev = d.offset > 0 ? `<a href="/opsadmin?offset=${Math.max(0, d.offset - 50)}">← newer</a>` : ""
  const next = d.recent.length === 50 ? `<a href="/opsadmin?offset=${d.offset + 50}">older →</a>` : ""
  const todayPct = Math.min(100, Math.round((d.today / Math.max(0.0001, d.cap)) * 100))
  return `<!doctype html><html><head><meta charset="utf-8"><title>Klavity Ops — AI credits</title>
<style>
  :root{--bg:#0b0c10;--card:#15171e;--ink:#e8eaf0;--mut:#9aa3b2;--line:#262a35;--accent:#6366f1}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
  .wrap{max-width:1040px;margin:0 auto;padding:32px 20px}
  h1{font-size:20px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 24px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
  .card b{display:block;font-size:22px}.card span{color:var(--mut);font-size:12px}
  .panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:20px}
  .panel h2{font-size:14px;margin:0 0 12px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
  th{color:var(--mut);font-weight:600}.r{text-align:right;font-variant-numeric:tabular-nums}
  .chart{display:flex;align-items:flex-end;gap:4px;height:140px}
  .bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
  .bar i{display:block;width:70%;background:var(--accent);border-radius:3px 3px 0 0;min-height:2px}
  .bar small{color:var(--mut);font-size:9px;margin-top:4px;transform:rotate(-45deg);white-space:nowrap}
  .meter{height:8px;background:var(--line);border-radius:4px;overflow:hidden;margin-top:8px}
  .meter i{display:block;height:100%;background:var(--accent)}
  .pager{margin-top:10px;display:flex;gap:16px}.pager a{color:var(--accent);text-decoration:none}
</style></head><body><div class="wrap">
  <h1>AI credits — Ops</h1><p class="sub">Every OpenRouter call, with real credit cost. Private to ops admins.</p>
  <div class="cards">
    <div class="card"><b>${fmtUsd(d.totals.totalCost)}</b><span>Total spend</span></div>
    <div class="card"><b>${d.totals.callCount}</b><span>Total calls</span></div>
    <div class="card"><b>${d.totals.totalInputTokens.toLocaleString()}</b><span>Input tokens</span></div>
    <div class="card"><b>${d.totals.totalOutputTokens.toLocaleString()}</b><span>Output tokens</span></div>
  </div>
  <div class="panel"><h2>Today vs daily cap</h2>
    <div>${fmtUsd(d.today)} <span style="color:var(--mut)">/ ${fmtUsd(d.cap)} (${todayPct}%)</span></div>
    <div class="meter"><i style="width:${todayPct}%"></i></div>
    <p class="sub" style="margin:8px 0 0">Display only — the hard cap is enforced by OpenRouter on the API key.</p>
  </div>
  <div class="panel"><h2>Daily spend (30d)</h2><div class="chart">${bars || '<span class="sub">No data</span>'}</div></div>
  <div class="panel"><h2>By project</h2><table><thead><tr><th>Project</th><th class="r">Cost</th><th class="r">Calls</th></tr></thead><tbody>${projRows}</tbody></table></div>
  <div class="panel"><h2>By type &amp; model</h2><table><thead><tr><th>Type</th><th>Model</th><th class="r">Cost</th><th class="r">Calls</th></tr></thead><tbody>${tmRows}</tbody></table></div>
  <div class="panel"><h2>Recent calls</h2><table><thead><tr><th>When (UTC)</th><th>Type</th><th>Actor</th><th>Project</th><th class="r">In/Out tok</th><th class="r">Cost</th></tr></thead><tbody>${recRows}</tbody></table>
    <div class="pager">${prev}${next}</div>
  </div>
</div></body></html>`
}
```

- [ ] **Step 3: Add the route**

In `prototype/server.ts`, immediately after the `/dashboard` route at `prototype/server.ts:864`, add:

```ts
    if (req.method === "GET" && path === "/opsadmin") {
      if (!me || !isOpsAdmin(me)) return new Response("Not found", { status: 404 }) // hide route from non-ops
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0)
      const [totals, daily, byProject, byTypeModel, recent, today] = await Promise.all([
        opsTotals(), opsDaily(30), opsByProject(), opsByTypeModel(), opsRecentCalls(50, offset), opsTodaySpend(),
      ])
      const html = renderOpsAdmin({ totals, daily, byProject, byTypeModel, recent, today, cap: OPS_DAILY_CAP_USD, offset })
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
    }
```

- [ ] **Step 4: Typecheck + build smoke**

Run: `cd prototype && bun build server.ts --target=bun --outfile=/tmp/klav-build-check.js`
Expected: builds with no errors.

- [ ] **Step 5: Manual route-gating verification**

Start the server: `cd prototype && bun run server.ts` (uses local `.env`; `OPS_ADMIN_EMAILS` already set there). In another shell:
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4317/opsadmin` → expect `404` (no session).
- Log in via the app as `vishal@quantana.com.au` (dev OTP is shown — `KLAV_DEV_SHOW_OTP=1`), then visit `http://localhost:4317/opsadmin` in the browser → expect the dashboard renders (totals may be zero until an AI call runs).

Expected: 404 unauthenticated; 200 + dashboard for the ops session.

- [ ] **Step 6: Commit**

```bash
git add prototype/server.ts
git commit -m "feat(opsadmin): /opsadmin AI-credits dashboard (404-gated to ops allowlist)"
```

---

### Task 5: Housekeeping — env example, CHANGELOG, PRD, version bump, smoke

**Files:**
- Modify: `deploy/klav.env.example`
- Modify: `CHANGELOG.md`, `docs/PRD.md`
- Modify: `package.json`, `packages/core/package.json`, `packages/extension/package.json`, `packages/extension/manifest.json`, `packages/sdk/package.json`

**Interfaces:** none (docs/config only).

- [ ] **Step 1: Document the new env vars in the example file**

Read `deploy/klav.env.example`, then append (match the file's existing `KEY=value` style; do **not** include any real key):

```
# /opsadmin super-admin dashboard — comma-separated allowlist of ops emails
OPS_ADMIN_EMAILS=
# Daily AI spend ceiling shown on /opsadmin (display only; OpenRouter enforces the real cap)
OPS_DAILY_CAP_USD=50
```

- [ ] **Step 2: Bump all 5 manifests 0.8.1 → 0.9.0**

Set `"version": "0.9.0"` in each of: `package.json`, `packages/core/package.json`, `packages/extension/package.json`, `packages/extension/manifest.json`, `packages/sdk/package.json`. (Use Edit per file; the field is `"version": "0.8.1"` in each.)

- [ ] **Step 3: Update PRD version**

In `docs/PRD.md`, update the version reference to `0.9.0` (find the current `0.8.1` version marker near the top / Versioning section and set it to `0.9.0`).

- [ ] **Step 4: Add the CHANGELOG entry**

In `CHANGELOG.md`, add a new top entry under the title block (above the previous latest version), dated today:

```markdown
## [0.9.0] — 2026-06-18

### Added
- **AI credit logging + `/opsadmin` dashboard.** Every OpenRouter call is now
  recorded (model, real credit cost via `usage.include`, token counts, actor,
  project) in a new `ai_calls` ledger. A private, server-rendered `/opsadmin`
  page (gated to the `OPS_ADMIN_EMAILS` allowlist; 404 to everyone else) shows
  total spend, a 30-day daily-spend chart, today-vs-cap (`OPS_DAILY_CAP_USD`),
  per-project and per-type/model breakdowns, and a recent-calls log.
```

- [ ] **Step 5: Verify the whole suite + build still pass**

Run: `cd prototype && bun test`
Expected: PASS — including the new `ai-credits.test.ts` and `auth.test.ts`, with no regressions.

Run: `cd prototype && bun build server.ts --target=bun --outfile=/tmp/klav-build-check.js`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add deploy/klav.env.example CHANGELOG.md docs/PRD.md package.json packages/core/package.json packages/extension/package.json packages/extension/manifest.json packages/sdk/package.json
git commit -m "chore: release 0.9.0 — opsadmin AI credit dashboard (env example, changelog, manifests)"
```

---

## Deployment (after all tasks merged — follow deploy memory)

1. Set `OPS_ADMIN_EMAILS=vishal@quantana.com.au,dev2@quantana.com.au` (and optionally `OPS_DAILY_CAP_USD=50`) in the production env on the Vultr box (66.135.20.62) — these are NOT in the committed example with values.
2. `git push` master → `ssh` to the box → pull → `systemctl restart klav.service`.
3. The `ai_calls` table is created automatically on boot via `applySchema` (idempotent).
4. Verify: log in as an ops admin at `https://klavity.quantana.top/opsadmin` and confirm the dashboard loads; trigger one AI action and confirm a row + cost appears.

## Self-Review Notes

- **Spec coverage:** capture in `chat()` ✓ (Task 3); real $ via `usage.include` ✓ (Task 3 Step 4); `ai_calls` schema + indexes ✓ (Task 1); aggregates for all four dashboard views + today-vs-cap ✓ (Task 1, Task 4); env allowlist + 404 gating ✓ (Task 2, Task 4); env example + cap var ✓ (Task 5); SemVer lockstep ✓ (Task 5); tests ✓ (Tasks 1–2). Failed-call logging intentionally out of scope (spec: `ok` reserved; `chat()` throws before logging on non-OK).
- **Placeholder scan:** none — every code/step is concrete.
- **Type consistency:** `recordAiCall`/`AiCallInsert`/`AiCallRow`, the six `ops*` aggregate signatures, `isOpsAdmin`, `chat(..., ctx)`, and the wrapper `ctx` shapes match across Tasks 1–4 and the `renderOpsAdmin` parameter type.
