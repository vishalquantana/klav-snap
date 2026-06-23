/**
 * Klavity Sims Live — persistent Sim dock + walk/box/pin choreography.
 *
 * "Customers in the room while you build."
 *
 * HOME BASE: Sims huddle bottom-right in the dock — always visible.
 *
 * WALK/BOX/PIN: when renderFeedback() receives a critical/concern observation
 * that resolves to a target element (model `region` first, text-matching fallback second), the Sim
 *   1. WALKS from the huddle to the flagged page element
 *   2. DRAWS a pulsing halo box around that element
 *   3. PINS a speech bubble anchored to the element (stays until dismissed)
 *
 * Critical page-level observations with no target show as a transient huddle bubble.
 * Positive/neutral observations are persisted server-side but are intentionally
 * not displayed on-page.
 *
 * Public API on window.KlavitySims:
 *   deploy(simIds, sims?, opts?)  — mount dock; opts.mode:'critical'|'all'
 *   setReviewing(bool)            — Dev 4: pulsing ring while review in flight
 *   renderFeedback(id, name, obs) — dispatch each observation to walk or huddle
 *   undeploy()                    — full teardown (walkers + halos + pins + dock)
 *   onTriage                      — settable hook: (obs, simName) => void
 *
 * Dev split:
 *   THIS FILE  — presence UI, walk choreography, window.KlavitySims API
 *   Dev 4      — DOM/scroll watch engine: calls setReviewing() + renderFeedback()
 *   Dev 6      — right-click menus: calls deploy()
 *   Dev 3      — /api/sim/review backend; each review item includes observations[]
 */

import { createSim, injectSimStyles, type SimProps } from '@klavity/core/sim'
import { icon } from '@klavity/core/icons'

// ── Public types ──────────────────────────────────────────────────────────────

/** Normalized (0–1) bounding box on the analysed viewport. */
export interface ObservationRegion {
  x: number   // left edge as fraction of viewport width
  y: number   // top  edge as fraction of viewport height
  w: number   // box width  as fraction of viewport width
  h: number   // box height as fraction of viewport height
}

/** Viewport state at the moment the screenshot was captured. */
export interface ObservationViewport {
  scrollX: number
  scrollY: number
  width: number
  height: number
}

export interface LiveSimDescriptor {
  id: string
  name: string
  initials?: string
  accent?: string
  photoUrl?: string
}

export interface LiveObservation {
  text: string
  sentiment?: string | null
  severity?: string | null
  suggestedBug?: { title?: string } | null
  /** Present when the server identified a specific page element for this observation. */
  region?: ObservationRegion | null
  /** Captured client viewport so delayed reviews can re-anchor after scrolling. */
  targetViewport?: ObservationViewport | null
}

export interface DeployOpts {
  /**
   * On-page annotations are intentionally critical-only to keep customer pages
   * readable. This option is retained for API compatibility; positives/neutral
   * observations still persist to Triage but do not render on-page.
   */
  mode?: 'critical' | 'all'
}

export interface KlavitySimsAPI {
  deploy(simIds: string[] | 'all', sims?: LiveSimDescriptor[], opts?: DeployOpts): void
  setReviewing(reviewing: boolean): void
  renderFeedback(simId: string, simName: string, observations: LiveObservation[]): void
  undeploy(): void
  /** Set this to receive "Triage as bug" clicks from pinned bubbles. */
  onTriage: ((observation: LiveObservation, simName: string) => void) | null
}

// ── Internal state ────────────────────────────────────────────────────────────

const DOCK_HOST_ID    = 'klav-sims-live'
const OVERLAY_HOST_ID = 'klav-sims-overlay'
const EXT_STYLE_ID    = 'klav-sims-ext-css'

let dockHostEl: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let dockEl: HTMLElement | null = null
let overlayEl: HTMLElement | null = null    // full-page overlay for walkers/halos/pins
let deployAbort: AbortController | null = null
interface SimSlot {
  avatarEl: HTMLElement   // .ksl-slot in the dock
  accent: string
  initials: string
  name: string
  clearBubble: (() => void) | null
}
const simSlots = new Map<string, SimSlot>()

/** In-transit walker elements (removed on arrival or undeploy). */
const walkers = new Set<HTMLElement>()

interface Pin { halo: HTMLElement; bubble: HTMLElement; cleanup?: () => void }
/** Active pinned annotations keyed by a unique pin id. */
const pins = new Map<string, Pin>()
let walkQueueIndex = 0
let walkQueueResetTimer: ReturnType<typeof setTimeout> | null = null
const walkQueueTimers = new Set<ReturnType<typeof setTimeout>>()

// ── Dock CSS (shadow DOM) ─────────────────────────────────────────────────────

