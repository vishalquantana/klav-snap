# Klavity OS — Trails — Plan E2: rrweb Walk Replay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record each Walk as a Clarity-style **rrweb session replay** (DOM + pointer/scroll/input events) and let users scrub a smooth, video-like reconstruction of the test in the Trails dashboard — with the failing/heal step auto-highlighted — so they can *see* what happened and where it went wrong. Storage-efficient (gzipped JSON event stream, ~20-100× smaller than video) and the capture layer is reusable for the extension's real-session→persona pipeline later.

**Architecture:** During a Walk, the runner injects the rrweb recorder into the page via Playwright `addInitScript` (re-runs on every navigation) and collects events through an exposed binding. Because our journeys do full page navigations and rrweb records per-document, events are collected as **one segment per page**, tagged with the URL + the `run_step` idx at navigation time. Segments are gzipped and stored in a new `walk_replays` table via a Layer-A-style helper (S3 migration noted as a follow-up). A new authenticated route serves a Walk's replay; the dashboard embeds `rrweb-player`, plays segments sequentially as chapters, and seeks/highlights the RED/AMBER step. Capture is **opt-in per Walk** (`WalkOptions.replay`) and **default off**, so the existing 48-test engine suite is untouched.

**Tech Stack:** Bun 1.3.14, `bun:test`, Playwright (real Chromium), `@libsql/client`. New deps: `rrweb` (capture) + `rrweb-player` (replay). Gzip via Bun's `Bun.gzipSync`/`Bun.gunzipSync`.

## Global Constraints

- Worktree `/Users/vishalkumar/Downloads/qbug/klav-snap-wt-klavity-os-e`, branch `feat/klavity-os-trails-e-findings` (carries A–E, 48 engine + 21 E tests green). Run only trails/E/E2 test files, never the full suite.
- **Capture is opt-in and default-off:** `walkTrail` only records when `opts.replay === true` (or `opts.replaySink` is provided). With it off, behavior + the 48 engine tests are byte-unchanged. Capture must never break or slow the walk: event collection is best-effort and wrapped so a recorder error degrades to "no replay," never a failed Walk.
- **No new behavior in Layers A–D logic** beyond the additive capture hook in `walkTrail`'s browser setup and the new storage helper. Project-scope every DB call. Routes follow the established auth pattern (`sessionEmail||bearerEmail` + `resolveProject`, 401/403 before any read).
- **No real network in tests.** The rrweb capture runs against the local `file://` journey fixtures with real Chromium; storage is the local libsql DB. `rrweb-player` rendering is exercised only by a route/HTML smoke (the player is client JS).
- Privacy/masking (rrweb input masking for real-customer pages) is a documented **follow-up**, not in this slice (fixtures carry no sensitive data).
- IDs/timestamps/JSON per Layer A. Commit per task, specific files only (never `git add -A`).

## File Structure

- `prototype/package.json` (Modify) — add `rrweb` + `rrweb-player`.
- `prototype/lib/trails-replay.ts` (Create) — `setupReplayCapture(context)` (inject recorder + collector), `flushSegments()`, and the storage helpers `saveReplay`/`getReplay` (+ the `walk_replays` table added to `applySchema` in `lib/db.ts`).
- `prototype/lib/db.ts` (Modify) — `CREATE TABLE IF NOT EXISTS walk_replays`.
- `prototype/lib/trails-replay.test.ts` (Create) — storage round-trip (gzip) + capture unit (real Chromium against a fixture).
- `prototype/lib/trails-runner.ts` (Modify) — opt-in capture hook in `walkTrail`; after `finishWalk`, persist segments via `saveReplay`.
- `prototype/lib/trails-runner-replay.e2e.test.ts` (Create) — real-Chromium journey walked with `replay:true`; asserts per-page segments captured + the drift/heal step is identifiable.
- `prototype/server.ts` (Modify) — `GET /api/trails/walks/:runId/replay`.
- `prototype/public/trails.html` (Modify) — a "▶ Replay" affordance per Walk that loads `rrweb-player` with the segments, plays chapters, and highlights the failing step. Serve the rrweb-player assets (bundle/CDN-vendored locally per repo convention).
- `prototype/server.trails.test.ts` (Modify) — route smoke for the replay endpoint.

