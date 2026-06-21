# Changelog

All notable changes to **Klavity Snap** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning is anchored in [`docs/PRD.md`](docs/PRD.md). The version there, the
top entry here, and every `package.json` (`/`, `core`, `extension`, `sdk`) plus
the extension `manifest.json` always move together. See the PRD's _Versioning_
section for the bump rules.

## [0.35.0] — 2026-06-21

### Added
- **Session replay on bug reports (free) — Marker.io parity.** The no-install widget and the npm SDK now run an rrweb recorder on a rolling ~45s buffer (inputs masked by default; opt out with `data-replay="off"`). On submit the trailing events ride along as `replay_events`; the server gzips + size-caps them (oldest-first trim, 600 KB durable cap, 6 MB raw reject) into a new `feedback_replays` table. `GET /api/feedback/:id/replay` (auth + project-scoped) serves them and the dashboard ticket detail gains a "▶ Session replay" player. Matches the feature Marker.io gates behind its $149 Team tier. *(#4 / G1)*
- **Dev-tools context on every widget report.** The no-install embed widget now attaches the same technical context the extension/SDK capture — console + network + `userAgent`/screen/viewport — via a new optional `context` form field on `POST /api/feedback`, sanitized + capped server-side, persisted to `feedback.client_context_json`, and surfaced on both the Klavity ticket and external connector tickets. *(#5 / G2)*
- **Full-fidelity capture.** Capture upgraded from console-errors + failed-fetches only to **all** console levels (log/info/warn/error, level-tagged) and **all** network requests including XMLHttpRequest (method/url/status/timing), via a shared `@klavity/core/capture` installer used by both the SDK and the extension. Bounded ring buffers + URL secret-param redaction. *(#6 / G3)*
- **Custom metadata / public JS SDK.** Site owners can now identify the user and attach arbitrary metadata: `window.Klavity.identify({...})` / `setMetadata({...})` (and `KlavitySnap.*` for the npm SDK), plus script-tag config (`data-user-id`/`data-email`/`data-name`, `data-meta` JSON). Values are coerced to strings + length-capped, plumbed into the report context, persisted, and shown on the ticket. *(#8 / G5)*
- **Two-way status sync with external trackers.** New inbound receiver `POST /api/connectors/:type/webhook` reflects external status changes back onto the linked Klavity ticket (`feedback.status`). GitHub (issue opened/closed/reopened, HMAC `X-Hub-Signature-256`) and Plane (state group, shared-secret `X-Plane-Signature`) are wired; Jira/Linear stubbed (return 404 until mapped). Signatures verified constant-time; unsigned/unknown payloads refused or no-op'd (no existence oracle); raw-body 128 KB cap + per-IP rate limit. Inbound secret stored AES-GCM-encrypted on the connector config. *(#7 / G4)*

### Notes
- Origin: Marker.io competitive PLG analysis (`docs/competitor-marker-io-plg.md`) — give away everything Marker paywalls as the free wedge into Sims/AutoSim.
- Widget bundle now embeds rrweb (~418 KB gzip); lazy-loading the recorder is a tracked follow-up.

## [0.34.0] — 2026-06-21

### Added
- **Klavity-native blog engine (GEO-optimized, Claude-authored).** New `/blog` index + `/blog/:slug` routes serving static articles from `site/blog/`. A deterministic publisher (`prototype/scripts/blog-publish.ts`) takes a Claude-authored `{ meta, bodyHtml }` and assembles a full on-brand page (kit.css + Article / FAQPage / BreadcrumbList / Speakable JSON-LD, TL;DR box, FAQ, key-takeaways, CTA), registers it in `site/blog/index.json`, and regenerates the index. The sitemap is now dynamic (auto-includes blog posts); `robots.txt` explicitly welcomes AI answer-engine crawlers (GPTBot/ClaudeBot/PerplexityBot/Google-Extended/Bingbot — the GEO opt-in). Content is authored by a scheduled Claude routine (not OpenRouter), held to a "genuinely helpful, specific, sourced — nothing salesy or thin" bar. First post shipped.

## 0.33.0 — 2026-06-21
### Added
- **Lead-gen widget — the report widget as a PLG funnel.** The right-click widget now has a per-project **mode** (`support` default · `leadgen` · `off`): on submit it shows a mode-aware **success screen** rendered through the themed/Genie modal — support nudges "we'll tell you when it's fixed", leadgen pitches "get it for your product" with email capture + CTA, off is a simple thanks. The captured email + the filed report become a **lead**: `POST /api/widget/lead` attaches `contact_email` and fires an instant email alert; leads land in a dedicated Plane project. Mode/CTA/notify-email are set in the same dashboard "Report widget" card and served via the unified `GET /api/projects/:id/config` (now returns `{ modalConfig, widget: { mode, ctaUrl } }`; the notify email stays server-side). "Powered by Klavity" footer on the composer.
- **First-party anonymous intake on `POST /api/feedback`.** Logged-out visitors on Klavity's own site can file a report: anonymous submissions resolve the project from the form `project_id` only when the request is verified first-party (`Origin` === our base), rate-limited per IP, with a description size cap. No-Origin / foreign-Origin anonymous writes do not persist (the cross-origin surface stays deferred).
- Embedded the lead-gen widget on all marketing pages, filing to a dedicated "Website" Plane leads project (leadgen mode).

## [0.32.0] — 2026-06-21

### Added
- **Expectations spine + graduation (discover→enforce).** A new `expectations` table unifies Snap reports, Sim findings, and AutoSim findings into one issue identity (dedup-collapsed via exact issue-key then lexical similarity). Lifecycle: `candidate` → `validated` (auto, on cross-source corroboration — a real Snap report AND a Sim finding agreeing, or recurrence ≥ 3) → `enforced` → `retired`.
- **Graduation to a deterministic check.** A validated issue can be graduated into a Trail `assert` step (target must be visible): an LLM drafts the assertion once (`ASSERT_SYS`, logged to `ai_calls` as `assert-gen`), a human confirms/edits it, and it then enforces on every zero-LLM replay. Endpoints: `GET /api/expectations`, `POST /api/expectations/:id/enforce`, `…/enforce/confirm`, `…/retire` (all project-scoped, IDOR-safe; re-confirm returns 409).
- **Expectations dashboard** on `/trails`: Candidate · Validated · Enforced board with source badges and the Enforce→confirm flow.

## 0.31.0 — 2026-06-21
### Added
- Per-project report widget appearance settings: theme (light default, dark, glass, neon, custom [Pro], liquid [experimental]), optional custom colors/font, and a custom post-submit thank-you message. Genie open/close animation. Configured in the dashboard; served to the widget via `GET /api/projects/:id/config`.

## [0.30.5] — 2026-06-20

### Changed
- **Cross-page consistency pass on the marketing site.** The home and the three feature pages now share one navbar (open `( )` logo mark everywhere — replacing the square "K" tile on subpages; `How it works · Snap · Sims · AutoSim · GitHub` + `Log in`/`Get started` on all four). Sims & AutoSim regained the GitHub link and the Snap→Sims→AutoSim footer arc + Home/GitHub footer links. Added the BreadcrumbList JSON-LD (previously home-only) to all subpages.
- **Established tone:** "Phase 0X · live today" → "Phase 0X · Live" on Snap and Sims (drops the just-launched implication; phase narrative + live dot retained).

## [0.30.4] — 2026-06-20

### Changed
- **Plain-language pass over the feature pages — removed developer jargon.** Deleted the 13 monospace
  `.hood` technical captions under the storyboard cards on `/snap`, `/sims`, `/autosim` (e.g. "widget
  owns `contextmenu`", "POST `/api/feedback`", "connectors: Plane · Jira · GitHub · Linear"), and
  rewrote the surrounding body copy, chips, FAQ, alt-text and SEO meta/JSON-LD to drop internal terms
  (crystallize, locator cache, heal ladder, zero-LLM, role+accessible-name, vision-LLM, provenance,
  hallucinate, selector, and "Playwright") in favour of plain English that keeps the meaning. Also
  removed the now-dead `.hood` CSS from `kit.css`. The home page had none of these.

## [0.30.3] — 2026-06-20

### Fixed
- **Home brand mark is now the open `( )` logo, not the full twisted helix.** The home nav + footer
  brand SVG drew two crossing strands (a full DNA double helix); the canonical Klavity mark is the
  **open `( )` shape** — two non-crossing parens with faint rungs and a gap at top/bottom (consistent
  with `favicon.svg` and the locked DNA-logo rest state). Swapped both instances in `site/index.html`.

## [0.30.2] — 2026-06-20

### Changed
- **Removed the redundant `local.html` home-page mirror.** The `/` route now serves
  `site/index.html` directly (where all other marketing pages already live), instead of a
  byte-identical `local.html` copy in the repo root that had to be kept in sync by hand. The `/local`
  alias now redirects to `/`. Eliminates the dual-file maintenance trap behind the 0.30.1 follow-up.

## [0.30.1] — 2026-06-20

### Changed
- **Home page: removed the redundant "Roadmap" section.** It duplicated the `#arc` three-phase
  block (Snap → Sims → AutoSim) immediately above it, and with all three phases now Shipped/Live it
  was no longer a roadmap. Its one unique element — the Ekalavya naming line — was folded into the
  `#arc` intro. Also dropped the now-orphaned "Roadmap" nav link and the roaming-Sims tour stop that
  pointed at the deleted element.

## [0.30.0] — 2026-06-20

### Added
- **Marketing feature pages for the three-phase product — `/snap`, `/sims`, `/autosim`.** Each
  walkthrough from the approved critical-path mockup is now its own SEO-optimized page (Snap=indigo,
  Sims=rose, AutoSim=green), built on a shared design kit (`/kit.css` + `/kit.js`) with the
  Sim-walking-the-trail motif, scroll-reveal microanimations (gated behind `prefers-reduced-motion`),
  and the per-phase critical-path storyboards.
- **Home "Klavity arc" section** — a Snap → Sims → AutoSim trail near the top of the home page with a
  compact card + "Learn more →" into each feature page; nav/footer now link the three routes (crawlable hub).
- **SEO infrastructure** — per-page `<title>`/meta-description/canonical/OpenGraph/Twitter cards + JSON-LD
  (`SoftwareApplication`/`Organization`/`BreadcrumbList`/`FAQPage`), plus `/sitemap.xml` and `/robots.txt`.

### Changed
- Renamed the Phase-3 product **"Klavity OS" → "Klavity AutoSim"** across all marketing surfaces; the
  home roadmap now reads Snap shipped · Sims live · AutoSim shipped (was self-contradictory).

### Performance / Accessibility
- **PageSpeed/Lighthouse (mobile): all four pages 100 SEO · 100 best-practices, accessibility 100,
  performance 99–100** (home performance 76 → 99). Non-blocking Google Fonts (`display=optional` +
  `preload`/`media=print` swap) eliminated ~2.9 s of render-blocking and the webfont-swap layout shift
  (autosim CLS 0.62 → 0.00). Text-safe accent colors (amber/indigo/rose/green darkened for text to meet
  WCAG 4.5:1), inline links no longer rely on color alone, `.hero-ambient` made a composited absolute
  overlay, heading order made sequential, and brand/nav `aria-label`s fixed (label-in-name).

## [0.29.1] — 2026-06-20

### Fixed
- **CSP regression: allow `https://esm.sh` in `script-src`.** The v0.29.0 Content-Security-Policy
  (`script-src 'self' …`) blocked the landing page's `html-to-image` ES-module import from
  `https://esm.sh` (the "save persona card as PNG" export), since module imports are governed by
  `script-src`. Added `https://esm.sh` to `script-src`. Caught in post-deploy CSP verification.

## [0.29.0] — 2026-06-20

### Security
- **Widget Bearer tokens are now project-scoped (F5 — A01/ASI03).** A `ext_` token minted for the
  embeddable report widget carries a `project_id` and is constrained to it: a leaked widget token can
  no longer reach the owner's *other* projects via `?project=` or the first-project fallback. The
  per-request bound project is threaded through `AsyncLocalStorage` so `resolveProject` rejects a
  mismatched explicit project and forces the bound one. The extension's own account-wide token is
  unaffected. (`getExtensionTokenInfo` returns `{email, projectId}`.)
- **Legacy AI demo endpoints now rate- and size-limited (LLM10).** `/api/persona/brief`,
  `/api/extract`, and `/api/react` each make an LLM call but had no per-user throttle or input cap
  beyond the daily $ ceiling. Added a per-user/hour cap (40 calls, keyed by email else client IP →
  429 + `Retry-After`) plus payload caps (100k chars for brief/transcript, ~9 MB for the react image →
  413 before any model call).
- **Security response headers on every response (A02).** Added `Content-Security-Policy`
  (locks `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`; permissive enough for the
  dashboard / Trails rrweb player / marketing fonts), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and HSTS
  (when serving over TLS).

## [0.28.1] — 2026-06-20

### Fixed
- **Trails Walk replay now plays.** The `/trails` rrweb-player modal showed "Could not start the
  player for this chapter" because the vendored `rrweb-player` UMD exposes its constructor as
  `window.rrwebPlayer.default` (the global is `{Player, default}`), but the code called
  `new rrwebPlayer(...)` on the namespace object. Now resolves the real constructor
  (`.default`/`.Player`). Verdict timeline + chapters were already correct.

## [0.28.0] — 2026-06-20

### Added
- **Klavity OS — Trails: server-side walk-trigger (Plan G).** `POST /api/trails/:id/walk`
  runs a Trail on the server and `/trails` gets a **"▶ Run"** button + live polling that shows
  the verdict, heal-diff, and rrweb replay. Walks run under a **single-slot mutex** (concurrency=1,
  a 2nd trigger → 409 — never a 2nd browser) with low-memory Chromium flags, a **hard per-walk
  deadline** that bounds every page operation (browser always closed; a walk crash finalizes RED and
  can never take down the service). **Demo Trails seed idempotently on boot** (`TRAILS_DEMO_PROJECT_ID`):
  a fixture set served at `/trails-demo/*` (GREEN baseline / AMBER Tier-1 heal-diff / RED regression)
  plus a dogfood Trail that walks the real public landing — so `/trails` shows real Walks immediately.
  Triggered walks capture rrweb replay; Tier-2 vision stays off by default. Additive — engine unchanged.

## [0.27.0] — 2026-06-20

### Added
- **Klavity OS — Trails (Slice 1).** Record→crystallize→self-healing replay engine: a Trail
  (authored flow) crystallizes to exportable Playwright + a SQLite locator cache and re-walks
  deterministically with **zero LLM on green**; on drift the heal ladder steps in — Tier-0 cache,
  Tier-1 multi-candidate (role+accessible-name → text → testid → structural), Tier-2 vision-LLM
  re-resolution (Qwen3-VL/model-mix, logged in `ai_calls` as `reheal`). A heal is **AMBER, never a
  silent green**; a genuine regression is **RED + a grounded, deduped finding**. Proven on a
  multi-page journey that heals mid-walk and **resumes to completion**. New tables: `trails`,
  `trail_steps`, `locator_cache`, `trail_runs`, `run_steps`, `findings`, `walk_replays`.
- **Findings gate + `/trails` dashboard.** Authed, project-scoped routes (`/api/trails/dashboard`,
  finding file/dismiss) and a dashboard with Walk verdicts, the review queue, heal-diffs, and a
  precision metric. Auto-file (regression + confidence ≥0.9) is built but **intentionally inert**
  until a per-project opt-in toggle; the live path is the human review queue.
- **Walk replay (opt-in).** rrweb session capture per Walk (gzipped per-page segments) with an
  in-dashboard `rrweb-player` scrubber that auto-highlights the failing/heal step. Capture is
  **default-off** and unreachable until a walk-trigger ships.

Engine is library-only plus the `/trails` page; no existing behavior changes. 77 new tests.

## [0.26.2] — 2026-06-20

### Fixed
- **Right-click bug reporter now works without the browser extension.** The first-party
  report widget (`/widget.js`, mounted on klavity.quantana.top/dashboard) registered only
  the floating "Report a bug" launcher — the right-click gesture lived solely in the
  extension/`index.ts` path, so right-click did nothing when the extension was absent. The
  widget's `mount()` now owns `contextmenu`: right-click anywhere opens the bug composer
  (shift+right-click falls through to the native menu; right-clicks on the launcher or inside
  an open composer/overlay are ignored so the modal can't stack and right-click-paste still
  works). Extension continues to yield to the widget (`widgetPresent()` handshake).

## [0.26.1] — 2026-06-20

### Fixed
- **Marketing nav reflects auth state.** The landing page (`/`) showed "Log in / Get started" even when already signed in; it now swaps to a **Dashboard** link when a session is active (checked via `/api/me`).
- **No double dock in the dogfood.** On klavity.quantana.top the embedded widget now shows only the **"Report a bug"** launcher — the Sims-review "Connect to Klavity" dock is suppressed on first-party so users don't see two competing widgets. (Cross-origin customer embeds still get the Sims dock.)

## [0.26.0] — 2026-06-20

### Added
- **Report widget (dogfooded).** Embeddable bug/feature submission widget (`<script src="/widget.js" data-project=…>`), the same bundle shipped to customers, now mounted on klavity.quantana.top so logged-in users report without the browser extension. First-party cookie auth on klavity; Bearer-token (connect popup) cross-origin.
- **Extension yields to the widget.** When the embedded widget is present (`#klavity-widget-host`), the extension's right-click report menu stands down (DOM handshake via `klavity:widget-ready`) so the two never both appear.

### Fixed
- `/api/feedback` no longer returns 400 when a configured tracker (Plane) host is unsafe/unreachable — the submission is persisted and a downstream tracker failure is non-fatal. Added CORS so the widget can submit cross-origin.
## [0.25.0] — 2026-06-20

### Security
A second adversarial OWASP re-sweep found (and this release fixes, with tests) real bypasses of the
earlier controls. See [`docs/security-owasp-review.md`](docs/security-owasp-review.md).

- **Closed SSRF-via-redirect (High).** Outbound `fetch` followed 3xx redirects to unchecked hosts with
  the connector's secret header attached. New `lib/safe-fetch.ts` disables auto-redirects and
  re-validates every hop through the SSRF guard (hop cap 5); all connectors and the direct-Plane push
  use it. DNS-rebinding is narrowed by re-validating immediately before each hop (residual documented).
- **Closed an OTP brute-force bypass (High).** The login lockout was keyed on the client-controlled
  `X-Forwarded-For` header — an attacker rotated it to refresh the attempt budget. XFF is now trusted
  only behind a verified reverse-proxy peer, plus an IP-independent per-email lockout.
- **Closed a cross-tenant citation leak (Medium).** `/api/feedback`, `/api/react`, and `/api/sim/review`
  now verify a supplied `sim_id` belongs to the caller's project before reading trait quotes/provenance.
- **Made the daily AI spend cap a hard limit (Medium).** Replaced the racy pre-check with an atomic
  reserve-then-reconcile so concurrent calls can't overshoot the cap.
- **Stopped connector errors leaking upstream/guard detail (Medium).** Adapters throw generic errors;
  test/export responses carry only a generic message + correlation id.

## [0.24.0] — 2026-06-20

### Added
- **Grounded Sim feedback.** Trait quotes that back a Sim's feedback are now verified and anchored to the exact transcript line (`groundQuote`): exact match → char-normalized match → fuzzy line-snap, else flagged. Citations carry a `verified` bit + a real character offset. Unmatched quotes are kept but flagged unverified — never fabricated.
- **Suggested-bug dedup.** Duplicate bugs detected on an unchanged build collapse into the existing report (recurrence counter bumped, re-sighting dates recorded) instead of filing duplicate feedback rows or external tickets. Issue identity is hybrid: a deterministic key (project + normalized path + issueType + cited traits) with a lexical-similarity fallback.

## [0.23.1] — 2026-06-20

### Security
- **Removed the legacy session-id-as-Bearer fallback (M2 fully closed).** `Authorization: Bearer`
  credentials must now be a dedicated, revocable `ext_` extension token; a raw session id is no longer
  accepted as a Bearer (it remains valid only as a first-party HttpOnly cookie). Prod logs showed zero
  use of the deprecated path before removal. The ops dashboard spend cap caption now reflects that the
  cap is enforced server-side (no longer "display only").

## [0.23.0] — 2026-06-20

### Security
Completes the OWASP remediation — Medium findings + https-only hardening. All Critical, High,
and Medium findings are now fixed with tests. See [`docs/security-owasp-review.md`](docs/security-owasp-review.md).

- **Enforced the daily AI spend cap (M5/LLM10).** `OPS_DAILY_CAP_USD` was display-only; `chat()` now
  fails closed once today's `ai_calls` total reaches the cap. `/api/transcripts` (two LLM calls) is rate
  limited per user and per project and rejects payloads over 100k characters.
- **Stopped leaking internal errors to clients (M4/A10).** Every endpoint now returns a generic message
  plus a correlation id and logs the exception server-side; the upstream tracker response body is no
  longer echoed back.
- **Hardened login token handling (M2).** `/api/extension-token` mints a revocable, scoped `ext_` token
  instead of returning the raw session id.
- **Capped auto-copy volume (M6).** External tickets auto-filed per project per hour are bounded to
  prevent a burst of feedback (or injected content) flooding the tracker.
- **https is now mandatory for all outbound calls.** The SSRF guard's `allowHttp` opt-out was removed —
  plaintext http to any tracker/connector/webhook is rejected by construction.

## [0.22.0] — 2026-06-20

### Security
OWASP review of the Klavity Cloud backend (Top 10:2025 · LLM Top 10:2025 · Agentic AI 2026).
All Critical + High findings remediated, each with regression tests. See
[`docs/security-owasp-review.md`](docs/security-owasp-review.md) for the full report.

- **Fixed cross-tenant data access (IDOR, Critical — C1/C2).** The Sim trait, evolution,
  persona-edit, and `PUT /api/personas/:id` routes were keyed only by object id and did not
  verify the Sim/persona belonged to the caller's project — a member of one tenant could read or
  modify another tenant's customer-research traits and personas. Every such route now enforces
  per-Sim/per-persona ownership and returns 404 on a foreign id.
- **Blocked SSRF to internal addresses (High — H2/H3).** New `lib/url-guard.ts` rejects requests to
  loopback / private / link-local / cloud-metadata hosts (and non-https). It now guards the
  `/api/feedback` Plane host and every outbound connector call (Jira, Plane, webhook, +
  defense-in-depth host-pinning on Linear/GitHub), covering both the connector-test endpoint and the
  auto-copy hook. **Behavior change:** tracker/connector hosts must now be **https** and public —
  plaintext-http or internal-network endpoints will be refused.
- **Throttled OTP login (High — H1).** Added per-email and per-IP rate limiting on code requests and a
  per-(email, IP) lockout after repeated wrong codes (`lib/ratelimit.ts`), closing the brute-force and
  email-bombing gap. A newly requested code now invalidates prior unused codes, and the live code is no
  longer written to logs outside dev mode.
- **Hardened AI prompts against injection (High — H4/LLM01).** Untrusted call transcripts and captured
  page URLs are wrapped in `<untrusted_data>` markers with forged-delimiter stripping
  (`lib/prompt-safety.ts`), and the extract/react/reconcile system prompts instruct the model to treat
  that content as data, never instructions.
- **Validated AI-generated colours (High — H5/LLM05).** Persona `accent` is now constrained to a strict
  `#rrggbb` hex server-side and rendered through a hex guard in the dashboard, removing a stored-XSS /
  CSS-injection sink fed by model output.

## [0.21.1] — 2026-06-19

### Changed
- **SEO-friendly store name.** Extension `name` is now
  "Klavity – AI Bug Reporter & Feedback for Jira, Linear, GitHub" (descriptive title for
  Web Store discoverability), with `short_name` "Klavity" for the toolbar and
  `chrome://extensions`. No functional change.

## [0.21.0] — 2026-06-19

### Changed
- **Narrowed host permissions (no more `<all_urls>`).** The extension no longer requests
  broad "all sites" access — removing the scary install warning and the Chrome Web Store
  in-depth-review trigger. Click-driven flows ("Analyze this page", Report) run on the
  current tab via `activeTab` and work anywhere with no grant. Passive auto-review now
  runs only on the specific domains a user/admin has whitelisted **and** granted once via
  a "Enable on N site(s)" popup action — registered dynamically with
  `chrome.scripting.registerContentScripts` (active-tab/visibility-gated). Static
  `host_permissions` are now explicit (klavity.quantana.top + the four trackers);
  `optional_host_permissions` cover the per-site grants. The content module's
  web-accessible-resources are widened to `<all_urls>` (resource access only — not a host
  permission) so the on-demand loader works on third-party tabs.

## [0.20.0] — 2026-06-19

### Added
- **Sim Studio: 3-pane studio UI replaces single-Sim view** — live attribution
  inspector, inline versioned editing, new-Sim + transcript upload. The `/app?sim=`
  path now opens a three-column studio (sims list / persona detail / attribution
  inspector) wired to the trait/persona/transcript APIs. Column 3 surfaces
  Source / Evolution (lit-spine with `actor` on manual edits) / Transcript (raw text
  with the source quote highlighted). Personas and traits are editable inline
  (PUT/DELETE, every change versioned). New `GET /api/transcripts` lists a project's
  transcripts for column 1's folder. The old single-column focused view
  (`renderFocusedSim`) is retired.

## [0.19.0] — 2026-06-19

### Added
- **Sim Studio backend: versioned trait & persona editing.** Human-facing, fully
  versioned trait and persona-identity editing APIs so the Sim Studio frontend can
  create / edit / soft-archive traits and rename personas, with every manual change
  recorded in the append-only ledgers alongside AI-extracted history.
  - `trait_events` gains an `actor` column and new ops (`manual_create`, `edit`,
    `manual_archive`); `sim_traits.status` gains `archived` (soft delete). A
    `logTraitEdit` helper persists the trait write and its audit event atomically.
  - New project-scoped routes: `GET`/`POST /api/sims/:id/traits`,
    `PUT`/`DELETE /api/sims/:id/traits/:traitId`. The `/api/sims/:id/evolution`
    feed now surfaces `actor` on each event.
  - New `persona_edits` audit table; `PUT /api/personas/:id` now diffs identity
    fields and logs one row per change, exposed via `GET /api/personas/:id/edits`.
## [0.18.2] — 2026-06-19

### Fixed
- **Bug-report screenshot no longer flash-fails on the first try.** The manual right-click
  capture (`CAPTURE_TAB`) now routes through the same `captureWithRateLimit()` guard the
  Sim-review path uses, so it waits out Chrome's ~2 captures/sec limit instead of returning
  an error and hiding the modal with no screenshot (seen as "the widget flashed and grabbed
  nothing, then worked on retry" — typically right after the service worker woke or just
  after a Sim review). Keeps the Arc multi-window `windowId` fallback.

## [0.18.1] — 2026-06-19

### Changed
- **Onboarding "Or embed the widget" tile is now live** (was "Coming soon"). It reveals a
  copy-paste `<script src="…/widget.js" data-project="…">` snippet. The embeddable widget
  itself shipped in 0.18.0; this flips its onboarding advertisement on after live
  verification on prod (bundle mount on a 3rd-party page, token mint for allowlisted
  origins / 403 for others, and cross-origin CORS — including the error-path fix — all
  confirmed).

## [0.18.0] — 2026-06-19

### Added
- **Ad-hoc "Analyze this page" (extension).** A signed-in user can run their project's
  Sims on the current tab with one popup click — regardless of the admin URL allowlist.
  First use on a domain shows a one-time confirm (a screenshot of the visible area is
  sent to Klavity); reactions render in-page and persist as dashboard tickets like any
  review. Built for solo devs: one project resolves silently, no setup. Server-side,
  `POST /api/sim/review` accepts `adhoc:true` and `reviewGate` bypasses the passive-
  monitoring gates (pause/consent/allowlist/dedupe) for the explicit action while still
  enforcing sign-in/project-access and the daily review budget. The Options "Sims"
  kill-switch does not gate ad-hoc (it is an explicit, user-initiated action).

## [0.17.0] — 2026-06-19

### Added
- **Embeddable live-Sims widget (`/widget.js`).** A logged-in team member can drop one
  script tag — `<script src="https://klavity.quantana.top/widget.js" data-project="…" defer></script>`
  — onto their own web app and have their Klavity Sims review the real page, filing
  feedback through the existing pipeline, **with no Chrome extension**. A first-party
  connect popup (`/widget-connect`) signs the user in and mints a narrow, revocable
  per-user token (no public key); the widget then calls the existing review API
  cross-origin via Bearer auth. New backend surface: `POST /api/widget/token`,
  `GET /widget-connect`, `GET /widget.js`, and permissive CORS (Bearer-only, no
  credentials) on the widget-reachable API responses. Built as a self-contained IIFE
  from `packages/sdk`. Manual in-browser smoke test pending before the onboarding
  "embed the widget" tile is switched from "Coming soon" to the live snippet.

## [0.16.1] — 2026-06-19

### Changed
- **Onboarding step 2 now nudges the extension connection instead of letting it slip.**
  The primary CTA reads "Connect the extension to continue" and only becomes a plain
  "Continue →" once the handshake succeeds — so a new team no longer sails past the one
  step the product needs, while "I'll set this up later" keeps the flow unblocked. The
  step kicker is now "where Sims watch" (was internal copy), and an inline hint explains
  URL-pattern wildcards (`/*`) and the path-only normalization the server applies.
- **Dashboard first-run checklist is now progress-aware.** Completed steps tick off
  (green ✓ + strikethrough) — "Add your Sims" once a Sim exists, "Watch your first review"
  once the first observation lands — and the checklist now persists until that first
  review (the activation goal) rather than disappearing the moment one Sim is added.
  De-duplicated the doubled "Welcome to Klavity" heading/intro.

### Fixed
- The onboarding "embed the widget" tile is now clearly marked **Coming soon** and
  non-interactive, instead of presenting as a clickable option that did nothing.

## [0.16.0] — 2026-06-19

### Added
- **First-run onboarding funnel.** New signups now flow into the guided setup wizard
  instead of a cold dashboard: the landing "Get started" CTAs point to `/onboarding`,
  and a first-time login (no prior account) is redirected to `/onboarding` rather than
  `/dashboard`. The wizard gate now uses the captured company domain to tell new users
  from returning ones (instead of mere membership, which every login creates).
- **Dashboard first-run checklist.** A dismissible zero-state card guides new users
  through Install extension → Add product URL → Add Sims → first review, auto-hidden
  once the project has at least one Sim. Added a one-line definition of what a Sim is.
- **Connector "Test connection".** Admins can verify a connector before relying on it —
  both for an unsaved config in the add form (`POST /api/projects/:id/connectors/test`)
  and for a saved connector (`POST /api/projects/:id/connectors/:cid/test`); each files a
  clearly-labelled test ticket and reports success/error inline. Connectors are now also
  editable, and the auto-copy control is explicitly labelled with a confirm on enable.
- **Extension Sims controls + privacy.** The Options page now has a "Sims (auto-review)"
  section with a global on/off kill-switch (`klavSimsEnabled`, default on) honoured by the
  content script, plus a plain-language privacy statement about screenshot capture.

### Changed
- **Signed-out popup.** Added a value-proposition tagline and brand mark to the
  signed-out view, and fixed the "Use my site login" dead-end (clearer label + friendly,
  actionable copy when no website session exists).
- **Login OTP flow.** Real "Resend code" (re-sends to the same email, 30s cooldown),
  distinct from "Use a different email"; the user is no longer dead-ended on an email-send
  failure (stays on the email step with a retry); added "Sending…"/"Verifying…" states and
  wrong-code clear-and-refocus.

## [0.15.6] — 2026-06-18

### Added
- **Focused single-Sim view.** Clicking a Sim on the dashboard now deep-links into the
  studio focused on that Sim (`?sim=`), showing its insights with provenance (source
  quote + transcript), the source transcripts that shaped it (click to read the raw
  call), and its evolution timeline — with a "← All Sims" back link. New read-only
  `GET /api/sims/:id/transcripts` and `GET /api/transcripts/:id` (project-scoped).

## [0.15.5] — 2026-06-18

### Added
- **Rich ticket detail panel.** Expanding a Sim ticket now shows the full
  observation, the suggested bug (title + body), severity/sentiment/Sim chips, the
  provenance citation, the page + time, and an inline screenshot thumbnail
  (lazy-loaded via a short-lived signed link; click to enlarge) — alongside the
  existing status/assignee/notes. Surfaces what the Sim already recorded; the notes
  field now also preloads its saved value.

## [0.15.4] — 2026-06-18

### Added
- **Auto-copy regression test.** `server.connectors.test.ts` now files a real feedback
  with one `auto_copy` webhook connector (pointed at a local receiver) and asserts the
  fire-and-forget hook produces **exactly one** export — guarding the Plane double-file
  regression. It surfaced (and fixed) two latent fixtures in that test's hand-rolled
  schema — `feedback` was missing `suggested_bug_json`/citation columns and
  `activity_events` had `meta` instead of `meta_json` — so the real `/api/feedback`
  persist+auto-copy path was never actually exercised there before.

## [0.15.3] — 2026-06-18

### Fixed
- **Sim reactions silently dropped on the vision path.** `parseJSON` now also quotes
  unquoted bare keys (the actual cause of `Property name must be a string literal`) on
  top of the smart-quote / trailing-comma repairs — so a model's slightly-off JSON no
  longer loses a Sim's feedback during dogfooding.
- **Dashboard horizontal overflow** — grid columns now use `minmax(0,1fr)` so long Sim
  names/roles can't blow the layout past the viewport (was 1940px on a 1121px screen).

### Added
- **Live observability for Sim reviews.** The extension content script logs every
  detector decision to the console with a `[Klavity]` prefix (activate / skip-reason /
  capture / post / response / reactions), and the server logs `[review]` lines (gate
  outcome + reaction count) — so "are the Sims actually reviewing?" is answerable at a glance.

## [0.15.2] — 2026-06-18

### Fixed
- **Test isolation across the prototype suite.** All test files run in one Bun process
  with a shared module registry, so `db.ts`'s client (created once at import) bound to
  whichever DB-backed test imported first — making the other files collide on that DB and
  fail only when run together (`bun test`). Added `reconnectDb()` to `db.ts`; each
  DB-backed test now re-points the singleton at its own temp DB in a `beforeAll`. Full
  suite is now green run-together (112 pass / 0 fail, was ~11 fail / 4 errors).
- **Tolerant LLM JSON parsing.** `parseJSON` (used by react/extract/reconcile) now strips
  code fences anywhere, extracts a top-level object *or* array, and repairs the common
  model glitches — trailing commas and smart quotes — that threw "Property name must be a
  string literal" and silently dropped a Sim's review. Falls back to a clear error only
  when truly unrecoverable.

## [0.15.1] — 2026-06-18

### Fixed
- **Copy-to-external tickets now carry the Sim's name.** The auto-copy hook built a
  leaner payload than the manual export, and `feedbackToTicketPayload` hardcoded
  `simName: null` — so external tickets (webhook/Plane/GitHub/Jira/Linear) showed no
  Sim attribution (confirmed live: the webhook payload had `"simName": null`). Both
  paths now resolve the persona name from `simId` through one shared builder, and the
  ticket body reads `Sim: <name>` instead of the raw id.

## [0.15.0] — 2026-06-18

### Added
- **Smart feedback triggering + dedup (extension).** Sims now react not just on
  navigation but on real viewport change — new dynamic content (e.g. a chat reply,
  debounced so it fires once when streaming settles) and scroll-reveal (the
  homepage "feedback as you scroll" experience) — while a host-aware structural
  content signature + per-route cap + cooldown + capture rate-limit handling stop
  the user being flooded with duplicate reactions on the same view. Server review
  gate, budget, and consent are unchanged.

## [0.14.0] — 2026-06-18

### Added
- **Persona insight quality — specificity + recurrence/regression.** Extracted Sim
  insights now name the concrete UX/technical issue (area, a closed issue-type enum,
  and severity), not just a feeling. A new `reopen` op reactivates a previously
  resolved trait when the same issue resurfaces, so the Sim detects regressions —
  when a resolved pain comes back, it reacts with the implied disappointment
  ("raised before ... and it's back"). Recurrence/regression is derived from the
  immutable trait-events timeline; severity guides (does not auto-file) bug severity.

## [0.13.0] — 2026-06-18

### Added
- **Klavity Cloud ticket management.** Every Sim report now has an editable **status**
  (`open` / `in_progress` / `done`), **assignee** (free-text email or name), and **notes**
  field. Changes persist immediately via `PATCH /api/feedback/:id`; any project member can
  update; the dashboard ticket list shows status and assignee inline.
- **Pluggable connector system.** A new `prototype/lib/connectors/` adapter registry
  supports five external destinations — **webhook**, **Plane**, **GitHub Issues**,
  **Jira**, and **Linear** — each with a typed `validate` + `createIssue` interface.
  Connector configs are stored encrypted at rest; secrets are never returned to the client
  (redacted + `has<Field>` flag).
- **Manual copy-to-external per ticket.** Admins can push a Klavity ticket to any
  configured connector via a "Copy to…" action in the ticket detail panel.
  A linked badge appears after export; re-export inserts a new history row.
- **Auto-copy on file.** Each connector has an optional **auto-copy** toggle: when
  enabled, every new ticket is automatically pushed to that destination as a
  fire-and-forget operation (never blocks the response).
- **Dashboard ticket detail panel.** Ticket rows are now expandable — clicking a row
  reveals the status segmented control, assignee input, notes textarea, export badges,
  and the "Copy to…" action all inline.
- **Connectors manager in project settings.** Replaces the old single Plane form with a
  full connector list (type, name, auto-copy + enabled toggles, delete) and an
  "Add destination" form that dynamically renders the selected type's fields (secret
  fields shown as password inputs with "leave blank to keep" UX).
- **Plane auto-migration.** On boot, existing per-project Plane `integrations` rows are
  migrated once into the new `connectors` table (`auto_copy=1`, `enabled=1`) so
  existing auto-mirror behaviour is preserved without reconfiguration.

## [0.12.1] — 2026-06-18

### Added
- **Project badge + switcher in the Sims Studio header.** The studio now shows the
  active project name and lets you switch projects inline (reloads `/app?project=`),
  and "← Dashboard" returns you to the same project. Closes the gap where you
  couldn't tell which project the studio was scoped to.

### Changed
- Dashboard metric "Active Sims" → **"Sims"** (it counts all Sims in the project,
  not just recently-active ones — the label was overstated).

## [0.12.0] — 2026-06-18

### Added
- **Weighted model mix in `/opsadmin`.** Ops admins can set a relative-weight mix
  across a curated OpenRouter shortlist (Qwen3-VL, Gemini 2.5 Flash, Gemini 3.1
  Flash-Lite, Claude Haiku 4.5, GPT-5 mini); every AI call picks a model by weight
  and records it in the `ai_calls` ledger, turning the "By type & model" panel into
  a live A/B comparison. Weights persist in `schema_meta` (no redeploy) and seed a
  qwen3-heavy default (qwen3-vl 50 / gemini-2.5-flash 40 / gemini-3.1-flash-lite 10)
  on first boot. New `POST /opsadmin/model-mix` route, 404-gated like the dashboard.
## [0.11.2] — 2026-06-18

### Fixed
- **Invites now go to the project you're viewing, not your first project.** The
  dashboard invite used the legacy `/api/team/invite` alias, which resolves to the
  account's first project; it now posts to the project-scoped
  `POST /api/projects/:id/invite`. (Found in a project-scoping audit.)
- **Studio sim-evolution/provenance** (`/api/sims/:id/evolution`) now carries
  `?project=`, so the provenance panel works for Sims in non-default projects.

### Audit note
- Extension multi-project handling verified correct: it resolves the project from
  the visited URL (`klavMatchProject`) and passes `projectId`/`?project=` on
  `/api/sim/review`, `/api/consent`, and `/api/personas`; the popup has a project
  picker. No extension changes needed.

## [0.11.1] — 2026-06-18

### Fixed
- **Studio now respects the active project.** Opening the Sims Studio from the
  dashboard carried no project, so it always showed/saved to the account's default
  project — a new project appeared to show the old project's Sims. The dashboard's
  "/app" links now carry `?project=<id>` (preserving any `#hash`), and the studio
  scopes all project-bound calls (`/api/personas` list/create/update/delete and
  `/api/feedback`) to that project. `/api/extract` and `/api/react` are stateless
  and unchanged.

## [0.11.0] — 2026-06-18

### Added
- **Dashboard metrics row** — at-a-glance counts up top: Feedback received, Active
  Sims, Teammates, Tickets filed (real totals from `/api/dashboard` `counts`).
- **Editable monitored URLs** — admins can rename a monitored URL pattern in place
  on the dashboard (✎ → edit, Enter/blur to save, Esc to cancel). New
  `setMonitoredUrlPattern` + `POST /api/projects/:id/monitored-urls/:mid` now
  accepts `urlPattern` (path-only, UNIQUE-safe) in addition to `enabled`.
- **New-project from the switcher** — the project dropdown now offers "＋ New
  project…" (admins), creating a project inline via `POST /api/projects` and
  switching to it. The switcher is always enabled, not just with >1 project.

### Changed
- **Bug tracking reframed around Klavity Cloud** — Project settings now present
  Klavity Cloud as the default home for Sim reports (nothing to configure), with
  Plane demoted to an optional external mirror. Aligns with the direction of
  keeping tracking in Klavity Cloud.
- **"What your Sims are saying"** moved below the metrics + operational cards and
  capped to a scrollable height so it no longer dominates the dashboard.

> Note: 0.10.0 is reserved by the in-flight in-extension sign-in branch.

## [0.9.0] — 2026-06-18

### Added
- **AI credit logging + `/opsadmin` dashboard.** Every OpenRouter call is now
  recorded (model, real credit cost via `usage.include`, token counts, actor,
  project) in a new `ai_calls` ledger. A private, server-rendered `/opsadmin`
  page (gated to the `OPS_ADMIN_EMAILS` allowlist; 404 to everyone else) shows
  total spend, a 30-day daily-spend chart, today-vs-cap (`OPS_DAILY_CAP_USD`),
  per-project and per-type/model breakdowns, and a recent-calls log.

### Fixed
- **Sims Studio: Import/Your Sims tabs were unclickable** — the tabs used inline
  `onclick="switchL1Tab(…)"`, but the studio script is a `<script type="module">`,
  so the function is module-scoped and invisible to global inline handlers (it
  threw `switchL1Tab is not defined`). Wired the tabs with event listeners inside
  the module instead (a curly-smart-quote typo in the same handlers was also
  fixed).
- **"Critical feedback only" now also hides positive *review* feedback** — the
  toggle previously only filtered dock insights; positive review reactions
  (`satisfied`/`delighted`) still showed and saved. Now they're filtered from
  `playReactions` too (bubble + draft), with a friendly note when a Sim had only
  positive reactions.

### Changed
- **Sims Studio visual refresh — "soft lightness":** white airy persona/draft
  cards (was beige `--ink-3`) with soft shadows + larger radius, roomier panel
  padding + grid spacing, and bumped-up font sizes (dock text was 8–11px), to
  match the onboarding's lighter feel. The dev-mode bar is now full-bleed
  (no top/side gap). (`prototype/public/index.html`)

### Added
- **Animated intro reel (mock)** at `/intro-reel` — a ~25s auto-looping CSS/JS
  storyboard of the product story (call → Sim → live comment → filed ticket),
  with the real Klavity logo and the little walking Sim characters. A stand-in
  for the demo video until a real one is produced. (`site/intro-reel.html`,
  `prototype/server.ts`)

## [0.8.1] - 2026-06-17

### Added
- **Company domain is now persisted** on the account (was collected in onboarding
  but dropped). Additive `accounts.domain` column (idempotent `ALTER` for existing
  accounts), `setAccountDomain` helper, and an admin-gated `POST /api/account/domain`
  the onboarding calls after signup. (`prototype/lib/db.ts`, `prototype/server.ts`,
  `site/onboarding.html`)

### Changed
- **Onboarding "Add to Chrome" tile is now functional** — it runs the real extension
  CONNECT handshake (links your installed extension to the account) instead of just
  linking to `/app`, with an honest "install it first" fallback when the extension
  isn't detected. (`site/onboarding.html`)
- **Landing page "how it works"** step 2 now reflects the shipped live model — Sims
  auto-comment on your monitored product URL (not just "while you browse"), and notes
  the no-transcript Six Thinking Hats on-ramp. (`site/index.html`)

## [0.8.0] - 2026-06-17

### Added
- **Onboarding redesign — unified welcome → setup → Studio hand-off:** the
  signup flow is rebuilt around a "how it works" welcome explainer (the premise
  cold prospects were missing), then does only the setup the Studio can't —
  create your **project** (inline magic-link OTP sign-in), point your Sims at a
  **monitored URL**, and pick a starting point (a customer-call transcript or
  the Six Thinking Hats) — before handing straight into the Sim Studio's own
  guided first-run. Replaces the old 5-step "workspace" walkthrough.
  `/onboarding` now serves logged-out signups (logged-in members still route to
  the dashboard, preserving the earlier routing fix); the Studio honors the
  `?starter=hats` / `#add-transcript` hand-off. New `POST /api/projects/:id/rename`.
  (`site/onboarding.html`, `prototype/server.ts`, `prototype/lib/db.ts`,
  `prototype/public/index.html`)
- **Six Thinking Hats starter Sims:** a secondary "not sure where to start?"
  on-ramp in the Sims Studio — load de Bono's six hats (process, facts,
  feelings, benefits, risks, ideas) individually or all six as a balanced
  review team. No transcript needed; works on any page.
  (`prototype/public/index.html`)

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
