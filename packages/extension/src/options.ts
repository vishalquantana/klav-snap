import { DEFAULT_SETTINGS, detectTrackerUrl, dispatchSubmit } from '@klavity/core'
import { submitReport as jiraSubmit } from '@klavity/core/integrations/jira'
import { submitReport as linearSubmit } from '@klavity/core/integrations/linear'
import { submitReport as githubSubmit } from '@klavity/core/integrations/github'
import { submitReport as planeSubmit } from '@klavity/core/integrations/plane'
import { submitReport as backendSubmit } from '@klavity/core/integrations/backend'
import type { KlavitySettings, IntegrationType, SubmitReportPayload } from '@klavity/core'

const $ = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement
const setVal = (id: string, v: string) => { ($(id) as HTMLInputElement).value = v }
const handlers = { jira: jiraSubmit, linear: linearSubmit, github: githubSubmit, plane: planeSubmit, backend: backendSubmit }

// Klavity account state (signed-in ⇒ reports file via the user's server-side connection)
let klavToken = ''
let klavEmail = ''
const backendUrl = () => ($('backendUrl') as HTMLInputElement).value.trim().replace(/\/+$/, '')

function showSection(integration: IntegrationType) {
  ;['jira', 'linear', 'github', 'plane'].forEach(id => {
    const el = document.getElementById(`${id}-section`)!
    el.style.display = id === integration ? '' : 'none'
  })
}

function setCloud(on: boolean) {
  ;($('cloudToggle') as HTMLInputElement).checked = on
  document.getElementById('cloud-fields')!.style.display = on ? '' : 'none'
}

async function load() {
  const result = await chrome.storage.sync.get(['klavSettings', 'klavEmail'])
  const s: KlavitySettings = { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }
  klavToken = s.klavToken || ''
  klavEmail = result.klavEmail || ''

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
  ;($('plane-host') as HTMLInputElement).value = s.plane.host || 'https://api.plane.so'
  ;($('plane-workspace') as HTMLInputElement).value = s.plane.workspace
  ;($('plane-projectId') as HTMLInputElement).value = s.plane.projectId
  ;($('backendUrl') as HTMLInputElement).value = s.backendUrl
  setCloud(!!s.backendUrl)
  ;($('autoFileErrors') as HTMLInputElement).checked = s.autoFileErrors

  showSection(s.integration)
  renderAccount()
}

$('integration').addEventListener('change', (e) => {
  showSection((e.target as HTMLSelectElement).value as IntegrationType)
})

$('cloudToggle').addEventListener('change', (e) => {
  setCloud((e.target as HTMLInputElement).checked)
})

// ── paste any tracker URL → detect the tracker, switch to it, and fill its fields ──
$('smart-url').addEventListener('input', (e) => {
  const d = detectTrackerUrl((e.target as HTMLInputElement).value)
  const ok = document.getElementById('smart-url-ok')!
  if (!d) { ok.classList.remove('show'); return }

  ;($('integration') as HTMLSelectElement).value = d.integration
  showSection(d.integration)
  if (d.plane) { setVal('plane-host', d.plane.host); setVal('plane-workspace', d.plane.workspace); setVal('plane-projectId', d.plane.projectId) }
  if (d.jira) { setVal('jira-baseUrl', d.jira.baseUrl); if (d.jira.projectKey) setVal('jira-projectKey', d.jira.projectKey) }
  if (d.github) { setVal('github-repo', d.github.repo) }

  const label: Record<string, string> = { plane: 'Plane', jira: 'Jira', github: 'GitHub', linear: 'Linear' }
  ok.textContent = d.integration === 'linear'
    ? '✓ Detected Linear — add your API key + team ID below'
    : `✓ Detected ${label[d.integration]} — fields filled, just add your token`
  ok.classList.add('show')
  markDirty() // detected integration + filled fields are an unsaved change → triggers auto-save
})

