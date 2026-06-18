# Ad-hoc "Analyze this page" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user run their project's Sims on the current tab with one popup click, regardless of the admin allowlist.

**Architecture:** Reuse the existing review pipeline end-to-end. The popup sends a new `KLAV_ADHOC_REVIEW` message to the content script, which (after a one-time per-domain confirm) captures the viewport and POSTs the existing `KLAV_REVIEW` with a new `adhoc: true` flag. The server's pure `reviewGate` gains an `adhoc` branch that bypasses the passive-monitoring gates (pause/consent/allowlist/dedupe) but still enforces auth + daily budget.

**Tech Stack:** TypeScript, Bun (server, `prototype/`), Vite + Chrome MV3 (extension, `packages/extension/`), Vitest (extension tests), `bun test` (server tests).

## Global Constraints

- No new runtime dependencies.
- Match existing code style; reuse existing helpers (`klavCapture`, `klavSend`, `klavRenderBubble`, `klavNotice`, `klavRenderIndicator`, `klavGetHost`, `klavDomSig`).
- Per-domain ad-hoc consent stored in `chrome.storage.local.klavAdhocDomains: string[]` (per browser).
- Server endpoint is `POST /api/sim/review` (the background SW already targets this — `background.ts:219`).
- Ad-hoc bypasses the global `klavSimsEnabled` kill-switch by design (explicit user action handled outside `maybeActivate`).
- Run implementation in an isolated git worktree off the current committed HEAD (a concurrent session has uncommitted edits to `prototype/server.ts`); merge back cleanly.

---

### Task 1: `reviewGate` ad-hoc bypass (pure function)

**Files:**
- Modify: `prototype/lib/db.ts:1352-1370` (`ReviewGateInput`, `reviewGate`)
- Test: `prototype/lib/review-gate.test.ts`

**Interfaces:**
- Produces: `reviewGate(i: ReviewGateInput)` where `ReviewGateInput` now includes `adhoc?: boolean`. When `adhoc` is true the gate returns `{ ok: true }` for an authenticated caller with budget, regardless of `reviewMode`, `consentStatus`, `allowlistMatch`, `alreadyReviewed`; it returns `unauthorized` (401) when `!authed` and `budgetExhausted` (429) when `!budgetConsumed`.

- [ ] **Step 1: Write the failing tests**

Add to `prototype/lib/review-gate.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { reviewGate } from './db'

const base = {
  authed: true,
  reviewMode: 'auto' as string | null,
  consentStatus: 'granted' as string | null,
  allowlistMatch: true,
  alreadyReviewed: false,
  budgetConsumed: true,
}

test('adhoc bypasses allowlist, consent, pause and dedupe when authed + budget', () => {
  const r = reviewGate({
    ...base,
    adhoc: true,
    reviewMode: 'paused',
    consentStatus: null,
    allowlistMatch: false,
    alreadyReviewed: true,
  })
  expect(r.ok).toBe(true)
})

test('adhoc still blocks when not authed', () => {
  const r = reviewGate({ ...base, adhoc: true, authed: false })
  expect(r).toEqual({ ok: false, reason: 'unauthorized', status: 401, message: 'Sign in to continue.' })
})

test('adhoc still blocks when budget exhausted', () => {
  const r = reviewGate({ ...base, adhoc: true, allowlistMatch: false, budgetConsumed: false })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.reason).toBe('budgetExhausted')
})

test('non-adhoc behaviour unchanged (off-allowlist still blocks)', () => {
  const r = reviewGate({ ...base, allowlistMatch: false })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.reason).toBe('offAllowlist')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd prototype && bun test review-gate.test.ts`
Expected: the three `adhoc` tests FAIL (gate has no `adhoc` field yet); the "non-adhoc" test passes.

- [ ] **Step 3: Implement the gate change**

In `prototype/lib/db.ts`, add `adhoc?: boolean` to `ReviewGateInput`:

```ts
export type ReviewGateInput = {
  authed: boolean
  reviewMode: string | null            // project's review_mode ('auto'|'ready'|'paused')
  consentStatus: string | null         // caller's monitoring_consent status ('granted'|'paused'|'revoked'|null)
  allowlistMatch: boolean              // url matched an ENABLED monitored pattern
  alreadyReviewed: boolean             // (sim,urlPath,domSig) dedupe hit
  budgetConsumed: boolean              // tryConsumeReviewBudget succeeded (a slot was taken)
  adhoc?: boolean                      // explicit user-initiated "Analyze this page" — bypasses passive gates
}
```

