# In-extension Sign-in + Sims Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign in directly from the Klavity Snap extension popup (silent site-cookie reuse, with an email one-time-code fallback) and load their project's sims, and fix the web app's broken extension-detection.

**Architecture:** All sign-in logic lives in a new, unit-tested `auth.ts` module in the extension. The popup gains a signed-out state (auth form) and a signed-in state (project picker + sims). Auth reuses the existing `KLAV_SYNC_CONFIG` → `syncConfig()` background pipeline that mints the scoped `ext_` token and caches projects. Detection is fixed by bridging the extension id through a shared-DOM attribute instead of `window` (which is per-JS-world). **No backend changes.**

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin` (MV3), Vitest 1.6, `@types/chrome`. Backend is Bun (`prototype/server.ts`) — unchanged.

## Global Constraints

- **No backend/server changes.** All endpoints already exist: `POST /api/auth/request`, `POST /api/auth/verify` (`server.ts:316,333`), `GET /api/extension/config` (`server.ts:554`), `GET /api/personas?project=<id>` (`server.ts:497`).
- **No CORS work needed.** MV3 grants extension popup/SW privileged cross-origin fetch to `host_permissions` hosts (manifest has `<all_urls>`); existing fetches in `background.ts:61` / `popup.ts:69` prove it.
- **`klav_session` cookie is `HttpOnly; SameSite=Lax; Secure`** (`lib/auth.ts:35`) — read it only via `chrome.cookies.get`, never `document.cookie`.
- **Default backend base:** `https://klavity.quantana.top` (matches `background.ts:51`). Strip trailing slashes.
- **`auth.ts` imports from `@klavity/core` must be `import type` only** — value imports pull DOM-heavy modules into the Vitest node env.
- **Bootstrap token = raw session id**, persisted to `klavSettings.klavToken` (sync). The scoped `ext_` token lands in `klavConfig.token` (local) via `syncConfig()`. Set `klavSettings.connectionMode = 'klavity'` on sign-in, `'direct'` on sign-out.
- **Test commands run from `packages/extension/`:** `pnpm test` (= `vitest run --passWithNoTests`) or `pnpm exec vitest run <file>`.
- **Commit scope:** commit from the repo root `~/Downloads/qbug/klav-snap`; the `.git` is there, not in `prototype/`.

---

### Task 1: `auth.ts` sign-in module (unit-tested) + `cookies` permission

**Files:**
- Create: `packages/extension/src/auth.ts`
- Create: `packages/extension/src/auth.test.ts`
- Modify: `packages/extension/manifest.json` (add `"cookies"` to `permissions`)

**Interfaces:**
- Consumes: `chrome.storage.{sync,local}`, `chrome.cookies.get`, `chrome.runtime.sendMessage`, `fetch`; types `KlavitySettings`, `KlavConfig`, `KlavMonitoredProject` from `@klavity/core`; background `KLAV_SYNC_CONFIG` handler which responds `{ ok: true, config: KlavConfig | null }` (`background.ts:146-149`).
- Produces (all `export`ed from `auth.ts`):
  - `backendBase(s: Partial<KlavitySettings>): string`
  - `trySilentLogin(): Promise<boolean>`
  - `requestCode(email: string): Promise<{ ok: boolean; error?: string }>`
  - `verifyCode(email: string, code: string): Promise<{ ok: boolean; error?: string }>`
  - `getConfig(): Promise<KlavConfig | null>`
  - `isSignedIn(): Promise<boolean>`
  - `signOut(): Promise<void>`
  - `getSelectedProjectId(): Promise<string | null>`
  - `setSelectedProjectId(id: string): Promise<void>`
  - `pickProject(projects: KlavMonitoredProject[], savedId: string | null): KlavMonitoredProject | null`
  - `triggerConfigSync(): Promise<KlavConfig | null>`

- [ ] **Step 1: Write the failing test**

