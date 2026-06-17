# Extension ↔ Sim Studio: Sim Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click "Connect Extension" button in Sim Studio that pushes a session token to the extension, enabling the popup to fetch and display saved sims on every open.

**Architecture:** The extension content script exposes its ID to the Klavity web page via `window.__klavityExtensionId`. Sim Studio calls `GET /api/extension-token` for the current session token, then uses `chrome.runtime.sendMessage` to push it to the extension. The background's `onMessageExternal` listener saves it to `chrome.storage.sync`. The popup already fetches sims on open when `klavToken` is set.

**Tech Stack:** Bun/TypeScript server, Chrome MV3 extension (Vite build), vanilla JS in index.html

---

## File Map

| File | Change |
|---|---|
| `packages/extension/manifest.json` | Add `externally_connectable` for Klavity domain + localhost |
| `packages/extension/src/content.ts` | Add 4-line block at top: expose `window.__klavityExtensionId` |
| `packages/extension/src/background.ts` | Add `onMessageExternal` listener after existing `onMessage` listener |
| `prototype/server.ts` | Add `GET /api/extension-token` route (requires cookie session) |
| `prototype/public/index.html` | Add "Connect Extension" button to header + JS to drive it |

---

## Task 1: Add `externally_connectable` to manifest

**Files:**
- Modify: `packages/extension/manifest.json`

- [ ] **Open `packages/extension/manifest.json` and add `externally_connectable` after `"host_permissions"`:**

```json
{
  "manifest_version": 3,
  "name": "Klavity Snap",
  "version": "0.2.0",
  "description": "Right-click to file annotated bug reports to Jira, Linear, GitHub, or Plane.",
  "permissions": ["activeTab", "storage", "scripting", "tabs"],
  "host_permissions": [
    "https://*.atlassian.net/*",
    "https://api.linear.app/*",
    "https://api.github.com/*",
    "https://api.plane.so/*",
    "<all_urls>"
  ],
  "externally_connectable": {
    "matches": [
      "https://klavity.quantana.top/*",
      "http://localhost:*"
    ]
  },
  "background": {
    "service_worker": "src/background.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.ts"],
      "css": ["src/content.css"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": {
    "page": "src/options.html",
    "open_in_tab": true
  },
  "action": {
    "default_popup": "src/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Verify the JSON is valid:**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap/packages/extension
cat manifest.json | python3 -m json.tool > /dev/null && echo "valid JSON"
```

Expected: `valid JSON`

- [ ] **Commit:**

```bash
git -C /Users/vishalkumar/Downloads/qbug/klav-snap add packages/extension/manifest.json
git -C /Users/vishalkumar/Downloads/qbug/klav-snap commit -m "feat(extension): add externally_connectable for Klavity domain"
```

---

## Task 2: Expose extension ID from content script

**Files:**
- Modify: `packages/extension/src/content.ts` (top of file, lines 1-4 area)

- [ ] **Add these 5 lines at the very top of `packages/extension/src/content.ts`, before all existing imports:**

```typescript
// Expose our extension ID to the Klavity web app so it can send us a CONNECT message.
if (location.hostname === 'klavity.quantana.top' || location.hostname === 'localhost') {
  ;(window as any).__klavityExtensionId = chrome.runtime.id
}
```

The file currently starts with:
```typescript
import type { ContentMessage, BackgroundMessage, ...
```

After the change it should start with:
```typescript
// Expose our extension ID to the Klavity web app so it can send us a CONNECT message.
if (location.hostname === 'klavity.quantana.top' || location.hostname === 'localhost') {
  ;(window as any).__klavityExtensionId = chrome.runtime.id
}

import type { ContentMessage, BackgroundMessage, ...
```

