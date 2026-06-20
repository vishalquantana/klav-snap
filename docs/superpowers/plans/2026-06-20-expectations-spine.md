# Expectations Spine + Graduation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the discover→enforce loop: a unified `expectations` record that collapses Snap reports + Sim findings + AutoSim findings into one issue identity, auto-validates on cross-source corroboration, and graduates a human-confirmed, LLM-drafted assertion into a deterministic Trail `assert` step.

**Architecture:** A new `expectations` table *references* existing source rows (it does not copy them). Ingest call sites (feedback + findings) funnel through one `upsertExpectation` that dedup-collapses via the shipped `lib/dedup.ts`. A pure `lib/expectations.ts` module owns corroboration + lifecycle (candidate→validated→enforced→retired). Graduation makes one `assert-gen` LLM call to draft a *visible-assert on a target*, a human confirms it, and it's written as a normal `trail_steps` row that the existing zero-LLM runner enforces (failed assert → RED).

**Tech Stack:** Bun + TypeScript, libsql/Turso (`db!.execute`), OpenRouter via the existing `chat()` helper, `vitest` for tests, server route block in `prototype/server.ts`.

## Global Constraints

- Bun-only runtime; tests run via `bun test` (vitest). No new deps.
- Never `git add -A` — stage only files named in each task (concurrent sessions share the checkout).
- All new tables use `CREATE TABLE IF NOT EXISTS` appended to the `stmts` array in `applySchema` (`lib/db.ts`, applied by `for (const s of stmts) await c.execute(s)` at ~`db.ts:344`). Additive only; never drop.
- All API routes are project-scoped and reuse the existing auth helpers (`sessionEmail`/`bearerEmail` + `resolveProject`) and `json()` responder, placed in the static/`/api` route block **before** the generic gate, mirroring existing Sim/Trails routes.
- The single graduation LLM call uses the existing `chat(messages, maxTokens, jsonMode, { type: 'assert-gen', email, projectId })` so the `ai_calls` ledger + daily cap apply.
- "Enforced" assertions in this slice are **visible-assert on a target only** (the capability the runner already supports at `trails-runner.ts:458`). Checkpoint kinds `textPresent`/`noConsoleError` are OUT OF SCOPE (need runner work).
- Corroboration matching uses the shipped lexical+exact matcher (`lib/dedup.ts`: `issueKeyFor`, `lexicalSim`). Embedding matching is OUT OF SCOPE; log near-misses.
- Default recurrence-validate threshold `N = 3`, exported as a named constant.

---

### Task 1: `expectations` table schema

**Files:**
- Modify: `prototype/lib/db.ts` (append one CREATE statement to the `stmts` array in `applySchema`, near the other Trails tables ~`db.ts:240-330`)
- Test: `prototype/lib/expectations-schema.test.ts`

**Interfaces:**
- Produces: an `expectations` table with columns `id, project_id, title, area, url_path, status, source_refs_json, corroboration_json, dedup_key, enforced_step_id, created_at, updated_at` and indexes on `(project_id, status)` and `(project_id, dedup_key)`.

- [ ] **Step 1: Write the failing test**

```ts
// prototype/lib/expectations-schema.test.ts
import { test, expect } from "bun:test"
import { createClient } from "@libsql/client"
import { applySchema } from "./db"

test("expectations table exists with expected columns", async () => {
  const c = createClient({ url: "file::memory:" })
  await applySchema(c)
  const cols = await c.execute("PRAGMA table_info(expectations)")
  const names = cols.rows.map((r: any) => r.name).sort()
  expect(names).toEqual(
    ["area","corroboration_json","created_at","dedup_key","enforced_step_id","id","project_id","source_refs_json","status","title","updated_at","url_path"].sort()
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/expectations-schema.test.ts`
Expected: FAIL — `no such table: expectations` (and confirm `applySchema` is exported; if not, export it).

- [ ] **Step 3: Add the CREATE statement to the `stmts` array in `applySchema`**

