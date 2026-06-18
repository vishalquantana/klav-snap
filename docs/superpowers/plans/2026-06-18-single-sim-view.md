# Single-Sim Focused View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes. Read the spec first: `docs/superpowers/specs/2026-06-18-single-sim-view-design.md`.

**Goal:** Clicking a Sim on the dashboard deep-links to a focused single-Sim view in the studio showing the Sim's insights-with-provenance, the source transcripts that shaped it (click-to-view), and its evolution timeline.

**Architecture:** Two new read-only project-scoped endpoints expose a Sim's source transcripts + a transcript's raw text. The dashboard adds `&sim=<id>` to its Sim links; the studio reads `?sim=` and renders a focused view (else unchanged). No schema change.

**Tech Stack:** Bun, TypeScript, Turso/libsql, server-rendered static `index.html`/`dashboard.html` + vanilla JS, `bun:test`.

## Global Constraints
- Work in worktree `/Users/vishalkumar/Downloads/qbug/klav-snap/.claude/worktrees/single-sim`. All paths/cd/git/bun there. Straight ASCII quotes only.
- New endpoints are **read-only, project-scoped** via the existing pattern (the `/api/sims/:id/evolution` handler at server.ts ~1233 is the template): resolve email via `(await sessionEmail(req)) || (await bearerEmail(req))`, `resolveProject(me, url.searchParams.get("project"))`, 401/400 on failure, and only return data for that project (404 if the sim/transcript isn't in the caller's project).
- No schema change. Reuse `listTraitEvents(simId)`, `listTranscripts(projectId)` (TranscriptRow: `id,title,rawText,sourceDate,speakers,addedBy,createdAt`), `listPersonas`.
- Exclude the `legacy_import` transcript sentinel from the source-transcript list.
- XSS: every data value rendered in HTML goes through the existing `esc()`. 
- The all-Sims studio behaviour (no `?sim=`) must be unchanged.
- SemVer lockstep at merge (patch/minor; reconcile exact number — master moves fast).
- Tests: `cd prototype && bun test`.

## File Structure
- `prototype/lib/db.ts` — `transcriptById(projectId, id)` helper.
- `prototype/server.ts` — `GET /api/sims/:id/transcripts`, `GET /api/transcripts/:id`.
- `prototype/lib/single-sim.test.ts` (NEW) — db-backed tests for the transcript helpers/derivation + project scoping.
- `prototype/public/dashboard.html` — Sim cards link `&sim=<id>`.
- `prototype/public/index.html` — `studioSimId()` + focused single-Sim view.

---

### Task 1: `transcriptById` + source-transcripts derivation (db.ts) — TDD

**Files:** Modify `prototype/lib/db.ts`; Create `prototype/lib/single-sim.test.ts`.

**Interfaces — Produces:**
- `transcriptById(projectId: string, id: string): Promise<TranscriptRow | null>` — returns the transcript only if it belongs to `projectId`.
- `sourceTranscriptsForSim(simId: string, projectId: string): Promise<{ id: string; title: string | null; sourceDate: number; addedBy: string }[]>` — distinct transcripts referenced by the Sim's trait_events (excluding `legacy_import`), newest-first.

- [ ] **Step 1: Write the failing test** — `prototype/lib/single-sim.test.ts` (hermetic libsql, per-run namespaced ids like `budget.test.ts`):

```ts
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"; import { join } from "node:path"
const file = join(tmpdir(), `klav-ssv-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, insertTranscript, insertTrait, insertTraitEvent, transcriptById, sourceTranscriptsForSim } = await import("./db")
await applySchema(db!)
const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const P = `proj_ssv_${RUN}`, OTHER = `proj_other_${RUN}`, SIM = `sim_${RUN}`

test("transcriptById is project-scoped", async () => {
  const tid = await insertTranscript({ projectId: P, title: "Q1 call", rawText: "hello world", sourceDate: 1000, addedBy: "a@x.com" })
  expect((await transcriptById(P, tid))?.rawText).toBe("hello world")
  expect(await transcriptById(OTHER, tid)).toBeNull() // wrong project → null
})