const DOCK_CSS = `
  :host { all: initial; font-family: system-ui, -apple-system, sans-serif; }

  .ksl-sr {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; pointer-events: none;
  }

  .ksl-dock {
    display: flex; flex-direction: row;
    flex-wrap: wrap-reverse; justify-content: flex-end; align-items: flex-end;
    gap: 10px; row-gap: 6px;
    max-width: min(400px, calc(100vw - 32px));
    pointer-events: auto;
  }

  @keyframes ksl-jumpin {
    0%   { transform: translateY(80px) scale(.6);  opacity: 0; }
    52%  { transform: translateY(-14px) scale(1.1); opacity: 1; }
    72%  { transform: translateY(6px)   scale(.95); }
    88%  { transform: translateY(-2px)  scale(1.01); }
    100% { transform: translateY(0)    scale(1);    opacity: 1; }
  }
  .ksl-slot {
    position: relative; display: flex; flex-direction: column; align-items: center;
    cursor: default;
    animation: ksl-jumpin .62s cubic-bezier(.34,1.36,.64,1) both;
    animation-delay: calc(var(--ksl-idx,0) * 72ms);
    pointer-events: auto;
  }

  /* Idle "watching…" label */
  .ksl-idle {
    font-family: ui-monospace,'JetBrains Mono',monospace;
    font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase;
    color: rgba(255,255,255,.25); margin-top: 3px; white-space: nowrap;
    pointer-events: none; user-select: none;
    animation: ksl-idle-breathe 2.8s ease-in-out infinite;
    transition: opacity .3s;
  }
  @keyframes ksl-idle-breathe { 0%,100%{opacity:.45} 50%{opacity:.85} }
  .ksl-slot.ksl-has-bubble .ksl-idle,
  .ksl-slot.ksl-thinking   .ksl-idle { opacity: 0 !important; animation: none; }

  /*
   * Thinking state — spinning SVG progress ring + time hint.
   *
   * Layout: the .ksl-ring SVG is absolutely positioned so it orbits the Sim head
   * without changing the layout. The arc (circle with stroke-dasharray) spins once
   * every 2.4s, giving a clear "in-progress" signal.
   *
   * Time hint: a small "~5s" pill fades in below the ring so the admin knows a
   * review takes a few seconds (reviews typically run 3–8s in prod).
   */
  .ksl-ring {
    position: absolute;
    top: 50%; left: 50%;
    /* Centre over the ksim-head. The SVG is 58px; offset by half to centre. */
    transform: translate(-50%, -72%);
    pointer-events: none;
    opacity: 0;
    transition: opacity .25s;
  }
  .ksl-slot.ksl-thinking .ksl-ring { opacity: 1; }
  .ksl-ring circle {
    fill: none;
    stroke: var(--ksl-accent, #6366f1);
    stroke-width: 2.5;
    stroke-linecap: round;
    /* circumference ≈ 2π × 30 ≈ 188.5; dash = 60% of arc */
    stroke-dasharray: 113 75;
    stroke-dashoffset: 0;
    transform-origin: 31px 31px;
    animation: ksl-spin 2.4s linear infinite;
  }
  @keyframes ksl-spin { to { transform: rotate(360deg); } }

  /* "~5s" time hint pill — appears below the avatar while thinking */
  .ksl-time-hint {
    position: absolute;
    bottom: -18px; left: 50%;
    transform: translateX(-50%);
    font-family: ui-monospace, 'JetBrains Mono', monospace;
    font-size: 8px; letter-spacing: .06em; text-transform: uppercase;
    color: rgba(255,255,255,.5);
    background: rgba(99,102,241,.18);
    border: 1px solid rgba(99,102,241,.3);
    border-radius: 20px; padding: 1px 6px;
    white-space: nowrap; pointer-events: none;
    opacity: 0; transition: opacity .3s .4s;  /* delayed fade-in so fast reviews don't flash it */
  }
  .ksl-slot.ksl-thinking .ksl-time-hint { opacity: 1; }

  /* Huddle bubble */
  .ksl-bubble {
    position: absolute; bottom: calc(100% + 10px); right: 0; width: 200px;
    transform-origin: bottom center;
    background: linear-gradient(168deg,rgba(28,22,16,.97),rgba(18,14,10,.99));
    border: 1px solid #3a332b; border-left-width: 3px; border-radius: 13px;
    padding: 10px 30px 10px 11px;
    box-shadow: 0 20px 52px rgba(0,0,0,.65), 0 6px 20px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.07);
    -webkit-backdrop-filter: blur(12px) saturate(140%); backdrop-filter: blur(12px) saturate(140%);
    pointer-events: auto; z-index: 10;
    animation: ksl-bubble-in .32s cubic-bezier(.34,1.36,.64,1) both;
  }
  @keyframes ksl-bubble-in {
    0%  { transform: translateY(18px) scale(.78); opacity: 0; }
    58% { transform: translateY(-4px)  scale(1.04); opacity: 1; }
    80% { transform: translateY(2px)   scale(.98); }
    100%{ transform: translateY(0)     scale(1);   opacity: 1; }
  }
  @keyframes ksl-bubble-out {
    0%  { transform: translateY(0)     scale(1);  opacity: 1; }
    100%{ transform: translateY(-10px) scale(.88); opacity: 0; }
  }
  .ksl-bubble.is-out { pointer-events: none; animation: ksl-bubble-out .24s ease-in forwards; }
  .ksl-bubble::after  { content:''; position:absolute; bottom:-8px; right:14px; border:7px solid transparent; border-top-color:#3a332b; border-bottom:none; pointer-events:none; }
  .ksl-bubble::before { content:''; position:absolute; bottom:-6px; right:15px; border:6px solid transparent; border-top-color:#1c1610; border-bottom:none; z-index:1; pointer-events:none; }

  .ksl-b-tag { font-family:ui-monospace,'JetBrains Mono',monospace; font-size:9px; letter-spacing:.09em; text-transform:uppercase; font-weight:700; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ksl-b-sev { display:inline-block; font-family:ui-monospace,monospace; font-size:9px; letter-spacing:.05em; text-transform:uppercase; padding:1px 5px; border-radius:4px; margin-left:7px; vertical-align:middle; background:rgba(233,79,55,.22); color:#e8849a; }
  .ksl-b-sev.sev-m { background:rgba(244,169,60,.2);   color:#e8a24a; }
  .ksl-b-sev.sev-l { background:rgba(127,209,196,.15); color:#7fd1c4; }
  .ksl-b-obs  { font-size:12.5px; line-height:1.47; color:#cec6bd; }
  .ksl-b-more { font-size:11px; color:#5e5852; margin-top:5px; font-style:italic; }
  .ksl-b-close {
    position:absolute; top:7px; right:8px;
    background:none; border:none; cursor:pointer; color:#5e5852; font-size:13px;
    line-height:1; padding:2px 4px; border-radius:4px; pointer-events:auto;
    transition:color .15s,background .15s;
  }
  .ksl-b-close:hover   { color:#f5f3ee; background:rgba(255,255,255,.1); }
  .ksl-b-close:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }

  .ksl-close-all {
    position:absolute; top:-10px; left:-10px; width:20px; height:20px;
    border-radius:50%; background:#1a1510; border:1px solid #3a332b;
    color:#7a7268; font-size:11px; display:grid; place-items:center;
    cursor:pointer; pointer-events:auto; opacity:0;
    transition:opacity .2s,color .15s,background .15s; z-index:20;
  }
  .ksl-dock:hover .ksl-close-all { opacity:1; }
  .ksl-close-all:hover { color:#f5f3ee; background:#2a2218; }
  .ksl-close-all:focus-visible { opacity:1; outline:2px solid #8b5cf6; outline-offset:2px; }

  @media (max-width:480px) {
    .ksl-dock { max-width:calc(100vw - 24px); gap:7px; }
    .ksl-bubble { width:min(180px,calc(100vw - 40px)); font-size:12px; }
  }
  @media (prefers-reduced-motion:reduce) {
    .ksl-slot,.ksl-bubble,.ksl-bubble.is-out { animation:none !important; opacity:1; transform:none; }
    .ksl-idle { animation:none !important; opacity:.6; }
    .ksl-ring circle { animation:none !important; }
  }
`