- [ ] **Verify it compiles (run the extension build):**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap/packages/extension
bun run build 2>&1 | tail -10
```

Expected: build completes without TypeScript errors. Note the `dist/` output path from the build output.

- [ ] **Commit:**

```bash
git -C /Users/vishalkumar/Downloads/qbug/klav-snap add packages/extension/src/content.ts
git -C /Users/vishalkumar/Downloads/qbug/klav-snap commit -m "feat(extension): expose __klavityExtensionId to Klavity pages"
```

---

## Task 3: Add `onMessageExternal` listener to background

**Files:**
- Modify: `packages/extension/src/background.ts` (append after the closing `})` of the existing `onMessage` listener)

- [ ] **Append this block at the end of `packages/extension/src/background.ts`:**

```typescript
// ── External messages from the Klavity web app ───────────────────────────────
// Receives { type: 'CONNECT', token: string, backendUrl: string } from Sim Studio.
// Merges the token + backendUrl into klavSettings so the popup can sync sims.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'CONNECT' || !msg.token) {
    sendResponse({ ok: false, error: 'invalid message' })
    return
  }
  chrome.storage.sync.get('klavSettings', (result) => {
    const current = result.klavSettings ?? {}
    const updated = { ...current, klavToken: msg.token, backendUrl: msg.backendUrl || '' }
    chrome.storage.sync.set({ klavSettings: updated }, () => {
      sendResponse({ ok: true })
    })
  })
  return true // keep channel open for async sendResponse
})
```

- [ ] **Rebuild the extension:**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap/packages/extension
bun run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Commit:**

```bash
git -C /Users/vishalkumar/Downloads/qbug/klav-snap add packages/extension/src/background.ts
git -C /Users/vishalkumar/Downloads/qbug/klav-snap commit -m "feat(extension): handle CONNECT message from Klavity web app"
```

---

## Task 4: Add `GET /api/extension-token` to the server

**Files:**
- Modify: `prototype/server.ts` — add one route inside the `if (path.startsWith("/api/"))` block, after the existing `/api/me` route

- [ ] **Find the `/api/me` route in `prototype/server.ts` (around line 245):**

```typescript
if (req.method === "GET" && path === "/api/me") {
  const ms = await membershipsFor(me)
  const active = ms[0] || null
  const members = active ? await membersOf(active.workspaceId) : []
  return json({ email: me, workspaces: ms, active, members })
}
```

- [ ] **Add the extension-token route immediately after it:**

```typescript
// Returns the current session ID as a Bearer token — the extension uses this to sync sims.
if (req.method === "GET" && path === "/api/extension-token") {
  const sid = parseCookies(req.headers.get("cookie"))["klav_session"]
  if (!sid) return json({ error: "No session." }, 401)
  return json({ token: sid })
}
```

- [ ] **Verify the server restarts without errors:**

```bash
pkill -f "bun.*server.ts" 2>/dev/null; sleep 1
nohup bun /Users/vishalkumar/Downloads/qbug/klav-snap/prototype/server.ts > /tmp/klav-server.log 2>&1 &
sleep 2 && tail -5 /tmp/klav-server.log
```

Expected output ends with:
```
✓ Turso connected, schema ready

⚡ Klavity app → http://localhost:4317
```

- [ ] **Smoke-test the route (no cookie = 401):**

```bash
curl -s http://localhost:4317/api/extension-token | python3 -m json.tool
```

Expected: `{"error": "No session."}`

- [ ] **Commit:**

```bash
git -C /Users/vishalkumar/Downloads/qbug/klav-snap add prototype/server.ts
git -C /Users/vishalkumar/Downloads/qbug/klav-snap commit -m "feat(server): add GET /api/extension-token for extension connect flow"
```

---

## Task 5: Add "Connect Extension" button to Sim Studio

**Files:**
- Modify: `prototype/public/index.html` — header HTML + CSS + JS

### 5a — CSS

- [ ] **Find this CSS block in `index.html` (around line 44):**

```css
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
```

- [ ] **Add two new rules immediately after it:**

```css
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.ext-btn { font-size: 12px; font-weight: 600; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--ink-2); color: var(--paper); cursor: pointer; transition: background .15s, color .15s; }
.ext-btn:hover:not(:disabled) { border-color: var(--indigo); color: var(--indigo); }
.ext-btn:disabled { opacity: .45; cursor: not-allowed; }
.ext-btn.connected { background: rgba(15,157,107,.12); border-color: var(--green); color: var(--green); }
```

### 5b — HTML

- [ ] **Find the header in `index.html` (around line 276):**

```html
<div class="head">
  <div class="logo" id="appLogo" style="cursor:default">...</div>
  <div>
    <h1>Klavity · Sims Studio</h1>
    <div class="sub">Add a Sim, then watch one review this page and file what it finds.</div>
  </div>
  <a href="/dashboard" style="margin-left:auto;font-size:13px;color:var(--blue);text-decoration:none">← Dashboard</a>
</div>
```

- [ ] **Replace the `← Dashboard` link with this (adds the connect button before the link):**

```html
<div class="head">
  <div class="logo" id="appLogo" style="cursor:default"><img src="/favicon.svg" width="34" height="34" alt="Klavity" /></div>
  <div>
    <h1>Klavity · Sims Studio</h1>
    <div class="sub">Add a Sim, then watch one review this page and file what it finds.</div>
  </div>
  <button class="ext-btn" id="connectExtBtn" disabled style="margin-left:auto">Checking extension…</button>
  <div id="connectStatus" class="status" style="margin:0;min-height:0"></div>
  <a href="/dashboard" style="font-size:13px;color:var(--blue);text-decoration:none">← Dashboard</a>
