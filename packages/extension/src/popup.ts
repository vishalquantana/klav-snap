import { DEFAULT_SETTINGS } from '@klavity/core'
import type { KlavitySettings } from '@klavity/core'
import { trySilentLogin, requestCode, verifyCode, isSignedIn, getConfig, getSelectedProjectId, setSelectedProjectId, pickProject, signOut } from './auth'

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
  $('auth-sub').textContent = "Enter your email and we'll send a 6-digit code."
  $('auth-form').classList.remove('hidden')
}

// ── Signed-out (auth) wiring ────────────────────────────────────────────
let stage: 'email' | 'code' = 'email'
let pendingEmail = ''
const emailEl = $('auth-email') as HTMLInputElement
const codeEl = $('auth-code') as HTMLInputElement
const submitEl = $('auth-submit') as HTMLButtonElement
const silentEl = $('auth-silent') as HTMLButtonElement
const codeActionsEl = $('auth-code-actions')
const resendEl = $('auth-resend') as HTMLAnchorElement
const changeEmailEl = $('auth-change-email') as HTMLAnchorElement
const errEl = $('auth-err')

function setErr(msg: string) { errEl.textContent = msg }

// Move to the code-entry stage: hide email, show code + resend/change-email, hide the
// secondary "site login" path (only relevant before a code is requested), arm the cooldown.
function goCodeStage() {
  stage = 'code'
  emailEl.classList.add('hidden')
  codeEl.classList.remove('hidden')
  codeEl.value = ''
  codeEl.focus()
  submitEl.textContent = 'Verify'
  codeActionsEl.classList.remove('hidden')
  silentEl.classList.add('hidden')
  $('auth-sub').textContent = `We emailed a code to ${pendingEmail}. It expires in 10 minutes.`
  startResendCooldown(30)
}

// Back to the email stage (from "Change email"), resetting everything.
function goEmailStage() {
  stage = 'email'
  setErr('')
  if (resendTimer) { clearInterval(resendTimer); resendTimer = undefined }
  codeEl.value = ''
  codeEl.classList.add('hidden')
  emailEl.classList.remove('hidden')
  emailEl.focus()
  submitEl.textContent = 'Send code'
  codeActionsEl.classList.add('hidden')
  silentEl.classList.remove('hidden')
  $('auth-sub').textContent = "Enter your email and we'll send a 6-digit code."
}

let resendTimer: ReturnType<typeof setInterval> | undefined
function startResendCooldown(secs: number) {
  resendEl.classList.add('disabled')
  let left = secs
  const tick = () => {
    if (left <= 0) {
      resendEl.textContent = 'Resend code'
      resendEl.classList.remove('disabled')
      if (resendTimer) { clearInterval(resendTimer); resendTimer = undefined }
      return
    }
    resendEl.textContent = `Resend in ${left}s`
    left--
  }
  tick()
  resendTimer = setInterval(tick, 1000)
}

submitEl.addEventListener('click', async () => {
  setErr('')
  if (stage === 'email') {
    pendingEmail = emailEl.value.trim()
    if (!pendingEmail.includes('@')) { setErr('Enter a valid email.'); return }
    submitEl.disabled = true; submitEl.textContent = 'Sending…'
    const r = await requestCode(pendingEmail)
    submitEl.disabled = false
    if (!r.ok) { submitEl.textContent = 'Send code'; setErr(r.error || 'Could not send code.'); return }
    goCodeStage()
  } else {
    const code = codeEl.value.trim()
    if (!/^\d{4,8}$/.test(code)) { setErr('Enter the code from your email.'); return }
    submitEl.disabled = true; submitEl.textContent = 'Verifying…'
    const r = await verifyCode(pendingEmail, code)
    submitEl.disabled = false
    submitEl.textContent = 'Verify'
    if (!r.ok) { setErr(r.error || 'Invalid or expired code.'); codeEl.value = ''; codeEl.focus(); return }
    showApp()
  }
})

resendEl.addEventListener('click', async (e) => {
  e.preventDefault()
  if (resendEl.classList.contains('disabled')) return
  setErr('')
  resendEl.classList.add('disabled'); resendEl.textContent = 'Sending…'
  const r = await requestCode(pendingEmail)
  if (!r.ok) {
    setErr(r.error || 'Could not resend code.')
    resendEl.classList.remove('disabled'); resendEl.textContent = 'Resend code'
    return
  }
  $('auth-sub').textContent = `New code sent to ${pendingEmail}. It expires in 10 minutes.`
  codeEl.value = ''; codeEl.focus()
  startResendCooldown(30)
})

changeEmailEl.addEventListener('click', (e) => { e.preventDefault(); goEmailStage() })

