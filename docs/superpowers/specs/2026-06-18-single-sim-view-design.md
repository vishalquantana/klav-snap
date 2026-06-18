# Design: Single-Sim Focused View (deep-link + transcript history)

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan
**Author:** brainstormed with vishal@quantana.com.au

## Problem

Clicking a Sim on the dashboard ("YOUR SIMS") opens the studio (`/app`) but does
**not** focus the clicked Sim (the link has no sim id), and there's no clear view
of **which transcripts shaped a Sim** or the evidence behind each insight. The
per-Sim "📜 Evolution" timeline exists but is hidden behind a toggle, and there's
no way to see/open the source calls.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Entry | Dashboard Sim cards deep-link to `/app?project=<id>&sim=<simId>` |
| Studio behaviour | `?sim=` present → **focused single-Sim view** (that Sim in depth, "← All Sims" back link); absent → normal all-Sims studio (unchanged) |
| Transcript history (all of) | (a) **source-transcript list** (the calls that shaped this Sim, click-to-view raw text); (b) **Evolution timeline** surfaced prominently (not behind a toggle); (c) **per-insight provenance** (source quote + which transcript/date) inline on each insight |
| Endpoints | reuse `/api/sims/:id/evolution`; add `GET /api/sims/:id/transcripts` + `GET /api/transcripts/:id` (both project-scoped, read-only). No schema change. |

## Architecture

### Deep-link (dashboard → studio)
- `prototype/public/dashboard.html`: the "YOUR SIMS" card anchors currently point to
  `/app` (with the existing `?project=` carry). Add the Sim id so each card →
  `/app?project=<id>&sim=<simId>`. (Reuse the existing project-carry helper that
  rewrites `a[href^="/app"]`; the per-card link sets `?sim=` itself.)

### Studio focused view (`prototype/public/index.html`)
- Add `studioSimId()` (reads `?sim=` like the existing `studioProjectId()` reads `?project=`).
- On load, after Sims are fetched: if `studioSimId()` matches a loaded Sim, render a
  **focused single-Sim view** in place of the dock — one Sim, with a "← All Sims"
  link (clears `?sim=` and re-renders the normal studio). No `?sim=` → unchanged.
- The focused view contains:
  1. **Header** — avatar, name, role, type, summary (existing editable fields/edit affordances reused).
  2. **Insights with provenance** — each pain/want/love renders its `quote` and, when
     `sourceTranscriptId` is set, the transcript title + date (resolved from the
     transcripts list). Insights already carry `traitId`/`quote`/`sourceTranscriptId`
     in `insights_json` — surfaced inline, not a new fetch.
  3. **Source transcripts** — lazy `GET /api/sims/:id/transcripts` → list of {id, title,
     sourceDate, addedBy}; each row click → `GET /api/transcripts/:id` → show the raw
     transcript text (modal/expander).
  4. **Evolution** — lazy `GET /api/sims/:id/evolution` (existing), rendered inline/expanded.

### New endpoints (`prototype/server.ts`, both project-scoped via the existing resolveProject/cookie-or-bearer pattern, admin or member)
- `GET /api/sims/:id/transcripts` → the **distinct** transcripts that shaped this Sim:
  derive from `listTraitEvents(simId)` distinct `transcriptId` (excluding the
  `legacy_import` sentinel), join `listTranscripts(projectId)` for title/sourceDate/
  addedBy; newest-first. Returns `[{ id, title, sourceDate, addedBy }]`.
- `GET /api/transcripts/:id` → one transcript's raw text, scoped to the caller's
  project: `{ id, title, rawText, sourceDate, addedBy, speakers }`. Resolve via
  `listTranscripts(projectId)` (find by id) — or a `transcriptById(projectId, id)`
  helper in `db.ts` if cleaner. 404 if not in the caller's project.

### Data already available
- `insights_json` carries per-insight `traitId`, `quote`, `sourceTranscriptId` (from
  `insightsFromTraits`) → per-insight provenance is client-side rendering of existing data.
- `trait_events` carries `transcriptId` per change → source-transcript derivation + evolution.
- `transcripts` table has `rawText`, `title`, `sourceDate`, `addedBy` (`listTranscripts`).

## Out of scope
- No schema change; no new write paths. Editing a Sim's fields uses the existing save path.
- The embodied-Sims "parking area / walk + highlight" feature is a SEPARATE queued spec.
- No transcript editing/deletion here — view only.

## Testing
- New endpoints: db-backed tests (hermetic libsql, namespaced ids) — `GET /api/sims/:id/transcripts`
  returns the distinct source transcripts (excludes legacy_import, newest-first); the
  transcript-fetch returns raw text and is project-scoped (a transcript from another
  project → not returned / 404). Test the derivation helper as a pure/db function.
- `bun build server.ts` clean; full `bun test` green. Studio is HTML — focused-view
  rendering verified by build + a live check (click a Sim from the dashboard).

## Deployment / housekeeping
- Minor version bump (reconcile at merge); SemVer lockstep (CHANGELOG + PRD + 5 manifests).
- Deploy: push master → ssh pull + `systemctl restart klav` + polled health. Server +
  static HTML only — no extension rebuild.

## File touch list
- `prototype/public/dashboard.html` — Sim cards deep-link with `&sim=<id>`.
- `prototype/public/index.html` — `studioSimId()`, focused single-Sim view (header +
  provenance insights + source transcripts + evolution), "← All Sims" back link.
- `prototype/server.ts` — `GET /api/sims/:id/transcripts`, `GET /api/transcripts/:id`.
- `prototype/lib/db.ts` — (optional) `transcriptById(projectId, id)` helper.
- `prototype/lib/*.test.ts` — endpoint/derivation tests.
- `CHANGELOG.md`, `docs/PRD.md`, 5 manifests — version bump.