Create `packages/extension/src/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  backendBase, pickProject, trySilentLogin, requestCode, verifyCode,
  isSignedIn, signOut, getSelectedProjectId, setSelectedProjectId,
} from './auth'

// ── In-memory fake chrome ──────────────────────────────────────────────
function makeChrome(opts: { cookie?: string; hasCookies?: boolean } = {}) {
  const sync: Record<string, any> = {}
  const local: Record<string, any> = {}
  const get = (store: Record<string, any>) => (key: string | string[]) => {
    if (typeof key === 'string') return Promise.resolve({ [key]: store[key] })
    const out: Record<string, any> = {}
    for (const k of key) out[k] = store[k]
    return Promise.resolve(out)
  }
  return {
    sync, local,
    storage: {
      sync: { get: get(sync), set: (o: any) => { Object.assign(sync, o); return Promise.resolve() } },
      local: {
        get: get(local),
        set: (o: any) => { Object.assign(local, o); return Promise.resolve() },
        remove: (keys: string[]) => { for (const k of keys) delete local[k]; return Promise.resolve() },
      },
    },
    cookies: opts.hasCookies === false ? undefined : {
      get: vi.fn().mockResolvedValue(opts.cookie ? { value: opts.cookie } : null),
    },
    runtime: {
      lastError: undefined as any,
      sendMessage: vi.fn((_msg: any, cb: any) => cb({ ok: true, config: { email: 'a@b.com', token: 'ext_x', backendUrl: 'https://klavity.quantana.top', projects: [], syncedAt: 1 } })),
    },
  }
}

beforeEach(() => { vi.restoreAllMocks() })

describe('backendBase', () => {
  it('defaults to production and strips trailing slash', () => {
    expect(backendBase({})).toBe('https://klavity.quantana.top')
    expect(backendBase({ backendUrl: 'http://localhost:3000/' })).toBe('http://localhost:3000')
  })
})

describe('pickProject', () => {
  const projects = [{ id: 'p1', name: 'A', reviewMode: 'auto', monitoredUrls: [] }, { id: 'p2', name: 'B', reviewMode: 'auto', monitoredUrls: [] }]
  it('returns the saved project when it exists', () => {
    expect(pickProject(projects, 'p2')?.id).toBe('p2')
  })
  it('falls back to the first project when saved id is missing', () => {
    expect(pickProject(projects, 'gone')?.id).toBe('p1')
    expect(pickProject(projects, null)?.id).toBe('p1')
  })
  it('returns null when there are no projects', () => {
    expect(pickProject([], 'p1')).toBeNull()
  })
})

describe('trySilentLogin', () => {
  it('persists the cookie token and returns true', async () => {
    const c = makeChrome({ cookie: 'sess_123' })
    ;(globalThis as any).chrome = c
    expect(await trySilentLogin()).toBe(true)
    expect(c.sync.klavSettings.klavToken).toBe('sess_123')
    expect(c.sync.klavSettings.connectionMode).toBe('klavity')
    expect(c.runtime.sendMessage).toHaveBeenCalled()
  })
  it('returns false when there is no cookie', async () => {
    ;(globalThis as any).chrome = makeChrome({ cookie: undefined })
    expect(await trySilentLogin()).toBe(false)
  })
  it('returns false when the cookies API is unavailable', async () => {
    ;(globalThis as any).chrome = makeChrome({ hasCookies: false })
    expect(await trySilentLogin()).toBe(false)
  })
})

describe('requestCode / verifyCode', () => {
  it('requestCode returns ok on 200', async () => {
    ;(globalThis as any).chrome = makeChrome()
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    expect(await requestCode('a@b.com')).toEqual({ ok: true })
  })
  it('requestCode surfaces the server error on non-200', async () => {
    ;(globalThis as any).chrome = makeChrome()
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'not on access list' }) })
    expect(await requestCode('a@b.com')).toEqual({ ok: false, error: 'not on access list' })
  })
  it('verifyCode persists the token and triggers sync on success', async () => {
    const c = makeChrome(); ;(globalThis as any).chrome = c
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, token: 'sess_v' }) })
    expect(await verifyCode('a@b.com', '123456')).toEqual({ ok: true })
    expect(c.sync.klavSettings.klavToken).toBe('sess_v')
    expect(c.runtime.sendMessage).toHaveBeenCalled()
  })
  it('verifyCode fails when no token is returned', async () => {
    ;(globalThis as any).chrome = makeChrome()
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid or expired code.' }) })
    expect(await verifyCode('a@b.com', '000000')).toEqual({ ok: false, error: 'Invalid or expired code.' })
  })
})

describe('isSignedIn / signOut / selected project', () => {
  it('isSignedIn reflects klavConfig.email', async () => {
    const c = makeChrome(); ;(globalThis as any).chrome = c
    expect(await isSignedIn()).toBe(false)
    c.local.klavConfig = { email: 'a@b.com' }
    expect(await isSignedIn()).toBe(true)
  })
  it('signOut clears token + cached config/sims/project', async () => {
    const c = makeChrome(); ;(globalThis as any).chrome = c
    c.sync.klavSettings = { klavToken: 't', connectionMode: 'klavity' }
    c.local.klavConfig = { email: 'a@b.com' }; c.local.klavSims = [1]; c.local.klavSelectedProjectId = 'p1'
    await signOut()
    expect(c.sync.klavSettings.klavToken).toBe('')
    expect(c.sync.klavSettings.connectionMode).toBe('direct')
    expect(c.local.klavConfig).toBeUndefined()
    expect(c.local.klavSelectedProjectId).toBeUndefined()
  })
  it('remembers the selected project id', async () => {
    const c = makeChrome(); ;(globalThis as any).chrome = c
    expect(await getSelectedProjectId()).toBeNull()
    await setSelectedProjectId('p2')
    expect(await getSelectedProjectId()).toBe('p2')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm exec vitest run src/auth.test.ts`
