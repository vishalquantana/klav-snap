# Feedback triage gate — design

**Date:** 2026-06-21
**Branch:** `feat/feedback-triage`
**Status:** Approved, ready for implementation plan

## Problem

The Overview dashboard aggregates **all** raw feedback (widget reports, Sim
reviews, auto-Sim findings) into the headline cards — "Open issues" (e.g.
10 critical / 14 high / 73 low), "Recurring", "Sentiment", "Feedback · 7 days".
Those numbers are real (live `COUNT`/`GROUP BY` over the `feedback` table), but
they read like *tracked bugs* when in fact most are un-triaged feedback. Only
the items exported to an external tracker (`plane_issue_key` set) show under the
"Tickets" nav — 12 of ~97. There is no signal that raw feedback must be reviewed
and accepted as a bug before it counts, and no path to do that triage.

## Goal

Introduce an explicit **triage gate**: raw feedback lands as "needs triage"; a
human accepts it as a bug or dismisses it. The Overview then honestly separates
*accepted bugs* from the *triage backlog*, with a clear call to action.

## Lifecycle & states

`feedback.status` is already a free-text column (default `'open'`). We add two
values — **no schema migration required**:

```
new ──accept──▶ open ──▶ in_progress ──▶ done
 └──dismiss──▶ dismissed
```

- **`new`** — needs triage (the queue)
- **`open` / `in_progress` / `done`** — an accepted bug on the existing board
- **`dismissed`** — triaged as "not a bug"; archived, excluded from all counts

### Auto-accept (skip the queue)

At intake, an item is born **`open`** (auto-accepted) when:

- `severity === 'high'`, **or**
- `recurrence_count >= 3`

Otherwise it is born **`new`**. When a `new` item's recurrence later crosses
×3 (in `bumpRecurrence`), it is auto-promoted `new → open` (only if still `new`;
never resurrects a `dismissed` item).

## Counting changes (the honesty fix)

In `computeDashboardInsights` (server.ts) and `dashboardCounts` (lib/db.ts):

| Metric | Before | After |
|--------|--------|-------|
| Open issues (`openBySeverity`) | `status != 'done'` | `status IN ('open','in_progress')` — accepted bugs only |
| **Needs triage** (new) | — | `status = 'new'` → `insights.needsTriage` |
| Hotspots | `status != 'done'` | `status IN ('open','in_progress')` |
| Recurring | `recurrence_count >= 3` | same, but `status != 'dismissed'` |
| Sentiment | all feedback | all feedback where `status != 'dismissed'` |
| Feedback · 7 days (`volume7d`) | all incoming | unchanged (a "received" signal) |
| Throughput (`opened7d`/`resolved7d`) | as-is | `dismissed` excluded from "opened" |

`dismissed` never contributes to any count.

## API

- **`PATCH /api/feedback/:id`** — extend `VALID_STATUS` to
  `["new","open","in_progress","done","dismissed"]`. Accept = PATCH `status:"open"`;
  Dismiss = PATCH `status:"dismissed"`. Severity edits use the same row (add
  `severity` to the accepted PATCH fields + `updateFeedbackMeta`).
- **`GET /api/projects/:id/triage`** — returns all `status='new'` rows for the
  project (the queue may exceed the 12 recent items the dashboard returns),
  shaped like the dashboard `tickets` entries (observation, quote, severity,
  sentiment, urlPath, screenshotId, suggestedBug, simName, createdAt,
  recurrence).
- **`/api/dashboard`** insights payload gains `needsTriage: number`.

## UI (`prototype/public/dashboard.html`)

- **Sidebar**: new nav item **"Triage"** with a count badge (same pattern as
  Tickets/Team counts), wired to a `data-go="triage"` view.
- **Triage view**: a queue of `new` items. Each row shows the context
  (observation, source quote, screenshot, suggested-bug), a **severity
  selector**, and two actions: **Accept as bug** / **Dismiss**. Accept moves the
  item onto the kanban; dismiss archives it. Empty state: "Nothing to triage —
  you're all caught up."
- **Overview banner**: when `needsTriage > 0`, a prominent strip at the top of
  the Overview — *"N items need triage → Review"* — linking to the Triage view.
  Hidden when zero. This is the core clarity signal.
- **Bug surfaces exclude `new`/`dismissed`**: every place that lists *bugs* —
  the kanban board, "Fix next", and the overview "recent tickets" row — renders
  accepted items only (`status === 'open' || status === 'in_progress'`, plus
  `done` on the kanban's Done column). Fix-next currently filters
  `status !== 'done'`; tighten it. The Triage view is the **only** surface that
  shows `new` items; nothing shows `dismissed`.

## Backfill (one-time, idempotent)

Existing rows are all `status='open'`. Re-run the auto-accept rule retroactively
via a guarded migration step (schema_meta flag `triage_backfill_v1`):

```sql
UPDATE feedback
   SET status = 'new'
 WHERE status = 'open'
   AND COALESCE(severity,'') != 'high'
   AND recurrence_count < 3
```

(`in_progress` / `done` rows are untouched — work already started counts as
accepted.) This populates the triage queue immediately and drops "Open issues"
to the genuinely-accepted set, directly resolving the reported confusion.

## Testing

- **Unit (`bun test`)**: auto-accept rule at insert (high-severity/recurring →
  `open`, else `new`); recurrence-bump promotion `new → open` at ×3 (and that
  it never resurrects `dismissed`); `computeDashboardInsights` counts
  (openBySeverity excludes `new`/`dismissed`/`done`; `needsTriage` = new count;
  sentiment/recurring exclude `dismissed`); PATCH status validation accepts the
  new values and rejects junk; backfill migration is idempotent and leaves
  `in_progress`/`done` untouched.
- **e2e (`journey/`)**: submit feedback → appears in Triage (not Open issues) →
  Accept → leaves Triage, appears on kanban + counts in Open issues; submit
  another → Dismiss → disappears from all counts. Submit a high-severity item →
  skips Triage, lands directly as an open bug.

## Out of scope

- Bulk triage (accept/dismiss many at once) — single-item actions only for v1.
- Undo/restore of dismissed items beyond a manual PATCH back to `new`/`open`.
- Notifications for a growing triage backlog.
