# Klavity OS — Trails — Plan G: Server-side Walk-Trigger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trigger a Trail walk on-demand from the server, run it safely (concurrency=1, low-memory Chromium, hard deadline) on the prod box, and seed demo Trails so `/trails` shows real Walks → verdicts → heal-diffs → rrweb replays.

**Architecture:** A global single-slot mutex + a prod-safe Chromium launch config gate the existing `walkTrail()`. A thin `runWalkNow()` trigger creates the Walk, kicks `walkTrail` off in the background (crash-isolated), and returns `runId` immediately; the dashboard polls until the verdict lands. Demo Trails (fixture GREEN/AMBER/RED + one real-site dogfood) are seeded idempotently and the fixtures are served from `public/trails-demo/`.

**Tech Stack:** Bun 1.3.14, `bun:test`, Playwright (real Chromium), `@libsql/client`. Builds on the shipped Trails engine (`lib/trails*.ts`, v0.27.0).

## Global Constraints

- Worktree `/Users/vishalkumar/Downloads/qbug/klav-snap-wt-klavity-os-g`, branch `feat/klavity-os-trails-g-walktrigger` (off master `2ea7700`). Backend `prototype/`. Tests: `cd prototype && bun test <file>`; run only the trails/G files, never the ~90-file full suite.
- **Concurrency = 1 (hard).** At most one Walk runs at a time, enforced by a module-level mutex. A 2nd trigger → `409`, never a 2nd browser. This is the load-bearing prod-safety guard on the 1GB box.
- **Prod-safe Chromium:** launch headless with `--single-process --no-sandbox --disable-dev-shm-usage --disable-gpu --no-zygote`; a **hard per-walk deadline (default 120000ms)** finalizes the Walk RED and stops; the browser is **always closed in `finally`**; a walk crash must **never** propagate to the server event loop (finalize RED + release slot).
- **Triggered walks capture replay** (`replay: true`). **Vision (Tier-2) is off by default** and only passed for a Trail explicitly flagged to allow it (the `demo-regression` Trail), logged in `ai_calls` under the daily cap.
- Routes authenticate `(await sessionEmail(req)) || (await bearerEmail(req))` (401) then `resolveProject` (403/404) before acting, mirroring the existing `/api/trails/*` routes. Project-scope every DB call.
- Do NOT change existing Trails-engine behavior; additive only. Commit per task, specific files only (never `git add -A`).

---

## File Structure

- `prototype/lib/trails-browser.ts` (Create) — the single-slot mutex (`withWalkSlot`, `WalkBusyError`, `isWalkInFlight`) + `CHROMIUM_PROD_ARGS`.
- `prototype/lib/trails-runner.ts` (Modify) — add `launchArgs?` + `deadlineMs?` to `WalkOptions`; pass `launchArgs` to `chromium.launch`; enforce `deadlineMs` in the step loop.
- `prototype/lib/trails-trigger.ts` (Create) — `runWalkNow()` (injectable walk fn) + the default real-`walkTrail` binding.
- `prototype/lib/trails-demo-seed.ts` (Create) — `seedDemoTrails(projectId)` (idempotent) + the demo trajectories.
- `prototype/public/trails-demo/**` (Create) — copies of the journey fixtures, served by the app.
- `prototype/server.ts` (Modify) — `POST /api/trails/:id/walk` route + a static `/trails-demo/*` route + a boot call to `seedDemoTrails` (env-gated).
- `prototype/public/trails.html` (Modify) — a "▶ Run" button per Trail + poll + render verdict/heal-diff/replay.
- Test files: `lib/trails-browser.test.ts`, `lib/trails-trigger.test.ts`, `lib/trails-demo-seed.test.ts`, `lib/trails-trigger.e2e.test.ts`, and additions to `server.trails.test.ts`.

---

### Task 1: Single-slot mutex + prod Chromium args

**Files:** Create `prototype/lib/trails-browser.ts`, `prototype/lib/trails-browser.test.ts`

**Interfaces:**
- Produces:
  - `class WalkBusyError extends Error` (name `"WalkBusyError"`)
  - `function isWalkInFlight(): boolean`
  - `async function withWalkSlot<T>(fn: () => Promise<T>): Promise<T>` — if a walk is in flight, throw `WalkBusyError`; else set the flag, run `fn`, clear the flag in `finally`.
  - `const CHROMIUM_PROD_ARGS: string[]` = the five low-memory flags.

