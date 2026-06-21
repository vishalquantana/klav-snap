# Feedback Triage Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an internal triage gate so raw feedback lands as "needs triage" and a human accepts it as a bug or dismisses it before it counts as an open issue, with a clear Overview signal and a Triage inbox.

**Architecture:** `feedback.status` (free-text, default `'open'`) gains two values — `new` (needs triage) and `dismissed` (not a bug). New feedback is born `new` unless it's high-severity (auto-accepted as `open`); recurrence ×3 promotes `new → open`. Dashboard counts shift to count accepted bugs only and expose a `needsTriage` count. The UI gets a Triage inbox view + an Overview banner. A guarded one-time backfill re-triages existing rows.

**Tech Stack:** Bun + TypeScript server (`prototype/server.ts`), libsql/Turso DB (`prototype/lib/db.ts`), vanilla-JS dashboard (`prototype/public/dashboard.html`), `bun test` for unit tests.

## Global Constraints

- Do NOT bump versions or edit `package.json`/`CHANGELOG.md`/`docs/PRD.md` version lines — the orchestrator owns those.
- Work only on branch `feat/feedback-triage` in worktree `/Users/vishalkumar/Downloads/qbug/klav-snap-wt-feedback-triage`. All commands run from `prototype/`.
- `feedback.status` valid values after this change: `new`, `open`, `in_progress`, `done`, `dismissed`.
- Auto-accept rule (single source of truth): an item is an accepted bug at intake when `severity === 'high'`. Recurrence ≥ 3 promotes a still-`new` item to `open`.
- `dismissed` rows never contribute to any dashboard count.
- Run `bun test` (from `prototype/`) and ensure green before calling done; then `git fetch origin master && git rebase origin/master` and re-run.

---

### Task 1: Auto-accept status at feedback intake

**Files:**
- Modify: `prototype/lib/db.ts` — `insertFeedback` (~988-1006); add exported helper `initialFeedbackStatus`.
- Test: `prototype/lib/triage-status.test.ts` (create)

**Interfaces:**
- Produces: `initialFeedbackStatus(severity: string | null | undefined): "new" | "open"` — returns `"open"` when `severity === "high"`, else `"new"`. `insertFeedback` writes this into the `status` column.

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/triage-status.test.ts`:

```ts
import { test, expect } from "bun:test"
import { initialFeedbackStatus } from "./db"

test("high severity is auto-accepted as an open bug", () => {
  expect(initialFeedbackStatus("high")).toBe("open")
})

