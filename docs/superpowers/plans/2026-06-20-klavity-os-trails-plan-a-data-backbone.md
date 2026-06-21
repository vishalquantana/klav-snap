# Klavity OS — Trails — Plan A: Data Backbone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistent data backbone for Klavity OS "Trails" — tables and query helpers for trails, steps, locator cache, walks (runs), run-steps, and findings — so later plans (crystallizer, runner, heal, oracle, findings gate) have a tested storage layer.

**Architecture:** Additive SQLite tables in the existing `applySchema()` statement list in `prototype/lib/db.ts` (the schema source of truth), with focused query helpers in a new module `prototype/lib/trails.ts` (db.ts is already ~2000 lines; new domain helpers go in their own file to stay focused). Pure types + a pure `cacheKey()` hash live in `prototype/lib/trails-types.ts`. No browser, no LLM, no new dependencies — everything is testable with `bun:test` against a local libsql file, mirroring the existing `db.connectors.test.ts` pattern.

**Tech Stack:** Bun runtime, `bun:test`, `@libsql/client` (Turso/SQLite), TypeScript ESM. Hashing via Bun's Web Crypto (`crypto.subtle`) — no new dep.

## Global Constraints

- Runtime: **Bun** (ESM, `"type": "module"`). Run the server with `bun run server.ts`; run tests with `bun test <file>`.
- Database access goes through the shared `db` singleton in `prototype/lib/db.ts`. Schema is created **only** via `CREATE TABLE IF NOT EXISTS` statements appended to the `stmts` array in `applySchema(c)`. Never create tables ad-hoc elsewhere.
- **Every table is project-scoped**: a non-null `project_id TEXT` column, and every query helper takes `projectId` as its first argument and filters on it. No cross-project reads.
- IDs are string prefixes generated with `crypto.randomUUID()`: trails `trl_`, walks `walk_`, findings `find_`, steps `tstep_`, run-steps `rstep_`, cache rows `lc_`.
- Timestamps are `INTEGER` epoch milliseconds via `Date.now()`.
- JSON columns store `JSON.stringify(...)` and are parsed on read; suffix such columns `_json`.
- Test isolation: each test FILE sets `process.env.TURSO_DATABASE_URL = "file:"+uniqueTmpPath` **before** `await import("./db")`, then in `beforeAll` calls `reconnectDb(...)`, `applySchema(db)`, `migrateV2(db)` — exactly as `prototype/lib/db.connectors.test.ts` does. Scope assertions by unique ids rather than truncating tables.
- Follow existing code style in `db.ts`: small exported `async function` helpers using `db!.execute({ sql, args })`, returning plain typed objects.

---

## File Structure

- `prototype/lib/trails-types.ts` (Create) — pure TS types for Fingerprint, Trail, TrailStep, LocatorCacheRow, Walk, RunStep, Finding, the enums, and the pure `cacheKey()` hash. No imports from `db.ts`.
- `prototype/lib/db.ts` (Modify) — append `CREATE TABLE IF NOT EXISTS` statements for the six new tables (and their indexes) into the `applySchema()` `stmts` array.
- `prototype/lib/trails.ts` (Create) — query helpers (the only module that reads/writes the new tables), importing the `db` singleton from `./db` and types from `./trails-types`.
- `prototype/lib/trails-types.test.ts` (Create) — tests for `cacheKey()` purity/stability.
- `prototype/lib/trails.test.ts` (Create) — tests for every query helper, hermetic local-libsql, following the connectors-test pattern.

---

### Task 1: Pure types + `cacheKey()` hash

**Files:**
- Create: `prototype/lib/trails-types.ts`
- Test: `prototype/lib/trails-types.test.ts`

**Interfaces:**
- Produces:
  - Enums (string unions): `TrailStatus = 'draft'|'active'|'archived'`, `AuthorKind = 'llm'|'human'|'mixed'`, `StepAction = 'navigate'|'click'|'type'|'select'|'assert'|'wait'`, `Tier = 'cache'|'candidate'|'vision'|'none'`, `Verdict = 'green'|'amber'|'red'|'skip'`, `FailureClass = 'locator_drift'|'timing'|'test_data'|'runtime_error'|'visual'|'interaction_change'|'regression'|'unknown'`, `FindingKind = 'regression'|'visual'|'amber_heal'`, `FindingStatus = 'queued'|'auto_filed'|'filed'|'dismissed'`.
  - `interface Fingerprint { role?: string; accessibleName?: string; text?: string; testId?: string; domPath?: string; bbox?: [number,number,number,number]; screenshotKey?: string }`
  - `interface Trail { id; projectId; name; intent; baseUrl; baselineRef: string|null; authorKind: AuthorKind; status: TrailStatus; createdBy: string|null; createdAt; updatedAt }`
  - `interface TrailStep { id; trailId; projectId; idx: number; action: StepAction; actionValue: string|null; target: Fingerprint|null; checkpoint: { description: string }|null; createdAt }`
  - `interface LocatorCacheRow { id; projectId; trailId; stepId; cacheKey; resolvedSelector; fingerprint: Fingerprint|null; confidence: number; source: 'crystallize'|'heal'; createdAt; updatedAt }`
  - `interface Walk { id; trailId; projectId; trigger: 'manual'; status: 'running'|Verdict; llmCalls: number; summary: Record<string,unknown>|null; startedAt; finishedAt: number|null }`
  - `interface RunStep { id; runId; trailId; stepId; projectId; idx: number; tier: Tier; verdict: Verdict; confidence: number; diagnosis: FailureClass|null; healed: boolean; evidence: Record<string,unknown>|null; createdAt }`
  - `interface Finding { id; projectId; runId; stepId: string|null; trailId; kind: FindingKind; title; evidence: Record<string,unknown>|null; groundQuote: string|null; confidence: number; dedupKey: string; recurrence: number; status: FindingStatus; connectorRef: string|null; createdAt; updatedAt }`
  - `async function cacheKey(method: string, url: string, domHash: string, projectId: string): Promise<string>` — returns a hex SHA-256 of `` `${method}|${normalizeUrl(url)}|${domHash}|${projectId}` ``, where `normalizeUrl` strips the hash fragment and sorts query params.

