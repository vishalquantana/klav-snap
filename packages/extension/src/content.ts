import type { ContentMessage, BackgroundMessage, ReportType, SubmitReportPayload, KlavConfig, KlavMonitoredProject } from '@klavity/core'
import { buildModal, type ModalController } from '@klavity/core/modal'
import { resolveModalConfig } from '@klavity/core/modal-theme'
import { installCapture, buildReportContext, type CaptureBuffers } from '@klavity/core/capture'
import { cropDataUrl } from '@klavity/core/crop'
import { klavContentSig, shouldCapture, DEBOUNCE_MS, ROUTE_COOLDOWN_MS, MAX_REVIEWS_PER_ROUTE } from './feedback-trigger'
import { widgetPresent } from './coexist'
import { makeCaptureAwaiter } from './capture-bridge'

// ── Error + network capture ring buffer (shared @klavity/core/capture, full fidelity G3) ──
const _buffers: CaptureBuffers = { consoleErrors: [], networkFailures: [] }

// ── Context validity check & Toast helper ────────────────────────────────────
function isContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined' && !!chrome.runtime.getManifest()
  } catch (e) {
    return false
  }
}

function showToast(message: string) {
  const existing = document.getElementById('klavity-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'klavity-toast'
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translate(-50%, 20px);
    background: #2D2A26;
    color: #FBF6EE;
    padding: 12px 20px;
    border-radius: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
    z-index: 2147483647;
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 8px;
  `
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F4A93C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span>${message}</span>
  `
  document.body.appendChild(toast)

  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translate(-50%, 0)'
  })

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translate(-50%, -10px)'
    setTimeout(() => toast.remove(), 250)
  }, 4000)
}

// ── Auto-file deduplication ──────────────────────────────────────────────────
// Maps a normalised error key → timestamp of last auto-filed report.
// Errors with the same key within 30 seconds are suppressed.
const AUTO_FILE_DEDUP_MS = 30_000
const recentAutoFiled = new Map<string, number>()

function maybeAutoFile(message: string, stack?: string) {
  if (!isContextValid()) return
  const key = message.slice(0, 200) // normalise to first 200 chars
  const now = Date.now()
  const last = recentAutoFiled.get(key)
  if (last !== undefined && now - last < AUTO_FILE_DEDUP_MS) return
  recentAutoFiled.set(key, now)

  // Read setting from storage; avoid blocking the error handler itself
  chrome.storage.sync.get('klavSettings', (result) => {
    const settings = result.klavSettings ?? {}
    if (!settings.autoFileErrors) return
    chrome.runtime.sendMessage({
      kind: 'AUTO_FILE_ERROR',
      message,
      stack,
      pageUrl: window.location.href,
      timestamp: now,
    } satisfies BackgroundMessage).catch(() => {})
  })
}

// Full-fidelity capture (G3): all console levels + all fetch/XHR requests, bounded + redacted.
// The onError hook preserves the extension's auto-file-on-error behavior; isContextValid keeps the
// wrappers inert after an extension reload (MV3 context invalidation).
installCapture(_buffers, {
  consoleLevels: true,
  isContextValid,
  onError: (message, stack) => maybeAutoFile(message, stack),
})

// ── Shadow DOM host ──────────────────────────────────────────────────────────
// Legacy host kept for getHost() (per Task 5 brief). The report composer now lives
// in buildModal, which owns its OWN shadow host; this one is no longer used by the
// composer but is retained as the stable host accessor.
let shadowRoot: ShadowRoot | null = null

function getHost(): ShadowRoot {
  if (!shadowRoot) {
    const host = document.createElement('div')
    host.id = 'klavity-host'
    document.body.appendChild(host)
    shadowRoot = host.attachShadow({ mode: 'open' })
  }
  return shadowRoot
}

function buildContext(): SubmitReportPayload['context'] {
  return buildReportContext(_buffers)
}

// ── Modal ────────────────────────────────────────────────────────────────────
// Only the three context-menu icons remain; the report composer (and all of its
// camera/crop/image/send/pencil/trash/close iconography) now lives in buildModal.
const ICONS = {
  bug: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Zm0 0v-9M6.53 9C4.6 8.8 3 7.1 3 5m3 8H2m1 8c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4m-.8 4c2.1.1 3.8 1.9 3.8 4"/></svg>`,
  bulb: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/></svg>`,
  clipboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"/></svg>`,
}

// ── Report composer (now the shared buildModal) ──────────────────────────────
// The bespoke ~1000-line composer (its CSS/HTML, updateStrip, captureFullPage,
// startRegion, handlePaste, the annotator editor, and the SUBMIT_SUCCESS card)
// has been replaced by the shared buildModal. The extension now gains theming,
// region/snippet capture, paste-image, and the auto-close success card for free,
// and there is ONE composer across the widget + extension.
let modalCtrl: ModalController | null = null

