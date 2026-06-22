# Sims Live — "Customers in the Room While You Build"

**Date:** 2026-06-23 (revised from initial brainstorm)  
**Status:** Design locked — ready for implementation planning  
**Supersedes:** Initial v1 proposal (server-side Playwright capture — that approach is now moved to the AutoSim/Trails track)

---

## 1. The Real Vision (User-Clarified)

The initial brainstorm proposed an admin-dashboard "Run Sims" button backed by server-side Playwright to visit a URL and take a screenshot. The user clarified this is **wrong direction** — that pattern belongs to AutoSim/Trails (autonomous, unattended, its own browser).

The actual feature is something richer:

> **"Customers in the room while you build."**
> Right-click → Deploy Sims → they dock in the corner and react to every screen you visit, every scroll, every chatbot response, every page navigation — a live virtual customer panel running alongside your real work session.

This is not one-shot. It is not asynchronous. It is **persistent + event-driven** — Sims stay deployed until dismissed, re-analyzing continuously as the page changes or you navigate.

---

## 2. Sims vs. AutoSim/Trails — The Critical Distinction

These are **two separate tracks** that must never be conflated:

| | Sims (Live) | AutoSim / Trails |
|---|---|---|
| **Who drives the browser** | YOU — Sims ride along in your session | The server — autonomous headless Chromium |
| **When it runs** | While you're actively browsing | On its own schedule (cron/on-demand, unattended) |
| **Auth** | Your browser session — sees exactly what you see, including auth-walled pages | Needs login credentials injected (AutoSim will ask) |
| **Capture** | `html-to-image` / `safeToPng` from the client's browser | Playwright `page.screenshot()` on the server |
| **Feel** | "Virtual customers watching over your shoulder" | "Automated QA agent running overnight" |
| **Trigger** | Right-click → Deploy Sims (manual, in-page) | Dashboard walk button / cron (remote) |
| **Output** | Live docked panel + reactions bubbles | Trails dashboard runs + expectations auto-file |

**The homepage promise is Sims (live).** Trails/AutoSim is the power tool for CI/overnight. Do not mix them.

---

## 3. UX Walkthrough — What the Feature Looks Like

1. You're browsing your client app (where the Klavity widget is embedded — "Powered by Klavity" footer).
2. Right-click anywhere → widget context menu appears → new item: **"Deploy Sims ›"** → shows a submenu with your project's Sim avatars + a "Deploy all" shortcut.
3. You click "Deploy all Sims" (or pick specific ones).
4. A **docked panel** slides into the bottom-right corner:
   - Shows N Sim avatars (the ksim characters with legs + emotion marks).
   - Shows "Analysing…" spinner while the first review fires.
   - Shows each Sim's latest reaction below their avatar (short observation + emotion glyph).
   - "×" dismiss button in the corner.
5. As you use the app — navigate to the next page, scroll a long feed, submit a form, get a chatbot response — **sims-watch detects the DOM/navigation change** and re-fires the review automatically. The docked panel updates in real time.
6. Each reaction also feeds into your project's feedback spine (same as today's passive auto-review) — so what Sims surface while you're browsing accumulates in the expectations dashboard.
7. When you're done: right-click → "Dismiss Sims" → docked panel closes, observation stops.

---

## 4. Architecture

Four components built in parallel by four Devs:

### 4.1 `sims-live.ts` — Presence Layer (Dev2)

**Package:** `packages/sdk/src/sims-live.ts`  
**Responsibility:** Deploy/dismiss lifecycle, docked panel UI, `window.KlavitySims` public API.

```ts
// Public API exposed on the host page
interface KlavitySimsAPI {
  deploy(simIds: string[], opts?: { projectId?: string }): Promise<void>
  dismiss(): void
  isActive(): boolean
  onReaction(cb: (simId: string, reaction: SimReaction) => void): () => void  // returns unsub
}
```

**Docked panel** lives in the widget's existing shadow root (`HOST_ID`), so it inherits the shadow DOM isolation. Structure:
- Fixed pill at bottom-right (above widget dock; z-index 2147483645).
- N Sim avatars in a row (using `createSim()` from `@klavity/core/sim`).
- "Analysing…" overlay while a review is in flight (spinning ring on the pill border, same pattern as the Trails indicator).
- Per-Sim latest reaction line: emotion mark + first 60 chars of observation.
- Dismiss `×` button calls `window.KlavitySims.dismiss()`.

