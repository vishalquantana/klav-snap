# Restore insight Overview + clickable KPI cards → filtered Tickets

**Date:** 2026-06-21
**Branch:** `feat/clickable-stat-cards`
**Scope:** `prototype/public/dashboard.html` only. No server changes.

## Problem

Two issues, one root:

1. **Regression (bug).** The dashboard's redesigned "insight Overview" — the KPI strip
   (Open issues w/ Critical·High·Low, Recurring, Sentiment, Feedback·7d + sparkline) and the
   "🔧 Fix next / Hotspots" panel — was added in commit `3cf0f96`. The `feat/icons-not-emojis`
   branch was built off a **stale base** (`904ea12`, pre-redesign) and its merge (`21bb000`)
   **clobbered the redesigned overview**, reverting master to the old 4-count `.stats` row
   (Feedback / Sims / Teammates / Tickets). The redesign's CSS (`.kpis`/`.kpi`/`.kpi-sev`/
   `.fixwrap`…) and JS (`renderStats`, `renderFixNext`) **survived but are orphaned** — they target
   `kpiSev`/`kpiRecur`/`kpiSent`/`kpiVol`/`fixNext`/`hotspots`, which no longer exist. So on master
   the overview is broken: the four old cards sit on "—" forever (no JS fills `stFeedback` etc.)
   and the KPI/Fix-next panels are gone. Prod still shows the good version only because it serves a
   pre-regression deploy; the next deploy regresses it for everyone.

2. **Feature request.** The KPI cards aren't clickable. The user expects clicking a card to land on
   a filtered view of those tickets.

## Goal

Restore the insight Overview to match what the redesign intended (and what prod still shows), then
make each KPI card a shortcut into the Tickets view filtered to exactly those issues.

## Design

One file: `prototype/public/dashboard.html`. No API change — `/api/dashboard` already returns
`insights` (`openBySeverity`, `recurring`, `sentiment`, `volume7d`, `hotspots`) that `renderStats`/
`renderFixNext` consume; those functions are intact.

### Part 1 — Restore the overview markup (the regression fix)

Replace the dead old `.stats` block (currently `#stats` with `stFeedback`/`stSims`/`stTeam`/
`stTickets`) with the redesign's markup from `3cf0f96`:

- The **KPI strip** `<div class="kpis" id="kpis" data-view="overview">` with four `.kpi` cards:
  Open issues (`kpiSev` severity breakdown), Recurring (`kpiRecur` + "issues seen 3+ times"),
  Sentiment (`kpiSent` + "frustrated / confused"), Feedback·7 days (`kpiVol` + `kpiSpark`).
- The **Fix next + Hotspots** card (`fixNext` list + `hotspots`), `data-view="overview"`.
- **Icon parity:** the redesign used a `🔧` emoji in the Fix-next heading; render it with the same
  inline SVG wrench/`kicon` style the rest of the dashboard now uses (so the icons-not-emojis work
  isn't reintroduced as an emoji). No other markup in the file is reverted — only this overview
  block is restored; the icon conversions elsewhere stay.

Result: `renderStats`/`renderFixNext` light up with real data again; the old orphaned `.stats`
markup and its dead `st*` ids are removed.

### Part 2 — Clickable KPI cards → filtered Tickets

Add a lightweight **filter state** to the Tickets kanban and wire the cards to it.

- **Filter state:** a module-level `_kbFilter = { type, value, label } | null` alongside the existing
  `_kanbanSearch`. `renderTicketsKanban` applies it to its source `tickets` list (in addition to the
  text search), and renders a **clearable filter chip** above the board ("Filtered: Critical
  severity ✕") that resets `_kbFilter` and re-renders on click. Filter predicates:
  - `severity` → `t.severity === value` (value ∈ high|medium|low; "low" also matches `none`).
  - `open` → `(t.status||"open") !== "done"`.
  - `recurring` → `(t.recurrence||1) >= 3`.
  - `sentiment-neg` → `t.sentiment === "frustrated" || t.sentiment === "confused"`.
- **Navigation helper:** `goToTicketsFiltered(filter)` sets `_kbFilter`, switches to the Tickets
  view the same way the nav does — `document.body.setAttribute('data-view','tickets')` + move the
  `.active` class to the `nv[data-go="tickets"]` button — then calls `renderTicketsKanban()` and
  scrolls the board into view.
- **Card wiring (in `renderStats`):**
  - **Open issues** card → `goToTicketsFiltered({type:'open'})`; the three severity numbers
    (Critical/High/Low) are individually clickable → `severity` filter for that level.
  - **Recurring** card → `{type:'recurring'}`.
  - **Sentiment** card → `{type:'sentiment-neg'}`.
  - **Feedback·7 days** card → Tickets view, no filter (just `_kbFilter=null`, all tickets).
  - Cards get `cursor:pointer`, a hover affordance, `role="button"`, `tabindex="0"`, and
    Enter/Space keyboard activation.
- **Fix-next rows** already open the single ticket (`openSingleTicket`) — unchanged.

## Out of scope (YAGNI)

- No new API/insights fields; reuse what `/api/dashboard` already returns.
- No multi-filter combinations or a filter UI panel — one active card-filter at a time, plus the
  existing text search. The chip clears it.
- No reverting any of the icons-not-emojis work beyond the single restored overview block.

## Security

- Filter values are fixed literals from card handlers (not user free-text); predicates compare
  against `t.severity`/`t.status`/`t.sentiment`. The chip label is built from those known literals
  and set via `textContent`. No new injection surface.

## Testing / verification

- No unit-test harness for the static dashboard JS. Verify by:
  - Parse-check the inline scripts (Bun transpiler) — 0 errors.
  - Browser smoke (harness or real): overview shows KPI cards + Fix-next with data; clicking each
    card switches to Tickets with the right filter chip and a correctly narrowed board; clearing the
    chip restores the full board; keyboard activation works.
- Confirm `/api/dashboard` still returns `insights` (grep server) so the cards populate.

## Success criteria

- Master's overview again shows the KPI insight strip + Fix-next (no more "—" dead cards).
- Each KPI card (and the severity sub-numbers) navigates to Tickets filtered to those issues, with a
  visible, clearable filter chip.
- No regression to the kanban text search, single-ticket view, or the icon styling elsewhere.