// Resolve the active project's per-project appearance config (best-effort). Mirrors
// the SDK widget's GET /api/projects/:id/config call. Falls back to the default
// (light) theme on any failure so the modal always opens.
async function fetchModalConfig(): Promise<ReturnType<typeof resolveModalConfig>> {
  try {
    const proj = klavMatchProject(location.href)
    const backendUrl = klavConfig?.backendUrl
    if (proj?.id && backendUrl) {
      const r = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/projects/${encodeURIComponent(proj.id)}/config`)
      if (r.ok) return resolveModalConfig((await r.json()).modalConfig || {})
    }
  } catch { /* default theme */ }
  return resolveModalConfig({})
}

async function openModal(type: ReportType) {
  if (modalCtrl) return // guard against double-open
  if (!isContextValid()) {
    showToast('Extension reloaded. Please refresh the page.')
    return
  }
  const config = await fetchModalConfig()
  modalCtrl = buildModal(type, {
    autoCaptureOnOpen: true,
    onCaptureFull,
    onRegionCapture,
    onSubmit: (p) => submitViaSW(p),
  }, config)
}

function closeModal() {
  modalCtrl?.close()
  modalCtrl = null
}

// Promise bridge around the SUBMIT_REPORT → SUBMIT_SUCCESS/SUBMIT_ERROR round-trip.
// buildModal awaits this and owns the success/error UI; we only resolve/reject.
// Single-slot: at most one submit is in flight (one modal at a time).
let pendingSubmit: { resolve: (r: { issueKey: string; issueUrl: string }) => void; reject: (e: Error) => void } | null = null

function submitViaSW(p: { type: ReportType; description: string; screenshots: string[] }): Promise<{ issueKey: string; issueUrl: string }> {
  const matchedProject = klavMatchProject(location.href)
  const payload: SubmitReportPayload = {
    type: p.type,
    description: p.description,
    context: buildContext(),
    screenshots: [...p.screenshots],
    ...(matchedProject?.id ? { projectId: matchedProject.id } : {}),
  }
  return new Promise((resolve, reject) => {
    pendingSubmit = { resolve, reject }
    sendToBackground({ kind: 'SUBMIT_REPORT', payload }).catch((err) => {
      if (pendingSubmit) { pendingSubmit = null; reject(err instanceof Error ? err : new Error(String(err))) }
    })
  })
}

// MV3 service workers sleep and are loaded via a dynamic import (crxjs), so a cold
// SW can drop the FIRST message with "Receiving end does not exist" before its
// onMessage listener is registered. Retry briefly to let it wake. "message port
// closed" means it DID receive (the real reply arrives via a separate message).
function sendToBackground(msg: BackgroundMessage, attempt = 0): Promise<void> {
  return chrome.runtime.sendMessage(msg).then(() => {}).catch((err: unknown) => {
    const m = String((err as Error)?.message ?? err)
    if (/message port closed/i.test(m)) return
    if (attempt < 5 && /Receiving end does not exist|Could not establish connection/i.test(m)) {
      return new Promise<void>((res) => setTimeout(res, 200)).then(() => sendToBackground(msg, attempt + 1))
    }
    throw err
  })
}

// ── Capture awaiter (Task 4) ──────────────────────────────────────────────────
// Single-slot Promise bridge between the SW captureVisibleTab result and callers.
// onCaptureFull / onRegionCapture are the stable API consumed by Task 5's buildModal.
const captureAwaiter = makeCaptureAwaiter({ send: (m) => sendToBackground(m) })

const onCaptureFull = async (): Promise<string> => captureAwaiter.captureFull()

const onRegionCapture = async (rect: { x: number; y: number; w: number; h: number }): Promise<string> => {
  const full = await captureAwaiter.captureFull()
  const dpr = window.devicePixelRatio || 1
  return cropDataUrl(full, { x: rect.x * dpr, y: rect.y * dpr, w: rect.w * dpr, h: rect.h * dpr }, window.scrollX * dpr, window.scrollY * dpr)
}

// ── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: ContentMessage) => {
  if (msg.kind === 'CAPTURE_TAB_RESULT') {
    // The composer (buildModal) consumes captures purely through the awaiter's
    // onCaptureFull/onRegionCapture; just settle the in-flight Promise.
    captureAwaiter.settle(msg.dataUrl ?? '', msg.error)
    return
  }

  if (msg.kind === 'SUBMIT_SUCCESS') {
    // Resolve the submitViaSW Promise; buildModal owns the "✓ Filed as KEY" success card.
    pendingSubmit?.resolve({ issueKey: msg.issueKey, issueUrl: msg.issueUrl })
    pendingSubmit = null
    return
  }

  if (msg.kind === 'SUBMIT_ERROR') {
    // Reject the submitViaSW Promise; buildModal re-enables the form + shows the error.
    pendingSubmit?.reject(new Error(msg.message))
    pendingSubmit = null
    return
  }

  if (msg.kind === 'OPEN_MODAL') {
    openModal(msg.reportType)
  }

  if (msg.kind === 'KLAV_CAPTURE_REVIEW_RESULT') {
    document.dispatchEvent(new CustomEvent('klavity-review-capture', { detail: { dataUrl: msg.dataUrl, error: msg.error } }))
    return
  }

  if (msg.kind === 'KLAV_CONFIG_UPDATED') {
    klavConfig = msg.config
    // A fresh config can mean new monitored URLs / a resumed review_mode — re-evaluate.
    maybeActivate('config-update')
    return
  }

  if (msg.kind === 'KLAV_NUDGE_ROUTE') {
    klavOnRouteChange()
    return
  }

  if (msg.kind === 'KLAV_ADHOC_REVIEW') {
    void klavRunAdhoc(msg.projectId)
    return
  }
})

// ── Custom right-click menu ──────────────────────────────────────────────────
let ctxMenuEl: HTMLElement | null = null
let nativeMenuPending = false // next right-click passes through to browser

function closeCtxMenu() {
  ctxMenuEl?.remove()
  ctxMenuEl = null
}

// Brief toast guiding the user — the native menu needs a real right-click.
function showNativeHint(x: number, y: number) {
  const t = document.createElement('div')
  t.textContent = '↗ Right-click again to open the browser menu'
  t.style.cssText = `position:fixed;z-index:2147483647;left:${x}px;top:${y + 6}px;background:#1a1a1a;color:#fff;font:500 12.5px system-ui,-apple-system,sans-serif;padding:8px 13px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.32);pointer-events:none;opacity:0;transition:opacity .2s;max-width:260px;`
  document.body.appendChild(t)
  requestAnimationFrame(() => { t.style.opacity = '1' })
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250) }, 2400)
}