- [ ] **Step 1: Write the failing test**

```typescript
// prototype/lib/trails-types.test.ts
import { test, expect } from "bun:test"
import { cacheKey } from "./trails-types"

test("cacheKey is a stable 64-char hex digest", async () => {
  const k = await cacheKey("click", "https://app.test/checkout?b=2&a=1", "domhash123", "proj_A")
  expect(k).toMatch(/^[0-9a-f]{64}$/)
  const again = await cacheKey("click", "https://app.test/checkout?b=2&a=1", "domhash123", "proj_A")
  expect(again).toBe(k)
})

test("cacheKey normalizes query-param order and ignores the URL fragment", async () => {
  const a = await cacheKey("click", "https://app.test/x?a=1&b=2#frag", "h", "proj_A")
  const b = await cacheKey("click", "https://app.test/x?b=2&a=1", "h", "proj_A")
  expect(a).toBe(b)
})

test("cacheKey is sensitive to project, method, url path, and dom hash", async () => {
  const base = await cacheKey("click", "https://app.test/x", "h", "proj_A")
  expect(await cacheKey("type", "https://app.test/x", "h", "proj_A")).not.toBe(base)
  expect(await cacheKey("click", "https://app.test/y", "h", "proj_A")).not.toBe(base)
  expect(await cacheKey("click", "https://app.test/x", "h2", "proj_A")).not.toBe(base)
  expect(await cacheKey("click", "https://app.test/x", "h", "proj_B")).not.toBe(base)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/trails-types.test.ts`
Expected: FAIL — `Cannot find module "./trails-types"` (or `cacheKey is not a function`).

- [ ] **Step 3: Write minimal implementation**

```typescript
// prototype/lib/trails-types.ts
// Pure types + cacheKey hash for Klavity OS "Trails". No db/runtime imports.

export type TrailStatus = "draft" | "active" | "archived"
export type AuthorKind = "llm" | "human" | "mixed"
export type StepAction = "navigate" | "click" | "type" | "select" | "assert" | "wait"
export type Tier = "cache" | "candidate" | "vision" | "none"
export type Verdict = "green" | "amber" | "red" | "skip"
export type FailureClass =
  | "locator_drift" | "timing" | "test_data" | "runtime_error"
  | "visual" | "interaction_change" | "regression" | "unknown"
export type FindingKind = "regression" | "visual" | "amber_heal"
export type FindingStatus = "queued" | "auto_filed" | "filed" | "dismissed"

export interface Fingerprint {
  role?: string
  accessibleName?: string
  text?: string
  testId?: string
  domPath?: string
  bbox?: [number, number, number, number]
  screenshotKey?: string
}

export interface Trail {
  id: string; projectId: string; name: string; intent: string; baseUrl: string
  baselineRef: string | null; authorKind: AuthorKind; status: TrailStatus
  createdBy: string | null; createdAt: number; updatedAt: number
}

export interface TrailStep {
  id: string; trailId: string; projectId: string; idx: number
  action: StepAction; actionValue: string | null
  target: Fingerprint | null; checkpoint: { description: string } | null; createdAt: number
}

export interface LocatorCacheRow {
  id: string; projectId: string; trailId: string; stepId: string
  cacheKey: string; resolvedSelector: string; fingerprint: Fingerprint | null
  confidence: number; source: "crystallize" | "heal"; createdAt: number; updatedAt: number
}

export interface Walk {
  id: string; trailId: string; projectId: string; trigger: "manual"
  status: "running" | Verdict; llmCalls: number
  summary: Record<string, unknown> | null; startedAt: number; finishedAt: number | null
}

export interface RunStep {
  id: string; runId: string; trailId: string; stepId: string; projectId: string
  idx: number; tier: Tier; verdict: Verdict; confidence: number
  diagnosis: FailureClass | null; healed: boolean
  evidence: Record<string, unknown> | null; createdAt: number
}

export interface Finding {
  id: string; projectId: string; runId: string; stepId: string | null; trailId: string
  kind: FindingKind; title: string; evidence: Record<string, unknown> | null
  groundQuote: string | null; confidence: number; dedupKey: string; recurrence: number
  status: FindingStatus; connectorRef: string | null; createdAt: number; updatedAt: number
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.hash = ""
    u.searchParams.sort()
    return u.toString()
  } catch {
    return raw
  }
}

export async function cacheKey(method: string, url: string, domHash: string, projectId: string): Promise<string> {
  const input = `${method}|${normalizeUrl(url)}|${domHash}|${projectId}`
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/trails-types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/trails-types.ts prototype/lib/trails-types.test.ts
git commit -m "feat(klavity-os): Trail data types + stable cacheKey hash"
```

