# Klavity OS — Trails — Plan E: Findings Gate + Routes + Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Trails engine operable by a human: execute the findings gate (auto-file hard regressions to the project's connector / queue everything subjective), expose authenticated project-scoped HTTP routes, and ship a Trails dashboard (Walks with verdict pills, the review queue with heal-diffs + grounded evidence, file/dismiss actions, and a precision metric).

**Architecture:** A pure gate-decision + an **injectable filer** (mockable in tests, real connector adapter in prod) in `lib/trails-findings-gate.ts`; thin authenticated routes added to `server.ts` mirroring the existing `/api/dashboard` + `/api/projects/:id/connectors` patterns; a static `public/trails.html` served at `/trails` that hydrates from `/api/trails/dashboard`, mirroring `public/dashboard.html`. Reuses Layer A `findings`/`trail_runs`/`run_steps` helpers and the existing connectors subsystem (`lib/connectors/`, `listAutoCopyConnectors`, `getConnector`, `decryptSecret`). No new external dependencies.

**Tech Stack:** Bun 1.3.14, `bun:test`, `@libsql/client`, the existing `lib/connectors/*` adapters (Plane/GitHub/Jira/Linear/webhook). Route tests use the subprocess-server harness (`Bun.spawn(["bun","run","server.ts"])` + `fetch` with a `klav_session` cookie), exactly as `prototype/server.connectors.test.ts`.

## Global Constraints

- Worktree `/Users/vishalkumar/Downloads/qbug/klav-snap-wt-klavity-os-e`, branch `feat/klavity-os-trails-e-findings` (already carries A–D + the journey e2e; 48 tests green). Run only trails + the new E test files, never the ~80-file full suite.
- **Auto-file is narrow and evidence-typed** (spec §6): auto-file ONLY `kind:'regression'` findings, dedup-clean (`recurrence===1` at file time is not required, but never double-file an already-filed dedupKey), AND `confidence >= AUTO_FILE_THRESHOLD` (0.9). Everything else (`visual`, `amber_heal`) stays `queued`. A `regression` below threshold also queues.
- **Never lose the human gate:** filing sets status `filed` + `connector_ref`; dismiss sets `dismissed`. A `dismissed` finding is excluded from the precision numerator/denominator and never re-filed.
- Every route: authenticate `const me = (await sessionEmail(req)) || (await bearerEmail(req)); if(!me) return json({error:"Unauthorized"},401)`, resolve project `const resolved = await resolveProject(me, url.searchParams.get("project")); if(!resolved) return json({error:"No access"},403)`, then use `resolved.id` as `projectId`. Mutations (file/dismiss) require `resolved.access === 'admin'` OR membership — match the connectors-route convention (admin for connector mutations; finding file/dismiss = any member).
- Project-scope every DB call. Tests inject a mock filer; the real connector is exercised only behind the subprocess route test with a seeded fake connector OR a unit test with a stub adapter — NEVER a real Plane network call in CI.
- IDs/timestamps/JSON conventions per Layer A. Commit per task, specific files only (never `git add -A`).

> **Auto-file is intentionally inert in this slice.** `processWalkFindings` (the auto-file executor) is built and unit-tested but is **NOT wired into `walkTrail`/the runner**. The live path today is the **human review queue** (manual file/dismiss only) — a Walk never auto-files anything. Auto-file stays behind a **future per-project opt-in toggle**, and must ship together with the dismissed-dedup suppression in `recordFinding` (a dismissed `dedupKey` collapses onto its existing dismissed row on recurrence and is never resurrected to a fresh queued/auto-fileable finding — the §6 "a dismissed finding is never re-filed" guarantee). Review findings (2026-06-20) hardened this: `recordFinding` now includes `'dismissed'` in the open-dedup SELECT; `fileFindingById` files only a `'queued'` finding; `dismissFinding` acts only on an existing, in-project, `'queued'` finding (route 404 otherwise).

## File Structure

