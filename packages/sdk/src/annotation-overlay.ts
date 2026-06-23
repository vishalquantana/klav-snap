/**
 * Klavity Annotation Overlay — standalone on-page visual annotation layer.
 *
 * Renders a halo box + optional label pin anchored to viewport coordinates.
 * No dependency on widget.ts or sims-live.ts. Visual style mirrors the
 * sims-live halo/pin; CSS uses the .klav-ao-* prefix to avoid collisions.
 *
 * Public API:
 *   showAnnotation(rect, label?, opts?) → id   draw a halo (+ pin when label given)
 *   clearAnnotation(id)                        remove one annotation by id
 *   clearAnnotations()                         remove all annotations
 *
 * Pure geometry helpers exported for unit tests (no DOM):
 *   clampRect(rect, vw, vh)
 *   pinPosition(rect, pinW, pinHEst, vw, vh, margin?)
 */

const STYLE_ID   = 'klav-ao-css'
const OVERLAY_ID = 'klav-ao-overlay'

// ── Public types ──────────────────────────────────────────────────────────────

/** Viewport-relative bounding box in CSS pixels. */
export interface Rect {
  x: number   // distance from viewport left
  y: number   // distance from viewport top
  w: number
  h: number
}

export interface AnnotationOpts {
  /** Accent colour. Defaults to the Klavity brand purple '#6366f1'. */
  color?: string
  /** Optional severity badge shown in the pin header. */
  severity?: 'high' | 'medium' | 'low'
}

// ── Pure geometry helpers (no DOM, fully testable) ────────────────────────────

/**
 * Clamp a rect so it stays within [0, vw) × [0, vh).
 * Width and height are reduced to fit; the rect never overflows the viewport.
 */
export function clampRect(rect: Rect, vw: number, vh: number): Rect {
  const x = Math.max(0, Math.min(rect.x, vw - 1))
  const y = Math.max(0, Math.min(rect.y, vh - 1))
  const w = Math.max(1, Math.min(rect.w, vw - x))
  const h = Math.max(1, Math.min(rect.h, vh - y))
  return { x, y, w, h }
}

/**
 * Compute the top-left position for a pin bubble relative to a halo rect.
 *
 * Preference: place the pin ABOVE the halo (tail points down toward it).
 * Falls back to BELOW when there is insufficient space above.
 * The left edge is aligned to the halo rect, then clamped to keep the bubble
 * fully on-screen.
 *
 * @param rect      Halo bounding box in viewport CSS px.
 * @param pinW      Pin bubble rendered width in CSS px.
 * @param pinHEst   Estimated pin height used for space check (not pixel-perfect).
 * @param vw, vh    Viewport dimensions.
 * @param margin    Minimum gap from each viewport edge (default 10 px).
 * @returns { left, top, below } — top-left of the pin + whether it flipped below.
 */
export function pinPosition(
  rect: Rect,
  pinW: number,
  pinHEst: number,
  vw: number,
  vh: number,
  margin = 10,
): { left: number; top: number; below: boolean } {
  const GAP = 14
  const fitsAbove = rect.y - pinHEst - GAP >= margin
  const below = !fitsAbove

  const rawTop = below
    ? rect.y + rect.h + GAP
    : rect.y - pinHEst - GAP

  const top  = Math.max(margin, Math.min(rawTop, vh - pinHEst - margin))
  const left = Math.max(margin, Math.min(rect.x, vw - pinW - margin))

  return { left, top, below }
}

// ── CSS (injected once into <head>) ───────────────────────────────────────────
// Visual design mirrors sims-live's .klav-halo / .klav-pin exactly.

