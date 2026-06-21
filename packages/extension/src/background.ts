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
  // Klavity Cloud mode: the Klavity dashboard IS the ticket tracker.
  if (settings.backendUrl) return `${settings.backendUrl.replace(/\/+$/, '')}/dashboard`
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
    // New/removed monitored URLs may change which granted origins need a content script.
    void reconcileDynamicScripts()
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

// ── Dynamic content-script registration for granted monitored origins ───────────
// Passive auto-review runs ONLY on the specific origins the user/admin has granted
// (optional host permissions), registered at runtime — instead of a static <all_urls>
// content script. The click-driven "Analyze this page" / Report flows are covered by
// activeTab and need no host grant. The content MODULE is web-accessible to <all_urls>
// (see vite.config), so the loader can import it on any granted/active tab.
function contentFiles(): { js: string[]; css: string[] } {
  const cs = chrome.runtime.getManifest().content_scripts?.[0]
  return { js: cs?.js ?? [], css: cs?.css ?? [] }
}

// Monitored URL patterns ("host/path*") → host-scoped match patterns ("*://host/*").
function monitoredOrigins(config: KlavConfig | null): string[] {
  const set = new Set<string>()
  for (const p of config?.projects ?? []) {
    for (const pat of p.monitoredUrls ?? []) {
      const host = String(pat).replace(/^[a-z]+:\/\//i, '').split('/')[0].trim()
      if (host) set.add(`*://${host}/*`)
    }
  }
  return [...set]
}

// Re-register our dynamic content scripts to match the granted ∩ monitored origins.
// Clears ours first, so it also refreshes hashed file paths across extension updates
// and handles add/remove uniformly. Dynamic scripts persist across SW restarts.
async function reconcileDynamicScripts(): Promise<void> {
  if (!chrome.scripting?.registerContentScripts) return
  const config = await getConfig()
  const desired = monitoredOrigins(config)
  const granted: string[] = []
  for (const o of desired) {
    try { if (await chrome.permissions.contains({ origins: [o] })) granted.push(o) } catch { /* ignore */ }
  }
  let existing: chrome.scripting.RegisteredContentScript[] = []
  try { existing = await chrome.scripting.getRegisteredContentScripts() } catch { /* ignore */ }
  const ours = existing.filter((s) => s.id.startsWith('klav-')).map((s) => s.id)
  if (ours.length) { try { await chrome.scripting.unregisterContentScripts({ ids: ours }) } catch { /* ignore */ } }
  if (!granted.length) return
  const { js, css } = contentFiles()
  const scripts = granted.map((o) => ({
    id: 'klav-' + o, matches: [o], js, css, runAt: 'document_idle' as const,
  }))
  try { await chrome.scripting.registerContentScripts(scripts) }
  catch (e) { console.warn('[Klavity] registerContentScripts failed:', e) }
}

// ── Native context menu (hybrid) ─────────────────────────────────────────────
// The content script shows a styled overlay on a normal right-click (it preventDefaults,
// so the native menu — and these items — stay hidden then). On Shift+right-click (or the
// overlay's "Show browser menu"), the native menu IS shown, now carrying a "Klavity"
// submenu. So our actions live in BOTH places with no gesture conflict. Items only show
// on real web pages (documentUrlPatterns) — clicks route to the same openModal/tracker
// paths the overlay and popup use.
function setupContextMenus() {
  if (!chrome.contextMenus) return
  chrome.contextMenus.removeAll(() => {
    const common = { contexts: ['all'] as chrome.contextMenus.ContextType[], documentUrlPatterns: ['http://*/*', 'https://*/*'] }
    chrome.contextMenus.create({ id: 'klavity-root', title: 'Klavity', ...common })
    chrome.contextMenus.create({ id: 'klavity-bug', parentId: 'klavity-root', title: 'Report a Bug', ...common })
    chrome.contextMenus.create({ id: 'klavity-feature', parentId: 'klavity-root', title: 'Request a Feature', ...common })
    chrome.contextMenus.create({ id: 'klavity-analyze', parentId: 'klavity-root', title: 'Analyze this page', ...common })
    chrome.contextMenus.create({ id: 'klavity-sep', parentId: 'klavity-root', type: 'separator', ...common })
    chrome.contextMenus.create({ id: 'klavity-tracker', parentId: 'klavity-root', title: 'View submissions', ...common })
  })
}

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'klavity-bug' && tab?.id) void openModal(tab.id, 'bug')
  else if (info.menuItemId === 'klavity-feature' && tab?.id) void openModal(tab.id, 'feature')
  else if (info.menuItemId === 'klavity-analyze') void runAnalyze(tab)
  else if (info.menuItemId === 'klavity-tracker') {
    getSettings().then((settings) => { const url = getTrackerUrl(settings); if (url) chrome.tabs.create({ url }) })
  }
})

