# Extension & Widget Modal Harmonization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `packages/core/src/modal.ts::buildModal` the single feature-complete report composer used by BOTH the embeddable widget and the Chrome extension, with the extension's rich capture (region/snippet, paste, auto-capture) ported in; route all extension submits through `/api/feedback` with the correct `project_id`.

**Architecture:** Additively extend `buildModal` with three capture features (region-select gesture, paste-image, auto-capture-on-open). Then replace the extension's bespoke `openModal()` with a `buildModal()` call, bridging capture to its service-worker `captureVisibleTab` via Promise-wrapped message round-trips (single-slot awaiter). Remove the extension's direct-tracker config so every submit goes through the Klavity backend; thread the active `project_id`.

**Tech Stack:** TypeScript monorepo (pnpm workspaces), `@klavity/core` shared lib, Vite (extension via `@crxjs/vite-plugin`; widget IIFE via `vite.widget.config.ts`), Vitest. Chrome extension MV3 (service worker + content script + shadow-DOM modal).

## Global Constraints

- **Do NOT regress the live widget.** `buildModal` is shipped in the lead-gen widget at prod `/widget.js`. All `buildModal` changes must be ADDITIVE — the widget's existing call `buildModal(type, {onCaptureFull, onRegionCapture, onSubmit, success}, modalConfig)` must keep working unchanged. After any `buildModal` change, rebuild the widget IIFE (`cd packages/sdk && vite build --config vite.widget.config.ts`) and keep `packages/sdk/src/widget-lib.test.ts` (successCopy, 3 tests) green.
- **Keep these tests green:** `packages/core/tests/{annotator,modal-theme,submit,crop}.test.ts`, `packages/extension/src/{auth,feedback-trigger,coexist}.test.ts`.
- **Single capture in flight:** the extension's `CAPTURE_TAB` round-trip must use a single-slot Promise awaiter (`let captureResolve: ((v:string)=>void)|null`) with a timeout guard (~2200ms, mirroring the existing fail-safe at `content.ts:354-360`). Never have two captures resolving the same message.
- **`onRegionCapture(rect)` receives CSS-pixel coords** (not DPR-scaled). The extension's callback does the DPR scaling before `cropDataUrl` (as `content.ts:470-474` does today).
- **SemVer lockstep on release:** bump `package.json` (`/`, core, extension, sdk) + `packages/extension/manifest.json` + `docs/PRD.md` + top `CHANGELOG.md` entry together. Re-check the next free version at release time (other sessions ship concurrently; master was 0.34.0 at planning time → likely 0.35.0).
- **Extension publish is MANUAL** (Chrome Web Store) — the plan builds `packages/extension/dist`; the user uploads it. The widget bundle + server DO deploy to prod (commit→push master→ssh pull+restart) and that makes the new `buildModal` live on the marketing-site widget.
- Reference: spec `docs/superpowers/specs/2026-06-21-extension-widget-modal-harmonization-design.md`; integration map `.git/sdd/modal-harmonization-map.md` (exact line refs).

---

### Task 1: `buildModal` — region/snippet capture gesture

**Files:**
- Modify: `packages/core/src/modal.ts` (add Region button to modal HTML ~line 108-109; add gesture handler near the full-capture handler ~225-227)
- Test: `packages/core/tests/modal.test.ts` (create)

**Interfaces:**
- Consumes: existing `callbacks.onRegionCapture?(rect: {x,y,w,h}): Promise<string>` (already in `ModalCallbacks`, line 17), `addScreenshot(dataUrl)`, the shadow host element.
- Produces: a `<button id="klavity-region">✂ Region</button>` shown only when `callbacks.onRegionCapture` is provided; on click it mounts a drag-select overlay, computes a CSS-pixel rect, calls `await callbacks.onRegionCapture(rect)`, re-shows the modal, and `addScreenshot(result)`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/modal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildModal } from '../src/modal'

beforeEach(() => { document.body.innerHTML = '' })

function q(ctrl: any, sel: string) { return ctrl.shadowRoot.querySelector(sel) as HTMLElement | null }