const CSS = `
  .klav-ao-halo {
    position: fixed;
    border-radius: 8px;
    border-width: 2px;
    border-style: solid;
    pointer-events: none;
    z-index: 2147483640;
    animation: klav-ao-in .38s cubic-bezier(.34,1.36,.64,1) both,
               klav-ao-pulse 2.4s ease-in-out .4s infinite;
  }
  @keyframes klav-ao-in {
    from { transform: scale(.84); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
  @keyframes klav-ao-pulse {
    0%,100% { opacity: .75; }
    50%     { opacity: 1; }
  }

  .klav-ao-pin {
    position: fixed;
    z-index: 2147483642;
    width: 224px;
    background: linear-gradient(168deg, rgba(22,17,12,.98), rgba(14,11,8,.99));
    border: 1px solid #3a332b;
    border-left-width: 3px;
    border-radius: 13px;
    padding: 11px 11px 10px 12px;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 20px 52px rgba(0,0,0,.68), 0 6px 18px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.07);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    backdrop-filter: blur(12px) saturate(140%);
    pointer-events: auto;
    animation: klav-ao-pin-in .36s cubic-bezier(.34,1.36,.64,1) both;
  }
  @keyframes klav-ao-pin-in {
    from { transform: scale(.86) translateY(10px); opacity: 0; }
    60%  { transform: scale(1.02) translateY(-2px); opacity: 1; }
    to   { transform: scale(1)   translateY(0);    opacity: 1; }
  }
  .klav-ao-pin.is-out {
    animation: klav-ao-pin-out .22s ease-in forwards;
    pointer-events: none;
  }
  @keyframes klav-ao-pin-out {
    to { transform: scale(.88) translateY(-8px); opacity: 0; }
  }
  /* Tail pointing down toward the halo (default: pin is above the halo) */
  .klav-ao-pin::after  { content:''; position:absolute; bottom:-8px; left:18px; border:7px solid transparent; border-top-color:#3a332b; border-bottom:none; pointer-events:none; }
  .klav-ao-pin::before { content:''; position:absolute; bottom:-6px; left:19px; border:6px solid transparent; border-top-color:#16110c;  border-bottom:none; z-index:1; pointer-events:none; }
  /* Tail flipped to top when the pin is placed below the halo */
  .klav-ao-pin.tail-top::after  { bottom:auto; top:-8px; border-top:none; border-bottom:7px solid #3a332b; }
  .klav-ao-pin.tail-top::before { bottom:auto; top:-6px; border-top:none; border-bottom:6px solid #16110c; z-index:1; }

  .klav-ao-hd   { display:flex; align-items:center; gap:6px; margin-bottom:7px; }
  .klav-ao-lbl  { font-family:ui-monospace,'JetBrains Mono',monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:700; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .klav-ao-sev  { font-family:ui-monospace,monospace; font-size:9px; letter-spacing:.05em; text-transform:uppercase; padding:1px 5px; border-radius:4px; background:rgba(233,79,55,.22); color:#e8849a; flex-shrink:0; }
  .klav-ao-sev.sev-m { background:rgba(244,169,60,.2);   color:#e8a24a; }
  .klav-ao-sev.sev-l { background:rgba(127,209,196,.15); color:#7fd1c4; }

  .klav-ao-dismiss {
    background:none; border:1px solid #3a332b; color:#6e6560; font-size:11.5px;
    border-radius:7px; padding:5px 8px; cursor:pointer; font-family:system-ui,sans-serif;
    transition:background .15s,color .15s,border-color .15s; width:100%; margin-top:8px;
  }
  .klav-ao-dismiss:hover { background:rgba(255,255,255,.08); color:#f5f3ee; border-color:#5a5248; }
  .klav-ao-dismiss:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }

  @media (prefers-reduced-motion:reduce) {
    .klav-ao-halo { animation:none !important; opacity:1; transform:none; }
    .klav-ao-pin,.klav-ao-pin.is-out { animation:none !important; opacity:1; transform:none; }
  }
`

// ── Internal state ────────────────────────────────────────────────────────────

let overlayEl: HTMLElement | null = null
let _nextId = 1
const _annotations = new Map<string, { halo: HTMLElement; pin: HTMLElement | null }>()

// ── DOM helpers ───────────────────────────────────────────────────────────────

function _hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const p = (s: string) => parseInt(s, 16)
  const [r, g, b] = h.length === 3
    ? [p(h[0] + h[0]), p(h[1] + h[1]), p(h[2] + h[2])]
    : [p(h.slice(0, 2)), p(h.slice(2, 4)), p(h.slice(4, 6))]
  return `rgba(${r},${g},${b},${alpha})`
}

