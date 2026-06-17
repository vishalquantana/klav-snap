# Design: AI Credit Logging + `/opsadmin` Super-Admin Dashboard

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan
**Author:** brainstormed with dev2@quantana.com.au

## Problem

We make AI/LLM calls (persona extraction, page reactions, Sim reconciliation,
persona generation) through OpenRouter, which spends real credits. We currently
have **no record** of how much we are spending. `chat()` extracts token usage
from each OpenRouter response but only returns it to the client — nothing is
persisted, so there is no way to answer "how much are we spending on AI, and on
what?".

We want a private super-admin dashboard at `/opsadmin`, visible only to a small
ops allowlist (not to regular project admins or members), that meters AI credit
spend.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Log scope | **AI/LLM calls only** (the things that cost credits) — not all HTTP requests |
| Cost basis | **Real $ from OpenRouter** via `usage: { include: true }` (response carries `cost`) |
| Access control | **Env var allowlist** `OPS_ADMIN_EMAILS` (comma-separated, session email must match) |
| Dashboard views | Totals + 30-day time series, by project/account, by call type & model, recent calls log |
| Alerting | **None** in v1 (YAGNI) — dashboard visibility only |

## Architecture

### 1. Single capture point — `chat()`

Every AI call already funnels through `chat()` in `prototype/server.ts`
(~line 73). This is the only chokepoint, so logging there guarantees no call is
missed.

Changes to `chat()`:
- Add `usage: { include: true }` to the OpenRouter request body. OpenRouter then
  returns a `cost` field (real credit $, ~USD) inside the response `usage` object
  alongside `prompt_tokens` / `completion_tokens`.
- Read `cost` from `data.usage.cost` (nullable — store null if absent).
- Accept an optional `ctx` param: `{ type, email, projectId }`.
- After a successful response, call `recordAiCall(...)`. The insert is
  **best-effort**: wrapped so a logging failure is caught and logged to console
  but never throws into the user request path.

Callers thread `ctx` through (email/projectId are already resolved in each route):
- `extractPersonas(transcript, ctx)` → `type: 'extract'`
- `reactToPage(persona, ..., ctx)` → `type: 'react'`
- `reconcileSim(currentTraits, transcript, ctx)` → `type: 'reconcile'`
- Inline persona-generation `chat(...)` call (~line 1192) → `type: 'persona'`

`type` is the operation label. If a call cannot be attributed to an authed user
or project (e.g. system/unauthenticated), `email`/`projectId` are stored null.

**Successful calls only (v1):** `chat()` throws on a non-OK OpenRouter response
*before* the logging point, and a failed (non-2xx) call does not spend credits.
So v1 only records successful calls and always writes `ok = 1`. The `ok` column
is reserved so failed-call logging can be added later without a migration.

### 2. Schema — new table in `prototype/lib/db.ts`

Added to `applySchema` as `CREATE TABLE IF NOT EXISTS` (matches every other table;
additive and idempotent, safe on the live Turso DB on next boot):

```sql
CREATE TABLE IF NOT EXISTS ai_calls (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  type          TEXT NOT NULL,        -- 'extract' | 'react' | 'reconcile' | 'persona'
  model         TEXT NOT NULL,
  actor_email   TEXT,                 -- nullable
  project_id    TEXT,                 -- nullable
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      REAL,                 -- from OpenRouter usage.cost; null if absent
  ok            INTEGER NOT NULL DEFAULT 1   -- reserved; see note below
);
CREATE INDEX IF NOT EXISTS ai_calls_created_idx ON ai_calls (created_at);
CREATE INDEX IF NOT EXISTS ai_calls_proj_idx    ON ai_calls (project_id, created_at);
CREATE INDEX IF NOT EXISTS ai_calls_type_idx    ON ai_calls (type, created_at);
```

New `db.ts` exports:
- `recordAiCall(row)` — the writer.
- Read aggregates for the dashboard:
  - `opsTotals()` → `{ totalCost, totalInputTokens, totalOutputTokens, callCount }`
  - `opsDaily(days = 30)` → `[{ day, cost, calls }]`
  - `opsByProject()` → `[{ projectId, projectName, cost, calls }]` (join projects for name)
  - `opsByTypeModel()` → `[{ type, model, cost, calls }]`
  - `opsRecentCalls(limit = 50, offset = 0)` → recent raw rows (time, email, project, type, tokens, cost)

### 3. Access control

- New env var `OPS_ADMIN_EMAILS` (comma-separated emails). Default in
  `klav.env.example`: `vishal@quantana.com.au,dev2@quantana.com.au`.
- New env var `OPS_DAILY_CAP_USD` (default `50`) — the daily spend ceiling shown
  for context on the dashboard. The actual hard cap is enforced by OpenRouter on
  the API key; this is display-only.
- Helper `isOpsAdmin(email)`: case-insensitive membership test against the parsed
  list. Empty/unset list → nobody is ops admin.
- `/opsadmin` resolves the session email (cookie session, same as the dashboard).
  Non-ops-admins (including logged-out users and regular project admins) get a
  **404**, not a 403 — the route's existence is not revealed.

### 4. The `/opsadmin` route

Server-rendered HTML page in the existing dashboard style (no client JS chart
library — simple HTML/CSS bars for the time series):
- **Totals** — all-time cost $, input/output tokens, call count.
- **30-day time series** — daily spend as CSS bar chart.
- **By project/account** — table sorted by spend desc.
- **By type & model** — table.
- **Today vs daily cap** — today's spend shown against the configured daily cap
  (`OPS_DAILY_CAP_USD`, default `50`). Purely informational context; the hard cap
  is enforced by OpenRouter on the key itself, not by us. No alerting.
- **Recent calls** — last 50 rows, with a simple `?offset=` pagination link.

### 5. Testing (TDD)

- `lib/db` aggregate tests against an in-memory libsql client (existing test
  pattern, e.g. `budget.test.ts`): insert sample `ai_calls`, assert
  `opsTotals`/`opsDaily`/`opsByProject`/`opsByTypeModel`/`opsRecentCalls` outputs.
- `isOpsAdmin` unit test (allowlist parsing, case-insensitivity, empty list).
- Route-gating: non-ops session → 404; ops session → 200 with expected content.

## Out of scope (v1)

- Spend alerting / thresholds / emails.
- Logging non-AI HTTP requests.
- Per-call request/response payload capture.
- Cost estimation from a local price table (we use OpenRouter's real cost).

## Deployment / housekeeping

- Add `OPS_ADMIN_EMAILS` to `prototype/.env`, `deploy/klav.env.example`, and the
  production env on the Vultr box (66.135.20.62) before/at deploy.
- SemVer lockstep per project rule: bump version in `CHANGELOG.md`, `docs/PRD.md`,
  and all 5 manifests.
- Ship per the deploy memory: commit → push master → ssh pull + restart
  `klav.service`.

## File touch list

- `prototype/server.ts` — `chat()` usage flag + ctx + logging; wrapper ctx
  threading; `isOpsAdmin`; `/opsadmin` route + HTML render.
- `prototype/lib/db.ts` — `ai_calls` table + indexes; `recordAiCall` + aggregates.
- `prototype/lib/db.*test.ts` (new or extended) — aggregate + gating tests.
- `prototype/.env`, `deploy/klav.env.example` — `OPS_ADMIN_EMAILS`.
- `CHANGELOG.md`, `docs/PRD.md`, 5 manifests — version bump.