// ── Overlay CSS (injected into <head> — applies outside shadow DOM) ───────────
//
// All class names use the .klav- prefix to avoid colliding with page styles.

const EXT_CSS = `
  /* ── Walker — a Sim that travels from the huddle to a page element ── */
  .klav-walker {
    position: fixed;
    pointer-events: none;
    z-index: 2147483641;
    /* CSS transition drives the walk trajectory */
    transition: left 1.1s cubic-bezier(.4,0,.2,1), top 1.1s cubic-bezier(.4,0,.2,1);
    will-change: left, top;
  }
  /* Suppress idle bob while walking; keep legs moving */
  .klav-walker .ksim { animation: none !important; }
  /* Homepage-style fast leg walk (mirrors .sim.walk legA/legB from site/index.html) */
  .klav-walker .ksim-legs i:nth-child(1) { animation: klav-leg-a .34s ease-in-out infinite alternate !important; }
  .klav-walker .ksim-legs i:nth-child(2) { animation: klav-leg-b .34s ease-in-out infinite alternate !important; }
  @keyframes klav-leg-a { from { transform: rotate(-24deg) } to { transform: rotate(24deg) } }
  @keyframes klav-leg-b { from { transform: rotate(24deg)  } to { transform: rotate(-24deg) } }

  /* ── Halo box — drawn around the flagged page element ── */
  .klav-halo {
    position: fixed;
    pointer-events: none;
    border-radius: 8px;
    z-index: 2147483640;
    border-width: 2px;
    border-style: solid;
    /* entry: scale-in from centre */
    animation: klav-halo-in .38s cubic-bezier(.34,1.36,.64,1) both,
               klav-halo-pulse 2.4s ease-in-out .4s infinite;
  }
  @keyframes klav-halo-in {
    from { transform: scale(.84); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
  @keyframes klav-halo-pulse {
    0%,100% { opacity: .75; }
    50%     { opacity: 1; }
  }

  /* ── Pinned bubble — sticky annotation anchored to the halo ── */
  @keyframes klav-pin-in {
    from { transform: scale(.86) translateY(10px); opacity: 0; }
    60%  { transform: scale(1.02) translateY(-2px); opacity: 1; }
    to   { transform: scale(1)   translateY(0);    opacity: 1; }
  }
  @keyframes klav-pin-out {
    to   { transform: scale(.88) translateY(-8px); opacity: 0; }
  }
  .klav-pin {
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
    animation: klav-pin-in .36s cubic-bezier(.34,1.36,.64,1) both;
  }
  .klav-pin.is-out { animation: klav-pin-out .22s ease-in forwards; pointer-events: none; }

  /* Tail pointing down toward the halo */
  .klav-pin::after  { content:''; position:absolute; bottom:-8px; left:18px; border:7px solid transparent; border-top-color:#3a332b; border-bottom:none; pointer-events:none; }
  .klav-pin::before { content:''; position:absolute; bottom:-6px; left:19px; border:6px solid transparent; border-top-color:#16110c;  border-bottom:none; z-index:1; pointer-events:none; }

  /* Header row: mini avatar + name tag + severity pill */
  .klav-pin-hd    { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
  .klav-pin-av    { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; font-family:ui-monospace,monospace; font-size:7.5px; font-weight:700; color:#fff; flex-shrink:0; }
  .klav-pin-name  { font-family:ui-monospace,'JetBrains Mono',monospace; font-size:9px; letter-spacing:.09em; text-transform:uppercase; font-weight:700; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .klav-pin-sev   { font-family:ui-monospace,monospace; font-size:9px; letter-spacing:.05em; text-transform:uppercase; padding:1px 5px; border-radius:4px; background:rgba(233,79,55,.22); color:#e8849a; flex-shrink:0; }
  .klav-pin-sev.sev-m { background:rgba(244,169,60,.2);   color:#e8a24a; }
  .klav-pin-sev.sev-l { background:rgba(127,209,196,.15); color:#7fd1c4; }

  /* Observation text */
  .klav-pin-obs { font-size:12.5px; line-height:1.47; color:#cec6bd; margin-bottom:10px; }

  /* Action buttons */
  .klav-pin-actions { display:flex; gap:7px; }
  .klav-pin-triage {
    flex:1; background:rgba(139,92,246,.18); border:1px solid rgba(139,92,246,.38);
    color:#c4b5fd; font-size:11.5px; font-weight:600; border-radius:7px;
    padding:5px 8px; cursor:pointer; font-family:system-ui,sans-serif;
    transition:background .15s,border-color .15s;
  }
  .klav-pin-triage:hover { background:rgba(139,92,246,.32); border-color:rgba(139,92,246,.6); }
  .klav-pin-triage:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }
  .klav-pin-dismiss {
    background:none; border:1px solid #3a332b; color:#6e6560; font-size:11.5px;
    border-radius:7px; padding:5px 8px; cursor:pointer; font-family:system-ui,sans-serif;
    transition:background .15s,color .15s,border-color .15s;
  }
  .klav-pin-dismiss:hover { background:rgba(255,255,255,.08); color:#f5f3ee; border-color:#5a5248; }
  .klav-pin-dismiss:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }

  @media (prefers-reduced-motion:reduce) {
    .klav-walker { transition:none !important; }
    .klav-walker .ksim-legs i { animation:none !important; }
    .klav-halo,.klav-halo.klav-halo { animation:none !important; opacity:1; transform:none; }
    .klav-pin,.klav-pin.is-out { animation:none !important; opacity:1; transform:none; }
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const parse = (s: string) => parseInt(s, 16)
  const [r, g, b] = h.length === 3
    ? [parse(h[0] + h[0]), parse(h[1] + h[1]), parse(h[2] + h[2])]
    : [parse(h.slice(0, 2)), parse(h.slice(2, 4)), parse(h.slice(4, 6))]
  return `rgba(${r},${g},${b},${alpha})`
}

/** Concern = bug/severity OR non-positive sentiment; positives/neutral stay off-page. */
function isConcernObservation(obs: LiveObservation): boolean {
  if (obs.suggestedBug) return true
  const severity = String(obs.severity ?? '').trim().toLowerCase()
  if (severity && severity !== 'none') return true
  const sentiment = String(obs.sentiment ?? '').trim().toLowerCase()
  if (!sentiment) return false
  const NON_ACTIONABLE = new Set(['positive','satisfied','delighted','neutral','none'])
  return !NON_ACTIONABLE.has(sentiment)
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false }
  catch { return false }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isOwnOverlayElement(el: Element | null): boolean {
  if (!el) return false
  if (el === overlayEl || el === dockHostEl) return true
  if (el.id === OVERLAY_HOST_ID || el.id === DOCK_HOST_ID || el.id === 'klavity-widget-host') return true
  const classList = (el as HTMLElement).classList
  return !!classList && (
    classList.contains('klav-halo') ||
    classList.contains('klav-pin') ||
    classList.contains('klav-walker') ||
    classList.contains('ksl-bubble') ||
    classList.contains('ksl-slot')
  )
}

function withOverlaysHidden<T>(fn: () => T): T {
  const hiddens: { el: HTMLElement; vis: string }[] = []
  for (const el of [overlayEl, dockHostEl]) {
    if (!el) continue
    hiddens.push({ el, vis: el.style.visibility })
    el.style.visibility = 'hidden'
  }
  try {
    return fn()
  } finally {
    for (const { el, vis } of hiddens) el.style.visibility = vis
  }
}

function viewportFor(obs: LiveObservation): ObservationViewport {
  const v = obs.targetViewport
  return {
    scrollX: Number.isFinite(v?.scrollX) ? Number(v!.scrollX) : window.scrollX,
    scrollY: Number.isFinite(v?.scrollY) ? Number(v!.scrollY) : window.scrollY,
    width: Math.max(1, Number.isFinite(v?.width) ? Number(v!.width) : window.innerWidth),
    height: Math.max(1, Number.isFinite(v?.height) ? Number(v!.height) : window.innerHeight),
  }
}

function targetRectFromRegion(region: ObservationRegion, viewport: ObservationViewport): DOMRect {
  return new DOMRect(
    viewport.scrollX + region.x * viewport.width,
    viewport.scrollY + region.y * viewport.height,
    Math.max(1, region.w * viewport.width),
    Math.max(1, region.h * viewport.height),
  )
}

function rectArea(rect: DOMRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height)
}

function overlapArea(a: DOMRect, b: DOMRect): number {
  const left = Math.max(a.left, b.left)
  const right = Math.min(a.right, b.right)
  const top = Math.max(a.top, b.top)
  const bottom = Math.min(a.bottom, b.bottom)
  return Math.max(0, right - left) * Math.max(0, bottom - top)
}

function viewportToDocumentRect(rect: DOMRect): DOMRect {
  return new DOMRect(rect.left + window.scrollX, rect.top + window.scrollY, rect.width, rect.height)
}

function isUsableTarget(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el === document.body || el === document.documentElement || isOwnOverlayElement(el)) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 8 || rect.height < 8) return false
  try {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
  } catch { /* ignore style lookup failures */ }
  return true
}

function elementCandidatesFromPoint(clientX: number, clientY: number): HTMLElement[] {
  return withOverlaysHidden(() => {
    const seen = new Set<Element>()
    const out: HTMLElement[] = []
    const add = (el: Element | null) => {
      let cur: Element | null = el
      while (cur && cur !== document.body && cur !== document.documentElement) {
        if (!seen.has(cur) && isUsableTarget(cur)) {
          seen.add(cur)
          out.push(cur)
        }
        cur = cur.parentElement
      }
    }

    const stack = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)].filter(Boolean) as Element[]
    for (const el of stack) add(el)
    return out
  })
}

function bestElementForRegion(region: ObservationRegion, obs: LiveObservation): HTMLElement | null {
  const viewport = viewportFor(obs)
  const targetDocRect = targetRectFromRegion(region, viewport)
  const clientX = Math.max(2, Math.min(window.innerWidth - 2, targetDocRect.left + targetDocRect.width / 2 - window.scrollX))
  const clientY = Math.max(2, Math.min(window.innerHeight - 2, targetDocRect.top + targetDocRect.height / 2 - window.scrollY))
  const candidates = elementCandidatesFromPoint(clientX, clientY)
  if (!candidates.length) return null

  const targetArea = Math.max(1, rectArea(targetDocRect))
  let best: HTMLElement | null = null
  let bestScore = -Infinity
  for (const el of candidates) {
    const rect = viewportToDocumentRect(el.getBoundingClientRect())
    const overlap = overlapArea(rect, targetDocRect)
    if (overlap <= 0) continue
    const area = Math.max(1, rectArea(rect))
    const coverage = overlap / targetArea
    const waste = Math.max(0, (area - overlap) / area)
    const tag = el.tagName.toLowerCase()
    const semanticBonus = /^(button|a|input|textarea|select|label|section|article|nav|header|footer|main|form)$/.test(tag) ? 0.18 : 0
    const sizePenalty = area > window.innerWidth * window.innerHeight * 0.92 ? 0.8 : 0
    const score = coverage - waste * 0.35 + semanticBonus - sizePenalty
    if (score > bestScore) {
      best = el
      bestScore = score
    }
  }
  return best ?? candidates[0] ?? null
}

async function scrollDocumentPointIntoView(pageX: number, pageY: number): Promise<void> {
  const margin = 80
  const inView =
    pageX >= window.scrollX + margin &&
    pageX <= window.scrollX + window.innerWidth - margin &&
    pageY >= window.scrollY + margin &&
    pageY <= window.scrollY + window.innerHeight - margin
  if (inView) return

  const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const maxX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
  const top = Math.max(0, Math.min(maxY, pageY - window.innerHeight * 0.38))
  const left = Math.max(0, Math.min(maxX, pageX - window.innerWidth * 0.45))
  try {
    window.scrollTo({ top, left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  } catch {
    window.scrollTo(left, top)
  }
  await sleep(prefersReducedMotion() ? 80 : 520)
}

const STOP_WORDS = new Set([
  'about','after','again','also','because','being','button','clear','could','easy','element','feels','from','have','into','just','like','more','page','section','that','the','their','there','this','with','would','where','while','your',
])

function tokensFrom(text: string): string[] {
  const seen = new Set<string>()
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => {
      if (word.length < 4 || STOP_WORDS.has(word) || seen.has(word)) return false
      seen.add(word)
      return true
    })
}

function inferTargetFromText(obs: LiveObservation): HTMLElement | null {
  const tokens = tokensFrom(obs.text)
  if (!tokens.length) return null
  const selector = [
    'button','a','input','textarea','select','label','h1','h2','h3','h4','p','li',
    'nav','header','footer','main','section','article','form','[role]','[aria-label]','[data-testid]','div',
  ].join(',')

  let best: HTMLElement | null = null
  let bestScore = 0
  const elements = Array.from(document.querySelectorAll(selector)).slice(0, 700)
  for (const el of elements) {
    if (!isUsableTarget(el)) continue
    const rect = el.getBoundingClientRect()
    const visible =
      rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    if (!visible) continue
    const text = [
      el.textContent || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.getAttribute('placeholder') || '',
      el.getAttribute('data-testid') || '',
      el.id || '',
      typeof el.className === 'string' ? el.className : '',
    ].join(' ').toLowerCase()
    if (!text.trim()) continue
    const hits = tokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0)
    if (!hits) continue
    const tag = el.tagName.toLowerCase()
    const semanticBonus = /^(button|a|input|textarea|select|label|h1|h2|h3|section|article|nav|header|footer|main|form)$/.test(tag) ? 0.6 : 0
    const area = Math.max(1, rect.width * rect.height)
    const hugePenalty = area > window.innerWidth * window.innerHeight * 0.85 ? 1.1 : 0
    const score = hits / tokens.length + semanticBonus - hugePenalty
    if (score > bestScore) {
      best = el
      bestScore = score
    }
  }
  return best
}

async function resolveObservationTarget(obs: LiveObservation): Promise<HTMLElement | null> {
  if (obs.region) {
    const viewport = viewportFor(obs)
    const targetDocRect = targetRectFromRegion(obs.region, viewport)
    await scrollDocumentPointIntoView(targetDocRect.left + targetDocRect.width / 2, targetDocRect.top + targetDocRect.height / 2)
    const byRegion = bestElementForRegion(obs.region, obs)
    if (byRegion) return byRegion
  }
  return inferTargetFromText(obs)
}

// ── Shadow host + overlay ─────────────────────────────────────────────────────

function ensureDockHost(): ShadowRoot {
  if (dockHostEl && shadowRoot) return shadowRoot
  dockHostEl = document.createElement('div')
  dockHostEl.id = DOCK_HOST_ID
  dockHostEl.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;'
  shadowRoot = dockHostEl.attachShadow({ mode: 'open' })
  injectSimStyles(shadowRoot)
  const style = document.createElement('style'); style.textContent = DOCK_CSS
  shadowRoot.appendChild(style)
  document.body.appendChild(dockHostEl)
  return shadowRoot
}

function ensureOverlay(): HTMLElement {
  if (overlayEl) return overlayEl

  // Inject EXT_CSS into <head> once
  if (!document.getElementById(EXT_STYLE_ID)) {
    const s = document.createElement('style')
    s.id = EXT_STYLE_ID; s.textContent = EXT_CSS
    document.head.appendChild(s)
  }

  overlayEl = document.createElement('div')
  overlayEl.id = OVERLAY_HOST_ID
  overlayEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483640;pointer-events:none;overflow:visible;'
  document.body.appendChild(overlayEl)
  return overlayEl
}

// ── deploy() ─────────────────────────────────────────────────────────────────

function deploy(
  simIds: string[] | 'all',
  sims: LiveSimDescriptor[] = [],
  opts: DeployOpts = {},
): void {
  if (typeof document === 'undefined') return
  undeploy()   // clean slate

  const shadow = ensureDockHost()
  ensureOverlay()
  deployAbort = new AbortController()

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') undeploy() },
    { signal: deployAbort.signal })

  // Screen reader live region
  const announcer = document.createElement('div')
  announcer.className = 'ksl-sr'; announcer.id = 'ksl-announcer'
  announcer.setAttribute('aria-live', 'polite'); announcer.setAttribute('aria-atomic', 'true')
  shadow.appendChild(announcer)

  // Dock
  dockEl = document.createElement('div')
  dockEl.className = 'ksl-dock'
  dockEl.setAttribute('role', 'region'); dockEl.setAttribute('aria-label', 'Sims — live feedback')
  shadow.appendChild(dockEl)

  const closeAll = document.createElement('button')
  closeAll.className = 'ksl-close-all'
  closeAll.setAttribute('aria-label', 'Stop all Sim reviews'); closeAll.title = 'Stop Sim reviews'
  closeAll.innerHTML = icon('x', { size: 12 }); closeAll.addEventListener('click', undeploy)
  dockEl.appendChild(closeAll)

  const visible = simIds === 'all' ? sims : sims.filter(s => (simIds as string[]).includes(s.id))

  if (!visible.length) {
    console.warn('[KlavitySims] deploy(): no matching Sims — dock not mounted.')
    undeploy(); return
  }

  visible.slice(0, 8).forEach((sim, idx) => {
    const accent = sim.accent || '#6366f1'
    const initials = sim.initials || sim.name.slice(0, 2).toUpperCase()

    const slot = document.createElement('div')
    slot.className = 'ksl-slot'; slot.dataset.simId = sim.id
    slot.setAttribute('aria-label', sim.name)
    slot.style.setProperty('--ksl-idx', String(idx))
    slot.style.setProperty('--ksl-accent', accent)

    const size = window.innerWidth <= 480 ? 38 : 46
    slot.appendChild(createSim({ name: sim.name, initials, photoUrl: sim.photoUrl, color: accent, animate: true, legs: true, size } as SimProps))

    // Spinning progress ring — shown while ksl-thinking; SVG orbits the head
    const ringNs = 'http://www.w3.org/2000/svg'
    const ringEl = document.createElementNS(ringNs, 'svg') as SVGSVGElement
    ringEl.setAttribute('class', 'ksl-ring')
    ringEl.setAttribute('width', '62'); ringEl.setAttribute('height', '62')
    ringEl.setAttribute('viewBox', '0 0 62 62')
    ringEl.setAttribute('aria-hidden', 'true')
    const circEl = document.createElementNS(ringNs, 'circle') as SVGCircleElement
    circEl.setAttribute('cx', '31'); circEl.setAttribute('cy', '31'); circEl.setAttribute('r', '29')
    ringEl.appendChild(circEl)
    slot.appendChild(ringEl)

    // "~5s" time-hint pill — gives the user a sense of expected wait
    const hint = document.createElement('span')
    hint.className = 'ksl-time-hint'; hint.textContent = '~5s'
    hint.setAttribute('aria-hidden', 'true'); slot.appendChild(hint)

    const idle = document.createElement('span')
    idle.className = 'ksl-idle'; idle.textContent = 'watching'
    idle.setAttribute('aria-hidden', 'true'); slot.appendChild(idle)

    dockEl!.appendChild(slot)
    simSlots.set(sim.id, { avatarEl: slot, accent, initials, name: sim.name, clearBubble: null })
  })
}

// ── setReviewing() ────────────────────────────────────────────────────────────

function setReviewing(reviewing: boolean): void {
  simSlots.forEach(({ avatarEl }) => avatarEl.classList.toggle('ksl-thinking', reviewing))
}

// ── Walk choreography helpers ─────────────────────────────────────────────────

/** Create a walking Sim clone that travels from the huddle to destX/destY. */
function spawnWalker(slot: SimSlot, destX: number, destY: number): Promise<void> {
  const ov = overlayEl!
  const huddleRect = dockHostEl!.getBoundingClientRect()
  const startX = huddleRect.left + huddleRect.width / 2 - 21
  const startY = huddleRect.top  + huddleRect.height / 2 - 48

  const walkerDiv = document.createElement('div')
  walkerDiv.className = 'klav-walker'
  walkerDiv.style.left = startX + 'px'
  walkerDiv.style.top  = startY + 'px'
  walkerDiv.appendChild(
    createSim({ name: slot.name, initials: slot.initials, color: slot.accent, animate: false, legs: true, size: 42 } as SimProps)
  )
  ov.appendChild(walkerDiv)
  walkers.add(walkerDiv)

  return new Promise<void>(resolve => {
    // Two rAFs ensure the initial position is painted before the transition fires
    requestAnimationFrame(() => requestAnimationFrame(() => {
      walkerDiv.style.left = destX + 'px'
      walkerDiv.style.top  = destY + 'px'
      const done = () => { walkerDiv.remove(); walkers.delete(walkerDiv); resolve() }
      walkerDiv.addEventListener('transitionend', done, { once: true })
      setTimeout(done, 1400)   // safety timeout if transitionend never fires
    }))
  })
}

/** Draw a halo box and pin a speech bubble, both anchored to `targetEl`. */
function showHaloAndPin(
  slot: SimSlot,
  obs: LiveObservation,
  targetEl: Element,
): void {
  const ov = ensureOverlay()
  const pinId = `pin_${slot.name}_${Date.now()}`

  // Halo
  const halo = document.createElement('div')
  halo.className = 'klav-halo'
  halo.style.borderColor = slot.accent
  halo.style.boxShadow = `0 0 0 4px ${hexToRgba(slot.accent,.16)},0 0 24px ${hexToRgba(slot.accent,.2)}`
  ov.appendChild(halo)

  const pin = document.createElement('div')
  pin.className = 'klav-pin'
  pin.style.borderLeftColor = slot.accent
  pin.setAttribute('role', 'status')
  pin.setAttribute('aria-label', `Pinned feedback from ${slot.name}`)

  // Header
  const hd = document.createElement('div'); hd.className = 'klav-pin-hd'

  const av = document.createElement('div'); av.className = 'klav-pin-av'
  av.style.background = slot.accent; av.textContent = slot.initials

  const nameEl = document.createElement('span'); nameEl.className = 'klav-pin-name'
  nameEl.style.color = slot.accent; nameEl.textContent = slot.name

  hd.appendChild(av); hd.appendChild(nameEl)

  if (obs.severity && obs.severity !== 'none') {
    const sc = obs.severity === 'medium' ? ' sev-m' : obs.severity === 'low' ? ' sev-l' : ''
    const sev = document.createElement('span')
    sev.className = `klav-pin-sev${sc}`
    sev.setAttribute('aria-label', `Severity: ${obs.severity}`)
    sev.textContent = obs.severity; hd.appendChild(sev)
  }

  // Observation text — textContent only (LLM output, XSS guard)
  const obsEl = document.createElement('div'); obsEl.className = 'klav-pin-obs'
  obsEl.textContent = obs.text || ''

  // Actions
  const actions = document.createElement('div'); actions.className = 'klav-pin-actions'

  const triageBtn = document.createElement('button'); triageBtn.className = 'klav-pin-triage'
  triageBtn.innerHTML = icon('bug') + ' Triage as bug'
  triageBtn.setAttribute('aria-label', `Triage observation from ${slot.name} as a bug`)
  triageBtn.addEventListener('click', () => { SimsLive.onTriage?.(obs, slot.name) })

  const dismissBtn = document.createElement('button'); dismissBtn.className = 'klav-pin-dismiss'
  dismissBtn.textContent = 'Dismiss'
  dismissBtn.setAttribute('aria-label', `Dismiss pinned feedback from ${slot.name}`)
  dismissBtn.addEventListener('click', () => {
    pin.classList.add('is-out')
    halo.style.animation = 'klav-pin-out .22s ease-in forwards'
    const current = pins.get(pinId)
    current?.cleanup?.()
    setTimeout(() => { pin.remove(); halo.remove(); pins.delete(pinId) }, 240)
  })

  actions.appendChild(triageBtn); actions.appendChild(dismissBtn)
  pin.appendChild(hd); pin.appendChild(obsEl); pin.appendChild(actions)
  ov.appendChild(pin)

  const ctrl = new AbortController()
  const updatePosition = () => {
    const rect = targetEl.getBoundingClientRect()
    const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    halo.style.display = visible ? '' : 'none'
    pin.style.display = visible ? '' : 'none'
    if (!visible) return

    halo.style.left = `${rect.left - 5}px`
    halo.style.top = `${rect.top - 5}px`
    halo.style.width = `${rect.width + 10}px`
    halo.style.height = `${rect.height + 10}px`

    // Pin bubble position — above element, clamped to viewport
    const PIN_W = 224, PIN_H_EST = Math.max(112, pin.offsetHeight || 150)
    let bLeft = rect.left
    let bTop = rect.top - PIN_H_EST - 14
    bLeft = Math.max(10, Math.min(window.innerWidth - PIN_W - 10, bLeft))
    if (bTop < 10) bTop = rect.bottom + 14   // flip below if no space above
    pin.style.left = `${bLeft}px`
    pin.style.top = `${bTop}px`
  }
  const scheduleUpdate = () => requestAnimationFrame(updatePosition)
  updatePosition()
  window.addEventListener('scroll', scheduleUpdate, { passive: true, signal: ctrl.signal })
  window.addEventListener('resize', scheduleUpdate, { signal: ctrl.signal })

  pins.set(pinId, { halo, bubble: pin, cleanup: () => ctrl.abort() })
}

function enqueueWalk(slot: SimSlot, obs: LiveObservation): void {
  const delay = walkQueueIndex * 650
  walkQueueIndex += 1
  if (walkQueueResetTimer) clearTimeout(walkQueueResetTimer)
  walkQueueResetTimer = setTimeout(() => {
    walkQueueIndex = 0
    walkQueueResetTimer = null
  }, delay + 2200)
  const timer = setTimeout(() => {
    walkQueueTimers.delete(timer)
    void walkAndPin(slot, obs)
  }, delay)
  walkQueueTimers.add(timer)
}

/** Full walk + pin sequence for one observation. */
async function walkAndPin(slot: SimSlot, obs: LiveObservation): Promise<void> {
  if (!overlayEl || !dockHostEl) return
  const targetEl = await resolveObservationTarget(obs)
  if (!targetEl) {
    // Fallback to huddle if element not found
    showHuddleBubble(slot, [obs])
    return
  }

  const rect = targetEl.getBoundingClientRect()
  // Destination: Sim stands just below-left of the target element
  const destX = Math.max(8, Math.min(window.innerWidth - 60,  rect.left + rect.width * .1 - 21))
  const destY = Math.min(window.innerHeight - 80,              rect.bottom - 58)

  await spawnWalker(slot, destX, destY)
  showHaloAndPin(slot, obs, targetEl)
}

// ── Huddle bubble (existing behavior for non-walk observations) ───────────────

function showHuddleBubble(slot: SimSlot, observations: LiveObservation[]): void {
  if (!dockEl || !shadowRoot) return

  slot.clearBubble?.()   // dismiss any existing bubble first

  const first = observations[0]
  const extraCount = observations.length - 1

  // Update aria-live
  const ann = shadowRoot.getElementById('ksl-announcer')
  if (ann) {
    ann.textContent = ''
    requestAnimationFrame(() => {
      if (!shadowRoot) return
      const a = shadowRoot.getElementById('ksl-announcer')
      if (a) a.textContent = `${slot.name}: ${first.text || ''}${extraCount > 0 ? ` and ${extraCount} more` : ''}`
    })
  }

  const bubble = document.createElement('div')
  bubble.className = 'ksl-bubble'
  bubble.setAttribute('role', 'status')
  bubble.setAttribute('aria-label', `Feedback from ${slot.name}`)
  bubble.style.borderLeftColor = slot.accent

  const closeBtn = document.createElement('button')
  closeBtn.className = 'ksl-b-close'
  closeBtn.setAttribute('aria-label', `Dismiss feedback from ${slot.name}`)
  closeBtn.innerHTML = icon('x', { size: 13 })

  const tag = document.createElement('div'); tag.className = 'ksl-b-tag'
  tag.style.color = slot.accent; tag.textContent = slot.name

  if (first.severity && first.severity !== 'none') {
    const sc = first.severity === 'medium' ? ' sev-m' : first.severity === 'low' ? ' sev-l' : ''
    const sev = document.createElement('span')
    sev.className = `ksl-b-sev${sc}`.replace('sev-m','sev-m').replace('sev-l','sev-l')
    sev.textContent = first.severity; tag.appendChild(sev)
  }

  const obsEl = document.createElement('div'); obsEl.className = 'ksl-b-obs'
  obsEl.textContent = first.text || ''

  bubble.appendChild(closeBtn); bubble.appendChild(tag); bubble.appendChild(obsEl)

  if (extraCount > 0) {
    const more = document.createElement('div'); more.className = 'ksl-b-more'
    more.textContent = `+${extraCount} more observation${extraCount > 1 ? 's' : ''}`
    bubble.appendChild(more)
  }

  slot.avatarEl.appendChild(bubble)
  slot.avatarEl.classList.add('ksl-has-bubble')

  let dismissed = false
  const dismiss = () => {
    if (dismissed) return; dismissed = true
    clearTimeout(timer)
    bubble.classList.add('is-out')
    setTimeout(() => {
      bubble.remove()
      if (simSlots.get(slot.avatarEl.dataset.simId ?? '')?.clearBubble === clearFn) {
        slot.avatarEl.classList.remove('ksl-has-bubble')
      }
    }, 265)
    if (simSlots.get(slot.avatarEl.dataset.simId ?? '')?.clearBubble === clearFn) {
      simSlots.get(slot.avatarEl.dataset.simId ?? '')!.clearBubble = null
    }
  }
  const timer = setTimeout(dismiss, 14_000)
  const clearFn = () => { clearTimeout(timer); dismiss() }
  closeBtn.addEventListener('click', clearFn)
  slot.clearBubble = clearFn
}

// ── renderFeedback() ──────────────────────────────────────────────────────────

function renderFeedback(simId: string, simName: string, observations: LiveObservation[]): void {
  if (!dockEl) return
  const slot = simSlots.get(simId)
  if (!slot) {
    console.warn(`[KlavitySims] renderFeedback: simId "${simId}" not in dock`)
    return
  }
  if (!observations.length) return

  // Keep the on-page layer action-oriented. Non-actionable observations still
  // persist through the review pipeline, but they do not create page chrome.
  const toWalk: LiveObservation[] = []

  for (const obs of observations) {
    if (isConcernObservation(obs)) toWalk.push(obs)
  }

  // Walk observations: staggered so Sims leave one after the other
  toWalk.forEach((obs) => enqueueWalk(slot, obs))
}

// ── undeploy() ────────────────────────────────────────────────────────────────

function undeploy(): void {
  // 1. Cancel huddle bubble timers
  simSlots.forEach(s => { s.clearBubble?.(); s.clearBubble = null })
  simSlots.clear()

  // 2. Abort global listeners
  deployAbort?.abort(); deployAbort = null
  if (walkQueueResetTimer) clearTimeout(walkQueueResetTimer)
  walkQueueResetTimer = null
  walkQueueTimers.forEach((timer) => clearTimeout(timer))
  walkQueueTimers.clear()
  walkQueueIndex = 0

  // 3. Remove all in-transit walkers immediately
  walkers.forEach(w => w.remove()); walkers.clear()

  // 4. Remove all pinned halos + bubbles
  pins.forEach(({ halo, bubble, cleanup }) => { cleanup?.(); halo.remove(); bubble.remove() }); pins.clear()

  // 5. Remove overlay host (and any leftover children)
  overlayEl?.remove(); overlayEl = null

  // 6. Remove dock host (shadow DOM — cleans up dock + announcer + all slots)
  dockEl?.remove(); dockEl = null
  dockHostEl?.remove(); dockHostEl = null; shadowRoot = null

  // 7. Leave EXT_CSS in place — removing it mid-session can cause a flash;
  //    it only adds .klav-* rules which harmlessly sit unused between sessions.
}

// ── Public API ────────────────────────────────────────────────────────────────

export const SimsLive: KlavitySimsAPI = {
  deploy,
  setReviewing,
  renderFeedback,
  undeploy,
  onTriage: null,
}

export function installKlavitySims(): void {
  if (typeof window === 'undefined') return
  if ((window as any).KlavitySims) return
  ;(window as any).KlavitySims = SimsLive
}

if (typeof window !== 'undefined') installKlavitySims()
