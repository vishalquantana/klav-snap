# Manual Sim Trigger — Design Spec

**Date:** 2026-06-23  
**Status:** Brainstorm — awaiting user direction on 3 open decisions  
**Branch:** feat/manual-sim-trigger  

---

## 1. Problem Statement

Sims are set up in the Klavity admin dashboard (Sim Studio). Today, a Sim only gets to "see" a client page when:

1. **Passive auto-activation** — the Chrome extension detects the user is on a monitored URL and auto-fires `/api/sim/review`.
2. **Ad-hoc extension trigger** — "Analyze this page" right-click in the extension, when the admin happens to be browsing the client site.

Both require the **admin's browser to be open on the client page** at the moment of capture. There is no way to say from the Klavity dashboard: "Run Sim X against `https://client.com/pricing` right now" — without first navigating there.

This feature closes that gap: an **explicit, on-demand Sim run triggered from the admin dashboard (or widget right-click)** against a URL the admin specifies.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Sim** | An AI persona (e.g. Sarah Chen, Procurement Lead). Defined in Sim Studio. |
| **Sim review** | One run of `reactToPage(sim, screenshot, url)` — produces reactions/observations. |
| **Sim run** | A triggered batch: N Sims × 1 URL = N reviews. Analogous to a Trails Walk. |
| **Client site** | The external web app where the Klavity widget is embedded. May be public or auth-walled. |
| **Dashboard trigger** | Admin presses a button in the Klavity admin UI to initiate a Sim run. |

---

## 3. Goals

1. Admin can trigger a Sim run against any URL from the Klavity dashboard — no browser session on the client page required.
2. Sims that are set up but never automatically activated (client site not monitored, or extension not installed by a user) can still be exercised.
3. Results land in the same feedback / expectations spine that passive reviews produce, so insights accumulate regardless of trigger path.
4. The feature is the missing "Run" button that makes the Sims onboarding story complete: you add Sims → you immediately test them against your site → you see what they find.

**Non-goals (v1):**
- Scheduled / cron Sim runs (fast-follow, like Trails scheduled walks).
- Multi-page journeys (a single URL + full-page screenshot is the unit; multi-step is Trails territory).
- Headless auth flow (auth-walled pages deferred — v1 limits to public pages or cookie injection via a future mechanism).

---

## 4. How the Existing System Works (Grounding)

### `POST /api/sim/review` today

```
caller (extension) → captures screenshot (captureVisibleTab / html-to-image)
                  → POST /api/sim/review { url, screenshotDataUrl, domSig?, simIds?, projectId?, adhoc? }
                      ↓
server: auth gate → allowlist gate → budget gate → reactToPage() per Sim
                  → insertFeedback() + autoCopyFeedback() + ingestSnapOrSim()
                  → return { reviews: [...reactions] }
```

**The server never captures a screenshot.** It always receives one. This is the core gap.

### Trails `POST /api/trails/:id/walk` (the template)

```
admin (dashboard "Run" button) → POST /api/trails/:id/walk
                               ← { runId }
server: runWalkNow()
  → chromium.launch() (Playwright, headless-shell, already on the box)
  → page.goto(trailUrl)
  → run crystallized Playwright steps
  → per-step evidence + heal/file findings
  → verdict written to DB
```

The Trails runner **already does server-side headless Chromium capture** of external URLs (including `google.com` in the demo). This is the infrastructure to reuse.

---

## 5. Approach Options

### Option A — Server-Side Playwright Capture (Dashboard-first)

**Flow:**
```
Admin clicks "Run Sims" in dashboard
  → picks: URL, which Sims (default = all), optional label
  → POST /api/sims/run { projectId, url, simIds?, label? }
        ↓
server: auth + project-access gate
  → chromium.launch() (reuse Trails infra)
  → page.goto(url, { waitUntil: 'networkidle', timeout: 15s })
  → page.screenshot({ fullPage: true, type: 'jpeg', quality: 80 })
  → converts to base64 dataUrl
  → calls existing reviewSims(projectId, { url, screenshotDataUrl, simIds })
     (shared logic extracted from /api/sim/review)
  → persists run record (sim_runs table: id, projectId, url, status, simIds, screenshotId, reactionsJson, startedAt, finishedAt)
  → returns { runId }
Admin polls GET /api/sims/runs/:id → { status, reviews }
```

**Pros:**
- Works without the admin's browser on the client page.
- Reuses the Playwright + Chromium stack already proven on the production box (Trails Plan G, v0.28.0).
- Clean separation: dashboard initiates, server captures and reviews.
- Natural "Run → see results" story identical to Trails.