function _ensureOverlay(): HTMLElement {
  if (overlayEl) return overlayEl
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style')
    s.id = STYLE_ID; s.textContent = CSS
    document.head.appendChild(s)
  }
  overlayEl = document.createElement('div')
  overlayEl.id = OVERLAY_ID
  overlayEl.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;overflow:visible;z-index:2147483640;'
  document.body.appendChild(overlayEl)
  return overlayEl
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Draw a halo box around `rect` and, when `label` is provided, a pinned
 * speech bubble above (or below when space is tight).
 *
 * All coordinates are viewport CSS px (same origin as `element.getBoundingClientRect()`).
 *
 * @returns A unique annotation id for `clearAnnotation()`.
 */
export function showAnnotation(rect: Rect, label?: string, opts: AnnotationOpts = {}): string {
  const ov  = _ensureOverlay()
  const col = opts.color ?? '#6366f1'
  const id  = `klav-ao-${_nextId++}`
  const PAD = 5

  // Halo
  const halo = document.createElement('div')
  halo.className     = 'klav-ao-halo'
  halo.dataset.aoId  = id
  halo.style.left    = (rect.x - PAD) + 'px'
  halo.style.top     = (rect.y - PAD) + 'px'
  halo.style.width   = (rect.w + PAD * 2) + 'px'
  halo.style.height  = (rect.h + PAD * 2) + 'px'
  halo.style.borderColor = col
  halo.style.boxShadow   = `0 0 0 4px ${_hexToRgba(col,.14)},0 0 24px ${_hexToRgba(col,.18)}`
  ov.appendChild(halo)

  // Pin bubble
  let pin: HTMLElement | null = null
  if (label) {
    const PIN_W = 224, PIN_H_EST = 96
    const haloRect: Rect = { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 }
    const { left, top, below } = pinPosition(
      haloRect, PIN_W, PIN_H_EST,
      window.innerWidth, window.innerHeight,
    )

    pin = document.createElement('div')
    pin.className    = 'klav-ao-pin' + (below ? ' tail-top' : '')
    pin.dataset.aoId = id
    pin.style.borderLeftColor = col
    pin.style.left   = left + 'px'
    pin.style.top    = top  + 'px'
    pin.setAttribute('role', 'status')
    pin.setAttribute('aria-label', `Annotation: ${label}`)

    // Header row: label + optional severity badge
    const hd  = document.createElement('div'); hd.className = 'klav-ao-hd'
    const lbl = document.createElement('span'); lbl.className = 'klav-ao-lbl'
    lbl.style.color = col; lbl.textContent = label
    hd.appendChild(lbl)

    if (opts.severity) {
      const sc  = opts.severity === 'medium' ? ' sev-m' : opts.severity === 'low' ? ' sev-l' : ''
      const sev = document.createElement('span')
      sev.className   = `klav-ao-sev${sc}`
      sev.textContent = opts.severity
      hd.appendChild(sev)
    }

    // Dismiss
    const dismissBtn = document.createElement('button')
    dismissBtn.className   = 'klav-ao-dismiss'
    dismissBtn.textContent = 'Dismiss'
    dismissBtn.addEventListener('click', () => clearAnnotation(id))

    pin.appendChild(hd)
    pin.appendChild(dismissBtn)
    ov.appendChild(pin)
  }

  _annotations.set(id, { halo, pin })
  return id
}

/**
 * Remove a specific annotation by the id returned from `showAnnotation()`.
 * The pin (if any) exits with a short fade-out; the halo fades simultaneously.
 */
export function clearAnnotation(id: string): void {
  const ann = _annotations.get(id)
  if (!ann) return
  _annotations.delete(id)

  const { halo, pin } = ann
  if (pin) {
    pin.classList.add('is-out')
    halo.style.animation = 'klav-ao-pin-out .22s ease-in forwards'
    setTimeout(() => { pin.remove(); halo.remove() }, 240)
  } else {
    halo.remove()
  }
}

/** Remove all currently visible annotations at once. */
export function clearAnnotations(): void {
  for (const id of [..._annotations.keys()]) clearAnnotation(id)
}