silentEl.addEventListener('click', async () => {
  setErr('')
  if (await trySilentLogin() && await isSignedIn()) showApp()
  else setErr('Not signed in on the website yet — enter your email above to get a code.')
})

// ── Signed-in view ──────────────────────────────────────────────────────
async function renderSignedIn() {
  const result = await chrome.storage.sync.get('klavSettings')
  const s: KlavitySettings = { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }

  // Status dot — human-readable connection state, with an actionable nudge when nothing is set up.
  const dot = $('status-dot'); const label = $('status-label')
  label.classList.remove('actionable'); label.onclick = null
  const cloud = !!s.backendUrl
  const directConfigured = !!(s.jira.baseUrl || s.linear.apiKey || s.github.token || s.plane.token)
  const niceName: Record<string, string> = { jira: 'Jira', linear: 'Linear', github: 'GitHub', plane: 'Plane' }
  if (cloud) {
    dot.className = 'status-dot'; label.textContent = 'Klavity Cloud'
  } else if (directConfigured) {
    dot.className = 'status-dot'; label.textContent = `Connected to ${niceName[s.integration] || s.integration}`
  } else {
    dot.className = 'status-dot err'; label.textContent = 'Not set up — open Settings'
    label.classList.add('actionable'); label.onclick = () => chrome.runtime.openOptionsPage()
  }

  // Tracker link — in Klavity Cloud mode the Klavity dashboard IS the ticket
  // tracker (deep-linked to the active project); for direct integrations it
  // links the connected tool. Re-evaluated once the project picker resolves.
  const trackerLink = $('tracker-link') as HTMLAnchorElement
  const setTrackerLink = (projectId: string | null) => {
    if (cloud) {
      const base = (s.backendUrl || 'https://klavity.quantana.top').replace(/\/+$/, '')
      trackerLink.href = projectId ? `${base}/dashboard?project=${encodeURIComponent(projectId)}` : `${base}/dashboard`
      return
    }
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
  }
  setTrackerLink(null)

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

  // ── Project picker ──
  // (resolved before the analyze handler so activeProjectId + projects are in scope below)
  const config = await getConfig()
  const projects = config?.projects ?? []
  const sel = $('proj-select') as HTMLSelectElement
  let activeProjectId: string | null = null

  if (projects.length) {
    const saved = await getSelectedProjectId()
    const active = pickProject(projects, saved)
    activeProjectId = active?.id ?? null
    sel.replaceChildren(...projects.map((p) => {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.name
      return opt
    }))
    sel.value = activeProjectId ?? ''
    sel.style.display = projects.length > 1 ? 'inline-block' : 'none'
    sel.addEventListener('change', async () => {
      activeProjectId = sel.value
      await setSelectedProjectId(activeProjectId)
      setTrackerLink(activeProjectId)
      await renderSims(s, activeProjectId)
    })
  }
  setTrackerLink(activeProjectId)

  // ── Ad-hoc "Analyze this page" ──
  const analyzeBtn = $('btn-analyze') as HTMLButtonElement
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const unsupported = !activeTab?.url || /^(chrome|edge|about|view-source|chrome-extension|moz-extension|data|file):|chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(activeTab.url)
  const analyzeMsg = $('analyze-msg') as HTMLDivElement
  const showAnalyzeMsg = (text: string, tone: 'err' | 'info' = 'err') => {
    analyzeMsg.textContent = text
    analyzeMsg.style.color = tone === 'err' ? 'var(--rose)' : 'var(--paper-faint)'
    analyzeMsg.style.display = 'block'
  }

  if (unsupported) {
    analyzeBtn.disabled = true
    analyzeBtn.title = "Can't analyse this page"
    showAnalyzeMsg("Can't analyse this browser page — open a website tab.", 'info')
  } else {
    analyzeBtn.onclick = async () => {
      const projectId = activeProjectId || projects[0]?.id || null
      if (!projectId) { showAnalyzeMsg('Select a project first.'); return }
      if (!activeTab?.id) { showAnalyzeMsg("Couldn't find the active tab."); return }
      const tabId = activeTab.id
      // No Sims in this project yet → walk them through creating one instead of a no-op review.
      const { klavSims } = await chrome.storage.local.get('klavSims')
      if (!Array.isArray(klavSims) || klavSims.length === 0) {
        const base = (s.backendUrl || 'https://klavity.quantana.top').replace(/\/+$/, '')
        chrome.tabs.create({ url: `${base}/dashboard?project=${encodeURIComponent(projectId)}&create-sim=1` })
        window.close()
        return
      }
      analyzeBtn.disabled = true
      analyzeMsg.style.display = 'none'
      const review = { kind: 'KLAV_ADHOC_REVIEW', projectId }
      // Reach the content script; if it isn't loaded on this tab yet, inject it then retry while the
      // crxjs loader imports the module (async). Surface any failure instead of a silent no-op.
      try {
        await chrome.tabs.sendMessage(tabId, review)
      } catch {
        const cs = chrome.runtime.getManifest().content_scripts?.[0]
        if (!cs?.js?.length) { showAnalyzeMsg("Can't run on this page."); analyzeBtn.disabled = false; return }
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: cs.js })
        } catch {
          showAnalyzeMsg("Can't run on this page — your browser blocks Klavity here."); analyzeBtn.disabled = false; return
        }
        let delivered = false
        for (let i = 0; i < 4 && !delivered; i++) {
          await new Promise((r) => setTimeout(r, 250))
          try { await chrome.tabs.sendMessage(tabId, review); delivered = true } catch { /* module still waking — retry */ }
        }
        if (!delivered) { showAnalyzeMsg('Reload the page, then try again.'); analyzeBtn.disabled = false; return }
      }
      window.close()
    }
  }

  // Sign out
  $('signout-btn').addEventListener('click', async () => { await signOut(); location.reload() })

  await renderSims(s, activeProjectId)
  await renderRecent()
  await renderGrant(config)
}

