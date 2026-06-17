# Klavity Cloud Tickets + Copy-to-External Connectors — Implementation Plan

> **For agentic workers:** This plan is executed via the **Workflow tool** (multi-agent orchestration) per the user's request. Tasks 1 and 2 are independent (parallel stage 1); Task 3 depends on 1+2; Task 4 depends on 3. Each task ends with an independently testable deliverable. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Klavity Cloud the primary ticket system (editable status/assignee/notes) and add a pluggable connector layer that one-time-exports a ticket to webhook / Plane / GitHub / Jira / Linear, both manually per-ticket and via per-project auto-copy.

**Architecture:** A new `prototype/lib/connectors/` registry with one pure adapter per destination (`validate` + `createIssue`). `prototype/lib/db.ts` gains management columns on `feedback`, two new tables (`connectors`, `ticket_exports`), and CRUD helpers. `prototype/server.ts` adds connector CRUD + ticket-management routes + a fire-and-forget auto-copy hook. `prototype/public/dashboard.html` gains a ticket detail panel and a connectors manager.

**Tech Stack:** Bun + TypeScript server (`prototype/server.ts`), Turso/libSQL (`@libsql/client` via `prototype/lib/db.ts`), Bun's built-in test runner (`import { test, expect, mock } from "bun:test"`), static HTML/JS dashboard.

## Global Constraints

- **SemVer lockstep:** every shipped change bumps `docs/PRD.md` + top of `CHANGELOG.md` + all 5 manifests (`/package.json`, `packages/{core,extension,sdk}/package.json`, `packages/extension/manifest.json`) together. This feature is a **minor** bump from the current version (read it from `package.json` at ship time; do NOT hardcode — a parallel session may have advanced it).
- **Secrets:** connector config secret fields are encrypted at rest with the existing `encryptSecret(plain: string): Promise<string>` / `decryptSecret(enc: string): Promise<string>` from `prototype/lib/db.ts`. Never return a raw secret to a client — redact to `""` plus a `has<Field>` boolean.
- **Never block the file response:** the auto-copy hook and any export I/O must be fire-and-forget (`void fn().catch(...)`), exactly like the `recordAiCall` pattern already in `chat()` (`server.ts`).
- **One-time export only** — no polling/sync/webhooks-in.
- **Status enum:** exactly `open` | `in_progress` | `done`. Default `open`.
- **Permissions:** any project member may `PATCH` status/assignee/notes; only project **admins** may create/edit/delete connectors or trigger an export. Project resolution uses the existing `resolveProject` / `projectAccess`.
- **Migrations are additive + idempotent:** new columns via guarded `ALTER`; tables via `CREATE TABLE IF NOT EXISTS`; the Plane→connector backfill runs once, guarded by a `schema_meta` flag.

---

### Task 1: DB layer — schema, CRUD helpers, Plane migration

**Files:**
- Modify: `prototype/lib/db.ts` (add to `initDb`/`applySchema`; add exported helpers near the existing monitored-urls / feedback helpers)
- Test: `prototype/lib/db.connectors.test.ts` (Bun test, fresh in-memory/file DB)

**Interfaces — Produces (exact signatures later tasks rely on):**
```ts
export type ConnectorRow = { id: string; projectId: string; type: ConnectorType; name: string;
  config: Record<string, string>; autoCopy: boolean; enabled: boolean; createdAt: number; createdBy: string | null }
export type ConnectorType = "webhook" | "plane" | "github" | "jira" | "linear"
export type TicketExportRow = { id: string; feedbackId: string; projectId: string; connectorId: string;
  type: string; externalKey: string | null; externalUrl: string | null; status: "ok" | "failed";
  error: string | null; createdAt: number; createdBy: string | null }

export function listConnectors(projectId: string): Promise<ConnectorRow[]>          // config secrets STILL encrypted
export function getConnectorById(projectId: string, id: string): Promise<ConnectorRow | null>
export function createConnector(projectId: string, c: { type: ConnectorType; name: string;
  config: Record<string,string>; autoCopy: boolean; createdBy: string | null }): Promise<string>
export function updateConnector(projectId: string, id: string,
  patch: Partial<{ name: string; config: Record<string,string>; autoCopy: boolean; enabled: boolean }>): Promise<void>
export function removeConnector(projectId: string, id: string): Promise<void>
export function listAutoCopyConnectors(projectId: string): Promise<ConnectorRow[]>   // enabled=1 AND auto_copy=1
export function updateFeedbackMeta(projectId: string, feedbackId: string,
  meta: Partial<{ status: string; assignee: string | null; notes: string | null }>): Promise<boolean>
export function feedbackById(projectId: string, id: string): Promise<any | null>     // null if not in this project
export function addTicketExport(x: Omit<TicketExportRow, "id" | "createdAt">): Promise<string>
export function listTicketExports(feedbackId: string): Promise<TicketExportRow[]>
export function exportsForFeedbackIds(ids: string[]): Promise<Record<string, TicketExportRow[]>>  // batch for dashboard
```
Note: `config` stores secret fields **encrypted** (callers encrypt before `create/update`, decrypt before use). `listConnectors` does NOT decrypt.