---

### Task 1: `walk_replays` storage + gzip round-trip helpers

**Files:** Modify `prototype/lib/db.ts` (schema); Create `prototype/lib/trails-replay.ts` (storage half) + `prototype/lib/trails-replay.test.ts`.

**Interfaces:**
- Schema: `walk_replays(id TEXT PK, run_id TEXT NOT NULL, project_id TEXT NOT NULL, segments_gz TEXT NOT NULL, n_segments INTEGER, n_events INTEGER, created_at INTEGER NOT NULL)` + `CREATE INDEX walk_replay_run_idx ON walk_replays(project_id, run_id)`.
- `interface ReplaySegment { idx: number; url: string; events: unknown[] }` (idx = the run_step idx at which this page began).
- `async function saveReplay(projectId, runId, segments: ReplaySegment[]): Promise<void>` — gzip `JSON.stringify(segments)` (`Bun.gzipSync` → base64) into `segments_gz`; store counts.
- `async function getReplay(projectId, runId): Promise<ReplaySegment[] | null>` — project-scoped read, gunzip+parse, or null.

- [ ] **Step 1: Failing test** — round-trip: save 2 segments with events, `getReplay` returns them intact; cross-project read returns null; `segments_gz` is smaller than the raw JSON (proves compression).

```typescript
// prototype/lib/trails-replay.test.ts (storage portion)
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-replay-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
let db: any
beforeAll(async () => { db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const R = await import("./trails-replay")

test("saveReplay/getReplay round-trips segments and compresses; project-scoped", async () => {
  const segs = [
    { idx: 0, url: "file:///landing.html", events: Array.from({ length: 50 }, (_, i) => ({ type: 3, t: i, d: "evt" })) },
    { idx: 5, url: "file:///cart.html", events: [{ type: 2, t: 999 }] },
  ]
  await R.saveReplay("proj_R", "walk_1", segs)
  const got = await R.getReplay("proj_R", "walk_1")
  expect(got).toHaveLength(2)
  expect(got![1].url).toContain("cart.html")
  expect(got![0].events).toHaveLength(50)
  expect(await R.getReplay("proj_OTHER", "walk_1")).toBeNull()
  const row = await db.execute({ sql: "SELECT segments_gz, n_events FROM walk_replays WHERE run_id=?", args: ["walk_1"] })
  expect(Number(row.rows[0].n_events)).toBe(51)
  expect(String(row.rows[0].segments_gz).length).toBeLessThan(JSON.stringify(segs).length) // compressed
})
```

- [ ] **Step 2:** run → FAIL. **Step 3:** add the table to `applySchema` (after the Layer-A trails tables) and implement `saveReplay/getReplay` in `trails-replay.ts`:

```typescript
// prototype/lib/trails-replay.ts (storage half)
import { db } from "./db"
export interface ReplaySegment { idx: number; url: string; events: unknown[] }

export async function saveReplay(projectId: string, runId: string, segments: ReplaySegment[]): Promise<void> {
  const json = JSON.stringify(segments)
  const gz = Buffer.from(Bun.gzipSync(Buffer.from(json))).toString("base64")
  const nEvents = segments.reduce((n, s) => n + (s.events?.length || 0), 0)
  await db!.execute({
    sql: `INSERT INTO walk_replays (id, run_id, project_id, segments_gz, n_segments, n_events, created_at) VALUES (?,?,?,?,?,?,?)`,
    args: ["rep_" + crypto.randomUUID(), runId, projectId, gz, segments.length, nEvents, Date.now()],
  })
}
export async function getReplay(projectId: string, runId: string): Promise<ReplaySegment[] | null> {
  const r = await db!.execute({ sql: `SELECT segments_gz FROM walk_replays WHERE project_id=? AND run_id=? ORDER BY created_at DESC LIMIT 1`, args: [projectId, runId] })
  if (!r.rows.length) return null
  const gz = Buffer.from(String((r.rows[0] as any).segments_gz), "base64")
  return JSON.parse(Buffer.from(Bun.gunzipSync(gz)).toString()) as ReplaySegment[]
}
```