---

### Task 2: Schema — six Trail tables in `applySchema`

**Files:**
- Modify: `prototype/lib/db.ts` (append statements to the `stmts` array inside `applySchema`)
- Test: `prototype/lib/trails.test.ts` (new file; this task adds only the schema-presence test)

**Interfaces:**
- Consumes: `applySchema(c)`, `migrateV2(c)`, `reconnectDb(url)` from `./db` (existing).
- Produces: tables `trails`, `trail_steps`, `locator_cache`, `trail_runs`, `run_steps`, `findings` created by `applySchema`, plus indexes `trail_proj_idx`, `tstep_trail_idx`, `lc_key_uq` (UNIQUE on `cache_key`), `walk_trail_idx`, `rstep_run_idx`, `finding_dedup_idx`.

- [ ] **Step 1: Write the failing test**

```typescript
// prototype/lib/trails.test.ts
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-trails-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema, migrateV2 } = await import("./db")

let db: any
beforeAll(async () => {
  db = reconnectDb("file:" + file)
  await applySchema(db)
  await migrateV2(db)
})

test("applySchema creates all six Trail tables", async () => {
  const names = ["trails", "trail_steps", "locator_cache", "trail_runs", "run_steps", "findings"]
  for (const n of names) {
    const r = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      args: [n],
    })
    expect(r.rows.length, `table ${n} should exist`).toBe(1)
  }
})

test("locator_cache enforces a UNIQUE cache_key", async () => {
  const idx = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='index' AND name='lc_key_uq'",
    args: [],
  })
  expect(idx.rows.length).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: FAIL — `table trails should exist` (got 0).

- [ ] **Step 3: Add the schema statements**

In `prototype/lib/db.ts`, inside `applySchema`, locate the end of the `const stmts = [ ... ]` array (just before the closing `]`) and append these entries:

```typescript
    // ── Klavity OS "Trails" (test automation): authored flows, steps, locator cache, walks, run-steps, findings ──
    `CREATE TABLE IF NOT EXISTS trails (
       id TEXT PRIMARY KEY,
       project_id TEXT NOT NULL,
       name TEXT NOT NULL,
       intent TEXT NOT NULL DEFAULT '',
       base_url TEXT NOT NULL,
       baseline_ref TEXT,
       author_kind TEXT NOT NULL DEFAULT 'human',
       status TEXT NOT NULL DEFAULT 'draft',
       created_by TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS trail_proj_idx ON trails(project_id, status)`,
    `CREATE TABLE IF NOT EXISTS trail_steps (
       id TEXT PRIMARY KEY,
       trail_id TEXT NOT NULL,
       project_id TEXT NOT NULL,
       idx INTEGER NOT NULL,
       action TEXT NOT NULL,
       action_value TEXT,
       target_json TEXT,
       checkpoint_json TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS tstep_trail_idx ON trail_steps(trail_id, idx)`,
    `CREATE TABLE IF NOT EXISTS locator_cache (
       id TEXT PRIMARY KEY,
       project_id TEXT NOT NULL,
       trail_id TEXT NOT NULL,
       step_id TEXT NOT NULL,
       cache_key TEXT NOT NULL,
       resolved_selector TEXT NOT NULL,
       fingerprint_json TEXT,
       confidence REAL NOT NULL DEFAULT 1.0,
       source TEXT NOT NULL DEFAULT 'crystallize',
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS lc_key_uq ON locator_cache(cache_key)`,
    `CREATE TABLE IF NOT EXISTS trail_runs (
       id TEXT PRIMARY KEY,
       trail_id TEXT NOT NULL,
       project_id TEXT NOT NULL,
       trigger TEXT NOT NULL DEFAULT 'manual',
       status TEXT NOT NULL DEFAULT 'running',
       llm_calls INTEGER NOT NULL DEFAULT 0,
       summary_json TEXT,
       started_at INTEGER NOT NULL,
       finished_at INTEGER
     )`,
    `CREATE INDEX IF NOT EXISTS walk_trail_idx ON trail_runs(trail_id, started_at)`,
    `CREATE TABLE IF NOT EXISTS run_steps (
       id TEXT PRIMARY KEY,
       run_id TEXT NOT NULL,
       trail_id TEXT NOT NULL,
       step_id TEXT NOT NULL,
       project_id TEXT NOT NULL,
       idx INTEGER NOT NULL,
       tier TEXT NOT NULL DEFAULT 'none',
       verdict TEXT NOT NULL DEFAULT 'skip',
       confidence REAL NOT NULL DEFAULT 0,
       diagnosis TEXT,
       healed INTEGER NOT NULL DEFAULT 0,
       evidence_json TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS rstep_run_idx ON run_steps(run_id, idx)`,
    `CREATE TABLE IF NOT EXISTS findings (
       id TEXT PRIMARY KEY,
       project_id TEXT NOT NULL,
       run_id TEXT NOT NULL,
       step_id TEXT,
       trail_id TEXT NOT NULL,
       kind TEXT NOT NULL,
       title TEXT NOT NULL,
       evidence_json TEXT,
       ground_quote TEXT,
       confidence REAL NOT NULL DEFAULT 0,
       dedup_key TEXT NOT NULL,
       recurrence INTEGER NOT NULL DEFAULT 1,
       status TEXT NOT NULL DEFAULT 'queued',
       connector_ref TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS finding_dedup_idx ON findings(project_id, dedup_key)`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/db.ts prototype/lib/trails.test.ts