Expected: FAIL — `Failed to resolve import "./auth"` / module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/extension/src/auth.ts`:

```ts
import type { KlavitySettings, KlavConfig, KlavMonitoredProject } from '@klavity/core'

const DEFAULT_BACKEND = 'https://klavity.quantana.top'

export function backendBase(s: Partial<KlavitySettings>): string {
  return (s.backendUrl || DEFAULT_BACKEND).replace(/\/+$/, '')
}

async function readSettings(): Promise<Partial<KlavitySettings>> {
  const r = await chrome.storage.sync.get('klavSettings')
  return (r.klavSettings as Partial<KlavitySettings>) ?? {}
}

async function persistToken(token: string, backendUrl: string): Promise<void> {
  const cur = await readSettings()
  await chrome.storage.sync.set({
    klavSettings: { ...cur, klavToken: token, backendUrl, connectionMode: 'klavity' },
  })
}

export function triggerConfigSync(): Promise<KlavConfig | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind: 'KLAV_SYNC_CONFIG' }, (resp: any) => {
      void chrome.runtime.lastError // SW may be asleep; reading clears the warning
      resolve(resp?.config ?? null)
    })
  })
}

export async function trySilentLogin(): Promise<boolean> {
  if (!chrome.cookies?.get) return false
  const base = backendBase(await readSettings())
  try {
    const cookie = await chrome.cookies.get({ url: base, name: 'klav_session' })
    if (!cookie?.value) return false
    await persistToken(cookie.value, base)
    await triggerConfigSync()
    return true
  } catch {
    return false
  }
}

export async function requestCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const base = backendBase(await readSettings())
  try {
    const res = await fetch(`${base}/api/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error || 'Could not send code.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error. Try again.' }
  }
}

export async function verifyCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const base = backendBase(await readSettings())
  try {
    const res = await fetch(`${base}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.token) return { ok: false, error: data.error || 'Invalid or expired code.' }
    await persistToken(data.token, base)
    await triggerConfigSync()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error. Try again.' }
  }
}

export async function getConfig(): Promise<KlavConfig | null> {
  const r = await chrome.storage.local.get('klavConfig')
  return (r.klavConfig as KlavConfig | undefined) ?? null
}

export async function isSignedIn(): Promise<boolean> {
  const c = await getConfig()
  return !!c?.email
}

export async function signOut(): Promise<void> {
  const cur = await readSettings()
  await chrome.storage.sync.set({ klavSettings: { ...cur, klavToken: '', connectionMode: 'direct' } })
  await chrome.storage.local.remove(['klavConfig', 'klavSims', 'klavSelectedProjectId'])
}

export async function getSelectedProjectId(): Promise<string | null> {
  const r = await chrome.storage.local.get('klavSelectedProjectId')
  return (r.klavSelectedProjectId as string | undefined) ?? null
}

export async function setSelectedProjectId(id: string): Promise<void> {
  await chrome.storage.local.set({ klavSelectedProjectId: id })
}

export function pickProject(projects: KlavMonitoredProject[], savedId: string | null): KlavMonitoredProject | null {
  if (!projects.length) return null
  if (savedId) {
    const found = projects.find((p) => p.id === savedId)
    if (found) return found
  }
  return projects[0]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm exec vitest run src/auth.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Add the `cookies` permission**

Modify `packages/extension/manifest.json` — change the `permissions` line:

```json
  "permissions": ["activeTab", "storage", "scripting", "tabs", "cookies"],
```

- [ ] **Step 6: Type-check passes**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm exec tsc --noEmit`
Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 7: Commit**

```bash
cd ~/Downloads/qbug/klav-snap
git add packages/extension/src/auth.ts packages/extension/src/auth.test.ts packages/extension/manifest.json
git commit -m "feat(ext): auth module — silent cookie + OTP sign-in, project helpers"
```

---

### Task 2: Fix web-app extension detection (shared-DOM bridge)

**Files:**
- Create: `packages/extension/src/expose-id.ts`
- Modify: `packages/extension/src/content.ts:1-4` (remove the now-redundant `window` write)
- Modify: `packages/extension/manifest.json` (add a dedicated `document_start` content script)
- Modify: `prototype/public/index.html:1317`

**Interfaces:**
- Produces: the DOM attribute `document.documentElement.dataset.klavityExtId` (= `chrome.runtime.id`) on `klavity.quantana.top` / `localhost` pages, read by the Studio page's connect-button init.

- [ ] **Step 1: Create the dedicated id-exposer content script**

Create `packages/extension/src/expose-id.ts`:

```ts
// Runs in the ISOLATED world at document_start ONLY on Klavity origins.
// Content scripts can't share window.* with the page (separate JS worlds), but
// the DOM is shared — so we publish the extension id as a data-attribute, which
// the Klavity web app reads to confirm the extension is installed.
document.documentElement.dataset.klavityExtId = chrome.runtime.id
```

- [ ] **Step 2: Remove the old (ineffective) window write from `content.ts`**

In `packages/extension/src/content.ts`, delete the current lines 1-4:

```ts
// Expose our extension ID to the Klavity web app so it can send us a CONNECT message.
if (location.hostname === 'klavity.quantana.top' || location.hostname === 'localhost') {
  ;(window as any).__klavityExtensionId = chrome.runtime.id
}
```

(The file then starts at its `import type { ContentMessage, ... }` line. The id-write now lives in `expose-id.ts`.)

- [ ] **Step 3: Register the document_start script in the manifest**

In `packages/extension/manifest.json`, add a second entry to the `content_scripts` array (keep the existing `<all_urls>` annotator entry unchanged):

```json
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.ts"],
      "css": ["src/content.css"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://klavity.quantana.top/*", "http://localhost/*"],
      "js": ["src/expose-id.ts"],
      "run_at": "document_start"
    }
  ],
