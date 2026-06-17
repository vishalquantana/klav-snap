# Extension ↔ Sim Studio: Sim Sync Design

**Date:** 2026-06-17  
**Status:** Approved

## Problem

Sims (personas) are created and saved in Klavity Sim Studio (web app, authenticated). The browser extension shows "No sims added yet" because there is no connection between the two. The extension runs in direct mode (no Klavity Cloud), so the existing cloud-mode sync path doesn't trigger.

## Goal

One-click connection from Sim Studio to the extension when the user is already logged in. On every popup open, the extension fetches the latest sims from the backend. No OTP required if already logged in on the web.

---

## Architecture

### Flow

```
Sim Studio (web, logged in)
  └─ detects window.klavityExtensionId (set by content script)
  └─ shows "Connect Extension" button
  └─ on click: GET /api/extension-token → gets session token
  └─ chrome.runtime.sendMessage(extensionId, { type:'CONNECT', token, backendUrl })

Extension background.ts
  └─ onMessageExternal listener receives CONNECT
  └─ merges { klavToken, backendUrl } into chrome.storage.sync (klavSettings)
  └─ returns { ok: true }

Extension popup.ts (on every open)
  └─ if klavToken set: GET ${backendUrl}/api/personas (Bearer token)
  └─ merge results → chrome.storage.local.klavSims
  └─ render sim list; on failure use cached sims
```

---

## Components

### 1. Manifest — `externally_connectable`

Add to `packages/extension/manifest.json`:

```json
"externally_connectable": {
  "matches": [
    "https://klavity.quantana.top/*",
    "http://localhost:*"
  ]
}
```

This is the permission that allows web pages on those origins to call `chrome.runtime.sendMessage` to this extension.

### 2. Content Script — expose extension ID

In `packages/extension/src/content.ts`, at the top of the script (before any other logic):

```ts
// Expose extension ID to Klavity web app so it can send us a connect message
if (location.hostname === 'klavity.quantana.top' || location.hostname === 'localhost') {
  window.__klavityExtensionId = chrome.runtime.id
}
```

The web page reads `window.__klavityExtensionId`. If present, extension is installed. If undefined, extension is not installed.

### 3. Background — `onMessageExternal` listener

In `packages/extension/src/background.ts`, add:

```ts
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'CONNECT' || !msg.token) { sendResponse({ ok: false }); return }
  chrome.storage.sync.get('klavSettings', (result) => {
    const s = { ...(result.klavSettings ?? {}), klavToken: msg.token, backendUrl: msg.backendUrl || '' }
    chrome.storage.sync.set({ klavSettings: s }, () => sendResponse({ ok: true }))
  })
  return true // async response
})
```

### 4. Server — `GET /api/extension-token`

Add to `prototype/server.ts` (requires cookie session):

```
GET /api/extension-token
→ { token: <current session id> }
```

Returns the current session ID. This is already a valid Bearer token (the backend's `bearerEmail()` resolves it via `getSession()`). No new token type needed.

### 5. Sim Studio — "Connect Extension" button

In `prototype/public/index.html`, in the page header area:

**Detection (on page load):**
```js
const extId = window.__klavityExtensionId
const connectBtn = $('connectExtBtn')
if (extId) {
  connectBtn.textContent = 'Connect Extension'
  connectBtn.disabled = false
} else {
  connectBtn.textContent = 'Extension not installed'
  connectBtn.disabled = true
}
```

**On click:**
```js
connectBtn.onclick = async () => {
  connectBtn.disabled = true
  connectBtn.textContent = 'Connecting…'
  try {
    const r = await fetch('/api/extension-token')
    const { token } = await r.json()
    const resp = await new Promise((resolve) =>
      chrome.runtime.sendMessage(extId, {
        type: 'CONNECT', token, backendUrl: location.origin
      }, resolve)
    )
    if (resp?.ok) {
      connectBtn.textContent = '✓ Connected'
      connectBtn.style.background = 'var(--green)'
    } else {
      throw new Error('Extension rejected the connection')
    }
  } catch (e) {
    connectBtn.disabled = false
    connectBtn.textContent = 'Connect Extension'
    setStatus('connectStatus', 'Connection failed: ' + e.message, true)
  }
}
```

**Placement:** Next to the "← Dashboard" link in the header. Small ghost button unless extension detected.

### 6. Popup — sync on open

Already implemented in `packages/extension/src/popup.ts` from the prior session. The relevant block:

```ts
if (s.backendUrl && s.klavToken) {
  // fetch /api/personas, merge into klavSims, re-render
}
```

No changes needed here.

---

## OTP Fallback

The existing OTP login section in `options.ts` / `options.html` remains unchanged. If the user isn't on the Klavity web app (e.g. using the extension on a different machine), they can still sign in via OTP in the extension settings. This sets `klavToken` + `backendUrl` via the same `chrome.storage.sync` path.

---

## Error States

| Situation | Behaviour |
|---|---|
| Extension not installed | Button disabled, shows "Extension not installed" |
| Session expired (token invalid) | Popup fetch returns 401, shows cached sims, no crash |
| Offline | Popup fetch fails silently, shows last cached sims |
| Already connected | Button shows "✓ Connected" on load (check if `klavToken` is set in storage) |

---

## Out of Scope

- Sims push notifications (extension is not notified when sims change; it re-fetches on next popup open)
- Multi-workspace support
- Revoking extension access (user can clear `klavToken` from extension settings via sign-out)
