# Klavity Sims — Dashboard + Multi-Project Evolution Spec

**Date:** 2026-06-17
**Status:** Decisions LOCKED 2026-06-17 — building full **P0→P3** (founder approved), phase-by-phase with review+deploy between phases. See §6.
**Stack:** Bun (single-file routes, `prototype/server.ts`) · static HTML (`prototype/public/*`, `site/*`) · Turso/libSQL (`prototype/lib/db.ts`) · MV3 extension (`packages/extension/*`) · S3 (`prototype/lib/s3.ts`)

---

## 1. Vision & Principles

Klavity turns recorded customer voices into living **Sims** — AI personas that, grounded in real transcript quotes, walk a team's real product and react in-character, filing traceable bug/feedback tickets. The founder's intent: evolve from a single flat "Sims Studio" into a **company → projects → Sims** product where, the moment a logged-in teammate (with the extension installed) opens a monitored URL, the project's Sims become *live* on the real product — popping up and commenting in-character; the dashboard that greets you on login is not a CTA but a real overview of **what your Sims are saying, what they've filed, and who's been reviewing what** — every insight traceable to the exact quote, transcript, and date that produced it.

**Principles:** (1) **Smallest valuable slice first** — ship the R9 bug-fix + feedback persistence before any AI cost surface. (2) **One canonical schema** — `activity_events` + `feedback` + `screenshots` + provenance tables; no competing names. (3) **Auto-comment is the experience; engineering bounds runaway** — Sims comment on visit by default (founder vision); debounce + `(sim,url,dom)` dedupe + per-project budget cap + user/admin pause keep it controllable, and pricing is settled separately (measure real cost, then price). (4) **Privacy by structure, not policy** — allowlist-only capture, consent rows, private screenshots; observability is named by default (founder choice). (5) **UI project-shaped before schema** — the dashboard abstracts "active project" from day one so migration swaps a data source, not a UI.

---

## 2. Target Data Model

### 2.1 Final entity hierarchy

```
accounts (company)                         ← repurposed from today's `workspaces`
 ├─ account_members (email, account_role)  owner | admin | member
 └─ projects (account_id)                   ← NEW mid-layer
     ├─ project_members (email, project_role)        admin | member   (R4)
     ├─ monitored_urls (url_pattern, enabled)        (R5)
     ├─ monitoring_consent (email, status)           (privacy)
     ├─ transcripts (raw_text, source_date, speakers) (R8)
     ├─ personas / Sims (project_id, source_transcript_id)
     │    └─ sim_traits (provenance per insight)      (R8)
     │         └─ trait_events (append-only audit)    (R8)
     ├─ feedback (sim_id, screenshot_id, cited_trait_ids, plane_issue) (R7,R8)
     ├─ activity_events (actor, sim, url_path, type)  (R6 — the feed spine)
     ├─ screenshots (s3_key, acl, expires_at)         (R7 — durable ledger)
     └─ integrations (scope='project', owner_id=project_id)
```

### 2.2 Canonical schemas (the critique's Decision 3 — kill `sim_events`/`reviews`/`review_reactions`/`sim_feedback`)

All `CREATE TABLE IF NOT EXISTS`, additive, added to the `initDb()` stmts array (`db.ts:10`). FKs unenforced (house style).

