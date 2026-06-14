import type { ContentMessage, BackgroundMessage, ReportType, SubmitReportPayload, ConsoleError, NetworkFailure } from '@klav/core'
import { Annotator } from '@klav/core/annotator'
import { cropDataUrl } from '@klav/core/crop'

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
    } satisfies BackgroundMessage)
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

function getHost(): ShadowRoot {
  if (!shadowRoot) {
    const host = document.createElement('div')
    host.id = 'klav-host'
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
function openModal(type: ReportType) {
  currentReportType = type
  screenshots = []
  const root = getHost()
  root.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = `
    .klav-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;pointer-events:all;}
    .klav-modal{background:#1e1e2e;color:#cdd6f4;border-radius:12px;padding:24px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:system-ui,sans-serif;}
    .klav-toggle{display:flex;gap:8px;margin-bottom:16px;}
    .klav-toggle button{flex:1;padding:8px;border-radius:6px;border:none;cursor:pointer;font-size:14px;font-weight:600;}
    .klav-toggle .bug.active{background:#f38ba8;color:#1e1e2e;}
    .klav-toggle .feat.active{background:#fab387;color:#1e1e2e;}
    .klav-toggle button:not(.active){background:#313244;color:#cdd6f4;}
    .klav-page{font-size:12px;color:#a6adc8;margin-bottom:12px;}
    .klav-strip{display:flex;gap:8px;overflow-x:auto;margin-bottom:12px;min-height:64px;}
    .klav-thumb{position:relative;flex-shrink:0;}
    .klav-thumb img{height:60px;border-radius:4px;border:1px solid #45475a;}
    .klav-thumb .klav-rm{position:absolute;top:-4px;right:-4px;background:#f38ba8;color:#1e1e2e;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;}
    .klav-thumb .klav-markup{position:absolute;bottom:-4px;right:-4px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;}
    .klav-actions{display:flex;gap:8px;margin-bottom:12px;}
    .klav-actions button{flex:1;padding:8px;background:#313244;color:#cdd6f4;border:none;border-radius:6px;cursor:pointer;font-size:12px;}
    .klav-counter{font-size:11px;color:#a6adc8;margin-bottom:8px;}
    textarea.klav-desc{width:100%;min-height:100px;resize:vertical;background:#181825;color:#cdd6f4;border:1px solid #45475a;border-radius:6px;padding:10px;font-size:14px;margin-bottom:16px;box-sizing:border-box;}
    .klav-submit{width:100%;padding:12px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;}
    .klav-submit:disabled{opacity:.5;cursor:not-allowed;}
    .klav-error{color:#f38ba8;font-size:13px;margin-bottom:8px;display:none;}
  `
  root.appendChild(style)

  const overlay = document.createElement('div')
  overlay.className = 'klav-overlay'
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })

  const modal = document.createElement('div')
  modal.className = 'klav-modal'
  modal.innerHTML = `
    <div class="klav-toggle">
      <button class="bug ${type === 'bug' ? 'active' : ''}">🐛 Bug</button>
      <button class="feat ${type === 'feature' ? 'active' : ''}">💡 Feature</button>
    </div>
    <div class="klav-page">📍 ${window.location.pathname}</div>
    <div class="klav-strip" id="klav-strip"></div>
    <div class="klav-actions">
      <button id="klav-full">📷 Full Page</button>
      <button id="klav-region">✂️ Region</button>
      <button id="klav-upload">🖼 Upload</button>
    </div>
    <input type="file" id="klav-file" accept="image/*,.heic,.heif" multiple style="display:none">
    <div class="klav-counter" id="klav-counter">0/5 images · paste with ⌘+V</div>
    <div class="klav-error" id="klav-err"></div>
    <textarea class="klav-desc" id="klav-desc" placeholder="Describe the bug..."></textarea>
    <button class="klav-submit" id="klav-submit" disabled>Submit</button>
  `

  overlay.appendChild(modal)
  root.appendChild(overlay)

  const bugBtn = modal.querySelector('.bug') as HTMLButtonElement
  const featBtn = modal.querySelector('.feat') as HTMLButtonElement
  bugBtn.addEventListener('click', () => { currentReportType = 'bug'; bugBtn.classList.add('active'); featBtn.classList.remove('active') })
  featBtn.addEventListener('click', () => { currentReportType = 'feature'; featBtn.classList.add('active'); bugBtn.classList.remove('active') })

  const desc = modal.querySelector('#klav-desc') as HTMLTextAreaElement
  const submit = modal.querySelector('#klav-submit') as HTMLButtonElement
  desc.addEventListener('input', () => { submit.disabled = desc.value.trim() === '' })

  submit.addEventListener('click', () => handleSubmit(desc.value.trim()))
  modal.querySelector('#klav-full')!.addEventListener('click', () => captureFullPage())
  modal.querySelector('#klav-region')!.addEventListener('click', () => startRegion())
  modal.querySelector('#klav-upload')!.addEventListener('click', () => (modal.querySelector('#klav-file') as HTMLInputElement).click())
  modal.querySelector('#klav-file')!.addEventListener('change', (e) => handleFileSelect(e as Event))

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
  const strip = root.getElementById('klav-strip')!
  const counter = root.getElementById('klav-counter')!
  strip.innerHTML = ''
  screenshots.forEach((dataUrl, i) => {
    const wrap = document.createElement('div')
    wrap.className = 'klav-thumb'
    const img = document.createElement('img')
    img.src = dataUrl
    const rm = document.createElement('button')
    rm.className = 'klav-rm'
    rm.textContent = '×'
    rm.addEventListener('click', () => { screenshots.splice(i, 1); updateStrip() })
    const markup = document.createElement('button')
    markup.className = 'klav-markup'
    markup.textContent = '✏'
    markup.addEventListener('click', () => openAnnotator(i))
    wrap.append(img, rm, markup)
    strip.appendChild(wrap)
  })
  counter.textContent = `${screenshots.length}/5 images · paste with ⌘+V`
}