```

- [ ] **Step 4: Read the attribute on the page, with a fallback**

In `prototype/public/index.html`, find the `initConnectBtn` IIFE (around `:1310`) and replace the extension-id read (`:1317`):

```js
  // The extension's content script writes its id to a shared-DOM attribute
  // (window.* is per-JS-world and not visible across the content/page boundary).
  function readExtId() { return document.documentElement.dataset.klavityExtId || null }

  let extId = readExtId()
  if (!extId) {
    // Absorb the content-script-vs-page load-order race: wait briefly for the attribute.
    extId = await new Promise((resolve) => {
      const obs = new MutationObserver(() => {
        const id = readExtId()
        if (id) { obs.disconnect(); resolve(id) }
      })
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-klavity-ext-id'] })
      setTimeout(() => { obs.disconnect(); resolve(readExtId()) }, 1000)
    })
  }
```

Leave the rest of the IIFE (the `if (!extId) { ... 'Extension not installed' ... }` block and the PING/CONNECT logic) unchanged — it now receives a real id when the extension is present.

- [ ] **Step 5: Build the extension to confirm no errors**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm build`
Expected: build succeeds, `dist/` produced.

- [ ] **Step 6: Manual verification**

1. `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm build`, then load `dist/` as an unpacked extension in Chrome.
2. Start the prototype server (`cd ~/Downloads/qbug/klav-snap/prototype && bun server.ts`) and open the Studio page (`/app`) while signed in.
3. Confirm the header button no longer says "Extension not installed" — it shows "Connect Extension" or "✓ Extension connected".
4. In DevTools console on the page: `document.documentElement.dataset.klavityExtId` returns the extension id.

- [ ] **Step 7: Commit**

```bash
cd ~/Downloads/qbug/klav-snap
git add packages/extension/src/expose-id.ts packages/extension/src/content.ts packages/extension/manifest.json prototype/public/index.html
git commit -m "fix(ext): bridge extension id via shared-DOM attribute so the web app detects it"
```

---

### Task 3: Popup signed-out state (auth form) + state routing

**Files:**
- Modify: `packages/extension/src/popup.html` (add auth-form markup + styles)
- Modify: `packages/extension/src/popup.ts` (route signed-in vs signed-out; implement signed-out)

**Interfaces:**
- Consumes from Task 1: `trySilentLogin`, `requestCode`, `verifyCode`, `isSignedIn` from `./auth`.
- Produces: a `renderSignedIn()` function (filled here with the EXISTING sims/recent/status logic, project defaulting to first) and a `renderSignedOut()` function; Task 4 enhances `renderSignedIn()`.

- [ ] **Step 1: Add the auth-form markup and a signed-in wrapper to `popup.html`**

In `packages/extension/src/popup.html`, add these styles before the closing `</style>` (line 78 area):

```css
    /* ── Auth (signed-out) ── */
    .auth{padding:18px 16px;}
    .auth h2{font-size:15px;font-weight:700;margin-bottom:4px;}
    .auth p{font-size:12px;color:var(--paper-faint);margin-bottom:14px;line-height:1.45;}
    .auth input{width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:14px;background:var(--ink-2);color:var(--paper);margin-bottom:9px;}
    .auth .btn-primary{width:100%;padding:11px;border:none;border-radius:10px;background:var(--indigo);color:#fff;font-size:14px;font-weight:600;cursor:pointer;}
    .auth .btn-primary:disabled{opacity:.55;cursor:default;}
    .auth .btn-ghost{width:100%;padding:9px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--paper-dim);font-size:13px;cursor:pointer;margin-top:8px;}
    .auth .auth-err{color:#E94F37;font-size:12px;margin-top:8px;min-height:1em;}
    .auth .hidden{display:none;}
```

