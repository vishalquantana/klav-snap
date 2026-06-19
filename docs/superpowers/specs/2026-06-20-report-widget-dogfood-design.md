# Klavity Report Widget — dogfooded, extension-yielding

> **Status:** Design (approved scope). **Date:** 2026-06-20. **Target version:** MINOR (new user-facing surface).
> **Origin:** "New user on klavity.quantana.top should submit tickets without the extension; customer sites with the widget should use the widget, not the extension; the two must not fight." Submitting a report on klavity.quantana.top today only works via the browser extension (`content.ts`), so a new user without the extension cannot report.

## 1. Goal & principle

**One widget, dogfooded.** Ship an embeddable **report-submission** widget (`<script>` tag, `data-project`) that customers drop onto their site — and load that *same* bundle on klavity.quantana.top itself. The widget **takes precedence over the browser extension**, and a DOM-mediated handshake guarantees the widget and the extension never both render their report UI on the same page.

This is the report-submission counterpart to the existing **Sims-review** embed widget (`2026-06-19-klavity-embed-widget-design.md`). The two widgets are the same family and may be unified later; this spec covers report submission only.

```html
<script src="https://klavity.quantana.top/widget.js" data-project="PROJECT_ID" defer></script>
```

## 2. Scope (locked decisions)

- **Report submission only.** Bug/Feature capture → `POST /api/feedback` → dashboard row + auto-copy to Plane (via the connector already configured on the project). NOT Sims review.
- **Logged-in Klavity users only.** No anonymous/publishable-key visitor mode in v1.
- **Widget takes precedence over the extension.** On any page where the widget is present, the extension's **report** UI stands down entirely.
- **Reuse, don't rebuild.** The report modal/capture/submit already exist in `@klavity/core` (the extension is built from them). The widget reuses those modules; the only swap is screen capture (`captureVisibleTab` → `html-to-image`).

### Explicit non-goals (v1)
- No anonymous end-user mode (no publishable key, rate-limiting, captcha). Fast-follow.
- No merge with the Sims-review widget.
- No change to the extension's **analyze / Sims-review** features — only its **report** path yields.
- No new ticket schema or new submit endpoint — reuse `/api/feedback`.

## 3. Architecture

Four pieces, three of them reuse existing code.

