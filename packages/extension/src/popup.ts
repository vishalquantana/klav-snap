import { DEFAULT_SETTINGS } from '@klav/core'
import type { KlavSettings } from '@klav/core'

document.getElementById('open-options')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

async function init() {
  const result = await chrome.storage.sync.get('klavSettings')
  const s: KlavSettings = { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }

  const line = document.getElementById('status-line')!
  const link = document.getElementById('tracker-link') as HTMLAnchorElement

  const configured = s.jira.baseUrl || s.linear.apiKey || s.github.token || s.plane.token || s.backendUrl
  if (!configured) {
    line.textContent = '⚠️ No integration configured. Open Settings.'
  } else {
    line.textContent = `Active: ${s.integration}${s.backendUrl ? ' (cloud)' : ' (direct)'}`
  }

  switch (s.integration) {
    case 'jira': link.href = s.jira.baseUrl ? `${s.jira.baseUrl}/browse` : '#'; break
    case 'linear': link.href = 'https://linear.app'; break
    case 'github': link.href = s.github.repo ? `https://github.com/${s.github.repo}/issues` : '#'; break
    case 'plane': link.href = s.plane.workspace ? `https://app.plane.so/${s.plane.workspace}` : '#'; break
  }
}

init()