**State managed here:**
- `activeSimIds: string[]`
- `sessionToken: string` (nanoid, reset on each deploy — server uses for per-session dedup)
- `lastReactions: Map<simId, SimReaction>`
- `isReviewing: boolean`

**`window.KlavitySims.deploy(simIds)`** does:
1. Fetches the Sim profiles from `GET /api/personas?project=X` (reuses existing endpoint).
2. Renders the docked panel.
3. Calls `simsWatch.arm()` (sims-watch.ts).
4. Fires the first review immediately (current page).

---

### 4.2 `sims-watch.ts` — Change Detection (Dev4)

**Package:** `packages/sdk/src/sims-watch.ts`  
**Responsibility:** Detect meaningful page changes → debounce → trigger capture → call review.

Change signals (same taxonomy as the existing `klavArmObservers` in `content.ts` — but this lives in the widget, not the extension):

| Signal | Condition |
|---|---|
| **Navigation** | `pushState` / `popstate` / `hashchange` |
| **Major DOM mutation** | `MutationObserver` on `main`/`[role="main"]`/`article`/`body` — content child count or structure changed above threshold |
| **Scroll-reveal** | `IntersectionObserver` on content blocks entering viewport |
| **DOM sig change** | `klavContentSig()`-equivalent delta — prevents micro-mutation spam (e.g., cursor blink, timestamp tick) |