- [ ] **Step 1: Write failing tests** in `prototype/lib/db.connectors.test.ts`

```ts
import { test, expect, beforeEach } from "bun:test"
import { initDb, createConnector, listConnectors, getConnectorById, updateConnector,
  removeConnector, listAutoCopyConnectors, updateFeedbackMeta, feedbackById,
  addTicketExport, listTicketExports, exportsForFeedbackIds } from "./db"
// Use a unique file DB per run; see existing provenance tests for the pattern (fresh DB, unique ids).

beforeEach(async () => { /* point env at a fresh temp libsql file, then */ await initDb() })

test("connector CRUD round-trips and scopes by project", async () => {
  const id = await createConnector("proj_A", { type: "webhook", name: "Zap",
    config: { url: "https://x/y", secret: "enc:abc" }, autoCopy: true, createdBy: "a@b.c" })
  const got = await getConnectorById("proj_A", id)
  expect(got?.type).toBe("webhook"); expect(got?.autoCopy).toBe(true)
  expect(got?.config.url).toBe("https://x/y")
  expect(await getConnectorById("proj_B", id)).toBeNull()           // cross-project isolation
  await updateConnector("proj_A", id, { autoCopy: false, enabled: false })
  expect((await getConnectorById("proj_A", id))?.autoCopy).toBe(false)
  expect(await listAutoCopyConnectors("proj_A")).toHaveLength(0)    // disabled → excluded
  await removeConnector("proj_A", id)
  expect(await listConnectors("proj_A")).toHaveLength(0)
})

test("updateFeedbackMeta sets status/assignee/notes + updated_at, project-scoped", async () => {
  // seed a feedback row for proj_A with a known id via the existing feedback-insert helper.
  const fid = await seedFeedback("proj_A")                          // helper in this test file
  expect(await updateFeedbackMeta("proj_B", fid, { status: "done" })).toBe(false)  // wrong project → no-op
  expect(await updateFeedbackMeta("proj_A", fid, { status: "in_progress", assignee: "me@x", notes: "n" })).toBe(true)
  const row = await feedbackById("proj_A", fid)
  expect(row.status).toBe("in_progress"); expect(row.assignee).toBe("me@x"); expect(row.updatedAt).toBeGreaterThan(0)
})

test("ticket exports record + batch fetch", async () => {
  const fid = await seedFeedback("proj_A")
  await addTicketExport({ feedbackId: fid, projectId: "proj_A", connectorId: "conn_1", type: "github",
    externalKey: "#12", externalUrl: "https://gh/issues/12", status: "ok", error: null, createdBy: "a@b.c" })
  expect(await listTicketExports(fid)).toHaveLength(1)
  const batch = await exportsForFeedbackIds([fid])
  expect(batch[fid][0].externalKey).toBe("#12")
})
```

- [ ] **Step 2: Run tests, verify they fail** — `cd prototype && bun test lib/db.connectors.test.ts` → FAIL (helpers not exported).

- [ ] **Step 3: Add schema** to the schema-application path in `db.ts` (where `monitored_urls` / `feedback` are created). Match the existing idempotent `ALTER` style (the file already does guarded `ALTER TABLE ... ADD COLUMN` in try/catch — copy that pattern):