git commit -m "feat(klavity-os): Trails schema (trails/steps/locator_cache/runs/run_steps/findings)"
```

---

### Task 3: Trail + step helpers (`createTrail`, `addTrailStep`, reads)

**Files:**
- Create: `prototype/lib/trails.ts`
- Test: `prototype/lib/trails.test.ts` (append tests)

**Interfaces:**
- Consumes: `db` from `./db`; types from `./trails-types`.
- Produces:
  - `createTrail(projectId, input: { name; intent?; baseUrl; authorKind?; createdBy? }): Promise<string>` → trail id (`trl_…`).
  - `getTrail(projectId, id): Promise<Trail | null>`
  - `listTrails(projectId): Promise<Trail[]>` (newest first)
  - `setTrailStatus(projectId, id, status: TrailStatus): Promise<void>`
  - `addTrailStep(projectId, trailId, input: { idx; action; actionValue?; target?; checkpoint? }): Promise<string>` → step id (`tstep_…`).
  - `listTrailSteps(projectId, trailId): Promise<TrailStep[]>` (ordered by `idx`).

- [ ] **Step 1: Write the failing test**

```typescript
// append to prototype/lib/trails.test.ts
const T = await import("./trails")

test("createTrail + getTrail round-trip, scoped by project", async () => {
  const id = await T.createTrail("proj_A", { name: "Checkout", intent: "buy the $20 plan", baseUrl: "https://app.test/" })
  expect(id).toMatch(/^trl_/)
  const got = await T.getTrail("proj_A", id)
  expect(got?.name).toBe("Checkout")
  expect(got?.intent).toBe("buy the $20 plan")
  expect(got?.status).toBe("draft")
  expect(await T.getTrail("proj_B", id)).toBeNull() // cross-project isolation
})

test("addTrailStep + listTrailSteps preserves order and round-trips target/checkpoint", async () => {
  const trail = await T.createTrail("proj_A", { name: "Login", baseUrl: "https://app.test/" })
  await T.addTrailStep("proj_A", trail, { idx: 1, action: "type", actionValue: "user@test.dev", target: { role: "textbox", accessibleName: "Email" } })
  await T.addTrailStep("proj_A", trail, { idx: 0, action: "navigate", actionValue: "https://app.test/login" })
  await T.addTrailStep("proj_A", trail, { idx: 2, action: "assert", checkpoint: { description: "dashboard visible" } })
  const steps = await T.listTrailSteps("proj_A", trail)
  expect(steps.map((s) => s.idx)).toEqual([0, 1, 2])
  expect(steps[1].target?.accessibleName).toBe("Email")
  expect(steps[2].checkpoint?.description).toBe("dashboard visible")
})

test("setTrailStatus updates status", async () => {
  const id = await T.createTrail("proj_A", { name: "S", baseUrl: "https://app.test/" })
  await T.setTrailStatus("proj_A", id, "active")
  expect((await T.getTrail("proj_A", id))?.status).toBe("active")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: FAIL — `Cannot find module "./trails"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// prototype/lib/trails.ts
import { db } from "./db"
import type { Trail, TrailStep, TrailStatus, StepAction, Fingerprint } from "./trails-types"

function uid(prefix: string): string { return prefix + crypto.randomUUID() }
function j<T>(v: T | null | undefined): string | null { return v == null ? null : JSON.stringify(v) }
function pj<T>(s: unknown): T | null { return s ? (JSON.parse(String(s)) as T) : null }

function rowToTrail(r: any): Trail {
  return {
    id: r.id, projectId: r.project_id, name: r.name, intent: r.intent, baseUrl: r.base_url,
    baselineRef: r.baseline_ref ?? null, authorKind: r.author_kind, status: r.status,
    createdBy: r.created_by ?? null, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

export async function createTrail(
  projectId: string,
  input: { name: string; intent?: string; baseUrl: string; authorKind?: Trail["authorKind"]; createdBy?: string },
): Promise<string> {
  const id = uid("trl_"); const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO trails (id, project_id, name, intent, base_url, baseline_ref, author_kind, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NULL, ?, 'draft', ?, ?, ?)`,
    args: [id, projectId, input.name, input.intent ?? "", input.baseUrl, input.authorKind ?? "human", input.createdBy ?? null, now, now],
  })
  return id
}

export async function getTrail(projectId: string, id: string): Promise<Trail | null> {
  const r = await db!.execute({ sql: `SELECT * FROM trails WHERE project_id=? AND id=?`, args: [projectId, id] })
  return r.rows.length ? rowToTrail(r.rows[0]) : null
}

export async function listTrails(projectId: string): Promise<Trail[]> {
  const r = await db!.execute({ sql: `SELECT * FROM trails WHERE project_id=? ORDER BY created_at DESC`, args: [projectId] })
  return r.rows.map(rowToTrail)
}

export async function setTrailStatus(projectId: string, id: string, status: TrailStatus): Promise<void> {
  await db!.execute({ sql: `UPDATE trails SET status=?, updated_at=? WHERE project_id=? AND id=?`, args: [status, Date.now(), projectId, id] })
}

function rowToStep(r: any): TrailStep {
  return {
    id: r.id, trailId: r.trail_id, projectId: r.project_id, idx: Number(r.idx),
    action: r.action as StepAction, actionValue: r.action_value ?? null,
    target: pj<Fingerprint>(r.target_json), checkpoint: pj<{ description: string }>(r.checkpoint_json),
    createdAt: Number(r.created_at),
  }
}

