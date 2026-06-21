import type { ReportType } from './types'
import { Annotator } from './annotator'
import { themeCss, resolveModalConfig, type ModalConfig } from './modal-theme'
import { icon } from './icons'

/** Escape text for safe interpolation into innerHTML. */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface SuccessCopy {
  headline: string
  body: string
  emailLabel: string
  ctaText: string
  ctaUrl: string
  showEmail: boolean
  showCta: boolean
}

export interface ModalCallbacks {
  onCaptureFull: () => Promise<string>
  onRegionCapture?: (rect: { x: number; y: number; w: number; h: number }) => Promise<string>
  onSubmit: (payload: {
    type: ReportType
    description: string
    screenshots: string[]
    reporterEmail?: string
  }) => Promise<{ issueKey: string; issueUrl: string }>
  // When true, the compose screen shows a REQUIRED email field and blocks submit until it's valid.
  // Used by the embeddable widget on third-party sites when the project's report gate is "email",
  // so an end-user can file a ticket without a Klavity account. Default false → extension/authed
  // paths are unaffected (they already carry an identity).
  requireEmail?: boolean
  // Mode-aware success screen. When provided, a successful submit swaps the modal body for this
  // screen (headline/body, optional email-lead capture, optional CTA) and DOES NOT auto-close —
  // the user must interact. When absent, falls back to the themed thankYou/"Filed" auto-close card.
  // `copy` is static (built by the host from successCopy()); `onLead` POSTs the captured email,
  // referencing the returned feedback id (= issueKey).
  success?: {
    copy: SuccessCopy
    onLead?: (feedbackId: string, email: string) => Promise<void>
  }
  // When true, onCaptureFull() is called automatically ~200ms after the modal mounts and the
  // result is added to the screenshot strip. Default false — the production widget is unaffected.
  autoCaptureOnOpen?: boolean
}

export interface ModalController {
  shadowRoot: ShadowRoot
  addScreenshot: (dataUrl: string) => void
  close: () => void
}