test("sourceTranscriptsForSim: distinct trait_event transcripts, newest-first, excludes legacy_import", async () => {
  const t1 = await insertTranscript({ projectId: P, title: "Call A", rawText: "a", sourceDate: 100, addedBy: "a@x.com" })
  const t2 = await insertTranscript({ projectId: P, title: "Call B", rawText: "b", sourceDate: 300, addedBy: "b@x.com" })
  // a trait + events referencing t1 (twice) and t2 + a legacy_import event
  const traitId = await insertTrait({ id: `tr_${RUN}`, simId: SIM, projectId: P, kind: "pain", text: "slow", status: "active", strength: 1, srcTranscriptId: t1, srcQuote: "ugh", srcSpeaker: "a", createdAt: 1, updatedAt: 1 } as any)
  await insertTraitEvent({ traitId, simId: SIM, transcriptId: t1, op: "create", afterText: "slow", quote: "ugh", speaker: "a", sourceDate: 100 } as any)
  await insertTraitEvent({ traitId, simId: SIM, transcriptId: t2, op: "reinforce", afterText: "slow", quote: "still slow", speaker: "b", sourceDate: 300 } as any)
  await insertTraitEvent({ traitId, simId: SIM, transcriptId: "legacy_import", op: "create", afterText: "slow", quote: "", speaker: "", sourceDate: 0 } as any)
  const out = await sourceTranscriptsForSim(SIM, P)
  expect(out.map(t => t.id)).toEqual([t2, t1]) // newest sourceDate first, distinct, no legacy_import
  expect(out[0].title).toBe("Call B")
})
```
(Match the real signatures of `insertTrait`/`insertTraitEvent` from db.ts — adjust the fixture object shapes to the actual `TraitInsert`/`TraitEventRow` field names while keeping the asserted behaviour.)

- [ ] **Step 2: Run → FAIL** (`cd prototype && bun test lib/single-sim.test.ts`) — helpers not exported.
- [ ] **Step 3: Implement** in `db.ts` (after `listTranscripts`):
```ts
export async function transcriptById(projectId: string, id: string): Promise<TranscriptRow | null> {
  const r = await db!.execute({ sql: "SELECT * FROM transcripts WHERE id=? AND project_id=?", args: [id, projectId] })
  return r.rows.length ? rowToTranscript(r.rows[0]) : null
}
export async function sourceTranscriptsForSim(simId: string, projectId: string): Promise<{ id: string; title: string | null; sourceDate: number; addedBy: string }[]> {
  const events = await listTraitEvents(simId)
  const ids = [...new Set(events.map(e => e.transcriptId).filter((t): t is string => !!t && t !== "legacy_import"))]
  if (!ids.length) return []
  const byId = new Map((await listTranscripts(projectId)).map(t => [t.id, t]))
  return ids.map(id => byId.get(id)).filter((t): t is TranscriptRow => !!t)
    .map(t => ({ id: t.id, title: t.title, sourceDate: t.sourceDate, addedBy: t.addedBy }))
    .sort((a, b) => b.sourceDate - a.sourceDate)
}
```
- [ ] **Step 4: Run → PASS.** Then full suite (`cd prototype && bun test`) — no regressions.
- [ ] **Step 5: Commit** `feat(single-sim): transcriptById + sourceTranscriptsForSim (project-scoped)`.

---

### Task 2: Sim-transcript endpoints (server.ts)

**Files:** Modify `prototype/server.ts` (add near the `/api/sims/:id/evolution` handler ~1233); add `transcriptById, sourceTranscriptsForSim` to the `./lib/db` import.

**Interfaces — Consumes:** Task 1 helpers. **Produces:** `GET /api/sims/:id/transcripts`, `GET /api/transcripts/:id`.

- [ ] **Step 1: Add the imports** — append `transcriptById, sourceTranscriptsForSim` to the `from "./lib/db"` import list.
- [ ] **Step 2: Implement both routes** (model on the evolution handler — same auth/resolveProject/scoping). Add immediately after the evolution `if (...) { ... }` block:
```ts
    // ── Sim source transcripts (the calls that shaped this Sim) — project-scoped, read-only ──
    const simTxMatch = path.match(/^\/api\/sims\/([^/]+)\/transcripts$/)
    if (req.method === "GET" && simTxMatch) {
      const meST = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meST) return json({ error: "Sign in to continue." }, 401)
      const projST = await resolveProject(meST, url.searchParams.get("project"))
      if (!projST) return json({ error: "No project." }, 400)
      const sim = (await listPersonas(projST.id)).find(p => p.id === simTxMatch[1])
      if (!sim) return json({ error: "Not found" }, 404)
      try { return json({ simId: sim.id, transcripts: await sourceTranscriptsForSim(sim.id, projST.id) }) }
      catch (e: any) { return json({ error: e?.message || "transcripts failed" }, 500) }
    }
    // ── One transcript's raw text — project-scoped, read-only ──
    const txMatch = path.match(/^\/api\/transcripts\/([^/]+)$/)
    if (req.method === "GET" && txMatch) {
      const meT2 = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meT2) return json({ error: "Sign in to continue." }, 401)
      const projT2 = await resolveProject(meT2, url.searchParams.get("project"))
      if (!projT2) return json({ error: "No project." }, 400)
      const tr = await transcriptById(projT2.id, txMatch[1])
      if (!tr) return json({ error: "Not found" }, 404)
      return json({ id: tr.id, title: tr.title, rawText: tr.rawText, sourceDate: tr.sourceDate, addedBy: tr.addedBy, speakers: tr.speakers })
    }