- `prototype/lib/trails-findings-gate.ts` (Create) — `decideFindingAction` (pure), `buildTicketFromFinding` (pure), `fileFindingToConnectors` (real filer), `processWalkFindings` (executor, injected filer), `fileFindingById`, `dismissFinding`, `projectPrecision`.
- `prototype/lib/trails-findings-gate.test.ts` (Create) — unit tests (mock filer).
- `prototype/lib/trails-dashboard.ts` (Create) — `trailsDashboardData(projectId)` aggregator (trails + recent walks + queued findings + precision) used by the route, unit-testable without HTTP.
- `prototype/lib/trails-dashboard.test.ts` (Create).
- `prototype/server.ts` (Modify) — add routes: `GET /api/trails/dashboard`, `POST /api/trails/findings/:id/file`, `POST /api/trails/findings/:id/dismiss`, and `GET /trails` (serve the page).
- `prototype/public/trails.html` (Create) — the dashboard page.
- `prototype/server.trails.test.ts` (Create) — subprocess-server route tests (seed DB, fetch with auth cookie).

---

### Task 1: Findings-gate decision + precision (pure, unit-tested)

**Files:** Create `prototype/lib/trails-findings-gate.ts`, `prototype/lib/trails-findings-gate.test.ts`

**Interfaces:**
- Consumes: `Finding`, `FindingKind` from `./trails-types`; Layer A `listFindings`, `setFindingStatus` from `./trails`.
- Produces:
  - `const AUTO_FILE_THRESHOLD = 0.9`
  - `function decideFindingAction(f: Pick<Finding,'kind'|'confidence'>, threshold?: number): 'auto_file' | 'queue'` — `auto_file` iff `kind==='regression' && confidence>=threshold`, else `queue`.
  - `async function projectPrecision(projectId: string): Promise<{ filed: number; dismissed: number; precision: number | null }>` — over findings with status in (`filed`,`auto_filed`,`dismissed`): `filed`=count not dismissed, `dismissed`=count dismissed, `precision = filed/(filed+dismissed)` or `null` if none. (Legit-bug rate.)

- [ ] **Step 1: Write the failing test**

```typescript
// prototype/lib/trails-findings-gate.test.ts
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-gate-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
let db: any
beforeAll(async () => { db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const T = await import("./trails")
const G = await import("./trails-findings-gate")

test("decideFindingAction: only high-confidence regressions auto-file", () => {
  expect(G.decideFindingAction({ kind: "regression", confidence: 0.95 })).toBe("auto_file")
  expect(G.decideFindingAction({ kind: "regression", confidence: 0.5 })).toBe("queue")
  expect(G.decideFindingAction({ kind: "amber_heal", confidence: 0.99 })).toBe("queue")
  expect(G.decideFindingAction({ kind: "visual", confidence: 0.99 })).toBe("queue")
})

test("projectPrecision = filed/(filed+dismissed), ignoring still-queued", async () => {
  const proj = "proj_prec"
  const walk = await T.startWalk(proj, "trl_x")
  const a = await T.recordFinding(proj, { runId: walk, trailId: "trl_x", kind: "regression", title: "A", confidence: 0.95, dedupKey: "a" })
  const b = await T.recordFinding(proj, { runId: walk, trailId: "trl_x", kind: "regression", title: "B", confidence: 0.95, dedupKey: "b" })
  const c = await T.recordFinding(proj, { runId: walk, trailId: "trl_x", kind: "regression", title: "C", confidence: 0.95, dedupKey: "c" })
  await T.setFindingStatus(proj, a.id, "filed")
  await T.setFindingStatus(proj, b.id, "filed")
  await T.setFindingStatus(proj, c.id, "dismissed")
  const p = await G.projectPrecision(proj)
  expect(p.filed).toBe(2); expect(p.dismissed).toBe(1); expect(p.precision).toBeCloseTo(2 / 3)
})
```

- [ ] **Step 2:** `cd prototype && bun test lib/trails-findings-gate.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```typescript
// prototype/lib/trails-findings-gate.ts
import type { Finding, FindingKind } from "./trails-types"
import { listFindings } from "./trails"

export const AUTO_FILE_THRESHOLD = 0.9