// ── Monitored-site access (optional host permissions) ────────────────────
// Passive auto-review needs a one-time host grant per whitelisted domain. List the
// monitored domains from config that aren't granted yet and offer a single "Enable"
// click; "Analyze this page" already works anywhere via activeTab and isn't gated here.
async function renderGrant(config: Awaited<ReturnType<typeof getConfig>>) {
  const wrap = $('grant-wrap')
  const hosts = [...new Set(
    (config?.projects ?? []).flatMap((p) =>
      (p.monitoredUrls ?? []).map((u) => String(u).replace(/^[a-z]+:\/\//i, '').split('/')[0].trim()).filter(Boolean),
    ),
  )]
  const ungranted: string[] = []
  for (const h of hosts) {
    const ok = await chrome.permissions.contains({ origins: [`*://${h}/*`] }).catch(() => false)
    if (!ok) ungranted.push(h)
  }
  if (!ungranted.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return }
  wrap.style.display = 'block'
  const n = ungranted.length
  wrap.innerHTML = `
    <div class="grant-card">
      <div class="grant-txt">Let your Sims auto-review your team's monitored ${n === 1 ? 'site' : 'sites'} as you browse.</div>
      <button class="grant-btn" id="grant-btn">Enable on ${n} site${n > 1 ? 's' : ''}</button>
    </div>`
  $('grant-btn').addEventListener('click', async () => {
    const granted = await chrome.permissions.request({ origins: ungranted.map((h) => `*://${h}/*`) }).catch(() => false)
    if (granted) {
      await chrome.runtime.sendMessage({ kind: 'KLAV_RECONCILE_SCRIPTS' }).catch(() => {})
      await renderGrant(config) // refresh — should now hide
    }
  })
}

// ── Sims (project-scoped fetch added in Task 4) ──────────────────────────
async function renderSims(s: KlavitySettings, projectId: string | null = null) {
  const simsData = await chrome.storage.local.get('klavSims')
  let sims: Sim[] = simsData.klavSims ?? []
  const simsList = $('sims-list')

  const cfg = await getConfig()
  const token = cfg?.token || s.klavToken
  const base = cfg?.backendUrl || s.backendUrl
  if (base && token) {
    try {
      const q = projectId ? `?project=${encodeURIComponent(projectId)}` : ''
      const r = await fetch(`${base}/api/personas${q}`, { headers: { Authorization: `Bearer ${token}` } })
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
    const ab = document.getElementById('btn-analyze') as HTMLButtonElement | null
    if (ab) {
      ab.classList.add('studio')
      ab.textContent = 'Add a Sim first →'
      ab.onclick = () => chrome.tabs.create({ url: `${base || 'https://klavity.quantana.top'}/app` })
    }
    simsList.innerHTML = `
      <div class="empty-state">No sims yet. Build them in Klavity Studio.</div>
      <a class="empty-link" id="add-sim-link" href="#" style="text-align:center;">+ Open Sim Studio →</a>`
    $('add-sim-link')?.addEventListener('click', (e) => {
      e.preventDefault()
      chrome.tabs.create({ url: `${base || 'https://klavity.quantana.top'}/app` })
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
    recentList.innerHTML = '<div class="empty-state">No reports yet. Use “Report a Bug” above to file your first.</div>'
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
