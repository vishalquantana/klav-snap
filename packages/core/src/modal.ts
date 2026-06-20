import type { ReportType } from './types'
import { Annotator } from './annotator'
import { themeCss, resolveModalConfig, type ModalConfig } from './modal-theme'

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
  }) => Promise<{ issueKey: string; issueUrl: string }>
  // Mode-aware success screen. When provided, a successful submit swaps the modal body for this
  // screen (headline/body, optional email-lead capture, optional CTA) and DOES NOT auto-close —
  // the user must interact. When absent, falls back to the themed thankYou/✓ Filed auto-close card.
  // `copy` is static (built by the host from successCopy()); `onLead` POSTs the captured email,
  // referencing the returned feedback id (= issueKey).
  success?: {
    copy: SuccessCopy
    onLead?: (feedbackId: string, email: string) => Promise<void>
  }
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
    .klavity-thumb img{height:60px;border-radius:4px;border:1px solid var(--kl-border);}
    .klavity-rm{position:absolute;top:-4px;right:-4px;background:var(--kl-accent2);color:var(--kl-on-accent);border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;}
    .klavity-mk{position:absolute;bottom:-4px;right:-4px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;}
    .klavity-actions{display:flex;gap:8px;margin-bottom:12px;}
    .klavity-actions button{flex:1;padding:8px;background:var(--kl-chip);color:var(--kl-fg);border:none;border-radius:6px;cursor:pointer;font-size:12px;}
    .klavity-counter{font-size:11px;color:var(--kl-muted);margin-bottom:8px;}
    textarea.klavity-desc{width:100%;min-height:100px;resize:vertical;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:6px;padding:10px;font-size:14px;margin-bottom:16px;box-sizing:border-box;}
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
      <button class="bug ${initialType === 'bug' ? 'active' : ''}">🐛 Bug</button>
      <button class="feat ${initialType === 'feature' ? 'active' : ''}">💡 Feature</button>
    </div>
    <div class="klavity-page">📍 ${typeof window !== 'undefined' ? window.location.pathname : ''}</div>
    <div class="klavity-strip" id="klavity-strip"></div>
    <div class="klavity-actions">
      <button id="klavity-full">📷 Full Page</button>
      <button id="klavity-upload">🖼 Upload</button>
    </div>
    <input type="file" id="klavity-file" accept="image/*,.heic,.heif" multiple style="display:none">
    <div class="klavity-counter" id="klavity-counter">0/5 images</div>
    <div class="klavity-error" id="klavity-err"></div>
    <textarea class="klavity-desc" id="klavity-desc" placeholder="Describe the bug..."></textarea>
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
      const rm = document.createElement('button')
      rm.className = 'klavity-rm'
      rm.textContent = '×'
      rm.addEventListener('click', () => { screenshots.splice(i, 1); updateStrip() })
      const mk = document.createElement('button')
      mk.className = 'klavity-mk'
      mk.textContent = '✏'
      mk.addEventListener('click', () => openAnnotator(i))
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
  desc.addEventListener('input', () => { submitBtn.disabled = desc.value.trim() === '' })
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

  submitBtn.addEventListener('click', async () => {
    const description = desc.value.trim()
    submitBtn.disabled = true
    submitBtn.textContent = 'Filing...'
    const errEl = shadowRoot.getElementById('klavity-err')!
    errEl.style.display = 'none'
    try {
      const result = await callbacks.onSubmit({ type: currentType, description, screenshots: [...screenshots] })
      if (callbacks.success) {
        // Mode-aware lead/CTA screen rendered THROUGH the existing themed modal — no auto-close;
        // the user must interact (submit email or click the CTA, or dismiss via overlay/esc).
        renderSuccess(result.issueKey, callbacks.success)
      } else {
        // Their themed auto-close card: custom thank-you (2600ms) or "✓ Filed as KEY" (1500ms).
        const wrap = document.createElement('div')
        wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;'
        const card = document.createElement('div')
        card.style.cssText = 'background:var(--kl-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:var(--kl-radius);padding:32px;font-family:var(--kl-font,system-ui),sans-serif;font-size:16px;text-align:center;box-shadow:var(--kl-shadow);'
        card.textContent = cfg.thankYou ? cfg.thankYou : `✓ Filed as ${result.issueKey}`
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
        <button id="klavity-clear-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">🗑 Clear</button>
        <button id="klavity-save-ann" style="padding:6px 10px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-weight:700;">✓ Save</button>
        <button id="klavity-cancel-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">✕</button>
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

      toolbar.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { activeTool = (b as HTMLElement).dataset.tool! }))
      toolbar.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { activeColor = (b as HTMLElement).dataset.color! }))
      toolbar.querySelector('#klavity-undo')!.addEventListener('click', () => annotator.undo())
      toolbar.querySelector('#klavity-clear-ann')!.addEventListener('click', () => annotator.clearAll())
      toolbar.querySelector('#klavity-save-ann')!.addEventListener('click', async () => {
        screenshots[index] = await annotator.save()
        editor.remove()
        updateStrip()
      })
      toolbar.querySelector('#klavity-cancel-ann')!.addEventListener('click', () => editor.remove())

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
        } else if (activeTool === 'arrow') {
          annotator.addShape({ type: 'arrow', color: activeColor, x1: startX, y1: startY, x2: pt.x, y2: pt.y })
        }
      })

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); editor.remove() }
      }, { capture: true, once: true })
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
    h.textContent = copy.headline
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

  return controller
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