function showCtxMenu(x: number, y: number) {
  closeCtxMenu()

  const menu = document.createElement('div')
  ctxMenuEl = menu
  menu.style.cssText = 'position:fixed;z-index:2147483647;background:#fff;border-radius:13px;box-shadow:0 12px 40px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.10);min-width:236px;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;border:1px solid rgba(0,0,0,.08);padding:6px;'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`

  // One consistent row builder: a fixed-width icon box so every label lines up,
  // uniform padding/gap/size, rounded hover. `muted` styles the footer affordance.
  const makeRow = (icon: string, iconColor: string, label: string, opts: { muted?: boolean; hint?: string } = {}) => {
    const btn = document.createElement('button')
    const muted = !!opts.muted
    btn.style.cssText = `display:flex;align-items:center;gap:11px;width:100%;padding:9px 12px;background:transparent;border:none;border-radius:8px;cursor:pointer;text-align:left;color:${muted ? '#8a8a90' : '#1f1f1f'};font-size:${muted ? '12.5px' : '14.5px'};font-weight:${muted ? '400' : '500'};line-height:1;`
    const ic = document.createElement('span')
    ic.style.cssText = `display:grid;place-items:center;width:18px;height:18px;flex-shrink:0;color:${iconColor};`
    ic.innerHTML = icon
    const lab = document.createElement('span')
    lab.textContent = label
    lab.style.cssText = 'flex:1;'
    btn.append(ic, lab)
    if (opts.hint) {
      const h = document.createElement('span')
      h.textContent = opts.hint
      h.style.cssText = 'font-family:ui-monospace,monospace;font-size:11px;color:#a3a3ab;flex-shrink:0;'
      btn.append(h)
    }
    btn.addEventListener('mouseenter', () => { btn.style.background = muted ? '#f4f4f6' : '#f2f2f4' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent' })
    return btn
  }

  const actions: Array<{ icon: string; color: string; label: string; run: () => void }> = [
    { icon: ICONS.bug, color: '#E94F37', label: 'Report a Bug', run: () => openModal('bug') },
    { icon: ICONS.bulb, color: '#F4A93C', label: 'Request a Feature', run: () => openModal('feature') },
    { icon: ICONS.clipboard, color: '#8A837A', label: 'View submissions', run: () => { chrome.runtime.sendMessage({ kind: 'OPEN_TRACKER_URL' } satisfies BackgroundMessage).catch(() => {}) } },
  ]
  actions.forEach((a) => {
    const btn = makeRow(a.icon, a.color, a.label)
    btn.addEventListener('click', () => { closeCtxMenu(); a.run() })
    menu.appendChild(btn)
  })

  // single divider, then the browser-menu affordance as an aligned footer row
  const divider = document.createElement('div')
  divider.style.cssText = 'height:1px;background:#ececec;margin:6px 8px;'
  menu.appendChild(divider)

  const winIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>`
  // Scripts can't open Chrome's native menu directly — arm the next right-click to pass through.
  const nativeBtn = makeRow(winIcon, '#9aa0a6', 'Show browser menu', { muted: true, hint: '⇧ right-click' })
  nativeBtn.addEventListener('click', () => {
    closeCtxMenu()
    nativeMenuPending = true
    showNativeHint(x, y)
  })
  menu.appendChild(nativeBtn)

  document.body.appendChild(menu)

  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect()
    if (r.right > window.innerWidth - 8) menu.style.left = `${x - r.width}px`
    if (r.bottom > window.innerHeight - 8) menu.style.top = `${y - r.height}px`
  })

  const onOutside = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) { closeCtxMenu(); document.removeEventListener('mousedown', onOutside) }
  }
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeCtxMenu(); document.removeEventListener('keydown', onEsc, { capture: true }) }
  }
  setTimeout(() => {
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEsc, { capture: true })
  }, 0)
}

function handleContextMenu(e: MouseEvent) {
  if (!isContextValid()) {
    document.removeEventListener('contextmenu', handleContextMenu)
    showToast('Extension reloaded. Please refresh the page.')
    return
  }
  if (widgetPresent()) return // widget present → pass through to native menu; widget owns reporting
  if (e.shiftKey || nativeMenuPending) {
    nativeMenuPending = false
    return // pass through to native browser menu
  }
  e.preventDefault()
  showCtxMenu(e.clientX, e.clientY)
}

document.addEventListener('contextmenu', handleContextMenu)

// If the widget announces itself after we initialised, tear down our report UI; widget wins.
document.addEventListener('klavity:widget-ready', () => {
  closeCtxMenu()
  if (modalCtrl) closeModal()
})

// ════════════════════════════════════════════════════════════════════════════
// LIVE ACTIVATION (P3b, R5) — auto-comment on monitored URLs.
//
// Founder vision: the moment a logged-in teammate opens a monitored URL, the
// project's Sims "jump out and comment". This module:
//   1. reads the cached config (monitored patterns + review_mode + ext token);
//   2. on document_idle AND on SPA route changes, checks the current URL against
//      the allowlist patterns (mirroring the server's prefix/glob matcher);
//   3. if matched + not paused: shows a one-time CONSENT prompt, then captures the
//      visible tab and POSTs /api/sim/review via the background SW, rendering the
//      returned reactions as comment bubbles in a DEDICATED shadow-DOM host;
//   4. renders a persistent "Sims reviewing · pause" indicator (user pause = instant).
//
// Guardrails are enforced server-side (consent / allowlist / budget / dedupe);
// here we DEBOUNCE to one review per route and never auto-activate on a chrome://
// page (the content script simply isn't injected there) or without a token.
//
// MV3 honesty: the *token* and the cross-origin fetch live in the background SW.
// This content script only talks to the SW via messages, so an evicted SW is
// re-spawned on demand. We never store the token in the page.
// ════════════════════════════════════════════════════════════════════════════

