import type { BackgroundMessage, ContentMessage, KlavSettings } from '@klav/core'
import { DEFAULT_SETTINGS } from '@klav/core'
import { dispatchSubmit } from '@klav/core/submit'
import { submitReport as jiraSubmit } from '@klav/core/integrations/jira'
import { submitReport as linearSubmit } from '@klav/core/integrations/linear'
import { submitReport as githubSubmit } from '@klav/core/integrations/github'
import { submitReport as planeSubmit } from '@klav/core/integrations/plane'
import { submitReport as backendSubmit } from '@klav/core/integrations/backend'

async function getSettings(): Promise<KlavSettings> {
  const result = await chrome.storage.sync.get('klavSettings')
  return { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }
}

function getTrackerUrl(settings: KlavSettings): string {
  switch (settings.integration) {
    case 'jira': return settings.jira.baseUrl ? `${settings.jira.baseUrl}/browse` : ''
    case 'linear': return 'https://linear.app'
    case 'github': return settings.github.repo ? `https://github.com/${settings.github.repo}/issues` : ''
    case 'plane': return settings.plane.workspace ? `https://app.plane.so/${settings.plane.workspace}` : ''
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'klav-bug', title: '🐛 Report a Bug', contexts: ['all'] })
  chrome.contextMenus.create({ id: 'klav-feature', title: '💡 Request a Feature', contexts: ['all'] })
  chrome.contextMenus.create({ id: 'klav-history', title: '📋 View submissions', contexts: ['all'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return

  if (info.menuItemId === 'klav-history') {
    const settings = await getSettings()
    const url = getTrackerUrl(settings)
    if (url) chrome.tabs.create({ url })
    return
  }

  const reportType = info.menuItemId === 'klav-bug' ? 'bug' : 'feature'
  chrome.tabs.sendMessage(tab.id, { kind: 'OPEN_MODAL', reportType } satisfies ContentMessage)
})

chrome.runtime.onMessage.addListener((msg: BackgroundMessage, sender, sendResponse) => {
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
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      const tabId = sender.tab?.id
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { kind: 'CAPTURE_TAB_RESULT', dataUrl } satisfies ContentMessage)
      }
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
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { kind: 'SUBMIT_SUCCESS', ...result } satisfies ContentMessage)
      }
    }).catch(err => {
      const tabId = sender.tab?.id
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { kind: 'SUBMIT_ERROR', message: String(err.message) } satisfies ContentMessage)
      }
    })
    return true
  }
})