function addScreenshot(dataUrl: string) {
  if (screenshots.length >= 5) return
  screenshots.push(dataUrl)
  updateStrip()
}

function captureFullPage() {
  chrome.runtime.sendMessage({ kind: 'CAPTURE_TAB' } satisfies BackgroundMessage)
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
    document.addEventListener('klav-capture-result', onCapture, { once: true })
    chrome.runtime.sendMessage({ kind: 'CAPTURE_TAB' } satisfies BackgroundMessage)
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
      <button id="klav-undo" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;margin-left:auto;">↩ Undo</button>
      <button id="klav-clear" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">🗑 Clear</button>
      <button id="klav-save" style="padding:6px 10px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-weight:700;">✓ Save</button>
      <button id="klav-ann-cancel" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">✕</button>
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
    toolbar.querySelector('#klav-undo')!.addEventListener('click', () => annotator.undo())
    toolbar.querySelector('#klav-clear')!.addEventListener('click', () => annotator.clearAll())
    toolbar.querySelector('#klav-save')!.addEventListener('click', async () => {
      screenshots[index] = await annotator.save()
      editor.remove()
      updateStrip()
    })
    toolbar.querySelector('#klav-ann-cancel')!.addEventListener('click', () => editor.remove())

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
  const submit = root.getElementById('klav-submit') as HTMLButtonElement
  const errEl = root.getElementById('klav-err') as HTMLElement
  submit.disabled = true
  submit.textContent = 'Filing...'
  errEl.style.display = 'none'

  const payload: SubmitReportPayload = {
    type: currentReportType,
    description,
    context: buildContext(),
    screenshots: [...screenshots],
  }

  chrome.runtime.sendMessage({ kind: 'SUBMIT_REPORT', payload } satisfies BackgroundMessage)
}

// ── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: ContentMessage) => {
  if (msg.kind === 'CAPTURE_TAB_RESULT') {
    // Fire custom event for region capture listener
    document.dispatchEvent(new CustomEvent('klav-capture-result', { detail: msg.dataUrl }))
    // Only add to strip directly if NOT a region capture (region capture handles its own crop+add)
    if (!pendingRegionCapture && shadowRoot?.querySelector('.klav-overlay')) {
      addScreenshot(msg.dataUrl)
    }
    return
  }

  if (msg.kind === 'SUBMIT_SUCCESS') {
    const root = shadowRoot
    if (root) {
      root.innerHTML = `
        <style>.klav-success{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;}</style>
        <div class="klav-success">
          <div style="background:#1e1e2e;color:#a6e3a1;border-radius:12px;padding:32px;font-family:system-ui;font-size:16px;text-align:center;">
            ✓ Filed as <strong>${msg.issueKey}</strong>
          </div>
        </div>
      `
      setTimeout(closeModal, 1500)
    }
    return
  }

  if (msg.kind === 'SUBMIT_ERROR') {
    const errEl = shadowRoot?.getElementById('klav-err')
    if (errEl) {
      errEl.textContent = msg.message
      errEl.style.display = 'block'
      const submit = shadowRoot?.getElementById('klav-submit') as HTMLButtonElement | null
      if (submit) { submit.disabled = false; submit.textContent = 'Submit' }
    }
    return
  }

  if (msg.kind === 'OPEN_MODAL') {
    openModal(msg.reportType)
  }
})