let klavConfig: KlavConfig | null = null
let klavReviewedRoutes = new Set<string>()   // legacy compat: keeps existing usage for consent/revoke
let klavLastUrl = location.href
let klavIndicatorEl: HTMLElement | null = null

// ── Per-route dedup / flood state ────────────────────────────────────────────
let klavLastSentSig: string | null = null      // sig of last confirmed-sent review
let klavCooldownUntil = 0                       // timestamp, set after confirmed review
let klavRouteCount = 0                          // reviews sent this route load
// Pending-latest slot: replaces the boolean drop-lock.
// null = no capture in flight. true = flight in progress but no new change yet.
// string = a newer sig arrived while flight was in progress; run once more on completion.
let klavPendingLatest: null | true | string = null

// ── Observer handles (disconnect on route change) ─────────────────────────────
let klavMutObs: MutationObserver | null = null
let klavIntObs: IntersectionObserver | null = null
let klavDebounceTimer: ReturnType<typeof setTimeout> | null = null
// Throttle: earliest next time the mutation callback may schedule the debounce.
let klavMutThrottleUntil = 0
// Boot-guard: suppress the first IntersectionObserver fire when it matches the
// initial viewport (boot's maybeActivate already covers that review).
let klavBootGuard = true

// Mirror of the server's patternMatchesUrl (db.ts) — prefix/glob ONLY, no regex.
function klavNormUrl(u: string): string {
  return String(u || '').trim()
    .replace(/^https?:\/\//i, '')   // strip scheme
    .replace(/[?#].*$/, '')         // strip query + fragment (path-only, §5)
    .replace(/\/+$/, '')            // strip trailing slash
    .toLowerCase()
}
function klavPatternMatches(pattern: string, url: string): boolean {
  const p = klavNormUrl(pattern)
  const u = klavNormUrl(url)
  if (!p) return false
  if (!p.includes('*')) return u === p || u.startsWith(p + '/')
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + esc).test(u)
}

// First accessible project whose enabled allowlist matches the current URL and is
// NOT admin-paused (review_mode 'paused'). Returns null if none — the common case.
function klavMatchProject(url: string): KlavMonitoredProject | null {
  if (!klavConfig?.token) return null
  for (const p of klavConfig.projects) {
    if (p.reviewMode === 'paused') continue
    if (p.monitoredUrls.some((pat) => klavPatternMatches(pat, url))) return p
  }
  return null
}

// Per-project user-pause flag, mirrored from the server's monitoring_consent. Stored
// locally so a pause stops activation INSTANTLY (no round-trip) and survives reloads.
function klavPauseKey(projectId: string): string { return `klavPaused:${projectId}` }
async function klavIsUserPaused(projectId: string): Promise<boolean> {
  try { const r = await chrome.storage.local.get(klavPauseKey(projectId)); return !!r[klavPauseKey(projectId)] } catch { return false }
}
async function klavSetUserPaused(projectId: string, paused: boolean): Promise<void> {
  try { await chrome.storage.local.set({ [klavPauseKey(projectId)]: paused }) } catch { /* ignore */ }
}
function klavConsentKey(projectId: string): string { return `klavConsent:${projectId}` }
async function klavHasConsent(projectId: string): Promise<boolean> {
  try { const r = await chrome.storage.local.get(klavConsentKey(projectId)); return r[klavConsentKey(projectId)] === 'granted' } catch { return false }
}
async function klavSetConsent(projectId: string, status: 'granted' | 'paused' | 'revoked'): Promise<void> {
  try { await chrome.storage.local.set({ [klavConsentKey(projectId)]: status }) } catch { /* ignore */ }
}

// Global Sims kill-switch (Options page). Defaults to ON: a missing/undefined flag
// means enabled, so existing installs keep working until the user explicitly opts out.
async function klavSimsEnabled(): Promise<boolean> {
  try { const r = await chrome.storage.local.get('klavSimsEnabled'); return r.klavSimsEnabled !== false } catch { return true }
}

function klavSend<T = any>(msg: BackgroundMessage): Promise<T> {
  return new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (resp) => { void chrome.runtime.lastError; resolve(resp as T) }) }
    catch { resolve(undefined as T) }
  })
}

// Structural fingerprint of the visible content region — tag/count based, NO raw text.
function klavRegionSig(): string {
  const selectors = ['main', '[role="main"]', 'article', '[role="feed"]', '[data-message-id]', '.message']
  const container = document.querySelector(selectors.join(','))
  if (!container) return 'no-region'
  const children = Array.from(container.children).slice(0, 20)
  return children.map((el) => el.tagName.toLowerCase() + ':' + el.children.length).join(',') || 'empty'
}

// Content signature — uses the pure klavContentSig helper (structural only, consent-safe).
function klavDomSig(): string {
  return klavContentSig({
    host: location.host,
    title: document.title || '',
    counts: {
      headings: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      buttons: document.querySelectorAll('button,[role="button"]').length,
      links: document.querySelectorAll('a[href]').length,
      fields: document.querySelectorAll('input,select,textarea').length,
    },
    region: klavRegionSig(),
  })
}

