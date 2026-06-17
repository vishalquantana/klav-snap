# Smart Feedback Triggering + Dedup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes. Read the spec first: `docs/superpowers/specs/2026-06-18-feedback-trigger-dedup-design.md` (full design + critique rationale).

**Goal:** Trigger Sim reviews on real viewport change (route, dynamic content, scroll-reveal) without flooding the user or draining budget; server review-gate authority stays unchanged.

**Architecture:** A client `klavChangeDetector` in the extension funnels three sources into one trailing-edge debounce, gated by a pure `shouldCapture` helper (sig-equality + cooldown + per-route cap + pause), with a pending-latest slot and sig-computed-after-capture. The content signature is host-prefixed + structural (no text). Server: `domSig` simply carries the richer sig through the existing `reviewDedupeKey`/`REVIEW_SEEN`.

**Tech Stack:** Bun, TypeScript, Chrome extension (content + background), `bun:test`.

## Global Constraints

- Work entirely in the worktree `/Users/vishalkumar/Downloads/qbug/klav-snap/.claude/worktrees/feedback-trigger`. All paths/cd/git/bun there.
- **Server stays unchanged in v1**: gates a→f, `reviewGate`, `tryConsumeReviewBudget`, consent, allowlist, `reviewDedupeKey`, `REVIEW_SEEN`. The dedup key is opaque to the sig — do NOT change its shape; carry host inside the sig string instead.
- Dedup signature is **structural only** — title + structural counts + `location.host` prefix. **No raw or hashed visible text** (consent copy says "screenshot, path only").
- Flood guards are mandatory (the critique): ~1s shared trailing-edge debounce; per-route min cooldown ~8s; **per-page-load review cap** (default ~6, resets on route change); content-sig equality drop.
- Streaming correctness (critique): compute the content-sig from the **post-capture** moment; use a **pending-latest slot** (not a boolean drop-lock); commit cooldown/lastSig only on a **server-confirmed** review (ok or alreadyReviewed); active-tab/visibility guard before capture; disconnect observers on route change/pause (no leaks); avoid boot double-trigger.
- `background.ts`: global per-window min capture interval + `chrome.runtime.lastError` handling (Chrome caps `captureVisibleTab` ~2/s).
- Tunable consts: `DEBOUNCE_MS=1000`, `ROUTE_COOLDOWN_MS=8000`, `MAX_REVIEWS_PER_ROUTE=6`.
- TDD; factor browser-free logic into pure functions so it's unit-testable without a DOM. Tests: `cd prototype && bun test` (server) and the extension test runs under `bun test` from repo root or the extension package per its config — verify how `packages/extension` tests run before writing.
- SemVer lockstep at merge time (reconcile version with whatever the concurrent session shipped).

## File Structure
- `packages/extension/src/content.ts` — replace `klavDomSig`→`klavContentSig`; add `klavChangeDetector`; extract pure `shouldCapture`; wire into `maybeActivate`/route hooks with teardown.
- `packages/extension/src/feedback-trigger.ts` (NEW, optional) — pure helpers (`klavContentSig` input-shape, `shouldCapture`) if content.ts can't be imported in tests; otherwise keep pure fns exported from content.ts and test via a thin import. Decide in Task 1.
- `packages/extension/src/background.ts` — capture rate-limit + lastError.
- `packages/extension/src/feedback-trigger.test.ts` (NEW) — pure-logic tests.
- `prototype/lib/review-gate.test.ts` — add same-sig-budget-once test (server unchanged otherwise).

---

### Task 1: Pure trigger logic — `klavContentSig` + `shouldCapture` (TDD)

**Files:** Create `packages/extension/src/feedback-trigger.ts` + `packages/extension/src/feedback-trigger.test.ts`.

**Interfaces — Produces:**
- `klavContentSig(input: { host: string; title: string; counts: { headings: number; buttons: number; links: number; fields: number }; region: string }): string` — deterministic, host-prefixed, no raw text (region is a structural fingerprint string the caller derives without sending text).
- `shouldCapture(s: { nowSig: string; lastSentSig: string | null; now: number; cooldownUntil: number; paused: boolean; routeCount: number; cap: number }): { capture: boolean; reason: string }`

