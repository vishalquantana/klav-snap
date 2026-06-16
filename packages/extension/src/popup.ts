import { DEFAULT_SETTINGS } from '@klavity/core'
import type { KlavitySettings } from '@klavity/core'

interface Sim { id: string; name: string; role: string; accent: string; initials: string; enabled: boolean }
interface Recent { type: string; desc: string; issueKey: string; issueUrl: string; ts: number }

// ── Settings ─────────────────────────────────────────────────────────────────
const result = await chrome.storage.sync.get('klavSettings')
const s: KlavitySettings = { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }

// ── Status dot ───────────────────────────────────────────────────────────────
const dot = document.getElementById('status-dot')!
const label = document.getElementById('status-label')!
const configured = s.jira.baseUrl || s.linear.apiKey || s.github.token || s.plane.token || s.backendUrl
if (configured) {
  dot.className = 'status-dot'
  label.textContent = `${s.integration}${s.backendUrl ? ' · cloud' : ' · direct'}`
} else {
  dot.className = 'status-dot err'
  label.textContent = 'Not configured'
}

// ── Tracker link ─────────────────────────────────────────────────────────────
const trackerLink = document.getElementById('tracker-link') as HTMLAnchorElement
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

// ── Settings button ──────────────────────────────────────────────────────────
document.getElementById('open-options')!.addEventListener('click', () => chrome.runtime.openOptionsPage())
document.getElementById('manage-sims')!.addEventListener('click', () => {
  const url = s.backendUrl || 'https://klavity.quantana.top'
  chrome.tabs.create({ url: `${url}/app` })
})

// ── Quick report buttons ──────────────────────────────────────────────────────
async function openModal(type: 'bug' | 'feature') {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  chrome.tabs.sendMessage(tab.id, { kind: 'OPEN_MODAL', reportType: type }).catch(() => {
    // Content script not yet injected — inject it first
    const cs = chrome.runtime.getManifest().content_scripts?.[0]
    if (cs?.js?.length) {
      chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: cs.js }).then(() => {
        setTimeout(() => chrome.tabs.sendMessage(tab.id!, { kind: 'OPEN_MODAL', reportType: type }).catch(() => {}), 300)
      }).catch(() => {})
    }
  })
  window.close()
}
document.getElementById('btn-bug')!.addEventListener('click', () => openModal('bug'))
document.getElementById('btn-feat')!.addEventListener('click', () => openModal('feature'))

// ── Sims ─────────────────────────────────────────────────────────────────────
const simsData = await chrome.storage.local.get('klavSims')
let sims: Sim[] = simsData.klavSims ?? []
const simsList = document.getElementById('sims-list')!

// Sync saved sims from backend when logged in
if (s.backendUrl && s.klavToken) {
  try {
    const r = await fetch(`${s.backendUrl}/api/personas`, { headers: { Authorization: `Bearer ${s.klavToken}` } })
    if (r.ok) {
      const d = await r.json()
      if (Array.isArray(d.personas) && d.personas.length) {
        // Merge backend sims with local, preserving enabled state
        const enabledMap = new Map(sims.map(s => [s.id, s.enabled]))
        const synced: Sim[] = d.personas.map((p: any) => ({
          id: p.id, name: p.name, role: p.role || '',
          accent: p.accent || '#6366f1',
          initials: p.initials || p.name.slice(0, 2).toUpperCase(),
          enabled: enabledMap.get(p.id) ?? true,
        }))
        sims = synced
        await chrome.storage.local.set({ klavSims: sims })
      }
    }
  } catch { /* offline or not logged in */ }
}

function renderSims() {
  simsList.innerHTML = ''
  if (sims.length === 0) {
    simsList.innerHTML = `
      <div class="empty-state">No sims yet. Build them in Klavity Studio.</div>
      <a class="empty-link" id="add-sim-link" href="#" style="text-align:center;">+ Open Sim Studio →</a>
    `
    document.getElementById('add-sim-link')?.addEventListener('click', (e) => {
      e.preventDefault()
      const url = s.backendUrl || 'https://klavity.quantana.top'
      chrome.tabs.create({ url: `${url}/app` })
    })
    return
  }
  sims.forEach((sim, i) => {
    const row = document.createElement('div')
    row.className = 'sim-row'
    const toggleId = `toggle-${i}`
    row.innerHTML = `
      <div class="sim-avatar" style="background:${sim.accent || '#6366f1'}">${sim.initials}</div>
      <div class="sim-info">
        <div class="sim-name">${sim.name}</div>
        <div class="sim-role">${sim.role}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="${toggleId}" ${sim.enabled ? 'checked' : ''}>
        <div class="toggle-track"></div>
      </label>
    `
    row.querySelector(`#${toggleId}`)!.addEventListener('change', async (e) => {
      sim.enabled = (e.target as HTMLInputElement).checked
      await chrome.storage.local.set({ klavSims: sims })
    })
    simsList.appendChild(row)
  })
}
renderSims()

// ── Recent submissions ────────────────────────────────────────────────────────
const recentData = await chrome.storage.local.get('klavRecent')
const recent: Recent[] = recentData.klavRecent ?? []
const recentList = document.getElementById('recent-list')!

function timeAgo(ts: number) {
  const s2 = Math.round((Date.now() - ts) / 1000)
  if (s2 < 60) return 'just now'
  if (s2 < 3600) return `${Math.round(s2 / 60)}m ago`
  if (s2 < 86400) return `${Math.round(s2 / 3600)}h ago`
  return `${Math.round(s2 / 86400)}d ago`
}

if (recent.length === 0) {
  recentList.innerHTML = '<div class="empty-state">No submissions yet. Right-click to report.</div>'
} else {
  recent.slice(0, 5).forEach((item) => {
    const row = document.createElement('div')
    row.className = 'recent-row'
    row.title = item.issueUrl
    const isBug = item.type === 'bug'
    const bugIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:${isBug ? '#E94F37' : '#a78bfa'}"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z"/></svg>`
    const featIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#a78bfa"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/></svg>`
    row.innerHTML = `
      <div class="recent-icon ${isBug ? 'bug' : 'feat'}">${isBug ? bugIcon : featIcon}</div>
      <div class="recent-desc">
        <div class="recent-text">${item.desc}</div>
        <div class="recent-meta">${timeAgo(item.ts)}</div>
      </div>
      <span class="recent-key">${item.issueKey}</span>
    `
    row.addEventListener('click', () => { if (item.issueUrl) chrome.tabs.create({ url: item.issueUrl }) })
    recentList.appendChild(row)
  })
}