test("non-high severity lands in the triage queue as new", () => {
  expect(initialFeedbackStatus("medium")).toBe("new")
  expect(initialFeedbackStatus("low")).toBe("new")
  expect(initialFeedbackStatus(null)).toBe("new")
  expect(initialFeedbackStatus(undefined)).toBe("new")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/triage-status.test.ts`
Expected: FAIL — `initialFeedbackStatus is not a function` / not exported.

- [ ] **Step 3: Add the helper and wire it into insertFeedback**

In `prototype/lib/db.ts`, add above `insertFeedback`:

```ts
// Triage gate: new feedback is "new" (needs triage) unless it's a high-severity
// signal, which is auto-accepted straight to an open bug. Recurrence ≥3 promotes
// a still-"new" item later (see bumpFeedbackRecurrence).
export function initialFeedbackStatus(severity: string | null | undefined): "new" | "open" {
  return severity === "high" ? "open" : "new"
}
```

In `insertFeedback`, add `status` to the INSERT. Change the SQL column list to include `status` and add the value. Replace the existing INSERT call:

```ts
  const status = initialFeedbackStatus(f.severity)
  await db!.execute({
    sql: `INSERT INTO feedback (id,project_id,sim_id,actor_email,url_host,url_path,observation,sentiment,severity,
          screenshot_id,suggested_bug_json,cited_trait_ids_json,source_quote,source_transcript_id,source_date,
          plane_issue_key,plane_issue_url,issue_key,recurrence_count,recurrence_dates_json,last_seen_at,client_context_json,created_at,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, f.projectId, f.simId ?? null, f.actorEmail ?? null, f.urlHost ?? null, f.urlPath ?? null,
           f.observation ?? null, f.sentiment ?? null, f.severity ?? null, f.screenshotId ?? null,
           f.suggestedBug != null ? JSON.stringify(f.suggestedBug) : null,
           f.citedTraitIds != null ? JSON.stringify(f.citedTraitIds) : null,
           f.sourceQuote ?? null, f.sourceTranscriptId ?? null, f.sourceDate ?? null,
           f.planeIssueKey ?? null, f.planeIssueUrl ?? null,
           f.issueKey ?? null, 1, JSON.stringify([now]), now,
           f.clientContext != null ? JSON.stringify(f.clientContext) : null, now, status],
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/triage-status.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/triage-status.test.ts
git commit -m "feat(triage): auto-accept high-severity feedback at intake, else new"
```

---

### Task 2: Promote recurring items out of the triage queue

**Files:**
- Modify: `prototype/lib/db.ts` — `bumpFeedbackRecurrence` (~1128-1140)
- Test: `prototype/lib/triage-recurrence.test.ts` (create)

**Interfaces:**
- Consumes: `insertFeedback`, `feedbackById` (returns `{ status, recurrenceCount }`), `bumpFeedbackRecurrence` from Task 1's module.
- Produces: `bumpFeedbackRecurrence` promotes `status='new' → 'open'` when the bumped `recurrence_count >= 3`; leaves `open`/`in_progress`/`done`/`dismissed` untouched.

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/triage-recurrence.test.ts`:

```ts
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-triage-rec-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { db, applySchema, migrateV2, insertFeedback, bumpFeedbackRecurrence, feedbackById } = await import("./db")
await applySchema(db!)
await migrateV2(db!)

const P = `proj_rec_${Date.now()}`

test("a 'new' item is promoted to 'open' when recurrence reaches 3", async () => {
  const id = await insertFeedback({ projectId: P, observation: "low sev recurring", severity: "low", issueKey: "rk1" })
  expect((await feedbackById(P, id)).status).toBe("new")
  await bumpFeedbackRecurrence(id, 1)   // count 2, still new
  expect((await feedbackById(P, id)).status).toBe("new")
  await bumpFeedbackRecurrence(id, 2)   // count 3 -> promote
  expect((await feedbackById(P, id)).status).toBe("open")
})

test("recurrence never resurrects a dismissed item", async () => {
  const id = await insertFeedback({ projectId: P, observation: "dismissed recurring", severity: "low", issueKey: "rk2" })
  // simulate a triage dismiss
  await db!.execute({ sql: "UPDATE feedback SET status='dismissed' WHERE id=?", args: [id] })
  await bumpFeedbackRecurrence(id, 1)
  await bumpFeedbackRecurrence(id, 2)   // count 3, but dismissed
  expect((await feedbackById(P, id)).status).toBe("dismissed")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/triage-recurrence.test.ts`
Expected: FAIL — first test sees `status` still `new` after the third bump.

- [ ] **Step 3: Implement the promotion**

In `prototype/lib/db.ts`, replace the body of `bumpFeedbackRecurrence`:

```ts
export async function bumpFeedbackRecurrence(id: string, atMs: number): Promise<void> {
  const r = await db!.execute({ sql: "SELECT recurrence_count, recurrence_dates_json, status FROM feedback WHERE id=?", args: [id] })
  if (!r.rows.length) return
  const row = r.rows[0] as any
  const count = Number(row.recurrence_count ?? 1) + 1
  let dates: number[] = []
  try { dates = JSON.parse(row.recurrence_dates_json || "[]") } catch { dates = [] }
  dates.push(atMs)
  // A still-untriaged item that recurs ≥3 times is a strong signal — auto-accept it.
  const promote = count >= 3 && String(row.status) === "new"
  await db!.execute({
    sql: promote
      ? "UPDATE feedback SET recurrence_count=?, recurrence_dates_json=?, last_seen_at=?, status='open' WHERE id=?"
      : "UPDATE feedback SET recurrence_count=?, recurrence_dates_json=?, last_seen_at=? WHERE id=?",
    args: [count, JSON.stringify(dates), atMs, id],
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/triage-recurrence.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/triage-recurrence.test.ts
git commit -m "feat(triage): promote new->open when recurrence reaches 3"
```

---

### Task 3: Accept severity + new/dismissed status in the PATCH endpoint

**Files:**
- Modify: `prototype/server.ts` — PATCH `/api/feedback/:id` (~2722-2736)
- Modify: `prototype/lib/db.ts` — `updateFeedbackMeta` (~1994+) to accept `severity`
- Test: `prototype/server.triage-patch.test.ts` (create)

**Interfaces:**
- Consumes: `updateFeedbackMeta(projectId, feedbackId, meta)` — extend `meta` type to include `severity?: string | null`.
- Produces: PATCH `/api/feedback/:id` accepts `status` ∈ {`new`,`open`,`in_progress`,`done`,`dismissed`} and an optional `severity` field; rejects other statuses with 400.

- [ ] **Step 1: Read updateFeedbackMeta to learn its UPDATE shape**

Run: open `prototype/lib/db.ts` at `updateFeedbackMeta` (~1994). It builds a dynamic SET list from the `meta` keys. Note the exact pattern used for `status`/`assignee`/`notes` so `severity` mirrors it.

- [ ] **Step 2: Write the failing test**

Create `prototype/server.triage-patch.test.ts` following the existing `server.*.test.ts` harness (copy the app-boot/login helper from `server.feedback-widget.test.ts` — same `import` of the fetch handler, same auth cookie helper). The behavioral assertions:

```ts
// (boot app + admin session per existing harness; insert one feedback row `fid` in a project the session owns)

test("PATCH accepts status=dismissed", async () => {
  const res = await app(patchReq(`/api/feedback/${fid}`, { status: "dismissed" }))
  expect(res.status).toBe(200)
  expect((await res.json()).ok).toBe(true)
})

test("PATCH accepts status=new and a severity edit together", async () => {
  const res = await app(patchReq(`/api/feedback/${fid}`, { status: "new", severity: "high" }))
  expect(res.status).toBe(200)
})

test("PATCH rejects an unknown status", async () => {
  const res = await app(patchReq(`/api/feedback/${fid}`, { status: "bogus" }))
  expect(res.status).toBe(400)
})
```

(Use the same request/cookie builders the neighboring feedback tests use; do not invent new infra.)

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test server.triage-patch.test.ts`
Expected: FAIL — `status=dismissed`/`new` rejected with 400, `severity` ignored.

- [ ] **Step 4: Extend the endpoint and the DB helper**

In `prototype/server.ts`, PATCH block, replace the validation + meta build:

```ts
        if (req.method === "PATCH" && !isExport) {
          const body = await req.json().catch(() => ({}))
          const VALID_STATUS = ["new", "open", "in_progress", "done", "dismissed"]
          if (body.status !== undefined && !VALID_STATUS.includes(body.status)) {
            return json({ error: `status must be one of: ${VALID_STATUS.join(", ")}` }, 400)
          }
          const VALID_SEV = ["high", "medium", "low"]
          if (body.severity !== undefined && body.severity !== null && !VALID_SEV.includes(body.severity)) {
            return json({ error: `severity must be one of: ${VALID_SEV.join(", ")}` }, 400)
          }
          const meta: Partial<{ status: string; assignee: string | null; notes: string | null; severity: string | null }> = {}
          if (body.status !== undefined) meta.status = body.status
          if (body.assignee !== undefined) meta.assignee = body.assignee ?? null
          if (body.notes !== undefined) meta.notes = body.notes ?? null
          if (body.severity !== undefined) meta.severity = body.severity ?? null
          const updated = await updateFeedbackMeta(fbRow.projectId, fid, meta)
          if (!updated) return json({ error: "Update failed." }, 500)
          return json({ ok: true })
        }
```

In `prototype/lib/db.ts`, `updateFeedbackMeta`: widen the `meta` param type to include `severity?: string | null` and add `severity` to the dynamic SET builder exactly as `assignee`/`notes` are handled (column `severity`).

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test server.triage-patch.test.ts`
Expected: PASS (all three).

- [ ] **Step 6: Commit**

```bash
git add server.ts lib/db.ts server.triage-patch.test.ts
git commit -m "feat(triage): accept new/dismissed status + severity edits in PATCH /api/feedback/:id"
```

---

### Task 4: Triage-aware dashboard counts

**Files:**
- Modify: `prototype/server.ts` — `computeDashboardInsights` (~741-774)
- Test: `prototype/server.triage-insights.test.ts` (create)

**Interfaces:**
- Produces: `computeDashboardInsights(projectId)` return gains `needsTriage: number`. `openBySeverity` counts only `status IN ('open','in_progress')`; `hotspots` same; `recurring` and `sentiment` exclude `status='dismissed'`.

- [ ] **Step 1: Write the failing test**

Create `prototype/server.triage-insights.test.ts` (temp-file DB harness like `lib/dedup-db.test.ts`; import `computeDashboardInsights` — export it from server.ts if not already exported, see Step 3):

```ts
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-triage-ins-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file; delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, migrateV2, insertFeedback } = await import("./lib/db")
const { computeDashboardInsights } = await import("./server")
await applySchema(db!); await migrateV2(db!)
const P = `proj_ins_${Date.now()}`

async function setStatus(id: string, s: string) { await db!.execute({ sql: "UPDATE feedback SET status=? WHERE id=?", args: [s, id] }) }

test("openBySeverity counts only accepted (open/in_progress) bugs; needsTriage counts new", async () => {
  const a = await insertFeedback({ projectId: P, severity: "high", sentiment: "frustrated", urlPath: "/checkout" }) // born open
  const b = await insertFeedback({ projectId: P, severity: "low", sentiment: "confused", urlPath: "/settings" })   // born new
  const c = await insertFeedback({ projectId: P, severity: "medium", urlPath: "/settings" })                       // born new
  await setStatus(c, "dismissed")
  const ins = await computeDashboardInsights(P)
  expect(ins.openBySeverity.high).toBe(1)   // a only
  expect(ins.openBySeverity.low).toBe(0)    // b is new, not counted
  expect(ins.needsTriage).toBe(1)           // b only (c dismissed)
  expect(ins.sentiment.total).toBe(2)       // a + b ; c dismissed excluded
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server.triage-insights.test.ts`
Expected: FAIL — `needsTriage` undefined and `openBySeverity.low` counts the `new` row.

- [ ] **Step 3: Implement triage-aware queries**

In `prototype/server.ts`: ensure `export async function computeDashboardInsights` (add `export` if missing). Update the `empty` object and queries:

```ts
  const empty = {
    openBySeverity: { high: 0, medium: 0, low: 0, none: 0 },
    recurring: 0,
    needsTriage: 0,
    sentiment: { neg: 0, pos: 0, total: 0 },
    hotspots: [] as { area: string; count: number }[],
    volume7d: [] as number[],
    opened7d: 0, resolved7d: 0,
  }
```

Add a `needsTriage` query and adjust the others (only the changed SQL shown):

```ts
    const [sevRows, sentRows, hotRows, volRows, recRow, throughputRows, triageRow] = await Promise.all([
      db.execute({ sql: `SELECT COALESCE(severity,'none') sev, COUNT(*) n FROM feedback WHERE project_id=? AND status IN ('open','in_progress') GROUP BY sev`, args: [projectId] }),
      db.execute({ sql: `SELECT COALESCE(sentiment,'') s, COUNT(*) n FROM feedback WHERE project_id=? AND status!='dismissed' GROUP BY s`, args: [projectId] }),
      db.execute({ sql: `SELECT COALESCE(NULLIF(url_path,''),'(unknown)') area, COUNT(*) n FROM feedback WHERE project_id=? AND status IN ('open','in_progress') GROUP BY area ORDER BY n DESC LIMIT 6`, args: [projectId] }),
      db.execute({ sql: `SELECT CAST(created_at/86400000 AS INTEGER) d, COUNT(*) n FROM feedback WHERE project_id=? AND created_at>? GROUP BY d`, args: [projectId, weekAgo] }),
      db.execute({ sql: `SELECT COUNT(*) n FROM feedback WHERE project_id=? AND recurrence_count>=3 AND status!='dismissed'`, args: [projectId] }),
      db.execute({ sql: `SELECT (CASE WHEN status='done' THEN 'resolved' ELSE 'opened' END) k, COUNT(*) n FROM feedback WHERE project_id=? AND created_at>? AND status!='dismissed' GROUP BY k`, args: [projectId, weekAgo] }),
      db.execute({ sql: `SELECT COUNT(*) n FROM feedback WHERE project_id=? AND status='new'`, args: [projectId] }),
    ])
```

After the existing row-mapping, add:

```ts
    out.needsTriage = triageRow.rows.length ? Number((triageRow.rows[0] as any).n) : 0
```

(Leave `volume7d` query as-is — incoming signal.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test server.triage-insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.ts server.triage-insights.test.ts
git commit -m "feat(triage): count accepted bugs only; expose needsTriage; exclude dismissed"
```

---

### Task 5: Triage list endpoint

**Files:**
- Modify: `prototype/lib/db.ts` — add `listTriageFeedback`
- Modify: `prototype/server.ts` — add `GET /api/projects/:id/triage` route
- Test: `prototype/server.triage-list.test.ts` (create)

**Interfaces:**
- Produces: `listTriageFeedback(projectId): Promise<Array<{ id, title, observation, sentiment, severity, urlPath, screenshotId, suggestedBug, simName, createdAt, sourceQuote, recurrence }>>` — all `status='new'` rows, newest first. Route `GET /api/projects/:id/triage` (any project member) returns `{ triage: [...] }`.

- [ ] **Step 1: Write the failing test**

Create `prototype/server.triage-list.test.ts` (temp-file DB harness; test the `listTriageFeedback` helper directly to avoid auth scaffolding):

```ts
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-triage-list-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file; delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, migrateV2, insertFeedback, listTriageFeedback } = await import("./lib/db")
await applySchema(db!); await migrateV2(db!)
const P = `proj_tl_${Date.now()}`

test("listTriageFeedback returns only new items", async () => {
  await insertFeedback({ projectId: P, severity: "high", observation: "auto accepted" })   // open
  const n = await insertFeedback({ projectId: P, severity: "low", observation: "needs triage", suggestedBug: { title: "Bug X" } }) // new
  const list = await listTriageFeedback(P)
  expect(list.length).toBe(1)
  expect(list[0].id).toBe(n)
  expect(list[0].title).toBe("Bug X")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server.triage-list.test.ts`
Expected: FAIL — `listTriageFeedback is not a function`.

- [ ] **Step 3: Implement the helper + route**

In `prototype/lib/db.ts` add (model the SELECT/mapping on `feedbackById`):

```ts
// All un-triaged ("new") feedback for a project, newest first — feeds the Triage inbox.
export async function listTriageFeedback(projectId: string): Promise<any[]> {
  const r = await db!.execute({
    sql: `SELECT f.*, p.name AS sim_name FROM feedback f
          LEFT JOIN personas p ON p.id = f.sim_id
          WHERE f.project_id=? AND f.status='new' ORDER BY f.created_at DESC LIMIT 200`,
    args: [projectId],
  })
  return r.rows.map((x: any) => {
    let bug: any = null
    try { bug = x.suggested_bug_json ? JSON.parse(x.suggested_bug_json) : null } catch { bug = null }
    return {
      id: String(x.id),
      title: String(bug?.title || x.observation || "Untitled report"),
      observation: x.observation != null ? String(x.observation) : null,
      sentiment: x.sentiment != null ? String(x.sentiment) : null,
      severity: x.severity != null ? String(x.severity) : null,
      urlPath: x.url_path != null ? String(x.url_path) : null,
      screenshotId: x.screenshot_id != null ? String(x.screenshot_id) : null,
      suggestedBug: bug,
      sourceQuote: x.source_quote != null ? String(x.source_quote) : null,
      simName: x.sim_name != null ? String(x.sim_name) : null,
      recurrence: Number(x.recurrence_count ?? 1),
      createdAt: Number(x.created_at),
    }
  })
}
```

(If the personas table name differs, match what `feedbackById`/dashboard joins use — verify against the dashboard `tickets` builder in server.ts ~2561-2598 before writing.)

In `prototype/server.ts`, add a route alongside the other `/api/projects/:id/...` GETs (reuse the existing `resolveProject`/membership guard used by sibling project routes):

```ts
        // GET /api/projects/:id/triage — un-triaged feedback queue (any project member)
        if (req.method === "GET" && sub === "triage") {
          const triage = await listTriageFeedback(proj.id)
          return json({ triage })
        }
```

(Match `sub`/`proj` variable names to the surrounding project-route dispatch; import `listTriageFeedback`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test server.triage-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts server.ts server.triage-list.test.ts
git commit -m "feat(triage): GET /api/projects/:id/triage queue endpoint"
```

---

### Task 6: One-time retroactive backfill

**Files:**
- Modify: `prototype/lib/db.ts` — add `backfillTriageV1` + call it from the boot migration sequence (near `migrateConnectorsPlane`, ~31)
- Test: `prototype/lib/triage-backfill.test.ts` (create)

**Interfaces:**
- Produces: `backfillTriageV1(c: Client): Promise<void>` — idempotent (guarded by `schema_meta` flag `triage_backfill_v1`). Moves `status='open'` rows with non-high severity and `recurrence_count<3` to `'new'`; leaves `high`, recurring, `in_progress`, `done`, `dismissed` untouched.

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/triage-backfill.test.ts`:

```ts
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-triage-bf-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file; delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, migrateV2, insertFeedback, backfillTriageV1, feedbackById } = await import("./db")
await applySchema(db!); await migrateV2(db!)
const P = `proj_bf_${Date.now()}`

test("backfill re-triages legacy open rows by the auto-accept rule, idempotently", async () => {
  // Force everything to legacy 'open' first (pre-feature state).
  const low = await insertFeedback({ projectId: P, severity: "low" })
  const high = await insertFeedback({ projectId: P, severity: "high" })
  const rec = await insertFeedback({ projectId: P, severity: "low" })
  await db!.execute({ sql: "UPDATE feedback SET status='open' WHERE project_id=?", args: [P] })
  await db!.execute({ sql: "UPDATE feedback SET recurrence_count=3 WHERE id=?", args: [rec] })
  const done = await insertFeedback({ projectId: P, severity: "low" })
  await db!.execute({ sql: "UPDATE feedback SET status='done' WHERE id=?", args: [done] })

  await backfillTriageV1(db!)
  expect((await feedbackById(P, low)).status).toBe("new")    // demoted to triage
  expect((await feedbackById(P, high)).status).toBe("open")  // high stays accepted
  expect((await feedbackById(P, rec)).status).toBe("open")   // recurring stays accepted
  expect((await feedbackById(P, done)).status).toBe("done")  // done untouched

  // idempotent: a second run, after accepting `low`, must not re-demote it
  await db!.execute({ sql: "UPDATE feedback SET status='open' WHERE id=?", args: [low] })
  await backfillTriageV1(db!)
  expect((await feedbackById(P, low)).status).toBe("open")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/triage-backfill.test.ts`
Expected: FAIL — `backfillTriageV1 is not a function`.

- [ ] **Step 3: Implement the guarded backfill**

In `prototype/lib/db.ts` (use the existing `metaGet`/`metaSet` helpers, same pattern as `migrateConnectorsPlane`):

```ts
// One-time retroactive triage: legacy rows were all 'open'. Re-apply the auto-accept
// rule so non-high, non-recurring items move into the triage queue. Idempotent via flag.
export async function backfillTriageV1(c: Client) {
  if (await metaGet(c, "triage_backfill_v1")) return
  await c.execute({
    sql: `UPDATE feedback SET status='new'
          WHERE status='open' AND COALESCE(severity,'') != 'high' AND recurrence_count < 3`,
  })
  await metaSet(c, "triage_backfill_v1", String(Date.now()))
}
```

In the boot/init sequence (where `migrateConnectorsPlane(db)` is awaited, ~31), add after it:

```ts
  await backfillTriageV1(db)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/triage-backfill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/triage-backfill.test.ts
git commit -m "feat(triage): one-time retroactive backfill of legacy open feedback"
```

---

### Task 7: Triage inbox view + Overview banner (UI)

**Files:**
- Modify: `prototype/public/dashboard.html` — CSS view rule (~40-44), sidebar nav (~528), Overview banner, new Triage section, JS (`renderStats`, `renderFixNext`, kanban filter, recent-tickets filter, `setView`/`VIEWS`, a new `renderTriage`, count mirror).

**Interfaces:**
- Consumes: `state.insights.needsTriage` (Task 4); `GET /api/projects/:id/triage` (Task 5); `PATCH /api/feedback/:id` with `{status:"open"}` / `{status:"dismissed"}` / `{severity}` (Task 3).

- [ ] **Step 1: Add `triage` to the view system**

CSS (~line 40-44): add a line to the hide-chain so triage sections toggle like the others:

```css
body[data-view="triage"] [data-view]:not([data-view~="triage"]),
```
(insert before the `body[data-view="settings"]…` line; keep the trailing `{display:none!important}` on the final selector).

JS (~2434): add `'triage'` to `VIEWS`:
```js
  var VIEWS=['overview','triage','sims','tickets','team','settings'];
```

- [ ] **Step 2: Add the sidebar nav item with a count badge**

After the `data-go="tickets"` button (~528), add (reuse a Lucide-style icon consistent with neighbors — an inbox icon):

```html
    <button class="nv" data-go="triage"><span class="ic"><svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></span>Triage <span class="ct" id="navTriageCount"></span></button>
```

Add the count mirror near the others (~2454):
```js
  mirror('triageCount','navTriageCount');
```
Add a hidden source element the mirror reads (place inside the overview banner from Step 3, id `triageCount`).

- [ ] **Step 3: Overview banner**

Immediately before the `kpis` strip (~609), add:

```html
  <a class="triage-banner hide" id="triageBanner" data-view="overview" href="#triage">
    <span class="tb-ic">🛎️</span>
    <span class="tb-txt"><b id="triageCount">0</b> items need triage — review and accept them as bugs or dismiss them</span>
    <span class="tb-go">Review →</span>
  </a>
```

Add CSS near the `.kpis` styles (match the card visual language — rounded, subtle accent border):

```css
.triage-banner{display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:14px;border:1px solid var(--indigo,#6366f1);border-radius:12px;background:rgba(99,102,241,.08);color:inherit;text-decoration:none;font-size:14px}
.triage-banner .tb-go{margin-left:auto;font-weight:600;color:var(--indigo,#6366f1)}
.triage-banner.hide{display:none}
```

In `renderStats()` (~1075), after computing insights, toggle the banner:

```js
  const need = ins.needsTriage || 0
  const banner = $("triageBanner"), tc = $("triageCount")
  if (tc) tc.textContent = String(need)
  if (banner) banner.classList.toggle("hide", need === 0)
```

The `href="#triage"` plus `triage` in `VIEWS` makes the click switch views (hashchange → `setView`). Confirm `setView` runs on the banner click; if hash navigation alone doesn't trigger it, add `banner.onclick` to call the nav button: `document.querySelector('.nv[data-go="triage"]').click()`.

- [ ] **Step 4: The Triage section + renderer**

Add a full-width section (place near the tickets section, ~646) :

```html
  <div class="card full" data-view="triage">
    <h2 style="display:flex;align-items:center;gap:8px">🛎️ Triage <span class="h-tag">accept as a bug or dismiss</span></h2>
    <div id="triageList"><div class="sk sk-row"></div></div>
  </div>
```

Add `renderTriage()` (call it from `setView` when `v==='triage'`, and refresh after each action). It fetches the queue and renders rows with Accept/Dismiss + a severity `<select>`:

```js
async function renderTriage() {
  const host = $("triageList"); if (!host) return
  const pid = curProjId(); if (!pid) return
  let items = []
  try { const r = await fetch("/api/projects/" + encodeURIComponent(pid) + "/triage"); const d = await r.json(); items = d.triage || [] } catch (e) {}
  if (!items.length) { host.innerHTML = emptyState("✅", "Nothing to triage — you're all caught up.", ""); return }
  host.innerHTML = items.map(t => `
    <div class="tg-row ${sevRailClass(t.severity)}" data-id="${esc(String(t.id))}">
      <div class="tg-b">
        <div class="tg-t">${esc(t.title || "Untitled report")}${(t.recurrence >= 2) ? `<span class="fx-recur">recurring ×${t.recurrence}</span>` : ""}</div>
        ${t.sourceQuote ? `<div class="fx-q">“${esc(t.sourceQuote)}”</div>` : (t.observation ? `<div class="fx-q">${esc(t.observation)}</div>` : "")}
        <div class="fx-m">${t.urlPath ? `<span class="fx-area">${esc(t.urlPath)}</span>` : ""}${t.sentiment ? `<span class="chip s-${esc(t.sentiment)}">${esc(t.sentiment)}</span>` : ""}${t.simName ? `<span>🤖 ${esc(t.simName)}</span>` : ""}</div>
      </div>
      <div class="tg-actions">
        <select class="tg-sev">${["high","medium","low"].map(s => `<option value="${s}"${s===(t.severity||"low")?" selected":""}>${s}</option>`).join("")}</select>
        <button class="btn btn-indigo btn-sm tg-accept" type="button">Accept as bug</button>
        <button class="btn btn-ghost btn-sm tg-dismiss" type="button">Dismiss</button>
      </div>
    </div>`).join("")
  host.querySelectorAll(".tg-row").forEach(row => {
    const id = row.getAttribute("data-id")
    const patch = async (payload) => {
      await fetch("/api/feedback/" + encodeURIComponent(id), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {})
      await refreshAll()      // re-pull dashboard so counts + banner + kanban update
      renderTriage()
    }
    row.querySelector(".tg-accept").addEventListener("click", () => patch({ status: "open", severity: row.querySelector(".tg-sev").value }))
    row.querySelector(".tg-dismiss").addEventListener("click", () => patch({ status: "dismissed" }))
  })
}
```

Wire into `setView`: in the JS `setView(v)` (~2436), after setting the attribute add `if (v === 'triage') renderTriage()`. Use the existing full-state refresh function for `refreshAll()` — locate the function that initially fetches `/api/dashboard` and re-renders (search for `fetch("/api/dashboard"` and reuse/extract it as `refreshAll`). If none is cleanly reusable, define `refreshAll` = re-run that fetch+render path.

Add minimal CSS for `.tg-row`/`.tg-actions` mirroring `.fxrow`:

```css
.tg-row{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line,#eee)}
.tg-row .tg-b{flex:1;min-width:0}
.tg-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}
.tg-sev{font-size:12px;padding:4px 6px}
```

- [ ] **Step 5: Exclude new/dismissed from bug surfaces**

In `renderFixNext()` (~1097) tighten the filter:
```js
  const open = (state.tickets || []).filter(t => t.status === "open" || t.status === "in_progress").slice()
```
In `renderTicketsKanban()` and the recent-tickets builder (the loop that populates `#tickets`, ~1560-1588), skip rows whose `status` is `new` or `dismissed` (kanban columns already key off open/in_progress/done, so a `new`/`dismissed` row would otherwise vanish into no column — explicitly filter them out before grouping).

- [ ] **Step 6: Manual + e2e verification**

This task has no unit test (DOM/UI). Verify by running the app:

Run (background): `bun run prototype/server.ts` (or the project's documented dev command — check `package.json` scripts), log in as `vishal@quantana.com.au`, then:
- Overview shows the "N items need triage" banner; clicking it opens the Triage view.
- A low-severity feedback item appears in Triage, NOT in Open issues. Accept it → it leaves Triage, the Open-issues count rises, it appears on the kanban. Dismiss another → it disappears from all counts.
- A high-severity submission skips Triage and lands directly as an open bug.

Use the `/run` skill (or the `verify` skill) to drive the app and capture a screenshot of the Triage view + banner.

- [ ] **Step 7: Commit**

```bash
git add public/dashboard.html
git commit -m "feat(triage): Triage inbox view + overview banner; bug surfaces show accepted only"
```

---

### Task 8: Full regression + sync

- [ ] **Step 1: Run the whole suite**

Run: `bun test` (from `prototype/`)
Expected: all green. Fix any fallout (e.g., existing dedup/feedback tests that assumed every insert is `open` — update their assertions to the new triage semantics; do NOT weaken the feature to satisfy a stale test without confirming the test's intent).

- [ ] **Step 2: Pull latest and rebase**

```bash
git fetch origin master && git rebase origin/master
```
Resolve trivially; if conflicts are messy, `git merge --abort`/`git rebase --abort` and instead `git merge origin/master` (orchestrator integrates theirs-wins anyway).

- [ ] **Step 3: Re-run tests after rebase**

Run: `bun test`
Expected: all green. Then leave the branch for the orchestrator.

---

## Self-Review

**Spec coverage:**
- Lifecycle/states → Tasks 1, 2, 3 (status values + transitions). ✓
- Auto-accept (high severity / recurrence ×3) → Tasks 1, 2. ✓
- Counting changes (openBySeverity, needsTriage, hotspots, recurring, sentiment, volume, throughput) → Task 4. ✓
- PATCH new/dismissed + severity → Task 3. ✓
- Triage list endpoint → Task 5. ✓
- Backfill (idempotent, leaves in_progress/done) → Task 6. ✓
- UI: sidebar Triage + badge, Triage view, Overview banner, bug surfaces exclude new/dismissed → Task 7. ✓
- Testing (unit + e2e/manual) → per-task tests + Task 7 Step 6 + Task 8. ✓
- Out-of-scope (bulk triage, undo, notifications) → not built. ✓

**Type consistency:** `initialFeedbackStatus(severity)` (Task 1) reused conceptually in Task 6 SQL; `status` values consistent (`new`/`open`/`in_progress`/`done`/`dismissed`) across Tasks 1–7; `needsTriage` defined in Task 4, consumed in Task 7; `listTriageFeedback` shape (Task 5) matches `renderTriage` field reads (Task 7: title, observation, sentiment, severity, urlPath, simName, recurrence, sourceQuote). ✓

**Placeholder scan:** All code steps contain concrete code. Two steps ask the implementer to match existing variable/route names (Task 5 route dispatch, Task 7 `refreshAll`) — these are verification-against-codebase instructions, not placeholders, because the exact surrounding identifiers must be read at edit time. ✓
