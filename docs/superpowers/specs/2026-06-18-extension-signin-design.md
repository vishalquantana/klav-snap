# In-extension sign-in + sims loading — design

**Date:** 2026-06-18
**Status:** Approved (design)
**Scope:** `packages/extension/` + one line in `prototype/public/index.html`. **No backend changes.**

## Problem

A new user is told: *install the Klavity Snap extension → log in → load the sims from
their project → start creating sims.* Today none of that works from the extension:

1. **There is no sign-in anywhere in the extension.** `popup.ts` only reads an already-present
   `klavToken` from storage; the only way a token ever lands there is the web-app
   `CONNECT` handoff (`background.ts:328-357`, `onMessageExternal`). So "log in from the
   extension" is impossible.
2. **The web-app handoff is itself broken.** The Studio page reports *"Extension not
   installed"* even when it is. Root cause: `content.ts:2-4` sets
   `window.__klavityExtensionId` in the content script's **isolated** world, but the page
   reads it in the **main** world (`index.html:1317`) — a different `window`. The global is
   never visible to the page.

## Goal

The first-run experience becomes: **install → open popup → it either already knows you
(reads the site session) or you enter one email code → your project's sims appear → pick a
sim or open Sim Studio.** Login is effectively invisible for users already signed into the
site.

## Key technical findings (verified)

- **Auth is email one-time-code, no passwords** (`server.ts:316-345`):
  - `POST /api/auth/request {email}` → emails a 6-digit code (gated by access-list /
    invite: `emailAllowed(e) || hasAnyMembership(e)`).
  - `POST /api/auth/verify {email, code}` → returns `{ token }` (the raw `klav_session`
    id) and sets the cookie.
- **`klav_session` is `HttpOnly; SameSite=Lax; Secure`** (`lib/auth.ts:35`). `document.cookie`
  cannot read it, but `chrome.cookies.get()` **can** read HttpOnly cookies — this is why the
  silent path requires the `cookies` permission, not page JS.
- **No server CORS work is required.** The extension already performs cross-origin fetches to
  `klavity.quantana.top` with `Authorization` headers from the background worker
  (`background.ts:61`) and the popup (`popup.ts:69`), and they succeed — MV3 grants extension
  pages and the service worker privileged cross-origin access to hosts listed in
  `host_permissions`, and the manifest declares `<all_urls>`. Popup→`/api/auth/*` fetches are
  therefore unrestricted with no `Access-Control-*` headers.
- **The downstream pipeline already exists.** Once any valid token is stored:
  - `syncConfig()` (`background.ts:54-80`) calls `GET /api/extension/config`
    (`server.ts:554-568`), which mints a scoped `ext_` token and returns
    `{ email, token, projects[] }`, cached in `chrome.storage.local` as `klavConfig`.
  - `bearerEmail` (`server.ts:217-224`) accepts both a raw session id and the scoped
    `ext_` token.
  - `GET /api/personas?project=<id>` (`server.ts:497-506`) lists a project's sims and already
    honours `?project=` via `resolveProject` (`server.ts:500`).

## Decisions (from brainstorming)

1. **Login method:** silent cookie read first, in-popup OTP form as fallback.
2. **Detection fix:** included in this spec.
3. **Project selection:** picker in the popup, default to first project, remember last choice.

## Architecture

All new logic lives in `packages/extension/`. Components:

### `src/auth.ts` (new) — single home for sign-in

Pure-ish module wrapping the auth flow; the only place that knows how a token is obtained.

- `trySilentLogin(): Promise<boolean>` — `chrome.cookies.get({ url: <backend>, name: 'klav_session' })`.
  If present, persist it as the bootstrap `klavSettings.klavToken` + `backendUrl`; return `true`.
  Return `false` on miss or if the `cookies` permission is unavailable.
- `requestCode(email): Promise<{ ok: boolean; error?: string }>` — `POST {backend}/api/auth/request`.
- `verifyCode(email, code): Promise<{ ok: boolean; error?: string }>` — `POST {backend}/api/auth/verify`;
  on success persist returned `token` as `klavToken` + `backendUrl`.
- `isSignedIn(): Promise<boolean>` — true when `klavConfig.email` is present.
- `signOut(): Promise<void>` — clears `klavToken`, `klavConfig`, `klavSims`, `klavSelectedProjectId`.
- After any successful token persist, send the existing `KLAV_SYNC_CONFIG` message so background
  runs `syncConfig()` (mints `ext_` token, caches `klavConfig.projects`).

**`backendUrl` resolution:** use existing `klavSettings.backendUrl` if set, else default to
`https://klavity.quantana.top` (matches `background.ts:51`). The cookie read and OTP fetch both
target this base.

### `src/popup.ts` / `src/popup.html` — stateful UI

Two states:

- **Signed out:** email field → "Send code" → 6-digit code field → "Verify". A secondary
  "Use my site login" affordance triggers `trySilentLogin()` explicitly. On popup open, the
  silent attempt runs once automatically before the form is shown.
- **Signed in:** existing bug/feature/recent UI, unchanged, **plus** a project picker in the
  header. Picker lists `klavConfig.projects`; selecting one stores `klavSelectedProjectId` and
  re-fetches sims for that project.

### `background.ts` — reused as-is

No logic change. `syncConfig()` and the `KLAV_SYNC_CONFIG` handler already do the
bootstrap-token → `ext_`-token exchange and project caching.

### `manifest.json`

Add `"cookies"` to `permissions`. **Deployment note:** adding a permission causes Chrome to
disable the extension on auto-update until the user re-accepts the new permission — call this
out in release notes.

## State & data flow

Storage keys:

| Key | Store | Purpose |
|-----|-------|---------|
| `klavSettings.klavToken` | sync | bootstrap session token (raw session id) |
| `klavSettings.backendUrl` | sync | backend base URL |
| `klavConfig` `{email, token, projects}` | local | scoped `ext_` token + projects (existing) |
| `klavSelectedProjectId` | local | **new** — remembers picker choice |

**Popup open:**

1. `klavConfig.email` present → **signed in**: render picker (default `klavSelectedProjectId`,
   else first project) + sims via `GET /api/personas?project=<id>`.
2. Else `klavToken` present but no config → send `KLAV_SYNC_CONFIG`, then go to (1).
3. Else → **signed out**: auto-run `trySilentLogin()` once; on success go to (2); on miss show
   the OTP form.

**OTP flow:** email → `requestCode` → enter code → `verifyCode` → token persisted →
`KLAV_SYNC_CONFIG` → signed-in render.

**Project switch:** picker `onchange` → save `klavSelectedProjectId` → re-fetch personas for
that project.

## Detection fix (web "Connect Extension" button)

The page and content script live in different JS worlds, and a `world:"MAIN"` content script
cannot read `chrome.runtime.id`. Bridge via the shared DOM instead:

- **`content.ts`** (isolated world, at `document_start`): replace the `window.__klavityExtensionId`
  assignment with
  `document.documentElement.dataset.klavityExtId = chrome.runtime.id`
  (guarded to the `klavity.quantana.top` / `localhost` hostnames as today). Set
  `"run_at": "document_start"` on this content script so the attribute is written as early as
  possible. The page-side fallback below still applies, to fully absorb any residual race.
- **`prototype/public/index.html`** (`:1317`): read
  `document.documentElement.dataset.klavityExtId` instead of `window.__klavityExtensionId`,
  with a short `MutationObserver`/poll (≤1s) fallback to absorb the content-script-vs-page
  load-order race.

DOM is shared across worlds, so this is CSP-safe and requires no injected `<script>`. The
existing web→extension `CONNECT` handoff then functions as a secondary login path.

## Error handling

- Invalid/expired code → inline message, stay on the form.
- Network/offline during request/verify → toast + retry; no state change.
- Silent-login miss → silently fall through to the OTP form (not surfaced as an error).
- `cookies` permission unavailable / denied → fall through to OTP.
- `syncConfig` failure after a valid token → keep token, show a retry; do not drop to signed-out.

## Testing

- **Unit (vitest, matching the extension's vite setup):** `auth.ts` token persistence and state
  transitions with mocked `chrome.*` (`cookies.get`, `storage`, `runtime.sendMessage`) and
  mocked `fetch` for request/verify success + failure paths.
- **Manual smoke (extend `packages/extension/SMOKE_TEST.md`):**
  1. Fresh install while logged into the site → open popup → silent login → signed-in with sims.
  2. Fresh install while **not** logged into the site → OTP login → signed-in with sims.
  3. Multi-project user → switch project in picker → sims update; choice remembered on reopen.
  4. Sign out → returns to signed-out state, cached sims/config cleared.
  5. Web "Connect Extension" button on the Studio page now detects the extension.

## Out of scope

- Replacing the raw session id used as the bootstrap Bearer with a purpose-minted token
  (the scoped `ext_` token already covers all post-login calls; bootstrap reuse is acceptable
  for the prototype).
- Any backend endpoint changes.
- Redesigning the popup visual style (the `snap-popup.html` mock is a separate effort).

## Files touched

- `packages/extension/src/auth.ts` — new
- `packages/extension/src/popup.ts` — signed-out/signed-in states, project picker
- `packages/extension/src/popup.html` — auth form + picker markup
- `packages/extension/src/content.ts` — DOM-attribute detection bridge
- `packages/extension/manifest.json` — add `cookies` permission (+ `run_at` on the detection script)
- `prototype/public/index.html` — read ext id from the DOM attribute (`:1317`)
- `packages/extension/SMOKE_TEST.md` — manual checklist additions
- `packages/extension/src/auth.test.ts` — new unit tests