```sql
-- COMPANY (was workspaces; accounts.id REUSES old workspace id — no re-login, no integrations rewrite)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS account_members (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL,
  account_role TEXT NOT NULL,           -- 'owner' | 'admin' | 'member'
  created_at INTEGER NOT NULL, UNIQUE(account_id, email));
CREATE INDEX IF NOT EXISTS acct_mem_email_idx ON account_members(email);

-- PROJECTS — first project id is DETERMINISTIC: 'proj_'||account_id (critique Decision 4: no event backfill)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  url_patterns_json TEXT,                -- R5 monitored patterns (prefix/glob only, no regex)
  review_mode TEXT NOT NULL DEFAULT 'auto',  -- 'auto' (Sims comment on visit — founder default) | 'ready' (one-click) | 'paused' (admin pause)
  review_budget_daily INTEGER DEFAULT 200,
  observability_mode TEXT NOT NULL DEFAULT 'named', -- 'named' (founder default) | 'aggregate' (future sellability toggle)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS project_acct_idx ON projects(account_id, created_at);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL,
  project_role TEXT NOT NULL,            -- 'admin' | 'member'
  invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email));
CREATE INDEX IF NOT EXISTS proj_mem_email_idx ON project_members(email);

CREATE TABLE IF NOT EXISTS monitored_urls (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
  UNIQUE(project_id, url_pattern));

CREATE TABLE IF NOT EXISTS monitoring_consent (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL,
  status TEXT NOT NULL,                  -- 'granted' | 'paused' | 'revoked'
  granted_at INTEGER, updated_at INTEGER NOT NULL, UNIQUE(project_id, email));

-- TRANSCRIPTS — now persisted; source_date drives "(Sarah, 2026-06-12)" citations
CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, raw_text TEXT NOT NULL,
  source_date INTEGER NOT NULL, speakers_json TEXT, added_by TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS transcript_proj_idx ON transcripts(project_id, source_date);

-- PERSONAS — re-scoped project_id (was workspace_id); insights_json kept as denormalized read cache
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_transcript_id TEXT,
  name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client',
  initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS persona_proj_idx ON personas(project_id, created_at);

-- SIM TRAITS — normalized insight w/ provenance (trait_id is the STABLE citation key)
CREATE TABLE IF NOT EXISTS sim_traits (
  id TEXT PRIMARY KEY, sim_id TEXT NOT NULL, project_id TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- 'pain'|'want'|'love'
  text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', -- active|superseded|contradicted
  strength INTEGER NOT NULL DEFAULT 1,
  src_transcript_id TEXT NOT NULL, src_quote TEXT NOT NULL, src_quote_offset INTEGER,
  src_speaker TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS trait_sim_idx ON sim_traits(sim_id, status);

CREATE TABLE IF NOT EXISTS trait_events (    -- append-only audit: which transcript changed which trait
  id TEXT PRIMARY KEY, trait_id TEXT NOT NULL, sim_id TEXT NOT NULL, transcript_id TEXT NOT NULL,
  op TEXT NOT NULL,                      -- create|reinforce|refine|contradict|supersede
  before_text TEXT, after_text TEXT, quote TEXT NOT NULL, quote_offset INTEGER,
  speaker TEXT, source_date INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS trait_evt_idx ON trait_events(trait_id, created_at);

-- SCREENSHOTS — durable ledger (the link s3.ts never recorded). Private ACL for Sim flows.
CREATE TABLE IF NOT EXISTS screenshots (
  id TEXT PRIMARY KEY, project_id TEXT, s3_key TEXT NOT NULL, bucket TEXT NOT NULL,
  content_type TEXT NOT NULL, acl TEXT NOT NULL DEFAULT 'private', bytes INTEGER,
  owner_email TEXT, expires_at INTEGER, created_at INTEGER NOT NULL);

-- FEEDBACK — rich payload (R7 screenshot + R8 provenance + Plane linkage)
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT,
  url_host TEXT, url_path TEXT,          -- query/fragment stripped
  observation TEXT, sentiment TEXT, severity TEXT,
  screenshot_id TEXT, suggested_bug_json TEXT,
  cited_trait_ids_json TEXT,            -- R8 attribution link → sim_traits
  source_quote TEXT, source_transcript_id TEXT, source_date INTEGER,
  plane_issue_key TEXT, plane_issue_url TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS fb_proj_idx ON feedback(project_id, created_at);
CREATE INDEX IF NOT EXISTS fb_sim_idx ON feedback(sim_id, created_at);

-- ACTIVITY EVENTS — the universal observability/dashboard feed spine (R6)
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
  -- 'sim_activated'|'review_run'|'feedback_filed'|'transcript_added'|'sim_evolved'|'sim_added'
  actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT,
  feedback_id TEXT, screenshot_id TEXT, meta_json TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS evt_proj_idx ON activity_events(project_id, created_at);
CREATE INDEX IF NOT EXISTS evt_actor_idx ON activity_events(project_id, actor_email, created_at);
```

