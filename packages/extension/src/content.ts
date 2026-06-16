import type { ContentMessage, BackgroundMessage, ReportType, SubmitReportPayload, ConsoleError, NetworkFailure } from '@klavity/core'
import { Annotator } from '@klavity/core/annotator'
import { cropDataUrl } from '@klavity/core/crop'

// ── Error + network capture ring buffer ──────────────────────────────────────
const consoleErrors: ConsoleError[] = []
const networkFailures: NetworkFailure[] = []
const MAX_RING = 50

// ── Auto-file deduplication ──────────────────────────────────────────────────
// Maps a normalised error key → timestamp of last auto-filed report.
// Errors with the same key within 30 seconds are suppressed.
const AUTO_FILE_DEDUP_MS = 30_000
const recentAutoFiled = new Map<string, number>()

function maybeAutoFile(message: string, stack?: string) {
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
  const message = String(msg)
  const stack = err?.stack
  consoleErrors.push({ message, stack, timestamp: Date.now() })
  if (consoleErrors.length > MAX_RING) consoleErrors.shift()
  maybeAutoFile(message, stack)
  return false
}

window.addEventListener('unhandledrejection', (e) => {
  const message = String(e.reason)
  const stack = e.reason?.stack
  consoleErrors.push({ message, stack, timestamp: Date.now() })
  if (consoleErrors.length > MAX_RING) consoleErrors.shift()
  maybeAutoFile(message, stack)
})

const origFetch = window.fetch
window.fetch = async (...args) => {
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
    .klavity-strip{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;}
    .klavity-strip:empty{display:none;}
    .klavity-thumb{position:relative;flex:1 1 100%;min-width:0;border-radius:13px;overflow:hidden;border:1px solid #E5DCCD;box-shadow:0 2px 8px rgba(40,30,20,.08);background:#fff;}
    .klavity-thumb img{display:block;width:100%;max-height:230px;object-fit:cover;object-position:top;}
    .klavity-thumb .klavity-ovl{position:absolute;top:9px;right:9px;display:flex;gap:7px;}
    .klavity-thumb .klavity-ovl button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;background:rgba(45,40,35,.62);color:#fff;backdrop-filter:blur(2px);transition:background .12s;}
    .klavity-thumb .klavity-ovl button:hover{background:rgba(45,40,35,.85);}
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
  if (screenshots.length >= 5) return
  if (screenshots.includes(dataUrl)) return // dedupe (e.g. double auto-capture)
  screenshots.push(dataUrl)
  updateStrip()
}

function captureFullPage() {
  const host = shadowRoot?.host as HTMLElement | undefined
  if (host) host.style.display = 'none'
  pendingFullCapture = true
  chrome.runtime.sendMessage({ kind: 'CAPTURE_TAB' } satisfies BackgroundMessage).catch(() => {})
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
      const dataUrl = (ev as CustomEvent).detail as string
      const dpr = window.devicePixelRatio || 1
      const cropped = await cropDataUrl(
        dataUrl,
        { x: rect.x * dpr, y: rect.y * dpr, w: rect.w * dpr, h: rect.h * dpr },
        window.scrollX * dpr,
        window.scrollY * dpr,
      )
      if (host) host.style.display = ''
      addScreenshot(cropped)
      document.removeEventListener('keydown', escHandler, { capture: true })
    }
    pendingRegionCapture = true
    document.addEventListener('klavity-capture-result', onCapture, { once: true })
    chrome.runtime.sendMessage({ kind: 'CAPTURE_TAB' } satisfies BackgroundMessage).catch(() => {})
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

  chrome.runtime.sendMessage({ kind: 'SUBMIT_REPORT', payload } satisfies BackgroundMessage).catch(() => {})
}

// ── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: ContentMessage) => {
  if (msg.kind === 'CAPTURE_TAB_RESULT') {
    document.dispatchEvent(new CustomEvent('klavity-capture-result', { detail: msg.dataUrl }))
    if (pendingFullCapture) {
      pendingFullCapture = false
      const host = shadowRoot?.host as HTMLElement | undefined
      if (host) host.style.display = ''
    }
    if (!pendingRegionCapture && shadowRoot?.querySelector('.klavity-overlay')) {
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
})

// ── Custom right-click menu ──────────────────────────────────────────────────
let ctxMenuEl: HTMLElement | null = null

function closeCtxMenu() {
  ctxMenuEl?.remove()
  ctxMenuEl = null
}

function showCtxMenu(x: number, y: number) {
  closeCtxMenu()

  const menu = document.createElement('div')
  ctxMenuEl = menu
  menu.style.cssText = 'position:fixed;z-index:2147483647;background:#fff;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.18),0 1px 4px rgba(0,0,0,.08);min-width:224px;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;border:1px solid rgba(0,0,0,.06);padding:4px 0;'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`

  const entries: Array<{ icon: string; iconColor: string; label: string; action: () => void }> = [
    { icon: ICONS.bug, iconColor: '#E94F37', label: 'Report a Bug', action: () => openModal('bug') },
    { icon: ICONS.bulb, iconColor: '#F4A93C', label: 'Request a Feature', action: () => openModal('feature') },
    { icon: ICONS.clipboard, iconColor: '#8A837A', label: 'View submissions', action: () => { chrome.runtime.sendMessage({ kind: 'OPEN_TRACKER_URL' } satisfies BackgroundMessage).catch(() => {}) } },
  ]

  entries.forEach((entry, i) => {
    if (i > 0) {
      const sep = document.createElement('div')
      sep.style.cssText = 'height:1px;background:#f0f0f0;margin:0 12px;'
      menu.appendChild(sep)
    }
    const btn = document.createElement('button')
    btn.style.cssText = 'display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;background:transparent;border:none;cursor:pointer;font-size:15px;font-weight:500;color:#1a1a1a;text-align:left;'
    const iconSpan = document.createElement('span')
    iconSpan.style.cssText = `display:inline-flex;flex-shrink:0;color:${entry.iconColor};`
    iconSpan.innerHTML = entry.icon
    const labelSpan = document.createElement('span')
    labelSpan.textContent = entry.label
    btn.append(iconSpan, labelSpan)
    btn.addEventListener('mouseenter', () => { btn.style.background = '#f5f5f5' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent' })
    btn.addEventListener('click', () => { closeCtxMenu(); entry.action() })
    menu.appendChild(btn)
  })

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

document.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  showCtxMenu(e.clientX, e.clientY)
})