export async function addTrailStep(
  projectId: string, trailId: string,
  input: { idx: number; action: StepAction; actionValue?: string; target?: Fingerprint; checkpoint?: { description: string } },
): Promise<string> {
  const id = uid("tstep_")
  await db!.execute({
    sql: `INSERT INTO trail_steps (id, trail_id, project_id, idx, action, action_value, target_json, checkpoint_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, trailId, projectId, input.idx, input.action, input.actionValue ?? null, j(input.target), j(input.checkpoint), Date.now()],
  })
  return id
}

export async function listTrailSteps(projectId: string, trailId: string): Promise<TrailStep[]> {
  const r = await db!.execute({ sql: `SELECT * FROM trail_steps WHERE project_id=? AND trail_id=? ORDER BY idx ASC`, args: [projectId, trailId] })
  return r.rows.map(rowToStep)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: PASS (schema tests + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/trails.ts prototype/lib/trails.test.ts
git commit -m "feat(klavity-os): Trail + step query helpers"
```

---

### Task 4: Locator cache helpers (`upsertLocatorCache`, `getLocatorByKey`, `getCacheForStep`)

**Files:**
- Modify: `prototype/lib/trails.ts`
- Test: `prototype/lib/trails.test.ts` (append)

**Interfaces:**
- Consumes: `db`, `cacheKey` is NOT needed here (caller passes the precomputed key string); types from `./trails-types`.
- Produces:
  - `upsertLocatorCache(projectId, input: { trailId; stepId; cacheKey; resolvedSelector; fingerprint?; confidence?; source? }): Promise<string>` — inserts or, on `cache_key` conflict, updates `resolved_selector/fingerprint/confidence/source/updated_at`. Returns the row id.
  - `getLocatorByKey(projectId, cacheKey): Promise<LocatorCacheRow | null>`
  - `getCacheForStep(projectId, stepId): Promise<LocatorCacheRow | null>`

- [ ] **Step 1: Write the failing test**

```typescript
// append to prototype/lib/trails.test.ts
test("upsertLocatorCache inserts then updates on cache_key conflict (heal overwrites)", async () => {
  const trail = await T.createTrail("proj_A", { name: "C", baseUrl: "https://app.test/" })
  const step = await T.addTrailStep("proj_A", trail, { idx: 0, action: "click" })
  const key = "deadbeef".repeat(8) // 64 hex chars

  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: key, resolvedSelector: "#pay", confidence: 1, source: "crystallize" })
  let row = await T.getLocatorByKey("proj_A", key)
  expect(row?.resolvedSelector).toBe("#pay")
  expect(row?.source).toBe("crystallize")

  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: key, resolvedSelector: "[data-testid=pay]", confidence: 0.93, source: "heal" })
  row = await T.getLocatorByKey("proj_A", key)
  expect(row?.resolvedSelector).toBe("[data-testid=pay]") // overwritten, not duplicated
  expect(row?.source).toBe("heal")
  expect(row?.confidence).toBeCloseTo(0.93)

  const both = await db.execute({ sql: "SELECT COUNT(*) c FROM locator_cache WHERE cache_key=?", args: [key] })
  expect(Number(both.rows[0].c)).toBe(1)
})

test("getCacheForStep + cross-project isolation", async () => {
  const trail = await T.createTrail("proj_A", { name: "C2", baseUrl: "https://app.test/" })
  const step = await T.addTrailStep("proj_A", trail, { idx: 0, action: "click" })
  await T.upsertLocatorCache("proj_A", { trailId: trail, stepId: step, cacheKey: "a".repeat(64), resolvedSelector: "#x" })
  expect((await T.getCacheForStep("proj_A", step))?.resolvedSelector).toBe("#x")
  expect(await T.getCacheForStep("proj_B", step)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: FAIL — `T.upsertLocatorCache is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `trails.ts`)**

```typescript
import type { LocatorCacheRow } from "./trails-types"

function rowToCache(r: any): LocatorCacheRow {
  return {
    id: r.id, projectId: r.project_id, trailId: r.trail_id, stepId: r.step_id,
    cacheKey: r.cache_key, resolvedSelector: r.resolved_selector, fingerprint: pj<Fingerprint>(r.fingerprint_json),
    confidence: Number(r.confidence), source: r.source, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

export async function upsertLocatorCache(
  projectId: string,
  input: { trailId: string; stepId: string; cacheKey: string; resolvedSelector: string; fingerprint?: Fingerprint; confidence?: number; source?: "crystallize" | "heal" },
): Promise<string> {
  const id = uid("lc_"); const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO locator_cache (id, project_id, trail_id, step_id, cache_key, resolved_selector, fingerprint_json, confidence, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET
            resolved_selector=excluded.resolved_selector,
            fingerprint_json=excluded.fingerprint_json,
            confidence=excluded.confidence,
            source=excluded.source,
            updated_at=excluded.updated_at`,
    args: [id, projectId, input.trailId, input.stepId, input.cacheKey, input.resolvedSelector, j(input.fingerprint), input.confidence ?? 1.0, input.source ?? "crystallize", now, now],
  })
  return id
}

