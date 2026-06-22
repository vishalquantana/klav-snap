# sims-live.ts — Manual Verification Report
**Date:** 2026-06-23  
**Branch:** feat/sims-live-verify (read-only; no changes to sims-live.ts)  
**Method:** Built `packages/sdk/src/sims-live.ts` → IIFE via `bun build`, injected into a blank HTML page, exercised every public API call from the browser console.

---

## What Works ✅

| Test | Result |
|---|---|
| `window.KlavitySims` installs | 3 methods present: `deploy`, `renderFeedback`, `undeploy` |
| `deploy(["sim_sc"], [{id,name,initials,accent}])` | Host mounts `position:fixed; bottom:20px; right:20px; z-index:2147483647`; SC avatar renders with indigo head, eyes, legs, jump-in animation |
| `deploy('all', [sc, mw])` | Both SC (indigo) and MW (red) appear side-by-side; stagger animation correct |
| `deploy(["sim_sc"], [sc, mw])` — ID filter | Only SC shown; MW excluded correctly |
| `renderFeedback(id, name, [{observation, sentiment:"negative", severity:"high"}])` | Dark bubble appears above avatar; name bold, "HIGH" badge (red), observation text, close ×, tail arrow; `ksl-bubble-in` animation fires |
| Bubble close × | Dismisses with `ksl-bubble-out` animation; no orphan DOM |
| Dock hover close-all ✕ | Calls `undeploy()` correctly; host + dock fully removed |
| `undeploy()` | `#klav-sims-live` removed from DOM; simSlots cleared; `window.KlavitySims` remains accessible for re-deploy |
| Re-deploy after undeploy | Clean mount, no stale state |
| `renderFeedback` after `undeploy` | Silent no-op, no throw |
| Host `pointer-events` | `none` on the host — dock overlay does NOT block page interaction |
| Dock `pointer-events` | `auto` — dock itself is clickable |

---

## Findings / Gaps for Dev 2

### 🔴 Gap 1 — `sims-live.ts` is NOT imported into the widget bundle (BLOCKER for Dev 6)

`packages/sdk/src/widget.ts` does not import `sims-live.ts`. When the live `klavity-widget.iife.js` loads, `window.KlavitySims` is `undefined`. Dev 6's right-click "Deploy Sims" menu will get `TypeError: window.KlavitySims.deploy is not a function`.

**Fix needed in `widget.ts` (Dev 2's file):**
```ts
import { installKlavitySims } from './sims-live'
installKlavitySims()
```
or simply:
```ts
import './sims-live'   // auto-installs via the side-effecting bottom line
```

---

### 🔴 Gap 2 — `deploy(simIds)` without `sims` param mounts an invisible empty dock

**Reproduce:** `window.KlavitySims.deploy(["sim_sc"])` — no second argument.

**Result:** Host element IS mounted in the DOM, dock element IS created, but zero `.ksl-slot` children. The dock is completely invisible to the user (nothing to see) yet `#klav-sims-live` sits in the DOM consuming a z-index layer.

**Root cause:** `sims` param defaults to `[]`; `visibleSims = [].filter(...)` → `[]`; `shown = [].slice(0,6)` → `[]`; loop never runs.

**Risk:** If Dev 6 calls `deploy(selectedIds)` before the `/api/personas` fetch returns (or forgets the second arg), users see a blank screen with no feedback and no error.

**Suggested fix (in `deploy()`):**
```ts
if (shown.length === 0) {
  console.warn('[KlavitySims] deploy() called with no matching sim descriptors — nothing to show.')
  undeploy()
  return
}
```

---

### 🟡 Gap 3 — `renderFeedback` `observation` key vs orchestrator's `text` key

The `LiveObservation` interface uses `observation: string`. The orchestrator's specified test call was:
```js
renderFeedback("id", "Sarah Chen", [{ text: "Pricing is unclear", sentiment: "negative" }])
```

**Result:** Bubble renders with name "Sarah Chen" but **blank observation text** — the `text` field is silently ignored.

**This is not a bug in `sims-live.ts`** — the interface is correctly typed as `observation`. However, **Dev 4 (`sims-watch.ts`)** must map `/api/sim/review` response fields directly as `observation` (the API response already uses `observation` key, confirmed in `server.ts`). No change needed to `sims-live.ts`; this is a documentation note so Dev 4 doesn't make the same mapping mistake.

If Dev 2 wants to be defensive against callers using the wrong key:
```ts
const text = first.observation || (first as any).text || ''
```

---

### 🟡 Gap 4 — No console warning when `renderFeedback` called for an unregistered simId

**Reproduce:** `renderFeedback("sim_unknown", "Ghost", [{observation:"test"}])`

**Result:** Silent no-op (correct guard: `if (!slot) return`). But no dev-facing warning, which will make Dev 4 integration debugging harder.

**Suggested fix:** `console.warn('[KlavitySims] renderFeedback: no slot for simId', simId)` before the early return.

---

## Summary

The core presence layer is solid. The dock renders correctly, avatars jump in, speech bubbles display with correct name/severity/text/animation, close buttons work, undeploy is clean, re-deploy is clean. Two things block integration: **Gap 1** (widget bundle doesn't load `sims-live.ts`) and **Gap 2** (empty deploy is silent). Both are small fixes for Dev 2.