describe('buildModal region capture', () => {
  it('shows the Region button only when onRegionCapture is provided', () => {
    const withRegion = buildModal('bug', { onCaptureFull: async () => 'x', onRegionCapture: async () => 'r', onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    expect(q(withRegion, '#klavity-region')).not.toBeNull()
    withRegion.close()
    const without = buildModal('bug', { onCaptureFull: async () => 'x', onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    expect(q(without, '#klavity-region')).toBeNull()
    without.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/modal.test.ts`
Expected: FAIL — `#klavity-region` is null in the first case (button doesn't exist yet).

- [ ] **Step 3: Add the Region button + gesture handler**

In `packages/core/src/modal.ts`, after the Upload button (~line 109) add to the actions HTML:
```html
<button id="klavity-region" style="display:none">✂ Region</button>
```
After the modal is built, show it only when the callback exists, and wire the gesture. **Port the drag-select overlay from `packages/extension/src/content.ts:401-507`** (`startRegion`'s overlay div, the "Drag to select an area · Esc to cancel" hint, the `pointerdown`/`pointermove` 4-panel vignette, and the `pointerup` rect computation with the `w<8||h<8` cancel guard). Adapt it so that instead of the extension's `CAPTURE_TAB` plumbing, it calls the host callback:
```ts
const regionBtn = shadowRoot.getElementById('klavity-region') as HTMLButtonElement | null
if (regionBtn && callbacks.onRegionCapture) {
  regionBtn.style.display = ''
  regionBtn.onclick = () => {
    host.style.display = 'none'                       // hide the modal while selecting
    mountRegionOverlay(async (rect /* {x,y,w,h} CSS px */) => {
      try { const shot = await callbacks.onRegionCapture!(rect); if (shot) addScreenshot(shot) }
      finally { host.style.display = '' }             // always re-show
    })
  }
}
```
`mountRegionOverlay(onRect)` is the ported overlay (appends to `document.body`, resolves the CSS-pixel rect on `pointerup`, supports Esc-to-cancel which re-shows the modal without calling `onRect`). Keep coords in CSS pixels — the host callback handles DPR.

Add to the test the gesture behavior:
```ts
it('region click → overlay drag resolves onRegionCapture with a css-pixel rect, then addScreenshot', async () => {
  const onRegionCapture = vi.fn(async (_r: any) => 'data:image/png;base64,REGION')
  const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onRegionCapture, onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
  ;(q(ctrl, '#klavity-region') as HTMLButtonElement).click()
  const overlay = document.querySelector('[data-klavity-region-overlay]') as HTMLElement
  expect(overlay).not.toBeNull()
  overlay.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 20, bubbles: true }))
  overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 80, bubbles: true }))
  overlay.dispatchEvent(new PointerEvent('pointerup',   { clientX: 60, clientY: 80, bubbles: true }))
  await new Promise(r => setTimeout(r, 0))
  expect(onRegionCapture).toHaveBeenCalledWith({ x: 10, y: 20, w: 50, h: 60 })
  ctrl.close()
})
```
Give the overlay `el.setAttribute('data-klavity-region-overlay','')` so the test can target it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run tests/modal.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modal.ts packages/core/tests/modal.test.ts
git commit -m "feat(modal): region/snippet capture gesture in buildModal"
```

---

### Task 2: `buildModal` — paste-image support

**Files:**
- Modify: `packages/core/src/modal.ts` (register paste handler on mount near the Esc handler ~166-169; remove it in `close()` ~156-163)
- Test: `packages/core/tests/modal.test.ts` (extend)

**Interfaces:**
- Consumes: `addScreenshot`, `fileToDataUrl` (already imported/used in modal.ts for the upload path ~231-238).
- Produces: pasted images are added to the screenshot strip; the `document`-level `paste` listener is removed on `close()`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/tests/modal.test.ts`:
```ts
it('paste handler is registered on open and removed on close', () => {
  const addSpy = vi.spyOn(document, 'addEventListener')
  const remSpy = vi.spyOn(document, 'removeEventListener')
  const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
  expect(addSpy.mock.calls.some(c => c[0] === 'paste')).toBe(true)
  ctrl.close()
  expect(remSpy.mock.calls.some(c => c[0] === 'paste')).toBe(true)
  addSpy.mockRestore(); remSpy.mockRestore()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/modal.test.ts -t paste`
Expected: FAIL — no `paste` listener registered.

- [ ] **Step 3: Implement the paste handler** (port of `content.ts:391-399`)

In `modal.ts`, after the shadow DOM is mounted add:
```ts
const onPaste = (e: ClipboardEvent) => {
  if (!e.clipboardData) return
  for (const item of Array.from(e.clipboardData.items)) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile()
      if (blob) fileToDataUrl(blob).then(addScreenshot).catch(() => {})
    }
  }
}
document.addEventListener('paste', onPaste)
```
In `close()` (line ~156-163), before `host.remove()`, add: `document.removeEventListener('paste', onPaste)`. (If `fileToDataUrl` only accepts `File`, `getAsFile()` returns a `File` — compatible.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run tests/modal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modal.ts packages/core/tests/modal.test.ts
git commit -m "feat(modal): paste-image support in buildModal"
```

---

### Task 3: `buildModal` — `autoCaptureOnOpen` option

**Files:**
- Modify: `packages/core/src/modal.ts` (extend `ModalCallbacks` interface ~15-32; act on it after mount)
- Test: `packages/core/tests/modal.test.ts` (extend)

**Interfaces:**
- Produces: `ModalCallbacks` gains `autoCaptureOnOpen?: boolean`. When true, `buildModal` calls `callbacks.onCaptureFull()` once ~200ms after mount and pipes the result to `addScreenshot`. Default false (widget unaffected).

- [ ] **Step 1: Write the failing test**

```ts
it('autoCaptureOnOpen calls onCaptureFull once on mount', async () => {
  vi.useFakeTimers()
  const onCaptureFull = vi.fn(async () => 'data:image/png;base64,FULL')
  const ctrl = buildModal('bug', { onCaptureFull, autoCaptureOnOpen: true, onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
  await vi.advanceTimersByTimeAsync(250)
  expect(onCaptureFull).toHaveBeenCalledTimes(1)
  ctrl.close(); vi.useRealTimers()
})
it('without autoCaptureOnOpen, onCaptureFull is NOT called on mount', async () => {
  vi.useFakeTimers()
  const onCaptureFull = vi.fn(async () => 'x')
  const ctrl = buildModal('bug', { onCaptureFull, onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
  await vi.advanceTimersByTimeAsync(250)
  expect(onCaptureFull).not.toHaveBeenCalled()
  ctrl.close(); vi.useRealTimers()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/modal.test.ts -t autoCaptureOnOpen`
Expected: FAIL — `onCaptureFull` not called.

- [ ] **Step 3: Implement**

In `ModalCallbacks` (modal.ts ~15-32) add `autoCaptureOnOpen?: boolean`. After mount (after the strip/handlers are wired):
```ts
if (callbacks.autoCaptureOnOpen) {
  setTimeout(() => { callbacks.onCaptureFull().then(addScreenshot).catch(() => {}) }, 200)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run tests/modal.test.ts`
Expected: PASS (all modal tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modal.ts packages/core/tests/modal.test.ts
git commit -m "feat(modal): autoCaptureOnOpen option in buildModal"
```

---

### Task 4: Extension capture bridge — single-slot Promise awaiter

**Files:**
- Modify: `packages/extension/src/content.ts` (add the capture awaiter + `onCaptureFull`/`onRegionCapture` bridge functions; adapt the `CAPTURE_TAB_RESULT` handler ~642-656)
- Test: `packages/extension/src/content-capture.test.ts` (create — unit-test the awaiter in isolation)

**Interfaces:**
- Consumes: `sendToBackground({ kind: 'CAPTURE_TAB' })`, the `CAPTURE_TAB_RESULT` ContentMessage, `cropDataUrl` from `@klavity/core/crop`.
- Produces:
  - `captureFullViaSW(): Promise<string>` — hides nothing (caller/modal handles hide); sends `CAPTURE_TAB`, resolves the single-slot awaiter with the returned dataUrl (rejects on error/timeout).
  - `cropRegionViaSW(rect: {x,y,w,h}): Promise<string>` — sends `CAPTURE_TAB`, awaits the dataUrl, DPR-scales `rect`, `cropDataUrl(...)`, returns the cropped dataUrl.
  - A module-level `let captureResolve: ((v: string) => void) | null` + `let captureReject` set/cleared atomically with a ~2200ms timeout guard.

- [ ] **Step 1: Write the failing test**

Create `packages/extension/src/content-capture.test.ts`. Export the awaiter primitives from content.ts (or a small new `capture-bridge.ts` it imports) so they're testable without the DOM. Recommended: factor the awaiter into `packages/extension/src/capture-bridge.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { makeCaptureAwaiter } from './capture-bridge'

describe('capture awaiter (single-slot)', () => {
  it('resolves the in-flight capture when settle() is called', async () => {
    const sent: any[] = []
    const a = makeCaptureAwaiter({ send: (m) => sent.push(m), timeoutMs: 50 })
    const p = a.captureFull()
    expect(sent).toEqual([{ kind: 'CAPTURE_TAB' }])
    a.settle('data:image/png;base64,OK')
    await expect(p).resolves.toBe('data:image/png;base64,OK')
  })
  it('rejects on timeout when no settle arrives', async () => {
    const a = makeCaptureAwaiter({ send: () => {}, timeoutMs: 10 })
    await expect(a.captureFull()).rejects.toBeTruthy()
  })
  it('rejects a second concurrent capture (single in flight)', async () => {
    const a = makeCaptureAwaiter({ send: () => {}, timeoutMs: 1000 })
    const p1 = a.captureFull()
    await expect(a.captureFull()).rejects.toThrow(/in flight/i)
    a.settle('x'); await expect(p1).resolves.toBe('x')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm vitest run src/content-capture.test.ts`
Expected: FAIL — `./capture-bridge` / `makeCaptureAwaiter` does not exist.

- [ ] **Step 3: Implement `capture-bridge.ts`**

Create `packages/extension/src/capture-bridge.ts`:
```ts
export interface CaptureAwaiter {
  captureFull(): Promise<string>
  settle(dataUrl: string, error?: string): void
}
export function makeCaptureAwaiter(opts: { send: (m: { kind: 'CAPTURE_TAB' }) => void; timeoutMs?: number }): CaptureAwaiter {
  let resolve: ((v: string) => void) | null = null
  let reject: ((e: Error) => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => { if (timer) clearTimeout(timer); timer = null; resolve = null; reject = null }
  return {
    captureFull() {
      if (resolve) return Promise.reject(new Error('a capture is already in flight'))
      return new Promise<string>((res, rej) => {
        resolve = res; reject = rej
        timer = setTimeout(() => { const r = reject; clear(); r?.(new Error('capture timed out')) }, opts.timeoutMs ?? 2200)
        opts.send({ kind: 'CAPTURE_TAB' })
      })
    },
    settle(dataUrl, error) {
      const res = resolve, rej = reject; clear()
      if (error || !dataUrl) rej?.(new Error(error || 'capture failed')); else res?.(dataUrl)
    },
  }
}
```

In `content.ts`, instantiate one awaiter `const captureAwaiter = makeCaptureAwaiter({ send: (m) => sendToBackground(m) })`, and in the `CAPTURE_TAB_RESULT` handler (~642-656) call `captureAwaiter.settle(msg.dataUrl, msg.error)` (replacing the old `pendingFullCapture`/CustomEvent fan-out). Build `onCaptureFull` and `onRegionCapture`:
```ts
const onCaptureFull = async () => captureAwaiter.captureFull()
const onRegionCapture = async (rect: { x: number; y: number; w: number; h: number }) => {
  const full = await captureAwaiter.captureFull()
  const dpr = window.devicePixelRatio || 1
  return cropDataUrl(full, { x: rect.x*dpr, y: rect.y*dpr, w: rect.w*dpr, h: rect.h*dpr }, window.scrollX*dpr, window.scrollY*dpr)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && pnpm vitest run src/content-capture.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/capture-bridge.ts packages/extension/src/content-capture.test.ts packages/extension/src/content.ts
git commit -m "feat(ext): single-slot capture awaiter bridging SW captureVisibleTab"
```

---

### Task 5: Extension `openModal` → `buildModal`

**Files:**
- Modify: `packages/extension/src/content.ts` (replace `openModal()` body ~173-273; remove the now-dead bespoke modal HTML/CSS/handlers it owned; adapt `SUBMIT_SUCCESS`/`SUBMIT_ERROR` handlers ~659-673; route `closeModal` to `controller.close()`)

**Interfaces:**
- Consumes: `buildModal` from `@klavity/core/modal`; `onCaptureFull`/`onRegionCapture` (Task 4); a fetched `ModalConfig`.
- Produces: the extension's report composer IS `buildModal`. `onSubmit` resolves a Promise wrapped around the `SUBMIT_REPORT`→`SUBMIT_SUCCESS`/`SUBMIT_ERROR` round-trip.

- [ ] **Step 1: Implement the migration** (no new unit test — DOM/SW integration; covered by build + the awaiter test + manual smoke)

Replace `openModal(type)` body with:
```ts
import { buildModal, type ModalController } from '@klavity/core/modal'
import { resolveModalConfig } from '@klavity/core/modal-theme'

let modalCtrl: ModalController | null = null
async function openModal(type: ReportType) {
  if (modalCtrl) return
  // fetch per-project appearance config (best-effort)
  let config = {}
  try {
    const proj = klavMatchProject(location.href)          // existing helper
    if (proj?.id && klavSettings?.backendUrl) {
      const r = await fetch(`${klavSettings.backendUrl}/api/projects/${encodeURIComponent(proj.id)}/config`)
      if (r.ok) config = resolveModalConfig((await r.json()).modalConfig || {})
    }
  } catch {}
  modalCtrl = buildModal(type, {
    autoCaptureOnOpen: true,
    onCaptureFull,
    onRegionCapture,
    onSubmit: (p) => submitViaSW(p),     // Promise around SUBMIT_REPORT round-trip (Task 6 threads project_id)
  }, config)
}
function closeModal() { modalCtrl?.close(); modalCtrl = null }
```
Delete the bespoke modal CSS/HTML/handlers that `openModal` previously owned (the warm-beige composer, its `updateStrip`, `captureFullPage`, `startRegion`, `handlePaste`, annotator editor duplicate, and the `SUBMIT_SUCCESS` innerHTML card) — `buildModal` owns all of these now. Keep the contextmenu trigger, Sims activation stack (`klavBootstrap`/`maybeActivate`/`KLAV_REVIEW`), `getHost`, and the SW message bridge. The `SUBMIT_SUCCESS`/`SUBMIT_ERROR` handlers now resolve/reject the `submitViaSW` Promise instead of rendering DOM.

- [ ] **Step 2: Build the extension to verify it compiles + bundles**

Run: `cd packages/extension && pnpm vitest run && vite build`
Expected: existing tests green; `vite build` produces `dist/` with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/content.ts
git commit -m "feat(ext): use shared buildModal as the report composer (theming + region + paste + autocapture)"
```

---

### Task 6: Thread `project_id` to `/api/feedback` (D1) + Klavity-only submit

**Files:**
- Modify: `packages/core/src/types.ts` (add `projectId?` to the submit payload), `packages/core/src/integrations/backend.ts` (append `project_id`), `packages/extension/src/content.ts` (`submitViaSW` includes the matched project), `packages/extension/src/background.ts` (`SUBMIT_REPORT` passes only `{ backend }` handler / ensures Klavity mode)
- Test: `packages/core/tests/submit.test.ts` (extend — backend submit includes project_id when provided)

**Interfaces:**
- Consumes: `klavMatchProject(url)` (content.ts), `klavConfig` projects.
- Produces: `SubmitReportPayload` gains `projectId?: string`; `backend.ts` appends `form.append('project_id', config.projectId)` when present; the extension always routes to the backend handler.

- [ ] **Step 1: Write the failing test**

In `packages/core/tests/submit.test.ts` add a case asserting the backend handler receives/forwards `project_id`. Use the existing test's mock-fetch pattern; assert the posted FormData contains `project_id` when `payload.projectId` is set, and routes to `backend` (never jira/linear) when `backendUrl` is set.

```ts
it('backend submit includes project_id and never routes to a direct tracker', async () => {
  const calls: Record<string, boolean> = {}
  const backend = vi.fn(async (cfg: any) => { calls.backend = true; expect(cfg.projectId).toBe('proj_X'); return { issueKey: '1', issueUrl: '' } })
  const jira = vi.fn(async () => { calls.jira = true; return { issueKey: 'J', issueUrl: '' } })
  await dispatchSubmit(
    { type: 'bug', description: 'd', context: { pageUrl: 'https://x' } as any, screenshots: [], projectId: 'proj_X' } as any,
    { ...DEFAULT_SETTINGS, backendUrl: 'https://k', connectionMode: 'klavity', klavToken: 't' },
    { backend, jira } as any,
  )
  expect(calls.backend).toBe(true); expect(calls.jira).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/submit.test.ts -t project_id`
Expected: FAIL — `projectId` not on the payload / not forwarded.

- [ ] **Step 3: Implement**

- `types.ts`: add `projectId?: string` to `SubmitReportPayload` (and thread into `IntegrationConfig` if `submitReport` reads from there).
- `backend.ts` (`submitReport`): in Klavity mode, `if (config.projectId) form.append('project_id', config.projectId)`.
- `content.ts` `submitViaSW(p)`: set `payload.projectId = klavMatchProject(location.href)?.id` before sending `SUBMIT_REPORT` (or let the SW do it — pick the content script since it already has `klavMatchProject`).
- `background.ts` `SUBMIT_REPORT`: ensure the handler map passed to `dispatchSubmit` routes Klavity-mode submits to `backend` (it already does when `backendUrl` set). No direct-tracker dependency for the extension's default path.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run tests/submit.test.ts`
Expected: PASS (existing 3 + new).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/integrations/backend.ts packages/extension/src/content.ts packages/extension/src/background.ts packages/core/tests/submit.test.ts
git commit -m "feat: thread project_id to /api/feedback; extension submits route through Klavity backend"
```

---

### Task 7: Options — remove direct-tracker config, keep Klavity Cloud

**Files:**
- Modify: `packages/extension/src/options.html` (remove the Jira/Linear/GitHub/Plane-direct + integration-select + smart-url sections — `options.html:71-110`), `packages/extension/src/options.ts` (remove their load/save handlers — `options.ts:36-48,76-98`)

**Interfaces:**
- Produces: Options shows only Klavity Cloud connect (toggle + backend URL + OTP sign-in), the personal Plane connector, autoFileErrors, Sims toggle, and Test buttons. A one-time note explains trackers are configured as Klavity connectors in the dashboard.

- [ ] **Step 1: Remove the direct sections** (per the integration map's options table)

In `options.html` delete the `#integration` select, `#jira-section`, `#linear-section`, `#github-section`, `#plane-section` (direct), and `#smart-url`. Add a short note: `<p class="hint">Your tracker (Jira/Linear/GitHub/Plane) is now connected once in the Klavity dashboard under Connectors.</p>`. In `options.ts` remove the corresponding load/save lines (`36-48`, `76-98`) and any now-unused imports (e.g. `detectTrackerUrl`). KEEP: cloud toggle, backendUrl, OTP sign-in, personal Plane connector, test/testTicket, autoFileErrors, Sims.

- [ ] **Step 2: Build + tests**

Run: `cd packages/extension && pnpm vitest run && vite build`
Expected: tests green; build clean (no references to removed elements).

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/options.html packages/extension/src/options.ts
git commit -m "feat(ext): Klavity-only options — drop direct tracker config (trackers via dashboard connectors)"
```

---

### Task 8: Rebuild widget IIFE + verify no widget regression

**Files:**
- Modify: `packages/sdk/dist/klavity-widget.iife.js` (regenerated)

**Interfaces:**
- Consumes: the changed `buildModal`.
- Produces: a rebuilt widget bundle that still works (widget's existing `buildModal` call unchanged; region/paste/autocapture are additive and off unless the widget opts in).

- [ ] **Step 1: Rebuild + verify**

```bash
cd packages/sdk && pnpm vitest run && vite build --config vite.widget.config.ts
grep -c "Powered by" dist/klavity-widget.iife.js   # ≥1
grep -c "api/widget/lead" dist/klavity-widget.iife.js   # ≥1 (lead-gen still wired)
```
Expected: `widget-lib.test.ts` green (3); bundle rebuilt with markers present. The widget does not pass `onRegionCapture`/`autoCaptureOnOpen`, so its behavior is unchanged (region button hidden, no auto-capture).

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/dist/klavity-widget.iife.js
git commit -m "build(sdk): rebuild widget IIFE after buildModal harmonization"
```

---

### Task 9: Release + deploy + manual extension publish

**Files:**
- Modify: `package.json` (`/`, core, extension, sdk), `packages/extension/manifest.json`, `docs/PRD.md`, `CHANGELOG.md`

- [ ] **Step 1: Full suites green**

```bash
cd packages/core && pnpm vitest run
cd ../extension && pnpm vitest run
cd ../sdk && pnpm vitest run
cd ../../prototype && bun test
```
Expected: all green.

- [ ] **Step 2: SemVer lockstep bump** (re-check next free version — likely `0.35.0`)

Set the new version in the four `package.json` + `packages/extension/manifest.json` + `docs/PRD.md`; add a `## [0.35.0]` CHANGELOG entry: harmonized the extension & widget on one `buildModal` (region/snippet capture, paste, auto-capture, theming, custom thank-you in the extension); extension submits route through `/api/feedback` with `project_id`; direct-tracker config removed (trackers via dashboard connectors).

- [ ] **Step 3: Commit, push, deploy (widget/server), build extension dist for manual upload**

```bash
git add -A package.json packages/*/package.json packages/extension/manifest.json docs/PRD.md CHANGELOG.md
git commit -m "release(0.35.0): harmonized extension & widget report modal"
git fetch origin master && git merge-base --is-ancestor origin/master HEAD || git merge origin/master --no-edit
git push origin HEAD:master
# deploy server + widget bundle:
ssh root@66.135.20.62 'cd /opt/klav && sudo -u klav git fetch origin master && sudo -u klav git reset --hard origin/master && systemctl restart klav'
# build the extension artifact for the user to upload to the Chrome Web Store:
cd packages/extension && vite build   # → packages/extension/dist
```
Print an IST timestamp. Poll `https://klavity.quantana.top/` for 200 and verify `/widget.js` still serves + the lead-gen widget still themes/submits (the harmonized buildModal is now live for the widget).

- [ ] **Step 4: Hand off the extension build**

Tell the user: the extension `dist/` is built and must be uploaded to the Chrome Web Store dev console (manual). The widget + server are auto-deployed.

---

## Self-Review

**Spec coverage:**
- Harmonize on buildModal superset → Tasks 1-3 (region/paste/autocapture) + Task 5 (extension uses it). ✓
- Markup (annotator) + snippet/region capture as first-class → already shared (annotator) + Task 1 (region). ✓
- Klavity-only submission → Tasks 6 (route via backend) + 7 (remove direct config). ✓
- project_id (D1) → Task 6. ✓
- Themed composer + custom thank-you in extension → Task 5 (fetch config + pass to buildModal; buildModal already renders thankYou). ✓
- No widget regression → Global Constraints + Task 8 (rebuild + verify). ✓
- Tests → each buildModal feature (Tasks 1-3), awaiter (Task 4), submit routing/project_id (Task 6); keep existing green. ✓
- Out-of-scope items (lead-gen/Powered-by in ext, cred migration, manual dedup) → not built. ✓

**Placeholder scan:** Region-gesture porting references `content.ts:401-507` (existing reviewed code the implementer reads) rather than inlining 100+ lines — acceptable for a port; the new/critical logic (awaiter, paste, autocapture, project_id) is inlined. No TBD/TODO.

**Type consistency:** `onRegionCapture(rect:{x,y,w,h})` CSS-pixel contract consistent (Task 1 ↔ Task 4). `autoCaptureOnOpen` on `ModalCallbacks` consistent (Task 3 ↔ Task 5). `projectId` on `SubmitReportPayload`/`IntegrationConfig` consistent (Task 6). `makeCaptureAwaiter`/`captureFull`/`settle` consistent (Task 4).

## Notes for the executor
- Tasks 1-3 are isolated `buildModal` additions — safest to do first and keep the widget green throughout (re-run `widget-lib.test.ts` after each).
- Task 5 is the largest/riskiest (deleting ~1000 lines of bespoke composer). Work carefully; the awaiter (Task 4) must land first.
- Deploy (Task 9 Step 3) makes the new buildModal LIVE on the marketing-site widget — treat as a gated checkpoint; verify the widget still themes + submits before/after.
