# Klavity Cloud ticket management + copy-to-external connectors — design

**Date:** 2026-06-18
**Status:** Approved (design)
**Scope:** `prototype/` (db, server, dashboard) + new `prototype/lib/connectors/`. No extension changes.

## Problem

Sim-filed reports already persist to Klavity's `feedback` table and show as **read-only**
"Recent tickets" on the dashboard. The only external integration is Plane, auto-mirrored at
file-time via the per-project `integrations` row. We want **Klavity Cloud to be the primary
ticket system** — tickets are *managed* in Klavity (status, owner, notes) — and external
trackers (Jira, Linear, Plane, GitHub Issues, generic webhook) become **opt-in copy targets**
behind one pluggable connector interface.

## Locked decisions (from brainstorming)

1. **Management scope:** ticket detail view with editable **status** (`open` / `in_progress` /
   `done`), **assignee** (free text — email or name), and **notes** (free text). No threaded
   comments / labels / search in this build.
2. **Copy behavior:** **one-time export.** Push once, store the external key + URL on the
   Klavity ticket, show a linked badge. No ongoing sync.
3. **Destinations (all five):** generic **webhook**, **Plane**, **GitHub Issues**, **Jira**,
   **Linear** — one connector interface, one adapter each.
4. **Trigger:** **both** — a manual "Copy to…" action per ticket, and an optional per-project
   **auto-copy** flag per connector (every new ticket auto-copies to that destination).

## Data model

### `feedback` (extend, additive idempotent ALTERs)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `status` | TEXT | `'open'` | `open` \| `in_progress` \| `done` |
| `assignee` | TEXT | NULL | owner (email or name) |
| `notes` | TEXT | NULL | free-form management notes |
| `updated_at` | INTEGER | NULL | last management edit |

Existing rows backfill to `status='open'`. Legacy `plane_issue_key`/`plane_issue_url` columns
stay (read for display) but new exports use `ticket_exports`.

### `connectors` (new) — per-project external destinations

`id` (`conn_`+uuid), `project_id`, `type` (`webhook`|`plane`|`github`|`jira`|`linear`),
`name` (user label), `config` (JSON TEXT; secret fields encrypted via `encryptSecret`),
`auto_copy` (0/1), `enabled` (0/1), `created_at`, `created_by`. Many connectors per project.

### `ticket_exports` (new) — one row per copy

`id` (`exp_`+uuid), `feedback_id`, `project_id`, `connector_id`, `type`, `external_key`,
`external_url`, `status` (`ok`|`failed`), `error` (NULL on success), `created_at`, `created_by`.
A ticket can be exported to several destinations; re-export to the same connector inserts a new
row (history kept), and the UI shows the latest successful one per connector.

### Migration

- Additive `ALTER`s on `feedback`; `CREATE TABLE IF NOT EXISTS` for the two new tables.
- **Plane back-compat:** on boot (guarded by a `schema_meta` flag), migrate each existing
  per-project Plane `integrations` row into a `connectors` row (`type='plane'`, `auto_copy=1`,
  `enabled=1`) so today's auto-mirror behavior is preserved. The legacy file-time Plane push in
  `POST /api/feedback` is **replaced** by the generic auto-copy path (see below) to avoid
  double-filing.

## Connector abstraction — `prototype/lib/connectors/`

A small registry + one adapter per type. Each adapter is independently testable and depends
only on `fetch` + its own config.

```ts
// normalized ticket the adapters receive
type TicketPayload = {
  title: string; body: string; severity: string | null;
  url: string | null; simName: string | null; createdAt: number; klavityUrl: string;
}
type ExportResult = { externalKey: string | null; externalUrl: string | null }

interface Connector {
  type: 'webhook' | 'plane' | 'github' | 'jira' | 'linear'
  label: string
  fields: { key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string }[]
  validate(cfg: Record<string, string>): { ok: boolean; error?: string }
  createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult>
}
```