// ── Dedicated shadow-DOM host for Sim comment bubbles + the pause indicator ──
let klavHostRoot: ShadowRoot | null = null
function klavGetHost(): ShadowRoot {
  if (!klavHostRoot) {
    const host = document.createElement('div')
    host.id = 'klavity-sims-host'
    document.documentElement.appendChild(host)
    klavHostRoot = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `
      :host{all:initial;}
      .klav-stack{position:fixed;right:18px;bottom:64px;z-index:2147483646;display:flex;flex-direction:column;gap:10px;max-width:340px;font-family:system-ui,-apple-system,sans-serif;pointer-events:none;}
      .klav-bubble{pointer-events:auto;background:#FBF6EE;color:#2D2A26;border-radius:14px;box-shadow:0 10px 34px rgba(40,30,20,.22);padding:12px 14px;border:1px solid #EFE9DE;opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease;}
      .klav-bubble.in{opacity:1;transform:translateY(0);}
      .klav-bhead{display:flex;align-items:center;gap:9px;margin-bottom:6px;}
      .klav-av{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0;}
      .klav-nm{font-size:13px;font-weight:700;color:#2D2A26;}
      .klav-sev{margin-left:auto;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:999px;background:#F2ECE2;color:#8A6D3B;}
      .klav-obs{font-size:13px;line-height:1.4;color:#3D3833;}
      .klav-cite{margin-top:6px;font-size:11px;color:#8A837A;font-style:italic;}
      .klav-outcome{margin-top:7px;padding-top:6px;border-top:1px solid #EDE6DA;font-size:11px;font-weight:600;color:#6B655C;display:flex;align-items:center;gap:5px;}
      .klav-bclose{position:absolute;top:6px;right:8px;border:none;background:transparent;color:#B4ABA0;font-size:15px;cursor:pointer;}
      .klav-indicator{position:fixed;right:18px;bottom:18px;z-index:2147483647;pointer-events:auto;display:flex;align-items:center;gap:8px;background:#2D2A26;color:#FBF6EE;border-radius:999px;padding:7px 12px 7px 11px;box-shadow:0 6px 22px rgba(0,0,0,.28);font-family:system-ui,-apple-system,sans-serif;font-size:12.5px;font-weight:600;}
      .klav-dot{width:8px;height:8px;border-radius:50%;background:#7CD08F;box-shadow:0 0 0 0 rgba(124,208,143,.6);animation:klavpulse 1.8s infinite;}
      .klav-indicator.paused .klav-dot{background:#C9A14A;animation:none;}
      @keyframes klavpulse{0%{box-shadow:0 0 0 0 rgba(124,208,143,.55)}70%{box-shadow:0 0 0 7px rgba(124,208,143,0)}100%{box-shadow:0 0 0 0 rgba(124,208,143,0)}}
      .klav-pausebtn{border:none;background:rgba(251,246,238,.14);color:#FBF6EE;border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:700;cursor:pointer;}
      .klav-pausebtn:hover{background:rgba(251,246,238,.24);}
      .klav-consent{position:fixed;right:18px;bottom:18px;z-index:2147483647;pointer-events:auto;max-width:330px;background:#FBF6EE;color:#2D2A26;border-radius:16px;box-shadow:0 14px 44px rgba(40,30,20,.26);border:1px solid #EFE9DE;padding:16px 16px 14px;font-family:system-ui,-apple-system,sans-serif;}
      .klav-consent h4{margin:0 0 6px;font-size:14px;}
      .klav-consent p{margin:0 0 12px;font-size:12.5px;line-height:1.45;color:#6B655C;}
      .klav-crow{display:flex;gap:8px;}
      .klav-cprimary{flex:1;border:none;background:#A98BD6;color:#fff;border-radius:10px;padding:9px;font-size:13px;font-weight:700;cursor:pointer;}
      .klav-cprimary:hover{background:#9A78CF;}
      .klav-cghost{border:none;background:#F2ECE2;color:#3D3833;border-radius:10px;padding:9px 12px;font-size:13px;font-weight:600;cursor:pointer;}
    `
    klavHostRoot.appendChild(style)
    const stack = document.createElement('div')
    stack.className = 'klav-stack'
    stack.id = 'klav-stack'
    klavHostRoot.appendChild(stack)
  }
  return klavHostRoot
}

function klavRenderBubble(r: { simName: string; initials: string; accent: string; observation?: string; severity?: string; citation?: any; suggestedBug?: any }) {
  const root = klavGetHost()
  const stack = root.getElementById('klav-stack')!
  const b = document.createElement('div')
  b.className = 'klav-bubble'
  b.style.position = 'relative'
  const cite = r.citation?.sourceQuote
    ? `<div class="klav-cite">“${String(r.citation.sourceQuote).slice(0, 90)}”${r.citation.speaker ? ' — ' + r.citation.speaker : ''}</div>` : ''
  const sev = r.severity ? `<span class="klav-sev">${r.severity}</span>` : ''
  // Make the payoff legible: every reaction is persisted server-side as a ticket in the dashboard.
  const outcome = r.suggestedBug
    ? `<div class="klav-outcome">🐛 Flagged as a bug · saved to your dashboard</div>`
    : `<div class="klav-outcome">💬 Noted · saved to your dashboard</div>`
  b.innerHTML = `
    <button class="klav-bclose" aria-label="Dismiss">×</button>
    <div class="klav-bhead">
      <div class="klav-av" style="background:${r.accent || '#A98BD6'}">${(r.initials || r.simName || '?').slice(0, 2)}</div>
      <div class="klav-nm">${r.simName || 'Sim'}</div>${sev}
    </div>
    <div class="klav-obs">${(r.observation || '').replace(/</g, '&lt;')}</div>
    ${cite}
    ${outcome}
  `
  b.querySelector('.klav-bclose')!.addEventListener('click', () => b.remove())
  stack.appendChild(b)
  requestAnimationFrame(() => b.classList.add('in'))
  // Auto-dismiss after a while so bubbles don't pile up across routes.
  setTimeout(() => { b.classList.remove('in'); setTimeout(() => b.remove(), 300) }, 16000)
}

function klavClearBubbles() {
  const stack = klavHostRoot?.getElementById('klav-stack')
  if (stack) stack.innerHTML = ''
}