**Debounce:** 800ms trailing edge (longer than the extension's 600ms — Sims are more expensive than the passive auto-review).

**On trigger:**
```
sims-watch fires
  → sims-live.setReviewing(true)
  → capture: html-to-image / safeToPng(document.body) (same as widget bug capture path)
  → POST /api/sim/review {
        url: location.href,
        screenshotDataUrl,
        domSig: computeDomSig(),
        simIds: activeSimIds,
        projectId,
        adhoc: true,
        sessionToken  ← new: per-session dedup key
    }
  → sims-live.setReviewing(false)
  → sims-live.onReactions(reviews)  → update docked panel
```

**Arms on `window.KlavitySims.deploy()`; disarms on `dismiss()`.**  
**Also disarms on `klavity:widget-ready` replacement** (same coexist logic as the extension).

---

### 4.3 Right-Click "Deploy Sims" Menu (Dev6)

**File:** `packages/sdk/src/widget.ts` — extend the existing `showMenu()` context menu.

Current menu items: Report a Bug · Request a Feature · Show browser menu.

**New item (when Sims deployed = false):**
```
🧬  Deploy Sims ›     [chevron right → submenu]
```
Submenu shows: each project Sim as a selectable row (avatar + name + role), plus "Deploy all" shortcut at top. Checked rows = deployed Sims. "Deploy" CTA at bottom.

**New item (when Sims deployed = true):**
```
🧬  Dismiss Sims      [no submenu, single click]
```

**Data:** Sim list is fetched lazily when the menu opens (same `GET /api/personas` call). Cached for 30s so repeated right-clicks don't hammer the server.

**Token:** The widget's `getToken()` is already available for the authenticated call. No new auth surface.

---

### 4.4 `lib/sim-review.ts` — Backend Review Engine (Dev3)

**File:** `prototype/lib/sim-review.ts`  
**Responsibility:** Extract the core review logic from `server.ts:1895` into a reusable function, add session dedup and per-session cost cap.

**Extraction:**
```ts
// Extracted from the POST /api/sim/review handler body
export async function runSimReview(opts: {
  projectId: string
  actorEmail: string
  url: string
  screenshotDataUrl: string
  domSig?: string | null
  simIds?: string[]
  adhoc?: boolean
  sessionToken?: string   // ← new
}): Promise<SimReviewResult>
```

`server.ts:1895` becomes a thin wrapper that calls `runSimReview()` after auth/gate checks.

**Session dedup (new, in `lib/sim-review.ts`):**

The existing `REVIEW_SEEN` map is keyed by `reviewDedupeKey(simId, urlPath, domSig)` — it prevents re-reviewing the same DOM state. For live Sims, we add a **session dimension**:

```ts
// sessionToken resets REVIEW_SEEN for THIS session's keys, not globally.
// A new deploy() clears previous-session entries for this project.
// Key: `${sessionToken}:${simId}:${urlPath}:${domSig}`
```

This means: if you re-deploy Sims, they'll see every page fresh (as if a new customer arrived). Within a session, the same page+domSig is only reviewed once per Sim.

**Per-session cost cap (new):**

```ts
// In sim_sessions table (new, simple, 3 columns):
// id, project_id, session_token, review_count, created_at
// Before each review batch: check session.review_count < SESSION_REVIEW_CAP (default 20)
// After each review: increment session.review_count
```

This caps a single live session at 20 reviews regardless of how long the user browses. The existing daily `reviewBudgetDaily` cap still applies on top.

**New DB table:** `sim_sessions` (tiny — 1 row per deploy, GC'd after 24h)

```sql
CREATE TABLE sim_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  review_count INTEGER NOT NULL DEFAULT 0,
  cap INTEGER NOT NULL DEFAULT 20,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
```

**`POST /api/sim/review` server changes (minimal):**
- Accepts optional `sessionToken` in body.
- If present, creates/increments a `sim_sessions` row.
- Blocks with `reason: 'sessionCapExhausted'` if `review_count >= cap`.
- Shows cap-exhausted toast in the widget docked panel.

---

## 5. Data Flow End-to-End

```
User right-clicks → "Deploy Sims" (Dev6, widget.ts)
  ↓
window.KlavitySims.deploy(['sim_sc', 'sim_mw']) (Dev2, sims-live.ts)
  → generates sessionToken = nanoid()
  → POST /api/sim/sessions { projectId, sessionToken, cap: 20 }  ← Dev3
  → renders docked panel
  → simsWatch.arm()  (Dev4, sims-watch.ts)
  → fires first review immediately

Change detected (Dev4, sims-watch.ts)
  → debounce 800ms
  → safeToPng(document.body) → screenshotDataUrl
  → POST /api/sim/review { url, screenshotDataUrl, domSig, simIds, projectId,
                           adhoc: true, sessionToken }
        ↓
server lib/sim-review.ts (Dev3)
  → auth gate (bearer token from widget)
  → session cap gate (check sim_sessions row)
  → session dedup gate (skip already-reviewed sim+url+domSig within session)
  → daily budget gate (existing)
  → reactToPage() × N Sims
  → insertFeedback() + autoCopyFeedback() + ingestSnapOrSim()  (existing pipeline)
  → return { reviews: [...reactions] }

sims-live.ts receives reactions (Dev2)
  → updates docked panel (emotion marks, observation snippets)
  → emits reaction bubbles briefly (optional, same style as passive auto-review)
```

---

## 6. Results Landing

**Immediate (in-page):**
- Docked panel updates with latest reaction per Sim.
- Optional brief bubble overlay (same as passive auto-review bubbles — appears and fades).

**Persistent (same as all other Sim reviews):**
- `insertFeedback()` row with `simId` set — appears in the Sims feedback section of the dashboard.
- `autoCopyFeedback()` → Plane/GitHub/Jira auto-copy.
- `ingestSnapOrSim()` → expectations spine (candidate → validated via corroboration).

Live Sims observations **strengthen the expectations spine** the same way passive auto-reviews do — a Sim finding the same issue while browsing + a user Snap report = auto-validated candidate.

**No new "Sim Runs" table is needed for this feature** (the v1 proposal's `sim_runs` table was a consequence of the server-side Playwright approach; browser-capture live Sims don't need a run record separate from the feedback rows).

---

## 7. Dev Split

| Dev | Component | Key files |
|---|---|---|
| **Dev2** | `sims-live.ts` — presence layer + docked panel UI + `window.KlavitySims` API | `packages/sdk/src/sims-live.ts` |
| **Dev4** | `sims-watch.ts` — change detection + capture + review trigger | `packages/sdk/src/sims-watch.ts` |
| **Dev6** | Right-click "Deploy Sims" menu in widget context menu | `packages/sdk/src/widget.ts` |
| **Dev3** | `lib/sim-review.ts` extraction + session dedup + per-session cost cap + `POST /api/sim/sessions` endpoint | `prototype/lib/sim-review.ts`, `prototype/server.ts` |

**Integration point:** Dev6 calls `window.KlavitySims.deploy()` (Dev2), which calls `simsWatch.arm()` (Dev4), which calls `POST /api/sim/review` (Dev3). Dev2 and Dev4 are tightly coupled; Dev3 and Dev6 are independently buildable.

**Build order:** Dev3 first (backend) → Dev2+Dev4 in parallel (client libs) → Dev6 last (wires it up). Dev3 should have the new `POST /api/sim/sessions` and updated `/api/sim/review` with `sessionToken` support ready before Dev2 integrates.

---

## 8. What This Is NOT

- **Not server-side Playwright.** The v1 proposal (server crawls the client URL headlessly) is moved to the **AutoSim track**, where it makes sense: AutoSim runs autonomously, can ask for login credentials, and uses the existing Trails Playwright infra. Live Sims = your browser, your session.
- **Not a dashboard "Run Sims" button.** That UI surface is removed from this feature. The trigger is the widget's right-click menu, on the client site, in the flow of real work.
- **Not a one-shot review.** The session stays active and re-fires on every meaningful change.
- **Not multi-page journey recording.** That is Trails/AutoSim (crystallized steps, replay, heals). Live Sims react to individual page states.
- **Not extension-first.** The widget is the v1 surface ("Powered by Klavity" — it's already on the client site). Extension deployment of Sims can follow as a v2 (`KLAV_ADHOC_REVIEW` extension path already exists; adding a persistent session mode is additive).

---

## 9. Open Questions (Minor)

These don't block implementation but should be resolved during Dev2's work:

1. **Docked panel placement:** Bottom-right, above the existing widget dock pill. Does it overlap the report widget's launcher when both are on the same page? → Yes — needs a 4px gap and z-index priority rule. Dev2 owns this.

2. **Session persistence across tab navigations:** If the user opens a link in the same tab (full page reload), does the session continue? → No: `window.KlavitySims` is in-memory; full reload resets. User must re-deploy. This is correct behavior — it models a fresh customer visit.

3. **Review on scroll (IntersectionObserver) vs. only on DOM change + navigation:** Scrolling is high-frequency. sims-watch.ts should use the `domSig` gate to ensure a scroll that reveals content actually changed the structural signature before triggering a review. Dev4 owns the threshold tuning.

---

## 10. Relationship to Other Specs

| Feature | Relationship |
|---|---|
| `2026-06-20-klavity-os-trails-design.md` | Trails/AutoSim is the AUTONOMOUS track (server-side, scheduled, AI heals). Sims Live is the HUMAN-PRESENT track. These are architecturally sibling features, not competitors. |
| `2026-06-21-extension-widget-modal-harmonization-design.md` | Extension and widget share `buildModal` — similarly, `sims-live.ts` + `sims-watch.ts` should be designed for potential extension adoption in v2. |
| `2026-06-20-expectations-spine-design.md` | Live Sims reactions feed the same `ingestSnapOrSim()` hook → expectations corroboration. No changes needed to the spine. |
| `2026-06-19-adhoc-analyze-page-design.md` | `KLAV_ADHOC_REVIEW` in the extension was the previous one-shot "Analyze this page." Live Sims supersedes the UX intent (continuous > one-shot) but the backend path (`/api/sim/review` with `adhoc:true`) is reused. |

---

## 11. Related Code Pointers

| File | Role |
|---|---|
| `prototype/server.ts:1895` | `/api/sim/review` handler → Dev3 extracts into `lib/sim-review.ts` |
| `prototype/lib/trails.ts` | Pattern reference for `sim_sessions` table design |
| `prototype/lib/safe-fetch.ts` | SSRF guard — NOT needed for this feature (no server-side URL fetch) |
| `packages/sdk/src/widget.ts:472` | `installRegionDrag` + context menu — Dev6 extends menu here |
| `packages/sdk/src/widget.ts:318` | `closeMenu / dismissMenuNow / nativePending` — context menu patterns to follow |
| `packages/extension/src/content.ts:450` | `installRegionDrag + onDragStart + shouldIgnore` — pattern reference for sims-watch.ts MutationObserver setup |
| `packages/extension/src/content.ts:889` | `maybeActivate` + `klavArmObservers` — the change-detection loop sims-watch.ts mirrors |
| `packages/core/src/sim.ts` | `createSim()` + `injectSimStyles()` — Dev2 uses for docked panel avatars |
| `prototype/public/dashboard.html` | No changes to dashboard needed for v1 (results appear in existing feedback list) |
