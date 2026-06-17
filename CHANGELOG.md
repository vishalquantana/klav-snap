# Changelog

All notable changes to **Klavity Snap** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning is anchored in [`docs/PRD.md`](docs/PRD.md). The version there, the
top entry here, and every `package.json` (`/`, `core`, `extension`, `sdk`) plus
the extension `manifest.json` always move together. See the PRD's _Versioning_
section for the bump rules.

## [Unreleased]

## [0.7.1] - 2026-06-17

### Fixed
- **Extension manifest:** `externally_connectable` used the invalid match
  pattern `http://localhost:*` (no path / port wildcard), which made Chrome
  refuse to load the unpacked extension ("Invalid match pattern … Empty
  path."). Changed to `http://localhost/*` (valid; match patterns ignore the
  port, so it still covers any localhost dev port). Latent since v0.3.0; only
  surfaced on the first real unpacked load. (`packages/extension/manifest.json`)

## [0.7.0] - 2026-06-17

### Added
- **Live Sim activation — auto-comment on visit (Sims P3b, R5):** when a signed-in
  teammate with the Snap extension opens a project's **monitored URL**, that
  project's Sims now auto-comment in-character on the page. The extension caches
  the allowlist + a **dedicated narrow-scope extension token** from
  `GET /api/extension/config` (synced on install/startup/CONNECT, not popup-open),
  gates a static `<all_urls>` content script on the cached allowlist + token, and
  on a match `captureVisibleTab` → `POST /api/sim/review`. A persistent in-page
  "Sims reviewing · pause" indicator is always visible while active.
  (`packages/extension/*`, `prototype/server.ts`)
- **Guardrailed review pipeline:** `POST /api/sim/review` runs binding gates **in
  order** — auth + project access, allowlist match, per-member consent, `(sim,
  url, dom)` dedupe, and a final **atomic per-project daily budget** consume — so
  nothing is captured off-allowlist and a blocked request never burns budget or
  vision cost. On budget exhaustion the project auto-pauses and the admin is
  notified. Screenshots are stored **private** (30-day) with a durable
  `screenshots` ledger row. (`prototype/server.ts`, `prototype/lib/s3.ts`)
- **Privacy by structure:** new `monitored_urls` (allowlist; path-only patterns,
  query/fragment rejected), `monitoring_consent` (per-member-per-project
  `granted|paused|revoked`), and `projects.review_mode` / `review_budget_daily` /
  `observability_mode`. `POST /api/consent` records consent and **user-pause**
  (instant, reversible); `GET /api/screenshots/:id` returns a membership-checked,
  short-lived **signed URL** for private Sim captures (public direct URL for Snap
  reports). (`prototype/lib/db.ts`, `prototype/server.ts`)
- **Admin monitored-URLs config (web):** an admin-only "Live Sims" drawer in the
  dashboard adds/removes/enables monitored URL patterns (wired to
  `/api/projects/:id/monitored-urls`), with an explainer that Sims auto-comment
  there and capture is allowlist-only. (`prototype/public/dashboard.html`)
- **Admin pause toggle (web):** a project-level **Pause / Resume Sims** control
  (wired to `POST /api/projects/:id/pause`) reflecting `review_mode`; admin-pause
  is project-wide, complementary to per-teammate user-pause via consent.
  (`prototype/public/dashboard.html`)
- **Named observability (R6):** an admin-only Activity view showing **who ran
  which Sim on which path** from `activity_events` `review_run` rows (named per
  the locked founder decision), each with a **View screenshot** action that opens
  the private capture via the signed `GET /api/screenshots/:id`. Backed by a new
  admin-gated `GET /api/projects/:id/activity` (defaults to `review_run`;
  `observability_mode='aggregate'` strips identities server-side for the future
  sellability toggle). The capture guardrails — consent-first, allowlist-only,
  path-only URLs, private screenshots — are surfaced in the UI and remain binding.
  (`prototype/lib/db.ts`, `prototype/server.ts`, `prototype/public/dashboard.html`)

### Notes
- Auto-comment is the default experience; engineering bounds runaway (debounce,
  dedupe, daily budget cap, user/admin pause). Pricing is a separate workstream
  (measure real per-review cost, then price). Additive; existing flows + tests
  (`pnpm -r test`, `bun test prototype/lib/`) stay green.

## [0.6.0] - 2026-06-17

### Added
- **Sim provenance + evolution (Sims P3a):** insights are now normalized to a
  durable, provenance-tracked model so every reaction is traceable to the exact
  quote, speaker, transcript, and date that produced it. Three additive tables —
  `transcripts` (persisted; `source_date` drives "(Sarah, 2026-06-12)" citations),
  `sim_traits` (normalized pain/want/love with a **stable `trait_id` citation
  key**; `insights_json` kept as a read cache), and `trait_events` (append-only
  audit of what changed) — plus a `reconcile_runs` cost-guard cache.
  (`prototype/lib/db.ts`, `prototype/lib/provenance.ts`)