Then add the bypass at the TOP of `reviewGate`, right after the auth gate:

```ts
export function reviewGate(i: ReviewGateInput): ReviewGateResult {
  if (!i.authed) return { ok: false, reason: "unauthorized", status: 401, message: "Sign in to continue." }
  // Ad-hoc "Analyze this page" is an explicit, user-initiated one-shot review. It bypasses the passive-
  // monitoring gates (admin/user pause, consent, allowlist, dedupe) — the extension's per-domain confirm
  // covers consent — but the daily budget cost guard (gate f) still applies.
  if (i.adhoc) {
    if (!i.budgetConsumed) return { ok: false, reason: "budgetExhausted", status: 429, message: "The project's daily review budget is exhausted; reviews were auto-paused." }
    return { ok: true }
  }
  if (i.reviewMode === "paused") return { ok: false, reason: "paused", status: 423, message: "Reviews are paused for this project by an admin." }
  if (i.consentStatus === "paused" || i.consentStatus === "revoked") return { ok: false, reason: "userPaused", status: 423, message: "You have paused Sim reviews. Resume to continue." }
  if (i.consentStatus !== "granted") return { ok: false, reason: "needsConsent", status: 412, message: "Consent is required before Sims can review pages you visit." }
  if (!i.allowlistMatch) return { ok: false, reason: "offAllowlist", status: 403, message: "This URL is not on the project's monitored allowlist." }
  if (i.alreadyReviewed) return { ok: false, reason: "alreadyReviewed", status: 200, message: "This page was already reviewed." }
  if (!i.budgetConsumed) return { ok: false, reason: "budgetExhausted", status: 429, message: "The project's daily review budget is exhausted; reviews were auto-paused." }
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd prototype && bun test review-gate.test.ts`
Expected: PASS (all gate tests).

- [ ] **Step 5: Run the full prototype suite (no regressions)**

Run: `cd prototype && bun test`
Expected: all pass (was 116 pass / 0 fail).

- [ ] **Step 6: Commit**

```bash
git add prototype/lib/db.ts prototype/lib/review-gate.test.ts
git commit -m "feat(review): reviewGate adhoc bypass (auth+budget only)"
```

---

### Task 2: Server review route `adhoc` branch

**Files:**
- Modify: `prototype/server.ts:995-1044` (the `/api/sim/review` handler)

**Interfaces:**
- Consumes: `reviewGate({ ..., adhoc })` from Task 1.
- Produces: `POST /api/sim/review` accepts `{ adhoc?: boolean }`. When `adhoc` is true the handler REQUIRES `projectId` (no allowlist to resolve from), and passes `adhoc` into both `reviewGate` calls so allowlist/consent/dedupe are bypassed but budget is consumed.

- [ ] **Step 1: Read the current handler**

Read `prototype/server.ts:995-1044` to confirm the lines below still match (a concurrent session may have shifted them; match on the code text, not line numbers).

- [ ] **Step 2: Add the `adhoc` flag and require a project**

After `const reqSimIds ...` (≈`server.ts:1000`) add:

```ts
        const adhoc = body.adhoc === true
```

Change the no-project error (≈`server.ts:1017`) so ad-hoc gives a clear message:

```ts
        if (!projectId) return json({ ok: false, reason: "unauthorized", error: adhoc ? "Pick a project to analyze this page." : "No accessible project for this URL." }, 401)
```

- [ ] **Step 3: Pass `adhoc` into both gate evaluations**

The pre-check (≈`server.ts:1036`):

```ts
        const pre = reviewGate({ authed: true, reviewMode, consentStatus, allowlistMatch: !!allowlist, alreadyReviewed: allSeen, budgetConsumed: true, adhoc })
```

The final gate after consuming budget (≈`server.ts:1044`):

```ts
        const gate = reviewGate({ authed: true, reviewMode, consentStatus, allowlistMatch: !!allowlist, alreadyReviewed: allSeen, budgetConsumed, adhoc })
```

- [ ] **Step 4: Write an integration test for the route**

