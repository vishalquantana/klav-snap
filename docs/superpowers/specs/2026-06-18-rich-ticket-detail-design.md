# Design: Rich Ticket Detail Panel (full Sim context + screenshot)

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan
**Author:** brainstormed with vishal@quantana.com.au (dogfooding klavity.quantana.top)

## Problem

A Sim review captures a lot — full first-person observation, a suggested bug
(title/body/severity), sentiment, which Sim/lens filed it, a provenance citation,
and a private screenshot. But the dashboard's expanded ticket panel only shows
**status / assignee / notes**. Dogfooding surfaced the gap: clicking a ticket, the
user expected the full context + the screenshot the Sim reviewed.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Context to show | ALL of: full observation, suggested-bug title+body, severity + sentiment + Sim/lens, provenance citation (source quote + "raised on <date>" + regression note), page + timestamp |
| Screenshot | **inline thumbnail**, lazy-loaded on expand via the existing `/api/screenshots/:id` signed URL; click to open full-size |
| DB / endpoints | **no DB change, no new endpoint** — all data is on the `feedback` row; reuse `/api/screenshots/:id` (already used by the observability drawer) |
| Privacy | screenshots stay private — short-lived signed link, fetched only on demand when a ticket is expanded |

## Architecture

### Data exposure (server)
The `feedback` table already stores `observation`, `suggested_bug_json`,
`sentiment`, `severity`, `screenshot_id`, `source_quote`, `cited_trait_ids_json`,
`source_date`. The read path drops some of these:
- Extend `FeedbackRow` + `rowToFeedback` in `prototype/lib/db.ts` to also read
  `suggested_bug_json` (→ `suggestedBug`), `source_quote` (→ `sourceQuote`),
  `cited_trait_ids_json` (→ `citedTraitIds`), `source_date` (→ `sourceDate`) if not
  already exposed. (`observation`, `sentiment`, `severity`, `screenshotId` already are.)
- Extend the dashboard tickets mapping in `prototype/server.ts` (the
  `/api/dashboard` "recent tickets" array) to pass these fields to the client:
  `observation` (full), `suggestedBug`, `sentiment`, `severity`, `screenshotId`,
  `sourceQuote`, `sourceDate`, plus existing `simName`/`urlPath`/`createdAt`/`status`/
  `assignee`/`notes`.

### Rendering (client — `prototype/public/dashboard.html`)
In the `.tkt-detail` panel (currently status/assignee/notes), add **above** them:
- Full **observation** paragraph (only if it differs from / is longer than the row title).
- **Suggested bug** block: bold title + body, with a `severity` chip.
- **Chips row**: severity · sentiment · Sim name/lens.
- **Provenance** (only when a citation exists): the source quote in quotes +
  "raised on `<date from sourceDate>`"; show the regression note if the citation
  carries one.
- **Page + timestamp**: `urlPath` · formatted `createdAt`.
- **Screenshot**: a small inline `<img>` thumbnail. On first expand of that ticket,
  call the existing `loadShot(screenshotId)` flow → `/api/screenshots/:id` (returns a
  signed URL), set the `<img src>`; clicking the thumbnail opens the signed URL
  full-size (new tab). Fetch lazily (only on expand, only once per ticket) — never
  prefetch all screenshots.

Reuse the existing `esc()` for all interpolated values (XSS-safe), and the existing
chip styles (`s-<sentiment>`, severity chip) where present.

## Out of scope
- No new DB columns, no schema migration, no new API endpoint.
- No change to how tickets are filed or to the tracker/connector export path.
- No prefetching of screenshots (lazy on expand only).

## Testing
- If `listFeedback`/`rowToFeedback` is unit-tested, extend it to assert the newly
  exposed fields round-trip (`suggestedBug`, `sourceQuote`, `citedTraitIds`,
  `sourceDate`). Otherwise a focused db test for the mapper.
- `bun build server.ts` clean; full `bun test` green.
- Live check on prod: expand a real Sim ticket → see full observation, suggested
  bug, chips, provenance, and the inline screenshot (click → full-size).

## Deployment / housekeeping
- Patch version bump (reconcile the exact number at merge time — master moves fast);
  SemVer lockstep (CHANGELOG + PRD + 5 manifests).
- Deploy: push master → ssh pull + `systemctl restart klav` + polled health (the
  deploy.sh-skips-restart gotcha). This is server-static HTML + a server mapping —
  no extension rebuild needed.

## File touch list
- `prototype/lib/db.ts` — `FeedbackRow` + `rowToFeedback` expose the extra fields.
- `prototype/server.ts` — dashboard "recent tickets" mapping passes the extra fields.
- `prototype/public/dashboard.html` — render context + lazy inline screenshot in `.tkt-detail`.
- `CHANGELOG.md`, `docs/PRD.md`, 5 manifests — version bump.