- **Transcript → reconcile pipeline:** `POST /api/transcripts` (project-scoped,
  cookie or Bearer) persists the transcript, extracts personas, conservatively
  matches them to existing Sims (confident auto-apply; fuzzy/ambiguous →
  `needsConfirm`), then runs **one `reconcileSim()` LLM call per matched Sim**
  (gated by `reconcile_runs` so a `(sim, transcript)` pair is never re-run, and
  never the whole library) emitting structured ops (add/reinforce/refine/
  contradict/supersede) each anchored to a verbatim quote → applied to
  `sim_traits` + appended to `trait_events` → `insights_json` rebuilt.
  (`prototype/server.ts`)
- **Feedback citations (R8):** `REACT_SYS` now returns `citedTraitIds`;
  `/api/react` resolves them to `{quote, speaker, sourceDate, transcriptId}`,
  `/api/feedback` persists the resolved citation on the feedback row and appends
  a citation line to the Plane issue body. Graceful empty citation when no
  documented trait drove the reaction. (`prototype/server.ts`)
- **Studio citation chips:** a Sim's reaction (in the live bubble and the draft
  queue) renders a provenance chip — `from: "<quote>" — <speaker>, <date>` —
  from the resolved citation; absent gracefully when there is none. Saved drafts
  forward `cited_trait_ids` so persisted feedback keeps its provenance.
  (`prototype/public/index.html`)
- **Per-Sim "Evolution" timeline:** each saved Sim card gains an expandable
  Evolution view listing that Sim's `trait_events` **newest-first** — the op,
  the new trait text, and the driving quote/transcript/date — backed by a new
  `GET /api/sims/:id/evolution` (project-scoped, authorizes Sim↔project).
  Reuses the studio's existing design system. (`prototype/server.ts`,
  `prototype/public/index.html`)

### Notes
- P3a is **provenance + studio UI only** — no live activation, monitored URLs,
  consent, screenshots, or extension changes (those land in P3b). Additive;
  existing flows unchanged.

## [0.5.0] - 2026-06-17

### Added
- **Multi-project model + migration (Sims P2):** the data model evolves from a
  single flat workspace into **company → projects → Sims**. Four new tables —
  `accounts` (repurposed from `workspaces`, **id reused** so sessions/tokens stay
  valid), `account_members` (`owner`|`admin`|`member`), `projects` (with §2.2
  defaults: `review_mode='auto'`, `observability_mode='named'`,
  `review_budget_daily=200`, `url_patterns_json`), and `project_members`
  (`admin`|`member`). `personas` are re-scoped from `workspace_id` to
  `project_id` (old rows preserved in `personas_v1`; `insights_json` kept as-is).
  (`prototype/lib/db.ts`)
- **One-time, idempotent v2 migration (§2.4):** runs inside `initDb()` guarded by
  a `schema_meta('migrated_v2')` flag. **Additive, never drops in this release.**
  Each workspace → `accounts` + a deterministic default project
  (`'proj_'+accountId`); memberships → `account_members` (first admin→owner) +
  `project_members`; `personas`→`personas_v1`→project-scoped `personas`;
  `integrations` re-scoped `'workspace'→'project'` (owner_id `'proj_'+id`). Every
  write is `INSERT OR IGNORE`/existence-checked so a partial failure re-runs
  cleanly with no duplicates and no data loss. Covered by a local-libsql
  migration test (`prototype/lib/migrate.test.ts`: seed→migrate→assert→re-run).
