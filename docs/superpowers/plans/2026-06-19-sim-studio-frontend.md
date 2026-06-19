# Sim Studio Frontend (3-pane Studio UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-column focused single-Sim view (`renderFocusedSim` in `prototype/public/index.html`) with the hybrid 3-pane Sim Studio (list / persona detail / attribution inspector), wired to live APIs and fully editable, so `/app?sim=…` opens the new studio.

**Architecture:** Port the design + CSS + interaction model from the approved mockup `prototype/public/sim-studio-hybrid.html` into `index.html`'s studio page. A new `renderStudio(simId)` replaces `renderFocusedSim`; it composes three pane renderers (`renderSimList`, `renderPersonaDetail`, `renderInspector`) fed by live endpoints. Selection state (selected sim, selected trait, active inspector tab) lives in module-scope vars. Edits call the v0.18.0 trait/persona endpoints and re-fetch. Vanilla JS, no framework (matches the file).

**Tech Stack:** Bun server (`server.ts`), vanilla JS in a static HTML page, `bun test` (subprocess pattern) for the one new endpoint, manual/Puppeteer smoke for the UI.

## Global Constraints

- Work ONLY in the worktree `/Users/vishalkumar/Downloads/qbug/klav-snap-simstudio` (branch `feat/sim-studio`). Never touch the shared `klav-snap` dir. (one line)
- All `/api/*` routes project-scoped & auth-gated (same `sessionEmail||bearerEmail` + `resolveProject` pattern). (one line)
- Design source of truth: `prototype/public/sim-studio-hybrid.html` — match its markup classes, CSS tokens (Fraunces/Hanken/JetBrains Mono, cream+indigo palette), and interactions. Reuse its CSS verbatim where possible. (one line)
- The no-`?sim=` studio path (`renderDock`) must remain unchanged — only the `?sim=` focused path is replaced. (one line)
- Trait kind colors: PAIN=`var(--rose)`, WANT=`var(--amber)`, LOVE=`var(--green)`. (one line)
- SemVer lockstep bump once, in the final task. (one line)
- Never `git add -A`; stage explicit paths. Do not push/deploy/merge. (one line)

## API contract (already built in v0.18.0 backend, except Task 1)

- `GET /api/personas?project=` → `{ personas: PersonaRow[] }`
- `GET /api/sims/:id/traits?project=` → `{ simId, traits: Trait[] }` (active; `kind,text,strength,srcQuote,srcTranscriptId,srcSpeaker,area,severity`)
- `GET /api/sims/:id/evolution?project=` → `{ events: [{ op, afterText, beforeText, quote, speaker, sourceDate, transcriptId, transcriptTitle, reason, actor, area, issueType, severity, isRegression }] }`
- `GET /api/sims/:id/transcripts?project=` → `{ transcripts: [{ id, title, sourceDate, addedBy }] }`
- `GET /api/transcripts/:id?project=` → `{ id, title, rawText, sourceDate, addedBy, speakers }`
- `POST /api/personas?project=` `{name,role,type,initials,accent,summary,insights:[],avatar?}` → `{ persona }`
- `PUT /api/personas/:id?project=` (same body) → `{ ok }` + logs `persona_edits`
- `POST /api/sims/:id/traits?project=` `{kind,text,srcQuote?,srcTranscriptId?,severity?}` → `{ trait }`
- `PUT /api/sims/:id/traits/:traitId?project=` `{text?,kind?,severity?,area?}` → `{ trait }`
- `DELETE /api/sims/:id/traits/:traitId?project=` → `{ ok }`
- `POST /api/transcripts?project=` `{transcript|raw_text,title?,sourceDate?,speakers?}` → `{ transcriptId, matched, opsApplied }`
- **NEW (Task 1):** `GET /api/transcripts?project=` → `{ transcripts: [{ id, title, sourceDate, addedBy }] }`

---

### Task 1: `GET /api/transcripts` list endpoint

**Files:**
- Modify: `prototype/server.ts` (the existing `if (req.method === "POST" && path === "/api/transcripts")` block at ~line 1223 — add a GET sibling)
- Test: `prototype/server.traits.test.ts` (extend the existing file from the backend plan)

**Interfaces:**
- Consumes: `listTranscripts(projectId)` (already imported).
- Produces: `GET /api/transcripts?project=<pid>` → `{ transcripts: TranscriptRow[] }` (newest-first by `sourceDate`).

- [ ] **Step 1: Write the failing test** (append to `server.traits.test.ts`; it already seeds a project + auth):

