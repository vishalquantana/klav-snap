# Klavity Embeddable Widget — Live Sims, no extension

> **Status:** Design (approved scope). **Date:** 2026-06-19. **Target version:** 0.17.0 (new user-facing surface → MINOR).
> Fulfils the onboarding "Or embed the widget" promise (currently a "Coming soon" tile in `site/onboarding.html`).

## 1. Goal

A single `<script>` tag a team drops into their own web app so their Klavity **Sims react live on the real page** — with **no Chrome extension**. It reuses the existing review pipeline, Sim component, allowlist, budget cap, and feedback creation. v1 is deliberately small and safe.

```html
<script src="https://klavity.quantana.top/widget.js" data-project="PROJECT_ID" defer></script>
```

## 2. Scope (locked decisions)

- **Live Sims, manual trigger.** The widget renders a small dock; the user clicks **"Have your Sims review this page"** to run a review. No auto-review on load/route-change in v1.
- **Logged-in Klavity users only.** No publishable key, no anonymous access. Auth is per-user via a one-time **connect popup** handshake (cross-origin cookies are blocked, so we cannot read the session directly on the customer origin).
- **Reuse, don't rebuild.** Backend review/feedback/gating already exist; the widget is a thin cross-origin client plus a small amount of new backend (token mint + CORS + bundle serving).

### Explicit non-goals for v1
- No auto-review (manual button only).
- No per-Sim selection — one button runs the existing multi-Sim review (`/api/sim/review` reviews all active Sims). Per-Sim selection is a fast-follow (needs a `simId` param on the endpoint).
- No publishable-key / anonymous-visitor mode.
- No widget settings UI (position, theme) beyond sensible defaults.

## 3. Architecture

Three pieces:

### 3.1 Widget bundle — `GET /widget.js`
Served by `prototype/server.ts` as `text/javascript` (long cache, versioned via `?v=`). Self-contained IIFE. Reuses the Sim component (inlines/loads `klavity-sim.js`) and `html-to-image` for capture. Responsibilities:
1. Read `data-project` from its own `<script>` tag; derive `backendUrl` from the script's `src` origin.
2. Look for a stored token in `localStorage["klavity_widget_token"]`. If absent → render a **"Connect to Klavity"** dock. If present → fetch Sims and render the active dock.
3. On **"Review this page"**: capture `document.body` via `html-to-image.toPng` (skipping the widget's own host node), `POST /api/sim/review`, render a reaction bubble per Sim (mirroring the extension's `klav-bubble`), and surface gate failures as friendly inline messages.
4. Render in a **Shadow DOM host** (`#klavity-widget-host`) so customer-page CSS can't bleed in.

### 3.2 Connect popup — `GET /widget-connect`
A minimal HTML page on the Klavity origin (first-party, so the session cookie works). Flow:
1. Opened by the widget as a popup: `…/widget-connect?project=<id>&origin=<customer-origin>`.
2. If the visitor has no Klavity session → show the existing OTP/magic-link sign-in (reuse `/api/auth/request` + `/api/auth/verify`).
3. Once signed in (and project access confirmed via `resolveProject`), mint a **widget-scoped token** and `window.opener.postMessage({ type: "klavity-widget-token", token, projectId }, <customer-origin>)`, then close.
4. The `origin` param is validated against the project's monitored-URL allowlist host before posting, so a token is only ever posted back to an allowlisted origin.

### 3.3 New/changed backend (`prototype/server.ts`)
- `GET /widget.js` — serve the bundle.
- `GET /widget-connect` — serve the popup page.
- `POST /api/widget/token` — session-gated (cookie). Validates project access + that the requesting `origin` matches the project allowlist host; mints a narrow, expiring, revocable token reusing the existing extension-token machinery (`ext_`-style, via the same issuance path used by `/api/extension/config`). Returns `{ token }`.
- **CORS layer** for the widget-facing API routes (`/api/personas`, `/api/sim/review`, and any the widget calls). Because auth is **Bearer** (not cookie), respond with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: authorization, content-type`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, and handle `OPTIONS` preflight. No `Allow-Credentials` (we never use cookies cross-origin), so `*` is safe.

No changes to the review pipeline, gating, or feedback persistence — the widget calls the **existing** `/api/personas` and `/api/sim/review` exactly as the extension does (Bearer auth path already supported via `bearerEmail`).

## 4. Data flow (happy path)

```
customer page (app.acme.com)            klavity.quantana.top
  <script widget.js data-project=P>
  ── no token? render "Connect" ──
  click Connect → popup ───────────────▶ /widget-connect?project=P&origin=app.acme.com
                                          (sign in if needed; check access + origin∈allowlist)
                                          mint widget token (ext_… , expiring)
  ◀── postMessage{token} ──────────────  window.opener.postMessage(...)
  store token in localStorage
  GET /api/personas?project=P (Bearer) ─▶ personas[]
  render Sim dock
  click "Review this page"
   capture toPng(body) ────────────────▶ POST /api/sim/review {projectId,url,domSig,screenshotDataUrl} (Bearer)
                                          reviewGate: auth→pause→consent→allowlist→dedupe→budget
                                          on ok: run review, persist feedback (feedbackId)
  ◀── reviews[{simName,reactions[…]}] ──
  render bubble per reaction (KlavitySim)