### 3.1 Widget bundle — `GET /widget.js` (report mode)
Self-contained IIFE built via the existing `packages/sdk` widget build (`vite.widget.config.ts`, entry `src/widget.ts`, output `klavity-widget.iife.js`). Responsibilities:
1. Read `data-project` from its own `<script>` tag; derive `backendUrl` from the script `src` origin (reuse `parseScriptConfig` in `packages/sdk/src/widget-lib.ts`).
2. Render a small floating launcher inside a **Shadow DOM host node `#klavity-widget-host`** (so customer CSS can't bleed in, and so the extension can detect it — see §4).
3. On launcher click, open the **report modal reused from `@klavity/core`** (`modal`, `annotator`, `crop`, `submit`): Bug/Feature toggle, `Page: <path>`, **Capture Screen** / **Capture Area** / **Upload Images**, description, Submit.
4. Capture via **`html-to-image.toPng`** on `document.body`, filtering out the widget's own `#klavity-widget-host` node (mirrors the Sims widget). "Capture Area" reuses `@klavity/core/crop`; "Upload Images" is unchanged.
5. Submit (see §3.3); render success/inline-error states.

### 3.2 Auth (logged-in only)
Two code paths, chosen by whether the widget origin matches `backendUrl`:
- **First-party (klavity.quantana.top loads klavity.quantana.top/widget.js):** the script origin == `backendUrl`, so submit with **`credentials: "include"`** and let the **session cookie** authenticate. `/api/feedback` already resolves the actor via `sessionEmail(req)` (server.ts ~794). A logged-in new user just works — no popup, no token.
- **Cross-origin (customer site):** reuse the **connect-popup token** handshake from the Sims-widget spec (`GET /widget-connect` → `POST /api/widget/token` → `postMessage` token → `localStorage["klavity_widget_token"]`). Submit with `Authorization: Bearer <token>`. `/api/feedback` already supports Bearer via `bearerEmail` (server.ts ~745).
- If first-party but **not** logged in: the modal shows a "Sign in to Klavity to report" state linking to `/login`. (On klavity.quantana.top a "new user" on `/dashboard` is already logged in.)

### 3.3 Submit — `POST /api/feedback` (unchanged contract)
Multipart form: `description`, `page_url`, `screenshots[]`, `project_id`. Server persists to the durable ledger and the **connector auto-copy hook** files it into Plane. No backend submit-path change. The widget does **not** send `plane_*` direct-mode fields (so it never touches the legacy inline-push path).

### 3.4 Backend changes (small)
- **CORS for `/api/feedback`:** add `OPTIONS` preflight + `Access-Control-Allow-Origin: *`, `Allow-Headers: authorization, content-type`, `Allow-Methods: POST, OPTIONS` for the cross-origin Bearer path. Safe because this path is Bearer-only (no `Allow-Credentials`; the first-party cookie path is same-origin and unaffected). Mirrors the widget CORS layer the Sims-widget spec defines.
- **Rider — link-local Plane hardening:** the legacy direct-Plane inline push (server.ts ~894–916) currently returns `400 "Invalid tracker host."` for the *whole* submission when `plane_host` resolves to a link-local/internal address (observed in prod logs as `blocked tracker host: link-local address`). Make this **non-fatal**: persist the feedback and return `200 {saved:true}` regardless, logging the tracker-host rejection like the connector hook does (`auto-copy hook (non-fatal)`). A downstream sink failing must never fail the user's submission. (Plane now flows through the connector hook anyway.)

## 4. Coexistence handshake (precedence + "don't fight") — DOM-mediated

Chrome content scripts run in an **isolated world**: they share the DOM with the page but **cannot read the page's `window` JS variables**. So the handshake is **DOM-based**, not `window`-flag-based.

- **Marker node:** the widget mounts `#klavity-widget-host` (its Shadow host) on load — this is the shared signal.
- **Ready event:** on mount the widget dispatches `document.dispatchEvent(new CustomEvent("klavity:widget-ready"))`.
- **Extension `content.ts` changes:**
  1. **Before injecting** its report UI, check `document.getElementById("klavity-widget-host")`. If present → **stand down**: do not render the report launcher/modal. (Optional: a one-line console note `"[Klavity] widget present — extension report UI yielding"`.)
  2. **Register a listener** for `klavity:widget-ready` early. If the extension already injected its report UI when the event fires (widget loaded after the extension), **tear that UI down**.
- **Precedence:** the widget always wins; the extension never overrides a present widget.
- **Boundary:** only the extension's **report** entry points yield. Analyze/Sims-review entry points are untouched.

## 5. Mount on klavity.quantana.top

Add `<script src="/widget.js" data-project="<active project id>" defer></script>` to the app shell pages (`prototype/public/dashboard.html` and the other logged-in app pages that should offer reporting). The `data-project` is the logged-in user's **active project** id (the app already resolves this server-side; for the default account this is the "Default Project" `proj_32948ecf-…` that monitors klavity.quantana.top). First-party load → cookie auth → submit works for any logged-in user.

## 6. Components & boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `packages/sdk/src/widget.ts` (report mode) | Launcher + report modal + capture + submit, in Shadow host; dispatches `klavity:widget-ready` | `@klavity/core` (`modal`/`annotator`/`crop`/`submit`), `html-to-image`, `widget-lib` |
| `packages/extension/src/content.ts` (changed) | Yield report UI when `#klavity-widget-host` present or on `klavity:widget-ready` | DOM only |
| `server.ts: GET /widget.js` | Serve the built IIFE bundle | sdk build output |
| `server.ts: CORS for /api/feedback` | Cross-origin Bearer submit | — |
| `server.ts: /api/feedback Plane-host rider` | Make downstream tracker rejection non-fatal | existing handler |
| `prototype/public/dashboard.html` (+ app pages) | Mount the widget first-party | `/widget.js` |
| `GET /widget-connect` + `POST /api/widget/token` | Cross-origin connect (reused from Sims-widget spec; build only if not already present) | existing auth/token machinery |

## 7. Data flow (first-party happy path — klavity.quantana.top)

```
klavity.quantana.top/dashboard  (logged-in new user, no extension needed)
  <script /widget.js data-project=P>
  mount #klavity-widget-host (Shadow) ; dispatch klavity:widget-ready
  click launcher → @klavity/core report modal
   capture html-to-image.toPng(body, filter #klavity-widget-host)
   POST /api/feedback (multipart, credentials:include)  ── cookie session ──▶ sessionEmail → resolveProject(P)
                                                            persist feedback row
                                                            connector auto-copy hook → Plane (qbuilder)
  ◀── { id, saved:true } ──  show success ; (Plane ticket created)
```

If the extension is *also* installed: it sees `#klavity-widget-host` / hears `klavity:widget-ready` and yields → only the widget's report UI appears.

## 8. Error handling

- **Network/submit failure** ("Failed to fetch", 5xx): inline error in the modal with a Retry; never lose the typed description or attached images.
- **Not logged in (first-party):** "Sign in to Klavity to report" → `/login`.
- **Token expired (cross-origin, 401):** clear `localStorage` token, re-show Connect.
- **Tracker (Plane) failure:** invisible to the user — submission still succeeds (per §3.4 rider); logged server-side.

## 9. Testing

- **Unit (vitest, sdk/core):** `parseScriptConfig` first-party vs cross-origin branch; capture filter excludes `#klavity-widget-host`; submit payload shape; "not logged in" state.
- **Extension (vitest):** `content.ts` does **not** render report UI when `#klavity-widget-host` exists at inject time; tears down its report UI on `klavity:widget-ready` fired after inject; analyze/Sims paths unaffected.
- **Backend (bun test, prototype):** `/api/feedback` `OPTIONS` preflight returns expected CORS headers; cookie path and Bearer path both persist; **Plane-host rider** — a link-local `plane_host` no longer 400s (returns `200 saved`, feedback persisted), regression test for the observed prod bug.
- **Manual (post-deploy):** load klavity.quantana.top **with the extension installed** → only the widget appears (not both) → submit a Bug → dashboard row appears + a ticket lands in the qbuilder Plane project.

## 10. Rollout

- New surface → **MINOR** bump, lockstep (PRD + CHANGELOG + all 5 manifests) per the SemVer discipline.
- Ship behind logged-in-only + per-project scoping (no separate flag).
- Deploy to prod, run the manual coexistence + submit verification, then keep the widget mounted on the app shell.

## 11. Open build-time questions (resolve in plan, not blocking design)
- Confirm whether `GET /widget-connect` + `POST /api/widget/token` already exist from the Sims-widget work or must be built here (only needed for the cross-origin path; the first-party klavity mount does not need them).
- Confirm `packages/sdk/src/widget.ts` current contents (Sims widget?) — add a report mode/entry vs. a second entry; pick the simplest that keeps one shipped bundle.
- Exact app-shell pages to mount on beyond `dashboard.html` (which logged-in pages should offer reporting).