- [ ] **Step 1: Write the failing test**

```typescript
// prototype/lib/trails-browser.test.ts
import { test, expect } from "bun:test"
import { withWalkSlot, isWalkInFlight, WalkBusyError, CHROMIUM_PROD_ARGS } from "./trails-browser"

test("withWalkSlot runs the fn and clears the slot after", async () => {
  expect(isWalkInFlight()).toBe(false)
  const r = await withWalkSlot(async () => { expect(isWalkInFlight()).toBe(true); return 42 })
  expect(r).toBe(42)
  expect(isWalkInFlight()).toBe(false)
})

test("a second concurrent withWalkSlot throws WalkBusyError (max 1)", async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>((res) => { release = res })
  const first = withWalkSlot(async () => { await gate; return "a" })
  await Promise.resolve() // let `first` acquire the slot
  await expect(withWalkSlot(async () => "b")).rejects.toBeInstanceOf(WalkBusyError)
  release()
  expect(await first).toBe("a")
  expect(isWalkInFlight()).toBe(false)
})

test("the slot is released even if fn throws", async () => {
  await expect(withWalkSlot(async () => { throw new Error("boom") })).rejects.toThrow("boom")
  expect(isWalkInFlight()).toBe(false)
})

test("CHROMIUM_PROD_ARGS carries the low-memory flags", () => {
  for (const a of ["--single-process", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote"]) {
    expect(CHROMIUM_PROD_ARGS).toContain(a)
  }
})
```

- [ ] **Step 2: Run → FAIL** — `cd prototype && bun test lib/trails-browser.test.ts` → `Cannot find module "./trails-browser"`.

- [ ] **Step 3: Implement**

