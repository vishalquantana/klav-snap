# Sim Studio — design spec

**Date:** 2026-06-19
**Status:** Approved direction (hybrid A+C), pending implementation plan
**Supersedes:** `2026-06-18-single-sim-view-design.md` (the single-column focused single-Sim view)

## Problem

As Klavity accumulates transcripts from many stakeholders, the hard question becomes **attribution**: "Why does this persona say X? Why did this design decision get made?" The answer lives in *who said what, on what day, in which transcript* — and how a persona trait evolved across conversations. The current single-Sim view (`renderFocusedSim` in `public/index.html`, reached at `/app?sim=…`) is a single-column stack (identity → insights → source transcripts → evolution) that shows this data but doesn't make the **trace-back** legible or the persona **editable**.

The Sim Studio replaces that view with an Outlook-style 3-pane master/detail/inspector where attribution is first-class, personas are fully editable, and every change — AI-extracted *or* human-edited — is versioned in one append-only ledger.

## Chosen design

Hybrid of two explored mockups (see `public/sim-studio-a-triptych.html` and `public/sim-studio-c-evidence.html`, merged in `public/sim-studio-hybrid.html`):

- **Option A's 3-pane shell** as the daily-driver editing surface.
- **Option C's "evidence spine"** as the visual for the inspector's Evolution tab — clicking a trait lights up the transcript nodes that shaped it, with a "refined · date → date" connector telling the change story.

### Layout

```
┌─ App bar: Klavity · Sims Studio · [project chip] · [theme] ──────────────┐
├──────────────┬───────────────────────────────┬──────────────────────────┤
│ COL 1 ~280px │ COL 2 (flex)                  │ COL 3 ~360px             │
│ Sims list    │ Persona detail                │ Attribution inspector    │
│ + search     │  · identity header (editable) │  Tabs:                   │
│ + New Sim    │  · traits grouped             │   [Source]               │
│              │    PAIN / WANT / LOVE         │   [Evolution] ← spine    │
│ Transcripts  │    (each trait card editable) │   [Transcript]           │
│ folder       │                               │                          │
│ + Upload     │                               │                          │
└──────────────┴───────────────────────────────┴──────────────────────────┘
```

- **Column 1 — master list.** Sims as Outlook-style rows (avatar, name, role, "N traits · updated DATE"); selected row highlighted. A collapsible Transcripts folder lists project transcripts (title + date). `+ New Sim` and a transcript `+ Upload` affordance.
- **Column 2 — detail/editor.** Selected Sim's identity header (name/role/type/summary/avatar accent — all inline-editable via "Edit persona") and traits grouped under PAIN/WANT/LOVE. Each trait is a card showing text + a provenance chip (`↳ tr_02 · Jun 2`) + strength. Cards are selectable (drives Column 3) and editable.
- **Column 3 — attribution inspector**, three equal-weight tabs:
  - **Source** — the selected trait's exact quote, speaker, transcript, date, source id, area; "View full transcript →"; strength.
  - **Evolution** — the **evidence spine**: a vertical chronological timeline (newest first) of the transcript/edit events that shaped *this* trait, tinted in the trait's kind color, each node carrying an op badge (CREATE / REINFORCE / REFINE / CONTRADICT / SUPERSEDE / REOPEN / **EDIT**) + an evidence callout with the quote. A "refined · DATE → DATE" connector chip renders between linked nodes.
  - **Transcript** — the source transcript rendered as dialogue with the trait's quote highlighted inline.

## Data model — reuse + one extension

The schema already supports nearly all of this (see `lib/db.ts`, `lib/provenance.ts`):

- `personas` — identity (name/role/type/initials/accent/summary/avatar), `source_transcript_id`, `insights_json` (legacy).
- `sim_traits` — normalized traits with per-attribute attribution: `kind`, `text`, `status`, `strength`, `src_transcript_id`, `src_quote`, `src_speaker`, `area`, `issue_type`, `severity`.
- `trait_events` — **append-only ledger**: `op` (create/reinforce/refine/contradict/supersede/reopen), `before_text`, `after_text`, `quote`, `speaker`, `source_date`, `reason`. This is the versioning backbone.

**Extension for "editable with versioning":** human edits are recorded as `trait_events`, not silent overwrites.

