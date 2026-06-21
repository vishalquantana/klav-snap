import { DEFAULT_SETTINGS, dispatchSubmit } from '@klavity/core'
import { submitReport as backendSubmit } from '@klavity/core/integrations/backend'
import type { KlavitySettings, SubmitReportPayload } from '@klavity/core'
import { icon } from '@klavity/core/icons'

const $ = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement
function escHtml(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
const setVal = (id: string, v: string) => { ($(id) as HTMLInputElement).value = v }
const handlers = { backend: backendSubmit }

// Klavity account state (signed-in ⇒ reports file via the user's server-side connection)
let klavToken = ''
let klavEmail = ''
const backendUrl = () => ($('backendUrl') as HTMLInputElement).value.trim().replace(/\/+$/, '')

function setCloud(on: boolean) {
  ;($('cloudToggle') as HTMLInputElement).checked = on
  document.getElementById('cloud-fields')!.style.display = on ? '' : 'none'
}

async function load() {
  const result = await chrome.storage.sync.get(['klavSettings', 'klavEmail'])
  const s: KlavitySettings = { ...DEFAULT_SETTINGS, ...(result.klavSettings ?? {}) }
  klavToken = s.klavToken || ''
  klavEmail = result.klavEmail || ''

  ;($('backendUrl') as HTMLInputElement).value = s.backendUrl
  setCloud(!!s.backendUrl)
  ;($('autoFileErrors') as HTMLInputElement).checked = s.autoFileErrors

  // Global Sims kill-switch lives in chrome.storage.local (the content script reads it
  // there). Defaults to ON: a missing/undefined flag means enabled.
  const local = await chrome.storage.local.get('klavSimsEnabled')
  ;($('simsEnabled') as HTMLInputElement).checked = local.klavSimsEnabled !== false

  renderAccount()
}

// Persist the Sims toggle straight to chrome.storage.local (separate from klavSettings).
$('simsEnabled').addEventListener('change', (e) => {
  void chrome.storage.local.set({ klavSimsEnabled: (e.target as HTMLInputElement).checked })
})

$('cloudToggle').addEventListener('change', (e) => {
  setCloud((e.target as HTMLInputElement).checked)
})

function readSettings(): KlavitySettings {
  const cloudOn = ($('cloudToggle') as HTMLInputElement).checked
  return {
    ...DEFAULT_SETTINGS,
    backendUrl: cloudOn ? ($('backendUrl') as HTMLInputElement).value.trim() : '',
    autoFileErrors: ($('autoFileErrors') as HTMLInputElement).checked,
    connectionMode: cloudOn && klavToken ? 'klavity' : 'direct',
    klavToken,
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
  try {
    if (s.backendUrl) {
      const r = await fetch(`${s.backendUrl.replace(/\/+$/, '')}/api/me`)
      return { ok: r.ok, msg: r.ok ? `Reached Klavity backend at ${s.backendUrl}` : `Backend responded ${r.status}` }
    }
    return { ok: false, msg: 'Enable Klavity Cloud and enter a Backend URL to test the connection.' }
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
  showResult(r.ok, (r.ok ? icon('check-circle') + ' ' : icon('x-circle') + ' ') + escHtml(r.msg))
}))

$('testTicket').addEventListener('click', () => withButton('testTicket', 'Filing…', async () => {
  showResult(true, 'Filing a test ticket…')
  try {
    const res = await insertTestTicket(readSettings())
    showResult(true, `${icon('check-circle')} Created test ticket <b>${escHtml(res.issueKey)}</b> — <a href="${escHtml(res.issueUrl)}" target="_blank" rel="noopener">open in tracker ↗</a>`)
  } catch (e) {
    showResult(false, icon('x-circle') + ' ' + escHtml((e as Error).message))
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
  else { text.textContent = 'All changes saved'; btn.innerHTML = icon('check-circle') + ' Saved' }
}

async function persist() {
  setSaveState('saving')
  await chrome.storage.sync.set({ klavSettings: readSettings() })
  setSaveState('saved')
}

// Auto-save so nothing is ever lost (e.g. reloading the extension before clicking Save).
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
    setMsg(true, 'Personal connection saved (synced to your account).')
  } catch (e) { setMsg(false, (e as Error).message) }
}

$('klav-send').addEventListener('click', () => void sendCode())
$('klav-verify').addEventListener('click', () => void verifyCode())
$('klav-signout').addEventListener('click', () => void signOut())
$('pers-save').addEventListener('click', () => void savePersonal())

load().then(() => setSaveState('saved'))