```typescript
// prototype/lib/trails-browser.ts
// Single-slot mutex + prod-safe Chromium args. The 1GB app box can run exactly ONE walk at a time;
// a second trigger is rejected (never a 2nd browser). Keep this the single seam for where/how
// browsers launch, so walks can later be moved to a separate worker by editing only this file.
export class WalkBusyError extends Error {
  constructor() { super("A walk is already running"); this.name = "WalkBusyError" }
}

let _inFlight = false
export function isWalkInFlight(): boolean { return _inFlight }

export async function withWalkSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (_inFlight) throw new WalkBusyError()
  _inFlight = true
  try { return await fn() } finally { _inFlight = false }
}

export const CHROMIUM_PROD_ARGS: string[] = [
  "--single-process", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote",
]
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `lib/trails-browser.ts lib/trails-browser.test.ts` — `feat(klavity-os): single-slot walk mutex + prod chromium args`.

---

### Task 2: Prod knobs on the runner (`launchArgs`, `deadlineMs`)

**Files:** Modify `prototype/lib/trails-runner.ts`; Test `prototype/lib/trails-runner-deadline.test.ts` (new)

**Interfaces:**
- Modifies `WalkOptions` (add two optional fields; existing callers unaffected):
  - `launchArgs?: string[]` — passed to `chromium.launch({ args })`.
  - `deadlineMs?: number` — wall-clock budget for the whole walk; when exceeded, the step loop stops and the Walk finalizes `red` with `summary.error = "deadline_exceeded"`.

- [ ] **Step 1: Write the failing test** (real Chromium; a 1ms deadline against the multi-step journey must finalize fast, not hang)

```typescript
// prototype/lib/trails-runner-deadline.test.ts
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join, resolve } from "node:path"; import { pathToFileURL } from "node:url"
const file = join(tmpdir(), `klav-deadline-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
beforeAll(async () => { const db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const { crystallize } = await import("./trails-crystallize")
const { walkTrail } = await import("./trails-runner")
const T = await import("./trails")

const landing = (dir: string) => pathToFileURL(resolve(import.meta.dir, "..", "test-fixtures", dir, "landing.html")).href

test("deadlineMs finalizes the walk red instead of running every step", async () => {
  const base = landing("journey")
  const { trailId } = await crystallize("proj_dl", {
    name: "DL", baseUrl: base, authorKind: "llm",
    steps: [
      { action: "click", url: base, domHash: "landing", target: { role: "button", accessibleName: "Start", text: "Start", testId: "start-link", resolvedSelector: "#start" } },
      { action: "assert", checkpoint: { description: "order confirmation shown" }, url: base, domHash: "confirm", target: { role: "heading", accessibleName: "Order confirmed", text: "Order confirmed", testId: "order-confirmation", resolvedSelector: "#order-confirmation" } },
    ],
  })
  const summary = await walkTrail("proj_dl", trailId, { fixtureUrl: landing("journey"), deadlineMs: 1 })
  expect(summary.verdict).toBe("red")
  const walk = await T.getWalk("proj_dl", summary.runId)
  expect(walk?.status).toBe("red")
  expect((walk?.summary as any)?.error).toContain("deadline")
}, 30000)
```

- [ ] **Step 2: Run → FAIL** (`deadlineMs` ignored → walk runs to completion / not red).

- [ ] **Step 3: Implement** — in `lib/trails-runner.ts`: (a) add `launchArgs?: string[]` and `deadlineMs?: number` to the `WalkOptions` interface; (b) change the `chromium.launch(...)` call inside `walkTrail` to `chromium.launch({ headless: opts.headless !== false, args: opts.launchArgs })`; (c) in the step `for` loop, compute `const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity` before the loop, and at the **top of each iteration** `if (Date.now() > deadline) { walkVerdict = "red"; deadlineHit = true; break }`; after the loop, if `deadlineHit`, pass `summary: { error: "deadline_exceeded" }` (merged with any existing summary) to `finishWalk` and set the returned verdict `red`. Keep all existing finalize/`finally`-close behavior. (Read the current loop + `finishWalk` call to merge cleanly.)

- [ ] **Step 4: Run → PASS**, then re-run the journey suite to prove no regression: `cd prototype && bun test lib/trails-runner.e2e.test.ts lib/trails-journey.e2e.test.ts` → all green.

- [ ] **Step 5: Commit** `lib/trails-runner.ts lib/trails-runner-deadline.test.ts` — `feat(klavity-os): walk launchArgs + hard deadline (prod safety)`.

---

### Task 3: `runWalkNow` trigger (injectable, crash-isolated)

**Files:** Create `prototype/lib/trails-trigger.ts`, `prototype/lib/trails-trigger.test.ts`

**Interfaces:**
- Consumes: `withWalkSlot`/`WalkBusyError`/`CHROMIUM_PROD_ARGS` from `./trails-browser`; `getTrail`/`startWalk`/`finishWalk` from `./trails`; `walkTrail` from `./trails-runner`.
- Produces:
  - `type WalkFn = (projectId: string, trailId: string, runId: string) => Promise<{ verdict: import("./trails-types").Verdict; llmCalls: number }>`
  - `async function runWalkNow(projectId: string, trailId: string, deps?: { walk?: WalkFn }): Promise<{ runId: string }>` — load the Trail (throw if missing); **acquire the slot** (`withWalkSlot`, surfacing `WalkBusyError`); inside the slot create the Walk (`startWalk`) and return `{ runId }` **after** kicking the walk off, BUT run the walk in the **background** so the caller isn't blocked. Because `withWalkSlot` releases on `fn` return, the slot must stay held for the *whole background walk* — so the shape is: `withWalkSlot(async () => { const runId = await startWalk(...); await runWalk })` won't return early. Instead: acquire the slot manually-equivalent by having `runWalkNow` do the slot+walk in one async chain it does NOT await, and resolve `{runId}` via a short pre-step. See implementation.

- [ ] **Step 1: Write the failing test** (stub walk fn — no browser)

```typescript
// prototype/lib/trails-trigger.test.ts
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-trigger-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
beforeAll(async () => { const db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const T = await import("./trails")
const { runWalkNow } = await import("./trails-trigger")
const { WalkBusyError, isWalkInFlight } = await import("./trails-browser")

async function seedTrail() {
  return T.createTrail("proj_t", { name: "T", baseUrl: "https://app.test/", authorKind: "llm" })
}
const waitFor = async (pred: () => Promise<boolean>) => { for (let i = 0; i < 100; i++) { if (await pred()) return; await new Promise(r => setTimeout(r, 20)) } throw new Error("timeout") }

test("runWalkNow returns a runId immediately and finalizes the verdict in the background", async () => {
  const trail = await seedTrail()
  const okWalk = async (_p: string, _t: string, _r: string) => ({ verdict: "green" as const, llmCalls: 0 })
  const { runId } = await runWalkNow("proj_t", trail, { walk: okWalk })
  expect(runId).toMatch(/^walk_/)
  // verdict lands async
  await waitFor(async () => (await T.getWalk("proj_t", runId))?.status === "green")
  expect(isWalkInFlight()).toBe(false)
})

test("a 2nd runWalkNow while one is in flight throws WalkBusyError", async () => {
  const trail = await seedTrail()
  let release: () => void = () => {}; const gate = new Promise<void>(r => { release = r })
  const slowWalk = async () => { await gate; return { verdict: "green" as const, llmCalls: 0 } }
  const first = await runWalkNow("proj_t", trail, { walk: slowWalk })
  expect(first.runId).toBeTruthy()
  await expect(runWalkNow("proj_t", trail, { walk: async () => ({ verdict: "green", llmCalls: 0 }) })).rejects.toBeInstanceOf(WalkBusyError)
  release()
  await waitFor(async () => (await T.getWalk("proj_t", first.runId))?.status === "green")
})

test("a walk that throws finalizes the run red and releases the slot (crash isolation)", async () => {
  const trail = await seedTrail()
  const { runId } = await runWalkNow("proj_t", trail, { walk: async () => { throw new Error("kaboom") } })
  await waitFor(async () => (await T.getWalk("proj_t", runId))?.status === "red")
  expect(isWalkInFlight()).toBe(false)
})

test("runWalkNow throws on an unknown trail", async () => {
  await expect(runWalkNow("proj_t", "trl_nope")).rejects.toThrow()
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```typescript
// prototype/lib/trails-trigger.ts
import { withWalkSlot, WalkBusyError, CHROMIUM_PROD_ARGS } from "./trails-browser"
import { getTrail, startWalk, finishWalk } from "./trails"
import { walkTrail } from "./trails-runner"
import type { Verdict } from "./trails-types"

export type WalkFn = (projectId: string, trailId: string, runId: string) => Promise<{ verdict: Verdict; llmCalls: number }>

const WALK_DEADLINE_MS = 120_000

// Default real walk: drive the Trail's own baseUrl with prod-safe Chromium + replay capture.
// Vision is OFF here; the route opts a flagged Trail into it explicitly.
const realWalk: WalkFn = async (projectId, trailId, _runId) => {
  const trail = await getTrail(projectId, trailId)
  if (!trail) return { verdict: "red", llmCalls: 0 }
  const s = await walkTrail(projectId, trailId, {
    fixtureUrl: trail.baseUrl, replay: true, launchArgs: CHROMIUM_PROD_ARGS, deadlineMs: WALK_DEADLINE_MS,
  })
  return { verdict: s.verdict, llmCalls: s.llmCalls }
}

export async function runWalkNow(
  projectId: string, trailId: string, deps?: { walk?: WalkFn },
): Promise<{ runId: string }> {
  const trail = await getTrail(projectId, trailId)
  if (!trail) throw new Error("trail not found")
  if (require("./trails-browser").isWalkInFlight?.() ) {/* fast path below also guards */}

  // Reserve the slot and create the run BEFORE returning, so the caller gets a real runId and a
  // 2nd concurrent call sees the slot held. The background promise holds the slot for the whole walk.
  let runId = ""
  let started = false
  const slotHeld = withWalkSlot(async () => {
    runId = await startWalk(projectId, trailId)
    started = true
    const walk = deps?.walk ?? realWalk
    try {
      const { verdict, llmCalls } = await walk(projectId, trailId, runId)
      await finishWalk(projectId, runId, { status: verdict, llmCalls })
    } catch (e: any) {
      await finishWalk(projectId, runId, { status: "red", llmCalls: 0, summary: { error: String(e?.message || e) } }).catch(() => {})
    }
  })
  // Surface WalkBusyError synchronously; otherwise wait only until the run row exists.
  slotHeld.catch(() => {}) // prevent unhandled rejection; the inner try/catch already finalized
  await Promise.race([
    slotHeld.then(() => {}, (err) => { if (err instanceof WalkBusyError) throw err }),
    (async () => { for (let i = 0; i < 250 && !started; i++) await new Promise(r => setTimeout(r, 4)) })(),
  ])
  if (!started) {
    // slotHeld rejected before starting → it was busy (or trail vanished); rethrow the real cause.
    await slotHeld.catch((e) => { throw e })
  }
  return { runId }
}
```

> NOTE to implementer: the concurrency-vs-return-runId timing is the subtle part. The intent: (1) a `WalkBusyError` from a 2nd call must reject the *2nd* `runWalkNow` promise; (2) a successful call resolves `{runId}` as soon as `startWalk` has created the row, while the walk continues in the background holding the slot. Verify all four tests pass; if the `Promise.race` shape is awkward in practice, an equivalent that satisfies the tests is fine (e.g. a deferred that resolves on `started`). Remove the dead `require(...)` probe line — it's only a reminder that `isWalkInFlight` exists.

- [ ] **Step 4: Run → PASS** (all four). **Step 5: Commit** `lib/trails-trigger.ts lib/trails-trigger.test.ts` — `feat(klavity-os): runWalkNow trigger (slot-guarded, crash-isolated, async)`.

---

### Task 4: Demo fixtures served + idempotent seed

**Files:** Create `prototype/public/trails-demo/**` (copy fixtures), `prototype/lib/trails-demo-seed.ts`, `prototype/lib/trails-demo-seed.test.ts`; Modify `prototype/server.ts` (static route only in this task)

**Interfaces:**
- Produces: `async function seedDemoTrails(projectId: string, baseUrl: string): Promise<{ created: number; trailIds: Record<string, string> }>` — idempotently create the demo Trails for `projectId` (skip any whose `name` already exists for the project). `baseUrl` is the app origin (e.g. `https://klavity.quantana.top`) used to point fixture Trails at `/trails-demo/...`. Demo trails: `Demo · baseline` (GREEN), `Demo · drift (heals)` (Tier-1), `Demo · regression` (RED), `Dogfood · landing` (real public site).

- [ ] **Step 1: Copy the fixtures into public/ and add the static route**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-klavity-os-g/prototype
mkdir -p public/trails-demo
cp -R test-fixtures/journey public/trails-demo/journey
cp -R test-fixtures/journey-drift-t1 public/trails-demo/journey-drift-t1
cp -R test-fixtures/journey-regression public/trails-demo/journey-regression
```

In `server.ts`, near the other `GET` static routes, add a sanitized static handler BEFORE the generic `/api/` gate:

```typescript
if (req.method === "GET" && path.startsWith("/trails-demo/")) {
  const rel = path.slice("/trails-demo/".length)
  if (rel.includes("..") || rel.includes("\\")) return new Response("Not found", { status: 404 })
  return new Response(Bun.file(PUB + "/trails-demo/" + rel), { headers: { "content-type": "text/html; charset=utf-8" } })
}
```

- [ ] **Step 2: Write the failing seed test**

```typescript
// prototype/lib/trails-demo-seed.test.ts
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-seed-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
beforeAll(async () => { const db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const T = await import("./trails")
const { seedDemoTrails } = await import("./trails-demo-seed")

test("seedDemoTrails is idempotent (run twice → one set) and points fixture trails at /trails-demo", async () => {
  const a = await seedDemoTrails("proj_seed", "https://klavity.test")
  expect(a.created).toBeGreaterThanOrEqual(3)
  const b = await seedDemoTrails("proj_seed", "https://klavity.test")
  expect(b.created).toBe(0) // nothing re-created
  const trails = await T.listTrails("proj_seed")
  const names = trails.map(t => t.name)
  expect(names).toContain("Demo · baseline")
  expect(names).toContain("Demo · drift (heals)")
  expect(names).toContain("Demo · regression")
  const baseline = trails.find(t => t.name === "Demo · baseline")!
  expect(baseline.baseUrl).toContain("/trails-demo/journey/landing.html")
})
```

- [ ] **Step 3: Run → FAIL.** **Step 4: Implement `lib/trails-demo-seed.ts`** — for each demo, check `listTrails(projectId)` for an existing trail with that `name`; if absent, `crystallize(projectId, traj)` with the journey trajectory shape (reuse the exact 7-step shape from `lib/trails-journey.e2e.test.ts`, with `baseUrl` = `${baseUrl}/trails-demo/journey/landing.html` etc.; the `Dogfood · landing` trail is a 1-step assert against `${realPublicUrl}` — keep it minimal, GREEN). Count newly-created. Return `{created, trailIds}`. (Read the journey e2e for the trajectory; the fixture Trails reuse it verbatim with the served URLs.)

- [ ] **Step 5: Run → PASS.** Add a `server.trails.test.ts` smoke that `GET /trails-demo/journey/landing.html` → 200. **Step 6: Commit** `public/trails-demo lib/trails-demo-seed.ts lib/trails-demo-seed.test.ts server.ts server.trails.test.ts` — `feat(klavity-os): served demo fixtures + idempotent demo-trail seed`.

---

### Task 5: `POST /api/trails/:id/walk` route + boot seed

**Files:** Modify `prototype/server.ts`; Test add to `prototype/server.trails.test.ts`

**Interfaces:** Route `POST /api/trails/:id/walk` — authed + project-scoped; calls `runWalkNow(projectId, trailId)`; `200 {runId}` / `409 {error}` on `WalkBusyError` / `401` / `404` unknown trail. Boot: if `process.env.TRAILS_DEMO_PROJECT_ID` is set, call `seedDemoTrails(that, KLAV_BASE_URL)` after `initDb()` (best-effort, logged).

- [ ] **Step 1: Route smoke tests** (subprocess server harness; mirror the existing `server.trails.test.ts` setup) — seed a trail; `POST /api/trails/<id>/walk?project=<P>` as a member → `200` with `runId` (stub: the trail's baseUrl is an unreachable `https://invalid.test/` so the background walk just finalizes red — the route still returns 200 quickly); no-session → `401`; unknown id → `404`. (A 409 unit-level case is already covered in `trails-trigger.test.ts`; a route-level 409 is timing-sensitive in a subprocess, so assert it at the trigger layer, not here.)

```typescript
// add to prototype/server.trails.test.ts
test("POST /api/trails/:id/walk triggers a walk and returns a runId (authed)", async () => {
  const r = await api("POST", `/api/trails/${TRAIL_ID}/walk?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(200)
  const b = await r.json(); expect(b.runId).toMatch(/^walk_/)
})
test("POST /api/trails/:id/walk is 401 without a session", async () => {
  const r = await fetch(`${BASE}/api/trails/${TRAIL_ID}/walk?project=${PROJECT_ID}`, { method: "POST" })
  expect(r.status).toBe(401)
})
test("POST /api/trails/:id/walk is 404 for an unknown trail", async () => {
  const r = await api("POST", `/api/trails/trl_nope/walk?project=${PROJECT_ID}`, {}, MEMBER_SID)
  expect(r.status).toBe(404)
})
```

> Seeding note: seed `TRAIL_ID` with `baseUrl: "https://invalid.test/"` so the spawned server's background walk fails fast (no Chromium needed in the route smoke — the route returns before the walk finishes). The walk's red finalize is irrelevant to the route assertions.

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** the route (mirror the `/api/trails/findings/:id/*` auth+resolveProject pattern; wrap `runWalkNow` in try/catch → `WalkBusyError` ⇒ 409, `"trail not found"` ⇒ 404). Add the env-gated boot seed after `initDb()`. **Step 4: Run → PASS.** **Step 5: Commit** `server.ts server.trails.test.ts` — `feat(klavity-os): POST /api/trails/:id/walk + boot demo seed`.

---

### Task 6: Real-Chromium e2e — trigger walks the served fixtures

**Files:** Create `prototype/lib/trails-trigger.e2e.test.ts`

**Interfaces:** Drives `runWalkNow` with the REAL `walkTrail` (no stub) against `file://` fixture URLs (the served-path equivalent), proving the trigger produces real verdicts + replays.

- [ ] **Step 1: Write the e2e** — seed the three fixture demo Trails via `seedDemoTrails("proj_e2e", pathToFileURL(resolve(import.meta.dir,"..","test-fixtures")).href.replace(/\/$/,""))` so their `baseUrl`s are `file://…/test-fixtures/journey/landing.html` etc. (the seed builds `${baseUrl}/journey/landing.html`; pass a `baseUrl` that makes that resolve to the local fixtures). Then for the baseline trail: `await runWalkNow("proj_e2e", id)`, poll `getWalk` until not `running`, assert `verdict==="green"` and `getReplay` returns ≥1 segment. Drift trail → `verdict==="amber"`, a run_step with `evidence.fromSelector`/`toSelector`. Regression trail → trigger via a variant of `runWalkNow` that injects a mock vision resolver returning `removed` (add a `deps.walk` that calls `walkTrail` with `vision`), assert `verdict==="red"` + a `regression` finding. Use the same fixtures + mock-vision approach as `lib/trails-journey.e2e.test.ts`. 60s timeouts.

> Because demo-seed builds URLs as `${baseUrl}/journey/landing.html`, pass `baseUrl = pathToFileURL(resolve(import.meta.dir,"..","test-fixtures")).href` (no trailing slash) so baseline resolves to the real local `test-fixtures/journey/landing.html`. Confirm by reading the seed's URL construction and matching it.

- [ ] **Step 2–4:** Run → iterate to green (real Chromium). **Step 5: Commit** `lib/trails-trigger.e2e.test.ts` — `test(klavity-os): trigger e2e — fixtures GREEN+replay / drift AMBER / regression RED`.

---

### Task 7: `/trails` Run button + poll + render

**Files:** Modify `prototype/public/trails.html`; Test add a smoke to `server.trails.test.ts`

**Interfaces:** Each Trail row gets a **"▶ Run"** button → `POST /api/trails/<id>/walk?project=<pid>`. On `200`, disable the button + show "running…" and poll `GET /api/trails/dashboard?project=<pid>` every ~1.5s until that Trail's latest Walk leaves `running`; then render the verdict pill (GREEN/AMBER/RED), the heal-diff (from the run_step evidence on AMBER), and the existing "▶ Replay" button (when `hasReplay`). On `409`, show a small "a walk is already running" notice.

- [ ] **Step 1: Implement** the button + poll loop in `trails.html`, mirroring the page's existing fetch/render conventions (read the file first). Reuse the existing replay-player modal from E2.
- [ ] **Step 2: Smoke** — add to `server.trails.test.ts`: `GET /trails` (authed) returns HTML containing `"/api/trails/"` and a Run affordance marker (e.g. `data-run-trail` or the text "Run"). 
- [ ] **Step 3: Run the full G + engine set** → green:
`cd prototype && bun test lib/trails-browser.test.ts lib/trails-runner-deadline.test.ts lib/trails-trigger.test.ts lib/trails-demo-seed.test.ts lib/trails-trigger.e2e.test.ts server.trails.test.ts lib/trails-journey.e2e.test.ts lib/trails-runner.e2e.test.ts`
- [ ] **Step 4: Commit** `public/trails.html server.trails.test.ts` — `feat(klavity-os): /trails Run button + live poll + verdict/heal-diff/replay`.

---

## Self-Review

**Spec coverage:** prod-safe browser + concurrency=1 (Task 1) + launchArgs/deadline (Task 2); `runWalkNow` async + crash-isolated (Task 3); served demo fixtures + idempotent seed of GREEN/AMBER/RED + dogfood (Task 4); `POST /api/trails/:id/walk` 200/409/401/404 + boot seed (Task 5); real-Chromium trigger e2e incl. replay + heal-diff + regression-finding (Task 6); `/trails` Run button + poll + render (Task 7). Vision-gating: realWalk passes no vision; the regression demo opts in via the route/seed flag (Task 6 injects mock vision in test; the route enables it only for the flagged Trail — implementer wires `runWalkNow`'s default to omit vision and the regression path to include it). Deferred per spec §8 (scheduled, authed-dogfood, worker box, Plan F) — not in any task. ✓

**Placeholder scan:** No TBD/TODO. The one soft spot is Task 3's `Promise.race` timing note — the tests pin the exact required behavior (4 cases), so "an equivalent that satisfies the tests" is a correctness instruction, not a placeholder. Remove the dead `require(...)` probe line during impl.

**Type consistency:** `withWalkSlot`/`WalkBusyError`/`isWalkInFlight`/`CHROMIUM_PROD_ARGS` (Task 1) used identically in Tasks 2–3. `WalkFn` / `runWalkNow` signatures stable (Task 3 → 5/6). `seedDemoTrails(projectId, baseUrl)` stable (Task 4 → 5/6). `WalkOptions.launchArgs/deadlineMs` (Task 2) consumed by `realWalk` (Task 3). Verdict union from `trails-types`.

---

## After build: merge + deploy (separate, user-confirmed)
Merge `feat/klavity-os-trails-g-walktrigger` → master (full suite green). Deploy delta vs a normal push: **install Chromium on the box** — `ssh root@66.135.20.62 'sudo -u klav bash -lc "cd /opt/klav/prototype && \$HOME/.bun/bin/bunx playwright install --with-deps chromium"'` — then the usual `git pull` + `bun install` + `systemctl restart klav`. Set `TRAILS_DEMO_PROJECT_ID` in `/etc/klav/klav.env` to the Default Project's id so the demo Trails seed on boot. Watch memory on the first triggered walk. Do NOT deploy without the user's go.