```typescript
test("GET /api/transcripts lists project transcripts", async () => {
  // seed one transcript via the POST path or raw insert in the harness, then:
  const res = await authedFetch(`/api/transcripts?project=${PROJECT_ID}`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.transcripts)).toBe(true)
})
```

- [ ] **Step 2: Run, expect FAIL** (GET → currently falls through / 404):

Run: `cd prototype && bun test server.traits.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the GET branch** just before the `POST /api/transcripts` handler in `server.ts`:

```typescript
    if (req.method === "GET" && path === "/api/transcripts") {
      const me2 = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!me2) return json({ error: "Sign in to continue." }, 401)
      const proj2 = await resolveProject(me2, url.searchParams.get("project"))
      if (!proj2) return json({ error: "No project." }, 400)
      const transcripts = await listTranscripts(proj2.id)
      return json({ transcripts }, 200)
    }
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd prototype && bun test server.traits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd prototype && git add server.ts server.traits.test.ts
git commit -m "feat(api): GET /api/transcripts — list project transcripts"
```

---

### Task 2: Studio CSS + shell — port the 3-pane layout into index.html

**Files:**
- Modify: `prototype/public/index.html` (add the studio CSS block in `<style>`; the studio mounts into the existing `#dock` container)
- Reference (read, copy CSS from): `prototype/public/sim-studio-hybrid.html`

