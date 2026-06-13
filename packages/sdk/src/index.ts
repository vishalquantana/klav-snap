import { toPng } from 'html-to-image'
import type { KlavSettings, ReportType, SubmitReportPayload, IntegrationConfig, ConsoleError, NetworkFailure } from '@klav/core'
import { DEFAULT_SETTINGS } from '@klav/core'
import { Annotator } from '@klav/core/annotator'
import { cropDataUrl } from '@klav/core/crop'
import { dispatchSubmit } from '@klav/core/submit'
import { submitReport as jiraSubmit } from '@klav/core/integrations/jira'
import { submitReport as linearSubmit } from '@klav/core/integrations/linear'
import { submitReport as githubSubmit } from '@klav/core/integrations/github'
import { submitReport as planeSubmit } from '@klav/core/integrations/plane'
import { submitReport as backendSubmit } from '@klav/core/integrations/backend'

export type SdkConfig = Partial<KlavSettings>

let _settings: KlavSettings = DEFAULT_SETTINGS
let _shadowHost: HTMLElement | null = null
let _screenshots: string[] = []
let _currentType: ReportType = 'bug'
let _shadowRoot: ShadowRoot | null = null
const _consoleErrors: ConsoleError[] = []
const _networkFailures: NetworkFailure[] = []
const MAX_RING = 50

async function capturePageDataUrl(): Promise<string> {
  return toPng(document.body, {
    cacheBust: true,
    pixelRatio: 1,
    skipFonts: true,
    filter: (node) => {
      if ((node as HTMLElement).id === 'klav-sdk-host') return false
      if (node.nodeName === 'IMG') {
        const src = (node as HTMLImageElement).src ?? ''
        if (src && !src.startsWith(window.location.origin) && !src.startsWith('data:')) return false
      }
      return true
    },
  })
}

function buildContext(): SubmitReportPayload['context'] {
  return {
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    consoleErrors: [..._consoleErrors],
    networkFailures: [..._networkFailures],
  }
}

async function dispatchToIntegration(config: IntegrationConfig) {
  return dispatchSubmit(
    { type: config.type, description: config.description, context: config.context, screenshots: config.screenshots },
    _settings,
    { jira: jiraSubmit, linear: linearSubmit, github: githubSubmit, plane: planeSubmit, backend: backendSubmit },
  )
}

function getRoot(): ShadowRoot {
  if (!_shadowHost) {
    _shadowHost = document.createElement('div')
    _shadowHost.id = 'klav-sdk-host'
    _shadowHost.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
    document.body.appendChild(_shadowHost)
    _shadowRoot = _shadowHost.attachShadow({ mode: 'open' })
  }
  return _shadowRoot!
}

function updateStrip() {
  const root = _shadowRoot!
  const strip = root.getElementById('klav-strip')
  const counter = root.getElementById('klav-counter')
  if (!strip || !counter) return
  strip.innerHTML = ''
  _screenshots.forEach((dataUrl, i) => {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'position:relative;flex-shrink:0;'
    const img = document.createElement('img')
    img.src = dataUrl
    img.style.cssText = 'height:60px;border-radius:4px;border:1px solid #45475a;'
    const rm = document.createElement('button')
    rm.textContent = '×'
    rm.style.cssText = 'position:absolute;top:-4px;right:-4px;background:#f38ba8;color:#1e1e2e;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;'
    rm.addEventListener('click', () => { _screenshots.splice(i, 1); updateStrip() })
    wrap.append(img, rm)
    strip.appendChild(wrap)
  })
  counter.textContent = `${_screenshots.length}/5 images`
}

function addScreenshot(dataUrl: string) {
  if (_screenshots.length >= 5) return
  _screenshots.push(dataUrl)
  updateStrip()
}

function closeModal() {
  if (_shadowRoot) _shadowRoot.innerHTML = ''
  document.removeEventListener('keydown', _escHandler, { capture: true })
}

function _escHandler(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); closeModal() }
}