Then wrap the existing body content (the header through footer, lines 83-133) in a signed-in container and add a signed-out container before it. Insert immediately after `<body>` (line 81):

```html
  <!-- Signed-out (auth) -->
  <div id="view-auth" class="auth" style="display:none;">
    <h2>Sign in to Klavity</h2>
    <p id="auth-sub">Checking your session…</p>
    <div id="auth-form" class="hidden">
      <input id="auth-email" type="email" placeholder="you@company.com" autocomplete="email" />
      <input id="auth-code" type="text" inputmode="numeric" placeholder="6-digit code" class="hidden" />
      <button id="auth-submit" class="btn-primary">Send code</button>
      <button id="auth-silent" class="btn-ghost">Use my site login</button>
      <div id="auth-err" class="auth-err"></div>
    </div>
  </div>

  <!-- Signed-in -->
  <div id="view-app" style="display:none;">
```

And add the matching closing `</div>` for `#view-app` immediately before `<script type="module" src="./popup.ts"></script>` (line 135):

```html
  </div>
```

- [ ] **Step 2: Restructure `popup.ts` to route by auth state**

Replace the **entire** contents of `packages/extension/src/popup.ts` with the following. (This preserves all existing signed-in behavior inside `renderSignedIn()`; Task 4 adds the picker.)

```ts
import { DEFAULT_SETTINGS } from '@klavity/core'
import type { KlavitySettings } from '@klavity/core'
import { trySilentLogin, requestCode, verifyCode, isSignedIn } from './auth'

interface Sim { id: string; name: string; role: string; accent: string; initials: string; enabled: boolean }
interface Recent { type: string; desc: string; issueKey: string; issueUrl: string; ts: number }

const $ = (id: string) => document.getElementById(id)!

// ── Top-level routing ──────────────────────────────────────────────────
async function route() {
  if (await isSignedIn()) return showApp()
  // Try the silent (cookie) path once before showing the form.
  $('auth-sub').textContent = 'Checking your session…'
  showAuth()
  if (await trySilentLogin() && await isSignedIn()) return showApp()
  promptForCode()
}

function showAuth() { $('view-auth').style.display = 'block'; $('view-app').style.display = 'none' }
function showApp() { $('view-auth').style.display = 'none'; $('view-app').style.display = 'block'; void renderSignedIn() }

function promptForCode() {
  $('auth-sub').textContent = 'Enter your email and we’ll send a 6-digit code.'
  $('auth-form').classList.remove('hidden')
}

// ── Signed-out (auth) wiring ────────────────────────────────────────────
let stage: 'email' | 'code' = 'email'
let pendingEmail = ''
const emailEl = $('auth-email') as HTMLInputElement
const codeEl = $('auth-code') as HTMLInputElement
const submitEl = $('auth-submit') as HTMLButtonElement
const errEl = $('auth-err')

function setErr(msg: string) { errEl.textContent = msg }

submitEl.addEventListener('click', async () => {
  setErr('')
  submitEl.disabled = true
  if (stage === 'email') {
    pendingEmail = emailEl.value.trim()
    if (!pendingEmail.includes('@')) { setErr('Enter a valid email.'); submitEl.disabled = false; return }
    const r = await requestCode(pendingEmail)
    submitEl.disabled = false
    if (!r.ok) { setErr(r.error || 'Could not send code.'); return }
    stage = 'code'
    emailEl.classList.add('hidden')
    codeEl.classList.remove('hidden')
    codeEl.focus()
    submitEl.textContent = 'Verify'
    $('auth-sub').textContent = `We emailed a code to ${pendingEmail}.`
  } else {
    const code = codeEl.value.trim()
    if (!/^\d{4,8}$/.test(code)) { setErr('Enter the code from your email.'); submitEl.disabled = false; return }
    const r = await verifyCode(pendingEmail, code)
    submitEl.disabled = false
    if (!r.ok) { setErr(r.error || 'Invalid or expired code.'); return }
    showApp()
  }
})

$('auth-silent').addEventListener('click', async () => {
  setErr('')
  if (await trySilentLogin() && await isSignedIn()) showApp()
  else setErr('No active Klavity session found in this browser.')
})

// ── Signed-in view ──────────────────────────────────────────────────────
async function renderSignedIn() {
  const result = await chrome.storage.sync.get('klavSettings')
  const s: KlavitySettings = { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }

  // Status dot
  const dot = $('status-dot'); const label = $('status-label')
  const configured = s.jira.baseUrl || s.linear.apiKey || s.github.token || s.plane.token || s.backendUrl
  if (configured) { dot.className = 'status-dot'; label.textContent = `${s.integration}${s.backendUrl ? ' · cloud' : ' · direct'}` }
  else { dot.className = 'status-dot err'; label.textContent = 'Not configured' }

  // Tracker link
  const trackerLink = $('tracker-link') as HTMLAnchorElement
  switch (s.integration) {
    case 'jira': trackerLink.href = s.jira.baseUrl ? `${s.jira.baseUrl}/browse` : '#'; break
    case 'linear': trackerLink.href = 'https://linear.app'; break
    case 'github': trackerLink.href = s.github.repo ? `https://github.com/${s.github.repo}/issues` : '#'; break
    case 'plane': {
      const h = (s.plane.host || 'https://api.plane.so').replace(/\/+$/, '')
      const web = h === 'https://api.plane.so' ? 'https://app.plane.so' : h
      trackerLink.href = s.plane.workspace ? `${web}/${s.plane.workspace}` : '#'
    }
  }

  $('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage())
  $('manage-sims').addEventListener('click', () => {
    const url = s.backendUrl || 'https://klavity.quantana.top'
    chrome.tabs.create({ url: `${url}/app` })
  })

  // Quick report buttons
  async function openModal(type: 'bug' | 'feature') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    chrome.tabs.sendMessage(tab.id, { kind: 'OPEN_MODAL', reportType: type }).catch(() => {
      const cs = chrome.runtime.getManifest().content_scripts?.[0]
      if (cs?.js?.length) {
        chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: cs.js }).then(() => {
          setTimeout(() => chrome.tabs.sendMessage(tab.id!, { kind: 'OPEN_MODAL', reportType: type }).catch(() => {}), 300)
        }).catch(() => {})
      }
    })
    window.close()
  }
  $('btn-bug').addEventListener('click', () => openModal('bug'))
  $('btn-feat').addEventListener('click', () => openModal('feature'))

  await renderSims(s)
  await renderRecent()
}