`integrations`: keep PK `(scope, owner_id)`; extend scope domain to `{'account','project','user'}`. Because `accounts.id == old workspace id`, re-scope `'workspace'→'account'` rows without rewriting `owner_id`.

### 2.3 Role model (two-tier)

`effective = max(account_role, project_role)`. Account `owner`/`admin` get implicit project-admin everywhere. A plain account `member` sees only projects with an explicit `project_members` row. One `owner` per account (enforce via partial unique index; define transfer path before a 2nd human exists). Single shared helper:

```ts
async function projectAccess(email, projectId): 'admin' | 'member' | null
```
used by every project route; invite requires `'admin'` or account `owner`.

### 2.4 Migration (single-workspace → accounts/projects)

Run once in `initDb()` guarded by a `schema_meta('migrated_v2')` flag. **Additive copy, never drop in same release.**

1. Rename old `personas` → `personas_v1`; create all new tables.
2. Each `workspaces` w → `accounts(id=w.id, name=w.name, owner_email=<first admin>)` + `projects(id='proj_'||w.id, account_id=w.id, name='Default Project')`.
3. Each `memberships` m → `account_members` (first admin→`owner`, other admins→`admin`, `user`→`member`) + `project_members(project_id='proj_'||wid, role admin|member)`.
4. Each `personas_v1` p → `personas(project_id='proj_'||wid, source_transcript_id=NULL, …)`. Backfill `sim_traits` from `insights_json` with a synthetic "legacy import" `src_transcript_id` (`source_date = persona.created_at`) so citations render "(legacy import)".
5. `UPDATE integrations SET scope='project', owner_id='proj_'||owner_id WHERE scope='workspace'`.
6. `feedback`/`activity_events`/`monitored_urls`/`transcripts` start empty (these were stateless).

**Back-compat:** `membershipsFor(email)` becomes a shim over `account_members JOIN projects`; `/api/team/invite` aliased to project-scoped invite; existing sessions/Bearer tokens stay valid (id reuse). No re-login.

---

## 3. Phased Roadmap

Sequenced per the critique: each slice ships independently; riskiest (cost/legal/MV3) last.