```sql
ALTER TABLE feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'open';   -- guarded (ignore "duplicate column")
ALTER TABLE feedback ADD COLUMN assignee TEXT;                          -- guarded
ALTER TABLE feedback ADD COLUMN notes TEXT;                             -- guarded
ALTER TABLE feedback ADD COLUMN updated_at INTEGER;                     -- guarded

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT );
CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id);

CREATE TABLE IF NOT EXISTS ticket_exports (
  id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL, project_id TEXT NOT NULL, connector_id TEXT NOT NULL,
  type TEXT NOT NULL, external_key TEXT, external_url TEXT, status TEXT NOT NULL,
  error TEXT, created_at INTEGER NOT NULL, created_by TEXT );
CREATE INDEX IF NOT EXISTS idx_texports_feedback ON ticket_exports(feedback_id);
CREATE INDEX IF NOT EXISTS idx_texports_project ON ticket_exports(project_id);
```

- [ ] **Step 4: Implement the helpers** (signatures above). Notes: `rowToConnector` parses `config` JSON and coerces `auto_copy`/`enabled` to booleans; `updateFeedbackMeta` builds a dynamic `SET` from provided keys, always sets `updated_at=Date.now()`, `WHERE project_id=? AND id=?`, returns `rowsAffected>0`; `feedbackById` selects `WHERE project_id=? AND id=?` and maps to camelCase incl. `status`/`assignee`/`notes`/`updatedAt`; `exportsForFeedbackIds` uses a single `WHERE feedback_id IN (...)` and groups newest-first.

- [ ] **Step 5: Implement the Plane→connector migration** — a function run from `initDb` after the tables exist, guarded by a `schema_meta` flag `connectors_plane_migrated` (follow the existing `schema_meta`/`migrated_v2` pattern in this file). For every `integrations` row with `scope='project'` and `integration='plane'`, insert a `connectors` row: `type='plane'`, `name='Plane (migrated)'`, `config` = the stored Plane config (token already encrypted — carry `token_enc` across verbatim under key `token`), `auto_copy=1`, `enabled=1`. Set the flag when done.

- [ ] **Step 6: Run tests, verify pass** — `cd prototype && bun test lib/db.connectors.test.ts` → PASS. Also run the full `bun test` in `prototype/` to confirm no regressions.

- [ ] **Step 7: Commit** — `git add prototype/lib/db.ts prototype/lib/db.connectors.test.ts && git commit -m "feat(db): connectors + ticket_exports tables, ticket-meta helpers, Plane migration"`

---

### Task 2: Connector library — registry + 5 adapters (independent of Task 1)

**Files:**
- Create: `prototype/lib/connectors/index.ts`, `webhook.ts`, `plane.ts`, `github.ts`, `jira.ts`, `linear.ts`
- Test: `prototype/lib/connectors/connectors.test.ts`

**Interfaces — Produces:**
```ts
export type TicketPayload = { title: string; body: string; severity: string | null;
  url: string | null; simName: string | null; createdAt: number; klavityUrl: string }
export type ExportResult = { externalKey: string | null; externalUrl: string | null }
export type ConnectorField = { key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string }
export interface Connector {
  type: "webhook" | "plane" | "github" | "jira" | "linear"
  label: string
  fields: ConnectorField[]
  validate(cfg: Record<string, string>): { ok: boolean; error?: string }
  createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult>
}
export function getConnector(type: string): Connector | null
export function listConnectorTypes(): { type: string; label: string; fields: ConnectorField[] }[]  // for the UI
```
**Consumes:** nothing (pure). Adapters use only global `fetch`. Every `createIssue` wraps network errors and throws `Error` with a short message on non-2xx (server layer catches → records `failed`).

