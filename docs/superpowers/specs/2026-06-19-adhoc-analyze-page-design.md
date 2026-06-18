# Ad-hoc "Analyze this page" — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** Klavity Snap extension + prototype server

## Problem

Today, Sims only auto-react on URLs an **admin** has added to a project's
allowlist (`monitored_urls`, project-scoped, admin-only — `server.ts:1722`,
`matchMonitored` `db.ts:1237`). A member who wants Sims to react on some *other*
page (a staging URL, a one-off flow, a competitor) has no way to do it — there is
no personal list and no "run it here now" action.

Many Klavity users are **solo devs** (admin and member are the same person), so
the feature must be **one-click, zero-config** — no setup, no governance friction.

## Goal

A signed-in user on *any* page clicks **one button** and their Sims react on the
current tab, regardless of the allowlist. Resulting reactions persist as tickets
in the project dashboard exactly like normal auto-reviews.

## Non-goals (deferred — explicitly out of scope for v1)

- Personal *persistent* monitors (user-scoped allowlist patterns).
- Admin gate / workspace on-off toggle for ad-hoc.
- Admin domain allowlist restricting where ad-hoc can run.

These are future tiers; v1 is only the one-shot ad-hoc action.

## User flow (solo-optimized)

1. The signed-in popup shows a primary **"Analyze this page"** button near the
   Report a Bug / Request Feature actions.
2. On click:
   - If the user has **exactly one project**, use it silently. If multiple, use
     the popup's currently-selected project (`activeProjectId`). No new prompt.
   - The popup ensures the content script is present (reusing the inject pattern
     already in `popup.ts` `openModal`), sends `KLAV_ADHOC_REVIEW { projectId }`
     to the active tab, and closes.
3. **First time on a given domain only**, the content script shows a small in-page
   confirm card (reusing the existing consent-card styling): *"Analyze this page?
   A screenshot of the visible area will be sent to Klavity to generate
   feedback."* → **[Analyze] [Cancel]**. The domain is then remembered
   (`chrome.storage.local` `klavAdhocDomains: string[]`), so repeat use on that
   domain is truly one-click.
4. On confirm (or if the domain is already remembered), the content script:
   captures the viewport (`klavCapture()`), POSTs the review with `adhoc: true`,
   and renders the resulting reaction bubbles (existing `klavRenderBubble`, which
   already shows the "saved to your dashboard" outcome line).

## Architecture

Three small pieces; the review/render pipeline is **reused unchanged**.

### A. Popup (`packages/extension/src/popup.html`, `popup.ts`)
- New **"Analyze this page"** button in the signed-in view's actions area.
- Click handler resolves the target project (single → silent; multiple →
  `activeProjectId`), guards unsupported tabs, ensures the content script is
  injected (existing pattern), sends `KLAV_ADHOC_REVIEW { projectId }`, closes.
- Disabled/altered states:
  - **No Sims** for the project → button reads "Add a Sim first →" and links to
    the studio (`${base}/app`) instead of running an empty review. (Sim count is
    already known to the popup via `renderSims`.)
  - **Unsupported page** (`chrome://`, `chrome.google.com/webstore`, no tab URL)
    → button disabled with a title tooltip "Can't analyze this page."

### B. Content script (`packages/extension/src/content.ts`)
- New message handler `KLAV_ADHOC_REVIEW { projectId }`:
  1. Compute the page's domain. If not in `klavAdhocDomains`, render an in-page
     **ad-hoc confirm card** (new, styled like the existing consent card). On
     Cancel → abort. On Analyze → add domain to `klavAdhocDomains` and continue.
  2. Show the existing "Sims reviewing…" indicator, call `klavCapture()`, then
     `klavSend({ kind: 'KLAV_REVIEW', adhoc: true, projectId, url, domSig,
     screenshotDataUrl })`.
  3. Render reaction bubbles on success (reuse existing loop). On a blocked
     response surface a plain `klavNotice`:
     - `budgetExhausted` → "Sims hit today's review budget — try again tomorrow."
     - `noPersonas`/empty → "No Sims to run yet — add one in the studio."