### P0 — Bug fix + persistence (1–2 days, zero new surface, no AI cost)
**Goal:** Close R9; give the dashboard real data to read.
- **R9 routing fix (three parts, all cheap):**
  1. `/onboarding` (`server.ts:295`) gains a membership guard → redirect `/dashboard` if `membershipsFor(me).length>0`. (Note: the dashboard design's `klav_onboarding_step`-localStorage root cause is **mis-cited** — that key is not in `site/onboarding.html`; the real leak is the unguarded route + dashboard link.)
  2. `dashboard.html:112` "Add a transcript" link `/onboarding` → `/app#add-transcript`.
  3. `/login` (`server.ts:127`) gains a logged-in→`/dashboard` redirect.
- **Persist feedback:** in existing `/api/feedback` (`server.ts:174`, currently writes nothing) after Plane success, insert `screenshots` + `feedback` + `activity_events(type='feedback_filed')`. Highest value-per-line change.
- **Wire studio drafts:** `saveDrafts()` (`index.html`, currently mock `KS-NNN`) actually `POST /api/feedback`.
- **Files:** `server.ts` (127, 174–231, 295), `db.ts` (schema: `feedback`,`screenshots`,`activity_events`), `dashboard.html:112`, `index.html` (saveDrafts).
- **Schema:** `feedback`, `screenshots`, `activity_events` only (scoped to `workspace_id` until P2; see project-id note below). **API:** none new. **Risks:** screenshot ACL choice (keep public-read this slice; flip to private in P3).

### P1 — Dashboard-on-login (R1, R2; reads only, no AI, no privacy surface)
**Goal:** Replace "Welcome back" with a real overview.
- New `GET /api/dashboard?project=:id` returning `{email, projects[], active, members, sims[], saying[], tickets[], activity[]}` in one round-trip (critique: single aggregate, not 5 fetches).
- **Project switcher rendered now**, backed by a **derived single project** (= current account's first project; `projects:[{id:'proj_'||wid, name}]`). UI is project-shaped before schema lands.
- "What your Sims are saying" = `activity_events`/`feedback` reactions, with `insights_json` fallback so it's never blank.
- "Recent tickets" = `feedback` rows with `plane_issue_key`. "Live activity" = recent `activity_events` (own-rows-only for non-admins).
- **R2:** People & Teams panel → "Invite your team to this project" CTA (email input + `POST .../invite`, roster below, hidden for non-admins). Plane config demoted to a `<details>` settings drawer.
- **Files:** `server.ts` (new `/api/dashboard`), `db.ts` (`listActivity`, `dashboardCounts`), `dashboard.html` (layout rewrite 81–137, `load/render` 150–178).
- **Risks:** thin feed until events accumulate (mitigate: empty states + insights fallback). 5 indexed queries per load — fine at scale.

### P2 — Multi-project model + migration (R3, R4)
**Goal:** The company → projects → Sims cutover.
- Run §2.4 migration. Move every `membershipsFor(email)[0]` callsite (`server.ts:238,303,316,357`) to explicit project resolution behind `projectAccess()`.
- New routes: `GET/POST /api/projects`, `GET /api/projects/:id`, `POST /api/projects/:id/invite` (R4), `.../members`, `.../monitored-urls`. Re-scope `/api/personas`, `/api/integration` to `project_id`. `/api/auth/verify`: `ensureWorkspace`→`ensureAccount` (account + owner + default project + project-admin).
- Switcher becomes real (multiple projects). OTP allowlist bypass: "has any `project_members`/`account_members` row."
- **Files:** `db.ts` (`ensureAccount`,`accountFor`,`projectAccess`,`listProjects`, project CRUD), `server.ts` (route re-scoping), `dashboard.html` (switcher).
- **Risks (footguns):** project-id scheme must be locked P0 (`'proj_'+wid`) so P0/P1 event rows need no backfill; owner-uniqueness via partial index.

### P3 — Provenance + Sim evolution, then Live activation (R8, then R5/R6/R7)
**Goal:** Traceable insights, then live Sims (auto-comment on visit, guard-railed + pausable).
- **R8 first (no cost/legal surface):** `POST /api/transcripts` persists transcript → `extractPersonas` → conservative name/role match (admin-confirm on fuzzy) → **one `reconcileSim()` call per *named* Sim** returning structured ops (add/reinforce/refine/contradict) each carrying quote+offset → apply to `sim_traits` + append `trait_events` → rebuild `insights_json`. Extend `REACT_SYS` to return `citedTraitIds`; `/api/react` persists `feedback` with resolved citations + screenshot. Studio gets citation chips + an "Evolution" timeline.
- **R5/R6/R7 last (cost + legal + MV3 risk):** Extension config sync (`GET /api/extension/config` on `onInstalled`/`onStartup`/post-CONNECT, NOT popup-open) → static `<all_urls>` content script gates on cached `klavMonitored` + `klavToken` → **auto-comments on visit** (founder vision: Sims "jump out and comment") → on a monitored URL it `captureVisibleTab` + `POST /api/sim/review` (consent + allowlist + budget + dedupe + not-paused checks) → private screenshot + `feedback` + `activity_events(review_run)`. **Controls:** per-teammate **pause** (instant) + admin **pause** (`review_mode='paused'`); persistent "Sims reviewing · pause" indicator. **Guardrails:** debounce one-review-per-route, `(sim,url,dom)` dedupe, per-project daily budget cap (auto-pause + notify admin on hit). One-click is the manual fallback when paused/over-budget. Pricing settled separately (measure, then price).
- **Files:** `db.ts` (traits/transcripts CRUD), `server.ts` (`EXTRACT_SYS`/`REACT_SYS` 24–43, `/api/transcripts`, `/api/sim/review`, `/api/extension/config`, `/api/screenshots/:id`, `/api/consent`), `s3.ts` (`acl` param + `presignGet`), `index.html` (citation/evolution UI), extension `background.ts`/`content.ts`/`core/types.ts`.
- **Risks:** Sim-matching corrupting provenance (conservative match); vision cost (math: 50 pv × 5 Sims × 6K = ~1.5M tok/user/day → Option A rejected); MV3 SW lifecycle (string-match handlers finish in ms, safe); `klavToken`=raw session id (issue dedicated extension token as R5 pre-req).

---

## 4. Subsystem Designs (distilled)

- **Dashboard-on-login (R1/R2):** one `GET /api/dashboard` aggregate; switcher + `?project=` param from day one against a derived project; three feeds (`saying`/`tickets`/`activity`) all read from `activity_events`+`feedback`; skeletons + empty states; team block is an invite CTA; Plane config demoted.
- **Multi-project + project-scoped invites (R3/R4):** account→projects→Sims; two-tier roles via `projectAccess()`; invite creates `users`+`account_members(member)`+`project_members` rows; external invitees log in but see only their projects, never the account dashboard.
- **Live URL activation (R5):** **"active" = auto-comment on visit** — on a monitored URL the project's Sims pop up (shadow-DOM host) and review automatically (founder vision). Static `<all_urls>` injection + `tabs.onUpdated` SPA backstop; `captureVisibleTab` (viewport-only, foreground-only). **Controls:** per-teammate **pause** (instant, client-side mirrored server-side) + admin **pause** (`review_mode='paused'`, project-wide); persistent in-page "Sims reviewing · pause" indicator. **Cost guardrails (load-bearing now that auto is on):** debounce one-review-per-route, atomic per-project daily budget (`UPDATE … WHERE count<budget`; auto-pause + notify admin when hit), `(sim,url,dom)` dedupe so Sims don't repeat, optional sampling; mandatory consent before first capture. Pricing is a separate workstream (measure, then price).
- **Sim provenance/attribution (R8):** insights normalized to `sim_traits` (JSON kept as cache); evolution = 1 extract + 1 reconcile per named Sim emitting ops with quote+offset; `trait_events` append-only audit; feedback returns `citedTraitIds` → resolved to `{quote, speaker, sourceDate, transcriptId}`; Plane issue body carries the citation line.
- **Admin observability + screenshots (R6/R7):** `activity_events` spine; admin Activity card **named by default** (founder decision 2026-06-17 — admin sees which teammate ran which Sim on which path); an aggregate-only mode stays available as a per-project toggle for future multi-tenant/sellability. The other privacy guardrails are **unchanged and still binding**: capture only on allowlist URLs, per-member consent before first capture, path-only URLs, private screenshots. `screenshots` ledger with `acl` + `expires_at` (Sim screenshots private 30-day, Snap public indefinite); `GET /api/screenshots/:id` returns membership-checked signed URL.

---

## 5. Cross-Cutting Concerns

- **Cost model (vision budgeting):** **review** is the vision call (~5–6K tok/Sim). Founder chose **auto-comment on visit** as the default experience and treats cost as a *pricing* question to settle later (measure real usage, then price per review/seat). Engineering still bounds runaway so the ~1.5M tok/user/day naive worst case never happens: **debounce** one review per route (not per scroll/SPA tick); server-side **dedupe** cache keyed `(sim_id, url_norm, dom_sig)` (promote the existing `klav_dev_react_*` hash) so a page isn't re-reviewed; per-project `review_budget_daily` **atomic cap** that auto-pauses + notifies the admin when hit; **user/admin pause**; reconcile capped to named Sims + `(sim_id, transcript_id)` cache; never re-run the full library.
- **Privacy/consent (binding on ALL subsystems — critique non-negotiables):** (a) capture/log ONLY on allowlist-matching URLs — no code path records off-allowlist navigation; (b) per-member-per-project consent row before first capture; (c) path-only URLs (`url_host`+`url_path`), query/fragment stripped; (d) private-ACL screenshots + signed URLs for Sim flows; (e) persistent in-page "Sims reviewing — pause" indicator; (f) anonymized-aggregate observability default.
- **Security:** Replace `klavToken` (raw 7-day session id reused as Bearer) with a dedicated narrow-scope extension token before R5. Consent source-of-truth server-side, mirrored to `chrome.storage.local`, resynced on `tabs.onUpdated` + CONNECT. No new extension permissions required.

---

## 6. Founder Decision Points — LOCKED 2026-06-17

- **Live activation** → **Auto-comment on visit** (founder vision: on a monitored URL — e.g. admin connects `quantana.com.au` — the project's Sims jump out and comment automatically). **user-pause + admin-pause** controls; cost guardrails (debounce, `(sim,url,dom)` dedupe, per-project daily budget cap that auto-pauses + notifies). **Pricing deferred** — measure real cost, then price per review/seat.
- **Observability** → **Named by default** (admin sees who ran which Sim on which path). Capture guardrails unchanged: consent-before-first-capture, allowlist-only, path-only URLs, private screenshots. Aggregate-only mode deferred as a future sellability toggle.
- **Build scope** → **Full P0→P3**, executed phase-by-phase with review + deploy between phases.
- **Canonical schema** → **`activity_events` + `feedback` + `screenshots`** (private ledger); kill `sim_events`/`reviews`/`sim_feedback`.
- **Project-id scheme** → **`'proj_'+accountId`** for first project, `accounts.id = old workspace id` — no re-login, no event backfill. Locked before P0 writes any project-scoped row.
- **Sim screenshot ACL** → **Private + signed "View in Klavity" link** for Sim/live flows; public-read kept only for user-initiated Snap reports.
- **Ship dashboard before write-points?** → **Yes** (P0 persistence lands first, so the dashboard reads real `feedback` rows plus an `insights_json` fallback).

---

## 7. Open Questions

1. Anonymized-aggregate vs named — confirm aggregate is acceptable as the *only* default (no named even for the owner)?
2. No-capture sub-paths: do projects need a per-path "exclude from capture" rule beyond the allowlist?
3. Plane resolution order `user→project→account` — should a project connection override a member's personal token in project context?
4. Contradiction handling — keep both traits (`contradicted`+`active`) as a "changed her mind" feature, or supersede?
5. Per-Sim URL targeting (FinanceBot only on `/billing`) — defer past P3? (recommend project-level for v1.)
6. Batch multiple transcripts uploaded together into one reconcile pass per Sim?
7. Budget-cap UX when reached: queue, reject, or notify admin?
8. Ownership-transfer flow timing (needed once any account has a 2nd human).
9. **Pricing (separate workstream):** instrument real per-review / per-project token cost during P3, then choose a model (per-review credits, per-seat, per-active-project). Not a blocker for building; the `review_budget_daily` cap + `activity_events` give us the metering hooks to price from.

---

**Spec file:** `/Users/vishalkumar/Downloads/qbug/klav-snap/docs/superpowers/specs/2026-06-17-sims-dashboard-evolution.md`