- Add op value(s): `edit` (manual trait text/kind/severity change) and `manual_create` / `manual_archive` for traits created or retired by a person. Record actor email in `reason` (e.g. `edited_by:dev2@quantana.com.au`) — or add an `actor` column if cleaner; decided in the plan.
- Editing a trait: write the new `sim_traits` row state via `updateTrait`, AND append a `trait_events` row capturing `before_text`/`after_text` + actor + timestamp. The Evolution spine then interleaves AI and human history seamlessly.
- Editing identity (name/role/summary/etc.) is a persona-level change; version it with a lightweight `persona_events` ledger OR reuse `trait_events` semantics at the persona scope (decided in plan — prefer a small `persona_edits` audit if trait_events doesn't fit cleanly).

No destructive edits: status changes (active → archived/superseded) preserve the row + log the event, consistent with the existing reconcile model where "resolved" traits can `reopen`.

## API surface

**Exists, reuse:**
- `GET /api/personas?project=` · `POST /api/personas` · `PUT /api/personas/:id` (full upsert) · `DELETE /api/personas/:id`
- `GET /api/sims/:id/evolution` (powers the spine) · `GET /api/sims/:id/transcripts` · `GET /api/transcripts/:id`
- `POST /api/transcripts` (upload → extract → match → reconcile)

**New (for editable + versioned traits):**
- `GET /api/sims/:id/traits?project=` — list active traits with attribution (Column 2 source of truth; today the studio reads `insights[]` off the persona — move to traits for fidelity).
- `POST /api/sims/:id/traits` — manually add a trait (op `manual_create`, actor logged).
- `PUT /api/sims/:id/traits/:traitId` — edit a trait's text/kind/severity/area; appends an `edit` event with before/after + actor.
- `DELETE /api/sims/:id/traits/:traitId` — archive (soft) a trait; appends `manual_archive`.
- (Identity edits continue through `PUT /api/personas/:id`, augmented to write a persona audit event.)

All endpoints project-scoped and auth-gated exactly like the existing persona/sim routes (`sessionEmail || bearerEmail`, `resolveProject`).

## Routing

The hybrid **replaces** the focused single-Sim view. `/app?sim=…` renders the 3-pane studio (dashboard sim cards already deep-link here). The no-`?sim=` path (`renderDock`) is unchanged. Retire `renderFocusedSim`'s single-column markup; keep its lazy-load plumbing (transcripts + evolution fetch) and repoint it at the new layout. The standalone mockup routes (`/sim-studio-a|b|c|hybrid`) stay as design references but are not the shipped surface.

## v1 scope

In scope:
1. **Read + attribution** — 3-pane layout wired to live APIs (`/api/personas`, `/api/sims/:id/{traits,evolution,transcripts}`, `/api/transcripts/:id`).
2. **Edit persona inline** — identity + traits, persisted via `PUT /api/personas/:id` and the new trait endpoints.
3. **New Sim + transcript upload** — create-sim flow and an in-studio transcript uploader (`POST /api/transcripts`), so the full loop lives here.
4. **Versioning** — every human edit appends to the event ledger; the Evolution spine shows AI + human history with actor + date.

Out of scope (later): bulk multi-sim editing, diff/restore-to-version UI (the events make this possible but the restore UX is deferred), real-time collaboration.

## Components (isolation)

- **Studio shell** (`renderStudio`) — owns 3-column layout, project chip, theme, selection state (selected sim, selected trait, active inspector tab). Single source of UI truth.
- **Sim list** (Col 1) — pure render of personas + transcripts folder; emits select/new/upload events.
- **Persona editor** (Col 2) — render + inline edit of identity and traits; calls persona/trait APIs; optimistic update + refetch.
- **Attribution inspector** (Col 3) — three tab renderers. Source + Transcript are pure renders of selected-trait data; Evolution is the spine renderer fed by `/api/sims/:id/evolution` filtered to the selected trait.
- **Trait service** (server) — the new trait endpoints + event-logging helper (`logTraitEdit`) that wraps `updateTrait` + `insertTraitEvent` atomically.

Each is independently testable: the spine renderer takes an events array → DOM; the trait service takes (edit, actor) → persisted state + event row.

## Testing

- Server: unit tests for the trait edit/create/archive endpoints — assert the `sim_traits` row updates AND a correctly-shaped `trait_events` row is appended (before/after/actor/op). Extend `server.connectors.test.ts` patterns.
- Provenance: test that `/api/sims/:id/evolution` interleaves a manual `edit` event with AI events in correct date order.
- Frontend: the studio is vanilla JS in a static HTML page; smoke via Puppeteer (the repo's `codebase-evaluator` pattern) — load `/app?sim=…`, assert 3 panes render, select a trait updates the inspector, edit a trait round-trips and appears in the spine.

## Open decisions (resolve in plan)

- Persona-identity versioning: new `persona_edits` table vs. overloading `trait_events`. (Lean: small dedicated audit, keep `trait_events` trait-scoped.)
- Actor capture: `reason` string vs. new `actor` column on `trait_events`. (Lean: add nullable `actor` column — cleaner queries, small migration.)
- Whether Column 2 reads from `sim_traits` (new `GET /api/sims/:id/traits`) immediately or transitionally from `insights[]`. (Lean: traits directly — fidelity matches the inspector.)