- The global `klavSimsEnabled` kill-switch is **not** consulted here: ad-hoc is an
  explicit user action, distinct from passive auto-review. (Document this choice.)

### C. Background (`packages/extension/src/background.ts`)
- The `KLAV_REVIEW` handler (`background.ts:215`) already relays the message body
  to the server `/api/review`. Ensure it **passes through** the new `adhoc` field
  (and `projectId`) unchanged. No new handler needed.

### D. Server (`prototype/server.ts` review route ~`:995`, `reviewGate` `db.ts:1361`)
- Read `const adhoc = body.adhoc === true`.
- **Require an explicit `projectId`** when `adhoc` (there is no allowlist to
  resolve from). Resolve + access-check via the existing `resolveProject(meR,
  requestedProject)`; if no access → existing `unauthorized` response.
- Extend the pure gate `reviewGate` with an `adhoc?: boolean` input. When `adhoc`
  is true the gate **bypasses** `allowlistMatch`, `consentStatus`, and
  `alreadyReviewed` (treats them as satisfied), but **still enforces** `authed`
  and `budgetConsumed`. Everything else in the route (capture, store screenshot,
  run Sims, persist feedback, return reviews) is unchanged.
- Budget is still consumed atomically (`tryConsumeReviewBudget`) — the cost guard
  is the one server-side limit on ad-hoc.

### Data / interfaces summary
- New message: `KLAV_ADHOC_REVIEW { projectId: string }` (popup → content).
- Extended message: `KLAV_REVIEW { ..., adhoc?: boolean }` (content → background →
  server).
- New API field: `POST /api/review` accepts `{ adhoc?: boolean }`; requires
  `projectId` when `adhoc`.
- New storage key: `chrome.storage.local.klavAdhocDomains: string[]` (per-domain
  consent memory, per browser).
- Extended pure function: `reviewGate(i: ReviewGateInput & { adhoc?: boolean })`.

## Error handling / edge cases

| Situation | Behavior |
|---|---|
| Not signed in | Popup already shows the auth view; button not reachable. |
| Unsupported tab (chrome://, web store) | Button disabled + tooltip. |
| Project has no Sims | Button becomes "Add a Sim first →" (studio link). |
| Daily budget exhausted | In-page notice; project auto-pause is the existing behavior and is left as-is. |
| User cancels the confirm | No capture, no request; nothing sent. |
| Repeat on same domain | No confirm; one click → review. |
| Content script not yet injected | Popup injects it first (existing pattern), then messages. |

## Testing

- **`reviewGate` (pure, `db.ts`)** — unit tests in `prototype/lib/review-gate.test.ts`:
  with `adhoc: true`, gate passes when `authed` and `budgetConsumed` even though
  `allowlistMatch=false`, `consentStatus=null`, `alreadyReviewed=true`; and still
  blocks on `!authed` or `!budgetConsumed`. (TDD: write these first.)
- **Server route** — extend `prototype` tests to assert `POST /api/review`
  `{ adhoc:true, projectId }` succeeds on a non-allowlisted URL for a member with
  budget, and 401s without `projectId` / without access.
- **Extension** — `popup`/`content` are not unit-tested today; verify via build +
  manual smoke (load unpacked, click on a non-allowlisted page, see the confirm
  then bubbles). Add a small pure helper test if any non-trivial logic (e.g.
  domain extraction) is extracted.

## Files touched

- `packages/extension/src/popup.html` — button markup.
- `packages/extension/src/popup.ts` — button handler, project resolution, states.
- `packages/extension/src/content.ts` — `KLAV_ADHOC_REVIEW` handler + confirm card.
- `packages/extension/src/background.ts` — pass through `adhoc`/`projectId` (verify).
- `prototype/lib/db.ts` — `reviewGate` `adhoc` input.
- `prototype/lib/review-gate.test.ts` — new gate cases.
- `prototype/server.ts` — `adhoc` branch in the review route.
- (test file for the server route as applicable.)

## Coordination note

A concurrent session is currently editing `prototype/server.ts` and `db.ts` area
(0.16.1 work + sim-studio mockups). Implementation of the server/gate changes
should be done in an isolated git worktree and merged cleanly, to avoid clobbering
that uncommitted work. The extension-only changes are independent.
