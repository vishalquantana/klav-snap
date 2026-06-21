# Klavity Snap — Chrome Extension Permission & Scope Justification

> CASA Tier 2 supporting document. Because this extension declares **no Google OAuth sensitive/restricted scopes**
> (no `identity` permission, no OAuth client — see `packages/extension/manifest.json:7-16`), the CASA review here is
> driven by Chrome **powerful-permission** justification rather than OAuth-scope verification.
>
> For each permission below: **what it's for**, **why it's needed**, the **narrowest alternative considered**,
> the **data it touches**, and the **code that uses it** (`file:line`). Permissions with no code use are flagged
> as removal candidates.
>
> **Manifest:** MV3, `packages/extension/manifest.json` · **App:** Klavity Snap `v0.37.1`.

---

## API permissions (`manifest.json:7`)

`["activeTab", "storage", "scripting", "tabs", "cookies", "contextMenus"]`

### `activeTab`
- **Purpose:** Operate on the page the user is currently looking at when they explicitly invoke Klavity (toolbar popup "Analyze this page" / "Report").
- **Why needed:** Lets the extension act on the focused tab **without** a broad host grant — the user gesture (clicking the action / context menu) is the authorization. This is the privacy-preserving alternative to `<all_urls>` host access for the common one-click flows.
- **Narrowest alternative considered:** This *is* the narrow alternative to host permissions. Used so "Analyze this page" works anywhere via a user gesture and is **not** gated behind a per-site grant (`background.ts:138` comment; `popup.ts:262` comment).
- **Data touched:** Current tab's URL + DOM at the moment of the user action (transiently, to capture a report/screenshot). No background/cross-tab access.
- **Code:** `packages/extension/src/popup.ts:232` (`chrome.tabs.query({active:true,currentWindow:true})` to target the active tab), injection into the active tab `popup.ts:192-193,245`.

### `storage`
- **Purpose:** Persist user settings, auth token, selected project, per-project consent/pause flags, and recent submissions.
- **Why needed:** The extension is stateful (login, chosen project, Sims on/off, consent) across browser sessions.
- **Narrowest alternative considered:** Split across `storage.sync` (user prefs/email/token) and `storage.local` (config, consent, pause, recents) — local is used for anything that shouldn't roam across devices. No `unlimitedStorage` requested.
- **Data touched:** `klavSettings`, `klavEmail`, `klavToken`, `klavConfig` (incl. dedicated `ext_…` token), `klavSelectedProjectId`, per-project consent/pause keys, `klavRecent`. The token is a **narrow-scope, revocable** `ext_…` token, not a raw session id.
- **Code:** `options.ts:20,136,211`; `auth.ts:10,16,79,90-91,95-100`; `background.ts:22,110,428-431,448,460-464`; `content.ts:483-499,682-688`; `popup.ts:138,294,314,347,354`.

### `scripting`
- **Purpose:** Inject the content-script module (and CSS) on demand into the active/granted tab to render the report composer and Sim bubbles.
- **Why needed:** The content script is declared **narrowly** (only `http://localhost/*` and the Klavity origin in `manifest.json:27-39`) so it isn't auto-injected everywhere; `scripting` injects it on demand via `activeTab` or onto origins the user explicitly granted. This minimizes passive presence on third-party sites.
- **Narrowest alternative considered:** Static `content_scripts` on `<all_urls>` was rejected — it would trigger the "read and change all your data on all websites" install warning and run passively everywhere. On-demand injection is strictly narrower.
- **Data touched:** Injects first-party extension JS/CSS (`content.ts`, `content.css`) into the target tab; reads page DOM only while the composer/Sim is active.
- **Code:** `background.ts:168-177,239-240` (register/inject content scripts on granted origins); `popup.ts:192,245` (inject into active tab); `content.ts` is the injected payload.

