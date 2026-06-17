import type { BackgroundMessage, ContentMessage, KlavitySettings, ReportType } from '@klavity/core'
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

chrome.runtime.onInstalled.addListener(() => {
  // Native context menu replaced by custom overlay in content script.
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
      sendResponse({ ok: true })
    })
  })
  return true
})