- [ ] **Step 1: Write failing tests** — cover: sig stable for identical input, differs on host/title/counts/region change; `shouldCapture` returns false on equal sig, within cooldown, paused, routeCount>=cap; true otherwise. (Table-driven.)
- [ ] **Step 2: Run → FAIL** (`bun test packages/extension/src/feedback-trigger.test.ts`).
- [ ] **Step 3: Implement** the two pure functions (no DOM, no browser APIs).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(feedback): pure content-sig + shouldCapture gating helpers`.

---

### Task 2: `klavChangeDetector` in content.ts (3 guarded sources)

**Files:** Modify `packages/extension/src/content.ts`.

**Consumes:** `klavContentSig`, `shouldCapture` (Task 1). **Produces:** a detector that calls the existing capture+POST path with the richer sig.

- [ ] **Step 1:** Replace `klavDomSig` body with a `klavContentSig`-backed computation (gather host/title/counts/region from the DOM; assign to the existing `domSig` message field — no wire rename).
- [ ] **Step 2:** Add `klavChangeDetector` with: route hooks (reuse existing), `MutationObserver` (callback-throttled + ~1s debounce), `IntersectionObserver` (threshold 0.5 on content blocks). All sources funnel into one trailing-edge debounce.
- [ ] **Step 3:** Replace the `klavActivating` boolean with a **pending-latest slot**; compute sig **after** `captureVisibleTab` returns (abort/reschedule if the DOM changed during capture); add active-tab/visibility guard; gate via `shouldCapture`; arm cooldown + record `lastSentSig` + increment per-route count **only on confirmed server response**; reset per-route state + disconnect/re-arm observers on route change; suppress boot double-trigger.
- [ ] **Step 4: Verify** — `bun build`/typecheck the extension (per its build config); manual note that observers tear down (no accumulation).
- [ ] **Step 5: Commit** `feat(feedback): viewport-change detector (route + mutation + scroll), guarded`.

---

### Task 3: background.ts capture rate-limit + lastError

**Files:** Modify `packages/extension/src/background.ts`.

- [ ] **Step 1:** Add a global per-window minimum capture interval + `chrome.runtime.lastError` handling/backoff around `captureVisibleTab`; surface drops (don't silently null).
- [ ] **Step 2: Verify** build/typecheck.
- [ ] **Step 3: Commit** `fix(feedback): handle captureVisibleTab rate-limit + lastError`.

---

### Task 4: Server regression + same-sig dedup test

**Files:** Modify `prototype/lib/review-gate.test.ts`.

- [ ] **Step 1:** Add a test: two `/api/sim/review`-equivalent posts with the SAME contentSig for the same (sim, path) → second resolves `alreadyReviewed`; `tryConsumeReviewBudget` invoked at most once (spy/counter). Re-run existing gate-order + dedupe-key tests unchanged (regression gate proving the §5 contract holds with the richer opaque sig).
- [ ] **Step 2: Run → PASS** (`cd prototype && bun test lib/review-gate.test.ts`).
- [ ] **Step 3: Commit** `test(feedback): content-sig dedup spends budget once; gate contract unchanged`.

---

### Task 5: Housekeeping (version + changelog)

- [ ] **Step 1:** Bump 5 manifests + PRD + CHANGELOG (next minor; reconcile exact number at merge time). CHANGELOG entry: "Smart feedback triggering — Sims now react on route change, new dynamic content, and scroll-reveal (the homepage experience), with debounce + per-route cap + host-aware dedup so the same view isn't reviewed twice."
- [ ] **Step 2:** Full suite + extension build green.
- [ ] **Step 3: Commit** `chore: release <ver> — smart feedback triggering + dedup`.

## Self-Review Notes
Covers spec: scroll-reveal kept + guarded ✓ (T1 cap, T2 IO); host-prefixed structural sig ✓ (T1); pending-latest + sig-after-capture + confirmed-commit ✓ (T2); capture rate-limit ✓ (T3); server unchanged + dedup-once proof ✓ (T4); consent-safe (no text hash) ✓. Deferred: server image-hash (Approach C). No placeholders; pure logic carries real test code in T1.