// Persistent indicator. paused=true → amber dot + "resume"; else green pulse + "pause".
function klavRenderIndicator(projectId: string, paused: boolean) {
  const root = klavGetHost()
  klavIndicatorEl?.remove()
  const el = document.createElement('div')
  el.className = 'klav-indicator' + (paused ? ' paused' : '')
  el.innerHTML = `<span class="klav-dot"></span><span>${paused ? 'Sims paused' : 'Sims reviewing'}</span><button class="klav-pausebtn">${paused ? 'Resume' : 'Pause'}</button>`
  el.querySelector('.klav-pausebtn')!.addEventListener('click', async () => {
    const nowPaused = !paused
    // Instant local stop, then mirror to the server (source of truth).
    await klavSetUserPaused(projectId, nowPaused)
    await klavSetConsent(projectId, nowPaused ? 'paused' : 'granted')
    klavRenderIndicator(projectId, nowPaused)
    if (nowPaused) klavClearBubbles()
    void klavSend({ kind: 'KLAV_CONSENT', projectId, status: nowPaused ? 'paused' : 'granted' })
    if (!nowPaused) maybeActivate('resume')
  })
  root.appendChild(el)
  klavIndicatorEl = el
}

// First-capture consent prompt (gate c). Resolves true once the user grants.
function klavConsentPrompt(project: KlavMonitoredProject): Promise<boolean> {
  return new Promise((resolve) => {
    const root = klavGetHost()
    const el = document.createElement('div')
    el.className = 'klav-consent'
    el.innerHTML = `
      <h4>Let your Sims review this page?</h4>
      <p>${project.name}'s Sims can comment on <b>${location.pathname}</b>. We capture only this page (a viewport screenshot, path only — no query strings) and only on monitored URLs. You can pause anytime.</p>
      <div class="klav-crow">
        <button class="klav-cprimary">Allow Sims to review</button>
        <button class="klav-cghost">Not now</button>
      </div>`
    const done = (granted: boolean) => { el.remove(); resolve(granted) }
    el.querySelector('.klav-cprimary')!.addEventListener('click', async () => {
      await klavSetConsent(project.id, 'granted')
      void klavSend({ kind: 'KLAV_CONSENT', projectId: project.id, status: 'granted' })
      done(true)
    })
    el.querySelector('.klav-cghost')!.addEventListener('click', async () => {
      // "Not now" = user pause (don't nag again this session until they resume).
      await klavSetUserPaused(project.id, true)
      done(false)
    })
    root.appendChild(el)
  })
}

// ── Ad-hoc "Analyze this page" — per-domain consent helpers ─────────────────
// Per-domain memory for explicit "Analyze this page" runs (so we confirm only once per domain).
async function klavAdhocAllowed(domain: string): Promise<boolean> {
  try { const r = await chrome.storage.local.get('klavAdhocDomains'); return Array.isArray(r.klavAdhocDomains) && r.klavAdhocDomains.includes(domain) } catch { return false }
}
async function klavAdhocRemember(domain: string): Promise<void> {
  try {
    const r = await chrome.storage.local.get('klavAdhocDomains')
    const list: string[] = Array.isArray(r.klavAdhocDomains) ? r.klavAdhocDomains : []
    if (!list.includes(domain)) { list.push(domain); await chrome.storage.local.set({ klavAdhocDomains: list }) }
  } catch { /* non-fatal */ }
}

// One-time-per-domain confirm before an explicit ad-hoc review. Reuses the consent-card styling.
function klavAdhocConfirm(domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    const root = klavGetHost()
    const el = document.createElement('div')
    el.className = 'klav-consent'
    el.innerHTML = `
      <h4>Analyze this page?</h4>
      <p>Your Sims will look at <b>${domain}</b>. We capture only the visible area (a viewport screenshot) and send it to Klavity to generate feedback.</p>
      <div class="klav-crow">
        <button class="klav-cprimary">Analyze</button>
        <button class="klav-cghost">Cancel</button>
      </div>`
    const done = (ok: boolean) => { el.remove(); resolve(ok) }
    el.querySelector('.klav-cprimary')!.addEventListener('click', () => done(true))
    el.querySelector('.klav-cghost')!.addEventListener('click', () => done(false))
    root.appendChild(el)
  })
}

// Explicit "Analyze this page" — bypasses the allowlist + the klavSimsEnabled kill-switch by design.
// Must be called OUTSIDE maybeActivate so it intentionally bypasses the global kill-switch.
async function klavRunAdhoc(projectId: string): Promise<void> {
  const domain = location.hostname
  if (!(await klavAdhocAllowed(domain))) {
    if (!(await klavAdhocConfirm(domain))) return
    await klavAdhocRemember(domain)
  }
  klavNotice('Sims analyzing this page…')
  const dataUrl = await klavCapture()
  if (!dataUrl) { klavNotice("Couldn't capture this page — try again."); return }
  const resp = await klavSend<{ ok: boolean; status: number; body: any }>({
    kind: 'KLAV_REVIEW', projectId, url: location.href, domSig: klavDomSig(), screenshotDataUrl: dataUrl, adhoc: true,
  })
  const body = resp?.body || {}
  if (resp?.ok && Array.isArray(body.reviews)) {
    let n = 0
    for (const rv of body.reviews) for (const r of (rv.reactions || [])) {
      klavRenderBubble({ simName: rv.simName, initials: rv.initials, accent: rv.accent, observation: r.observation, severity: r?.suggestedBug?.severity, citation: r.citation, suggestedBug: r?.suggestedBug }); n++
    }
    if (n === 0) klavNotice('Your Sims had nothing to flag on this page.')
  } else if (body.reason === 'budgetExhausted') {
    klavNotice("Sims hit today’s review budget — try again tomorrow.")
  } else if (body.reason === 'noConfig') {
    klavNotice('Sign in from the Klavity popup first.')
  } else {
    klavNotice("Couldn’t analyze this page right now.")
  }
}