**Interfaces:**
- Produces: CSS classes `.ss-grid`, `.ss-col1`, `.ss-col2`, `.ss-col3`, `.ss-simrow`, `.ss-trait`, `.ss-tabs`, `.ss-spine`, `.ss-evidence` (etc., matching the hybrid mockup's class names) available in `index.html`. A `renderStudio(sim)` stub function that renders the 3 empty columns into `#dock`.

- [ ] **Step 1:** Open `prototype/public/sim-studio-hybrid.html`, copy its studio-specific CSS rules (the 3-column grid, columns, sim rows, trait cards, inspector tabs, evidence spine) into `index.html`'s `<style>`, namespacing class names with an `ss-` prefix if any collide with existing `index.html` classes (check for collisions first with a grep). The shared design tokens (`--ink`, `--paper`, `--indigo`, fonts) already exist in `index.html` — do NOT duplicate them.

- [ ] **Step 2:** Add a `renderStudio(sim)` function near `renderFocusedSim` that renders the three-column skeleton into `#dock`:

```javascript
function renderStudio(sim){
  switchL1Tab('sims')
  const dock = $("dock"); if(!dock) return
  dock.innerHTML = `<div class="ss-grid">
    <aside class="ss-col1" id="ssCol1"></aside>
    <section class="ss-col2" id="ssCol2"></section>
    <aside class="ss-col3" id="ssCol3"></aside>
  </div>`
}
```

- [ ] **Step 3: Smoke check** — load the page and confirm the 3 columns render (no console errors). Temporarily route the `?sim=` path to `renderStudio` (Step in Task 3) or call `renderStudio` from the console. Verify with a screenshot in Chrome at `/app?project=<pid>&sim=<id>`.

- [ ] **Step 4: Commit**

```bash
cd prototype && git add public/index.html
git commit -m "feat(studio): 3-pane shell + ported studio CSS"
```

---

### Task 3: Column 1 — sims list + transcripts folder (live)

**Files:** Modify `prototype/public/index.html`

**Interfaces:**
- Consumes: `GET /api/personas`, `GET /api/transcripts` (Task 1). Uses existing `pq()` helper (appends `?project=`).
- Produces: `renderSimList(activeSimId)` populating `#ssCol1`; clicking a sim row navigates to `?sim=<id>` (reuse the existing `location.href` pattern from `renderFocusedSim`'s back button). A collapsible "Transcripts" folder lists transcripts.

- [ ] **Step 1:** Implement `renderSimList(activeSimId)`: `fetch(pq('/api/personas'))` → render each persona as `.ss-simrow` (avatar via existing `avatarInner(sim)` + `ds-av`, name, role, "N traits · updated DATE"); highlight `activeSimId`. Then `fetch(pq('/api/transcripts'))` → render the Transcripts folder rows (title + mono date). Row click on a sim sets `location.href` with `?project=&sim=`.
- [ ] **Step 2:** Call `renderSimList(sim.id)` from `renderStudio`.
- [ ] **Step 3: Smoke check** in Chrome: Col 1 lists real sims + transcripts; clicking a sim switches the studio. Screenshot.
- [ ] **Step 4: Commit**

```bash
cd prototype && git add public/index.html && git commit -m "feat(studio): column 1 — live sims list + transcripts folder"
```

---

### Task 4: Column 2 — persona detail + traits (live, read)

**Files:** Modify `prototype/public/index.html`

**Interfaces:**
- Consumes: `GET /api/sims/:id/traits`; the `sim` object (persona identity).
- Produces: `renderPersonaDetail(sim)` populating `#ssCol2`: identity header (avatar, name, role, type chip, summary, "Edit persona" button), then traits grouped PAIN/WANT/LOVE as `.ss-trait` cards (text + provenance chip `↳ <tr> · DATE` + strength). Each card click sets the selected trait and calls `renderInspector(trait)`. Selects the first trait by default.

- [ ] **Step 1:** Implement `renderPersonaDetail(sim)`: fetch traits, group by `kind`, render cards using the hybrid mockup's `.ss-trait` markup; wire card `onclick` → `selectedTraitId = t.id; renderInspector(t)`.
- [ ] **Step 2:** Call it from `renderStudio`; auto-select first trait.
- [ ] **Step 3: Smoke check**: Col 2 shows Sarah's (or seeded sim's) real traits grouped by kind; clicking a trait highlights it. Screenshot.
- [ ] **Step 4: Commit**

```bash
cd prototype && git add public/index.html && git commit -m "feat(studio): column 2 — persona detail + live traits"
```

---

### Task 5: Column 3 — attribution inspector (Source / Evolution / Transcript)

**Files:** Modify `prototype/public/index.html`

**Interfaces:**
- Consumes: selected `trait` (for Source), `GET /api/sims/:id/evolution` (Evolution spine), `GET /api/transcripts/:id` (Transcript tab).
- Produces: `renderInspector(trait)` populating `#ssCol3` with 3 tabs. Source = quote/speaker/transcript/date/strength (from trait). Evolution = the lit-spine visual from the hybrid mockup, fed by the evolution feed filtered to `trait.id`, rendering op badges incl. `edit`/`manual_create`/`manual_archive` and `actor` ("edited by X"). Transcript = `rawText` with the trait's `srcQuote` highlighted. Tabs switch via vanilla JS; Source default.

- [ ] **Step 1:** Implement `renderInspector(trait)` with the three tab renderers; port the evidence-spine markup/CSS behavior from the hybrid mockup's Evolution tab. Filter evolution events to this trait (match `transcriptId`/text or fetch all and group). Render `actor` when present.
- [ ] **Step 2: Smoke check**: select a trait → Source shows its quote; Evolution shows the spine (incl. any `edit` events with actor); Transcript highlights the quote. Tabs switch. Screenshot each tab.
- [ ] **Step 3: Commit**

```bash
cd prototype && git add public/index.html && git commit -m "feat(studio): column 3 — Source/Evolution/Transcript inspector"
```

---

### Task 6: Inline edit — persona identity + traits (write)

**Files:** Modify `prototype/public/index.html`

**Interfaces:**
- Consumes: `PUT /api/personas/:id`, `PUT /api/sims/:id/traits/:traitId`, `DELETE /api/sims/:id/traits/:traitId`.
- Produces: "Edit persona" toggles inline editable fields (name/role/summary) → Save → PUT → re-render. Each trait card gets edit (inline text) + archive (✕) controls → PUT/DELETE → re-fetch traits + inspector. Optimistic-then-refetch.

- [ ] **Step 1:** Implement persona-identity inline edit: "Edit persona" swaps header text for inputs + Save/Cancel; Save → `fetch(pq('/api/personas/'+id), {method:'PUT', body: JSON.stringify({...current, ...edits, insights: current.insights||[]})})` → `renderStudio`.
- [ ] **Step 2:** Implement trait edit + archive: each `.ss-trait` gets an edit pencil (inline textarea → PUT) and an archive ✕ (confirm → DELETE). After either, re-fetch traits and re-render Col 2 + inspector. The Evolution spine should now show the new `edit`/`manual_archive` event.
- [ ] **Step 3: Smoke check**: edit a trait's text → it updates AND a new "edited by <you>" node appears in the Evolution spine. Edit persona name → persists on reload. Screenshot.
- [ ] **Step 4: Commit**

```bash
cd prototype && git add public/index.html && git commit -m "feat(studio): inline edit — persona identity + traits (versioned)"
```

---

### Task 7: New Sim + transcript upload

**Files:** Modify `prototype/public/index.html`

**Interfaces:**
- Consumes: `POST /api/personas`, `POST /api/transcripts`.
- Produces: "+ New Sim" opens a small inline form (name/role/type/summary) → POST → navigate to the new `?sim=`. A transcript "+ Upload" (in Col 1's Transcripts folder) opens a paste/drop form (title + text) → POST → on success show matched sims + refresh the list.

- [ ] **Step 1:** Implement "+ New Sim" form → `POST /api/personas` with `{name,role,type,initials:<derived>,accent:'#6366f1',summary,insights:[]}` → `location.href` to the created sim.
- [ ] **Step 2:** Implement transcript upload form → `POST /api/transcripts` `{transcript:<text>,title}` → on `{transcriptId, matched}` show a toast "Extracted → matched N sims" and re-render Col 1.
- [ ] **Step 3: Smoke check**: create a sim (appears in Col 1, opens its studio); upload a transcript (appears in the folder). Screenshot.
- [ ] **Step 4: Commit**

```bash
cd prototype && git add public/index.html && git commit -m "feat(studio): new Sim + transcript upload flows"
```

---

### Task 8: Wire `?sim=` to renderStudio, retire renderFocusedSim, version bump

**Files:** Modify `prototype/public/index.html`, `CHANGELOG.md`, `docs/PRD.md`, 5 manifests

**Interfaces:**
- Produces: the `?sim=` path calls `renderStudio` (not `renderFocusedSim`); the old `renderFocusedSim` function + its now-unused `.fsv-*` CSS are removed (keep its lazy-load helpers if `renderStudio` reuses them).

- [ ] **Step 1:** At the studio bootstrap (`index.html:~534`, where `renderFocusedSim(focusSim)` is called), replace with `renderStudio(focusSim)`. Delete the `renderFocusedSim` function body and the `.fsv-*` CSS rules it owned (grep to confirm no other caller).
- [ ] **Step 2: Full smoke pass** in Chrome at `/app?project=<pid>&sim=<id>`: all 3 panes, tab switching, trait edit→spine, new sim, upload — no console errors. Screenshot the final studio.
- [ ] **Step 3:** Bump version (0.18.0 → 0.19.0) in lockstep across `CHANGELOG.md`, `docs/PRD.md`, and the 5 manifests (`package.json`, `packages/{core,extension,sdk}/package.json`, `packages/extension/manifest.json`). CHANGELOG entry: "Sim Studio: 3-pane studio UI replaces single-Sim view — live attribution inspector, inline versioned editing, new-Sim + transcript upload."
- [ ] **Step 4: Run full suite** (`cd prototype && bun test`) → expect all pass (no backend regressions).
- [ ] **Step 5: Commit**

```bash
cd prototype && git add public/index.html
cd .. && git add CHANGELOG.md docs/PRD.md package.json packages/core/package.json packages/extension/package.json packages/sdk/package.json packages/extension/manifest.json
git commit -m "feat(studio): replace single-Sim view with 3-pane Sim Studio; release 0.19.0"
```

---

## Self-Review

**1. Spec coverage** (`2026-06-19-sim-studio-design.md`): 3-pane layout → Tasks 2-5; read+attribution wired → Tasks 3-5; equal-weight Source/Evolution/Transcript → Task 5; edit persona inline → Task 6; edit/add/archive traits → Tasks 6,7; New Sim + transcript upload → Task 7; versioning surfaced (actor in spine) → Task 5/6; routing replaces `/app?sim=` focused view → Task 8. ✓ `GET /api/transcripts` gap → Task 1. ✓

**2. Placeholder scan:** UI tasks specify concrete functions, the exact API calls, and the mockup as the markup source (not "build the UI"). The one soft area — "port CSS from the hybrid mockup" — references a real, committed file with the exact rules, which is the correct DRY move (don't re-author known-good CSS). Smoke checks name the exact URL + what to assert.

**3. Type consistency:** Function names consistent across tasks (`renderStudio`, `renderSimList`, `renderPersonaDetail`, `renderInspector`). API field names match the v0.18.0 contract (`traits[].srcQuote`, `events[].actor`, `events[].afterText`). `pq()`/`avatarInner()`/`switchL1Tab()`/`$()` are existing `index.html` helpers reused, not redefined.

> Verification is Chrome smoke (the page is vanilla JS in a static HTML file; the repo has no DOM unit harness). The one new endpoint (Task 1) gets a real `bun test`. Backend already has 139 passing tests.