function readSettings(): KlavitySettings {
  const cloudOn = ($('cloudToggle') as HTMLInputElement).checked
  return {
    integration: ($('integration') as HTMLSelectElement).value as IntegrationType,
    backendUrl: cloudOn ? ($('backendUrl') as HTMLInputElement).value.trim() : '',
    autoFileErrors: ($('autoFileErrors') as HTMLInputElement).checked,
    connectionMode: cloudOn && klavToken ? 'klavity' : 'direct',
    klavToken,
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
      host: ($('plane-host') as HTMLInputElement).value.trim() || 'https://api.plane.so',
      workspace: ($('plane-workspace') as HTMLInputElement).value.trim(),
      projectId: ($('plane-projectId') as HTMLInputElement).value.trim(),
    },
  }
}

const resultEl = () => document.getElementById('testResult')!
function showResult(ok: boolean, html: string) {
  const el = resultEl()
  el.className = 'testresult ' + (ok ? 'ok' : 'err')
  el.innerHTML = html
}
async function withButton(id: string, busyLabel: string, fn: () => Promise<void>) {
  const btn = $(id) as HTMLButtonElement
  const label = btn.textContent
  btn.disabled = true; btn.textContent = busyLabel
  try { await fn() } finally { btn.disabled = false; btn.textContent = label }
}

// Lightweight authenticated check. Validates the RESPONSE SHAPE, not just the
// status — a self-hosted app often returns its SPA HTML with a 200 for unknown
// API paths, which would otherwise look like a false "connected".
async function testConnection(s: KlavitySettings): Promise<{ ok: boolean; msg: string }> {
  const asJson = async (r: Response): Promise<any> => { try { return await r.json() } catch { return null } }
  const looksLikePlane = (host: string) => /plane/i.test(host)
  try {
    if (s.backendUrl) {
      const r = await fetch(`${s.backendUrl.replace(/\/+$/, '')}/api/me`)
      return { ok: r.ok, msg: r.ok ? `Reached Klavity backend at ${s.backendUrl}` : `Backend responded ${r.status}` }
    }
    switch (s.integration) {
      case 'plane': {
        const base = (s.plane.host || 'https://api.plane.so').replace(/\/+$/, '')
        const r = await fetch(`${base}/api/v1/workspaces/${s.plane.workspace}/projects/${s.plane.projectId}/`, { headers: { 'X-API-Key': s.plane.token } })
        const d = await asJson(r)
        if (r.ok && d && d.id) return { ok: true, msg: `Connected to Plane project "${d.name ?? s.plane.projectId}"` }
        if (r.ok) return { ok: false, msg: `Reached ${base} but it didn't return the Plane API (got HTML?) — check the Host / Workspace / Project ID.` }
        return { ok: false, msg: `Plane ${r.status}: ${(typeof d === 'object' ? JSON.stringify(d) : '').slice(0, 180) || 'request rejected (token / project?)'}` }
      }
      case 'jira': {
        const base = s.jira.baseUrl.replace(/\/+$/, '')
        const r = await fetch(`${base}/rest/api/3/myself`, { headers: { Authorization: `Basic ${btoa(`${s.jira.email}:${s.jira.token}`)}`, Accept: 'application/json' } })
        const d = await asJson(r)
        if (r.ok && d && d.accountId) return { ok: true, msg: `Authenticated to Jira as ${d.displayName ?? d.emailAddress ?? 'user'}` }
        if (r.ok) return { ok: false, msg: looksLikePlane(base) ? `That Base URL is a Plane server, not Jira — switch Active Integration to Plane and re-paste the URL.` : `Reached ${base} but it didn't respond like the Jira API — wrong Base URL?` }
        return { ok: false, msg: `Jira ${r.status} (check email / API token / Base URL).` }
      }
      case 'github': {
        const r = await fetch(`https://api.github.com/repos/${s.github.repo}`, { headers: { Authorization: `Bearer ${s.github.token}`, Accept: 'application/vnd.github+json' } })
        const d = await asJson(r)
        if (r.ok && d && d.full_name) return { ok: true, msg: `Connected to GitHub repo ${d.full_name}` }
        return { ok: false, msg: `GitHub ${r.status} (check the token scope / repo).` }
      }
      case 'linear': {
        const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: s.linear.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ viewer { id name } }' }) })
        const d = await asJson(r)
        if (d?.data?.viewer?.id) return { ok: true, msg: `Authenticated to Linear as ${d.data.viewer.name}` }
        return { ok: false, msg: `Linear ${r.status} (check the API key).` }
      }
    }
    return { ok: false, msg: 'Pick an integration first.' }
  } catch (e) {
    return { ok: false, msg: `Request failed: ${(e as Error).message} (check the host / network)` }
  }
}