- `index.ts` — registry `{ [type]: Connector }`, `getConnector(type)`, `listConnectorTypes()`
  (for the UI's "add connector" type picker + dynamic field rendering).
- `webhook.ts` — POST `{ticket}` JSON to `cfg.url`, optional `cfg.secret` as
  `X-Klavity-Signature`/bearer header. `externalUrl=cfg.url`, `externalKey`=response `id` if JSON.
- `plane.ts` — extract the current Plane create-issue logic from `server.ts` into this adapter
  (`cfg`: host, workspace, project_id, token). `externalUrl`/`externalKey` from the created issue.
- `github.ts` — `POST /repos/{owner}/{repo}/issues` with `cfg.token` (PAT). Key=`#<number>`, url=html_url.
- `jira.ts` — `POST {host}/rest/api/3/issue`, basic auth `cfg.email:cfg.token`, project key + issue type. Key=issue key, url=browse link.
- `linear.ts` — GraphQL `issueCreate` with `cfg.api_key`, `cfg.team_id`. Key=identifier, url=issue url.

Secret fields are encrypted at rest with the existing `encryptSecret`/`decryptSecret`; reads
to the client are redacted (`hasToken`-style), never the raw secret.

## Server routes (all project-scoped, admin-gated for writes)

Under the existing `projMatch` block (`/api/projects/:id/...`):
- `GET /api/projects/:id/connectors` → list (redacted configs) + the connector type catalog.
- `POST /api/projects/:id/connectors` → create `{type, name, config, autoCopy}` (validates via adapter).
- `PATCH /api/projects/:id/connectors/:cid` → update name/config/autoCopy/enabled.
- `DELETE /api/projects/:id/connectors/:cid` → remove.

Ticket management (resolve project from the feedback row). Permissions: **any project member**
may edit status/assignee/notes; **admins only** may configure connectors and trigger an export:
- `PATCH /api/feedback/:id` → `{status?, assignee?, notes?}` → updates + `updated_at`.
- `POST /api/feedback/:id/export` → `{connectorId}` → load connector, `createIssue`, insert a
  `ticket_exports` row (ok/failed), return `{externalKey, externalUrl, status, error?}`.

Auto-copy hook: in `POST /api/feedback`, after the feedback row is persisted, fire-and-forget
(never block the response — same pattern as the `recordAiCall` fix) a `createIssue` for each
`enabled && auto_copy` connector of that project, inserting `ticket_exports` rows.

Dashboard payload: `/api/dashboard` `tickets[]` gains `status`, `assignee`, and `exports[]`
(latest ok export per connector: `{type, externalUrl, externalKey}`).

## UI (dashboard.html)

- **Recent tickets** rows become clickable → an inline **detail panel** (expand in place):
  - **Status** segmented control (open / in-progress / done) → `PATCH`.
  - **Assignee** input + **Notes** textarea → save → `PATCH`.
  - **Export badges**: one per successful export, linking the external URL.
  - **"Copy to…"** dropdown listing the project's connectors → `POST .../export`, then show the
    new badge (or an inline error if it failed).
- **Project settings** drawer: the current single Plane form is replaced by a **Connectors**
  manager — **Klavity Cloud** shown as the always-on primary destination (no config), then a
  list of external connectors with add (type picker → dynamic fields from `connector.fields`),
  per-connector **auto-copy** + **enabled** toggles, and delete. Secrets render redacted.

## Error handling

- Adapter `createIssue` failures are caught: the export row is stored `status='failed'` with the
  error; the UI shows an inline "couldn't copy — <reason>" and the Klavity ticket is unaffected.
- Auto-copy failures never affect the file response (fire-and-forget + logged).
- `validate(cfg)` rejects incomplete connector config at create/update time with a field-specific
  message.
- Re-exporting a ticket already exported to a connector is allowed (new row); UI de-dupes display
  to the latest ok row per connector.

## Testing

- **Unit (per adapter, mocked `fetch`):** payload shape, auth header, success key/url extraction,
  non-2xx → thrown/handled error. One file per connector under `packages/core` or a colocated
  `*.test.ts` next to the adapters (match the repo's existing test runner).
- **Registry:** `getConnector` / `validate` for each type (missing required field → error).
- **Server routes:** connector CRUD (admin-gated; non-admin 403), `PATCH /api/feedback/:id`
  scoping (only project members; cross-project 403), `POST .../export` inserts a `ticket_exports`
  row and returns the link, auto-copy hook fires on filing for `auto_copy` connectors (adapters
  mocked).
- **Migration idempotency:** running `initDb` twice is a no-op; the Plane→connector migration runs
  once and preserves the auto-mirror.

## Out of scope (YAGNI)

- Ongoing/bidirectional sync (one-time export only).
- Threaded comments, labels, full-text search, bulk actions on tickets.
- OAuth flows for Jira/Linear/GitHub (PAT / API-key / basic-auth only for this build).
- Field-mapping UI (severity → external priority is a fixed sensible default per adapter).

## Files touched

- `prototype/lib/db.ts` — feedback ALTERs; `connectors` + `ticket_exports` tables; CRUD helpers
  (`listConnectors`, `createConnector`, `updateConnector`, `removeConnector`,
  `listAutoCopyConnectors`), `updateFeedbackMeta`, `addTicketExport`, `listTicketExports`; Plane
  migration; dashboard `tickets` enrichment.
- `prototype/lib/connectors/` — `index.ts` (registry) + `webhook.ts`, `plane.ts`, `github.ts`,
  `jira.ts`, `linear.ts`, plus `*.test.ts`.
- `prototype/server.ts` — connector CRUD routes; `PATCH /api/feedback/:id`; `POST
  /api/feedback/:id/export`; auto-copy hook in `POST /api/feedback`; replace the inline Plane push
  with the connector path; `/api/dashboard` ticket enrichment.
- `prototype/public/dashboard.html` — ticket detail panel; connectors manager in settings.
- `CHANGELOG.md`, `docs/PRD.md`, 5 manifests — SemVer lockstep (minor bump).
