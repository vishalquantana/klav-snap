import type { ContentMessage, BackgroundMessage, ReportType, SubmitReportPayload, ConsoleError, NetworkFailure, KlavConfig, KlavMonitoredProject } from '@klavity/core'
import { Annotator } from '@klavity/core/annotator'
import { cropDataUrl } from '@klavity/core/crop'

// ── Error + network capture ring buffer ──────────────────────────────────────
const consoleErrors: ConsoleError[] = []
const networkFailures: NetworkFailure[] = []
const MAX_RING = 50

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

window.onerror = (msg, _src, _line, _col, err) => {
  if (!isContextValid()) return false
  const message = String(msg)
  const stack = err?.stack
  consoleErrors.push({ message, stack, timestamp: Date.now() })
  if (consoleErrors.length > MAX_RING) consoleErrors.shift()
  maybeAutoFile(message, stack)
  return false
}

window.addEventListener('unhandledrejection', (e) => {
  if (!isContextValid()) return
  const message = String(e.reason)
  const stack = e.reason?.stack
  consoleErrors.push({ message, stack, timestamp: Date.now() })
  if (consoleErrors.length > MAX_RING) consoleErrors.shift()
  maybeAutoFile(message, stack)
})

const origFetch = window.fetch
window.fetch = async (...args) => {
  if (!isContextValid()) {
    return origFetch(...args)
  }
  const res = await origFetch(...args)
  if (res.status >= 400) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url
    networkFailures.push({ url, status: res.status, method: 'FETCH', timestamp: Date.now() })
    if (networkFailures.length > MAX_RING) networkFailures.shift()
  }
  return res
}

// ── Shadow DOM host ──────────────────────────────────────────────────────────
let shadowRoot: ShadowRoot | null = null
let screenshots: string[] = []
let currentReportType: ReportType = 'bug'
let pendingRegionCapture = false
let pendingFullCapture = false

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
  return {
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    consoleErrors: [...consoleErrors],
    networkFailures: [...networkFailures],
  }
}