Add to the prototype review-route test file (find the existing one that exercises `/api/sim/review`; if none exists, add `prototype/server.review-adhoc.test.ts` modeled on `prototype/server.connectors.test.ts`'s setup). Assert: with a member who has budget and a NON-allowlisted URL, `POST /api/sim/review` `{ adhoc:true, projectId, url, screenshotDataUrl }` returns `ok:true` (not `offAllowlist`/`needsConsent`); and the same request WITHOUT `projectId` returns 401.

```ts
// Pseudocode shape — mirror the harness in server.connectors.test.ts (in-memory DB, seeded member,
// project with no monitored_urls, a 1x1 png data URL). Key assertions:
// 1) adhoc on an off-allowlist URL with budget → res.ok === true, body.reviews is an array
// 2) adhoc without projectId → res.status === 401, body.reason === 'unauthorized'
```

- [ ] **Step 5: Run the route test + full suite**

Run: `cd prototype && bun test`
Expected: new test PASS; all others PASS.

- [ ] **Step 6: Commit**

```bash
git add prototype/server.ts prototype/server.review-adhoc.test.ts
git commit -m "feat(review): /api/sim/review accepts adhoc flag (off-allowlist analyze)"
```

---

### Task 3: Background relays the `adhoc` flag

**Files:**
- Modify: `packages/extension/src/background.ts:215-233` (`KLAV_REVIEW` handler)
- Modify: the `BackgroundMessage` type (search the repo for the `KLAV_REVIEW` variant — likely `packages/core/src` or a `types` file imported by `background.ts`).

**Interfaces:**
- Consumes: `msg.adhoc` on the `KLAV_REVIEW` message.
- Produces: the POST body to `/api/sim/review` includes `adhoc`.

- [ ] **Step 1: Add `adhoc` to the forwarded body**

In `background.ts:222`, change the body to forward `adhoc`:

```ts
          body: JSON.stringify({ projectId: msg.projectId, url: msg.url, domSig: msg.domSig, screenshotDataUrl: msg.screenshotDataUrl, adhoc: (msg as any).adhoc === true }),
```

- [ ] **Step 2: Type the new field**

Find the `BackgroundMessage` union's `KLAV_REVIEW` member (e.g. `{ kind: 'KLAV_REVIEW'; projectId: string; url: string; domSig: string | null; screenshotDataUrl: string }`) and add `adhoc?: boolean`. Then drop the `(msg as any)` cast in Step 1, using `msg.adhoc === true`.

- [ ] **Step 3: Build to verify types**

Run: `cd packages/extension && npm run build`
Expected: build succeeds, no new errors.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/background.ts packages/core/src
git commit -m "feat(ext): background relays adhoc flag to /api/sim/review"
```

---

### Task 4: Content script — `KLAV_ADHOC_REVIEW` handler + per-domain confirm

**Files:**
- Modify: `packages/extension/src/content.ts` (add helpers near `klavConsentPrompt`/`klavCapture` ≈`:1050-1101`; add a message branch in the listener at `:640`)
- Modify: the `ContentMessage` type (search for the `OPEN_MODAL` variant) — add `{ kind: 'KLAV_ADHOC_REVIEW'; projectId: string }`.

**Interfaces:**
- Consumes: `KLAV_ADHOC_REVIEW { projectId }` (from the popup, Task 5); `reviewGate` server contract (Task 2); `BackgroundMessage` `KLAV_REVIEW` with `adhoc` (Task 3).
- Produces: in-page review + bubbles for the current tab.

- [ ] **Step 1: Add per-domain consent helpers**

Add near the other `chrome.storage.local` helpers in `content.ts`:

```ts
// Per-domain memory for explicit "Analyze this page" runs (so we confirm only once per domain).
async function klavAdhocAllowed(domain: string): Promise<boolean> {
  try { const r = await chrome.storage.local.get('klavAdhocDomains'); return Array.isArray(r.klavAdhocDomains) && r.klavAdhocDomains.includes(domain) } catch { return false }
}
async function klavAdhocRemember(domain: string): Promise<void> {
  try {
    const r = await chrome.storage.local.get('klavAdhocDomains')
    const list: string[] = Array.isArray(r.klavAdhocDomains) ? r.klavAdhocDomains : []
    if (!list.includes(domain)) { list.push(domain); await chrome.storage.local.set({ klavAdhocDomains: list }) }
  } catch { /* non-fatal */ }
}
```

- [ ] **Step 2: Add the confirm card (mirrors `klavConsentPrompt`)**

```ts
// One-time-per-domain confirm before an explicit ad-hoc review. Reuses the consent-card styling.
function klavAdhocConfirm(domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    const root = klavGetHost()
    const el = document.createElement('div')
    el.className = 'klav-consent'
    el.innerHTML = `
      <h4>Analyze this page?</h4>
      <p>Your Sims will look at <b>${domain}</b>. We capture only the visible area (a viewport screenshot) and send it to Klavity to generate feedback.</p>
      <div class="klav-crow">
        <button class="klav-cprimary">Analyze</button>
        <button class="klav-cghost">Cancel</button>
      </div>`
    const done = (ok: boolean) => { el.remove(); resolve(ok) }
    el.querySelector('.klav-cprimary')!.addEventListener('click', () => done(true))
    el.querySelector('.klav-cghost')!.addEventListener('click', () => done(false))
    root.appendChild(el)
  })
}
```

- [ ] **Step 3: Add the ad-hoc runner**

```ts
// Explicit "Analyze this page" — bypasses the allowlist + the klavSimsEnabled kill-switch by design.
async function klavRunAdhoc(projectId: string): Promise<void> {
  const domain = location.hostname
  if (!(await klavAdhocAllowed(domain))) {
    if (!(await klavAdhocConfirm(domain))) return
    await klavAdhocRemember(domain)
  }
  klavRenderIndicator(projectId, false)
  const dataUrl = await klavCapture()
  if (!dataUrl) { klavNotice('Couldn’t capture this page — try again.'); return }
  const resp = await klavSend<{ ok: boolean; status: number; body: any }>({
    kind: 'KLAV_REVIEW', projectId, url: location.href, domSig: klavDomSig(), screenshotDataUrl: dataUrl, adhoc: true,
  })
  const body = resp?.body || {}
  if (resp?.ok && Array.isArray(body.reviews)) {
    let n = 0
    for (const rv of body.reviews) for (const r of (rv.reactions || [])) {
      klavRenderBubble({ simName: rv.simName, initials: rv.initials, accent: rv.accent, observation: r.observation, severity: r?.suggestedBug?.severity, citation: r.citation, suggestedBug: r?.suggestedBug }); n++
    }
    if (n === 0) klavNotice('Your Sims had nothing to flag on this page.')
  } else if (body.reason === 'budgetExhausted') {
    klavNotice('Sims hit today’s review budget — try again tomorrow.')
  } else if (body.reason === 'noConfig') {
    klavNotice('Sign in from the Klavity popup first.')
  } else {
    klavNotice('Couldn’t analyze this page right now.')
  }
}
```

- [ ] **Step 4: Wire the message branch**

In the `chrome.runtime.onMessage.addListener((msg: ContentMessage) => { ... })` at `content.ts:640`, add (near the `OPEN_MODAL` branch at `:685`):

```ts
  if (msg.kind === 'KLAV_ADHOC_REVIEW') {
    void klavRunAdhoc(msg.projectId)
    return
  }