// ── Sims (project-scoped fetch added in Task 4) ──────────────────────────
async function renderSims(s: KlavitySettings) {
  const simsData = await chrome.storage.local.get('klavSims')
  let sims: Sim[] = simsData.klavSims ?? []
  const simsList = $('sims-list')

  if (s.backendUrl && s.klavToken) {
    try {
      const r = await fetch(`${s.backendUrl}/api/personas`, { headers: { Authorization: `Bearer ${s.klavToken}` } })
      if (r.ok) {
        const d = await r.json()
        if (Array.isArray(d.personas) && d.personas.length) {
          const enabledMap = new Map(sims.map((x) => [x.id, x.enabled]))
          sims = d.personas.map((p: any) => ({
            id: p.id, name: p.name, role: p.role || '', accent: p.accent || '#6366f1',
            initials: p.initials || p.name.slice(0, 2).toUpperCase(),
            enabled: enabledMap.get(p.id) ?? true,
          }))
          await chrome.storage.local.set({ klavSims: sims })
        }
      }
    } catch { /* offline */ }
  }

  simsList.innerHTML = ''
  if (sims.length === 0) {
    simsList.innerHTML = `
      <div class="empty-state">No sims yet. Build them in Klavity Studio.</div>
      <a class="empty-link" id="add-sim-link" href="#" style="text-align:center;">+ Open Sim Studio →</a>`
    $('add-sim-link')?.addEventListener('click', (e) => {
      e.preventDefault()
      chrome.tabs.create({ url: `${s.backendUrl || 'https://klavity.quantana.top'}/app` })
    })
    return
  }
  sims.forEach((sim, i) => {
    const row = document.createElement('div')
    row.className = 'sim-row'
    const toggleId = `toggle-${i}`
    row.innerHTML = `
      <div class="sim-avatar" style="background:${sim.accent || '#6366f1'}">${sim.initials}</div>
      <div class="sim-info"><div class="sim-name">${sim.name}</div><div class="sim-role">${sim.role}</div></div>
      <label class="toggle"><input type="checkbox" id="${toggleId}" ${sim.enabled ? 'checked' : ''}><div class="toggle-track"></div></label>`
    row.querySelector(`#${toggleId}`)!.addEventListener('change', async (e) => {
      sim.enabled = (e.target as HTMLInputElement).checked
      await chrome.storage.local.set({ klavSims: sims })
    })
    simsList.appendChild(row)
  })
}

