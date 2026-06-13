import { DEFAULT_SETTINGS } from '@klav/core'
import type { KlavSettings, IntegrationType } from '@klav/core'

const $ = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement

function showSection(integration: IntegrationType) {
  ;['jira', 'linear', 'github', 'plane'].forEach(id => {
    const el = document.getElementById(`${id}-section`)!
    el.style.display = id === integration ? '' : 'none'
  })
}

async function load() {
  const result = await chrome.storage.sync.get('klavSettings')
  const s: KlavSettings = { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }

  ;($('integration') as HTMLSelectElement).value = s.integration
  ;($('jira-baseUrl') as HTMLInputElement).value = s.jira.baseUrl
  ;($('jira-email') as HTMLInputElement).value = s.jira.email
  ;($('jira-token') as HTMLInputElement).value = s.jira.token
  ;($('jira-projectKey') as HTMLInputElement).value = s.jira.projectKey
  ;($('linear-apiKey') as HTMLInputElement).value = s.linear.apiKey
  ;($('linear-teamId') as HTMLInputElement).value = s.linear.teamId
  ;($('github-token') as HTMLInputElement).value = s.github.token
  ;($('github-repo') as HTMLInputElement).value = s.github.repo
  ;($('plane-token') as HTMLInputElement).value = s.plane.token
  ;($('plane-workspace') as HTMLInputElement).value = s.plane.workspace
  ;($('plane-projectId') as HTMLInputElement).value = s.plane.projectId
  ;($('backendUrl') as HTMLInputElement).value = s.backendUrl
  ;($('autoFileErrors') as HTMLInputElement).checked = s.autoFileErrors

  showSection(s.integration)
}

$('integration').addEventListener('change', (e) => {
  showSection((e.target as HTMLSelectElement).value as IntegrationType)
})

$('save').addEventListener('click', async () => {
  const settings: KlavSettings = {
    integration: ($('integration') as HTMLSelectElement).value as IntegrationType,
    backendUrl: ($('backendUrl') as HTMLInputElement).value.trim(),
    autoFileErrors: ($('autoFileErrors') as HTMLInputElement).checked,
    jira: {
      baseUrl: ($('jira-baseUrl') as HTMLInputElement).value.trim(),
      email: ($('jira-email') as HTMLInputElement).value.trim(),
      token: ($('jira-token') as HTMLInputElement).value.trim(),
      projectKey: ($('jira-projectKey') as HTMLInputElement).value.trim(),
    },
    linear: {
      apiKey: ($('linear-apiKey') as HTMLInputElement).value.trim(),
      teamId: ($('linear-teamId') as HTMLInputElement).value.trim(),
    },
    github: {
      token: ($('github-token') as HTMLInputElement).value.trim(),
      repo: ($('github-repo') as HTMLInputElement).value.trim(),
    },
    plane: {
      token: ($('plane-token') as HTMLInputElement).value.trim(),
      workspace: ($('plane-workspace') as HTMLInputElement).value.trim(),
      projectId: ($('plane-projectId') as HTMLInputElement).value.trim(),
    },
  }
  await chrome.storage.sync.set({ klavSettings: settings })
  const status = document.getElementById('status')!
  status.textContent = '✓ Saved'
  setTimeout(() => { status.textContent = '' }, 2000)
})

load()