export function decideFindingAction(f: Pick<Finding, "kind" | "confidence">, threshold = AUTO_FILE_THRESHOLD): "auto_file" | "queue" {
  return f.kind === "regression" && f.confidence >= threshold ? "auto_file" : "queue"
}

export async function projectPrecision(projectId: string): Promise<{ filed: number; dismissed: number; precision: number | null }> {
  const all = await listFindings(projectId)
  const filed = all.filter((f) => f.status === "filed" || f.status === "auto_filed").length
  const dismissed = all.filter((f) => f.status === "dismissed").length
  const total = filed + dismissed
  return { filed, dismissed, precision: total ? filed / total : null }
}
```

- [ ] **Step 4:** `cd prototype && bun test lib/trails-findings-gate.test.ts` → PASS.
- [ ] **Step 5:** Commit `prototype/lib/trails-findings-gate.ts prototype/lib/trails-findings-gate.test.ts` — `feat(klavity-os): findings-gate decision + precision metric`.

---

### Task 2: Gate executor with injected filer (`processWalkFindings`, `fileFindingById`, `dismissFinding`)

**Files:** Modify `prototype/lib/trails-findings-gate.ts`; Test append to `prototype/lib/trails-findings-gate.test.ts`

**Interfaces:**
- Produces:
  - `type Filer = (projectId: string, finding: Finding) => Promise<{ connectorRef: string } | null>` — files one finding, returns the external ref (e.g. `plane:PROJ-42`) or null if no connector / failure.
  - `async function processWalkFindings(projectId: string, runId: string, deps: { filer: Filer; threshold?: number }): Promise<{ autoFiled: string[]; queued: string[] }>` — for each finding of this run (via `listFindings` filtered by runId), if `decideFindingAction==='auto_file'` AND not already filed, call `deps.filer`; on success `setFindingStatus(id,'auto_filed',connectorRef)` and push to autoFiled, else leave queued; non-regression/low-confidence → queued.
  - `async function fileFindingById(projectId: string, findingId: string, deps: { filer: Filer }): Promise<{ ok: boolean; connectorRef?: string }>` — human "file from queue": load finding, call filer, `setFindingStatus(id,'filed',ref)`.
  - `async function dismissFinding(projectId: string, findingId: string): Promise<void>` — `setFindingStatus(id,'dismissed')`.

- [ ] **Step 1: Test (append)** — mock filer; assert a regression@0.95 auto-files (status `auto_filed`, connector_ref set), an `amber_heal` stays queued, dismiss works.

```typescript
test("processWalkFindings auto-files high-confidence regressions, queues the rest", async () => {
  const proj = "proj_gate_exec"
  const walk = await T.startWalk(proj, "trl_g")
  await T.recordFinding(proj, { runId: walk, trailId: "trl_g", kind: "regression", title: "gone", confidence: 0.95, dedupKey: "g1" })
  await T.recordFinding(proj, { runId: walk, trailId: "trl_g", kind: "amber_heal", title: "unsure", confidence: 0.99, dedupKey: "g2" })
  const filer = async () => ({ connectorRef: "plane:PROJ-7" })
  const res = await G.processWalkFindings(proj, walk, { filer })
  expect(res.autoFiled).toHaveLength(1)
  expect(res.queued).toHaveLength(1)
  const filed = (await T.listFindings(proj, { status: "auto_filed" }))[0]
  expect(filed.connectorRef).toBe("plane:PROJ-7")
})

test("dismissFinding removes it from the queue and precision", async () => {
  const proj = "proj_gate_dismiss"
  const walk = await T.startWalk(proj, "trl_d")
  const f = await T.recordFinding(proj, { runId: walk, trailId: "trl_d", kind: "amber_heal", title: "x", confidence: 0.7, dedupKey: "d1" })
  await G.dismissFinding(proj, f.id)
  expect((await T.listFindings(proj, { status: "queued" })).some((x) => x.id === f.id)).toBe(false)
})
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement (append)**