```ts
    // ── Expectations spine (discover→enforce): unifies Snap/Sim/AutoSim findings into one issue identity. ──
    `CREATE TABLE IF NOT EXISTS expectations (
       id TEXT PRIMARY KEY,
       project_id TEXT NOT NULL,
       title TEXT NOT NULL,
       area TEXT,
       url_path TEXT,
       status TEXT NOT NULL DEFAULT 'candidate',     -- candidate | validated | enforced | retired
       source_refs_json TEXT NOT NULL DEFAULT '[]',  -- [{kind:'snap'|'sim'|'finding', id}]
       corroboration_json TEXT NOT NULL DEFAULT '{}',-- {snap:bool, sim:bool, recurrence:int}
       dedup_key TEXT NOT NULL,
       enforced_step_id TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS exp_proj_status_idx ON expectations(project_id, status)`,
    `CREATE INDEX IF NOT EXISTS exp_proj_dedup_idx ON expectations(project_id, dedup_key)`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/expectations-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/db.ts prototype/lib/expectations-schema.test.ts
git commit -m "feat(expectations): add expectations spine table"
```

---

### Task 2: Pure corroboration + lifecycle module

**Files:**
- Create: `prototype/lib/expectations.ts`
- Test: `prototype/lib/expectations.test.ts`

**Interfaces:**
- Consumes: `lexicalSim`, `issueKeyFor` from `./dedup`.
- Produces:
  - `type SourceKind = 'snap' | 'sim' | 'finding'`
  - `type SourceRef = { kind: SourceKind; id: string }`
  - `type Corroboration = { snap: boolean; sim: boolean; recurrence: number }`
  - `type ExpStatus = 'candidate' | 'validated' | 'enforced' | 'retired'`
  - `const RECURRENCE_VALIDATE_N = 3`
  - `mergeSource(c: Corroboration, kind: SourceKind): Corroboration` — sets the source flag true and bumps `recurrence`.
  - `shouldValidate(c: Corroboration, n?: number): boolean` — true iff `(c.snap && c.sim) || c.recurrence >= n`.
  - `nextStatus(current: ExpStatus, c: Corroboration, n?: number): ExpStatus` — `candidate`→`validated` when `shouldValidate`; otherwise unchanged (never auto-demotes; `enforced`/`retired` are terminal here).
  - `matchExpectation(cand: {title:string}, existing: Array<{id:string;title:string}>, threshold?: number): string | null` — returns the best existing id with `lexicalSim(title) >= threshold` (default 0.82), else null.

- [ ] **Step 1: Write the failing tests**

```ts
// prototype/lib/expectations.test.ts
import { test, expect } from "bun:test"
import { mergeSource, shouldValidate, nextStatus, matchExpectation, RECURRENCE_VALIDATE_N } from "./expectations"

test("mergeSource sets the flag and bumps recurrence", () => {
  const c0 = { snap: false, sim: false, recurrence: 0 }
  const c1 = mergeSource(c0, "snap")
  expect(c1).toEqual({ snap: true, sim: false, recurrence: 1 })
  const c2 = mergeSource(c1, "sim")
  expect(c2).toEqual({ snap: true, sim: true, recurrence: 2 })
})

test("shouldValidate: cross-source agreement OR recurrence>=N", () => {
  expect(shouldValidate({ snap: true, sim: true, recurrence: 1 })).toBe(true)
  expect(shouldValidate({ snap: true, sim: false, recurrence: 1 })).toBe(false)
  expect(shouldValidate({ snap: false, sim: true, recurrence: RECURRENCE_VALIDATE_N })).toBe(true)
})

test("nextStatus promotes candidate only; enforced is terminal", () => {
  expect(nextStatus("candidate", { snap: true, sim: true, recurrence: 2 })).toBe("validated")
  expect(nextStatus("candidate", { snap: true, sim: false, recurrence: 1 })).toBe("candidate")
  expect(nextStatus("enforced", { snap: true, sim: true, recurrence: 9 })).toBe("enforced")
})

test("matchExpectation finds a lexical near-duplicate, else null", () => {
  const existing = [{ id: "e1", title: "Finish button missing on onboarding" }]
  expect(matchExpectation({ title: "finish button is missing on the onboarding screen" }, existing)).toBe("e1")
  expect(matchExpectation({ title: "Payment gateway integration request" }, existing)).toBe(null)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd prototype && bun test lib/expectations.test.ts`
Expected: FAIL — cannot find module `./expectations`.

- [ ] **Step 3: Implement `lib/expectations.ts`**

```ts
// prototype/lib/expectations.ts
// Pure (DB-free) corroboration + lifecycle for the expectations spine.
import { lexicalSim } from "./dedup"

export type SourceKind = "snap" | "sim" | "finding"
export type SourceRef = { kind: SourceKind; id: string }
export type Corroboration = { snap: boolean; sim: boolean; recurrence: number }
export type ExpStatus = "candidate" | "validated" | "enforced" | "retired"

export const RECURRENCE_VALIDATE_N = 3

export function mergeSource(c: Corroboration, kind: SourceKind): Corroboration {
  return {
    snap: c.snap || kind === "snap",
    sim: c.sim || kind === "sim",
    recurrence: (c.recurrence ?? 0) + 1,
  }
}

export function shouldValidate(c: Corroboration, n: number = RECURRENCE_VALIDATE_N): boolean {
  return (c.snap && c.sim) || c.recurrence >= n
}

export function nextStatus(current: ExpStatus, c: Corroboration, n: number = RECURRENCE_VALIDATE_N): ExpStatus {
  if (current === "candidate" && shouldValidate(c, n)) return "validated"
  return current
}

export function matchExpectation(
  cand: { title: string },
  existing: Array<{ id: string; title: string }>,
  threshold = 0.82,
): string | null {
  let best: { id: string | null; score: number } = { id: null, score: 0 }
  for (const e of existing) {
    const score = lexicalSim(cand.title, e.title)
    if (score > best.score) best = { id: e.id, score }
  }
  return best.score >= threshold ? best.id : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd prototype && bun test lib/expectations.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/expectations.ts prototype/lib/expectations.test.ts
git commit -m "feat(expectations): pure corroboration + lifecycle module"
```

---

### Task 3: Expectations DB layer (`upsertExpectation` + reads)

**Files:**
- Create: `prototype/lib/expectations-db.ts`
- Test: `prototype/lib/expectations-db.test.ts`

**Interfaces:**
- Consumes: `applySchema` (test), the pure module from Task 2, a libsql `Client`.
- Produces (all take an explicit `Client` as first arg so they're testable against `file::memory:`):
  - `type ExpectationRow = { id:string; projectId:string; title:string; area:string|null; urlPath:string|null; status:ExpStatus; sourceRefs:SourceRef[]; corroboration:Corroboration; dedupKey:string; enforcedStepId:string|null; createdAt:number; updatedAt:number }`
  - `upsertExpectation(c, input: { projectId:string; title:string; area?:string|null; urlPath?:string|null; dedupKey:string; source:SourceRef }): Promise<ExpectationRow>` — collapses onto an existing row (exact `dedup_key` match first, then `matchExpectation` over same-project titles); merges the source, recomputes status via `nextStatus`, writes, and returns the row. Creates a new `candidate` row if no match.
  - `getExpectation(c, id:string): Promise<ExpectationRow | null>`
  - `listExpectations(c, projectId:string, status?:ExpStatus): Promise<ExpectationRow[]>`
  - `setExpectationEnforced(c, id:string, enforcedStepId:string): Promise<void>` — sets status='enforced', enforced_step_id.
  - `setExpectationStatus(c, id:string, status:ExpStatus): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// prototype/lib/expectations-db.test.ts
import { test, expect } from "bun:test"
import { createClient } from "@libsql/client"
import { applySchema } from "./db"
import { upsertExpectation, listExpectations, getExpectation, setExpectationEnforced } from "./expectations-db"

async function fresh() { const c = createClient({ url: "file::memory:" }); await applySchema(c); return c }

test("first source creates a candidate", async () => {
  const c = await fresh()
  const e = await upsertExpectation(c, { projectId: "p1", title: "Finish button missing", urlPath: "/onboarding", dedupKey: "k1", source: { kind: "sim", id: "fb_1" } })
  expect(e.status).toBe("candidate")
  expect(e.corroboration).toEqual({ snap: false, sim: true, recurrence: 1 })
  expect(e.sourceRefs).toEqual([{ kind: "sim", id: "fb_1" }])
})

test("snap + sim on same dedup_key collapses and auto-validates", async () => {
  const c = await fresh()
  await upsertExpectation(c, { projectId: "p1", title: "Finish button missing", dedupKey: "k1", source: { kind: "sim", id: "fb_1" } })
  const e = await upsertExpectation(c, { projectId: "p1", title: "Finish button missing", dedupKey: "k1", source: { kind: "snap", id: "fb_2" } })
  expect(e.status).toBe("validated")
  expect(e.corroboration).toEqual({ snap: true, sim: true, recurrence: 2 })
  expect((await listExpectations(c, "p1")).length).toBe(1) // collapsed, not duplicated
})

test("lexical near-duplicate collapses even with a different dedup_key", async () => {
  const c = await fresh()
  await upsertExpectation(c, { projectId: "p1", title: "Finish button missing on onboarding", dedupKey: "k1", source: { kind: "sim", id: "s1" } })
  const e = await upsertExpectation(c, { projectId: "p1", title: "the finish button is missing on the onboarding screen", dedupKey: "k2", source: { kind: "snap", id: "s2" } })
  expect((await listExpectations(c, "p1")).length).toBe(1)
  expect(e.status).toBe("validated")
})

test("setExpectationEnforced flips status + records step", async () => {
  const c = await fresh()
  const e = await upsertExpectation(c, { projectId: "p1", title: "x", dedupKey: "k1", source: { kind: "snap", id: "s1" } })
  await setExpectationEnforced(c, e.id, "ts_99")
  const got = await getExpectation(c, e.id)
  expect(got!.status).toBe("enforced")
  expect(got!.enforcedStepId).toBe("ts_99")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd prototype && bun test lib/expectations-db.test.ts`
Expected: FAIL — cannot find module `./expectations-db`.

- [ ] **Step 3: Implement `lib/expectations-db.ts`**

```ts
// prototype/lib/expectations-db.ts
import type { Client } from "@libsql/client"
import { mergeSource, nextStatus, matchExpectation,
  type SourceRef, type Corroboration, type ExpStatus } from "./expectations"

export type ExpectationRow = {
  id: string; projectId: string; title: string; area: string | null; urlPath: string | null
  status: ExpStatus; sourceRefs: SourceRef[]; corroboration: Corroboration
  dedupKey: string; enforcedStepId: string | null; createdAt: number; updatedAt: number
}

function rowTo(x: any): ExpectationRow {
  return {
    id: x.id, projectId: x.project_id, title: x.title, area: x.area ?? null, urlPath: x.url_path ?? null,
    status: x.status, sourceRefs: JSON.parse(x.source_refs_json || "[]"),
    corroboration: JSON.parse(x.corroboration_json || "{}"),
    dedupKey: x.dedup_key, enforcedStepId: x.enforced_step_id ?? null,
    createdAt: Number(x.created_at), updatedAt: Number(x.updated_at),
  }
}

export async function getExpectation(c: Client, id: string): Promise<ExpectationRow | null> {
  const r = await c.execute({ sql: "SELECT * FROM expectations WHERE id=?", args: [id] })
  return r.rows.length ? rowTo(r.rows[0]) : null
}

export async function listExpectations(c: Client, projectId: string, status?: ExpStatus): Promise<ExpectationRow[]> {
  const r = status
    ? await c.execute({ sql: "SELECT * FROM expectations WHERE project_id=? AND status=? ORDER BY updated_at DESC", args: [projectId, status] })
    : await c.execute({ sql: "SELECT * FROM expectations WHERE project_id=? ORDER BY updated_at DESC", args: [projectId] })
  return r.rows.map(rowTo)
}

export async function upsertExpectation(c: Client, input: {
  projectId: string; title: string; area?: string | null; urlPath?: string | null; dedupKey: string; source: SourceRef
}): Promise<ExpectationRow> {
  const now = Date.now()
  // 1) exact dedup_key match in-project
  const exact = await c.execute({ sql: "SELECT * FROM expectations WHERE project_id=? AND dedup_key=? LIMIT 1", args: [input.projectId, input.dedupKey] })
  let existing: ExpectationRow | null = exact.rows.length ? rowTo(exact.rows[0]) : null
  // 2) else lexical near-duplicate over same-project titles
  if (!existing) {
    const all = await listExpectations(c, input.projectId)
    const matchId = matchExpectation({ title: input.title }, all.map((e) => ({ id: e.id, title: e.title })))
    if (matchId) existing = all.find((e) => e.id === matchId) ?? null
  }
  if (existing) {
    const corr = mergeSource(existing.corroboration, input.source.kind)
    const refs = [...existing.sourceRefs, input.source]
    const status = nextStatus(existing.status, corr)
    await c.execute({
      sql: "UPDATE expectations SET corroboration_json=?, source_refs_json=?, status=?, updated_at=? WHERE id=?",
      args: [JSON.stringify(corr), JSON.stringify(refs), status, now, existing.id],
    })
    return (await getExpectation(c, existing.id))!
  }
  const id = "exp_" + crypto.randomUUID()
  const corr = mergeSource({ snap: false, sim: false, recurrence: 0 }, input.source.kind)
  const status = nextStatus("candidate", corr)
  await c.execute({
    sql: `INSERT INTO expectations (id,project_id,title,area,url_path,status,source_refs_json,corroboration_json,dedup_key,enforced_step_id,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, input.projectId, input.title, input.area ?? null, input.urlPath ?? null, status,
           JSON.stringify([input.source]), JSON.stringify(corr), input.dedupKey, null, now, now],
  })
  return (await getExpectation(c, id))!
}