- [ ] **Step 4:** run → PASS. **Step 5:** Commit `lib/db.ts lib/trails-replay.ts lib/trails-replay.test.ts` — `feat(klavity-os): walk_replays storage (gzipped rrweb segments)`.

---

### Task 2: rrweb capture wired into the runner (opt-in)

**Files:** Modify `prototype/lib/trails-replay.ts` (capture half) + `prototype/lib/trails-runner.ts`; Create `prototype/lib/trails-runner-replay.e2e.test.ts`. Add `rrweb`/`rrweb-player` to `package.json`.

**Interfaces:**
- `async function setupReplayCapture(context: BrowserContext): Promise<{ flush: (idx: number) => Promise<void>; segments: ReplaySegment[] }>` — uses `context.exposeBinding("__klavReplayPush", (_src, ev) => current.push(ev))` and `context.addInitScript(<inject rrweb.record that calls window.__klavReplayPush(event)>)`. On each navigation a fresh document re-runs the init script → a new recording; `flush(idx)` snapshots the events accumulated for the page just left into a `ReplaySegment{ idx, url, events }` and starts a fresh buffer. (Implementer: read `trails-runner.ts` to find where navigation happens — call `flush` at each navigation boundary and once at the end.)
- `walkTrail` opts: `replay?: boolean`. When set, before the step loop call `setupReplayCapture(context)`; capture the page URL at each navigation as a segment boundary; after `finishWalk`, `await saveReplay(projectId, runId, segments)`. Wrap ALL capture in try/catch so a recorder failure logs + yields no replay but never fails the Walk.
- rrweb is injected from its dist (vendor `node_modules/rrweb/dist/rrweb.min.js` content into the init script, or `addInitScript({ path })`).

- [ ] **Step 1: Failing e2e (real Chromium)** — walk the existing `journey-drift-t1` journey with `replay: true`; assert: a replay was saved for the run; `getReplay` returns ≥2 segments (multi-page); total events > 0; the segment whose `idx` is the Checkout/heal step (idx 5) exists; with `replay` OFF, `getReplay` returns null (default-off proof).

```typescript
// prototype/lib/trails-runner-replay.e2e.test.ts (sketch — adapt to the REAL crystallize/walkTrail signatures)
test("replay:true captures per-page rrweb segments for a multi-page walk", async () => {
  const projectId = "proj_replay_e2e"
  const { trailId } = await crystallize(projectId, journeyTrajectory()) // reuse the journey trajectory shape
  const summary = await walkTrail(projectId, trailId, { fixtureUrl: landingOf("journey-drift-t1"), replay: true })
  const segs = await R.getReplay(projectId, summary.runId)
  expect(segs).not.toBeNull()
  expect(segs!.length).toBeGreaterThanOrEqual(2)            // multiple pages recorded
  expect(segs!.reduce((n, s) => n + s.events.length, 0)).toBeGreaterThan(0)
}, 60000)

test("replay OFF (default) stores nothing — engine behavior unchanged", async () => {
  const projectId = "proj_replay_off"
  const { trailId } = await crystallize(projectId, journeyTrajectory())
  const summary = await walkTrail(projectId, trailId, { fixtureUrl: landingOf("journey") })
  expect(await R.getReplay(projectId, summary.runId)).toBeNull()
}, 60000)
```