async function renderRecent() {
  const recentData = await chrome.storage.local.get('klavRecent')
  const recent: Recent[] = recentData.klavRecent ?? []
  const recentList = $('recent-list')
  const timeAgo = (ts: number) => {
    const s2 = Math.round((Date.now() - ts) / 1000)
    if (s2 < 60) return 'just now'
    if (s2 < 3600) return `${Math.round(s2 / 60)}m ago`
    if (s2 < 86400) return `${Math.round(s2 / 3600)}h ago`
    return `${Math.round(s2 / 86400)}d ago`
  }
  if (recent.length === 0) {
    recentList.innerHTML = '<div class="empty-state">No submissions yet. Right-click to report.</div>'
    return
  }
  recent.slice(0, 5).forEach((item) => {
    const row = document.createElement('div')
    row.className = 'recent-row'
    row.title = item.issueUrl
    const isBug = item.type === 'bug'
    const bugIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:${isBug ? '#E94F37' : '#a78bfa'}"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z"/></svg>`
    const featIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#a78bfa"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/></svg>`
    row.innerHTML = `
      <div class="recent-icon ${isBug ? 'bug' : 'feat'}">${isBug ? bugIcon : featIcon}</div>
      <div class="recent-desc"><div class="recent-text">${item.desc}</div><div class="recent-meta">${timeAgo(item.ts)}</div></div>
      <span class="recent-key">${item.issueKey}</span>`
    row.addEventListener('click', () => { if (item.issueUrl) chrome.tabs.create({ url: item.issueUrl }) })
    recentList.appendChild(row)
  })
}

void route()
```

- [ ] **Step 3: Type-check**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Build**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

1. Reload the unpacked `dist/` extension; ensure `chrome.storage` is clear (remove + re-add the extension, or clear its storage).
2. Open the popup while **not** signed into the site → after a brief "Checking your session…", the email form appears.
3. Enter your email → "Send code"; check email (or server console — `DEV_SHOW_OTP`) → enter code → "Verify" → popup switches to the signed-in app view.
4. Reopen the popup → it goes straight to the app view (still signed in).

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/qbug/klav-snap
git add packages/extension/src/popup.html packages/extension/src/popup.ts
git commit -m "feat(ext): popup signed-out state with silent + OTP sign-in"
```

---

### Task 4: Popup signed-in project picker, per-project sims, sign-out

**Files:**
- Modify: `packages/extension/src/popup.html` (project picker + sign-out markup/styles)
- Modify: `packages/extension/src/popup.ts` (`renderSignedIn` → picker, project-scoped sims, sign-out)

**Interfaces:**
- Consumes from Task 1: `getConfig`, `getSelectedProjectId`, `setSelectedProjectId`, `pickProject`, `signOut`.
- Consumes from Task 3: the `renderSignedIn()` / `renderSims()` structure.

- [ ] **Step 1: Add picker + sign-out markup to `popup.html`**

Add styles before `</style>`:

```css
    .proj-select{font-size:11px;color:var(--paper-dim);background:var(--ink-3);border:1px solid var(--line);border-radius:7px;padding:3px 6px;max-width:130px;}
    .signout-btn{font-size:11px;color:var(--paper-faint);background:none;border:none;cursor:pointer;}
    .signout-btn:hover{color:var(--paper-dim);}
```

In the header, replace the status dot/label span pair (lines 86-87) with a project picker that sits alongside the status:

```html
      <span class="status-dot" id="status-dot"></span>
      <select class="proj-select" id="proj-select" style="display:none;"></select>
      <span class="status-label" id="status-label">Loading…</span>
```

Add a sign-out button to the footer — inside the `.footer` div (after the tracker link, before `</div>` at line 133):

```html
    <button class="signout-btn" id="signout-btn" style="margin-left:auto;">Sign out</button>
```

- [ ] **Step 2: Wire picker + sign-out + project-scoped sims in `popup.ts`**

In `packages/extension/src/popup.ts`:

1. Extend the auth import:

```ts
import { trySilentLogin, requestCode, verifyCode, isSignedIn, getConfig, getSelectedProjectId, setSelectedProjectId, pickProject, signOut } from './auth'
```

2. Inside `renderSignedIn(s)`, **after** the `$('btn-feat')` listener and **before** `await renderSims(s)`, insert the picker setup and replace the `renderSims(s)` call:

```ts
  // ── Project picker ──
  const config = await getConfig()
  const projects = config?.projects ?? []
  const sel = $('proj-select') as HTMLSelectElement
  let activeProjectId: string | null = null

  if (projects.length) {
    const saved = await getSelectedProjectId()
    const active = pickProject(projects, saved)
    activeProjectId = active?.id ?? null
    sel.innerHTML = projects.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')
    sel.value = activeProjectId ?? ''
    sel.style.display = projects.length > 1 ? 'inline-block' : 'none'
    sel.addEventListener('change', async () => {
      activeProjectId = sel.value
      await setSelectedProjectId(activeProjectId)
      await renderSims(s, activeProjectId)
    })
  }

  // Sign out
  $('signout-btn').addEventListener('click', async () => { await signOut(); location.reload() })

  await renderSims(s, activeProjectId)
  await renderRecent()
```