```typescript
import type { Finding } from "./trails-types"
import { listFindings, setFindingStatus } from "./trails"

export type Filer = (projectId: string, finding: Finding) => Promise<{ connectorRef: string } | null>

export async function processWalkFindings(projectId: string, runId: string, deps: { filer: Filer; threshold?: number }): Promise<{ autoFiled: string[]; queued: string[] }> {
  const findings = (await listFindings(projectId)).filter((f) => f.runId === runId && f.status === "queued")
  const autoFiled: string[] = []; const queued: string[] = []
  for (const f of findings) {
    if (decideFindingAction(f, deps.threshold) === "auto_file") {
      const r = await deps.filer(projectId, f).catch(() => null)
      if (r) { await setFindingStatus(projectId, f.id, "auto_filed", r.connectorRef); autoFiled.push(f.id); continue }
    }
    queued.push(f.id)
  }
  return { autoFiled, queued }
}

export async function fileFindingById(projectId: string, findingId: string, deps: { filer: Filer }): Promise<{ ok: boolean; connectorRef?: string }> {
  const f = (await listFindings(projectId)).find((x) => x.id === findingId)
  if (!f) return { ok: false }
  const r = await deps.filer(projectId, f).catch(() => null)
  if (!r) return { ok: false }
  await setFindingStatus(projectId, findingId, "filed", r.connectorRef)
  return { ok: true, connectorRef: r.connectorRef }
}

export async function dismissFinding(projectId: string, findingId: string): Promise<void> {
  await setFindingStatus(projectId, findingId, "dismissed")
}
```

- [ ] **Step 4:** run → PASS. **Step 5:** Commit — `feat(klavity-os): findings-gate executor (auto-file/queue/dismiss) with injected filer`.

---

### Task 3: Real connector filer (`buildTicketFromFinding`, `planeFiler`)

**Files:** Modify `prototype/lib/trails-findings-gate.ts`; Test append (stub connector adapter — no network).

**Interfaces:**
- Consumes: `listAutoCopyConnectors`, `getConnectorById` from `./db`; `getConnector` from `./connectors`; `decryptSecret` from the connectors/crypto module (confirm the exact import path — the connectors route uses `encryptSecret`/`decryptSecret`).
- Produces:
  - `function buildTicketFromFinding(finding: Finding, baseUrl: string): TicketPayload` (pure) — title `"[Klavity Trails] " + finding.title`, body = grounded evidence (rationale/groundQuote + fromSelector→toSelector if present + run/step ids), `severity` from `finding.kind` (`regression`→`high`), `klavityUrl = ${baseUrl}/trails?project=${finding.projectId}`.
  - `const realFiler: Filer` — picks the project's first auto-copy connector (`listAutoCopyConnectors`), decrypts secrets, `getConnector(type).createIssue(buildTicketFromFinding(...), cfg)`, returns `{ connectorRef: `${type}:${externalKey}` }`; returns null if the project has no connector.

- [ ] **Step 1: Test (append)** — monkeypatch a fake connector adapter via dependency: since `realFiler` reads DB connectors + `getConnector`, the test seeds a connector row with type `webhook` and stubs `getConnector` is hard; instead test `buildTicketFromFinding` purely (asserts title/body contain the heal diff + groundQuote), and test `realFiler` returns null when the project has no connector. The end-to-end connector call is covered by the existing connectors tests; do NOT hit a network.

```typescript
test("buildTicketFromFinding embeds grounded evidence + heal diff", () => {
  const t = G.buildTicketFromFinding({
    id: "find_1", projectId: "proj_z", runId: "walk_1", stepId: "tstep_1", trailId: "trl_1",
    kind: "regression", title: "Checkout button gone", evidence: { fromSelector: "#checkout", toSelector: null, rationale: "no checkout affordance" },
    groundQuote: "no checkout affordance", confidence: 0.95, dedupKey: "k", recurrence: 1, status: "queued", connectorRef: null, createdAt: 1, updatedAt: 1,
  } as any, "https://klavity.quantana.top")
  expect(t.title).toContain("Checkout button gone")
  expect(t.body).toContain("no checkout affordance")
  expect(t.klavityUrl).toContain("/trails?project=proj_z")
})

test("realFiler returns null when the project has no auto-copy connector", async () => {
  const r = await G.realFiler("proj_no_connector", { id: "find_x" } as any)
  expect(r).toBeNull()
})
```