// The active project for context-menu actions: the popup's saved selection, else the first project.
async function activeProjectIdFor(config: KlavConfig | null): Promise<string | null> {
  const r = await chrome.storage.local.get('klavSelectedProjectId')
  const saved = r.klavSelectedProjectId as string | undefined
  const ids = (config?.projects ?? []).map((p) => p.id)
  if (saved && ids.includes(saved)) return saved
  return config?.projects?.[0]?.id ?? null
}

// How many Sims this project has. -1 = couldn't tell (offline/error) → don't block the review.
async function projectSimCount(config: KlavConfig, pid: string): Promise<number> {
  try {
    const res = await fetch(`${config.backendUrl}/api/personas?project=${encodeURIComponent(pid)}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    })
    if (!res.ok) return -1
    const d = (await res.json()) as { personas?: unknown[] }
    return Array.isArray(d.personas) ? d.personas.length : 0
  } catch {
    return -1
  }
}

// "Analyze this page" (context menu): with 0 Sims, send the user to create one; otherwise run the
// on-demand review in the tab — injecting the content module first if it isn't loaded there yet.
async function runAnalyze(tab?: chrome.tabs.Tab): Promise<void> {
  if (!tab?.id) return
  const config = await getConfig()
  const pid = await activeProjectIdFor(config)
  if (!config || !pid) {
    const settings = await getSettings()
    chrome.tabs.create({ url: `${backendBase(settings)}/dashboard` })
    return
  }
  if ((await projectSimCount(config, pid)) === 0) {
    chrome.tabs.create({ url: `${config.backendUrl}/dashboard?project=${encodeURIComponent(pid)}&create-sim=1` })
    return
  }
  const tabId = tab.id
  const msg = { kind: 'KLAV_ADHOC_REVIEW', projectId: pid }
  chrome.tabs.sendMessage(tabId, msg).catch(() => {
    const cs = chrome.runtime.getManifest().content_scripts?.[0]
    if (cs?.js?.length) {
      chrome.scripting
        .executeScript({ target: { tabId }, files: cs.js })
        .then(() => setTimeout(() => { void chrome.tabs.sendMessage(tabId, msg).catch(() => {}) }, 300))
        .catch(() => {})
    }
  })
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus()
  void syncConfig()
  void reconcileDynamicScripts() // refresh registrations (e.g. file paths after an update)
})
chrome.runtime.onStartup?.addListener?.(() => { setupContextMenus(); void syncConfig() })

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
  // Popup calls this after the user grants host permission for monitored sites, so the
  // content script is registered for the newly-granted origins without waiting for a sync.
  if (msg.kind === 'KLAV_RECONCILE_SCRIPTS') {
    reconcileDynamicScripts().then(() => sendResponse({ ok: true }))
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
    const winId = sender.tab?.windowId
    const reply = (dataUrl: string, error?: string) => {
      if (tabId != null) void safeSend(tabId, { kind: 'CAPTURE_TAB_RESULT', dataUrl, error })
    }
    // Route through the rate-limit guard (same as KLAV_CAPTURE_REVIEW) so the bug-report
    // screenshot waits out Chrome's ~2/s captureVisibleTab limit instead of flash-failing
    // the first capture (e.g. right after the SW wakes, or just after a Sim review). Try
    // the default window first, then the sender's windowId (Arc multi-window pattern).
    captureWithRateLimit().then(async (r1) => {
      if (r1.dataUrl) { reply(r1.dataUrl); return }
      if (winId != null) {
        const r2 = await captureWithRateLimit(winId)
        if (r2.dataUrl) { reply(r2.dataUrl); return }
        console.warn('[Klavity] CAPTURE_TAB failed (winId fallback):', r2.error)
        reply('', r2.error)
        return
      }
      console.warn('[Klavity] CAPTURE_TAB failed:', r1.error)
      reply('', r1.error)
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