// Capture the visible tab via the background SW (token + captureVisibleTab live there).
function klavCapture(): Promise<string | null> {
  return new Promise((resolve) => {
    const onResult = (ev: Event) => {
      const { dataUrl } = (ev as CustomEvent).detail as { dataUrl: string; error?: string }
      resolve(dataUrl || null)
    }
    document.addEventListener('klavity-review-capture', onResult, { once: true })
    void klavSend({ kind: 'KLAV_CAPTURE_REVIEW' })
    setTimeout(() => { document.removeEventListener('klavity-review-capture', onResult); resolve(null) }, 4000)
  })
}

// A small, non-spammy notice (used for budgetExhausted / admin-paused gate replies).
function klavNotice(text: string) {
  const root = klavGetHost()
  const stack = root.getElementById('klav-stack')!
  const n = document.createElement('div')
  n.className = 'klav-bubble in'
  n.style.position = 'relative'
  n.innerHTML = `<div class="klav-obs" style="color:#6B655C">${text}</div>`
  stack.appendChild(n)
  setTimeout(() => { n.classList.remove('in'); setTimeout(() => n.remove(), 300) }, 6000)
}

// ── The activation entry point (pending-latest slot, shouldCapture gating). ──
async function maybeActivate(reason: string) {
  // If a capture is already in flight, store the latest sig for a follow-up run.
  if (klavPendingLatest !== null) {
    // Record a newer sig for the follow-up run; 'true' means in-flight, no new sig yet.
    const latestSig = klavDomSig()
    if (klavPendingLatest === true) klavPendingLatest = latestSig
    else klavPendingLatest = latestSig  // always overwrite with newest
    return
  }

  // Global kill-switch (Options page). When off: no activation, no capture, no
  // consent card, no "Sims reviewing" indicator. Checked early so it's a true
  // global off — per-project consent/pause logic below only runs when enabled.
  if (!(await klavSimsEnabled())) {
    klavIndicatorEl?.remove(); klavIndicatorEl = null
    return
  }

  if (!klavConfig?.token) return
  if (document.visibilityState !== 'visible') return

  const url = location.href
  const project = klavMatchProject(url)
  // Off-allowlist: tear down indicator and stop.
  if (!project) { klavIndicatorEl?.remove(); klavIndicatorEl = null; return }
  console.log(`[Klavity] active on monitored URL (trigger: ${reason}) · project=${project.id} · ${location.pathname}`)

  const paused = await klavIsUserPaused(project.id)
  klavRenderIndicator(project.id, paused)
  if (paused) { console.log('[Klavity] skip: user-paused'); return }

  // Pre-gate using shouldCapture (pure function — no async side-effects).
  const preSig = klavDomSig()
  const preDecision = shouldCapture({
    nowSig: preSig,
    lastSentSig: klavLastSentSig,
    now: Date.now(),
    cooldownUntil: klavCooldownUntil,
    paused,
    routeCount: klavRouteCount,
    cap: MAX_REVIEWS_PER_ROUTE,
  })
  if (!preDecision.capture) { console.log(`[Klavity] skip (pre-capture): ${preDecision.reason}`); return }

  // Gate c (client mirror): first capture needs consent. Server re-checks authoritatively.
  if (!(await klavHasConsent(project.id))) {
    const granted = await klavConsentPrompt(project)
    if (!granted) return
  }

  // Mark flight in progress.
  klavPendingLatest = true
  const routeKey = klavNormUrl(url)
  try {
    console.log(`[Klavity] change detected (${reason}) → capturing viewport…`)
    const dataUrl = await klavCapture()
    if (!dataUrl) { console.log('[Klavity] skip: capture failed/rate-limited (will retry next change)'); return }

    // Compute sig AFTER captureVisibleTab returns — same DOM moment as the pixels.
    const postSig = klavDomSig()

    // If the DOM changed during the capture, reschedule and don't post a mismatched sig.
    if (postSig !== preSig) {
      // Treat as a new pending change; exit and let the follow-up slot handle it.
      console.log('[Klavity] DOM changed during capture — rescheduling')
      klavPendingLatest = postSig
      return
    }

    // Post-capture gate: re-verify (cooldown/sig may have changed while we awaited).
    const postDecision = shouldCapture({
      nowSig: postSig,
      lastSentSig: klavLastSentSig,
      now: Date.now(),
      cooldownUntil: klavCooldownUntil,
      paused,
      routeCount: klavRouteCount,
      cap: MAX_REVIEWS_PER_ROUTE,
    })
    if (!postDecision.capture) { console.log(`[Klavity] skip (post-capture): ${postDecision.reason}`); return }

    console.log('[Klavity] posting review → server (Sims reviewing…)')
    const resp = await klavSend<{ ok: boolean; status: number; body: any }>({
      kind: 'KLAV_REVIEW', projectId: project.id, url, domSig: postSig, screenshotDataUrl: dataUrl,
    })
    const body = resp?.body || {}
    if (resp?.ok && Array.isArray(body.reviews)) {
      const nReactions = body.reviews.reduce((n: number, rv: any) => n + (rv.reactions?.length || 0), 0)
      console.log(`[Klavity] ✓ review done — ${body.reviews.length} sim(s), ${nReactions} reaction(s) rendered`)
      // Confirmed review: now arm cooldown, record sig, increment count.
      klavLastSentSig = postSig
      klavCooldownUntil = Date.now() + ROUTE_COOLDOWN_MS
      klavRouteCount++
      klavReviewedRoutes.add(routeKey)
      for (const rv of body.reviews) {
        for (const r of (rv.reactions || [])) {
          klavRenderBubble({ simName: rv.simName, initials: rv.initials, accent: rv.accent, observation: r.observation, severity: r?.suggestedBug?.severity, citation: r.citation, suggestedBug: r?.suggestedBug })
        }
      }
    } else if (body.reason === 'alreadyReviewed') {
      console.log('[Klavity] already reviewed this view (dedup) — no new feedback')
      // Server says already reviewed — count it so we don't keep hammering.
      klavLastSentSig = postSig
      klavCooldownUntil = Date.now() + ROUTE_COOLDOWN_MS
      klavRouteCount++
      klavReviewedRoutes.add(routeKey)
    } else if (body.reason === 'needsConsent') {
      console.log('[Klavity] server: needs consent — will re-prompt')
      // server says no consent on record — clear local cache so we re-prompt next route.
      await klavSetConsent(project.id, 'revoked')
      klavReviewedRoutes.delete(routeKey)
    } else if (body.reason === 'budgetExhausted') {
      console.log('[Klavity] server: daily review budget exhausted — paused')
      klavNotice("Sims hit today's review budget — paused until tomorrow.")
      klavRenderIndicator(project.id, true)
    } else if (body.reason === 'paused' || body.reason === 'userPaused') {
      console.log(`[Klavity] server: ${body.reason}`)
      klavRenderIndicator(project.id, true)
    } else {
      console.log(`[Klavity] no review (reason: ${body.reason || 'unknown'})`)
    }
    // 'offAllowlist' / other → silent (no spam).
  } finally {
    const pendingNext = klavPendingLatest
    // Clear the slot BEFORE any follow-up to avoid re-entrant loops.
    klavPendingLatest = null
    // If a newer sig arrived while we were in flight, run once more.
    if (typeof pendingNext === 'string') {
      void maybeActivate('pending-latest')
    }
  }
}