// Files a real "Klavity test ticket" through the same path a bug report uses.
function insertTestTicket(s: KlavitySettings) {
  const payload: SubmitReportPayload = {
    type: 'bug',
    description: 'Klavity Snap — test ticket (connection check). Safe to delete.',
    context: {
      pageUrl: location.href,
      userAgent: navigator.userAgent,
      screenSize: `${screen.width}x${screen.height}`,
      viewportSize: `${innerWidth}x${innerHeight}`,
      consoleErrors: [],
      networkFailures: [],
    },
    screenshots: [],
  }
  return dispatchSubmit(payload, s, handlers)
}

$('test').addEventListener('click', () => withButton('test', 'Testing…', async () => {
  showResult(true, 'Testing connection…')
  const r = await testConnection(readSettings())
  showResult(r.ok, (r.ok ? '✓ ' : '✗ ') + r.msg)
}))

$('testTicket').addEventListener('click', () => withButton('testTicket', 'Filing…', async () => {
  showResult(true, 'Filing a test ticket…')
  try {
    const res = await insertTestTicket(readSettings())
    showResult(true, `✓ Created test ticket <b>${res.issueKey}</b> — <a href="${res.issueUrl}" target="_blank" rel="noopener">open in tracker ↗</a>`)
  } catch (e) {
    showResult(false, '✗ ' + (e as Error).message)
  }
}))

// ── persistent save state: Unsaved → Saving → Saved ──
type SaveState = 'dirty' | 'saving' | 'saved'
function setSaveState(st: SaveState) {
  const row = document.getElementById('saveState')!
  const text = document.getElementById('saveStateText')!
  const btn = $('save') as HTMLButtonElement
  row.className = 'savestate ' + st
  btn.classList.toggle('dirty', st === 'dirty')
  btn.classList.toggle('clean', st === 'saved')
  btn.disabled = st !== 'dirty' // only clickable when there are unsaved changes
  if (st === 'dirty') { text.textContent = 'Unsaved changes'; btn.textContent = 'Save Settings' }
  else if (st === 'saving') { text.textContent = 'Saving…' }
  else { text.textContent = 'All changes saved'; btn.textContent = '✓ Saved' }
}

async function persist() {
  setSaveState('saving')
  await chrome.storage.sync.set({ klavSettings: readSettings() })
  setSaveState('saved')
}

// Auto-save so nothing is ever lost (e.g. reloading the extension before clicking Save).
// Switching the integration keeps every tracker's fields — each lives in storage.
let saveTimer: ReturnType<typeof setTimeout> | undefined
function markDirty() {
  setSaveState('dirty')
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { void persist() }, 600)
}
document.addEventListener('input', markDirty)
document.addEventListener('change', markDirty)

$('save').addEventListener('click', () => { clearTimeout(saveTimer); void persist() })

// ── Klavity account: email→OTP sign-in, personal connection synced to the account ──
const klavMsg = () => document.getElementById('klav-msg')!
function setKlavMsg(ok: boolean | null, text: string) {
  const el = klavMsg()
  el.className = 'testresult' + (ok === true ? ' ok' : ok === false ? ' err' : '')
  el.textContent = text
}

function renderAccount() {
  const signedIn = !!klavToken
  document.getElementById('klav-signedout')!.style.display = signedIn ? 'none' : ''
  document.getElementById('klav-signedin')!.style.display = signedIn ? '' : 'none'
  if (signedIn) {
    ;(document.getElementById('klav-who') as HTMLElement).textContent = klavEmail || 'your Klavity account'
    void loadPersonal()
  }
}