- [ ] **Step 2:** `bun add rrweb rrweb-player`; run e2e → FAIL. **Step 3:** implement capture + the runner hook. **Step 4:** run e2e → PASS; then re-run the 48-engine suite to confirm **default-off** left it byte-green. **Step 5:** Commit `package.json lib/trails-replay.ts lib/trails-runner.ts lib/trails-runner-replay.e2e.test.ts` — `feat(klavity-os): opt-in rrweb capture during Walks (per-page segments)`.

---

### Task 3: Replay route + dashboard player

**Files:** Modify `prototype/server.ts` (route), `prototype/public/trails.html` (player UI), `prototype/server.trails.test.ts` (smoke). Vendor `rrweb-player` assets into `public/` per repo convention.

**Interfaces:**
- `GET /api/trails/walks/:runId/replay` → authed + project-scoped (`sessionEmail||bearerEmail`, `resolveProject`); returns `json({ runId, segments: await getReplay(projectId, runId), steps: await listRunSteps(projectId, runId) })` (steps included so the player can mark verdicts/heal/failure). 404 if no replay.
- `public/trails.html`: each Walk row gets a "▶ Replay" button (shown only when the walk has a replay — the dashboard data can include a `hasReplay` flag from `walk_replays`, or the button lazy-loads and hides on 404). Clicking opens a modal that instantiates `rrweb-player` with the concatenated segment events, plays them in order as chapters, renders a step timeline with GREEN/AMBER/RED pills, and **auto-seeks to + highlights the first AMBER/RED step** (the "where it went wrong" focus). For multi-page segments, advance the player segment-by-segment (new replayer per segment, or feed sequentially) with chapter markers.

- [ ] **Step 1: Route smoke (subprocess harness)** — extend `server.trails.test.ts`: seed a walk + a saved replay (call `saveReplay` against the same temp DB before spawning, or via a seeded row); `GET /api/trails/walks/:runId/replay` authed → 200 with `segments` array; unauth → 401; a runId with no replay → 404.
- [ ] **Step 2:** run → FAIL. **Step 3:** add the route (mirror the other `/api/trails/*` routes) + the `trails.html` player UI (mirror the existing modal/render conventions in the page) + vendor rrweb-player. **Step 4:** run the E2 set + a manual note that the player renders (client JS — assert the route returns segments and the page references `rrweb-player`). Re-run engine (48) + E (21). **Step 5:** Commit `server.ts public/trails.html server.trails.test.ts` (+ vendored assets) — `feat(klavity-os): Walk replay route + rrweb-player scrubber with failure highlight`.

---

## Self-Review

**Spec/ask coverage:** "show how tests are going with screen replays where something went wrong" → rrweb capture (Task 2) + scrubable player with auto-highlight of the failing/heal step (Task 3). Storage-efficient (gzipped segments, Task 1). Opt-in/default-off preserves the 48-engine green. Reuse note: the `setupReplayCapture` layer is the same rrweb foundation the extension can later use for real-session→persona capture (tracked in the backlog ticket). **Out of scope (follow-ups):** input masking for real-customer pages; S3 offload of `segments_gz` (DB blob is fine at test-walk volume); making capture default-on; the Playwright-video alternative (backlog).

**Placeholder scan:** storage code is complete; capture/runner/route/player tasks reference the real files to read (`trails-runner.ts` navigation points, `trails.html` modal conventions, the `/api/trails/*` route block) with representative code — the implementer adapts to the real signatures (e.g. the exact `crystallize`/`walkTrail`/`journeyTrajectory` shapes from the existing journey e2e), not placeholders.

**Type consistency:** `ReplaySegment`, `saveReplay`, `getReplay`, `setupReplayCapture` referenced consistently across tasks. `WalkOptions.replay` is additive; `listRunSteps` reused for the player timeline. Route shape matches the other `/api/trails/*` endpoints.

---

## After build
Re-run engine (48) + E (21) + E2 sets green, then this stack (A–E2) is ready for the user-confirmed **merge A–E2 → master → deploy** step. Do NOT merge/deploy without the user's go.