export function buildModal(
  initialType: ReportType,
  callbacks: ModalCallbacks,
  config: ModalConfig = {},
): ModalController {
  const cfg = resolveModalConfig(config)
  // Create shadow host
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
  const shadowRoot = host.attachShadow({ mode: 'open' })
  document.body.appendChild(host)

  let screenshots: string[] = []
  let currentType = initialType

  const style = document.createElement('style')
  style.textContent = `
    ${themeCss(cfg)}
    @keyframes kl-genie-in{from{opacity:0;transform:translateY(180px) scaleX(.04) scaleY(.06)}to{opacity:1;transform:translateY(0) scaleX(1) scaleY(1)}}
    @keyframes kl-genie-out{from{opacity:1;transform:translateY(0) scaleX(1) scaleY(1)}to{opacity:0;transform:translateY(180px) scaleX(.04) scaleY(.06)}}
    @keyframes kl-ov{from{opacity:0}to{opacity:1}}
    .klavity-overlay{position:fixed;inset:0;background:var(--kl-overlay);display:flex;align-items:center;justify-content:center;pointer-events:all;animation:kl-ov .3s ease both;}
    .klavity-modal{background:var(--kl-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:var(--kl-radius);padding:24px;width:100%;max-width:480px;box-shadow:var(--kl-shadow);font-family:var(--kl-font,system-ui,sans-serif);-webkit-backdrop-filter:var(--kl-backdrop);backdrop-filter:var(--kl-backdrop);transform-origin:bottom center;animation:kl-genie-in .6s cubic-bezier(.16,1,.3,1) both;}
    .klavity-modal.kl-closing{animation:kl-genie-out .5s cubic-bezier(.55,0,.85,.25) both;}
    .klavity-toggle{display:flex;gap:8px;margin-bottom:16px;}
    .klavity-toggle button{flex:1;padding:8px;border-radius:6px;border:none;cursor:pointer;font-size:14px;font-weight:600;background:var(--kl-chip);color:var(--kl-fg);}
    .klavity-toggle .bug.active{background:var(--kl-accent2);color:var(--kl-on-accent);}
    .klavity-toggle .feat.active{background:var(--kl-accent2);color:var(--kl-on-accent);}
    .klavity-page{font-size:12px;color:var(--kl-muted);margin-bottom:12px;}
    .klavity-strip{display:flex;gap:8px;overflow-x:auto;margin-bottom:12px;min-height:64px;}
    .klavity-thumb{position:relative;flex-shrink:0;}
    .klavity-thumb img{height:72px;width:104px;object-fit:cover;object-position:top center;background:var(--kl-chip);display:block;border-radius:4px;border:1px solid var(--kl-border);cursor:pointer;transition:filter .12s;}
    .klavity-thumb img:hover{filter:brightness(.85);}
    .klavity-rm{position:absolute;top:-6px;right:-6px;background:var(--kl-accent2);color:var(--kl-on-accent);border:none;border-radius:50%;width:24px;height:24px;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3);}
    .klavity-mk{position:absolute;bottom:-6px;right:-6px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:50%;width:24px;height:24px;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3);}
    .klavity-actions{display:flex;gap:8px;margin-bottom:12px;}
    .klavity-actions button{flex:1;padding:8px;background:var(--kl-chip);color:var(--kl-fg);border:none;border-radius:6px;cursor:pointer;font-size:12px;}
    .klavity-counter{font-size:11px;color:var(--kl-muted);margin-bottom:8px;}
    textarea.klavity-desc{width:100%;min-height:100px;resize:vertical;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:6px;padding:10px;font-size:14px;margin-bottom:16px;box-sizing:border-box;}
    input.klavity-remail{width:100%;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:6px;padding:10px;font-size:14px;margin-bottom:10px;box-sizing:border-box;}
    .klavity-submit{width:100%;padding:12px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;}
    .klavity-submit:disabled{opacity:.5;cursor:not-allowed;}
    .klavity-error{color:#f38ba8;font-size:13px;margin-bottom:8px;display:none;}
    .klavity-success h2{margin:0 0 8px;font-size:18px;color:var(--kl-fg);}
    .klavity-success p{margin:0 0 16px;font-size:14px;color:var(--kl-muted);line-height:1.4;}
    .klavity-lead{display:flex;gap:8px;margin-bottom:12px;}
    .klavity-lead input{flex:1;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:6px;padding:9px 10px;font-size:14px;box-sizing:border-box;}
    .klavity-lead button{padding:9px 14px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;}
    .klavity-lead button:disabled{opacity:.5;cursor:not-allowed;}
    .klavity-thanks{font-size:13px;color:var(--kl-fg);margin-bottom:12px;}
    .klavity-cta{display:inline-block;padding:10px 16px;background:var(--kl-accent);color:var(--kl-on-accent);border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:12px;}
    .klavity-pb{text-align:center;font-size:10px;color:var(--kl-muted);margin-top:12px;}
    .klavity-pb a{color:var(--kl-muted);text-decoration:none;}
    @media (prefers-reduced-motion: reduce){.klavity-overlay,.klavity-modal,.klavity-modal.kl-closing{animation-duration:.01ms;}}
  `
  shadowRoot.appendChild(style)

  const overlay = document.createElement('div')
  overlay.className = 'klavity-overlay'

  const modal = document.createElement('div')
  modal.className = 'klavity-modal'
  modal.innerHTML = `
    <div class="klavity-toggle">
      <button class="bug ${initialType === 'bug' ? 'active' : ''}">${icon('bug')} Bug</button>
      <button class="feat ${initialType === 'feature' ? 'active' : ''}">${icon('lightbulb')} Feature</button>
    </div>
    <div class="klavity-page">${icon('map-pin')} ${typeof window !== 'undefined' ? escHtml(window.location.pathname) : ''}</div>
    <div class="klavity-strip" id="klavity-strip"></div>
    <div class="klavity-actions">
      <button id="klavity-full">${icon('camera')} Full Page</button>
      <button id="klavity-upload">${icon('image')} Upload</button>
      ${callbacks.onRegionCapture ? `<button id="klavity-region">${icon('scissors')} Region</button>` : ''}
    </div>
    <input type="file" id="klavity-file" accept="image/*,.heic,.heif" multiple style="display:none">
    <div class="klavity-counter" id="klavity-counter">0/5 images</div>
    <div class="klavity-error" id="klavity-err"></div>
    <textarea class="klavity-desc" id="klavity-desc" placeholder="Describe the bug..."></textarea>
    ${callbacks.requireEmail ? '<input type="email" class="klavity-remail" id="klavity-remail" placeholder="your@email.com" autocomplete="email">' : ''}
    <button class="klavity-submit" id="klavity-submit" disabled>Submit</button>
  `

  overlay.appendChild(modal)
  shadowRoot.appendChild(overlay)

  const controller: ModalController = {
    shadowRoot,
    addScreenshot,
    close,
  }

  function updateStrip() {
    const strip = shadowRoot.getElementById('klavity-strip')!
    const counter = shadowRoot.getElementById('klavity-counter')!
    strip.innerHTML = ''
    screenshots.forEach((dataUrl, i) => {
      const wrap = document.createElement('div')
      wrap.className = 'klavity-thumb'
      const img = document.createElement('img')
      img.src = dataUrl
      img.title = 'Click to mark up'
      // Click the thumbnail itself to open the full-screen markup editor (not just the pencil icon)
      img.addEventListener('click', () => openAnnotator(i))
      const rm = document.createElement('button')
      rm.className = 'klavity-rm'
      rm.textContent = '×'
      rm.title = 'Remove'
      rm.addEventListener('click', (e) => { e.stopPropagation(); screenshots.splice(i, 1); updateStrip() })
      const mk = document.createElement('button')
      mk.className = 'klavity-mk'
      mk.innerHTML = icon('pencil', { size: 13 })
      mk.title = 'Mark up'
      mk.addEventListener('click', (e) => { e.stopPropagation(); openAnnotator(i) })
      wrap.append(img, rm, mk)
      strip.appendChild(wrap)
    })
    counter.textContent = `${screenshots.length}/5 images`
  }

  function addScreenshot(dataUrl: string) {
    if (screenshots.length >= 5) return
    screenshots.push(dataUrl)
    updateStrip()
  }

  function close() {
    document.removeEventListener('keydown', escHandler, { capture: true })
    document.removeEventListener('paste', onPaste)
    const m = shadowRoot.querySelector('.klavity-modal') as HTMLElement | null
    if (!m) { host.remove(); return }
    m.classList.add('kl-closing')
    const done = () => host.remove()
    m.addEventListener('animationend', done, { once: true })
    setTimeout(done, 700) // safety if animationend doesn't fire
  }

  function escHandler(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
  }
  document.addEventListener('keydown', escHandler, { capture: true })

  const onPaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) return
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile()
        if (blob) fileToDataUrl(blob).then(addScreenshot).catch(() => {})
      }
    }
  }
  document.addEventListener('paste', onPaste)

  // Toggle
  const bugBtn = modal.querySelector('.bug') as HTMLButtonElement
  const featBtn = modal.querySelector('.feat') as HTMLButtonElement
  bugBtn.addEventListener('click', () => {
    currentType = 'bug'
    bugBtn.classList.add('active')
    featBtn.classList.remove('active')
  })
  featBtn.addEventListener('click', () => {
    currentType = 'feature'
    featBtn.classList.add('active')
    bugBtn.classList.remove('active')
  })

  // Submit
  const desc = modal.querySelector('#klavity-desc') as HTMLTextAreaElement
  const submitBtn = modal.querySelector('#klavity-submit') as HTMLButtonElement
  const remail = modal.querySelector('#klavity-remail') as HTMLInputElement | null
  // Submit is enabled only when there's a description AND (if a required email field is shown) a valid email.
  const emailValid = () => !callbacks.requireEmail || (!!remail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(remail.value.trim()))
  const refreshSubmit = () => { submitBtn.disabled = desc.value.trim() === '' || !emailValid() }
  desc.addEventListener('input', refreshSubmit)
  remail?.addEventListener('input', refreshSubmit)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

  submitBtn.addEventListener('click', async () => {
    const description = desc.value.trim()
    submitBtn.disabled = true
    submitBtn.textContent = 'Filing...'
    const errEl = shadowRoot.getElementById('klavity-err')!
    errEl.style.display = 'none'
    try {
      const result = await callbacks.onSubmit({ type: currentType, description, screenshots: [...screenshots], reporterEmail: remail?.value.trim() })
      if (callbacks.success) {
        // Mode-aware lead/CTA screen rendered THROUGH the existing themed modal — no auto-close;
        // the user must interact (submit email or click the CTA, or dismiss via overlay/esc).
        renderSuccess(result.issueKey, callbacks.success)
      } else {
        // Their themed auto-close card: custom thank-you (2600ms) or "check-circle Filed as KEY" (1500ms).
        const wrap = document.createElement('div')
        wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;'
        const card = document.createElement('div')
        card.style.cssText = 'background:var(--kl-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:var(--kl-radius);padding:32px;font-family:var(--kl-font,system-ui),sans-serif;font-size:16px;text-align:center;box-shadow:var(--kl-shadow);'
        if (cfg.thankYou) {
          card.textContent = cfg.thankYou
        } else {
          card.innerHTML = `${icon('check-circle', { label: 'Filed', size: 20 })} Filed as `
          card.appendChild(document.createTextNode(result.issueKey))
        }
        wrap.appendChild(card)
        // keep the themed style element; swap only the body
        overlay.remove()
        shadowRoot.appendChild(wrap)
        setTimeout(close, cfg.thankYou ? 2600 : 1500)
      }
    } catch (err) {
      errEl.textContent = (err as Error).message
      errEl.style.display = 'block'
      submitBtn.disabled = false
      submitBtn.textContent = 'Submit'
    }
  })

  // Capture buttons
  modal.querySelector('#klavity-full')!.addEventListener('click', async () => {
    try { addScreenshot(await callbacks.onCaptureFull()) } catch { /* ignore */ }
  })
  modal.querySelector('#klavity-upload')!.addEventListener('click', () => {
    (modal.querySelector('#klavity-file') as HTMLInputElement).click()
  })
  modal.querySelector('#klavity-file')!.addEventListener('change', async (e) => {
    const files = (e.target as HTMLInputElement).files
    if (!files) return
    for (const file of Array.from(files)) {
      if (screenshots.length >= 5) break
      addScreenshot(await fileToDataUrl(file))
    }
  })

  // Region capture button — only rendered when the host provides onRegionCapture
  const regionBtn = shadowRoot.getElementById('klavity-region') as HTMLButtonElement | null
  if (regionBtn && callbacks.onRegionCapture) {
    regionBtn.onclick = () => {
      // Remove the modal's own Esc handler so pressing Esc during region-select only
      // cancels the overlay and does NOT also close the modal.  It is re-added by the
      // cleanup() callback inside mountRegionOverlay (both the cancel and pointerup paths).
      document.removeEventListener('keydown', escHandler, { capture: true })
      host.style.display = 'none'
      mountRegionOverlay(async (rect) => {
        // Re-register the modal Esc handler now that the overlay is gone (success path).
        document.addEventListener('keydown', escHandler, { capture: true })
        try {
          const shot = await callbacks.onRegionCapture!(rect)
          if (shot) addScreenshot(shot)
        } finally {
          host.style.display = ''
        }
      }, () => {
        // Re-register the modal Esc handler now that the overlay is gone (cancel/Esc path).
        document.addEventListener('keydown', escHandler, { capture: true })
        // Esc/cancel — re-show the host without calling onRegionCapture
        host.style.display = ''
      })
    }
  }

  // Annotator
  function openAnnotator(index: number) {
    const dataUrl = screenshots[index]
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
      const keyHint = (k: string) => `<span style="opacity:.45;margin-left:5px;font-size:11px;">${k}</span>`
      toolbar.innerHTML = `
        <button data-tool="pen" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${icon('pencil', { size: 14 })} Pen</button>
        <button data-tool="rect" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${icon('square', { size: 14 })} Rect</button>
        <button data-tool="arrow" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">↗ Arrow</button>
        <button data-tool="text" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">T Text</button>
        <button data-color="#ef4444" style="background:#ef4444;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
        <button data-color="#f97316" style="background:#f97316;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
        <button data-color="#3b82f6" style="background:#3b82f6;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
        <button data-color="#111827" style="background:#111827;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;border:1px solid #555;"></button>
        <button id="klavity-undo" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;margin-left:auto;">↩ Undo</button>
        <button id="klavity-clear-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${icon('trash-2', { size: 14 })} Clear</button>
        <button id="klavity-save-ann" style="padding:6px 10px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-weight:700;">${icon('check', { label: 'Save', size: 14 })} Save</button>
        <button id="klavity-cancel-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${icon('x', { size: 14 })}</button>
      `
      canvas.style.cssText = 'flex:1;max-width:100%;max-height:calc(100vh - 60px);object-fit:contain;cursor:crosshair;display:block;margin:auto;'
      editor.append(toolbar, canvas)
      shadowRoot.appendChild(editor)

      let activeTool = 'rect'
      let activeColor = '#ef4444'
      let drawing = false
      let penPoints: Array<{ x: number; y: number }> = []
      let startX = 0
      let startY = 0

      // Reflect the active tool on the toolbar so keyboard switching (and clicks) have visual feedback.
      function selectTool(tool: string) {
        activeTool = tool
        toolbar.querySelectorAll<HTMLElement>('[data-tool]').forEach(el => {
          const on = el.dataset.tool === tool
          el.style.background = on ? '#585b70' : '#313244'
          el.style.outline = on ? '2px solid #89b4fa' : 'none'
        })
      }
      toolbar.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => selectTool((b as HTMLElement).dataset.tool!)))
      toolbar.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { activeColor = (b as HTMLElement).dataset.color! }))
      toolbar.querySelector('#klavity-undo')!.addEventListener('click', () => annotator.undo())
      toolbar.querySelector('#klavity-clear-ann')!.addEventListener('click', () => annotator.clearAll())

      // Single keydown handler for the editor lifetime: tool shortcuts + undo + Esc-to-cancel.
      // Skipped while typing into the text-annotation input so letters land as text, not tool switches.
      const TOOL_KEYS: Record<string, string> = { p: 'pen', r: 'rect', c: 'circle', a: 'arrow', t: 'text' }
      function onKeyDown(e: KeyboardEvent) {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        if (e.key === 'Escape') { e.stopPropagation(); close(); return }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); annotator.undo(); return }
        if (e.metaKey || e.ctrlKey || e.altKey) return
        const k = e.key.toLowerCase()
        if (TOOL_KEYS[k]) { e.preventDefault(); selectTool(TOOL_KEYS[k]) }
        else if (k === 'u') { e.preventDefault(); annotator.undo() }
      }
      function close() {
        document.removeEventListener('keydown', onKeyDown, { capture: true })
        editor.remove()
      }
      document.addEventListener('keydown', onKeyDown, { capture: true })
      selectTool(activeTool)

      toolbar.querySelector('#klavity-save-ann')!.addEventListener('click', async () => {
        screenshots[index] = await annotator.save()
        close()
        updateStrip()
      })
      toolbar.querySelector('#klavity-cancel-ann')!.addEventListener('click', () => close())

      function toImg(e: PointerEvent) {
        const r = canvas.getBoundingClientRect()
        return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height }
      }

      canvas.addEventListener('pointerdown', (e) => {
        drawing = true
        const pt = toImg(e);
        ({ x: startX, y: startY } = pt)
        if (activeTool === 'pen') penPoints = [pt]
        if (activeTool === 'text') {
          drawing = false
          const input = document.createElement('input')
          input.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:transparent;border:1px dashed ${activeColor};color:${activeColor};font-size:16px;outline:none;z-index:9999999;min-width:80px;`
          document.body.appendChild(input)
          input.focus()
          input.addEventListener('blur', () => {
            if (input.value.trim()) annotator.addShape({ type: 'text', color: activeColor, x: startX, y: startY, text: input.value.trim() })
            input.remove()
          }, { once: true })
          input.addEventListener('keydown', (ke) => { if (ke.key === 'Enter') input.blur() })
        }
      })

      canvas.addEventListener('pointermove', (e) => {
        if (!drawing) return
        if (activeTool === 'pen') penPoints.push(toImg(e))
      })

      canvas.addEventListener('pointerup', (e) => {
        if (!drawing) return
        drawing = false
        const pt = toImg(e)
        if (activeTool === 'pen' && penPoints.length > 1) {
          annotator.addShape({ type: 'pen', color: activeColor, points: penPoints })
        } else if (activeTool === 'rect') {
          annotator.addShape({ type: 'rect', color: activeColor, x: Math.min(startX, pt.x), y: Math.min(startY, pt.y), w: Math.abs(pt.x - startX), h: Math.abs(pt.y - startY) })
        } else if (activeTool === 'circle') {
          annotator.addShape({ type: 'circle', color: activeColor, x: (startX + pt.x) / 2, y: (startY + pt.y) / 2, rx: Math.abs(pt.x - startX) / 2, ry: Math.abs(pt.y - startY) / 2 })
        } else if (activeTool === 'arrow') {
          annotator.addShape({ type: 'arrow', color: activeColor, x1: startX, y1: startY, x2: pt.x, y2: pt.y })
        }
      })
    }
    img.src = dataUrl
  }

  // Mode-aware success screen: swap the modal body in-place (keeps the themed modal element + its
  // Genie animation + injected --kl-* vars) for headline/body, optional email-lead capture, optional
  // CTA, and an always-on "Powered by Klavity" footer. Dynamic data (feedbackId, email) is never
  // injected via innerHTML — only static copy uses innerHTML — matching this file's XSS guards.
  function renderSuccess(feedbackId: string, success: NonNullable<ModalCallbacks['success']>) {
    const { copy, onLead } = success
    modal.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.className = 'klavity-success'

    const h = document.createElement('h2')
    // copy.headline is static host-supplied copy (not user/LLM data) and may contain icon SVG HTML.
    h.innerHTML = copy.headline
    wrap.appendChild(h)

    if (copy.body) {
      const p = document.createElement('p')
      p.textContent = copy.body
      wrap.appendChild(p)
    }

    if (copy.showEmail) {
      const row = document.createElement('div')
      row.className = 'klavity-lead'
      const input = document.createElement('input')
      input.type = 'email'
      input.placeholder = 'you@company.com'
      const btn = document.createElement('button')
      btn.textContent = copy.emailLabel
      const submitLead = async () => {
        const email = input.value.trim()
        if (!email) return
        btn.disabled = true
        try { if (onLead) await onLead(feedbackId, email) } catch { /* swallow — confirm anyway */ }
        const thanks = document.createElement('div')
        thanks.className = 'klavity-thanks'
        thanks.textContent = "Thanks — we'll be in touch."
        row.replaceWith(thanks)
      }
      btn.addEventListener('click', submitLead)
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLead() })
      row.append(input, btn)
      wrap.appendChild(row)
    }

    if (copy.showCta && copy.ctaUrl) {
      const a = document.createElement('a')
      a.className = 'klavity-cta'
      a.href = copy.ctaUrl
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = copy.ctaText
      wrap.appendChild(a)
    }

    modal.appendChild(wrap)

    const pb = document.createElement('div')
    pb.className = 'klavity-pb'
    pb.innerHTML = `Powered by <a href="https://klavity.quantana.top" target="_blank" rel="noopener">Klavity</a>`
    modal.appendChild(pb)
  }

  if (callbacks.autoCaptureOnOpen) {
    setTimeout(() => { callbacks.onCaptureFull().then(addScreenshot).catch(() => {}) }, 200)
  }

  return controller
}

/**
 * Mounts a drag-to-select overlay on document.body.
 * Ported from packages/extension/src/content.ts:401-507 (startRegion).
 * Coords are CSS pixels — the host callback handles DPR scaling.
 *
 * @param onRect  Called with the selected {x,y,w,h} rect when the user finishes dragging.
 * @param onCancel Called when the user presses Esc (no rect provided; overlay already removed).
 */
function mountRegionOverlay(
  onRect: (rect: { x: number; y: number; w: number; h: number }) => void,
  onCancel: () => void,
): void {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;cursor:crosshair;z-index:2147483646;user-select:none;'
  overlay.setAttribute('data-klavity-region-overlay', '')
  document.body.appendChild(overlay)

  const hint = document.createElement('div')
  hint.textContent = 'Drag to select an area · Esc to cancel'
  hint.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-family:system-ui;font-size:14px;background:rgba(0,0,0,.7);padding:8px 16px;border-radius:6px;pointer-events:none;z-index:2147483647;'
  document.body.appendChild(hint)

  let startX = 0, startY = 0, active = false

  function cleanup() {
    document.removeEventListener('keydown', escHandler, { capture: true })
    overlay.remove()
    hint.remove()
  }

  function escHandler(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); cleanup(); onCancel() }
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
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${x + w}px 0/calc(100% - ${x + w}px) 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${x}px 0/${w}px ${y}px,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${x}px ${y + h}px/${w}px calc(100% - ${y + h}px)
    `
    overlay.style.backgroundRepeat = 'no-repeat'
  })

  overlay.addEventListener('pointerup', (e) => {
    if (!active) return
    active = false
    const w = Math.abs(e.clientX - startX)
    const h = Math.abs(e.clientY - startY)
    if (w < 8 || h < 8) { cleanup(); onCancel(); return }

    const rect = { x: Math.min(e.clientX, startX), y: Math.min(e.clientY, startY), w, h }
    cleanup()
    onRect(rect)
  })
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
