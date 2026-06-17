# Design: Smart Feedback Triggering + Dedup (extension)

**Date:** 2026-06-18
**Status:** Approved (design + adversarial critique done), ready for implementation plan
**Author:** brainstormed with dev2@quantana.com.au; designed + critiqued via parallel workflow

## Problem

The extension only triggers a Sim review on document-idle + SPA route change
(debounced per path via `klavReviewedRoutes`). It **misses** scroll revealing new
content and dynamic content appearing in place (e.g. a chat response). The
homepage markets "Sims giving feedback as you scroll", so scroll-driven feedback
is a core product experience we must actually deliver. Naively wiring observers to
the current coarse `klavDomSig` (title + element count) would **flood** the user
with duplicate reactions and drain the per-project daily budget.

## Locked decisions

| Decision | Choice |
|----------|--------|
| v1 trigger sources | route change + dynamic content (debounced MutationObserver) + **scroll-reveal (IntersectionObserver)** — all guarded |
| Dedup signature | **structural only**: title + structural counts + **`location.host` prefix** (NO visible-text hash → stays inside existing "screenshot, path only" consent copy) |
| Server authority | UNCHANGED — gates a→f, `reviewGate`, `tryConsumeReviewBudget`, consent, allowlist, `reviewDedupeKey`/`REVIEW_SEEN` all stay; we only feed a richer sig + add a client cap |
| Flood control | ~1s trailing-edge debounce shared across sources + per-route min cooldown (~8s) + **per-page-load review cap** + content-sig equality drop |
| Server image-hash backstop | DEFERRED (Approach C) — only needed if sig changes while pixels don't; revisit with telemetry |

## Architecture (Approach A, refined per critique)

Client-side `klavChangeDetector` funnels three sources into ONE trailing-edge
debounce; server authority is untouched.

### Change sources
1. **Route** — existing `history.pushState/replaceState` wrap + `popstate` + ~1.5s poll.
2. **Dynamic content** — `MutationObserver` on the main content subtree, *throttled at the callback* (not just downstream) and debounced ~1s so a streaming chat reply fires ONE review when it settles, not per token.
3. **Scroll-reveal** — `IntersectionObserver` (threshold 0.5) on not-yet-reviewed content blocks (`main, [role=main], article, [role=feed] > *, [data-message-id], .message`). This is the homepage experience — kept, but bounded by the per-route cap below.

### Critique fixes (these are mandatory, not optional)
- **Host in the dedup key.** Current `reviewDedupeKey(simId, urlPath, sig)` is path-only → cross-host collisions, amplified by frequent triggers. Fix: **prefix the client sig with `location.host`** so the opaque sig disambiguates host without changing the key shape or the §5 gate contract.
- **Sig/capture/pixel TOCTOU.** Compute the content-sig **after** `captureVisibleTab` returns, from the same moment as the pixels (re-read + abort/reschedule if it changed mid-capture). Never post a sig describing a different DOM than the screenshot.
- **Pending-latest slot, not a drop-lock.** Replace the single `klavActivating` boolean (which drops the final streaming frame) with a single-slot "pending latest change": while a capture is in flight, record the newest change; on completion, if a newer sig arrived and cooldown permits, run once more. This is what actually delivers "one review when the stream stops."
- **Commit cooldown/lastSig only on a confirmed review** (server responded ok or alreadyReviewed) — not optimistically. On capture-null / network error, don't arm cooldown; let the next tick retry.
- **Per-page-load review cap** (e.g. `MAX_REVIEWS_PER_ROUTE`, default ~6) so an infinite feed / long chat can't drain the project's shared daily budget. Resets on route change.
- **`captureVisibleTab` rate-limit handling** in `background.ts`: a global per-window minimum capture interval + `chrome.runtime.lastError` handling/backoff (Chrome caps ~2/s and errors when a shot is in flight). Surface drops (don't silently lose reviews).
- **Active-tab / visibility guard** before capture (`document.visibilityState === 'visible'` + active tab) — observers run in background tabs but `captureVisibleTab` shoots the focused tab.
- **Observer teardown** on route change and pause/resume (disconnect prior IntersectionObserver/MutationObserver before re-arming) — no accumulation/leak.
- **Suppress boot double-trigger**: reconcile the existing boot `maybeActivate` + the detector's first IntersectionObserver fire of the initial viewport into a single initial review.

### Content signature
`klavContentSig` = `location.host` + normalized title(≤80) + structural counts
(headings/buttons/links/form fields) + a lightweight structural fingerprint of the
visible content region. **No raw or hashed visible TEXT** (consent-safe). Stable
across no-op re-render; discriminates a new message/changed heading.

### Server
**v1: no logic change.** The `domSig` field now carries `klavContentSig`; it flows
unchanged through `reviewDedupeKey`/`REVIEW_SEEN` and gates a→f. (Deferred C would
add one pre-budget `viewportUnchanged` reason — note: that DOES change the ordered
`reviewGate` + its test, so it is genuinely additive work, not free.)

## Data flow
page load (monitored URL) → detector arms 3 sources → any change → shared ~1s
debounce → (sig-equality drop / cooldown drop / cap drop / pause/consent check) →
active-tab guard → `captureVisibleTab` → compute sig from captured moment → POST
`/api/sim/review {projectId, url, domSig: contentSig, screenshotDataUrl}` → server
gates a→f (unchanged) → per-Sim `reactToPage` → bubbles render → on confirmed
review, arm cooldown + record lastSig + increment route review count.

## Out of scope (v1)
- Server-side perceptual image-hash dedup (deferred Approach C).
- Renaming the `domSig` wire field (keep name; only the computing function changes).
- Per-project dedup-strategy config column.

## Open questions deferred to telemetry (sensible defaults shipped)
- Exact `DEBOUNCE_MS` (~1000), `ROUTE_COOLDOWN_MS` (~8000), `MAX_REVIEWS_PER_ROUTE` (~6) — shipped as tunable consts.

## File touch list
- `packages/extension/src/content.ts` — `klavContentSig` (host-prefixed, structural); `klavChangeDetector` (3 sources → one debounce, teardown, pending-latest slot, per-route cap + cooldown + sig-equality, active-tab guard, sig-after-capture); factor the gating into a pure `shouldCapture(...)` helper.
- `packages/extension/src/background.ts` — global per-window capture interval + `lastError`/backoff; surface drops.
- `packages/extension/src/content-change-detector.test.ts` (NEW) — pure-helper tests: `klavContentSig` stability/discrimination; `shouldCapture` table; debounce coalescing; cooldown; per-route cap.
- `prototype/server.ts` / `prototype/lib/db.ts` — v1: NO change (sig is opaque to the key). `prototype/lib/review-gate.test.ts` re-run unchanged as the regression gate proving the §5 contract holds; add one test: two posts, same contentSig, same (sim,path) → second is `alreadyReviewed`, budget consumed at most once.
- `CHANGELOG.md`, `docs/PRD.md`, 5 manifests — version bump (next minor at merge time; reconcile with whatever the concurrent session has shipped).

## Test strategy (TDD)
Factor logic into pure functions so observers stay thin: `klavContentSig`,
`shouldCapture({nowSig,lastSentSig,now,cooldownUntil,paused,routeCount,cap})`,
debounce coalescing (fake timers → exactly one emit), cooldown, cap. Server: re-run
existing gate-order + dedupe-key tests unchanged; add the same-sig budget-once test.
Manual smoke (use vishal@quantana.com.au, NEVER ramesh@): a chat SPA on a monitored
URL → one review per route, one when a reply finishes streaming (not per token),
scroll reveals new blocks up to the cap, no re-review on idle scroll of seen content.