**Per-adapter external contracts (exact):**
- **webhook** — fields: `url` (required), `secret` (optional). `POST cfg.url` with JSON body `{ ticket }` (the full `TicketPayload`); header `X-Klavity-Signature: <secret>` when set. Result: `{ externalUrl: cfg.url, externalKey: (json.id ?? json.key ?? null) }` (best-effort parse; non-JSON response still counts as success on 2xx).
- **plane** — fields: `host` (default `https://api.plane.so`), `workspace` (required), `project_id` (required), `token` (required, secret). `POST {host}/api/v1/workspaces/{workspace}/projects/{project_id}/issues/` with `X-API-Key: token`, body `{ name: title, description_html: body }`. Result key = response `sequence_id`/`id`; url = `{host minus /api}/{workspace}/projects/{project_id}/issues/{id}` (reuse whatever the current `server.ts` Plane push builds — copy its URL/key logic verbatim into this adapter).
- **github** — fields: `owner` (required), `repo` (required), `token` (required, secret). `POST https://api.github.com/repos/{owner}/{repo}/issues` with `Authorization: Bearer token`, `Accept: application/vnd.github+json`, `User-Agent: Klavity`, body `{ title, body }`. Result: key = `#${json.number}`, url = `json.html_url`.
- **jira** — fields: `host` (required), `email` (required), `token` (required, secret), `project_key` (required), `issue_type` (default `Task`). `POST {host}/rest/api/3/issue` with `Authorization: Basic base64(email:token)`, body `{ fields: { project: { key: project_key }, issuetype: { name: issue_type }, summary: title, description: <ADF doc wrapping body> } }`. Result: key = `json.key`, url = `{host}/browse/{json.key}`.
- **linear** — fields: `api_key` (required, secret), `team_id` (required). `POST https://api.linear.app/graphql` with `Authorization: api_key`, body `{ query: "mutation($t:String!,$d:String!,$tm:String!){ issueCreate(input:{title:$t,description:$d,teamId:$tm}){ issue { identifier url } } }", variables: { t: title, d: body, tm: team_id } }`. Result: key = `json.data.issueCreate.issue.identifier`, url = `...issue.url`. Throw if `json.errors`.

- [ ] **Step 1: Write failing tests** — `connectors.test.ts`. For each adapter: a success case (mock `globalThis.fetch` to return a canned 2xx JSON) asserting the request URL/method/headers/body and the extracted `{externalKey, externalUrl}`, and a failure case (mock non-2xx → expect `createIssue` to throw). Plus `validate` rejects missing required fields. Example shape:

```ts
import { test, expect, mock } from "bun:test"
import { getConnector, listConnectorTypes } from "./index"
const TICKET = { title: "Bug", body: "desc", severity: "high", url: "https://app/x",
  simName: "Vamshi", createdAt: 1, klavityUrl: "https://klavity.quantana.top/dashboard" }

test("github createIssue posts to repo and extracts number+url", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => { calls.push([u, o]);
    return new Response(JSON.stringify({ number: 12, html_url: "https://gh/i/12" }), { status: 201 }) }) as any
  const r = await getConnector("github")!.createIssue(TICKET, { owner: "o", repo: "r", token: "t" })
  expect(calls[0][0]).toBe("https://api.github.com/repos/o/r/issues")
  expect(JSON.parse(calls[0][1].body).title).toBe("Bug")
  expect(r).toEqual({ externalKey: "#12", externalUrl: "https://gh/i/12" })
})

test("github validate flags missing repo", () => {
  expect(getConnector("github")!.validate({ owner: "o", token: "t" }).ok).toBe(false)
})

test("linear throws on graphql errors", async () => {
  globalThis.fetch = mock(async () => new Response(JSON.stringify({ errors: [{ message: "bad" }] }), { status: 200 })) as any
  await expect(getConnector("linear")!.createIssue(TICKET, { api_key: "k", team_id: "tm" })).rejects.toThrow()
})

test("registry exposes all five types with fields", () => {
  expect(listConnectorTypes().map(t => t.type).sort()).toEqual(["github","jira","linear","plane","webhook"])
})
```
(Write equivalent success+failure+validate tests for webhook, plane, jira, linear following the contracts above.)

