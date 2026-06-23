import type { ReportType } from './types'
import { Annotator } from './annotator'
import { themeCss, resolveModalConfig, type ModalConfig } from './modal-theme'
import { icon } from './icons'

// Re-exported here so the widget + extension can import the shared right-click-drag region gesture from
// the same module they already use for buildModal (avoids adding a package.json export entry, which the
// orchestrator's version-stamp ownership could clobber).
export { installRegionDrag, type RegionDragHandle, type RegionDragOptions } from './region-drag'

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
  // Optional "sharp" real-pixel capture (the widget's getDisplayMedia scroll-stitch — captures cross-origin
  // images with no CORS issues). When provided, a "Sharp" button is rendered; the modal hides itself during
  // the capture so the composer isn't in the shot. Feature-detected by the host (absent on iOS Safari →
  // button hidden → users fall back to the html-to-image "Full Page").
  onCaptureSharp?: () => Promise<string>
  onSubmit: (payload: {
    type: ReportType
    description: string
    screenshots: string[]
    annotations?: any
    // The email typed into the REQUIRED-email gate (requireEmail). The host must forward it to the
    // backend as reporter_email, otherwise an "email"-gated project rejects the submit with 400
    // "A valid email is required to submit." Undefined when no email field was shown.
    reporterEmail?: string
  }) => Promise<{ issueKey: string; issueUrl: string }>
  // Optional image pre-processor called immediately when a screenshot is added (e.g. PNG→JPEG
  // compression). By submit time the promise is already resolved, so the upload starts with zero
  // compression delay. The host passes compressScreenshot here; the extension omits it (its SW
  // handles compression separately).
  compressImage?: (dataUrl: string) => Promise<string>
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
  // Parallel array: each entry is the resolved (compressed) version of screenshots[i].
  // Pre-compression is kicked off immediately when a screenshot is added, so by the time the user
  // clicks Submit the Promise is already settled and the upload can start without delay.
  let screenshotCompressed: Promise<string>[] = []
  // Upload guards (Dev 6 audit #4): cap how many images can be attached and how big each may be.
  const MAX_IMAGES = 5
  const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB per image
  // Structured markup per screenshot index { w, h, shapes } so the ticket can re-render a
  // toggleable/zoomable overlay instead of baking the drawing into the uploaded image.
  const annotationsByIndex: Record<number, any> = {}
  let currentType = initialType

  const style = document.createElement('style')
  style.textContent = `
    ${themeCss(cfg)}
    @keyframes kl-genie-in{from{opacity:0;transform:translateY(180px) scaleX(.04) scaleY(.06)}to{opacity:1;transform:translateY(0) scaleX(1) scaleY(1)}}
    @keyframes kl-genie-out{from{opacity:1;transform:translateY(0) scaleX(1) scaleY(1)}to{opacity:0;transform:translateY(180px) scaleX(.04) scaleY(.06)}}
    @keyframes kl-ov{from{opacity:0}to{opacity:1}}
    .klavity-overlay{position:fixed;inset:0;background:var(--kl-overlay);display:flex;align-items:center;justify-content:center;pointer-events:all;animation:kl-ov .3s ease both;}
    .klavity-modal{position:relative;overflow:hidden;isolation:isolate;background:var(--kl-glow,transparent),var(--kl-bg);color:var(--kl-fg);border-radius:var(--kl-radius);padding:24px;width:100%;max-width:480px;box-shadow:0 0 0 1px var(--kl-border),var(--kl-shadow);font-family:var(--kl-font,system-ui,sans-serif);-webkit-font-smoothing:antialiased;-webkit-backdrop-filter:var(--kl-backdrop);backdrop-filter:var(--kl-backdrop);transform-origin:bottom center;animation:kl-genie-in .6s cubic-bezier(.16,1,.3,1) both;}
    .klavity-modal::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(to right,color-mix(in srgb,var(--kl-border) 58%,transparent) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(to bottom,color-mix(in srgb,var(--kl-border) 58%,transparent) 1px,transparent 1px) 0 0/44px 44px;opacity:.36;}
    .klavity-modal>*{position:relative;z-index:1;}
    /* Staggered content reveal — the genie scales the panel in while its rows softly rise + fade so it feels
       alive (not a flat box). Subtle; zeroed under prefers-reduced-motion below. */
    @keyframes kl-rise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
    .klavity-modal>.klavity-toggle,.klavity-modal>.klavity-page,.klavity-modal>.klavity-strip,.klavity-modal>.klavity-actions,.klavity-modal>textarea.klavity-desc,.klavity-modal>input.klavity-remail,.klavity-modal>.klavity-submit{animation:kl-rise .5s cubic-bezier(.16,1,.3,1) both;}
    .klavity-modal>.klavity-toggle{animation-delay:.05s}.klavity-modal>.klavity-page{animation-delay:.09s}.klavity-modal>.klavity-strip{animation-delay:.12s}.klavity-modal>.klavity-actions{animation-delay:.15s}.klavity-modal>textarea.klavity-desc{animation-delay:.18s}.klavity-modal>input.klavity-remail{animation-delay:.21s}.klavity-modal>.klavity-submit{animation-delay:.23s}
    .klavity-modal.kl-closing{animation:kl-genie-out .5s cubic-bezier(.55,0,.85,.25) both;}
    .klavity-toggle{display:flex;gap:8px;margin-bottom:16px;padding-right:34px;}
    .klavity-toggle button{flex:1;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;background:var(--kl-chip);color:var(--kl-fg);}
    .klavity-toggle .bug.active{background:var(--kl-accent);color:var(--kl-on-accent);}
    .klavity-toggle .feat.active{background:var(--kl-accent);color:var(--kl-on-accent);}
    .klavity-page{font-size:12px;color:var(--kl-muted);margin-bottom:12px;}
    /* overflow-x:auto forces overflow-y to auto (not visible) per CSS spec — adding vertical padding gives
       the absolutely-positioned rm/mk badge ::after hit-area extensions room so they're not clipped. */
    .klavity-strip{display:flex;gap:8px;overflow-x:auto;padding:6px 0;margin-bottom:6px;min-height:64px;align-items:flex-start;}
    .klavity-thumb{position:relative;flex-shrink:0;}
    .klavity-thumb img{height:72px;width:104px;object-fit:cover;object-position:top center;background:var(--kl-chip);display:block;border-radius:8px;outline:1px solid var(--kl-img-outline);outline-offset:-1px;cursor:pointer;transition:filter .12s;}
    .klavity-thumb img:hover{filter:brightness(.85);}
    /* Portrait (tall) screenshots: widen the thumbnail vertically so more page content is visible. */
    .klavity-thumb.kl-tall img{width:68px;height:110px;}
    /* Remove badge: dark semi-transparent circle — universally visible on all themes/backgrounds. */
    .klavity-rm{position:absolute;top:4px;right:4px;z-index:2;background:rgba(0,0,0,.65);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35);}
    .klavity-mk{position:absolute;bottom:4px;right:4px;z-index:2;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:50%;width:22px;height:22px;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35);}
    /* Extend the 22px badges to a ≥40px hit area without enlarging the visible button. The top (X) and
       bottom (pencil) pseudo-areas don't overlap each other; the pencil shares the image's markup action. */
    .klavity-rm::after,.klavity-mk::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;}
    .klavity-actions{display:flex;gap:8px;margin-bottom:12px;}
    .klavity-actions button{flex:1;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:var(--kl-chip);color:var(--kl-fg);border:none;border-radius:8px;cursor:pointer;font-size:12px;}
    /* Optical icon alignment + micro-animation for icon+label buttons (capture row + Bug/Feature toggle): a
       fixed-size, block-rendered icon flex-centered with its label (no baseline drift / stray whitespace),
       with a springy scale+tilt on hover — same feel as the right-click menu's icon chips. */
    .klavity-actions .kl-cap-ic,.klavity-toggle .kl-cap-ic{display:inline-flex;align-items:center;flex:none;transition:transform .2s cubic-bezier(.34,1.56,.64,1);}
    .klavity-actions .kl-cap-ic svg,.klavity-toggle .kl-cap-ic svg{display:block;width:15px;height:15px;}
    .klavity-actions button:hover .kl-cap-ic,.klavity-toggle button:hover .kl-cap-ic{transform:scale(1.14) rotate(-6deg);}
    .klavity-actions button:active .kl-cap-ic,.klavity-toggle button:active .kl-cap-ic{transform:scale(1.04);}
    /* Re-entrancy state: while a capture/submit is in flight every capture button is disabled (dimmed, no
       hover/press), and the one doing the work pulses to read as "working". */
    .klavity-actions button:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none;}
    .klavity-actions button:disabled .kl-cap-ic{transform:none;}
    .klavity-actions button.kl-loading{opacity:.9;animation:kl-cap-pulse 1s ease-in-out infinite;}
    @keyframes kl-cap-pulse{0%,100%{opacity:.55}50%{opacity:.95}}
    .klavity-counter{font-size:11px;color:var(--kl-muted);margin-bottom:8px;font-variant-numeric:tabular-nums;}
    textarea.klavity-desc{width:100%;min-height:100px;resize:vertical;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:8px;padding:10px;font-size:14px;margin-bottom:16px;box-sizing:border-box;box-shadow:0 1px 2px rgba(25,20,15,.04);}
    input.klavity-remail{width:100%;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:8px;padding:10px;font-size:14px;margin-bottom:10px;box-sizing:border-box;box-shadow:0 1px 2px rgba(25,20,15,.04);}
    .klavity-submit{width:100%;min-height:40px;padding:12px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;}
    .klavity-submit:disabled{opacity:.5;cursor:not-allowed;}
    /* Upload progress under Submit — collapsed until a submit is in flight; the fill is animated toward 90%
       over ~10s and snapped to 100% when the request resolves (fetch can't report real upload %). */
    .klavity-progress{height:5px;border-radius:999px;background:var(--kl-chip);overflow:hidden;opacity:0;max-height:0;margin-top:0;transition:opacity .2s ease,max-height .2s ease,margin-top .2s ease;}
    .klavity-progress.show{opacity:1;max-height:5px;margin-top:10px;}
    .klavity-progress-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--kl-accent) 65%,#fff),var(--kl-accent));}
    .klavity-error{color:#f38ba8;font-size:13px;margin-bottom:8px;display:none;}
    .klavity-success h2{margin:0 0 8px;font-size:20px;color:var(--kl-fg);display:flex;align-items:center;gap:8px;line-height:1.2;}
    .klavity-success p{margin:0 0 16px;font-size:14px;color:var(--kl-muted);line-height:1.4;}
    .klavity-success>h2{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .05s both;}.klavity-success>p{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .12s both;}.klavity-lead,.klavity-thanks{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .18s both;}.klavity-success>.klavity-cta{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .24s both;}
    .klavity-lead{display:flex;gap:8px;margin-bottom:12px;}
    .klavity-lead input{flex:1;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:8px;padding:9px 10px;font-size:14px;box-sizing:border-box;}
    .klavity-lead input:focus{outline:none;border-color:var(--kl-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--kl-accent) 20%,transparent);}
    .klavity-lead button{min-height:40px;padding:9px 14px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px color-mix(in srgb,var(--kl-accent) 30%,transparent);}
    .klavity-lead button:disabled{opacity:.5;cursor:not-allowed;}
    .klavity-thanks{font-size:13px;color:var(--kl-fg);margin-bottom:12px;}
    .klavity-cta{display:inline-block;padding:10px 16px;background:linear-gradient(135deg,var(--kl-accent),color-mix(in srgb,var(--kl-accent) 70%,#8b5cf6));color:var(--kl-on-accent);border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:12px;box-shadow:0 4px 14px color-mix(in srgb,var(--kl-accent) 35%,transparent);}
    .klavity-pb{text-align:center;font-size:10px;color:var(--kl-muted);margin-top:12px;}
    .klavity-pb a{color:var(--kl-muted);text-decoration:none;transition:color .15s ease;}
    .klavity-pb a:hover{color:var(--kl-accent);}
    /* ── Button micro-interactions — subtle hover lift/scale + press, Klavity-accent on hover, focus
       rings. Same feel as the right-click menu + dashboard buttons. Transform amounts are CSS vars so
       prefers-reduced-motion can zero them (below). color-mix degrades gracefully if unsupported. ── */
    .klavity-modal{--kl-lift:translateY(-1px) scale(1.02);--kl-press:scale(.97);--kl-bhover:scale(1.12);--kl-bpress:scale(.97);}
    .klavity-toggle button,.klavity-actions button,.klavity-submit,.klavity-lead button,.klavity-cta,textarea.klavity-desc,input.klavity-remail,.klavity-lead input{transition:transform .15s cubic-bezier(.2,.7,.2,1),background .15s ease,border-color .15s ease,box-shadow .15s ease,color .15s ease,filter .15s ease;will-change:transform;}
    .klavity-rm,.klavity-mk{transition:transform .15s cubic-bezier(.2,.7,.2,1),box-shadow .15s ease;will-change:transform;}
    textarea.klavity-desc:hover,input.klavity-remail:hover,.klavity-lead input:hover{transform:var(--kl-lift);border-color:var(--kl-accent);box-shadow:0 7px 18px color-mix(in srgb,var(--kl-accent) 16%,transparent),0 0 0 1px color-mix(in srgb,var(--kl-accent) 14%,transparent);}
    textarea.klavity-desc:focus,input.klavity-remail:focus,.klavity-lead input:focus{outline:none;border-color:var(--kl-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--kl-accent) 20%,transparent),0 8px 20px color-mix(in srgb,var(--kl-accent) 14%,transparent);}
    /* Bug/Feature toggle — lift + soft accent glow (keeps the active chip's highlight intact) */
    .klavity-toggle button:hover{transform:var(--kl-lift);box-shadow:0 4px 12px color-mix(in srgb,var(--kl-accent) 20%,transparent);}
    .klavity-toggle button:active{transform:var(--kl-press);}
    /* Full Page / Upload / Region — lift + accent tint + accent text */
    .klavity-actions button:hover{transform:var(--kl-lift);color:var(--kl-accent);background:color-mix(in srgb,var(--kl-chip) 80%,var(--kl-accent) 20%);box-shadow:0 5px 14px color-mix(in srgb,var(--kl-accent) 22%,transparent);}
    .klavity-actions button:active{transform:var(--kl-press);}
    /* Submit + lead submit + CTA (accent buttons) — lift + brighten + accent-tinted glow */
    .klavity-submit:hover:not(:disabled),.klavity-lead button:hover:not(:disabled),.klavity-cta:hover{transform:var(--kl-lift);filter:brightness(1.05);background:linear-gradient(135deg,var(--kl-accent),color-mix(in srgb,var(--kl-accent) 70%,#8b5cf6));box-shadow:0 8px 22px color-mix(in srgb,var(--kl-accent) 45%,transparent);}
    .klavity-submit:active:not(:disabled),.klavity-lead button:active:not(:disabled),.klavity-cta:active{transform:var(--kl-press);}
    /* Thumbnail action badges (X remove, pencil edit) — pop on hover, press in */
    .klavity-rm:hover,.klavity-mk:hover{transform:var(--kl-bhover);box-shadow:0 3px 9px rgba(0,0,0,.42);}
    .klavity-rm:active,.klavity-mk:active{transform:var(--kl-bpress);}
    /* Close (×) — top-right corner; same lift+accent / press / focus feel as the rest. 30px visible button
       with a ::after pseudo extending the hit area to ≥40×40 (sits in the reserved toggle padding, so it
       never overlaps the Bug/Feature buttons). */
    .klavity-x{position:absolute;top:14px;right:14px;z-index:3;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;padding:0;background:transparent;color:var(--kl-muted);border:none;border-radius:9px;cursor:pointer;transition:transform .15s cubic-bezier(.34,1.56,.64,1),background .15s ease,color .15s ease;will-change:transform;}
    .klavity-x svg{display:block;}
    .klavity-x::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;}
    .klavity-x:hover{transform:var(--kl-lift);color:var(--kl-accent);background:color-mix(in srgb,var(--kl-accent) 14%,transparent);}
    .klavity-x:active{transform:var(--kl-press);}
    /* Keyboard accessibility — visible focus ring on every control */
    .klavity-toggle button:focus-visible,.klavity-actions button:focus-visible,.klavity-submit:focus-visible,.klavity-lead button:focus-visible,.klavity-cta:focus-visible,.klavity-rm:focus-visible,.klavity-mk:focus-visible,.klavity-x:focus-visible{outline:2px solid var(--kl-accent);outline-offset:2px;}
    /* ── Sharp (i) info: the ⓘ is an INLINE element inside the Screen button, not a separate affordance.
       It sits right after the "Screen" label so Screen+ⓘ read as a single unified control (KLA-15,
       KLA-26). Clicks on ⓘ stopPropagation so they never trigger the one-click capture. The
       floating tooltip (.kl-float-tip) is positioned via JS and lives outside the overflow:hidden
       modal so it is never clipped. ── */
    #klavity-sharp{flex:1.4;}
    .klavity-info-wrap{display:inline-flex;align-items:center;margin-left:4px;flex:none;}
    .klavity-info{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--kl-muted);cursor:help;opacity:.7;transition:color .15s ease,background .15s ease,opacity .15s ease;}
    .klavity-info-wrap:hover .klavity-info{color:var(--kl-accent);background:color-mix(in srgb,var(--kl-accent) 14%,transparent);opacity:1;}
    /* .klavity-info-pop is kept in markup for its text; visibility is JS-driven via .kl-float-tip so
       the tooltip is rendered outside the overflow:hidden modal and is never clipped. */
    .klavity-info-pop{display:none;}
    /* Floating tooltip — appended to the shadow root (sibling of overlay), position:fixed to viewport so
       overflow:hidden on .klavity-modal cannot clip it. JS positions it with edge-detection. */
    .kl-float-tip{position:fixed;width:228px;max-width:calc(100vw - 16px);padding:10px 12px;border-radius:10px;background:var(--kl-bg);color:var(--kl-fg);box-shadow:0 0 0 1px var(--kl-border),0 12px 30px rgba(20,16,40,.22);font-size:12px;line-height:1.45;text-align:left;text-wrap:pretty;z-index:2147483647;pointer-events:none;visibility:hidden;opacity:0;transition:opacity .15s ease;}
    .kl-float-tip.kl-show{visibility:visible;opacity:1;}
    .kl-float-tip b{color:var(--kl-fg);font-weight:600;}
    @media (max-width:430px){.klavity-lead{flex-direction:column}.klavity-lead button{width:100%;}}
    @media (prefers-reduced-motion: reduce){.klavity-overlay,.klavity-modal,.klavity-modal.kl-closing,.klavity-modal>*{animation-duration:.01ms!important;}.klavity-modal{--kl-lift:none;--kl-press:none;--kl-bhover:none;--kl-bpress:none;}.klavity-info{transition:none;}.klavity-actions button.kl-loading{animation:none;}.klavity-actions .kl-cap-ic,.klavity-toggle .kl-cap-ic{transition:none;transform:none!important;}}
  `
  shadowRoot.appendChild(style)

  const overlay = document.createElement('div')
  overlay.className = 'klavity-overlay'

  const modal = document.createElement('div')
  modal.className = 'klavity-modal'
  modal.innerHTML = `
    <button class="klavity-x" id="klavity-x" type="button" aria-label="Close" title="Close (Esc)">${icon('x', { size: 16 })}</button>
    <div class="klavity-toggle">
      <button class="bug ${initialType === 'bug' ? 'active' : ''}"><span class="kl-cap-ic">${icon('bug')}</span>Bug</button>
      <button class="feat ${initialType === 'feature' ? 'active' : ''}"><span class="kl-cap-ic">${icon('lightbulb')}</span>Feature</button>
    </div>
    <div class="klavity-page">${icon('map-pin')} ${typeof window !== 'undefined' ? escHtml(window.location.pathname) : ''}</div>
    <div class="klavity-strip" id="klavity-strip"></div>
    <div class="klavity-actions">
      ${callbacks.onCaptureSharp ? `<button id="klavity-sharp" title="Screen — pixel-perfect full page, every image. Shares this tab (asks permission)."><span class="kl-cap-ic">${icon('monitor')}</span><span class="kl-sharp-label">Screen</span><span class="klavity-info-wrap"><span id="klavity-sharp-info" class="klavity-info" role="button" tabindex="0" title="What does Screen do?" aria-label="What does Screen do?"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;pointer-events:none"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><span class="klavity-info-pop" role="tooltip">Screen grabs the <b>whole page — every image, pixel-perfect</b> using your browser's screen-share. Your browser will ask you to <b>share this tab</b>.</span></span></button>` : ''}
      <button id="klavity-full" title="Full Page — instant capture; may miss some cross-origin images"><span class="kl-cap-ic">${icon('camera')}</span>Full Page</button>
      <button id="klavity-upload"><span class="kl-cap-ic">${icon('image')}</span>Upload</button>
      ${callbacks.onRegionCapture ? `<button id="klavity-region"><span class="kl-cap-ic">${icon('scissors')}</span>Region</button>` : ''}
    </div>
    <input type="file" id="klavity-file" accept="image/*,.heic,.heif" multiple style="display:none">
    <div class="klavity-counter" id="klavity-counter">0/5 images</div>
    <div class="klavity-error" id="klavity-err"></div>
    <textarea class="klavity-desc" id="klavity-desc" placeholder="Describe the bug..."></textarea>
    ${callbacks.requireEmail ? '<input type="email" class="klavity-remail" id="klavity-remail" placeholder="your@email.com" autocomplete="email">' : ''}
    <button class="klavity-submit" id="klavity-submit" disabled>Submit</button>
    <div class="klavity-progress" id="klavity-progress" role="progressbar" aria-label="Uploading report"><div class="klavity-progress-fill" id="klavity-progress-fill"></div></div>
  `

  overlay.appendChild(modal)
  shadowRoot.appendChild(overlay)

  // ── Floating info tooltip — lives outside the modal so overflow:hidden never clips it. ──
  // .klavity-info-pop in the markup is the text source; we copy its innerHTML into a shadow-root-level
  // div with position:fixed, then position it via getBoundingClientRect with full edge-detection.
  // This sidesteps the overflow:hidden + transform containing-block problem on .klavity-modal.
  const infoWrap = shadowRoot.querySelector('.klavity-info-wrap')
  const infoPopSource = shadowRoot.querySelector('.klavity-info-pop')
  if (infoWrap && infoPopSource) {
    const ft = document.createElement('div')
    ft.className = 'kl-float-tip'
    ft.setAttribute('role', 'tooltip')
    ft.innerHTML = infoPopSource.innerHTML
    shadowRoot.appendChild(ft)
    const showTip = () => {
      const r = infoWrap.getBoundingClientRect()
      const TIP_W = Math.min(228, window.innerWidth - 16)
      const PAD = 8
      const vw = window.innerWidth, vh = window.innerHeight
      // Horizontal: right-align with the info wrap's right edge; clamp so neither side clips.
      const left = Math.max(PAD, Math.min(r.right - TIP_W, vw - TIP_W - PAD))
      ft.style.left = left + 'px'
      ft.style.top = '-9999px'     // off-screen to measure height before final placement
      ft.style.visibility = 'hidden'
      ft.style.display = 'block'
      const tipH = ft.offsetHeight
      ft.style.display = ''
      ft.style.visibility = ''
      // Vertical: prefer above; flip below if there's not enough room above.
      const spaceAbove = r.top - PAD
      let top = r.top - tipH - 10
      if (top < PAD || spaceAbove < tipH) top = r.bottom + 10
      top = Math.max(PAD, Math.min(top, vh - tipH - PAD))
      ft.style.top = top + 'px'
      ft.classList.add('kl-show')
    }
    const hideTip = () => ft.classList.remove('kl-show')
    infoWrap.addEventListener('mouseenter', showTip)
    infoWrap.addEventListener('mouseleave', hideTip)
    infoWrap.addEventListener('focusin', showTip)
    infoWrap.addEventListener('focusout', hideTip)
    // Also show when the whole Sharp button gets keyboard focus (mirrors the old CSS rule)
    const sharpBtn = shadowRoot.getElementById('klavity-sharp')
    if (sharpBtn) {
      sharpBtn.addEventListener('focus', showTip)
      sharpBtn.addEventListener('blur', hideTip)
    }
  }

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
      // Portrait screenshot: add kl-tall so the thumbnail shows more vertical content.
      img.addEventListener('load', () => {
        if (img.naturalHeight > img.naturalWidth * 1.4) wrap.classList.add('kl-tall')
      }, { once: true })
      // Click the thumbnail itself to open the full-screen markup editor (not just the pencil icon)
      img.addEventListener('click', () => openAnnotator(i))
      const rm = document.createElement('button')
      rm.className = 'klavity-rm'
      rm.innerHTML = icon('x', { size: 13 })
      rm.title = 'Remove'
      rm.addEventListener('click', (e) => { e.stopPropagation(); screenshots.splice(i, 1); screenshotCompressed.splice(i, 1); updateStrip() })
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

  // Surface a problem in the shared error line (used for upload + submit failures alike).
  function showError(msg: string) {
    const errEl = shadowRoot.getElementById('klavity-err')
    if (errEl) { errEl.textContent = msg; (errEl as HTMLElement).style.display = 'block' }
  }
  function clearError() {
    const errEl = shadowRoot.getElementById('klavity-err')
    if (errEl) (errEl as HTMLElement).style.display = 'none'
  }

  function addScreenshot(dataUrl: string) {
    // Hard cap — every capture/upload/paste path funnels through here, so the limit holds everywhere.
    if (screenshots.length >= MAX_IMAGES) { showError(`You can attach up to ${MAX_IMAGES} images.`); return }
    clearError()
    screenshots.push(dataUrl)
    // Kick off compression immediately — by submit time the Promise is settled (user was typing).
    screenshotCompressed.push(callbacks.compressImage ? callbacks.compressImage(dataUrl) : Promise.resolve(dataUrl))
    updateStrip()
  }

  // Image-only validation. Most browsers set file.type to an image/* MIME; HEIC/HEIF (and the odd browser
  // that reports an empty type) are matched by extension as a fallback.
  function isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(heic|heif|png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(file.name)
  }

  // Shared ingestion for the file picker AND clipboard paste: enforce cap + type + size, convert, and
  // surface a clear message on any reject/failure rather than silently dropping or leaving the UI stuck.
  async function ingestFiles(files: File[]) {
    clearError()
    for (const file of files) {
      if (screenshots.length >= MAX_IMAGES) { showError(`You can attach up to ${MAX_IMAGES} images.`); break }
      if (!isImageFile(file)) { showError(`"${file.name}" isn't an image — only image files can be attached.`); continue }
      if (file.size > MAX_FILE_BYTES) { showError(`"${file.name}" is too large — images must be under ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`); continue }
      try {
        addScreenshot(await fileToDataUrl(file))
      } catch {
        showError(`Couldn't add "${file.name}". Please try a different image.`)
      }
    }
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
    const imgs = Array.from(e.clipboardData.items)
      .filter(it => it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter((f): f is File => !!f)
    if (imgs.length) void ingestFiles(imgs)
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
  modal.querySelector('#klavity-x')?.addEventListener('click', () => close())

  // Re-entrancy guard (Dev 6 audit #3): block double-click / cross-firing while a capture OR submit is in
  // flight. `lockComposer(true)` disables every capture button (Sharp/Full Page/Upload/Region) and Submit;
  // releasing restores Submit to its validity state. Each action also early-returns when `busy` so a
  // queued double-click can't slip through before the disabled attribute paints.
  const captureBtnEls = () => Array.from(modal.querySelectorAll('.klavity-actions button')) as HTMLButtonElement[]
  let busy = false
  const lockComposer = (on: boolean) => {
    busy = on
    captureBtnEls().forEach(b => { b.disabled = on })
    if (on) submitBtn.disabled = true
    else refreshSubmit()
  }

  submitBtn.addEventListener('click', async () => {
    if (busy || submitBtn.disabled) return // re-entrancy: ignore double-clicks / clicks while a capture runs
    const description = desc.value.trim()
    lockComposer(true) // disable Submit + every capture button for the duration of the upload
    submitBtn.textContent = 'Uploading…'
    const errEl = shadowRoot.getElementById('klavity-err')!
    errEl.style.display = 'none'
    // Upload progress: fetch can't report real upload %, so animate an estimated bar toward 90% over ~10s
    // and snap to 100% only when the request resolves — it never falsely reads complete early.
    const progress = shadowRoot.getElementById('klavity-progress') as HTMLElement | null
    const fill = shadowRoot.getElementById('klavity-progress-fill') as HTMLElement | null
    if (progress && fill) {
      progress.classList.add('show')
      fill.style.transition = 'none'; fill.style.width = '8%'
      void fill.offsetWidth // reflow so the next transition animates
      fill.style.transition = 'width 10s cubic-bezier(.05,.7,.2,1)'
      requestAnimationFrame(() => { fill.style.width = '90%' })
    }
    const finishProgress = () => { if (fill) { fill.style.transition = 'width .25s ease'; fill.style.width = '100%' } }
    const resetProgress = () => { if (progress && fill) { progress.classList.remove('show'); fill.style.transition = 'none'; fill.style.width = '0' } }
    try {
      // Await pre-compressed screenshots (kicked off at capture time). For a user who typed for a few
      // seconds, these Promises are already settled — zero wait. Falls back to the raw dataUrl when
      // compressImage is not provided (e.g. extension path).
      const finalScreenshots = await Promise.all(screenshotCompressed)
      const result = await callbacks.onSubmit({ type: currentType, description, screenshots: finalScreenshots, annotations: annotationsByIndex[0] ?? null, reporterEmail: remail?.value.trim() || undefined })
      finishProgress()
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
      // Upload failed — surface the error and re-open the composer (never leave it stuck/disabled).
      resetProgress()
      errEl.textContent = (err as Error).message
      errEl.style.display = 'block'
      submitBtn.textContent = 'Submit'
      lockComposer(false) // re-enable capture buttons + Submit (Submit only if still valid)
    }
  })

  // Capture buttons — each is guarded against double-click / re-entrancy via `busy`/lockComposer.
  const fullBtn = modal.querySelector('#klavity-full') as HTMLButtonElement
  fullBtn.addEventListener('click', async () => {
    if (busy) return
    lockComposer(true)
    fullBtn.classList.add('kl-loading')
    try { addScreenshot(await callbacks.onCaptureFull()) }
    catch { /* ignore */ }
    finally { fullBtn.classList.remove('kl-loading'); lockComposer(false) }
  })
  // Sharp capture (real-pixel getDisplayMedia scroll-stitch) — only when the host provides it.
  const sharpBtn = modal.querySelector('#klavity-sharp') as HTMLButtonElement | null
  if (sharpBtn && callbacks.onCaptureSharp) {
    // The "Sharp" word lives in its own span so the "Capturing…" state never clobbers the icon or the
    // embedded (i) (setting button.textContent would wipe both).
    const sharpLabel = sharpBtn.querySelector('.kl-sharp-label') as HTMLElement | null
    const runSharp = async () => {
      if (busy) return // re-entrancy: a capture/submit is already running
      lockComposer(true)
      // Hide the composer so it isn't in the captured pixels. onCaptureSharp calls getDisplayMedia as its
      // first step, so the click's user gesture (required by the permission prompt) is preserved.
      host.style.display = 'none'
      const target = sharpLabel ?? sharpBtn
      const orig = target.textContent
      target.textContent = 'Capturing…'
      try {
        const shot = await callbacks.onCaptureSharp!()
        if (shot) addScreenshot(shot)
      } catch { /* user cancelled the share prompt, or capture failed — just restore */ }
      finally { host.style.display = ''; target.textContent = orig; lockComposer(false) }
    }
    // ONE click → straight to the screen-share permission. getDisplayMedia runs synchronously inside the
    // handler (preserving the click's user gesture).
    sharpBtn.addEventListener('click', () => { void runSharp() })
    // The (i) info icon is a purely visual affordance inside the Sharp button (not a separate control).
    // Clicks on it must NOT bubble up to the button's click handler and trigger the capture.
    const infoEl = sharpBtn.querySelector('#klavity-sharp-info') as HTMLElement | null
    if (infoEl) {
      infoEl.addEventListener('click', e => e.stopPropagation())
    }
  }
  const fileInput = modal.querySelector('#klavity-file') as HTMLInputElement
  modal.querySelector('#klavity-upload')!.addEventListener('click', () => {
    if (busy || screenshots.length >= MAX_IMAGES) {
      if (screenshots.length >= MAX_IMAGES) showError(`You can attach up to ${MAX_IMAGES} images.`)
      return
    }
    fileInput.click()
  })
  fileInput.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement
    const files = input.files ? Array.from(input.files) : []
    input.value = '' // reset so re-selecting the SAME file fires change again (and clears stuck state)
    if (files.length) await ingestFiles(files) // ingestFiles enforces cap + type + size + failure handling
  })

  // Region capture button — only rendered when the host provides onRegionCapture
  const regionBtn = shadowRoot.getElementById('klavity-region') as HTMLButtonElement | null
  if (regionBtn && callbacks.onRegionCapture) {
    regionBtn.onclick = () => {
      if (busy) return // re-entrancy: a capture/submit is already running
      lockComposer(true)
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
          lockComposer(false)
        }
      }, () => {
        // Re-register the modal Esc handler now that the overlay is gone (cancel/Esc path).
        document.addEventListener('keydown', escHandler, { capture: true })
        // Esc/cancel — re-show the host without calling onRegionCapture
        host.style.display = ''
        lockComposer(false)
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
      toolbar.className = 'kl-edtb'
      toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;background:#1e1e2e;flex-wrap:wrap;'
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
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;">
          <button id="klavity-zoom-out" class="kl-zb" title="Zoom out" aria-label="Zoom out">−</button>
          <span id="klavity-zoom-pct" style="min-width:46px;text-align:center;color:#a6adc8;font-size:12px;font-variant-numeric:tabular-nums;">100%</span>
          <button id="klavity-zoom-in" class="kl-zb" title="Zoom in" aria-label="Zoom in">+</button>
          <button id="klavity-fit-width" class="kl-zb" title="Fit to width (best for tall pages)" style="font-size:11.5px;">Fit&nbsp;W</button>
          <button id="klavity-fit-page" class="kl-zb" title="Fit the whole page" style="font-size:11.5px;">Fit&nbsp;page</button>
        </span>
        <button id="klavity-undo" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;margin-left:auto;">↩ Undo</button>
        <button id="klavity-clear-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${icon('trash-2', { size: 14 })} Clear</button>
        <button id="klavity-save-ann" style="padding:6px 10px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-weight:700;">${icon('check', { label: 'Save', size: 14 })} Save</button>
        <button id="klavity-cancel-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${icon('x', { size: 14 })}</button>
      `
      // The canvas is rendered at an EXPLICIT CSS size (set by applyScale) inside a scrollable workspace —
      // no object-fit letterboxing — so a tall full-page capture renders at a readable width and scrolls
      // vertically instead of collapsing to a thin sliver. touch-action:none keeps touch drags drawing.
      canvas.style.cssText = 'cursor:crosshair;display:block;margin:12px auto;touch-action:none;background:#fff;border-radius:4px;outline:1px solid rgba(255,255,255,.12);outline-offset:-1px;box-shadow:0 12px 44px rgba(0,0,0,.55);'
      const scroller = document.createElement('div')
      scroller.style.cssText = 'flex:1;min-height:0;overflow:auto;display:block;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);'
      scroller.appendChild(canvas)
      // Scoped polish for the editor controls (press scale, hover, focus rings) — kept in a <style> since
      // the editor is built with inline styles and has no access to the modal's class CSS.
      const cstyle = document.createElement('style')
      cstyle.textContent =
        '.kl-edtb button{transition:transform .15s cubic-bezier(.34,1.56,.64,1),background .15s ease;will-change:transform;}' +
        // Hover lift + brighten — parity with the composer/right-click-menu buttons (was press-only here).
        '.kl-edtb button:hover{transform:translateY(-1px) scale(1.02);background:#45475a;}' +
        '.kl-edtb button[data-color]:hover{transform:scale(1.14);background:initial;}' +
        '.kl-edtb button:active{transform:scale(.96);}' +
        '.kl-edtb button:focus-visible{outline:2px solid #89b4fa;outline-offset:2px;}' +
        '.kl-edtb .kl-zb{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 9px;background:#313244;color:#cdd6f4;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;line-height:1;}' +
        '.kl-edtb .kl-zb:hover{background:#45475a;}' +
        '@media (prefers-reduced-motion:reduce){.kl-edtb button{transition:none;}.kl-edtb button:hover,.kl-edtb button:active,.kl-edtb button[data-color]:hover{transform:none;}}'
      editor.append(cstyle, toolbar, scroller)
      shadowRoot.appendChild(editor)

      // ── Zoom / fit: render the image at a readable scale (CSS px per image px). Default fit-WIDTH for
      // tall captures (so they don't become a sliver) and fit-WHOLE for normal ones. toImg() below maps via
      // getBoundingClientRect(), so coordinates stay correct at ANY scale + scroll position. ──
      let scale = 1
      const clampScale = (s: number) => Math.max(0.05, Math.min(5, s || 1))
      function applyScale(s: number) {
        scale = clampScale(s)
        canvas.style.width = Math.round(canvas.width * scale) + 'px'
        canvas.style.height = Math.round(canvas.height * scale) + 'px'
        const lbl = toolbar.querySelector('#klavity-zoom-pct') as HTMLElement | null
        if (lbl) lbl.textContent = Math.round(scale * 100) + '%'
      }
      const fitWidthScale = () => (Math.max(1, scroller.clientWidth - 24)) / canvas.width
      const fitPageScale = () => Math.min((Math.max(1, scroller.clientWidth - 24)) / canvas.width, (Math.max(1, scroller.clientHeight - 24)) / canvas.height)
      // Default: tall image (taller aspect than the workspace) → fit width; otherwise fit the whole page.
      const tall = (canvas.height / canvas.width) > (Math.max(1, scroller.clientHeight) / Math.max(1, scroller.clientWidth))
      applyScale(tall ? fitWidthScale() : fitPageScale())
      toolbar.querySelector('#klavity-zoom-in')!.addEventListener('click', () => applyScale(scale * 1.25))
      toolbar.querySelector('#klavity-zoom-out')!.addEventListener('click', () => applyScale(scale / 1.25))
      toolbar.querySelector('#klavity-fit-width')!.addEventListener('click', () => applyScale(fitWidthScale()))
      toolbar.querySelector('#klavity-fit-page')!.addEventListener('click', () => applyScale(fitPageScale()))

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
        // Keep the CLEAN screenshot; the drawn shapes travel as a structured overlay (re-rendered
        // toggleable + zoomable in the ticket) instead of being flattened into the image.
        if (annotator.shapes.length) {
          annotationsByIndex[index] = { w: canvas.width, h: canvas.height, shapes: annotator.shapes.map(s => ({ ...s })) }
          screenshots[index] = dataUrl
        } else {
          delete annotationsByIndex[index]
        }
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
  if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.endsWith('.heic') || file.name.endsWith('.heif')) {
    // HEIC→JPEG conversion uses heic2any (libheif compiled to WASM). Its Emscripten/embind glue calls
    // new Function() at module-eval, which strict-CSP customer sites (script-src without 'unsafe-eval')
    // block with an EvalError — that previously crashed the whole widget on mount. So heic2any is NOT
    // bundled into the embeddable widget IIFE (externalized in vite.widget.config.ts); the extension,
    // which runs outside customer CSP, still bundles it. When it's unavailable OR conversion/CSP fails,
    // degrade gracefully to uploading the raw file rather than throwing.
    try {
      const heic2any = (await import('heic2any')).default
      const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }) as Blob
      return blobToDataUrl(blob)
    } catch { /* heic2any absent (widget) or conversion failed — fall back to the raw file */ }
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
