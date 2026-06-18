# Rich Ticket Detail Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes. Read the spec first: `docs/superpowers/specs/2026-06-18-rich-ticket-detail-design.md`.

**Goal:** Expanding a dashboard ticket shows the full Sim review context (observation, suggested bug, severity/sentiment/Sim, provenance) + an inline screenshot thumbnail — not just status/assignee/notes.

**Architecture:** All data is already on the `feedback` row. Expose the missing fields in `FeedbackRow`/`rowToFeedback`, pass them through the `/api/dashboard` tickets mapping, and render them in the `.tkt-detail` panel — lazily fetching the private screenshot via the existing `/api/screenshots/:id` signed-URL endpoint on first expand.

**Tech Stack:** Bun, TypeScript, Turso/libsql, server-rendered static `dashboard.html` + vanilla JS, `bun:test`.

## Global Constraints

- Work in the worktree `/Users/vishalkumar/Downloads/qbug/klav-snap/.claude/worktrees/ticket-detail`. All paths/cd/git/bun there. Straight ASCII quotes only.
- **No DB change, no new endpoint.** Reuse `/api/screenshots/:id` (returns `{ url }`, a 600s signed GET — already used by the observability drawer's `.shot` buttons).
- **Lazy screenshots:** fetch a ticket's screenshot only when that ticket is expanded, once per ticket (guard with a `data-loaded` flag). Never prefetch all.
- **XSS:** every interpolated value in `dashboard.html` goes through the existing `esc()`. Numbers are safe.
- **Privacy:** screenshots stay private — the signed URL is fetched on demand, not embedded.
- Reuse existing client helpers: `esc()`, `ago()` (relative time), chip classes (`s-<sentiment>`).
- SemVer lockstep at merge (patch bump; reconcile exact number — master moves fast).
- Tests: `cd prototype && bun test`.

## File Structure
- `prototype/lib/db.ts` — `FeedbackRow` + `rowToFeedback`: expose `suggestedBug`, `sourceQuote`, `citedTraitIds`, `sourceDate`.
- `prototype/lib/feedback-fields.test.ts` (NEW) — db test the fields round-trip via `listFeedback`.
- `prototype/server.ts` — `/api/dashboard` tickets mapping: add `notes` to the batch meta query + pass the new fields to the client.
- `prototype/public/dashboard.html` — CSS + render the context block + lazy screenshot in `.tkt-detail`.

---

### Task 1: Expose feedback fields in the read path (db.ts) — TDD

**Files:** Modify `prototype/lib/db.ts` (`FeedbackRow` ~768, `rowToFeedback` ~774); Create `prototype/lib/feedback-fields.test.ts`.

**Interfaces — Produces:** `FeedbackRow` gains `suggestedBug: any | null`, `sourceQuote: string | null`, `citedTraitIds: any | null`, `sourceDate: number | null`; `listFeedback` returns them.

- [ ] **Step 1: Write the failing test** — `prototype/lib/feedback-fields.test.ts` (hermetic libsql, per-run namespaced ids like `budget.test.ts`):

```ts
import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
const file = join(tmpdir(), `klav-fbfields-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { db, applySchema, insertFeedback, listFeedback } = await import("./db")
await applySchema(db!)
const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const P = `proj_fbf_${RUN}`

test("listFeedback exposes suggestedBug/sourceQuote/citedTraitIds/sourceDate", async () => {
  await insertFeedback({
    projectId: P, simId: `sim_${RUN}`, observation: "label is wrong",
    sentiment: "frustrated", severity: "high", screenshotId: `shot_${RUN}`,
    suggestedBug: { title: "Fix label", body: "the CTA says Submit not Save", severity: "high" },
    citedTraitIds: ["t1"], sourceQuote: "I hate when labels lie", sourceDate: 1750000000000,
  })
  const rows = await listFeedback(P, { limit: 5 })
  expect(rows.length).toBe(1)
  const r = rows[0]
  expect(r.suggestedBug).toEqual({ title: "Fix label", body: "the CTA says Submit not Save", severity: "high" })
  expect(r.sourceQuote).toBe("I hate when labels lie")
  expect(r.citedTraitIds).toEqual(["t1"])
  expect(r.sourceDate).toBe(1750000000000)
  expect(r.observation).toBe("label is wrong") // existing field still works
})
```

- [ ] **Step 2: Run → FAIL** (`cd prototype && bun test lib/feedback-fields.test.ts`) — `suggestedBug` etc. are `undefined` on the row.
- [ ] **Step 3: Implement.** In `FeedbackRow` (after `severity`/`screenshotId`, before `planeIssueKey`) add:
```ts
  suggestedBug: any | null; sourceQuote: string | null; citedTraitIds: any | null; sourceDate: number | null
```
In `rowToFeedback`'s returned object (after the `screenshotId` line) add:
```ts
    suggestedBug: x.suggested_bug_json ? JSON.parse(String(x.suggested_bug_json)) : null,
    sourceQuote: x.source_quote != null ? String(x.source_quote) : null,
    citedTraitIds: x.cited_trait_ids_json ? JSON.parse(String(x.cited_trait_ids_json)) : null,
    sourceDate: x.source_date != null ? Number(x.source_date) : null,
```
(`listFeedback` already `SELECT *`s, so the columns are present.)
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Run full suite** (`cd prototype && bun test`) — no regressions.
- [ ] **Step 6: Commit** `feat(tickets): expose suggestedBug/sourceQuote/citedTraitIds/sourceDate on FeedbackRow`.

---

### Task 2: Ticket API fields + rich detail panel render

**Files:** Modify `prototype/server.ts` (`/api/dashboard` tickets mapping ~1438-1481); modify `prototype/public/dashboard.html` (CSS block + `renderTickets` detail panel ~764 + expand handler ~870).

**Interfaces — Consumes:** the new `FeedbackRow` fields (Task 1). **Produces:** ticket objects carrying `observation`, `suggestedBug`, `sentiment`, `screenshotId`, `sourceQuote`, `sourceDate`, `notes`.

- [ ] **Step 1: Server — add `notes` to the batch meta query.** In the `SELECT id, status, assignee FROM feedback WHERE id IN (...)` block, change the column list to `SELECT id, status, assignee, notes` and extend the row map to include `notes: (x as any).notes != null ? String((x as any).notes) : null` (and add `notes` to the meta type literal + the default `{ status:"open", assignee:null, notes:null }`).

- [ ] **Step 2: Server — pass the new fields to the client.** In the `const tickets = feedbackTickets.map(f => { … return { … } })`, extend the returned object with:
```ts
              observation: f.observation, suggestedBug: f.suggestedBug,
              sentiment: f.sentiment, screenshotId: f.screenshotId,
              sourceQuote: f.sourceQuote, sourceDate: f.sourceDate,
              notes: meta.notes,
```
(Keep the existing `title: f.observation` — the row title stays; `observation` is the full text for the panel.)

- [ ] **Step 3: Client CSS.** In `dashboard.html`, immediately before `</style>`, add:
```css
  .tkt-context{display:flex;flex-direction:column;gap:10px;padding-bottom:12px;margin-bottom:2px;border-bottom:1px solid var(--line)}
  .tkt-obs{font-size:14px;line-height:1.5;color:var(--paper)}
  .tkt-chips{display:flex;flex-wrap:wrap;gap:6px}
  .tkt-bug{background:var(--ink-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
  .tkt-bug-t{font-size:13px;font-weight:600;margin-bottom:4px}
  .tkt-bug-b{font-size:13px;color:var(--paper-dim);line-height:1.5;white-space:pre-wrap}
  .tkt-prov{font-size:12.5px;color:var(--paper-dim);font-style:italic;border-left:2px solid var(--line);padding-left:10px}
  .tkt-meta-line{font-size:11px}
  .tkt-shot{margin-top:2px}
  .tkt-shot img{max-width:100%;border:1px solid var(--line);border-radius:10px;cursor:zoom-in;display:block}
  .chip.sev-high{background:#3a1416;color:#ffb4ac}.chip.sev-medium{background:#3a2c10;color:#ffd79a}.chip.sev-low{background:#10261a;color:#9ae6b4}
```

- [ ] **Step 4: Client — render the context block.** In `renderTickets`, the detail panel's `detailEl.innerHTML = \`…\`` currently starts with `<div class="tkt-status-row">`. Insert this block at the very start of that template literal (before `<div class="tkt-status-row">`):
```html
      ${(t.observation || t.suggestedBug || t.sourceQuote || t.screenshotId) ? `
      <div class="tkt-context">
        ${t.observation ? `<div class="tkt-obs">${esc(t.observation)}</div>` : ""}
        ${(t.severity || t.sentiment || t.simName) ? `<div class="tkt-chips">${t.severity ? `<span class="chip sev-${esc(t.severity)}">${esc(t.severity)}</span>` : ""}${t.sentiment ? `<span class="chip s-${esc(t.sentiment)}">${esc(t.sentiment)}</span>` : ""}${t.simName ? `<span class="chip">${esc(t.simName)}</span>` : ""}</div>` : ""}
        ${t.suggestedBug ? `<div class="tkt-bug"><div class="tkt-bug-t">🐞 ${esc(t.suggestedBug.title || "Suggested fix")}</div>${t.suggestedBug.body ? `<div class="tkt-bug-b">${esc(t.suggestedBug.body)}</div>` : ""}</div>` : ""}
        ${t.sourceQuote ? `<div class="tkt-prov">"${esc(t.sourceQuote)}"${t.sourceDate ? ` · raised ${esc(ago(t.sourceDate))}` : ""}</div>` : ""}
        <div class="tkt-meta-line muted">${t.urlPath ? esc(t.urlPath) : ""}${(t.urlPath && t.createdAt) ? " · " : ""}${t.createdAt ? esc(ago(t.createdAt)) : ""}</div>
        ${t.screenshotId ? `<div class="tkt-shot" data-shot="${esc(t.screenshotId)}"><div class="muted" style="font-size:12px">Loading screenshot…</div></div>` : ""}
      </div>` : ""}
```

- [ ] **Step 5: Client — lazy-load the screenshot on expand.** In the row click handler (`rowEl.addEventListener("click", () => { … detailEl.classList.toggle("show", !isOpen) … })`), after the panel is shown, lazy-load once. Replace the body of that handler so that when opening, it calls a new helper `loadTktShot(detailEl)`. Add this helper near the other ticket helpers:
```js
async function loadTktShot(detailEl) {
  const box = detailEl.querySelector(".tkt-shot")
  if (!box || box.getAttribute("data-loaded")) return
  box.setAttribute("data-loaded", "1")
  const id = box.getAttribute("data-shot")
  try {
    const r = await fetch("/api/screenshots/" + encodeURIComponent(id))
    const d = await r.json().catch(() => ({}))
    if (d.url) {
      const img = document.createElement("img")
      img.src = d.url; img.alt = "Sim screenshot"
      img.addEventListener("click", () => window.open(d.url, "_blank", "noopener"))
      box.innerHTML = ""; box.appendChild(img)
    } else { box.innerHTML = '<div class="muted" style="font-size:12px">Screenshot unavailable</div>' }
  } catch { box.innerHTML = '<div class="muted" style="font-size:12px">Screenshot error</div>' }
}
```
And in the click handler, after `detailEl.classList.toggle("show", !isOpen)`, add: `if (!isOpen) loadTktShot(detailEl)` (i.e. when it just opened).

- [ ] **Step 6: Verify.** `cd prototype && bun build server.ts --target=bun --outfile=/tmp/td.js` → clean. `cd prototype && bun test` → green. The panel is HTML — confirm the file parses (build) and reason through the template; live verification happens post-deploy.
- [ ] **Step 7: Commit** `feat(tickets): rich detail panel — full context + inline screenshot (lazy, signed)`.

---

### Task 3: Housekeeping (version + changelog)

**Files:** `CHANGELOG.md`, `docs/PRD.md`, 5 manifests.

- [ ] **Step 1:** Bump all 5 manifests + PRD header by one patch above current master (reconcile at merge). CHANGELOG new top entry:
```markdown
## [<ver>] — 2026-06-18

### Added
- **Rich ticket detail panel.** Expanding a Sim ticket now shows the full
  observation, the suggested bug (title + body), severity/sentiment/Sim chips, the
  provenance citation, the page + time, and an inline screenshot thumbnail
  (lazy-loaded via a short-lived signed link; click to enlarge) — alongside the
  existing status/assignee/notes. No new data captured; surfaces what the Sim
  already recorded. (The notes field now also preloads its saved value.)
```
- [ ] **Step 2:** `cd prototype && bun test` green; confirm no manifest left at the old version.
- [ ] **Step 3: Commit** `chore: release <ver> — rich ticket detail panel`.

---

## Self-Review Notes
- **Spec coverage:** full observation + suggested bug ✓ (T2 S4); severity+sentiment+Sim ✓ (chips, T2 S4); provenance citation ✓ (sourceQuote+sourceDate, T1 expose + T2 render); page+timestamp ✓ (meta-line); inline thumbnail click-to-enlarge, lazy + signed ✓ (T2 S5); no DB change / reuse `/api/screenshots/:id` ✓; privacy (on-demand signed) ✓; notes-preload latent gap fixed ✓ (T2 S1). 
- **Placeholders:** none — concrete code throughout.
- **Type consistency:** `suggestedBug`/`sourceQuote`/`citedTraitIds`/`sourceDate` defined in T1 (FeedbackRow), consumed in T2 (tickets map → client `t.*`); `loadTktShot(detailEl)` defined + called in T2 S5.