- [ ] **Step 2:** run → FAIL. **Step 3: Implement** (read `lib/connectors/index.ts` for `TicketPayload`/`getConnector`, and the connectors route in server.ts for the exact `decryptSecret` import + decrypt loop; mirror it). **Step 4:** PASS. **Step 5:** Commit — `feat(klavity-os): real connector filer for Trail findings (Plane/etc.)`.

---

### Task 4: Dashboard aggregator + HTTP routes

**Files:** Create `prototype/lib/trails-dashboard.ts` (+test); Modify `prototype/server.ts`; Create `prototype/server.trails.test.ts`.

**Interfaces:**
- `lib/trails-dashboard.ts`: `async function trailsDashboardData(projectId: string): Promise<{ trails: Trail[]; recentWalks: Walk[]; queue: Finding[]; precision: {...} }>` — `listTrails` + recent `trail_runs` across the project (add a Layer A helper `listRecentWalks(projectId, limit)` if needed) + `listFindings(projectId,{status:'queued'})` + `projectPrecision`. Unit-tested with seeded rows.
- `server.ts` routes (mirror `/api/dashboard` + connectors patterns verbatim — auth, resolveProject, `json()`):
  - `GET /api/trails/dashboard` → `json({ email: me, project:{id,role}, ...await trailsDashboardData(projectId) })`.
  - `POST /api/trails/findings/:id/file` → body `{}`; `fileFindingById(projectId, id, { filer: realFiler })`; 200 `{ok, connectorRef}` or 400.
  - `POST /api/trails/findings/:id/dismiss` → `dismissFinding`; 200 `{ok:true}`.
  - `GET /trails` → `me ? file(PUB + "/trails.html") : redirect("/login")`.

- [ ] **Step 1: Route test (subprocess harness)** — copy the setup of `prototype/server.connectors.test.ts`: spawn the server against a temp DB, seed a user+session+project, seed (via the Layer A helpers run against the same DB file, or raw SQL) a trail + a walk + a queued `amber_heal` finding + a `regression` finding. Then:

```typescript
test("GET /api/trails/dashboard returns trails, walks, queue, precision (project-scoped, authed)", async () => {
  const r = await api("GET", `/api/trails/dashboard?project=${PROJECT_ID}`, null, MEMBER_SID)
  expect(r.status).toBe(200)
  const b = await r.json()
  expect(Array.isArray(b.trails)).toBe(true)
  expect(Array.isArray(b.queue)).toBe(true)
  expect(b.precision).toBeDefined()
})
test("GET /api/trails/dashboard is 401 without a session", async () => {
  const r = await fetch(`${BASE}/api/trails/dashboard?project=${PROJECT_ID}`)
  expect(r.status).toBe(401)
})
test("POST /api/trails/findings/:id/dismiss removes it from the queue", async () => {
  const r = await api("POST", `/api/trails/findings/${QUEUED_FINDING_ID}/dismiss`, {}, MEMBER_SID)
  expect(r.status).toBe(200)
  const after = await api("GET", `/api/trails/dashboard?project=${PROJECT_ID}`, null, MEMBER_SID)
  const b = await after.json()
  expect(b.queue.some((f: any) => f.id === QUEUED_FINDING_ID)).toBe(false)
})
```

> Seeding note: the simplest seed is to run `applySchema`+`migrateV2` then the Layer A helpers (`createTrail`, `startWalk`, `recordFinding`) against the SAME temp DB file BEFORE spawning the server (the server opens the same `file:` DB). Mirror how `server.connectors.test.ts` seeds users/sessions/projects via raw SQL; reuse its `api()` cookie helper and readiness poll.