**Cons:**
- Server visits external URLs (the client's production site). Needs SSRF guard (already have `safeFetch` pattern; apply same URL validation — block private IPs, localhost, internal hostnames).
- Public pages only in v1 (no auth cookies → auth-walled pages return a login screen, which Sims will "review" unhelpfully). Admin must be aware.
- Headless Chrome may be blocked by anti-bot protection on some client sites (Cloudflare, etc.).
- Adds ~100MB memory pressure during the run (same concern as Trails; already solved with headless-shell).

**Recommended for v1** — most valuable, aligns with user intent, natural extension of Trails architecture.

---

### Option B — Widget Right-Click Trigger (Client-side capture, server-side review)

**Flow:**
```
Widget right-click menu on client site gains new option:
  "Ask your Sims to review this page"
  → widget captures screenshot (existing html-to-image / safeToPng path)
  → POST /api/sim/review { ..., adhoc: true, projectId }
  → same server path as today
  → results shown as reactions in the widget (same bubble UI)
```

**Pros:**
- Zero server-side crawl; screenshot comes from the real browser session (CSS rendered, fonts loaded, auth state respected — sees auth-walled pages correctly).
- No new infrastructure; extends the existing `KLAV_ADHOC_REVIEW` path.
- Reactions appear inline as bubbles — feels live and immediate.

**Cons:**
- Requires someone (admin or test user) to be on the client page with the widget active.
- Only available on pages where the widget is embedded — the admin can't run it against arbitrary URLs from the dashboard.
- Not truly "manual trigger from the admin dashboard"; it's an in-page action.
- Less discoverability (buried in the widget menu).

**Good complement to Option A in a later phase**, not a standalone solution for the stated goal.

---

### Option C — Hybrid (Dashboard provides URL, browser does capture)

**Flow:**
```
Admin enters a URL in the dashboard
  → dashboard opens that URL in a popup/new tab (window.open)
  → landing page has a one-time token + listens for a "ready" message
  → content script / injected snippet captures screenshot + sends to /api/sim/review
  → results polled by dashboard
```

**Pros:** Handles auth-walled pages. Screenshot comes from a real browser session.

**Cons:** Extremely brittle. Relies on CSP of the client site to not block the injected script. Popup blockers. Requires extension to be installed on the admin's browser. Not a clean product experience.

**Rejected for v1.**

---

## 6. Recommended Architecture: Option A + Option B as v2

### v1: Dashboard "Run Sims" (Option A)

**New API surface:**

```
POST /api/sims/run
  body: { projectId, url, simIds?: string[], label?: string }
  auth: session cookie OR bearer token
  returns: { runId: string }

GET /api/sims/runs/:runId
  returns: { id, projectId, url, status: 'pending'|'running'|'done'|'error', 
             sims: [...], reviews: [...reactions], screenshotId, createdAt, finishedAt, errorMsg? }

GET /api/sims/runs?project=<id>&limit=20
  returns: { runs: [...] }  — recent runs for the project
```

**New DB table:** `sim_runs`

```sql
CREATE TABLE sim_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|error
  sim_ids_json TEXT,                         -- null = all project Sims
  screenshot_id TEXT,
  reactions_json TEXT,                       -- full reviews array
  label TEXT,
  error_msg TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
CREATE INDEX sim_runs_project ON sim_runs(project_id, created_at DESC);
```

**Server logic:** `lib/sim-runner.ts` (mirrors `lib/trails-runner.ts` structure)

```
runSimsNow(projectId, url, simIds?) → Promise<{ runId }>
  - validates URL (SSRF guard: block private/localhost/internal)
  - inserts sim_runs row (status=pending)
  - fires background async task (no await; returns runId immediately)
  - background task:
      chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
      screenshot = page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 })
      uploadScreenshotMeta(screenshot, 'image/jpeg', 'private')
      insertScreenshot(...)
      runs reactToPage() for each Sim (reuse existing /api/sim/review logic, extracted to lib/sim-review.ts)
      each review → insertFeedback + autoCopyFeedback + ingestSnapOrSim (existing pipeline)
      updates sim_runs row (status=done, reactions_json, finished_at)
  - concurrent safety: no mutex needed (unlike Trails' single-slot — Sims are stateless LLM calls,
    can run multiple simultaneously; limit to 3 concurrent runs per project via a soft check)
```

**Cost accounting:** Each Sim review call goes through the existing daily budget gate (`tryConsumeReviewBudget`). A 3-Sim run against 1 URL = 3 budget slots. The run is rejected upfront if budget is at 0.

**SSRF guard:**

```ts
// Reuse the safeFetch URL validation pattern already in the codebase:
import { validateExternalUrl } from './safe-fetch'  // block: localhost, 10.x, 192.168.x, 169.254.x, etc.
```

**Dashboard UI** (in `prototype/public/dashboard.html` Sims section):

- "Run Sims" button on the Sims card → opens a small modal:
  - URL input (pre-filled with the first monitored URL for the project, if any)
  - Sim selector: checkboxes (default: all)
  - Optional label
  - "Run" CTA
- After submission: shows a spinner pill "Running… [URL]" that polls `GET /api/sims/runs/:id`
- On done: shows a collapsible "Last Run" panel inline — screenshot thumbnail + Sim reactions (same bubble-card style as the extension reactions)
- "Run history" link → a simple list of past runs with status + date + reaction count

---

### v2: Widget Right-Click (Option B, later)

Add "Ask Sims to review this page" to the widget's right-click menu → uses the existing `POST /api/sim/review` with `adhoc: true`. Results appear as widget bubbles. This is a one-liner once v1 ships (wire `openReport`-style into the widget contextmenu handler). **Do not implement in v1.**

---

## 7. Results Landing

Manually-triggered Sim run results flow into the **same data pipeline** as passive reviews:

1. `insertFeedback()` → feedback row with `simId` set (same as passive)
2. `autoCopyFeedback()` → Plane/GitHub/Jira auto-copy if connector configured
3. `ingestSnapOrSim()` → expectations spine (candidate → validated)
4. `sim_runs.reactions_json` → dedicated run view (for quick review of "what did the Sims find in this specific run")

This means manually-triggered observations **strengthen corroboration** with passive reviews and Snap reports — the same issue found by a Sim run AND a user Snap report auto-validates in the expectations spine.

---

## 8. Auth & Project Scoping

- **Trigger:** session cookie or bearer token, same as all admin endpoints. `resolveProject(email, projectId)` + `projectAccess(email, projectId)` gates.
- **No allowlist check for manually-triggered runs:** The admin explicitly supplies the URL; treating it as an adhoc run (same as `adhoc: true` in the current endpoint). The allowlist gate only blocks passive auto-reviews.
- **Budget gate:** Applied per run. Same daily `reviewBudgetDaily` cap. A 5-Sim run against 1 URL = 5 slots.
- **SSRF:** Server-side crawl goes through URL validation before `chromium.launch()`. Block private IP ranges, localhost, `file://`, `javascript:`, `.local` TLDs.

---

## 9. Open Design Decisions (User Input Required)

### Decision 1 — Server-side Playwright capture vs. always-browser capture

**The question:** Should v1 use server-side headless Chromium (Option A) to visit and screenshot the client URL, or should we require the admin's browser + extension to perform the capture?

- **Server-side (recommended):** works without admin being on the client page; reuses Trails Playwright infra already proven live. Limitation: public pages only (no auth sessions), may be blocked by anti-bot.
- **Browser capture:** always accurate (real session, auth, fonts, CSS); but requires admin to be on the page → not truly "from the dashboard".

**Direction needed:** Is server-side capture acceptable for v1 (public pages / marketing pages), with browser capture as a v2 enhancement for auth-walled pages? Or is auth-walled capture a v1 requirement?

---

### Decision 2 — Single-slot concurrency vs. parallel runs

**The question:** Should manual Sim runs share the Trails single-slot mutex (so a Trails walk and a Sim run can't run simultaneously on the 1GB box), or run independently?

- **Share the slot:** Simple, safe, never OOM. But a 5-Sim run against 3 URLs would queue behind any in-progress Trail walk.
- **Independent with soft cap (3 concurrent):** More flexible; Sim screenshot capture is lighter than Trails step-by-step journeys. Risk: 2 Sim runs + 1 Trail walk = 3 browsers → potential OOM on the 1GB prod box.

**Direction needed:** Given the current 1GB box constraints, should all headless Chrome work (Trails + Sims) share a single global concurrency slot?

---

### Decision 3 — Results surface (dedicated "Sim Runs" view vs. inline in feedback)

**The question:** Do manually-triggered Sim run results get their own run-history view (like `/trails` for Trails), or do they simply appear inline in the existing feedback/expectations dashboard?

- **Dedicated run view:** Admin can see "I ran Sims against `/pricing` on June 23 at 2pm, here's what each Sim found." Screenshot + reactions side-by-side. Natural for debugging ("why did Sarah find this?").
- **Feedback-only:** Results fold into the existing feedback list — no separate run concept. Simpler, but harder to trace "which run produced this observation."
- **Hybrid (recommended):** Results persist in `sim_runs` table for a run view AND flow into feedback/expectations for cumulative analysis.

**Direction needed:** Should we build a "Sim Runs" section in the dashboard (similar to the Trails dashboard) in v1, or defer the run-history view and only surface results via the feedback list?

---

## 10. What We Are NOT Designing

- **Multi-page / multi-step Sim journeys** — that is Trails territory (Trails already does multi-page walks with intent crystallization). A Sim run is a single-shot page review, not a journey.
- **Scheduled / cron Sim runs** — natural fast-follow once manual trigger ships (identical to Trails scheduled walks).
- **Sim "replay" or session recording** — deferred (the rrweb capture story is Trails-specific for now).
- **Widget trigger option (Option B)** — saved as v2 since it requires no new infrastructure.

---

## 11. Related Code Pointers

| File | Role |
|---|---|
| `prototype/server.ts:1895` | Existing `/api/sim/review` — logic to extract into `lib/sim-review.ts` |
| `prototype/lib/trails-runner.ts` | Playwright orchestration to mirror for Sim capture |
| `prototype/lib/trails.ts` | DB patterns for run table (mirror for `sim_runs`) |
| `prototype/lib/safe-fetch.ts` | SSRF guard to reuse for the crawled URL |
| `prototype/public/dashboard.html` | Sims card → add "Run Sims" button + modal here |
| `prototype/public/trails.html` | Run history UI template |