(Remove the old `await renderSims(s)` and `await renderRecent()` lines that previously ended the function — they are replaced by the block above.)

3. Update `renderSims` to accept a project id and pass it to the personas fetch:

```ts
async function renderSims(s: KlavitySettings, projectId: string | null = null) {
  const simsData = await chrome.storage.local.get('klavSims')
  let sims: Sim[] = simsData.klavSims ?? []
  const simsList = $('sims-list')

  if (s.backendUrl && s.klavToken) {
    try {
      const q = projectId ? `?project=${encodeURIComponent(projectId)}` : ''
      const r = await fetch(`${s.backendUrl}/api/personas${q}`, { headers: { Authorization: `Bearer ${s.klavToken}` } })
      // ...rest of the body is UNCHANGED from Task 3...
```

Leave the remainder of `renderSims` exactly as written in Task 3 (only the function signature and the fetch URL line change).

- [ ] **Step 3: Type-check**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Build**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

1. Reload `dist/`. Sign in (silent or OTP).
2. **Single-project user:** picker is hidden; sims for that project load.
3. **Multi-project user:** picker shows in the header; switching projects re-renders the sims list; reopen the popup and the last-chosen project is preselected.
4. Click "Sign out" → popup returns to the auth form; reopening stays signed out until you sign in again.

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/qbug/klav-snap
git add packages/extension/src/popup.html packages/extension/src/popup.ts
git commit -m "feat(ext): signed-in project picker, per-project sims, sign-out"
```

---

### Task 5: Smoke-test checklist + full manual pass

**Files:**
- Modify: `packages/extension/SMOKE_TEST.md`

**Interfaces:** none (documentation + verification of the whole feature).

- [ ] **Step 1: Append the sign-in checklist to `SMOKE_TEST.md`**

Add this section to `packages/extension/SMOKE_TEST.md`:

```markdown
## Sign-in & sims (2026-06)

- [ ] Fresh install while logged into klavity.quantana.top → open popup → silent login → signed-in, sims listed.
- [ ] Fresh install while NOT logged in → email + 6-digit code → signed-in, sims listed.
- [ ] Invalid/expired code → inline error, stays on the code field.
- [ ] Multi-project account → header picker switches projects → sims update → last choice remembered on reopen.
- [ ] Single-project account → picker hidden.
- [ ] Sign out → returns to auth form; reopening stays signed out.
- [ ] Web "Connect Extension" button on /app detects the extension (no "Extension not installed").
```

- [ ] **Step 2: Run the full test suite**

Run: `cd ~/Downloads/qbug/klav-snap/packages/extension && pnpm test`
Expected: PASS (auth.test.ts green; no other failures introduced).

- [ ] **Step 3: Execute the manual checklist**

Work through every box in the new SMOKE_TEST.md section against a freshly built `dist/`. Note any failures and fix before committing.

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/qbug/klav-snap
git add packages/extension/SMOKE_TEST.md
git commit -m "docs(ext): smoke-test checklist for in-extension sign-in"
```

---

## Self-Review

**Spec coverage:**
- Silent cookie login → Task 1 (`trySilentLogin`) + Task 3 (auto-attempt on popup open). ✅
- In-popup OTP fallback → Task 1 (`requestCode`/`verifyCode`) + Task 3 (form). ✅
- Scoped `ext_` token + project caching → reused via `triggerConfigSync` → existing `KLAV_SYNC_CONFIG` (Task 1). ✅
- Project picker, default first, remember last → Task 4 (`pickProject` + `get/setSelectedProjectId`). ✅
- Per-project sims via `?project=` → Task 4. ✅
- Sign out → Task 1 (`signOut`) + Task 4 (button). ✅
- Detection fix (DOM-attribute bridge + page fallback) → Task 2. ✅
- `cookies` permission + deployment note → Task 1 Step 5 (note carried from spec). ✅
- No backend changes → honored throughout. ✅
- Testing: `auth.ts` unit tests (Task 1); manual smoke (Task 5). ✅

**Placeholder scan:** Task 4 Step 2.3 says "rest UNCHANGED from Task 3" — acceptable here because it references the same file being edited in the immediately prior task and shows the exact lines that change; the full body is in Task 3. No vague "add error handling" placeholders.

**Type consistency:** `pickProject`, `getConfig`, `getSelectedProjectId`, `setSelectedProjectId`, `signOut`, `trySilentLogin`, `requestCode`, `verifyCode`, `isSignedIn` signatures match between Task 1 definitions and Task 3/4 consumers. `renderSims(s, projectId)` signature consistent between Task 3 (added `projectId` default) and Task 4 (call sites). Storage keys `klavSettings`, `klavConfig`, `klavSims`, `klavSelectedProjectId`, `klavRecent` used consistently.
