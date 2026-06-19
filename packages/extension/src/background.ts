import type { BackgroundMessage, ContentMessage, KlavitySettings, KlavConfig, ReportType } from '@klavity/core'
import { DEFAULT_SETTINGS } from '@klavity/core'
import { dispatchSubmit } from '@klavity/core/submit'
import { submitReport as jiraSubmit } from '@klavity/core/integrations/jira'
import { submitReport as linearSubmit } from '@klavity/core/integrations/linear'
import { submitReport as githubSubmit } from '@klavity/core/integrations/github'
import { submitReport as planeSubmit } from '@klavity/core/integrations/plane'
import { submitReport as backendSubmit } from '@klavity/core/integrations/backend'

// Safety net: messaging a tab/port that has no listener (e.g. a tab with no
// content script) rejects with "Could not establish connection / Receiving end
// does not exist / message port closed". These are benign here — swallow them so
// they never surface as an uncaught error in the service-worker log.
self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  const m = String((e.reason && e.reason.message) || e.reason || '')
  if (/Could not establish connection|Receiving end does not exist|message port closed/i.test(m)) {
    e.preventDefault()
  }
})

async function getSettings(): Promise<KlavitySettings> {
  const result = await chrome.storage.sync.get('klavSettings')
  return { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }
}

function getTrackerUrl(settings: KlavitySettings): string {
  switch (settings.integration) {
    case 'jira': return settings.jira.baseUrl ? `${settings.jira.baseUrl}/browse` : ''
    case 'linear': return 'https://linear.app'
    case 'github': return settings.github.repo ? `https://github.com/${settings.github.repo}/issues` : ''
    case 'plane': {
      if (!settings.plane.workspace) return ''
      const h = (settings.plane.host || 'https://api.plane.so').replace(/\/+$/, '')
      const web = h === 'https://api.plane.so' ? 'https://app.plane.so' : h // self-hosted shares its origin
      return `${web}/${settings.plane.workspace}`
    }
  }
}

// ── captureVisibleTab rate-limit guard ───────────────────────────────────────
// Chrome enforces ~2 captures/s and returns lastError when a capture is already
// in flight. Track the last capture timestamp; if a new request arrives too soon,
// wait out the remainder of MIN_CAPTURE_INTERVAL_MS before calling the API.
// This keeps the content script's debounce as the primary rate-limiting layer
// while preventing hard errors from a burst of rapid captures.
const MIN_CAPTURE_INTERVAL_MS = 600
let lastCaptureAt = 0

async function captureWithRateLimit(winId?: number): Promise<{ dataUrl: string; error?: string }> {
  const now = Date.now()
  const wait = MIN_CAPTURE_INTERVAL_MS - (now - lastCaptureAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))

  return new Promise((resolve) => {
    const captureOpts = { format: 'png' as const }
    const onResult = (dataUrl: string | undefined) => {
      const err = chrome.runtime.lastError?.message || ''
      if (err || !dataUrl) {
        console.warn('[Klavity] captureVisibleTab error:', err || 'no data')
        resolve({ dataUrl: '', error: err || 'capture failed' })
      } else {
        lastCaptureAt = Date.now()
        resolve({ dataUrl })
      }
    }

    if (winId != null) {
      chrome.tabs.captureVisibleTab(winId, captureOpts, onResult)
    } else {
      chrome.tabs.captureVisibleTab(captureOpts, onResult)
    }
  })
}

// ── Live activation config sync (P3b, R5) ────────────────────────────────────
// Fetch GET /api/extension/config and cache { monitored patterns, review_mode per
// project, dedicated ext token } in chrome.storage.LOCAL under `klavConfig`. This
// runs on onInstalled / onStartup / after CONNECT — NEVER on popup-open. The content
// script reads this cache to decide where (and whether) to auto-comment.
//
// MV3 note: the service worker can be evicted at any time. We persist everything to
// storage so a cold SW can answer KLAV_GET_CONFIG/KLAV_REVIEW without re-deriving
// in-memory state; the fetch handlers below are short and finish well within the SW
// keep-alive window granted while a message port is open.
function backendBase(settings: KlavitySettings): string {
  return (settings.backendUrl || 'https://klavity.quantana.top').replace(/\/+$/, '')
}