### `tabs`
- **Purpose:** (1) Capture a screenshot of the visible tab for bug reports; (2) open URLs (dashboard, tracker, created-issue links); (3) detect navigation to (re)inject the Sim content script.
- **Why needed:** `captureVisibleTab` requires `activeTab`/`tabs`; opening result/tracker tabs and reacting to `onUpdated` for SPA navigation need the `tabs` API.
- **Narrowest alternative considered:** `captureVisibleTab` can work with `activeTab` alone for the popup gesture, but the background screenshot + `tabs.query`/`onUpdated`/`tabs.create` flows need `tabs`. Could not be fully replaced without losing screenshot + auto-reinjection.
- **Data touched:** Visible-tab pixel capture (the screenshot the user is reporting), tab URLs (to target injection and open links). No reading of tab content beyond the active capture.
- **Code:** `background.ts:70-72` (`captureVisibleTab`), `background.ts:127,218` (`tabs.query`, `onUpdated`), `background.ts:204,343` + `popup.ts:182,326,333` + `content.ts`/`auth.ts` links (`tabs.create`).

### `cookies`
- **Purpose:** Silent SSO — if the user is already signed in to `klavity.quantana.top` in the browser, reuse that session to log the extension in without a second OTP.
- **Why needed:** Reads exactly **one** cookie (`klav_session`) from the Klavity backend origin to bootstrap the extension's own narrow `ext_…` token.
- **Narrowest alternative considered:** Falls back gracefully when `cookies` is unavailable (`if (!chrome.cookies?.get) return false`, `auth.ts:31`). Reads only the named cookie at the backend base URL — not arbitrary cookies across sites. Could be dropped if silent-login is sacrificed (see Recommendations).
- **Data touched:** The single `klav_session` HttpOnly cookie value for the Klavity origin only.
- **Code:** `packages/extension/src/auth.ts:34` (`chrome.cookies.get({ url: base, name: 'klav_session' })`).

### `contextMenus`
- **Purpose:** Right-click → "Klavity → Report a Bug / Request a Feature / View submissions" on any page.
- **Why needed:** Core UX entry point for one-click reporting from the page context.
- **Narrowest alternative considered:** Menus are constrained to `http(s)` documents (`documentUrlPatterns: ['http://*/*','https://*/*']`) — not file/chrome pages. This is the minimal scoping for a context-menu feature.
- **Data touched:** None directly; selecting an item triggers the report flow (which then uses `activeTab`).
- **Code:** `background.ts:190-196` (create menus), `background.ts:204` (open tracker on click).

---

## Host permissions (`manifest.json:8-15`)

These are the origins the extension may talk to / be injected on **at install** (no per-use prompt).

### `https://klavity.quantana.top/*`
- **Purpose:** The Klavity backend — all API calls (auth, feedback, Sim review, project config, tokens) and the `expose-id` content script.
- **Why needed:** First-party backend; the extension is non-functional without it.
- **Data touched:** User email/auth, reports, screenshots, Sim data.
- **Code:** backend base default `popup.ts:326,333`; content script + `expose-id` matched here in `manifest.json:34-38`; `externally_connectable` to this origin `manifest.json:17-22` with handler `background.ts:443` (`onMessageExternal`).

### `http://localhost/*`
- **Purpose:** Local development of the Klavity backend / customer testing against localhost.
- **Why needed:** Dev + local QA; content script is statically injected here (`manifest.json:29,35`).
- **Data touched:** Same as backend, but local.
- **Removal candidate (prod):** Reasonable to **drop from the public Web Store build** — it's a dev convenience and broadens the install footprint. Flag for a prod-vs-dev manifest split. (Real CWS/CASA win.)
- **Code:** `manifest.json:10,21,29,35`.