</div>
```

### 5c — JavaScript

- [ ] **Add this block inside the `<script type="module">` tag, after the `loadSavedSims()` call at the very end of the script (just before `</script>`):**

```javascript
// ── Connect Extension ──
;(async function initConnectBtn() {
  const btn = $('connectExtBtn')
  if (!btn) return

  // Check if already connected (token saved in extension storage).
  // We can't read chrome.storage from here, so we detect connection state
  // by checking if the extension is installed AND we have a valid token cookie.
  const extId = (window).__klavityExtensionId

  if (!extId) {
    btn.textContent = 'Extension not installed'
    btn.disabled = true
    return
  }

  // Check if extension already has a token by sending a ping
  try {
    const pong = await new Promise((resolve) => {
      chrome.runtime.sendMessage(extId, { type: 'PING' }, (resp) => resolve(resp))
    })
    if (pong?.klavToken) {
      btn.textContent = '✓ Extension connected'
      btn.classList.add('connected')
      btn.disabled = false
      btn.onclick = null // already connected, clicking re-connects
    }
  } catch { /* extension not responding to ping, show connect */ }

  if (!btn.classList.contains('connected')) {
    btn.textContent = 'Connect Extension'
    btn.disabled = false
  }

  btn.onclick = async () => {
    btn.disabled = true
    btn.textContent = 'Connecting…'
    try {
      const r = await fetch('/api/extension-token')
      if (!r.ok) throw new Error('Not signed in')
      const { token } = await r.json()
      const resp = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          extId,
          { type: 'CONNECT', token, backendUrl: location.origin },
          (result) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
            else resolve(result)
          }
        )
      })
      if (resp?.ok) {
        btn.textContent = '✓ Extension connected'
        btn.classList.add('connected')
        btn.disabled = false
      } else {
        throw new Error('Extension rejected connection')
      }
    } catch (e) {
      btn.disabled = false
      btn.textContent = 'Connect Extension'
      const st = $('connectStatus')
      if (st) { st.textContent = 'Failed: ' + e.message; st.className = 'status err' }
      setTimeout(() => { if (st) { st.textContent = ''; st.className = 'status' } }, 4000)
    }
  }
})()
```

- [ ] **Handle the PING in background.ts — add a PING case to `onMessageExternal`:**

Replace the `onMessageExternal` listener added in Task 3 with this (adds PING support):

```typescript
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (!msg) { sendResponse({ ok: false }); return }

  // PING — lets the web app check if the extension is installed + whether it has a token.
  if (msg.type === 'PING') {
    chrome.storage.sync.get('klavSettings', (result) => {
      const s = result.klavSettings ?? {}
      sendResponse({ ok: true, klavToken: !!s.klavToken })
    })
    return true
  }

  if (msg.type !== 'CONNECT' || !msg.token) {
    sendResponse({ ok: false, error: 'invalid message' })
    return
  }
  chrome.storage.sync.get('klavSettings', (result) => {
    const current = result.klavSettings ?? {}
    const updated = { ...current, klavToken: msg.token, backendUrl: msg.backendUrl || '' }
    chrome.storage.sync.set({ klavSettings: updated }, () => {
      sendResponse({ ok: true })
    })
  })
  return true
})
```

- [ ] **Rebuild the extension:**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap/packages/extension
bun run build 2>&1 | tail -10
```

- [ ] **Commit:**

```bash
git -C /Users/vishalkumar/Downloads/qbug/klav-snap add packages/extension/src/background.ts prototype/public/index.html
git -C /Users/vishalkumar/Downloads/qbug/klav-snap commit -m "feat: Connect Extension button in Sim Studio with PING/CONNECT handshake"
```

---

## Task 6: Reload extension in Chrome and verify end-to-end

- [ ] **Reload the extension in Chrome:**
  1. Open `chrome://extensions`
  2. Find "Klavity Snap" → click the reload icon (↺)
  3. Note the extension ID shown under the name (e.g. `abcdefghijklmnopqrstuvwxyzabcdef`)

- [ ] **Open Sim Studio and verify the button state:**
  1. Go to `http://localhost:4317/app` (must be logged in)
  2. Header should show **"Connect Extension"** button (not disabled, not "not installed")
  3. If it shows "Extension not installed" — the content script didn't set `window.__klavityExtensionId`. Open DevTools console on that page and run: `window.__klavityExtensionId` — should return the extension ID string.

- [ ] **Click "Connect Extension" and verify:**
  1. Button briefly shows "Connecting…"
  2. Settles on **"✓ Extension connected"** (green border)
  3. Open extension popup — Sims section should now list your saved sims instead of "No sims added yet"

- [ ] **Verify token is persisted (reload test):**
  1. Reload the Sim Studio page
  2. Button should immediately show **"✓ Extension connected"** (PING returns `klavToken: true`)
  3. Open extension popup again — sims still appear

- [ ] **Verify popup sync fetches fresh data:**
  1. Go to Sim Studio → create a new sim → save it to library
  2. Close and reopen the extension popup
  3. The new sim should appear in the popup list

- [ ] **Commit (if any fixes needed):**

```bash
git -C /Users/vishalkumar/Downloads/qbug/klav-snap add -A
git -C /Users/vishalkumar/Downloads/qbug/klav-snap commit -m "fix: extension sim sync verified end-to-end"
```

---

## Known Edge Cases

| Scenario | Behaviour |
|---|---|
| Extension not installed | Button shows "Extension not installed", disabled |
| Not logged into Sim Studio | `/api/extension-token` returns 401 → button shows "Failed: Not signed in" |
| Token expired (7-day session) | Popup fetch returns 401 → cached sims shown, no crash. Re-connect via button. |
| Offline | Popup fetch fails silently, shows last cached sims |
| Multiple browsers | Each browser needs its own CONNECT — token is per-browser extension storage |