async function syncConfig(): Promise<KlavConfig | null> {
  const settings = await getSettings()
  // The dedicated ext token is minted by /api/extension/config; the *bootstrap* auth
  // is the session token from CONNECT (cookie OR Bearer). Without it we can't sync.
  if (!settings.klavToken) return null
  const base = backendBase(settings)
  try {
    const res = await fetch(`${base}/api/extension/config`, {
      headers: { Authorization: `Bearer ${settings.klavToken}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { email: string; token: string; projects: KlavConfig['projects'] }
    const config: KlavConfig = {
      email: data.email,
      token: data.token,                 // narrow-scope ext token — used for all live-activation calls
      backendUrl: base,
      projects: Array.isArray(data.projects) ? data.projects : [],
      syncedAt: Date.now(),
    }
    await chrome.storage.local.set({ klavConfig: config })
    // Push to any open tabs so their content scripts refresh without a reload.
    broadcastConfig(config)
    return config
  } catch {
    return null // offline / not signed in — keep whatever cache we have
  }
}

async function getConfig(): Promise<KlavConfig | null> {
  const r = await chrome.storage.local.get('klavConfig')
  return (r.klavConfig as KlavConfig | undefined) ?? null
}

function broadcastConfig(config: KlavConfig | null) {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id != null) void safeSend(t.id, { kind: 'KLAV_CONFIG_UPDATED', config })
    }
  })
}

chrome.runtime.onInstalled.addListener(() => {
  // Native context menu replaced by custom overlay in content script.
  void syncConfig()
})
chrome.runtime.onStartup?.addListener?.(() => { void syncConfig() })

// SPA backstop (P3b): the content script watches history in-page, but some SPA route
// changes only surface to the platform via tabs.onUpdated. When a monitored tab's URL
// changes, nudge its content script to re-evaluate. (No-op if no content script is there.)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) void safeSend(tabId, { kind: 'KLAV_NUDGE_ROUTE' })
})

// Send to a tab's content script via the callback form, which CONSUMES
// chrome.runtime.lastError (no "Could not establish connection" promise
// rejection). Resolves true if a content script received it.
function safeSend(tabId: number, msg: ContentMessage): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, () => resolve(!chrome.runtime.lastError))
  })
}

// Open the report modal in a tab. If the content script isn't there yet (the tab
// was open before the extension loaded/updated — an MV3 gotcha), inject it and retry.
async function openModal(tabId: number, reportType: ReportType) {
  const msg = { kind: 'OPEN_MODAL', reportType } satisfies ContentMessage
  if (await safeSend(tabId, msg)) return

  const cs = chrome.runtime.getManifest().content_scripts?.[0]
  try {
    if (cs?.css?.length) await chrome.scripting.insertCSS({ target: { tabId }, files: cs.css })
    if (cs?.js?.length) await chrome.scripting.executeScript({ target: { tabId }, files: cs.js })
  } catch (e) {
    console.warn('[Klavity] can’t inject into this page (restricted page like chrome:// or the Web Store?):', e)
    return
  }
  // crxjs registers the content-script listener asynchronously (loader → dynamic
  // import), so the first message can race it — retry briefly until it answers.
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 120))
    if (await safeSend(tabId, msg)) return
  }
  console.warn('[Klavity] content script did not respond after injection')
}

chrome.runtime.onMessage.addListener((msg: BackgroundMessage, sender, sendResponse) => {
  // ── Live activation (P3b) — config read / forced sync ──────────────────────
  if (msg.kind === 'KLAV_GET_CONFIG') {
    getConfig().then((config) => sendResponse({ ok: true, config }))
    return true
  }
  if (msg.kind === 'KLAV_SYNC_CONFIG') {
    syncConfig().then((config) => sendResponse({ ok: true, config }))
    return true
  }

  // ── Capture the visible tab for a Sim review (distinct from the bug CAPTURE_TAB
  //    so a review never collides with an open bug modal's capture). Viewport-only,
  //    foreground tab — same captureVisibleTab affordance, with the Arc winId fallback.
  if (msg.kind === 'KLAV_CAPTURE_REVIEW') {
    const tabId = sender.tab?.id
    const winId = sender.tab?.windowId
    const reply = (dataUrl: string, error?: string) => {
      if (tabId != null) void safeSend(tabId, { kind: 'KLAV_CAPTURE_REVIEW_RESULT', dataUrl, error })
    }
    // Use the rate-limit guard. Try the default window first; fall back to the
    // sender's windowId if the first attempt errors (Arc multi-window pattern).
    captureWithRateLimit().then(async (r1) => {
      if (r1.dataUrl) { reply(r1.dataUrl); return }
      if (winId != null) {
        const r2 = await captureWithRateLimit(winId)
        if (r2.dataUrl) { reply(r2.dataUrl); return }
        console.warn('[Klavity] KLAV_CAPTURE_REVIEW failed (winId fallback):', r2.error)
        reply('', r2.error)
      } else {
        console.warn('[Klavity] KLAV_CAPTURE_REVIEW failed:', r1.error)
        reply('', r1.error)
      }
    })
    return true
  }

  // ── POST /api/sim/review with the dedicated ext token. The SW (not the page) holds
  //    the token and performs the cross-origin fetch. Returns the parsed JSON + status
  //    so the content script can branch on the gate `reason` (needsConsent / paused / etc).
  if (msg.kind === 'KLAV_REVIEW') {
    getConfig().then(async (config) => {
      if (!config) { sendResponse({ ok: false, status: 0, body: { reason: 'noConfig' } }); return }
      try {
        const res = await fetch(`${config.backendUrl}/api/sim/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
          body: JSON.stringify({ projectId: msg.projectId, url: msg.url, domSig: msg.domSig, screenshotDataUrl: msg.screenshotDataUrl, adhoc: msg.adhoc === true }),
        })
        const body = await res.json().catch(() => ({}))
        // budgetExhausted / paused changes server state — refresh cached review_mode.
        if (body?.reason === 'budgetExhausted' || body?.reason === 'paused') void syncConfig()
        sendResponse({ ok: res.ok, status: res.status, body })
      } catch (e) {
        sendResponse({ ok: false, status: 0, body: { reason: 'error', error: String((e as Error)?.message ?? e) } })
      }
    })
    return true
  }

  // ── POST /api/consent (grant / pause / revoke) for the caller on a project. The
  //    server is the source of truth; the content script mirrors locally for instant UX.
  if (msg.kind === 'KLAV_CONSENT') {
    getConfig().then(async (config) => {
      if (!config) { sendResponse({ ok: false, status: 0 }); return }
      try {
        const res = await fetch(`${config.backendUrl}/api/consent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
          body: JSON.stringify({ projectId: msg.projectId, status: msg.status }),
        })
        const body = await res.json().catch(() => ({}))
        sendResponse({ ok: res.ok, status: res.status, body })
      } catch (e) {
        sendResponse({ ok: false, status: 0, body: { error: String((e as Error)?.message ?? e) } })
      }
    })
    return true
  }

  if (msg.kind === 'OPEN_TRACKER_URL') {
    getSettings().then(settings => {
      const url = getTrackerUrl(settings)
      if (url) chrome.tabs.create({ url })
    })
    return true
  }

  if (msg.kind === 'AUTO_FILE_ERROR') {
    getSettings().then(settings => {
      // Guard again on the background side in case the flag changed between
      // the content script reading it and the message arriving.
      if (!settings.autoFileErrors) return

      const body = [
        `**Page:** ${msg.pageUrl}`,
        `**Time:** ${new Date(msg.timestamp).toISOString()}`,
        '',
        msg.stack ? `**Stack trace:**\n\`\`\`\n${msg.stack}\n\`\`\`` : '',
      ].filter(Boolean).join('\n')

      const payload = {
        type: 'bug' as const,
        description: `Auto: ${msg.message}\n\n${body}`,
        context: {
          pageUrl: msg.pageUrl,
          userAgent: '',
          screenSize: '',
          viewportSize: '',
          consoleErrors: [],
          networkFailures: [],
        },
        screenshots: [],
      }

      return dispatchSubmit(payload, settings, {
        jira: jiraSubmit,
        linear: linearSubmit,
        github: githubSubmit,
        plane: planeSubmit,
        backend: backendSubmit,
      })
    }).catch(() => {
      // Fire-and-forget: silently ignore submission errors for auto-filed bugs
    })
    return true
  }

  if (msg.kind === 'CAPTURE_TAB') {
    const tabId = sender.tab?.id
    // Try capturing the current window active tab first (best for Arc)
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      const errorMsg = chrome.runtime.lastError?.message || ''
      if (errorMsg || !dataUrl) {
        // Fallback: Try with sender tab's specific windowId
        const winId = sender.tab?.windowId
        if (winId) {
          chrome.tabs.captureVisibleTab(winId, { format: 'png' }, (dataUrl2) => {
            const errorMsg2 = chrome.runtime.lastError?.message || ''
            if (errorMsg2 || !dataUrl2) {
              console.warn('[Klavity] capture failed with winId fallback:', errorMsg2)
              if (tabId) void safeSend(tabId, { kind: 'CAPTURE_TAB_RESULT', dataUrl: '', error: errorMsg2 })
              return
            }
            if (tabId) void safeSend(tabId, { kind: 'CAPTURE_TAB_RESULT', dataUrl: dataUrl2 })
          })
          return
        }
        console.warn('[Klavity] capture failed without winId:', errorMsg)
        if (tabId) void safeSend(tabId, { kind: 'CAPTURE_TAB_RESULT', dataUrl: '', error: errorMsg })
        return
      }
      if (tabId) void safeSend(tabId, { kind: 'CAPTURE_TAB_RESULT', dataUrl })
    })
    return true
  }

  if (msg.kind === 'SUBMIT_REPORT') {
    getSettings().then(settings => {
      return dispatchSubmit(msg.payload, settings, {
        jira: jiraSubmit,
        linear: linearSubmit,
        github: githubSubmit,
        plane: planeSubmit,
        backend: backendSubmit,
      })
    }).then(result => {
      const tabId = sender.tab?.id
      if (tabId) void safeSend(tabId, { kind: 'SUBMIT_SUCCESS', ...result })
      // Persist to recent list for popup
      const type = msg.payload.type
      const desc = msg.payload.description.slice(0, 80)
      chrome.storage.local.get('klavRecent', (r) => {
        const list: Array<{ type: string; desc: string; issueKey: string; issueUrl: string; ts: number }> = r.klavRecent ?? []
        list.unshift({ type, desc, issueKey: result.issueKey, issueUrl: result.issueUrl, ts: Date.now() })
        chrome.storage.local.set({ klavRecent: list.slice(0, 10) })
      })
    }).catch(err => {
      const tabId = sender.tab?.id
      if (tabId) void safeSend(tabId, { kind: 'SUBMIT_ERROR', message: String(err?.message ?? err) })
    })
    return true
  }
})

// ── External messages from the Klavity web app ───────────────────────────────
// Receives PING or { type: 'CONNECT', token: string, backendUrl: string } from Sim Studio.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (!msg) { sendResponse({ ok: false }); return }

  // PING — lets the web app check if the extension is installed + whether it has a token.
  if (msg.type === 'PING') {
    chrome.storage.sync.get('klavSettings', (result) => {
      if (chrome.runtime.lastError) { sendResponse({ ok: false }); return }
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
    if (chrome.runtime.lastError) { sendResponse({ ok: false, error: chrome.runtime.lastError.message }); return }
    const current = result.klavSettings ?? {}
    const updated = { ...current, klavToken: msg.token, backendUrl: msg.backendUrl || '' }
    chrome.storage.sync.set({ klavSettings: updated }, () => {
      if (chrome.runtime.lastError) { sendResponse({ ok: false, error: chrome.runtime.lastError.message }); return }
      // Sync the live-activation config now that we have a session token (P3b: post-CONNECT, not popup-open).
      void syncConfig()
      sendResponse({ ok: true })
    })
  })
  return true
})
