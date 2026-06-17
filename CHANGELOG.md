# Changelog

All notable changes to **Klavity Snap** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning is anchored in [`docs/PRD.md`](docs/PRD.md). The version there, the
top entry here, and every `package.json` (`/`, `core`, `extension`, `sdk`) plus
the extension `manifest.json` always move together. See the PRD's _Versioning_
section for the bump rules.

## [Unreleased]

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