export async function getLocatorByKey(projectId: string, key: string): Promise<LocatorCacheRow | null> {
  const r = await db!.execute({ sql: `SELECT * FROM locator_cache WHERE project_id=? AND cache_key=?`, args: [projectId, key] })
  return r.rows.length ? rowToCache(r.rows[0]) : null
}

export async function getCacheForStep(projectId: string, stepId: string): Promise<LocatorCacheRow | null> {
  const r = await db!.execute({ sql: `SELECT * FROM locator_cache WHERE project_id=? AND step_id=? ORDER BY updated_at DESC LIMIT 1`, args: [projectId, stepId] })
  return r.rows.length ? rowToCache(r.rows[0]) : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: PASS (all prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/trails.ts prototype/lib/trails.test.ts
git commit -m "feat(klavity-os): locator cache upsert/read helpers (cache_key conflict = heal overwrite)"
```

---

### Task 5: Walk + run-step helpers (`startWalk`, `addRunStep`, `finishWalk`, reads)

**Files:**
- Modify: `prototype/lib/trails.ts`
- Test: `prototype/lib/trails.test.ts` (append)

**Interfaces:**
- Produces:
  - `startWalk(projectId, trailId, trigger?: 'manual'): Promise<string>` → walk id (`walk_…`), status `'running'`, `llm_calls` 0.
  - `addRunStep(projectId, input: { runId; trailId; stepId; idx; tier; verdict; confidence?; diagnosis?; healed?; evidence? }): Promise<string>`
  - `finishWalk(projectId, runId, input: { status: Verdict; llmCalls: number; summary?: Record<string,unknown> }): Promise<void>` — sets `finished_at`.
  - `getWalk(projectId, runId): Promise<Walk | null>`
  - `listRunSteps(projectId, runId): Promise<RunStep[]>` (ordered by `idx`).
  - `listWalks(projectId, trailId): Promise<Walk[]>` (newest first).

- [ ] **Step 1: Write the failing test**

```typescript
// append to prototype/lib/trails.test.ts
test("walk lifecycle: start → addRunStep → finish, with reads", async () => {
  const trail = await T.createTrail("proj_A", { name: "W", baseUrl: "https://app.test/" })
  const step = await T.addTrailStep("proj_A", trail, { idx: 0, action: "click" })
  const walk = await T.startWalk("proj_A", trail)
  expect(walk).toMatch(/^walk_/)
  expect((await T.getWalk("proj_A", walk))?.status).toBe("running")

  await T.addRunStep("proj_A", { runId: walk, trailId: trail, stepId: step, idx: 0, tier: "cache", verdict: "green", confidence: 1 })
  await T.addRunStep("proj_A", { runId: walk, trailId: trail, stepId: step, idx: 1, tier: "vision", verdict: "amber", confidence: 0.7, diagnosis: "locator_drift", healed: true, evidence: { note: "re-resolved" } })

  await T.finishWalk("proj_A", walk, { status: "amber", llmCalls: 1, summary: { healed: 1 } })
  const w = await T.getWalk("proj_A", walk)
  expect(w?.status).toBe("amber")
  expect(w?.llmCalls).toBe(1)
  expect(w?.finishedAt).toBeGreaterThan(0)

  const rs = await T.listRunSteps("proj_A", walk)
  expect(rs.map((s) => s.verdict)).toEqual(["green", "amber"])
  expect(rs[1].healed).toBe(true)
  expect(rs[1].diagnosis).toBe("locator_drift")
  expect(rs[1].evidence?.note).toBe("re-resolved")

  expect((await T.listWalks("proj_A", trail))[0].id).toBe(walk)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: FAIL — `T.startWalk is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `trails.ts`)**

```typescript
import type { Walk, RunStep, Verdict, Tier, FailureClass } from "./trails-types"

function rowToWalk(r: any): Walk {
  return {
    id: r.id, trailId: r.trail_id, projectId: r.project_id, trigger: r.trigger,
    status: r.status, llmCalls: Number(r.llm_calls), summary: pj<Record<string, unknown>>(r.summary_json),
    startedAt: Number(r.started_at), finishedAt: r.finished_at == null ? null : Number(r.finished_at),
  }
}

function rowToRunStep(r: any): RunStep {
  return {
    id: r.id, runId: r.run_id, trailId: r.trail_id, stepId: r.step_id, projectId: r.project_id,
    idx: Number(r.idx), tier: r.tier as Tier, verdict: r.verdict as Verdict, confidence: Number(r.confidence),
    diagnosis: (r.diagnosis ?? null) as FailureClass | null, healed: Number(r.healed) === 1,
    evidence: pj<Record<string, unknown>>(r.evidence_json), createdAt: Number(r.created_at),
  }
}

export async function startWalk(projectId: string, trailId: string, trigger: "manual" = "manual"): Promise<string> {
  const id = uid("walk_")
  await db!.execute({
    sql: `INSERT INTO trail_runs (id, trail_id, project_id, trigger, status, llm_calls, summary_json, started_at, finished_at)
          VALUES (?, ?, ?, ?, 'running', 0, NULL, ?, NULL)`,
    args: [id, trailId, projectId, trigger, Date.now()],
  })
  return id
}

export async function addRunStep(
  projectId: string,
  input: { runId: string; trailId: string; stepId: string; idx: number; tier: Tier; verdict: Verdict; confidence?: number; diagnosis?: FailureClass; healed?: boolean; evidence?: Record<string, unknown> },
): Promise<string> {
  const id = uid("rstep_")
  await db!.execute({
    sql: `INSERT INTO run_steps (id, run_id, trail_id, step_id, project_id, idx, tier, verdict, confidence, diagnosis, healed, evidence_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.runId, input.trailId, input.stepId, projectId, input.idx, input.tier, input.verdict, input.confidence ?? 0, input.diagnosis ?? null, input.healed ? 1 : 0, j(input.evidence), Date.now()],
  })
  return id
}

export async function finishWalk(projectId: string, runId: string, input: { status: Verdict; llmCalls: number; summary?: Record<string, unknown> }): Promise<void> {
  await db!.execute({
    sql: `UPDATE trail_runs SET status=?, llm_calls=?, summary_json=?, finished_at=? WHERE project_id=? AND id=?`,
    args: [input.status, input.llmCalls, j(input.summary), Date.now(), projectId, runId],
  })
}

export async function getWalk(projectId: string, runId: string): Promise<Walk | null> {
  const r = await db!.execute({ sql: `SELECT * FROM trail_runs WHERE project_id=? AND id=?`, args: [projectId, runId] })
  return r.rows.length ? rowToWalk(r.rows[0]) : null
}

export async function listRunSteps(projectId: string, runId: string): Promise<RunStep[]> {
  const r = await db!.execute({ sql: `SELECT * FROM run_steps WHERE project_id=? AND run_id=? ORDER BY idx ASC`, args: [projectId, runId] })
  return r.rows.map(rowToRunStep)
}

export async function listWalks(projectId: string, trailId: string): Promise<Walk[]> {
  const r = await db!.execute({ sql: `SELECT * FROM trail_runs WHERE project_id=? AND trail_id=? ORDER BY started_at DESC`, args: [projectId, trailId] })
  return r.rows.map(rowToWalk)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/trails.ts prototype/lib/trails.test.ts
git commit -m "feat(klavity-os): walk + run-step lifecycle helpers"
```

---

### Task 6: Findings helpers with dedup/recurrence (`recordFinding`, `listFindings`, `setFindingStatus`)

**Files:**
- Modify: `prototype/lib/trails.ts`
- Test: `prototype/lib/trails.test.ts` (append)

**Interfaces:**
- Produces:
  - `recordFinding(projectId, input: { runId; trailId; stepId?; kind; title; evidence?; groundQuote?; confidence; dedupKey; status? }): Promise<{ id: string; deduped: boolean; recurrence: number }>` — if an OPEN finding (`status IN ('queued','auto_filed','filed')`) with the same `(project_id, dedup_key)` exists, bump its `recurrence` + `updated_at` and return `{ deduped: true }` instead of inserting a duplicate (mirrors the shipped suggested-bug dedup behavior). Otherwise insert with `recurrence = 1`.
  - `listFindings(projectId, opts?: { status?: FindingStatus }): Promise<Finding[]>` (newest first).
  - `setFindingStatus(projectId, id, status: FindingStatus, connectorRef?: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// append to prototype/lib/trails.test.ts
test("recordFinding dedups by dedup_key and bumps recurrence instead of duplicating", async () => {
  const trail = await T.createTrail("proj_A", { name: "F", baseUrl: "https://app.test/" })
  const walk = await T.startWalk("proj_A", trail)
  const a = await T.recordFinding("proj_A", { runId: walk, trailId: trail, kind: "regression", title: "Checkout button gone", confidence: 0.95, dedupKey: "checkout-gone" })
  expect(a.deduped).toBe(false)
  expect(a.recurrence).toBe(1)

  const b = await T.recordFinding("proj_A", { runId: walk, trailId: trail, kind: "regression", title: "Checkout button gone (again)", confidence: 0.96, dedupKey: "checkout-gone" })
  expect(b.deduped).toBe(true)
  expect(b.recurrence).toBe(2)

  const all = await T.listFindings("proj_A")
  expect(all.filter((f) => f.dedupKey === "checkout-gone").length).toBe(1) // collapsed, not duplicated
  expect(all[0].recurrence).toBe(2)
})

test("listFindings filters by status; setFindingStatus transitions and records connectorRef", async () => {
  const trail = await T.createTrail("proj_A", { name: "F2", baseUrl: "https://app.test/" })
  const walk = await T.startWalk("proj_A", trail)
  const f = await T.recordFinding("proj_A", { runId: walk, trailId: trail, kind: "visual", title: "Layout shift", confidence: 0.5, dedupKey: "layout-1", status: "queued" })
  expect((await T.listFindings("proj_A", { status: "queued" })).some((x) => x.id === f.id)).toBe(true)
  await T.setFindingStatus("proj_A", f.id, "filed", "plane:ISSUE-12")
  const filed = (await T.listFindings("proj_A", { status: "filed" })).find((x) => x.id === f.id)
  expect(filed?.connectorRef).toBe("plane:ISSUE-12")
  expect((await T.listFindings("proj_A", { status: "queued" })).some((x) => x.id === f.id)).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: FAIL — `T.recordFinding is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `trails.ts`)**

```typescript
import type { Finding, FindingKind, FindingStatus } from "./trails-types"

function rowToFinding(r: any): Finding {
  return {
    id: r.id, projectId: r.project_id, runId: r.run_id, stepId: r.step_id ?? null, trailId: r.trail_id,
    kind: r.kind as FindingKind, title: r.title, evidence: pj<Record<string, unknown>>(r.evidence_json),
    groundQuote: r.ground_quote ?? null, confidence: Number(r.confidence), dedupKey: r.dedup_key,
    recurrence: Number(r.recurrence), status: r.status as FindingStatus, connectorRef: r.connector_ref ?? null,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

export async function recordFinding(
  projectId: string,
  input: { runId: string; trailId: string; stepId?: string; kind: FindingKind; title: string; evidence?: Record<string, unknown>; groundQuote?: string; confidence: number; dedupKey: string; status?: FindingStatus },
): Promise<{ id: string; deduped: boolean; recurrence: number }> {
  const open = await db!.execute({
    sql: `SELECT id, recurrence FROM findings WHERE project_id=? AND dedup_key=? AND status IN ('queued','auto_filed','filed') ORDER BY created_at ASC LIMIT 1`,
    args: [projectId, input.dedupKey],
  })
  if (open.rows.length) {
    const id = String(open.rows[0].id); const recurrence = Number(open.rows[0].recurrence) + 1
    await db!.execute({ sql: `UPDATE findings SET recurrence=?, updated_at=? WHERE id=?`, args: [recurrence, Date.now(), id] })
    return { id, deduped: true, recurrence }
  }
  const id = uid("find_"); const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO findings (id, project_id, run_id, step_id, trail_id, kind, title, evidence_json, ground_quote, confidence, dedup_key, recurrence, status, connector_ref, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?)`,
    args: [id, projectId, input.runId, input.stepId ?? null, input.trailId, input.kind, input.title, j(input.evidence), input.groundQuote ?? null, input.confidence, input.dedupKey, input.status ?? "queued", now, now],
  })
  return { id, deduped: false, recurrence: 1 }
}

export async function listFindings(projectId: string, opts?: { status?: FindingStatus }): Promise<Finding[]> {
  const r = opts?.status
    ? await db!.execute({ sql: `SELECT * FROM findings WHERE project_id=? AND status=? ORDER BY updated_at DESC`, args: [projectId, opts.status] })
    : await db!.execute({ sql: `SELECT * FROM findings WHERE project_id=? ORDER BY updated_at DESC`, args: [projectId] })
  return r.rows.map(rowToFinding)
}

export async function setFindingStatus(projectId: string, id: string, status: FindingStatus, connectorRef?: string): Promise<void> {
  await db!.execute({
    sql: `UPDATE findings SET status=?, connector_ref=COALESCE(?, connector_ref), updated_at=? WHERE project_id=? AND id=?`,
    args: [status, connectorRef ?? null, Date.now(), projectId, id],
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test lib/trails.test.ts`
Expected: PASS (entire file green).

- [ ] **Step 5: Commit**

```bash
git add prototype/lib/trails.ts prototype/lib/trails.test.ts
git commit -m "feat(klavity-os): findings helpers with dedup/recurrence collapse"
```

---

## Self-Review

**Spec coverage (against §5 Data model):** `trails`, `trail_steps`, `locator_cache`, `trail_runs` (Walks), `run_steps`, `findings` — all six created (Task 2) and given helpers (Tasks 3–6). Project-scoping enforced on every helper (Global Constraints + cross-project isolation tests). `cacheKey` keyed on `SHA256(method, normalized-URL, DOM-hash, project)` per spec §2/§4 (Task 1). Dedup/recurrence reuse of the shipped suggested-bug behavior (spec §6) realized in Task 6. AMBER/verdict/diagnosis/tier columns present on `run_steps` for Plan B to populate. Out of scope for Plan A (correctly deferred to later plans): crystallizer/codegen, browser runner, Tier-0/1/2 heal logic, vision judge, auto-file gate, dashboard, `ai_calls` logging of new workloads, Steel infra.

**Placeholder scan:** No TBD/TODO; every code step has complete code and a concrete run command + expected output. No "add error handling" hand-waves.

**Type consistency:** Helper names are stable across tasks (`createTrail`, `addTrailStep`, `listTrailSteps`, `upsertLocatorCache`, `getLocatorByKey`, `getCacheForStep`, `startWalk`, `addRunStep`, `finishWalk`, `getWalk`, `listRunSteps`, `listWalks`, `recordFinding`, `listFindings`, `setFindingStatus`). Row→object mappers and `j()/pj()/uid()` helpers are defined once in Task 3 and reused (later tasks only add new mappers). Column names match between Task 2 schema and Tasks 3–6 SQL. `Verdict`/`Tier`/`FailureClass`/`FindingKind`/`FindingStatus` unions defined in Task 1 are the same ones imported later.

---

## Next plans (roadmap — not part of this plan)

- **Plan B — Crystallizer + codegen:** trajectory → canonical Trail steps + exportable Playwright/Bun code string + seeded `locator_cache`. Pure functions, `bun:test`, no browser.
- **Plan C — Runner + Tier 0/1 replay:** add Playwright/CDP (or Steel), execute a Trail against a local fixture page, zero-LLM cached replay + multi-candidate fallback, write `run_steps`.
- **Plan D — Tier 2 vision heal + diagnosis + verdicts + vision-judge oracle** (introduces `ai_calls` logging for `judge`/`reheal`).
- **Plan E — Findings gate + dashboard + connector wiring** (auto-file narrow/queue rest + precision metric).
- **Plan F — LLM-first authoring agent + extension recorder + hybrid auth (storageState).**
- **Plan G — Steel Browser infra + WAREX-style fault-injection harness.**