### `https://*.atlassian.net/*`  ·  `https://api.linear.app/*`  ·  `https://api.github.com/*`  ·  `https://api.plane.so/*`
- **Purpose:** Direct-from-extension ticket creation into the user's connected tracker (Jira/Linear/GitHub/Plane).
- **Why needed:** Historically the extension could POST issues directly to these tracker APIs with the user's own credentials.
- **Narrowest alternative considered:** Each is a specific tracker API host, not a wildcard — already narrow.
- **✅ CONFIRMED DEAD — remove all four (verified 2026-06-21):** After the "Modal harmonization" (v0.36.0/0.37.0) the extension submits **Klavity-only via `/api/feedback`**; copy-to-tracker is **server-side** (`prototype/lib/connectors/`). Exhaustive check of every `fetch()` in `packages/extension/src` (`content.ts:153`, `popup.ts:304`, `background.ts:98,304,326`, `auth.ts:47,63`, `options.ts:76,174,193`) shows **all network calls target the Klavity backend** — none hit `atlassian.net`/`api.linear.app`/`api.github.com`/`api.plane.so`. The only residual references (`background.ts:35`, `popup.ts:171`, `options.ts:178`) build **display URLs** (e.g. `https://app.plane.so/<workspace>`) opened in a browser tab — and **navigating a tab needs no host permission**. **Action:** delete these four lines from `manifest.json:11-14`, bump version, re-upload to the Web Store. Least-privilege win, removes the install-time tracker-access warning.
- **Code:** no direct tracker API call exists in the extension; submission path is `core/submit.ts` → `/api/feedback`.

### `optional_host_permissions: ["*://*/*"]` (`manifest.json:16`)
- **Purpose:** Let a user **opt in** to run Sims / on-page reporting on a specific site they choose.
- **Why needed:** Sims need to read/annotate the target page; rather than request `<all_urls>` at install (scary warning), the extension requests the **specific** origin **only when the user enables it** for that site.
- **Narrowest alternative considered:** This is the privacy-preserving design — broad access is **optional and per-site, granted at runtime** via `chrome.permissions.request`, checked via `chrome.permissions.contains`. The static content script stays narrow (`manifest.json:27-39`).
- **Data touched:** Only the origins the user explicitly grants at runtime; page DOM/screenshot for Sims on those sites.
- **Code:** `popup.ts:272` (`permissions.contains`), `popup.ts:284` (`permissions.request` for the specific host(s)), `background.ts:166` (`permissions.contains` before registering on granted origins).

---

## Cross-cutting privacy notes
- **No Google OAuth / sensitive scopes** — no `identity`, no OAuth client (`manifest.json:7-16`). CASA OAuth-scope verification is N/A.
- **`externally_connectable`** is restricted to the Klavity origin + localhost only (`manifest.json:17-22`); the `onMessageExternal` handler (`background.ts:443`) is not open to arbitrary sites.
- **Content script is declared narrowly** and injected on demand, avoiding the "all your data on all websites" install warning (`vite.config.ts:7-14` rationale; `background.ts:138`).
- **Auth token stored is narrow + revocable** (`ext_…`, not a raw session id) — backend rejects raw session ids as Bearer (`server.ts:602-608`).

---

## Gaps & Recommendations

**Removal candidates (CASA/CWS surface reduction):**
1. **`https://*.atlassian.net/*`, `https://api.linear.app/*`, `https://api.github.com/*`, `https://api.plane.so/*`** — appear **unused** in the harmonized Klavity-only submission flow (copy-to-tracker is now server-side). **Confirm no direct-tracker code path, then remove all four.** `[GAP — needs owner input]`.
2. **`http://localhost/*`** (host permission + static content-script match) — dev convenience; **drop from the public Web Store build** via a prod manifest variant.

**Keep (justified, in active use):** `activeTab`, `storage`, `scripting`, `tabs`, `cookies`, `contextMenus`, `https://klavity.quantana.top/*`, and `optional_host_permissions: *://*/*` (runtime opt-in, the correct narrow pattern).

**Verify with owner:**
- Confirm the four tracker host permissions are truly dead code before removal (search returned no live `fetch` to them, but config still references them).
- Decide whether silent-login via `cookies` is worth keeping; if dropped, remove the `cookies` permission for a cleaner permission set.
- Ship a **prod vs dev manifest** so `localhost` and any dev-only hosts don't appear in the published listing.