export function openModal(type: ReportType = 'bug') {
  _currentType = type
  _screenshots = []
  const root = getRoot()
  root.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = `
    .kv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;pointer-events:all;}
    .kv-modal{background:#1e1e2e;color:#cdd6f4;border-radius:12px;padding:24px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:system-ui,sans-serif;}
    .kv-toggle{display:flex;gap:8px;margin-bottom:16px;}
    .kv-toggle button{flex:1;padding:8px;border-radius:6px;border:none;cursor:pointer;font-size:14px;font-weight:600;}
    .kv-toggle .bug.active{background:#f38ba8;color:#1e1e2e;}
    .kv-toggle .feat.active{background:#fab387;color:#1e1e2e;}
    .kv-toggle button:not(.active){background:#313244;color:#cdd6f4;}
    .kv-page{font-size:12px;color:#a6adc8;margin-bottom:12px;}
    .kv-strip{display:flex;gap:8px;overflow-x:auto;margin-bottom:12px;min-height:64px;}
    .kv-actions{display:flex;gap:8px;margin-bottom:12px;}
    .kv-actions button{flex:1;padding:8px;background:#313244;color:#cdd6f4;border:none;border-radius:6px;cursor:pointer;font-size:12px;}
    .kv-counter{font-size:11px;color:#a6adc8;margin-bottom:8px;}
    textarea.kv-desc{width:100%;min-height:100px;resize:vertical;background:#181825;color:#cdd6f4;border:1px solid #45475a;border-radius:6px;padding:10px;font-size:14px;margin-bottom:16px;box-sizing:border-box;}
    .kv-submit{width:100%;padding:12px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;}
    .kv-submit:disabled{opacity:.5;cursor:not-allowed;}
    .kv-error{color:#f38ba8;font-size:13px;margin-bottom:8px;display:none;}
  `
  root.appendChild(style)

  const overlay = document.createElement('div')
  overlay.className = 'kv-overlay'
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })

  const modal = document.createElement('div')
  modal.className = 'kv-modal'
  modal.innerHTML = `
    <div class="kv-toggle">
      <button class="bug ${type === 'bug' ? 'active' : ''}">🐛 Bug</button>
      <button class="feat ${type === 'feature' ? 'active' : ''}">💡 Feature</button>
    </div>
    <div class="kv-page">📍 ${window.location.pathname}</div>
    <div class="kv-strip" id="klav-strip"></div>
    <div class="kv-actions">
      <button id="kv-full">📷 Capture</button>
      <button id="kv-upload">🖼 Upload</button>
    </div>
    <input type="file" id="kv-file" accept="image/*,.heic,.heif" multiple style="display:none">
    <div class="kv-counter" id="klav-counter">0/5 images</div>
    <div class="kv-error" id="kv-err"></div>
    <textarea class="kv-desc" id="kv-desc" placeholder="Describe the bug..."></textarea>
    <button class="kv-submit" id="kv-submit" disabled>Submit</button>
  `

  overlay.appendChild(modal)
  root.appendChild(overlay)

  const bugBtn = modal.querySelector('.bug') as HTMLButtonElement
  const featBtn = modal.querySelector('.feat') as HTMLButtonElement
  bugBtn.addEventListener('click', () => { _currentType = 'bug'; bugBtn.classList.add('active'); featBtn.classList.remove('active') })
  featBtn.addEventListener('click', () => { _currentType = 'feature'; featBtn.classList.add('active'); bugBtn.classList.remove('active') })

  const desc = modal.querySelector('#kv-desc') as HTMLTextAreaElement
  const submit = modal.querySelector('#kv-submit') as HTMLButtonElement
  desc.addEventListener('input', () => { submit.disabled = desc.value.trim() === '' })

  modal.querySelector('#kv-full')!.addEventListener('click', async () => {
    try {
      const dataUrl = await capturePageDataUrl()
      addScreenshot(dataUrl)
    } catch { /* ignore capture errors */ }
  })

  modal.querySelector('#kv-upload')!.addEventListener('click', () => {
    (modal.querySelector('#kv-file') as HTMLInputElement).click()
  })

  modal.querySelector('#kv-file')!.addEventListener('change', async (e) => {
    const files = (e.target as HTMLInputElement).files
    if (!files) return
    for (const file of Array.from(files)) {
      if (_screenshots.length >= 5) break
      const dataUrl = await fileToDataUrl(file)
      addScreenshot(dataUrl)
    }
  })

  submit.addEventListener('click', async () => {
    const description = desc.value.trim()
    submit.disabled = true
    submit.textContent = 'Filing...'
    const errEl = root.getElementById('kv-err')!
    errEl.style.display = 'none'

    try {
      const result = await dispatchToIntegration({
        type: _currentType,
        description,
        context: buildContext(),
        screenshots: [..._screenshots],
        settings: _settings,
      })
      root.innerHTML = `
        <style>.kv-s{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;}</style>
        <div class="kv-s"><div style="background:#1e1e2e;color:#a6e3a1;border-radius:12px;padding:32px;font-family:system-ui;font-size:16px;text-align:center;">✓ Filed as <strong>${result.issueKey}</strong></div></div>
      `
      setTimeout(closeModal, 1500)
    } catch (err) {
      errEl.textContent = (err as Error).message
      errEl.style.display = 'block'
      submit.disabled = false
      submit.textContent = 'Submit'
    }
  })

  document.addEventListener('keydown', _escHandler, { capture: true })

  // Auto-capture on open
  setTimeout(async () => {
    try {
      const dataUrl = await capturePageDataUrl()
      addScreenshot(dataUrl)
    } catch { /* ignore */ }
  }, 200)
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