```

Add `{ kind: 'KLAV_ADHOC_REVIEW'; projectId: string }` to the `ContentMessage` union. (Also add `adhoc?: boolean` to the `BackgroundMessage` `KLAV_REVIEW` variant if not already done in Task 3.)

- [ ] **Step 5: Build**

Run: `cd packages/extension && npm run build`
Expected: build succeeds, no new type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/content.ts packages/core/src
git commit -m "feat(ext): content-script KLAV_ADHOC_REVIEW — confirm + capture + review + bubbles"
```

---

### Task 5: Popup "Analyze this page" button

**Files:**
- Modify: `packages/extension/src/popup.html` (button markup + style)
- Modify: `packages/extension/src/popup.ts` (`renderSignedIn`)

**Interfaces:**
- Consumes: sends `KLAV_ADHOC_REVIEW { projectId }` to the active tab (Task 4 handler).

- [ ] **Step 1: Add the button markup + style**

In `popup.html`, after the `.actions` div (the bug/feature row, ≈`:138`), add a full-width button:

```html
  <div style="padding:0 16px 12px;">
    <button class="action-analyze" id="btn-analyze">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      Analyze this page
    </button>
  </div>
```

Add to the `<style>` block (near `.action-btn`):

```css
    .action-analyze{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border:1px solid var(--line);border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;background:var(--indigo);color:#fff;}
    .action-analyze:hover{opacity:.9;}
    .action-analyze:disabled{opacity:.5;cursor:default;background:var(--ink-3);color:var(--paper-faint);}
    .action-analyze.studio{background:var(--ink-3);color:var(--indigo-deep);}
```

- [ ] **Step 2: Wire the handler in `renderSignedIn`**