- [ ] **Step 2: Run tests, verify fail** — `cd prototype && bun test lib/connectors/connectors.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement `index.ts`** (registry mapping each type → its adapter; `getConnector`, `listConnectorTypes`).
- [ ] **Step 4: Implement the 5 adapters** per the exact contracts above. Each `validate` checks every `required` field is non-empty. Each `createIssue` does the documented `fetch`, throws `new Error(\`<type> <status>: <body slice>\`)` on non-2xx (and Linear on `errors`), and returns the documented `{externalKey, externalUrl}`.
- [ ] **Step 5: Run tests, verify pass** — `cd prototype && bun test lib/connectors/connectors.test.ts` → PASS.
- [ ] **Step 6: Commit** — `git add prototype/lib/connectors && git commit -m "feat(connectors): pluggable export adapters (webhook/plane/github/jira/linear) + tests"`

---

### Task 3: Server routes + auto-copy hook + dashboard enrichment

**Files:**
- Modify: `prototype/server.ts`
- Test: `prototype/server.connectors.test.ts` (spin the handler with mocked connectors, or hit helpers directly — match how existing server/integration tests in the repo are written; if none, test via `fetch` against an in-process server like the existing route tests)

**Consumes:** all of Task 1's db helpers + Task 2's `getConnector`, `listConnectorTypes`, `TicketPayload`.
**Produces (for Task 4 — exact API):**
- `GET /api/projects/:id/connectors` → `{ connectors: [{id,type,name,autoCopy,enabled,config:<redacted>,createdAt}], types: listConnectorTypes() }` (member-readable; secrets redacted to `""` + `has<Field>:true`).
- `POST /api/projects/:id/connectors` (admin) body `{type,name,config,autoCopy}` → validates via `getConnector(type).validate` (on raw secrets), encrypts secret fields, `createConnector` → `{ ok, connector:<redacted> }`.
- `PATCH /api/projects/:id/connectors/:cid` (admin) body any of `{name,config,autoCopy,enabled}` → re-encrypt changed secrets (blank secret = keep existing) → `{ ok }`.
- `DELETE /api/projects/:id/connectors/:cid` (admin) → `{ ok }`.
- `PATCH /api/feedback/:id` (member of the feedback's project) body `{status?,assignee?,notes?}` → validate status ∈ enum → `updateFeedbackMeta` → `{ ok }` (404 if not in an accessible project).
- `POST /api/feedback/:id/export` (admin) body `{connectorId}` → load feedback + connector, decrypt secret fields, build `TicketPayload` via `feedbackToTicketPayload`, `getConnector(type).createIssue`, `addTicketExport(...)` (ok or failed+error), → `{ ok, export:{type,externalKey,externalUrl,status,error} }`.

**Helper to add:** `feedbackToTicketPayload(fb, project)` → `{ title: fb.observation || "Sim report", body: <observation + sim + url + "Filed by Klavity Sims">, severity: fb.severity ?? null, url: fb.pageUrl ?? fb.urlPath ?? null, simName: <persona name or null>, createdAt: fb.createdAt, klavityUrl: \`${BASE}/dashboard?project=${project.id}\` }`.

- [ ] **Step 1: Write failing tests** covering: connector create requires admin (non-admin → 403); create validates config (missing required → 400); created connector reads back redacted (no raw secret); `PATCH /api/feedback/:id` rejects bad status (400) and cross-project (404); `POST .../export` with a mocked connector inserts a `ticket_exports` row and returns the link; a failing connector yields `status:"failed"` and still 200 with the error. (Mock `getConnector` to a stub adapter in tests.)
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement connector CRUD** in the `projMatch` sub-route block (next to `/monitored-urls`), admin-gated via the existing `access` check. Redaction helper: for each `fields[].secret`, replace value with `""` and add `has<Key>` (e.g. `hasToken`).
- [ ] **Step 4: Implement `PATCH /api/feedback/:id` and `POST /api/feedback/:id/export`** as a new `path.startsWith("/api/feedback/")` block (the existing `/api/feedback` is POST-only — keep it; add the `:id` sub-routes). Resolve the feedback's project via `feedbackById` across the caller's accessible projects (iterate `listProjects` + `projectAccess`, or accept `?project=`).
- [ ] **Step 5: Implement the auto-copy hook** in `POST /api/feedback`: after the feedback row is persisted and its id known, `void (async () => { for (const c of await listAutoCopyConnectors(projectId)) { try { decrypt secrets; const r = await getConnector(c.type).createIssue(payload, cfg); await addTicketExport({...ok}) } catch (e) { await addTicketExport({...failed, error}) } } })().catch(...)`. Must not be awaited (never blocks the response). **Remove the old inline Plane push** — the migrated `plane` connector (auto_copy=1) now covers it. Keep writing legacy `plane_issue_key/url` only if trivial; otherwise rely on `ticket_exports`.
- [ ] **Step 6: Enrich `/api/dashboard`** — change the `tickets` source to recent feedback (all, not just `withTicketOnly`) and add `status`, `assignee`, and `exports` (from `exportsForFeedbackIds`, latest ok per connector) to each ticket object. Keep `counts` as-is.
- [ ] **Step 7: Run tests + full `bun test` + `bun build prototype/server.ts --target=bun --outfile=/dev/null`** → all pass/clean.
- [ ] **Step 8: Commit** — `git commit -m "feat(server): connector CRUD, ticket meta + export routes, auto-copy hook, dashboard enrichment"`

---

### Task 4: Dashboard UI — ticket detail panel + connectors manager + lockstep release

**Files:**
- Modify: `prototype/public/dashboard.html`
- Modify: `CHANGELOG.md`, `docs/PRD.md`, `/package.json`, `packages/{core,extension,sdk}/package.json`, `packages/extension/manifest.json`

**Consumes:** all Task 3 endpoints + the `tickets[].status/assignee/exports` dashboard shape.

- [ ] **Step 1: Ticket detail panel.** In `renderTickets`, make each row expandable (click toggles an inline panel under the row). Panel contains: a **status** segmented control (`open`/`in-progress`/`done`, current highlighted) that `PATCH`es `/api/feedback/:id` and updates `state`; an **assignee** text input + **notes** textarea with a Save button → `PATCH`; **export badges** (one per `t.exports`, each an `<a>` to `externalUrl` showing `type ·  externalKey`); and a **"Copy to…"** `<select>` of the project's connectors + a Copy button → `POST /api/feedback/:id/export {connectorId}` then append the returned badge (or show an inline error on `status:"failed"`). Reuse existing `.row-act`, add minimal panel CSS. Project param: these calls go through `projPath()`-style scoping or include the ticket's project; use the active project's connectors fetched once.
- [ ] **Step 2: Connectors manager** in the Project settings drawer. Replace the single Plane `<form>` with: **Klavity Cloud** shown as an always-on primary card (no config, "Default — all reports are tracked here"), then a **list of connectors** from `GET /api/projects/:id/connectors` (name, type, auto-copy + enabled toggles → `PATCH`, delete → `DELETE`), and an **"Add destination"** affordance: a `<select>` of `types` → render that type's `fields` dynamically (secret fields as `type=password`, showing `has<Field>` "saved — leave blank to keep") → Save → `POST`. Redacted secrets only.
- [ ] **Step 3: Manual verification checklist** (record results): create a webhook connector (use https://webhook.site as the URL), file/seed a ticket, Copy-to webhook → badge appears + webhook.site shows the payload; toggle auto-copy on, file another ticket → it auto-exports; edit a ticket's status/assignee/notes → persists across reload; non-admin sees read-only (no connector config, no Copy button).
- [ ] **Step 4: SemVer lockstep + CHANGELOG.** Read current version from `package.json`, bump **minor** across all 5 manifests + `docs/PRD.md`; add a `CHANGELOG.md` entry under a new top heading describing: Klavity Cloud ticket management (status/assignee/notes), pluggable connectors (webhook/Plane/GitHub/Jira/Linear), manual + auto-copy export, Plane auto-migrated to a connector.
- [ ] **Step 5: Syntax-check** the dashboard inline script (`node --check` on the extracted largest `<script>`), validate the 5 manifests are valid JSON.
- [ ] **Step 6: Commit** — `git commit -m "feat(dashboard): ticket detail (status/assignee/notes) + connectors manager + copy-to-external (minor bump)"`

---

## Self-Review

**Spec coverage:** data model (feedback cols + connectors + ticket_exports) → Task 1; Plane migration → Task 1 Step 5; connector abstraction + 5 adapters → Task 2; CRUD routes, `PATCH` meta, export endpoint, auto-copy hook, dashboard enrichment → Task 3; ticket detail UI + connectors manager + Klavity-primary framing → Task 4; one-time-export, status enum, permissions, fire-and-forget, secret redaction, lockstep → Global Constraints (bind every task). All spec sections map to a task. ✓

**Placeholder scan:** external API contracts, DDL, and signatures are concrete; no "add error handling"-style hand-waves (error behavior is specified per adapter and per route). ✓

**Type consistency:** `ConnectorType`/`ConnectorRow`/`TicketExportRow` (Task 1) and `TicketPayload`/`ExportResult`/`Connector` (Task 2) are used verbatim in Task 3; the dashboard consumes the exact endpoint shapes Task 3 produces. ✓