// ── Shared trailing-edge debounce used by all three change sources ────────────
function klavScheduleCapture() {
  if (klavDebounceTimer !== null) clearTimeout(klavDebounceTimer)
  klavDebounceTimer = setTimeout(() => {
    klavDebounceTimer = null
    void maybeActivate('detector')
  }, DEBOUNCE_MS)
}

// ── Tear down both observers (call before re-arming on route change or pause). ─
function klavDisarmObservers() {
  if (klavMutObs) { klavMutObs.disconnect(); klavMutObs = null }
  if (klavIntObs) { klavIntObs.disconnect(); klavIntObs = null }
  if (klavDebounceTimer !== null) { clearTimeout(klavDebounceTimer); klavDebounceTimer = null }
}

// ── Arm MutationObserver + IntersectionObserver on the content region. ────────
function klavArmObservers() {
  klavDisarmObservers()

  // --- MutationObserver: watch main content subtree for dynamic updates. ---
  const target = document.querySelector('main,[role="main"],article,body') ?? document.body
  klavMutObs = new MutationObserver((_mutations) => {
    const now = Date.now()
    // Throttle: at most one schedule per DEBOUNCE_MS window inside the callback.
    if (now < klavMutThrottleUntil) return
    klavMutThrottleUntil = now + DEBOUNCE_MS
    klavScheduleCapture()
  })
  klavMutObs.observe(target, { childList: true, subtree: true, characterData: false, attributes: false })

  // --- IntersectionObserver: scroll-reveal of content blocks. ---
  const ioSelectors = [
    'main', '[role="main"]', 'article',
    '[role="feed"] > *', '[data-message-id]', '.message',
  ]
  const observeTargets = Array.from(
    document.querySelectorAll<Element>(ioSelectors.join(','))
  )
  if (observeTargets.length > 0) {
    klavIntObs = new IntersectionObserver((entries) => {
      const anyVisible = entries.some((e) => e.isIntersecting)
      if (!anyVisible) return
      // Suppress the very first fire (boot's maybeActivate already handles it).
      if (klavBootGuard) { klavBootGuard = false; return }
      klavScheduleCapture()
    }, { threshold: 0.5 })
    for (const el of observeTargets) klavIntObs.observe(el)
  }
}

// ── SPA navigation backstop. The static <all_urls> content script fires once at
//    document_idle; SPAs swap routes without a reload, so we also watch history +
//    poll location as a backstop (tabs.onUpdated is the background-side complement).
function klavOnRouteChange() {
  if (location.href === klavLastUrl) return
  klavLastUrl = location.href
  klavClearBubbles()

  // Reset per-route state.
  klavLastSentSig = null
  klavCooldownUntil = 0
  klavRouteCount = 0
  klavPendingLatest = null
  klavBootGuard = false  // boot guard is per-page-load only; new routes fire freely
  klavMutThrottleUntil = 0

  // Tear down observers, re-arm on the new route's DOM (after a tick so the SPA
  // has finished rendering enough of the new route to find the content region).
  klavDisarmObservers()
  setTimeout(klavArmObservers, 200)

  void maybeActivate('spa-nav')
}
;(function klavPatchHistory() {
  const wrap = (fn: any) => function (this: any, ...args: any[]) { const r = fn.apply(this, args); queueMicrotask(klavOnRouteChange); return r }
  history.pushState = wrap(history.pushState)
  history.replaceState = wrap(history.replaceState)
  window.addEventListener('popstate', klavOnRouteChange)
  // Polling backstop for SPAs that mutate the URL without History API (rare but real).
  setInterval(klavOnRouteChange, 1500)
})()

// ── Bootstrap: pull the cached config from the SW, then evaluate the current URL. ──
async function klavBootstrap() {
  // Only meaningful on real http(s) pages — on chrome:// the content script isn't injected anyway.
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return
  const resp = await klavSend<{ ok: boolean; config: KlavConfig | null }>({ kind: 'KLAV_GET_CONFIG' })
  klavConfig = resp?.config ?? null
  // Boot review first — observers armed after so the first IO fire is suppressed.
  await maybeActivate('boot')
  // Clear boot guard so subsequent IO fires on this page-load are processed.
  klavBootGuard = false
  // Arm the change-detector observers for post-boot dynamic content + scroll-reveal.
  klavArmObservers()
}
void klavBootstrap()