```

## 5. Gate handling (verbatim reasons from `reviewGate`)

The widget renders a clear inline message for each non-ok `reason`:
- `unauthorized` (401) → token expired → clear it, show "Connect to Klavity" again.
- `paused` (423) → "Sims are paused for this project."
- `userPaused` / `needsConsent` (423/412) → "Turn on live reviews for your account" → link to the consent/grant action (build task: locate the existing consent-grant endpoint; reuse it — do **not** invent a new consent model).
- `offAllowlist` (403) → "This page isn't on your project's watch list — add `<host/path>` in Klavity."
- `alreadyReviewed` (200) → "Your Sims already reviewed this view."
- `budgetExhausted` (429) → "Today's review budget is used up."

## 6. Security

- **No public key.** Every review requires a per-user widget token minted only after an authenticated, access-checked connect.
- **Token scope:** expiring + revocable, reusing the extension-token table; tied to the issuing user. Stored in `localStorage` on the customer origin (acceptable: it's a narrow, revocable token, not the session).
- **Origin pinning:** `postMessage` target origin is the validated, allowlisted customer origin — never `*`.
- **CORS `*` is safe** here because the widget API uses Bearer auth, not cookies (no `Allow-Credentials`), and every sensitive action is still behind `reviewGate` (allowlist + consent + budget).
- **Capture scope:** `html-to-image` filters out the widget's own host node (as the SDK already does) so the dock isn't in the screenshot.

## 7. Components & boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `packages/sdk/src/widget.ts` (new) | Widget runtime: dock, connect, capture, review, bubbles | `@klavity/core/sim`, `html-to-image` |
| `prototype/public/widget-connect.html` (new) | First-party connect/sign-in popup | existing `/api/auth/*` |
| `server.ts: GET /widget.js` | Serve built bundle | build output |
| `server.ts: GET /widget-connect` | Serve popup page | — |
| `server.ts: POST /api/widget/token` | Mint widget token (session-gated, origin-checked) | extension-token machinery, `resolveProject`, `matchMonitored` |
| `server.ts: CORS for widget API` | Cross-origin Bearer access | — |

The widget bundle builds via the existing `packages/sdk` Vite setup (already produces UMD/ES). Output copied/served at `/widget.js`.

## 8. Testing

- **Unit (vitest, `packages/sdk` / `packages/core`):** token storage + clear-on-401; gate-reason → message mapping; capture filter excludes host node; `data-project`/origin parsing.
- **Backend (bun test, `prototype`):** `/api/widget/token` rejects no-session (401), rejects origin not in allowlist (403), mints on valid session+access; CORS preflight returns the expected headers; `/api/sim/review` + `/api/personas` accept the minted Bearer token.
- **Manual (post-deploy):** embed on a localhost test page pointed at prod; connect popup → token → render Sims → review → bubble + feedback row appears in dashboard.

## 9. Rollout

- New surface → **0.17.0** (lockstep bump: PRD, CHANGELOG, 5 manifests).
- Flip the onboarding tile from "Coming soon" to a live embed-snippet reveal **only after** manual verification on prod.
- Ship behind the existing per-project review budget cap; no separate flag needed (logged-in-only + allowlist already bound the blast radius).

## 10. Open build-time questions (resolve in plan, not blocking design)
- Exact existing **consent-grant** endpoint to link from `needsConsent` (locate; reuse).
- Whether `/api/sim/review` needs a tiny tweak to accept widget-origin `url` values cleanly (it already takes `url` in the body — confirm it doesn't assume the extension's tab URL).
- Bundle delivery: serve the prebuilt `packages/sdk/dist` artifact vs. an inline route — pick the simplest that caches well.