- **Two-tier role model + project routes:** `projectAccess(email, projectId)`
  (`effective = max(account_role, project_role)`; account owner/admin ⇒ implicit
  project-admin) gates every project route. New: `GET/POST /api/projects`,
  `GET /api/projects/:id`, `GET /api/projects/:id/members`,
  `POST /api/projects/:id/invite` (R4, admin-only). `/api/personas`,
  `/api/integration`, `/api/feedback`, `/api/dashboard` are re-scoped to a
  project (accept `?project=` or default to the caller's first). `ensureWorkspace`
  → `ensureAccount` in `/api/auth/verify`. OTP allowlist bypass now checks
  "has any account/project membership". (`prototype/server.ts`)

### Changed
- **Dashboard switcher is functional:** `GET /api/dashboard` lists **real**
  projects and honors `?project=:id`; the switcher reloads the dashboard on
  change when more than one project exists. (`prototype/public/dashboard.html`)

### Fixed
- **Light theme:** primary (purple) buttons now use white text instead of
  near-black across the dashboard, login, and onboarding pages — dark text on
  the deeper light-mode purple read as low-contrast/muddy. Dark mode keeps its
  dark text on the lighter lavender button (where white would be illegible).
  (`prototype/public/{dashboard,login}.html`, `site/onboarding.html`)

## [0.4.0] - 2026-06-17

### Added
- **Dashboard-on-login (Sims P1):** the post-login page is now a real overview
  instead of a static "Welcome back". A new aggregate endpoint
  `GET /api/dashboard?project=:id` (session-gated like other `/api/` routes)
  returns `{ email, projects, active, members, sims, saying, tickets, activity,
  counts }` in one round-trip. The project is **derived** for now
  (`'proj_'+workspaceId`) so the UI is project-shaped before the P2 schema
  lands. The page reuses the existing design system (nav, fonts, `.card`/`.grid`,
  white-on-purple `.btn-indigo`) and adds: a **project switcher**, a "What your
  Sims are saying" feed (recent `feedback` observations, falling back to persona
  `insights_json` so it's never blank), a **Sims overview**, **Recent tickets**
  (filed `feedback` with a tracker key), a **Live activity** feed
  (`activity_events`; non-admins see only their own rows, admins see all), an
  **invite-your-team** CTA (admin-only), and the Plane connection demoted into a
  collapsed settings drawer. Reads only — no AI/vision, no schema migration. New
  DB helpers `listActivity`, `listFeedback`, `dashboardCounts`.
  (`prototype/server.ts`, `prototype/lib/db.ts`,
  `prototype/public/dashboard.html`)

## [0.3.0] - 2026-06-17

### Added
- **Connect Extension (Sims sync):** a one-click "Connect Extension" button in
  the Sims Studio header links the web app to the Chrome extension without OTP
  when you're already signed in. The content script exposes
  `window.__klavityExtensionId`; the Studio fetches the current session token
  (`GET /api/extension-token`) and pushes it to the extension via
  `chrome.runtime.sendMessage` (gated by `externally_connectable` for
  `klavity.quantana.top` + `localhost`). The background merges the token +
  backend URL into `chrome.storage.sync`, so the popup auto-syncs your saved
  Sims on every open. A PING handshake reflects the already-connected state on
  load, and the button surfaces a clear "Not signed in" state when the session
  is missing. (`packages/extension/{manifest.json,src/content.ts,src/background.ts}`,
  `prototype/server.ts`, `prototype/public/index.html`)

## [0.2.0] - 2026-06-17

### Added
- **Sims Studio:** "Save Sim to library →" and "Remove" controls on each Sim
  card in the dock, wired to the persistence API (`apiSaveSim` / `apiDeleteSim`),
  with optimistic disabled/saving states and a confirm before delete.
  (`prototype/public/index.html`)

### Fixed
- **Extension:** region (drag-to-select) captures are no longer mis-added as a
  full-page screenshot — the region flag is now captured before the
  `klavity-capture-result` event resets it. (`packages/extension/src/content.ts`)

## [0.1.0] - 2026-06-16

Initial release of Klavity Snap — the "eyes" of the Klavity suite (Phase 1 of
Snap → Sims → OS).

### Added
- **Right-click bug / feature reporter** on any website (Chrome MV3 extension)
  with a custom context-menu overlay.
- **Auto + region screenshot capture**, including cross-origin images and the
  full rendered page.
- **Canvas annotation** — pen, rectangle, arrow, text; 4 colours; undo / clear.
- **Upload & paste** attachments with HEIC/HEIF auto-conversion.
- **Context capture** — URL, browser, screen size, last 50 console errors and
  network failures.
- **Four integrations** — Jira, Linear, GitHub Issues, Plane.
- **Cloud switch** — a single `backendUrl` to route submissions through Klavity
  Cloud or a self-hosted backend.
- **Embeddable SDK** (`@klavity/snap`) via script tag or npm.
- **Account login + per-user / admin Plane connection** with AES-GCM at-rest
  secret encryption and Bearer resolution in `/api/feedback`.
- **Klavity Sims live prototype** (Bun + OpenRouter) — transcript → personas →
  on-page vision reaction → filed bug; Sims Studio with Import / Your Sims tabs,
  editable Sim cards, and a personas persistence API.
- **Light theme by default** with a dark-mode toggle across app + extension.
- Deploy tooling for `klav.quantana.top` (Bun + Caddy + systemd).

[Unreleased]: https://github.com/vishalquantana/klav-snap/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/vishalquantana/klav-snap/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/vishalquantana/klav-snap/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vishalquantana/klav-snap/releases/tag/v0.1.0