In `popup.ts` `renderSignedIn`, after the project picker block resolves `activeProjectId` and `projects`, add the active-tab guard + handler. Place it after the report buttons are wired (≈ after `$('btn-feat')...`):

```ts
  // ── Ad-hoc "Analyze this page" ──
  const analyzeBtn = $('btn-analyze') as HTMLButtonElement
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const unsupported = !activeTab?.url || /^(chrome|edge|about|view-source):|chrome\.google\.com\/webstore/.test(activeTab.url)
  if (unsupported) {
    analyzeBtn.disabled = true
    analyzeBtn.title = "Can't analyze this page"
  } else {
    analyzeBtn.addEventListener('click', async () => {
      const projectId = activeProjectId || projects[0]?.id || null
      if (!projectId || !activeTab?.id) return
      const tabId = activeTab.id
      const send = () => chrome.tabs.sendMessage(tabId, { kind: 'KLAV_ADHOC_REVIEW', projectId }).catch(() => {})
      chrome.tabs.sendMessage(tabId, { kind: 'KLAV_ADHOC_REVIEW', projectId }).catch(() => {
        const cs = chrome.runtime.getManifest().content_scripts?.[0]
        if (cs?.js?.length) chrome.scripting.executeScript({ target: { tabId }, files: cs.js }).then(() => setTimeout(send, 300)).catch(() => {})
      })
      window.close()
    })
  }
```

- [ ] **Step 3: "No Sims" state**

In `renderSims`, in the `sims.length === 0` branch (`popup.ts:177`), convert the analyze button into a studio link instead of running an empty review:

```ts
  if (sims.length === 0) {
    const ab = document.getElementById('btn-analyze') as HTMLButtonElement | null
    if (ab) {
      ab.classList.add('studio')
      ab.textContent = 'Add a Sim first →'
      ab.onclick = () => chrome.tabs.create({ url: `${base || 'https://klavity.quantana.top'}/app` })
    }
    simsList.innerHTML = `
      <div class="empty-state">No sims yet. Build them in Klavity Studio.</div>
      <a class="empty-link" id="add-sim-link" href="#" style="text-align:center;">+ Open Sim Studio →</a>`
    $('add-sim-link')?.addEventListener('click', (e) => {
      e.preventDefault()
      chrome.tabs.create({ url: `${base || 'https://klavity.quantana.top'}/app` })
    })
    return
  }
```

(Note: `renderSims` runs after the handler is wired in Step 2; replacing `onclick` here cleanly overrides the analyze behavior when there are zero Sims.)

- [ ] **Step 4: Build**

Run: `cd packages/extension && npm run build`
Expected: build succeeds, no new type errors.

- [ ] **Step 5: Manual smoke (load unpacked)**

Load `packages/extension/dist` unpacked in Chrome. On a NON-allowlisted page while signed in: click "Analyze this page" → see the one-time confirm → Analyze → "Sims reviewing…" pill + reaction bubbles with the "saved to your dashboard" outcome. Click again → no confirm (remembered). Verify the ticket appears in the dashboard.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/popup.html packages/extension/src/popup.ts
git commit -m "feat(ext): popup 'Analyze this page' button (ad-hoc review)"
```

---

## Self-Review

**Spec coverage:**
- One-click button + zero-config project resolution → Task 5. ✓
- Per-domain confirm + storage → Task 4 (Steps 1-2). ✓
- Reuse capture→review→bubble pipeline → Task 4 (Step 3). ✓
- Server `adhoc` bypass (allowlist/consent/dedupe) + keep auth/budget → Tasks 1-2. ✓
- Background passthrough → Task 3. ✓
- Edge cases (no Sims, budget, unsupported tab) → Task 5 Steps 2-3, Task 4 Step 3. ✓
- Kill-switch bypass by design → Task 4 (handled outside `maybeActivate`). ✓
- Testing (gate unit + route integration) → Tasks 1-2. ✓

**Type consistency:** `KLAV_ADHOC_REVIEW { projectId }` (popup→content, Task 5 sends / Task 4 receives) and `KLAV_REVIEW { ..., adhoc }` (content→background→server, Tasks 3-4) match. `reviewGate` input `adhoc?: boolean` defined Task 1, consumed Task 2. `klavRenderBubble` call includes `suggestedBug` (matches the shipped signature). ✓

**Placeholder scan:** Step 4 of Task 2 gives a pseudocode shape for the route test rather than full code, because the test harness depends on the existing review-route test setup which must be located first; the assertions are explicit. All other code steps are complete. ✓