- [ ] **Step 2:** run → FAIL (routes 404). **Step 3:** add the routes in server.ts (find the `/api/dashboard` block and add adjacent; add `GET /trails` near the other page routes). Import `trailsDashboardData`, `fileFindingById`, `dismissFinding`, `realFiler`. **Step 4:** run → PASS. **Step 5:** Commit `prototype/lib/trails-dashboard.ts prototype/lib/trails-dashboard.test.ts prototype/server.ts prototype/server.trails.test.ts` — `feat(klavity-os): Trails dashboard API routes (read/file/dismiss)`.

---

### Task 5: Dashboard page (`public/trails.html`)

**Files:** Create `prototype/public/trails.html`; the `GET /trails` route was added in Task 4.

**Interfaces:** A static page mirroring `public/dashboard.html` conventions (same theme/header/project-select; `fetch("/api/trails/dashboard?project=…")` with credentials; 401→`/login`). Renders: a **precision banner** (legit-bug rate), a **Walks** list with verdict pills (GREEN/AMBER/RED), and a **review queue** of findings each showing kind, title, grounded evidence, the heal **from→to** diff when present, and **File** / **Dismiss** buttons calling `POST /api/trails/findings/:id/{file,dismiss}`.

- [ ] **Step 1:** Create `public/trails.html` following the `dashboard.html` structure (copy its `<head>`/theme + header + project-select; replace the body render with trails/walks/queue). Wire File/Dismiss buttons to the two POST routes; re-`load()` on success.
- [ ] **Step 2: Smoke test** — add to `server.trails.test.ts`:

```typescript
test("GET /trails serves the dashboard page when authed", async () => {
  const r = await fetch(`${BASE}/trails`, { headers: { Cookie: `klav_session=${MEMBER_SID}` } })
  expect(r.status).toBe(200)
  const html = await r.text()
  expect(html).toContain("Trails")
  expect(html).toContain("/api/trails/dashboard")
})
```

- [ ] **Step 3:** run the full E test set: `cd prototype && bun test lib/trails-findings-gate.test.ts lib/trails-dashboard.test.ts server.trails.test.ts` → PASS, plus re-run the trails engine suite (8 files) to confirm no regression. **Step 4:** Commit `prototype/public/trails.html prototype/server.trails.test.ts` — `feat(klavity-os): Trails dashboard page (walks, review queue, heal-diffs, file/dismiss)`.

---

## Self-Review

**Spec coverage:** findings-gate execution — auto-file narrow/evidence-typed regressions, queue subjective (spec §6) — Tasks 1–2. Grounded ticket from a finding via the existing connectors (Plane) — Task 3. Human-gated file/dismiss + the AMBER review queue — Tasks 2,4,5. Published precision metric (legit-bug rate) — Tasks 1,4,5. Project-scoped authed routes mirroring the established pattern — Task 4. Dashboard surfacing Walks/verdicts/heal-diffs/queue — Task 5. **Out of scope (deferred):** server-side walk-trigger route + browser pool (the walk is proven via the journey e2e; triggering belongs with Steel infra, Plan G) and LLM-first authoring (Plan F); per-project gate settings table (threshold is the 0.9 constant with a `threshold` param hook).

**Placeholder scan:** lib gate code is complete; route + page tasks reference the verified existing patterns (`/api/dashboard`, `server.connectors.test.ts`, `dashboard.html`) with representative code and exact seeding/auth instructions — the implementer mirrors real files, not placeholders.

**Type consistency:** `Filer`, `decideFindingAction`, `processWalkFindings`, `fileFindingById`, `dismissFinding`, `projectPrecision`, `buildTicketFromFinding`, `realFiler`, `trailsDashboardData` are referenced consistently across tasks. `FindingStatus` values (`queued`/`auto_filed`/`filed`/`dismissed`) match Layer A. `TicketPayload`/`getConnector`/`createIssue` match `lib/connectors/index.ts`.

---

## After build: merge + deploy (separate, user-confirmed step)
Merge order onto `master` (each fast-forward, full suite green): `feat/klavity-os-trails` → `…-d-vision` → `…-e-findings`. Then deploy per the project runbook (commit→push master→ssh pull → **`systemctl restart klav` as root** + poll health ~10s). Do NOT deploy until the user confirms.
