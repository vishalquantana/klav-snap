# Task 3 Report — Extension yields to embedded widget (DOM handshake)

## Rationale: `coexist.ts` extraction

The brief originally asked to export `widgetPresent` from `content.ts`, but `content.ts` carries top-level side effects at module scope (window.fetch override ~line 117, `chrome.runtime.onMessage.addListener` ~line 641, `document.addEventListener('contextmenu', …)` ~line 826). Importing that module in a test environment would throw because `chrome`, `document`, etc. are not available without extensive mocking. A side-effect-free `coexist.ts` with a single exported function avoids that entire problem, keeps the unit test minimal, and gives a clean home for future widget-coexistence logic.

---

## TDD evidence

### RED

File `coexist.test.ts` written first; `coexist.ts` did not exist.

```
npx vitest run src/coexist.test.ts
PASS (0)  FAIL (0)
→ Failed to load url ./coexist … Does the file exist?
```

Suite failed to load (module not found) — correct RED state.

### GREEN

`coexist.ts` created with `widgetPresent()`.

```
npx vitest run src/coexist.test.ts
PASS (2)  FAIL (0)
```

Both cases pass: `false` when `getElementById` returns null, `true` when it returns the host element.

### Full suite — no regressions

```
npx vitest run
PASS (46)  FAIL (0)
```

All 46 tests across `auth.test.ts`, `feedback-trigger.test.ts`, and `coexist.test.ts` pass.

---

## Files changed

| File | Change |
|---|---|
| `packages/extension/src/coexist.ts` | **New** — pure, side-effect-free `widgetPresent()` |
| `packages/extension/src/coexist.test.ts` | **New** — 2 unit tests (globalThis stub pattern) |
| `packages/extension/src/content.ts` | **Modified** — import + guard in `handleContextMenu` + teardown listener |

---

## `content.ts` insertion points

### 1. Import (line 5, after existing imports)

```ts
import { widgetPresent } from './coexist'
```

### 2. `handleContextMenu` guard (after `isContextValid()` check, before `e.preventDefault()`)

Lines ~811–825 (original ~810–822). Inserted between the `isContextValid()` early-return block and the `e.shiftKey || nativeMenuPending` check:

```ts
if (widgetPresent()) return // widget present → pass through to native menu; widget owns reporting
```

This ensures right-click passes through to the browser's native context menu whenever the embedded widget is present. Only the REPORT path is affected; analyze and Sims-review paths are untouched.

### 3. Teardown listener (after `document.addEventListener('contextmenu', handleContextMenu)`, before LIVE ACTIVATION block)

```ts
// If the widget announces itself after we initialised, tear down our report UI; widget wins.
document.addEventListener('klavity:widget-ready', () => {
  closeCtxMenu()
  if (shadowRoot?.querySelector('.klavity-overlay')) closeModal()
})
```

`closeCtxMenu()` (line ~716) removes `ctxMenuEl`. `closeModal()` (line ~274) calls `shadowRoot?.replaceChildren()` — guarded by the `.klavity-overlay` check so it only fires if the report modal is actually open.

---

## Constraints met

- Only the extension's REPORT entry point (right-click context menu) yields. Analyze/Sims-review paths untouched.
- TDD: RED → GREEN documented.
- `content.ts` wiring is minimal and correct (3 surgical edits).
- No jsdom; test uses `globalThis` stub pattern matching `auth.test.ts`.