async function loadPersonal() {
  const url = backendUrl()
  if (!url || !klavToken) return
  try {
    const r = await fetch(`${url}/api/integration/personal`, { headers: { Authorization: `Bearer ${klavToken}` } })
    if (!r.ok) return
    const d = await r.json()
    if (d?.config) {
      setVal('pers-host', d.config.host || 'https://api.plane.so')
      setVal('pers-workspace', d.config.workspace || '')
      setVal('pers-projectId', d.config.projectId || '')
      ;($('pers-token') as HTMLInputElement).placeholder = d.config.hasToken ? '•••• saved — leave blank to keep' : 'API token'
    }
  } catch { /* ignore */ }
}

async function sendCode() {
  const url = backendUrl()
  const email = ($('klav-email') as HTMLInputElement).value.trim()
  if (!url) return setKlavMsg(false, 'Set the Backend URL first.')
  if (!email.includes('@')) return setKlavMsg(false, 'Enter a valid email.')
  setKlavMsg(null, 'Sending code…')
  try {
    const r = await fetch(`${url}/api/auth/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const d = await r.json().catch(() => ({} as any))
    if (!r.ok) return setKlavMsg(false, d.error || `Request failed (${r.status})`)
    document.getElementById('klav-otp-row')!.style.display = ''
    setKlavMsg(true, d.devCode ? `Dev code: ${d.devCode}` : 'Code sent — check your email.')
  } catch (e) { setKlavMsg(false, (e as Error).message) }
}

async function verifyCode() {
  const url = backendUrl()
  const email = ($('klav-email') as HTMLInputElement).value.trim()
  const code = ($('klav-code') as HTMLInputElement).value.trim()
  setKlavMsg(null, 'Signing in…')
  try {
    const r = await fetch(`${url}/api/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) })
    const d = await r.json().catch(() => ({} as any))
    if (!r.ok || !d.token) return setKlavMsg(false, d.error || 'Invalid or expired code.')
    klavToken = d.token; klavEmail = email
    await chrome.storage.sync.set({ klavEmail })
    await persist() // writes klavToken + connectionMode into settings
    document.getElementById('klav-otp-row')!.style.display = 'none'
    setKlavMsg(null, '')
    renderAccount()
  } catch (e) { setKlavMsg(false, (e as Error).message) }
}

async function signOut() {
  klavToken = ''; klavEmail = ''
  await chrome.storage.sync.set({ klavEmail: '' })
  await persist()
  renderAccount()
  setKlavMsg(null, '')
}

async function savePersonal() {
  const url = backendUrl()
  const msg = document.getElementById('pers-result')!
  const setMsg = (ok: boolean | null, t: string) => { msg.className = 'testresult' + (ok === true ? ' ok' : ok === false ? ' err' : ''); msg.textContent = t }
  if (!url || !klavToken) return setMsg(false, 'Sign in first.')
  const form = new FormData()
  const tok = ($('pers-token') as HTMLInputElement).value.trim()
  if (tok) form.set('token', tok)
  form.set('host', ($('pers-host') as HTMLInputElement).value.trim() || 'https://api.plane.so')
  form.set('workspace', ($('pers-workspace') as HTMLInputElement).value.trim())
  form.set('project_id', ($('pers-projectId') as HTMLInputElement).value.trim())
  setMsg(null, 'Saving…')
  try {
    const r = await fetch(`${url}/api/integration/personal`, { method: 'POST', headers: { Authorization: `Bearer ${klavToken}` }, body: form })
    const d = await r.json().catch(() => ({} as any))
    if (!r.ok) return setMsg(false, d.error || `Failed (${r.status})`)
    ;($('pers-token') as HTMLInputElement).value = ''
    ;($('pers-token') as HTMLInputElement).placeholder = '•••• saved — leave blank to keep'
    setMsg(true, '✓ Personal connection saved (synced to your account).')
  } catch (e) { setMsg(false, (e as Error).message) }
}

$('klav-send').addEventListener('click', () => void sendCode())
$('klav-verify').addEventListener('click', () => void verifyCode())
$('klav-signout').addEventListener('click', () => void signOut())
$('pers-save').addEventListener('click', () => void savePersonal())

load().then(() => setSaveState('saved'))