function setupErrorCapture() {
  window.onerror = (msg, _src, _line, _col, err) => {
    _consoleErrors.push({ message: String(msg), stack: err?.stack, timestamp: Date.now() })
    if (_consoleErrors.length > MAX_RING) _consoleErrors.shift()
    return false
  }
  window.addEventListener('unhandledrejection', (e) => {
    _consoleErrors.push({ message: String(e.reason), stack: e.reason?.stack, timestamp: Date.now() })
    if (_consoleErrors.length > MAX_RING) _consoleErrors.shift()
  })
  const origFetch = window.fetch
  window.fetch = async (...args) => {
    const res = await origFetch(...args)
    if (res.status >= 400) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url
      _networkFailures.push({ url, status: res.status, method: 'FETCH', timestamp: Date.now() })
      if (_networkFailures.length > MAX_RING) _networkFailures.shift()
    }
    return res
  }
}

function addContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const menu = document.createElement('div')
    menu.style.cssText = `position:fixed;left:${Math.min(e.clientX, window.innerWidth - 200)}px;top:${Math.min(e.clientY, window.innerHeight - 80)}px;background:#1e1e2e;border:1px solid #45475a;border-radius:8px;padding:4px;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:system-ui;`
    menu.innerHTML = `
      <div data-action="bug" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">🐛 Report a Bug</div>
      <div data-action="feature" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">💡 Request a Feature</div>
    `
    document.body.appendChild(menu)

    const dismiss = (ev?: Event) => {
      if (!ev || !menu.contains(ev.target as Node)) {
        menu.remove()
        document.removeEventListener('click', dismiss)
      }
    }

    menu.addEventListener('click', (ev) => {
      const action = (ev.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action') as ReportType | null
      menu.remove()
      document.removeEventListener('click', dismiss)
      if (action) openModal(action)
    })

    setTimeout(() => document.addEventListener('click', dismiss), 0)
  })
}

export function init(config: SdkConfig = {}) {
  _settings = { ...DEFAULT_SETTINGS, ...config }
  setupErrorCapture()
  addContextMenu()
}

// Expose on window for script-tag usage
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).KlavSnap = { init, openModal }
}

export default { init, openModal }

// Suppress unused import warnings for side-effect imports used indirectly
void Annotator
void cropDataUrl