export async function setExpectationStatus(c: Client, id: string, status: ExpStatus): Promise<void> {
  await c.execute({ sql: "UPDATE expectations SET status=?, updated_at=? WHERE id=?", args: [status, Date.now(), id] })
}

export async function setExpectationEnforced(c: Client, id: string, enforcedStepId: string): Promise<void> {
  await c.execute({ sql: "UPDATE expectations SET status='enforced', enforced_step_id=?, updated_at=? WHERE id=?", args: [enforcedStepId, Date.now(), id] })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd prototype && bun test lib/expectations-db.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/expectations-db.ts prototype/lib/expectations-db.test.ts
git commit -m "feat(expectations): db layer with dedup-collapse upsert"
```

---

### Task 4: Funnel ingest sources into expectations

**Files:**
- Modify: `prototype/server.ts` (after the two `insertFeedback(...)` call sites ~`server.ts:1060` and `~1530`)
- Modify: `prototype/lib/trails.ts` (end of `recordFinding`, ~`trails.ts:192-225`)
- Create: `prototype/lib/expectations-ingest.ts` (thin helper that derives title/dedupKey/source and calls `upsertExpectation` against the module `db` client; best-effort, never throws into the caller)
- Test: `prototype/lib/expectations-ingest.test.ts`

**Interfaces:**
- Consumes: `upsertExpectation` (Task 3), `issueKeyFor` from `./dedup`.
- Produces:
  - `ingestSnapOrSim(c, args: { projectId:string; feedbackId:string; isSnap:boolean; title:string; urlPath?:string|null; area?:string|null; issueType?:string|null; citedTraitIds?:string[] }): Promise<void>` — `kind` is `'snap'` when `isSnap` else `'sim'`; `dedupKey = issueKeyFor({projectId, urlPath, issueType, citedTraitIds})`.
  - `ingestFinding(c, args: { projectId:string; findingId:string; title:string; dedupKey:string; urlPath?:string|null }): Promise<void>` — `kind:'finding'`.
  - Both wrap the body in try/catch and swallow errors (ingest must never break the primary write).

- [ ] **Step 1: Write the failing test**

```ts
// prototype/lib/expectations-ingest.test.ts
import { test, expect } from "bun:test"
import { createClient } from "@libsql/client"
import { applySchema } from "./db"
import { ingestSnapOrSim } from "./expectations-ingest"
import { listExpectations } from "./expectations-db"

test("a Sim then a Snap on the same screen+issue auto-validate one expectation", async () => {
  const c = createClient({ url: "file::memory:" }); await applySchema(c)
  await ingestSnapOrSim(c, { projectId: "p1", feedbackId: "fb_a", isSnap: false, title: "Finish button missing", urlPath: "/onboarding", issueType: "label-copy", citedTraitIds: ["t1"] })
  await ingestSnapOrSim(c, { projectId: "p1", feedbackId: "fb_b", isSnap: true,  title: "Finish button missing", urlPath: "/onboarding", issueType: "label-copy", citedTraitIds: ["t1"] })
  const list = await listExpectations(c, "p1")
  expect(list.length).toBe(1)
  expect(list[0].status).toBe("validated")
})

test("ingest never throws on a bad client", async () => {
  // @ts-expect-error intentionally broken client
  await ingestSnapOrSim(null, { projectId: "p1", feedbackId: "x", isSnap: true, title: "t" })
  expect(true).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/expectations-ingest.test.ts`
Expected: FAIL — cannot find module `./expectations-ingest`.

- [ ] **Step 3: Implement `lib/expectations-ingest.ts`**

```ts
// prototype/lib/expectations-ingest.ts
import type { Client } from "@libsql/client"
import { issueKeyFor } from "./dedup"
import { upsertExpectation } from "./expectations-db"

export async function ingestSnapOrSim(c: Client, args: {
  projectId: string; feedbackId: string; isSnap: boolean; title: string
  urlPath?: string | null; area?: string | null; issueType?: string | null; citedTraitIds?: string[]
}): Promise<void> {
  try {
    const dedupKey = issueKeyFor({
      projectId: args.projectId, urlPath: args.urlPath ?? "", issueType: args.issueType ?? null,
      citedTraitIds: args.citedTraitIds ?? [],
    })
    await upsertExpectation(c, {
      projectId: args.projectId, title: args.title, area: args.area ?? null, urlPath: args.urlPath ?? null,
      dedupKey, source: { kind: args.isSnap ? "snap" : "sim", id: args.feedbackId },
    })
  } catch (e) { console.warn("[expectations] ingestSnapOrSim skipped:", String(e)) }
}

export async function ingestFinding(c: Client, args: {
  projectId: string; findingId: string; title: string; dedupKey: string; urlPath?: string | null
}): Promise<void> {
  try {
    await upsertExpectation(c, {
      projectId: args.projectId, title: args.title, urlPath: args.urlPath ?? null,
      dedupKey: args.dedupKey, source: { kind: "finding", id: args.findingId },
    })
  } catch (e) { console.warn("[expectations] ingestFinding skipped:", String(e)) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/expectations-ingest.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire the call sites (best-effort, after the primary write)**

In `prototype/server.ts`, immediately after each `insertFeedback({...})` returns `feedbackId` (~lines 1060 and 1530), add (import `ingestSnapOrSim` from `./lib/expectations-ingest` and the module `db` at top of file if not already in scope):

```ts
// after feedbackId is assigned; reuse the same title/url/issueType already in scope for the feedback row
if (db && feedbackId) {
  await ingestSnapOrSim(db, {
    projectId: proj.id, feedbackId,
    isSnap: /* true at the widget/snap site (1530), false at the Sim react site (1060) */ IS_SNAP,
    title: (suggestedBug?.title ?? observation ?? "").slice(0, 200),
    urlPath: urlPath ?? null, issueType: issueType ?? null,
    citedTraitIds: Array.isArray(citedTraitIds) ? citedTraitIds.map(String) : [],
  })
}
```

In `prototype/lib/trails.ts`, at the end of `recordFinding` (after the row is inserted, before returning), add:

```ts
// best-effort spine ingest: an AutoSim finding is also a discovery source
try {
  const { ingestFinding } = await import("./expectations-ingest")
  await ingestFinding(db!, { projectId, findingId: id, title, dedupKey, urlPath: null })
} catch (e) { console.warn("[expectations] recordFinding ingest skipped:", String(e)) }
```

- [ ] **Step 6: Run the full suite**

Run: `cd prototype && bun test`
Expected: all pass (existing + new). If a feedback/trails test now also writes an expectation, that's additive and should not break assertions on existing tables.

- [ ] **Step 7: Commit**

```bash
git add prototype/lib/expectations-ingest.ts prototype/lib/expectations-ingest.test.ts prototype/server.ts prototype/lib/trails.ts
git commit -m "feat(expectations): funnel snap/sim/finding ingest into the spine"
```

---

### Task 5: Graduation — `ASSERT_SYS` + draft assertion

**Files:**
- Modify: `prototype/server.ts` (add `ASSERT_SYS` near the other prompts ~`server.ts:72-105`; add `draftAssertion()` near `extractPersonas`/`reactToPage` ~`server.ts:250-275`)
- Create: `prototype/lib/assertion-spec.ts` (pure validator/normalizer for the drafted spec)
- Test: `prototype/lib/assertion-spec.test.ts`

**Interfaces:**
- Produces:
  - `type AssertionDraft = { trailId: string; afterStepIdx: number; action: "assert"; target: { role?: string; name?: string; text?: string; selector?: string }; checkpoint: { kind: "visible"; description: string } }`
  - `validateAssertionDraft(x: unknown): AssertionDraft | null` — returns the normalized draft if it has a non-empty `target` (at least one of role/name/text/selector) and `checkpoint.kind === "visible"`; else null.
  - (server-side) `draftAssertion(expectation, trailSteps, ctx): Promise<{ draft: AssertionDraft | null; usage: any }>` calling `chat([...], 800, true, { type: 'assert-gen', ...ctx })`.

- [ ] **Step 1: Write the failing test (pure validator)**

```ts
// prototype/lib/assertion-spec.test.ts
import { test, expect } from "bun:test"
import { validateAssertionDraft } from "./assertion-spec"

test("accepts a visible-assert with a target", () => {
  const d = validateAssertionDraft({ trailId: "trl_1", afterStepIdx: 2, action: "assert",
    target: { role: "button", name: "Finish" }, checkpoint: { kind: "visible", description: "Finish button is visible" } })
  expect(d).not.toBeNull()
  expect(d!.target.name).toBe("Finish")
})

test("rejects empty target or non-visible checkpoint", () => {
  expect(validateAssertionDraft({ trailId: "t", afterStepIdx: 0, action: "assert", target: {}, checkpoint: { kind: "visible", description: "x" } })).toBeNull()
  expect(validateAssertionDraft({ trailId: "t", afterStepIdx: 0, action: "assert", target: { text: "Finish" }, checkpoint: { kind: "textPresent", description: "x" } })).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/assertion-spec.test.ts`
Expected: FAIL — cannot find module `./assertion-spec`.

- [ ] **Step 3: Implement `lib/assertion-spec.ts`**

```ts
// prototype/lib/assertion-spec.ts
export type AssertionDraft = {
  trailId: string; afterStepIdx: number; action: "assert"
  target: { role?: string; name?: string; text?: string; selector?: string }
  checkpoint: { kind: "visible"; description: string }
}

export function validateAssertionDraft(x: unknown): AssertionDraft | null {
  if (!x || typeof x !== "object") return null
  const o = x as any
  if (typeof o.trailId !== "string" || !o.trailId) return null
  if (typeof o.afterStepIdx !== "number" || o.afterStepIdx < 0) return null
  if (o.action !== "assert") return null
  const t = o.target
  if (!t || typeof t !== "object") return null
  const target: AssertionDraft["target"] = {}
  for (const k of ["role", "name", "text", "selector"] as const) if (typeof t[k] === "string" && t[k]) target[k] = t[k]
  if (Object.keys(target).length === 0) return null
  if (!o.checkpoint || o.checkpoint.kind !== "visible") return null
  return { trailId: o.trailId, afterStepIdx: o.afterStepIdx, action: "assert", target,
    checkpoint: { kind: "visible", description: String(o.checkpoint.description ?? "").slice(0, 240) } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/assertion-spec.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add `ASSERT_SYS` + `draftAssertion` in `server.ts`**

Add the prompt near the other `*_SYS` constants:

```ts
const ASSERT_SYS =
  "You convert a VALIDATED product issue into ONE deterministic UI assertion for an existing end-to-end Trail. " +
  "The only supported checkpoint is that a target element must be VISIBLE on the page. " +
  "Pick the Trail step (afterStepIdx) AFTER which the assertion should run, and describe the target by role+accessible-name " +
  "(preferred), visible text, or a CSS selector (last resort). Be specific to the issue's screen.\n\n" +
  "Respond with ONLY a JSON object in exactly this shape:\n" +
  '{"trailId":string,"afterStepIdx":number,"action":"assert","target":{"role"?:string,"name"?:string,"text"?:string,"selector"?:string},' +
  '"checkpoint":{"kind":"visible","description":string}}'
```

Add the helper near `reactToPage`:

```ts
async function draftAssertion(expectation: any, trail: any, steps: any[], ctx?: { email?: string|null; projectId?: string|null }) {
  const { content, usage } = await chat([
    { role: "system", content: ASSERT_SYS },
    { role: "user", content:
      "VALIDATED ISSUE:\n" + JSON.stringify({ title: expectation.title, area: expectation.area, urlPath: expectation.urlPath }, null, 2) +
      "\n\nTARGET TRAIL:\n" + JSON.stringify({ id: trail.id, name: trail.name, baseUrl: trail.base_url }, null, 2) +
      "\n\nTRAIL STEPS (idx, action, target):\n" + JSON.stringify(steps.map((s) => ({ idx: s.idx, action: s.action, target: s.target })), null, 0) },
  ], 800, true, { type: "assert-gen", ...ctx })
  return { content, usage }
}
```

- [ ] **Step 6: Run the suite**

Run: `cd prototype && bun test lib/assertion-spec.test.ts`
Expected: PASS. (The server helper is exercised in Task 6's endpoint test.)

- [ ] **Step 7: Commit**

```bash
git add prototype/lib/assertion-spec.ts prototype/lib/assertion-spec.test.ts prototype/server.ts
git commit -m "feat(expectations): ASSERT_SYS + assertion draft validator"
```

---

### Task 6: Graduation endpoints + Trail assert-step writer

**Files:**
- Modify: `prototype/lib/trails.ts` (add `insertAssertStep` if no public step-insert exists; reuse the INSERT at `trails.ts:58`)
- Modify: `prototype/server.ts` (add four routes in the project-scoped block, before the generic `/api` gate)
- Test: `prototype/server.expectations.test.ts` (mirror the existing `server.trails.test.ts` harness: spin the app against `file::memory:`)

**Interfaces:**
- Consumes: `listExpectations`/`getExpectation`/`setExpectationEnforced` (Task 3), `draftAssertion`+`validateAssertionDraft` (Task 5), `listTrailSteps` + the new `insertAssertStep`.
- Produces (HTTP):
  - `GET /api/expectations?project=&status=` → `{ expectations: ExpectationRow[] }`
  - `POST /api/expectations/:id/enforce` body `{ trailId? }` → `{ draft: AssertionDraft | null }` (LLM draft only; persists nothing)
  - `POST /api/expectations/:id/enforce/confirm` body `{ draft: AssertionDraft }` → `{ stepId }` (writes the assert step, marks enforced)
  - `POST /api/expectations/:id/retire` → `{ ok: true }`
  - `insertAssertStep(projectId, trailId, afterStepIdx, target, description): Promise<string>` (returns new step id; `action='assert'`, `target_json=JSON.stringify(target)`, `checkpoint_json=JSON.stringify({kind:'visible',description})`, `idx=afterStepIdx+1`).

- [ ] **Step 1: Write the failing endpoint test**

```ts
// prototype/server.expectations.test.ts  (follow server.trails.test.ts boot pattern: import the app handler, seed via rawExec)
import { test, expect } from "bun:test"
// ... reuse the same harness helpers as server.trails.test.ts (app(), rawExec(), PROJECT_ID, auth header) ...

test("validated expectation enforce/confirm writes an assert step and flips status", async () => {
  // seed: a trail + one step, and a validated expectation (snap+sim) via two ingest calls or rawExec
  // 1) GET /api/expectations?status=validated returns the expectation
  // 2) POST /enforce returns a draft (stub chat to return a fixed JSON in test mode, or assert draft!==undefined)
  // 3) POST /enforce/confirm with a hand-built draft → 200 { stepId }
  // 4) trail_steps now has a row with action='assert' and checkpoint_json containing "visible"
  // 5) GET /api/expectations?status=enforced includes it
  expect(true).toBe(true) // replace with concrete assertions per the harness
})
```

Note for implementer: model the assertions on `server.trails.test.ts` (it already boots the app against an in-memory DB and seeds findings). For the `/enforce` draft step, set `KLAV_MODEL` to a stub or assert only that confirm works with a hand-built draft, so the test never hits the network.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test server.expectations.test.ts`
Expected: FAIL (routes 404 / helper missing).

- [ ] **Step 3: Add `insertAssertStep` to `lib/trails.ts`**

```ts
export async function insertAssertStep(projectId: string, trailId: string, afterStepIdx: number,
  target: Record<string, string>, description: string): Promise<string> {
  const id = "ts_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO trail_steps (id, trail_id, project_id, idx, action, action_value, target_json, checkpoint_json, created_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [id, trailId, projectId, afterStepIdx + 1, "assert", null,
           JSON.stringify(target), JSON.stringify({ kind: "visible", description }), Date.now()],
  })
  return id
}
```

- [ ] **Step 4: Add the four routes in `server.ts`**

```ts
if (req.method === "GET" && path === "/api/expectations") {
  const me = (await sessionEmail(req)) || (await bearerEmail(req)); if (!me) return json({ error: "auth" }, 401)
  const proj = await resolveProject(me, url.searchParams.get("project")); if (!proj) return json({ error: "no project" }, 404)
  const status = url.searchParams.get("status") as any
  return json({ expectations: await listExpectations(db!, proj.id, status || undefined) })
}
if (req.method === "POST" && path.startsWith("/api/expectations/") && path.endsWith("/enforce")) {
  const me = (await sessionEmail(req)) || (await bearerEmail(req)); if (!me) return json({ error: "auth" }, 401)
  const proj = await resolveProject(me, url.searchParams.get("project")); if (!proj) return json({ error: "no project" }, 404)
  const id = path.split("/")[3]
  const exp = await getExpectation(db!, id); if (!exp || exp.projectId !== proj.id) return json({ error: "not found" }, 404)
  if (exp.status !== "validated") return json({ error: "not validated" }, 409)
  const body = await req.json().catch(() => ({}))
  const trailId = body.trailId || (await listTrails(proj.id))[0]?.id
  if (!trailId) return json({ error: "no trail to attach to" }, 422)
  const trail = await getTrail(trailId); const steps = await listTrailSteps(trailId)
  const { content } = await draftAssertion(exp, trail, steps, { email: me, projectId: proj.id })
  const draft = validateAssertionDraft({ ...parseJSON(content), trailId })
  return json({ draft })
}
if (req.method === "POST" && path.startsWith("/api/expectations/") && path.endsWith("/enforce/confirm")) {
  const me = (await sessionEmail(req)) || (await bearerEmail(req)); if (!me) return json({ error: "auth" }, 401)
  const proj = await resolveProject(me, url.searchParams.get("project")); if (!proj) return json({ error: "no project" }, 404)
  const id = path.split("/")[3]
  const exp = await getExpectation(db!, id); if (!exp || exp.projectId !== proj.id) return json({ error: "not found" }, 404)
  const draft = validateAssertionDraft((await req.json().catch(() => ({}))).draft)
  if (!draft) return json({ error: "invalid draft" }, 400)
  const stepId = await insertAssertStep(proj.id, draft.trailId, draft.afterStepIdx, draft.target, draft.checkpoint.description)
  await setExpectationEnforced(db!, id, stepId)
  return json({ stepId })
}
if (req.method === "POST" && path.startsWith("/api/expectations/") && path.endsWith("/retire")) {
  const me = (await sessionEmail(req)) || (await bearerEmail(req)); if (!me) return json({ error: "auth" }, 401)
  const proj = await resolveProject(me, url.searchParams.get("project")); if (!proj) return json({ error: "no project" }, 404)
  const id = path.split("/")[3]
  const exp = await getExpectation(db!, id); if (!exp || exp.projectId !== proj.id) return json({ error: "not found" }, 404)
  await setExpectationStatus(db!, id, "retire" as any === "retire" ? "retired" : "retired")
  return json({ ok: true })
}
```

Note: import `listExpectations, getExpectation, setExpectationEnforced, setExpectationStatus` from `./lib/expectations-db`, `validateAssertionDraft` from `./lib/assertion-spec`, and `insertAssertStep, listTrailSteps, getTrail, listTrails` from `./lib/trails`. Confirm `listTrails`/`getTrail` exist (they're used by the Trails dashboard); if a name differs, use the actual one.

- [ ] **Step 5: Flesh out and run the endpoint test**

Run: `cd prototype && bun test server.expectations.test.ts`
Expected: PASS — assert step row exists with `action='assert'` + `checkpoint_json` containing `"visible"`; expectation status `enforced`.

- [ ] **Step 6: Run the full suite**

Run: `cd prototype && bun test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add prototype/lib/trails.ts prototype/server.ts prototype/server.expectations.test.ts
git commit -m "feat(expectations): enforce/confirm/retire endpoints + assert-step writer"
```

---

### Task 7: Expectations dashboard board

**Files:**
- Modify: the Sims/Trails dashboard HTML served from disk (e.g. `prototype/../site` or the dashboard template the project already uses — locate via the existing `/trails` route's served file) to add an "Expectations" section
- Test: manual + a route smoke assertion in `server.expectations.test.ts`

**Interfaces:**
- Consumes: `GET /api/expectations`, `POST …/enforce`, `…/enforce/confirm`, `…/retire`.

- [ ] **Step 1: Add a three-column board (Candidate / Validated / Enforced)**

Render each expectation as a card: title, source badges (`Snap` if `corroboration.snap`, `Sim` if `corroboration.sim`, `×N` recurrence), `area · urlPath`, and — on `validated` rows — an **Enforce** button that calls `/enforce`, shows the returned draft in a small confirm panel (editable target/description), then calls `/enforce/confirm`. Enforced rows link to their Trail.

(Keep it consistent with the existing dashboard's vanilla JS + fetch pattern; no framework.)

- [ ] **Step 2: Manual verify**

Run the app locally (`TURSO_DATABASE_URL=file:/tmp/exp.db KLAV_SECRET=… PORT=8805 bun run server.ts`), seed a snap+sim pair, confirm the validated card appears and Enforce→confirm writes a step.

- [ ] **Step 3: Commit**

```bash
git add <dashboard file>
git commit -m "feat(expectations): discover→enforce dashboard board"
```

---

### Task 8: SemVer + CHANGELOG + docs

**Files:**
- Modify: `CHANGELOG.md`, `docs/PRD.md`, `package.json`, `packages/core/package.json`, `packages/sdk/package.json`, `packages/extension/package.json`, `packages/extension/manifest.json` (all in lockstep — minor bump)

- [ ] **Step 1: Bump all 5 manifests + PRD version one minor (e.g. 0.30.x → 0.31.0), add a CHANGELOG entry describing the expectations spine + graduation.**
- [ ] **Step 2: Run `cd prototype && bun test` (all green).**
- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/PRD.md package.json packages/core/package.json packages/sdk/package.json packages/extension/package.json packages/extension/manifest.json
git commit -m "chore(release): 0.31.0 — expectations spine + graduation (discover→enforce)"
```

---

## Self-Review

**Spec coverage:** spine table (T1) ✓ · pure corroboration+lifecycle (T2) ✓ · dedup-collapse upsert (T3) ✓ · ingest hooks for snap/sim/finding (T4) ✓ · ASSERT_SYS + draft validation (T5) ✓ · enforce/confirm/retire + assert-step writer (T6) ✓ · dashboard (T7) ✓ · validate trigger = cross-source corroboration OR recurrence≥N (T2/T3) ✓ · enforce = visible-assert, human-confirmed (T5/T6) ✓ · ai_calls type='assert-gen' (T5) ✓ · SemVer lockstep (T8) ✓.

**Deferred (named in spec, not tasks):** described-archetype Sims, decision-criteria→expectations, genre routing, speaker labelling, embedding-corroboration, richer checkpoint kinds (textPresent/noConsoleError), auto-enforce. All intentionally out of scope.

**Placeholder scan:** the only soft spots are T6-Step1 (test body sketched, to be fleshed against the real `server.trails.test.ts` harness — the implementer is told exactly what to assert) and T7 (dashboard file path resolved at execution from the existing `/trails` served file). Both name the concrete reference to copy.

**Type consistency:** `Corroboration`/`SourceRef`/`ExpStatus`/`AssertionDraft` are defined once (T2/T5) and reused verbatim in T3/T4/T6; `upsertExpectation` signature matches its callers in T4; `insertAssertStep` signature matches its T6 caller.