```
(NOTE: the existing `POST /api/transcripts` handler must NOT be shadowed — these are GET with a different path shape; verify the new `GET /api/transcripts/:id` is placed so it doesn't intercept `POST /api/transcripts`. They differ by method + the `:id` segment, so order is safe; place after the evolution block.)
- [ ] **Step 3: Verify** — `cd prototype && bun build server.ts --target=bun --outfile=/tmp/ssv.js` clean; `bun test` green. Optional: a focused test hitting the route logic if feasible, else rely on Task 1's helper tests + manual.
- [ ] **Step 4: Commit** `feat(single-sim): GET /api/sims/:id/transcripts + GET /api/transcripts/:id (project-scoped)`.

---

### Task 3: Dashboard deep-link + studio focused single-Sim view

**Files:** Modify `prototype/public/dashboard.html` (Sim card anchors); modify `prototype/public/index.html` (`studioSimId()` + focused view).

- [ ] **Step 1: Dashboard deep-link.** In `dashboard.html`'s `renderSims`, the Sim card is an `<a class="sim" href="/app">`. Change each card's href to include the sim id: `href="/app?project=${esc(activeProjectId)}&sim=${esc(s.id)}"`. (If a global `a[href^="/app"]` project-carry rewriter exists, ensure it preserves the `&sim=` — append project only if absent, or build the full href here and skip the rewriter for these.)
- [ ] **Step 2: Studio — read the sim id.** In `index.html`, after `function studioProjectId()`, add:
```js
function studioSimId() { try { return new URLSearchParams(location.search).get("sim") } catch (e) { return null } }
```
- [ ] **Step 3: Studio — focused view.** After Sims load and `renderDock()` would run, branch: if `studioSimId()` matches a loaded Sim, call a new `renderFocusedSim(sim)` instead of (or in addition to, hidden) the normal dock; else render normally. `renderFocusedSim(sim)` renders into the dock container:
  - a `← All Sims` link (onclick: set `location.search` to just `?project=<id>` and reload, OR clear `?sim=` + re-render the dock);
  - the Sim header (avatar/name/role/type/summary) reusing existing card markup/edit affordances;
  - **Insights with provenance**: for each `sim.insights[]`, render `text`, the `kind`, and when `x.quote` exists show `"<quote>"`, plus when `x.sourceTranscriptId` is set show the transcript title (resolved from the fetched source-transcripts list) + date — all via `esc()`;
  - **Source transcripts** section: lazy `fetch("/api/sims/" + sim.id + "/transcripts?project=" + projectId)` → list rows (title · date · addedBy); clicking a row lazy-fetches `fetch("/api/transcripts/" + id + "?project=" + projectId)` and shows `rawText` in an expander/modal (reuse existing modal/expander pattern; `esc()` the text, preserve newlines with `white-space:pre-wrap`);
  - **Evolution**: lazy `fetch("/api/sims/" + sim.id + "/evolution?project=" + projectId)` (existing endpoint) rendered inline (reuse the existing evolution-rendering code path the `data-evo` toggle uses).
  Use `esc()` everywhere; lazy-load the two fetches when the focused view mounts (once).
- [ ] **Step 4: Verify** — `cd prototype && bun build server.ts ...` still clean (no server change here, but run the suite). Re-read the edited HTML/JS for balanced braces/backticks. The all-Sims path (no `?sim=`) must render exactly as before.
- [ ] **Step 5: Commit** `feat(single-sim): dashboard deep-link + focused studio view (insights/provenance/transcripts/evolution)`.

---

### Task 4: Housekeeping (version + changelog)

- [ ] **Step 1:** Bump 5 manifests + PRD + CHANGELOG one step above current master (reconcile at merge). CHANGELOG:
```markdown
## [<ver>] — 2026-06-18

### Added
- **Focused single-Sim view.** Clicking a Sim on the dashboard now deep-links into the
  studio focused on that Sim (`?sim=`), showing its insights with provenance (source
  quote + transcript), the source transcripts that shaped it (click to read the raw
  call), and its evolution timeline — with a "← All Sims" back link. New read-only
  `GET /api/sims/:id/transcripts` and `GET /api/transcripts/:id` (project-scoped).
```
- [ ] **Step 2:** `cd prototype && bun test` green; no manifest left at the old version.
- [ ] **Step 3: Commit** `chore: release <ver> — focused single-Sim view`.

---

## Self-Review Notes
- **Spec coverage:** deep-link `?sim=` ✓ (T3 S1-S3); focused view ✓ (T3 S3); source-transcript list + click-to-view ✓ (T1 + T2 + T3); evolution surfaced ✓ (T3 reuse existing endpoint); per-insight provenance ✓ (T3 from existing insights_json); 2 new project-scoped read endpoints, no schema change ✓ (T1/T2); all-Sims path unchanged ✓ (T3 branch). 
- **Placeholders:** none — endpoint + helper code concrete; T3's studio render is described against the real `renderDock`/`data-evo`/`studioProjectId` anchors (the implementer matches the existing render style).
- **Type consistency:** `transcriptById(projectId,id)` + `sourceTranscriptsForSim(simId,projectId)` defined T1, consumed T2; routes consumed by T3's fetches at the exact paths.