// ── Modal ────────────────────────────────────────────────────────────────────
const ICONS = {
  bug: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Zm0 0v-9M6.53 9C4.6 8.8 3 7.1 3 5m3 8H2m1 8c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4m-.8 4c2.1.1 3.8 1.9 3.8 4"/></svg>`,
  bulb: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/></svg>`,
  clipboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"/></svg>`,
  camera: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>`,
  crop: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>`,
  image: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><path d="M16 5h6M19 2v6"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>`,
  send: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>`,
  pencil: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></svg>`,
  x: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
}

function openModal(type: ReportType) {
  currentReportType = type
  screenshots = []
  const root = getHost()
  root.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = `
    .klavity-overlay{position:fixed;inset:0;background:rgba(40,35,30,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;pointer-events:all;font-family:system-ui,-apple-system,sans-serif;}
    .klavity-modal{background:#FBF6EE;color:#2D2A26;border-radius:20px;width:100%;max-width:520px;box-shadow:0 24px 70px rgba(40,30,20,.28);overflow:hidden;}
    .klavity-modal *{box-sizing:border-box;}
    .klavity-header{display:flex;align-items:center;gap:8px;padding:18px 22px;border-bottom:1px solid #EFE9DE;}
    .klavity-toggle{display:flex;gap:8px;}
    .klavity-toggle button{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:11px;border:none;cursor:pointer;font-size:15px;font-weight:700;background:transparent;color:#6B655C;transition:background .12s;}
    .klavity-toggle button:not(.active):hover{background:#F0EADF;}
    .klavity-toggle button svg{display:block;}
    .klavity-toggle .bug.active{background:#E94F37;color:#fff;}
    .klavity-toggle .feat.active{background:#F4A93C;color:#fff;}
    .klavity-close{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;background:transparent;color:#8A837A;border-radius:9px;cursor:pointer;transition:background .12s,color .12s;}
    .klavity-close:hover{background:#F0EADF;color:#3D3833;}
    .klavity-body{padding:20px 22px 22px;}
    .klavity-page{font-size:13px;color:#7A736A;margin-bottom:14px;}
    .klavity-page b{color:#3D3833;font-weight:600;}
    .klavity-strip{display:flex;gap:10px;margin-bottom:14px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:thin;}
    .klavity-strip:empty{display:none;}
    .klavity-thumb{position:relative;flex:0 0 140px;width:140px;height:95px;border-radius:10px;overflow:hidden;border:1px solid #E5DCCD;box-shadow:0 2px 8px rgba(40,30,20,.08);background:#fff;}
    .klavity-thumb img{display:block;width:100%;height:100%;object-fit:cover;object-position:top;}
    .klavity-thumb .klavity-ovl{position:absolute;inset:0;background:rgba(40,35,30,.4);display:flex;align-items:center;justify-content:center;gap:10px;opacity:0;transition:opacity .15s ease-in-out;}
    .klavity-thumb:hover .klavity-ovl{opacity:1;}
    .klavity-thumb .klavity-ovl button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;background:#FBF6EE;color:#2D2A26;box-shadow:0 2px 8px rgba(0,0,0,.15);transition:transform .12s,background .12s;}
    .klavity-thumb .klavity-ovl button:hover{transform:scale(1.1);background:#fff;}
    .klavity-actions{display:flex;gap:10px;margin-bottom:14px;}
    .klavity-actions button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 8px;background:#F2ECE2;color:#3D3833;border:1px solid #E6DFD3;border-radius:13px;cursor:pointer;font-size:14px;font-weight:600;transition:background .12s;}
    .klavity-actions button:hover{background:#ECE5D9;}
    .klavity-counter{font-size:13px;color:#9B9388;text-align:center;margin-bottom:14px;}
    textarea.klavity-desc{width:100%;min-height:130px;resize:vertical;background:#EFEAE0;color:#2D2A26;border:1.5px solid #DDD4C4;border-radius:13px;padding:14px;font-size:16px;font-family:inherit;line-height:1.4;margin-bottom:16px;transition:border-color .12s;}
    textarea.klavity-desc::placeholder{color:#8A837A;}
    textarea.klavity-desc:focus{outline:none;border-color:#B79CE0;box-shadow:0 0 0 3px rgba(167,139,214,.18);}
    .klavity-submit{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:14px;background:#A98BD6;color:#fff;border:none;border-radius:13px;font-size:16px;font-weight:700;cursor:pointer;transition:background .12s;}
    .klavity-submit:hover:not(:disabled){background:#9A78CF;}
    .klavity-submit:disabled{opacity:.55;cursor:not-allowed;}
    .klavity-error{color:#E94F37;font-size:13px;margin-bottom:10px;display:none;}
  `
  root.appendChild(style)

  const overlay = document.createElement('div')
  overlay.className = 'klavity-overlay'
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })

  const modal = document.createElement('div')
  modal.className = 'klavity-modal'
  modal.innerHTML = `
    <div class="klavity-header">
      <div class="klavity-toggle">
        <button class="bug ${type === 'bug' ? 'active' : ''}">${ICONS.bug} Bug</button>
        <button class="feat ${type === 'feature' ? 'active' : ''}">${ICONS.bulb} Feature</button>
      </div>
      <button class="klavity-close" id="klavity-close" aria-label="Close">${ICONS.x}</button>
    </div>
    <div class="klavity-body">
      <div class="klavity-page"><b>Page:</b> ${window.location.pathname}</div>
      <div class="klavity-strip" id="klavity-strip"></div>
      <div class="klavity-actions">
        <button id="klavity-full">${ICONS.camera} Capture Screen</button>
        <button id="klavity-region">${ICONS.crop} Capture Area</button>
        <button id="klavity-upload">${ICONS.image} Upload Images</button>
      </div>
      <input type="file" id="klavity-file" accept="image/*,.heic,.heif" multiple style="display:none">
      <div class="klavity-counter" id="klavity-counter">0/5 images · paste with ⌘+V</div>
      <div class="klavity-error" id="klavity-err"></div>
      <textarea class="klavity-desc" id="klavity-desc" placeholder="Describe the bug..."></textarea>
      <button class="klavity-submit" id="klavity-submit" disabled>${ICONS.send} Submit</button>
    </div>
  `

  overlay.appendChild(modal)
  root.appendChild(overlay)
  ;(root.host as HTMLElement).style.display = ''

  const bugBtn = modal.querySelector('.bug') as HTMLButtonElement
  const featBtn = modal.querySelector('.feat') as HTMLButtonElement
  bugBtn.addEventListener('click', () => { currentReportType = 'bug'; bugBtn.classList.add('active'); featBtn.classList.remove('active') })
  featBtn.addEventListener('click', () => { currentReportType = 'feature'; featBtn.classList.add('active'); bugBtn.classList.remove('active') })

  const desc = modal.querySelector('#klavity-desc') as HTMLTextAreaElement
  const submit = modal.querySelector('#klavity-submit') as HTMLButtonElement
  desc.addEventListener('input', () => { submit.disabled = desc.value.trim() === '' })

  modal.querySelector('#klavity-close')!.addEventListener('click', () => closeModal())
  submit.addEventListener('click', () => handleSubmit(desc.value.trim()))
  modal.querySelector('#klavity-full')!.addEventListener('click', () => captureFullPage())
  modal.querySelector('#klavity-region')!.addEventListener('click', () => startRegion())
  modal.querySelector('#klavity-upload')!.addEventListener('click', () => (modal.querySelector('#klavity-file') as HTMLInputElement).click())
  modal.querySelector('#klavity-file')!.addEventListener('change', (e) => handleFileSelect(e as Event))

  document.addEventListener('paste', handlePaste)
  document.addEventListener('keydown', handleEscape, { capture: true })

  // Auto-capture screenshot after 200ms
  setTimeout(() => captureFullPage(), 200)
}

function closeModal() {
  shadowRoot?.replaceChildren()
  document.removeEventListener('paste', handlePaste)
  document.removeEventListener('keydown', handleEscape, { capture: true })
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); closeModal() }
}

function updateStrip() {
  const root = shadowRoot!
  const strip = root.getElementById('klavity-strip')!
  const counter = root.getElementById('klavity-counter')!
  strip.innerHTML = ''
  screenshots.forEach((dataUrl, i) => {
    const wrap = document.createElement('div')
    wrap.className = 'klavity-thumb'
    const img = document.createElement('img')
    img.src = dataUrl
    const ovl = document.createElement('div')
    ovl.className = 'klavity-ovl'
    const markup = document.createElement('button')
    markup.className = 'klavity-markup'
    markup.setAttribute('aria-label', 'Annotate')
    markup.innerHTML = ICONS.pencil
    markup.addEventListener('click', () => openAnnotator(i))
    const rm = document.createElement('button')
    rm.className = 'klavity-rm'
    rm.setAttribute('aria-label', 'Remove')
    rm.innerHTML = ICONS.trash
    rm.addEventListener('click', () => { screenshots.splice(i, 1); updateStrip() })
    ovl.append(markup, rm)
    wrap.append(img, ovl)
    strip.appendChild(wrap)
  })
  counter.textContent = `${screenshots.length}/5 images · paste with ⌘+V`
}

function addScreenshot(dataUrl: string) {
  if (!dataUrl || screenshots.length >= 5) return
  if (screenshots.includes(dataUrl)) return // dedupe (e.g. double auto-capture)
  screenshots.push(dataUrl)
  updateStrip()
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

function captureFullPage() {
  const host = shadowRoot?.host as HTMLElement | undefined
  if (host) host.style.display = 'none'
  pendingFullCapture = true
  // Wait one frame + 50ms so Chrome finishes repainting before capturing
  requestAnimationFrame(() => setTimeout(() => {
    if (!isContextValid()) {
      pendingFullCapture = false
      if (host) host.style.display = ''
      showToast('Extension reloaded. Please refresh the page.')
      return
    }
    sendToBackground({ kind: 'CAPTURE_TAB' }).catch(() => {
      pendingFullCapture = false
      if (host) host.style.display = ''
    })
  }, 50))
  // Fail-safe: if no capture result comes back, re-show the modal so it can never
  // get stuck hidden ("flash and disappear").
  setTimeout(() => {
    if (pendingFullCapture) {
      pendingFullCapture = false
      if (host) host.style.display = ''
    }
  }, 2200)
}

async function handleFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  for (const file of Array.from(files)) {
    if (screenshots.length >= 5) break
    const dataUrl = await fileToDataUrl(file)
    addScreenshot(dataUrl)
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  if (file.type === 'image/heic' || file.name.endsWith('.heic') || file.name.endsWith('.heif')) {
    const heic2any = (await import('heic2any')).default
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }) as Blob
    return blobToDataUrl(blob)
  }
  return blobToDataUrl(file)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function handlePaste(e: ClipboardEvent) {
  if (!e.clipboardData) return
  for (const item of Array.from(e.clipboardData.items)) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile()
      if (blob) blobToDataUrl(blob).then(addScreenshot)
    }
  }
}

function startRegion() {
  const host = shadowRoot?.host as HTMLElement | undefined
  if (host) host.style.display = 'none'

  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;cursor:crosshair;z-index:2147483646;user-select:none;'
  document.body.appendChild(overlay)

  let startX = 0, startY = 0, active = false

  const hint = document.createElement('div')
  hint.textContent = 'Drag to select an area · Esc to cancel'
  hint.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-family:system-ui;font-size:14px;background:rgba(0,0,0,.7);padding:8px 16px;border-radius:6px;pointer-events:none;z-index:2147483647;'
  document.body.appendChild(hint)

  function cancel() {
    document.removeEventListener('keydown', escHandler, { capture: true })
    overlay.remove()
    hint.remove()
    if (host) host.style.display = ''
  }

  function escHandler(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); cancel() }
  }
  document.addEventListener('keydown', escHandler, { capture: true })

  overlay.addEventListener('pointerdown', (e) => {
    active = true
    startX = e.clientX
    startY = e.clientY
    hint.remove()
  })

  overlay.addEventListener('pointermove', (e) => {
    if (!active) return
    const x = Math.min(e.clientX, startX)
    const y = Math.min(e.clientY, startY)
    const w = Math.abs(e.clientX - startX)
    const h = Math.abs(e.clientY - startY)
    overlay.style.background = `
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) 0 0/${x}px 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${x+w}px 0/calc(100% - ${x+w}px) 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${x}px 0/${w}px ${y}px,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${x}px ${y+h}px/${w}px calc(100% - ${y+h}px)
    `
    overlay.style.backgroundRepeat = 'no-repeat'
  })

  overlay.addEventListener('pointerup', async (e) => {
    if (!active) return
    active = false
    const w = Math.abs(e.clientX - startX)
    const h = Math.abs(e.clientY - startY)
    if (w < 8 || h < 8) { cancel(); return }

    const rect = { x: Math.min(e.clientX, startX), y: Math.min(e.clientY, startY), w, h }
    overlay.remove()

    // Capture full page, then crop to selected rect
    const onCapture = async (ev: Event) => {
      pendingRegionCapture = false
      const { dataUrl, error } = (ev as CustomEvent).detail as { dataUrl: string; error?: string }
      if (!dataUrl) {
        if (host) host.style.display = ''
        document.removeEventListener('keydown', escHandler, { capture: true })
        showToast(error ? `Screen capture failed: ${error}` : 'Screen capture failed. Check extension permissions.')
        return
      }
      const dpr = window.devicePixelRatio || 1
      try {
        const cropped = await cropDataUrl(
          dataUrl,
          { x: rect.x * dpr, y: rect.y * dpr, w: rect.w * dpr, h: rect.h * dpr },
          window.scrollX * dpr,
          window.scrollY * dpr,
        )
        if (host) host.style.display = ''
        addScreenshot(cropped)
      } catch (err) {
        if (host) host.style.display = ''
        showToast('Failed to crop screenshot.')
      }
      document.removeEventListener('keydown', escHandler, { capture: true })
    }
    pendingRegionCapture = true
    document.addEventListener('klavity-capture-result', onCapture, { once: true })

    // Wait one frame + 80ms so Chrome finishes repainting (removing the selection overlay) before capturing
    requestAnimationFrame(() => setTimeout(() => {
      if (!isContextValid()) {
        pendingRegionCapture = false
        if (host) host.style.display = ''
        document.removeEventListener('klavity-capture-result', onCapture)
        document.removeEventListener('keydown', escHandler, { capture: true })
        showToast('Extension reloaded. Please refresh the page.')
        return
      }
      sendToBackground({ kind: 'CAPTURE_TAB' }).catch(() => {
        pendingRegionCapture = false
        if (host) host.style.display = ''
        document.removeEventListener('klavity-capture-result', onCapture)
        document.removeEventListener('keydown', escHandler, { capture: true })
      })
    }, 80))
  })
}

function openAnnotator(index: number) {
  const dataUrl = screenshots[index]
  const root = getHost()

  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const annotator = new Annotator(canvas, dataUrl)
    annotator.redraw()

    const editor = document.createElement('div')
    editor.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;pointer-events:all;'

    const toolbar = document.createElement('div')
    toolbar.style.cssText = 'display:flex;gap:8px;padding:8px;background:#1e1e2e;flex-wrap:wrap;'
    toolbar.innerHTML = `
      <button data-tool="pen" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">✏️ Pen</button>
      <button data-tool="rect" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">⬜ Rect</button>
      <button data-tool="arrow" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">↗ Arrow</button>
      <button data-tool="text" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">T Text</button>
      <button data-color="#ef4444" style="background:#ef4444;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
      <button data-color="#f97316" style="background:#f97316;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
      <button data-color="#3b82f6" style="background:#3b82f6;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
      <button data-color="#111827" style="background:#111827;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;border:1px solid #555;"></button>
      <button id="klavity-undo" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;margin-left:auto;">↩ Undo</button>
      <button id="klavity-clear" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">🗑 Clear</button>
      <button id="klavity-save" style="padding:6px 10px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-weight:700;">✓ Save</button>
      <button id="klavity-ann-cancel" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">✕</button>
    `

    canvas.style.cssText = 'flex:1;max-width:100%;max-height:100%;object-fit:contain;cursor:crosshair;display:block;margin:auto;'
    editor.append(toolbar, canvas)
    root.appendChild(editor)

    let activeTool = 'rect'
    let activeColor = '#ef4444'
    let drawing = false
    let penPoints: Array<{ x: number; y: number }> = []
    let startX = 0, startY = 0

    toolbar.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => { activeTool = (btn as HTMLElement).dataset.tool! })
    })
    toolbar.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => { activeColor = (btn as HTMLElement).dataset.color! })
    })
    toolbar.querySelector('#klavity-undo')!.addEventListener('click', () => annotator.undo())
    toolbar.querySelector('#klavity-clear')!.addEventListener('click', () => annotator.clearAll())
    toolbar.querySelector('#klavity-save')!.addEventListener('click', async () => {
      screenshots[index] = await annotator.save()
      editor.remove()
      updateStrip()
    })
    toolbar.querySelector('#klavity-ann-cancel')!.addEventListener('click', () => editor.remove())

    function toImgCoords(e: PointerEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      }
    }

    canvas.addEventListener('pointerdown', (e) => {
      drawing = true
      const pt = toImgCoords(e);
      ({ x: startX, y: startY } = pt)
      if (activeTool === 'pen') penPoints = [pt]
      if (activeTool === 'text') {
        drawing = false
        const input = document.createElement('input')
        input.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:transparent;border:1px dashed ${activeColor};color:${activeColor};font-size:16px;outline:none;z-index:9999999;min-width:80px;`
        document.body.appendChild(input)
        input.focus()
        const commit = () => {
          if (input.value.trim()) annotator.addShape({ type: 'text', color: activeColor, x: startX, y: startY, text: input.value.trim() })
          input.remove()
        }
        input.addEventListener('blur', commit, { once: true })
        input.addEventListener('keydown', (ke) => { if (ke.key === 'Enter') { input.blur() } })
      }
    })

    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return
      if (activeTool === 'pen') penPoints.push(toImgCoords(e))
    })

    canvas.addEventListener('pointerup', (e) => {
      if (!drawing) return
      drawing = false
      const pt = toImgCoords(e)
      if (activeTool === 'pen' && penPoints.length > 1) {
        annotator.addShape({ type: 'pen', color: activeColor, points: penPoints })
      } else if (activeTool === 'rect') {
        annotator.addShape({ type: 'rect', color: activeColor, x: Math.min(startX, pt.x), y: Math.min(startY, pt.y), w: Math.abs(pt.x - startX), h: Math.abs(pt.y - startY) })
      } else if (activeTool === 'arrow') {
        annotator.addShape({ type: 'arrow', color: activeColor, x1: startX, y1: startY, x2: pt.x, y2: pt.y })
      }
    })

    const annEscHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); editor.remove() } }
    document.addEventListener('keydown', annEscHandler, { capture: true, once: true })
  }
  img.src = dataUrl
}

async function handleSubmit(description: string) {
  if (!isContextValid()) {
    showToast('Extension reloaded. Please refresh the page.')
    return
  }
  const root = shadowRoot!
  const submit = root.getElementById('klavity-submit') as HTMLButtonElement
  const errEl = root.getElementById('klavity-err') as HTMLElement
  submit.disabled = true
  submit.textContent = 'Filing...'
  errEl.style.display = 'none'

  const payload: SubmitReportPayload = {
    type: currentReportType,
    description,
    context: buildContext(),
    screenshots: [...screenshots],
  }

  sendToBackground({ kind: 'SUBMIT_REPORT', payload }).catch(() => {})
}

// ── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: ContentMessage) => {
  if (msg.kind === 'CAPTURE_TAB_RESULT') {
    const isRegion = pendingRegionCapture
    document.dispatchEvent(new CustomEvent('klavity-capture-result', { detail: { dataUrl: msg.dataUrl, error: msg.error } }))
    if (pendingFullCapture) {
      pendingFullCapture = false
      const host = shadowRoot?.host as HTMLElement | undefined
      if (host) host.style.display = ''
      if (!msg.dataUrl) {
        showToast(msg.error ? `Screen capture failed: ${msg.error}` : 'Screen capture failed. Check extension permissions.')
      }
    }
    if (!isRegion && shadowRoot?.querySelector('.klavity-overlay')) {
      addScreenshot(msg.dataUrl)
    }
    return
  }

  if (msg.kind === 'SUBMIT_SUCCESS') {
    const root = shadowRoot
    if (root) {
      root.innerHTML = `
        <style>.klavity-success{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;font-family:system-ui,-apple-system,sans-serif;}</style>
        <div class="klavity-success">
          <div style="background:#FBF6EE;color:#2D2A26;border-radius:18px;padding:30px 38px;font-size:16px;text-align:center;box-shadow:0 24px 70px rgba(40,30,20,.28);">
            <span style="color:#3AA76D;font-weight:700;">✓</span> Filed as <strong>${msg.issueKey}</strong>
          </div>
        </div>
      `
      setTimeout(closeModal, 1500)
    }
    return
  }

  if (msg.kind === 'SUBMIT_ERROR') {
    const errEl = shadowRoot?.getElementById('klavity-err')
    if (errEl) {
      errEl.textContent = msg.message
      errEl.style.display = 'block'
      const submit = shadowRoot?.getElementById('klavity-submit') as HTMLButtonElement | null
      if (submit) { submit.disabled = false; submit.textContent = 'Submit' }
    }
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
  if (e.shiftKey || nativeMenuPending) {
    nativeMenuPending = false
    return // pass through to native browser menu
  }
  e.preventDefault()
  showCtxMenu(e.clientX, e.clientY)
}

document.addEventListener('contextmenu', handleContextMenu)

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
let klavReviewedRoutes = new Set<string>()   // debounce: one review per (path) per page-load
let klavActivating = false
let klavLastUrl = location.href
let klavIndicatorEl: HTMLElement | null = null

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

function klavSend<T = any>(msg: BackgroundMessage): Promise<T> {
  return new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (resp) => { void chrome.runtime.lastError; resolve(resp as T) }) }
    catch { resolve(undefined as T) }
  })
}

// A cheap DOM signature so server-side dedupe is per content-state, not just per path.
function klavDomSig(): string {
  const t = (document.title || '').slice(0, 80)
  const n = document.querySelectorAll('main, [role="main"], h1, h2, button, a').length
  return `${t}~${n}`
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

function klavRenderBubble(r: { simName: string; initials: string; accent: string; observation?: string; severity?: string; citation?: any }) {
  const root = klavGetHost()
  const stack = root.getElementById('klav-stack')!
  const b = document.createElement('div')
  b.className = 'klav-bubble'
  b.style.position = 'relative'
  const cite = r.citation?.sourceQuote
    ? `<div class="klav-cite">“${String(r.citation.sourceQuote).slice(0, 90)}”${r.citation.speaker ? ' — ' + r.citation.speaker : ''}</div>` : ''
  const sev = r.severity ? `<span class="klav-sev">${r.severity}</span>` : ''
  b.innerHTML = `
    <button class="klav-bclose" aria-label="Dismiss">×</button>
    <div class="klav-bhead">
      <div class="klav-av" style="background:${r.accent || '#A98BD6'}">${(r.initials || r.simName || '?').slice(0, 2)}</div>
      <div class="klav-nm">${r.simName || 'Sim'}</div>${sev}
    </div>
    <div class="klav-obs">${(r.observation || '').replace(/</g, '&lt;')}</div>
    ${cite}
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

// ── The activation entry point. Debounced to one review per route. ──
async function maybeActivate(_reason: string) {
  if (klavActivating) return
  if (!klavConfig?.token) return
  const url = location.href
  const project = klavMatchProject(url)
  // Off-allowlist → tear down any indicator and stop (we NEVER capture off-allowlist).
  if (!project) { klavIndicatorEl?.remove(); klavIndicatorEl = null; return }

  const routeKey = klavNormUrl(url)
  const paused = await klavIsUserPaused(project.id)
  klavRenderIndicator(project.id, paused)
  if (paused) return
  if (klavReviewedRoutes.has(routeKey)) return  // debounce: already reviewed this route

  // Gate c (client mirror): first capture needs consent. Server re-checks authoritatively.
  if (!(await klavHasConsent(project.id))) {
    const granted = await klavConsentPrompt(project)
    if (!granted) return
  }

  klavActivating = true
  klavReviewedRoutes.add(routeKey)
  try {
    const dataUrl = await klavCapture()
    if (!dataUrl) return
    const resp = await klavSend<{ ok: boolean; status: number; body: any }>({
      kind: 'KLAV_REVIEW', projectId: project.id, url, domSig: klavDomSig(), screenshotDataUrl: dataUrl,
    })
    const body = resp?.body || {}
    if (resp?.ok && Array.isArray(body.reviews)) {
      for (const rv of body.reviews) {
        for (const r of (rv.reactions || [])) {
          klavRenderBubble({ simName: rv.simName, initials: rv.initials, accent: rv.accent, observation: r.observation, severity: r?.suggestedBug?.severity, citation: r.citation })
        }
      }
    } else if (body.reason === 'needsConsent') {
      // server says no consent on record — clear local cache so we re-prompt next route.
      await klavSetConsent(project.id, 'revoked'); klavReviewedRoutes.delete(routeKey)
    } else if (body.reason === 'budgetExhausted') {
      klavNotice('Sims hit today’s review budget — paused until tomorrow.')
      klavRenderIndicator(project.id, true)
    } else if (body.reason === 'paused' || body.reason === 'userPaused') {
      klavRenderIndicator(project.id, true)
    }
    // 'offAllowlist' / 'alreadyReviewed' → silent (no spam).
  } finally {
    klavActivating = false
  }
}

// ── SPA navigation backstop. The static <all_urls> content script fires once at
//    document_idle; SPAs swap routes without a reload, so we also watch history +
//    poll location as a backstop (tabs.onUpdated is the background-side complement).
function klavOnRouteChange() {
  if (location.href === klavLastUrl) return
  klavLastUrl = location.href
  klavClearBubbles()
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
  await maybeActivate('boot')
}
void klavBootstrap()
