/**
 * Klavity Sims Live — persistent Sim presence dock.
 *
 * "Customers in the room while you build." Once deployed, the Sim avatars dock
 * bottom-right and stay for the whole session. Whenever the DOM/scroll watch
 * engine (Dev 4) gets a fresh review from /api/sim/review, it calls
 * window.KlavitySims.renderFeedback() and the relevant Sim shows a speech bubble.
 *
 * Public API — exposed on window.KlavitySims:
 *
 *   deploy(simIds, sims?)   — Mount the dock; show the given Sims (or "all").
 *   renderFeedback(...)     — Make a Sim pop up and show its observations.
 *   undeploy()              — Tear down the dock entirely.
 *
 * Dev split:
 *   THIS FILE  → presence UI + window.KlavitySims API
 *   Dev 4      → DOM/scroll watch engine: calls renderFeedback() on new reviews
 *   Dev 6      → right-click menus: calls deploy() to start the session
 *   Dev 3      → backend: /api/sim/review returns the reviews Dev 4 feeds here
 */

import { createSim, injectSimStyles, type SimProps } from '@klavity/core/sim'

// ── Public types ──────────────────────────────────────────────────────────────

export interface LiveSimDescriptor {
  id: string
  name: string
  initials?: string
  accent?: string
  photoUrl?: string
}

export interface LiveObservation {
  text: string                        // observation text (matches SimObservation.text from server)
  sentiment?: string | null
  severity?: string | null
  suggestedBug?: { title?: string } | null
}

export interface KlavitySimsAPI {
  /** Mount the dock. simIds="all" shows every sim in the `sims` list. */
  deploy(simIds: string[] | 'all', sims?: LiveSimDescriptor[]): void
  /** Show a speech bubble from the named Sim with one or more observations. */
  renderFeedback(simId: string, simName: string, observations: LiveObservation[]): void
  /** Tear down the dock and all bubbles. */
  undeploy(): void
}

// ── Internal state ────────────────────────────────────────────────────────────

const HOST_ID = 'klav-sims-live'
let hostEl: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let dockEl: HTMLElement | null = null
/** Aborts global listeners (Escape key, etc.) created on deploy. */
let deployAbort: AbortController | null = null

interface SimSlot {
  avatarEl: HTMLElement
  accent: string
  /** Cancels the in-flight bubble (timer + dismiss). */
  clearBubble: (() => void) | null
}
const simSlots = new Map<string, SimSlot>()

// ── CSS ───────────────────────────────────────────────────────────────────────

const DOCK_CSS = `
  :host { all: initial; font-family: system-ui, -apple-system, sans-serif; }

  /* ── Live-announcer (visually hidden, aria-live reads) ── */
  .ksl-live {
    position: absolute;
    width: 1px; height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* ── Dock — wraps upward when many Sims are present ── */
  .ksl-dock {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap-reverse;   /* extra Sims stack above, not below */
    justify-content: flex-end;
    align-items: flex-end;
    gap: 12px;
    max-width: min(380px, calc(100vw - 32px));
    pointer-events: auto;
  }

  /* ── Jump-up entrance per Sim ── */
  @keyframes ksl-jumpin {
    0%   { transform: translateY(72px) scale(.65); opacity: 0; }
    55%  { transform: translateY(-12px) scale(1.08); opacity: 1; }
    75%  { transform: translateY(5px) scale(.96); }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }
  .ksl-slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: default;
    animation: ksl-jumpin .58s cubic-bezier(.34,1.36,.64,1) both;
    animation-delay: calc(var(--ksl-idx, 0) * 68ms);
    pointer-events: auto;
  }

  /* ── Speech bubble — homepage roaming-Sim style ── */
  @keyframes ksl-bubble-in {
    from { transform: translateY(10px) scale(.88); opacity: 0; }
    to   { transform: translateY(0)    scale(1);   opacity: 1; }
  }
  @keyframes ksl-bubble-out {
    from { transform: translateY(0)    scale(1);   opacity: 1; }
    to   { transform: translateY(-8px) scale(.9);  opacity: 0; }
  }

  .ksl-bubble {
    position: absolute;
    bottom: calc(100% + 12px);
    right: 0;
    width: 196px;
    /* Warm dark glass surface with persona accent glow at top */
    background: linear-gradient(160deg, rgba(30,24,18,.97), rgba(21,17,13,.99));
    border: 1px solid #3d3730;
    border-left-width: 3px;           /* overridden per-bubble with persona colour */
    border-radius: 13px;
    padding: 10px 12px 10px 11px;
    box-shadow:
      0 20px 48px rgba(0,0,0,.6),
      0 6px 18px rgba(0,0,0,.35),
      inset 0 1px 0 rgba(255,255,255,.06);
    -webkit-backdrop-filter: blur(10px) saturate(130%);
    backdrop-filter: blur(10px) saturate(130%);
    pointer-events: auto;
    animation: ksl-bubble-in .3s cubic-bezier(.34,1.36,.64,1) both;
    z-index: 10;
  }
  .ksl-bubble.is-out {
    pointer-events: none;
    animation: ksl-bubble-out .22s ease-in both;
  }

  /* Tail — aligns with the Sim head below the bubble's bottom-right */
  .ksl-bubble::after {
    content: '';
    position: absolute;
    bottom: -8px;
    right: 14px;
    border: 7px solid transparent;
    border-top-color: #3d3730;
    border-bottom: none;
    pointer-events: none;
  }
  .ksl-bubble::before {
    content: '';
    position: absolute;
    bottom: -6px;
    right: 15px;
    border: 6px solid transparent;
    border-top-color: #1e1812;
    border-bottom: none;
    z-index: 1;
    pointer-events: none;
  }

  /* Sim name tag — monospace, homepage sp-tag style */
  .ksl-b-tag {
    font-family: ui-monospace, 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: .08em;
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* colour set inline via style.color = accent */
  }

  /* Severity pill */
  .ksl-b-sev {
    display: inline-block;
    font-family: ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: .05em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 4px;
    margin-left: 6px;
    vertical-align: middle;
    background: rgba(233,79,55,.22);
    color: #e8849a;
  }
  .ksl-b-sev.sev-medium { background: rgba(244,169,60,.2);   color: #e8a24a; }
  .ksl-b-sev.sev-low    { background: rgba(127,209,196,.15); color: #7fd1c4; }

  /* Observation text */
  .ksl-b-obs {
    font-size: 12.5px;
    line-height: 1.46;
    color: #d8d0c8;
  }

  /* "+N more" footer */
  .ksl-b-more {
    font-size: 11px;
    color: #6e6560;
    margin-top: 5px;
    font-style: italic;
  }

  /* Dismiss (✕) button */
  .ksl-b-close {
    position: absolute;
    top: 6px; right: 7px;
    background: none;
    border: none;
    cursor: pointer;
    color: #6e6560;
    font-size: 13px;
    line-height: 1;
    padding: 2px 3px;
    border-radius: 4px;
    pointer-events: auto;
    transition: color .15s, background .15s;
  }
  .ksl-b-close:hover { color: #f5f3ee; background: rgba(255,255,255,.08); }
  .ksl-b-close:focus-visible {
    outline: 2px solid #8b5cf6;
    outline-offset: 2px;
  }

  /* Close-all ✕ badge revealed on dock hover */
  .ksl-close-all {
    position: absolute;
    top: -10px; left: -10px;
    width: 20px; height: 20px;
    border-radius: 50%;
    background: #1e1812;
    border: 1px solid #3d3730;
    color: #8a8276;
    font-size: 11px;
    display: grid;
    place-items: center;
    cursor: pointer;
    pointer-events: auto;
    opacity: 0;
    transition: opacity .2s, color .15s;
    z-index: 20;
  }
  .ksl-dock:hover .ksl-close-all,
  .ksl-close-all:focus-visible { opacity: 1; }
  .ksl-close-all:hover { color: #f5f3ee; }
  .ksl-close-all:focus-visible {
    outline: 2px solid #8b5cf6;
    outline-offset: 2px;
  }

  /* ── Responsive: narrow viewports (≤ 480px) ── */
  @media (max-width: 480px) {
    .ksl-dock {
      max-width: calc(100vw - 24px);
      gap: 8px;
    }
    .ksl-bubble {
      width: min(172px, calc(100vw - 44px));
      font-size: 12px;
    }
  }

  /* Respect reduced-motion preference */
  @media (prefers-reduced-motion: reduce) {
    .ksl-slot, .ksl-bubble, .ksl-bubble.is-out { animation: none !important; }
    .ksl-slot { opacity: 1; transform: none; }
    .ksl-bubble { opacity: 1; transform: none; }
  }
`

// ── Shadow host setup ─────────────────────────────────────────────────────────

function ensureHost(): ShadowRoot {
  if (hostEl && shadowRoot) return shadowRoot
  hostEl = document.createElement('div')
  hostEl.id = HOST_ID
  hostEl.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;'
  shadowRoot = hostEl.attachShadow({ mode: 'open' })
  injectSimStyles(shadowRoot)
  const style = document.createElement('style')
  style.textContent = DOCK_CSS
  shadowRoot.appendChild(style)
  document.body.appendChild(hostEl)
  return shadowRoot
}

// ── Deploy ────────────────────────────────────────────────────────────────────

function deploy(simIds: string[] | 'all', sims: LiveSimDescriptor[] = []): void {
  if (typeof document === 'undefined') return  // SSR / Node — no-op
  undeploy()

  const shadow = ensureHost()
  deployAbort = new AbortController()

  // Escape key undeploys the dock (convenience + a11y)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') undeploy() },
    { signal: deployAbort.signal })

  // Live announcer — screen readers read new feedback via this region
  const liveAnnouncer = document.createElement('div')
  liveAnnouncer.className = 'ksl-live'
  liveAnnouncer.setAttribute('aria-live', 'polite')
  liveAnnouncer.setAttribute('aria-atomic', 'true')
  liveAnnouncer.id = 'ksl-announcer'
  shadow.appendChild(liveAnnouncer)

  // Dock
  dockEl = document.createElement('div')
  dockEl.className = 'ksl-dock'
  dockEl.setAttribute('role', 'region')
  dockEl.setAttribute('aria-label', 'Sims — live feedback')
  shadow.appendChild(dockEl)

  // Close-all badge (revealed on dock hover)
  const closeAll = document.createElement('button')
  closeAll.className = 'ksl-close-all'
  closeAll.title = 'Stop Sim reviews'
  closeAll.setAttribute('aria-label', 'Stop all Sim reviews')
  closeAll.textContent = '✕'
  closeAll.addEventListener('click', undeploy)
  dockEl.appendChild(closeAll)

  const visibleSims = simIds === 'all'
    ? sims
    : sims.filter((s) => (simIds as string[]).includes(s.id))

  if (visibleSims.length === 0) {
    console.warn('[KlavitySims] deploy() called with an empty sims list — dock not mounted. Pass sims descriptors as the second argument.')
    undeploy()
    return
  }

  // Cap at 8 visible Sims; wrap-reverse CSS handles the 2-row stacking
  const shown = visibleSims.slice(0, 8)

  shown.forEach((sim, idx) => {
    const slot = document.createElement('div')
    slot.className = 'ksl-slot'
    slot.dataset.simId = sim.id
    slot.setAttribute('aria-label', sim.name)
    // CSS variable drives the staggered jump-in delay without nth-child hardcoding
    slot.style.setProperty('--ksl-idx', String(idx))

    // Responsive: smaller avatars on narrow viewports via JS (CSS @media can't resize SimProps)
    const size = window.innerWidth <= 480 ? 38 : 46
    const props: SimProps = {
      name: sim.name,
      initials: sim.initials,
      photoUrl: sim.photoUrl,
      color: sim.accent || '#6366f1',
      animate: true,
      legs: true,
      size,
    }
    slot.appendChild(createSim(props))
    dockEl!.appendChild(slot)
    simSlots.set(sim.id, {
      avatarEl: slot,
      accent: sim.accent || '#6366f1',
      clearBubble: null,
    })
  })
}

// ── renderFeedback ────────────────────────────────────────────────────────────

function renderFeedback(simId: string, simName: string, observations: LiveObservation[]): void {
  if (!dockEl || !shadowRoot) return
  const slot = simSlots.get(simId)
  if (!slot) {
    console.warn(`[KlavitySims] renderFeedback: simId "${simId}" not in dock — deploy() first or check simId matches.`)
    return
  }

  // Dismiss any existing bubble for this Sim before showing a new one
  slot.clearBubble?.()

  if (!observations.length) return

  const first = observations[0]
  const extraCount = observations.length - 1

  // Announce to screen readers via the aria-live region
  const announcer = shadowRoot.getElementById('ksl-announcer')
  if (announcer) {
    announcer.textContent = ''
    // Toggling forces a re-announcement if the same Sim fires again
    requestAnimationFrame(() => {
      announcer.textContent = `${simName}: ${first.text || ''}${extraCount > 0 ? ` (and ${extraCount} more)` : ''}`
    })
  }

  // ── Bubble ────────────────────────────────────────────────────────────────
  const bubble = document.createElement('div')
  bubble.className = 'ksl-bubble'
  bubble.setAttribute('role', 'status')
  bubble.setAttribute('aria-label', `Feedback from ${simName}`)
  // Persona-coloured left accent bar — like the homepage speech bubble personality stripe
  bubble.style.borderLeftColor = slot.accent

  // Dismiss button
  const closeBtn = document.createElement('button')
  closeBtn.className = 'ksl-b-close'
  closeBtn.setAttribute('aria-label', `Dismiss feedback from ${simName}`)
  closeBtn.textContent = '✕'

  // Sim name tag (monospace, homepage .sp-tag style)
  const tag = document.createElement('div')
  tag.className = 'ksl-b-tag'
  tag.style.color = slot.accent
  tag.textContent = simName   // textContent — safe against LLM-injected markup

  // Severity badge (if applicable)
  if (first.severity && first.severity !== 'none') {
    const sev = document.createElement('span')
    const sevClass = first.severity === 'medium' ? ' sev-medium'
                   : first.severity === 'low'    ? ' sev-low'
                   : ''
    sev.className = `ksl-b-sev${sevClass}`
    sev.textContent = first.severity
    sev.setAttribute('aria-label', `Severity: ${first.severity}`)
    tag.appendChild(sev)
  }

  // Observation text — textContent only (XSS guard on LLM output)
  const obsEl = document.createElement('div')
  obsEl.className = 'ksl-b-obs'
  obsEl.textContent = first.text || ''

  bubble.appendChild(closeBtn)
  bubble.appendChild(tag)
  bubble.appendChild(obsEl)

  if (extraCount > 0) {
    const more = document.createElement('div')
    more.className = 'ksl-b-more'
    more.textContent = `+${extraCount} more observation${extraCount > 1 ? 's' : ''}`
    bubble.appendChild(more)
  }

  slot.avatarEl.appendChild(bubble)

  // ── Dismiss logic ─────────────────────────────────────────────────────────
  let dismissed = false
  const dismiss = () => {
    if (dismissed) return
    dismissed = true
    clearTimeout(timer)
    bubble.classList.add('is-out')
    setTimeout(() => bubble.remove(), 240)
    if (simSlots.get(simId)?.clearBubble === clear) {
      simSlots.get(simId)!.clearBubble = null
    }
  }

  const timer = setTimeout(dismiss, 14_000)
  const clear = () => { clearTimeout(timer); dismiss() }
  closeBtn.addEventListener('click', clear)
  slot.clearBubble = clear
}

// ── Undeploy ──────────────────────────────────────────────────────────────────

function undeploy(): void {
  // Cancel all in-flight bubble timers before removing DOM
  simSlots.forEach((s) => s.clearBubble?.())
  simSlots.clear()

  // Abort global listeners (Escape key, etc.)
  deployAbort?.abort()
  deployAbort = null

  // Remove DOM — this also garbage-collects remaining element-level listeners
  dockEl?.remove()
  dockEl = null
  if (hostEl) {
    hostEl.remove()
    hostEl = null
    shadowRoot = null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const SimsLive: KlavitySimsAPI = { deploy, renderFeedback, undeploy }

/**
 * Install on window.KlavitySims. Safe to call multiple times — only installs once.
 * Called by the widget/extension bootstrap after loading this module.
 */
export function installKlavitySims(): void {
  if (typeof window === 'undefined') return  // SSR / Node / service-worker — no-op
  if ((window as any).KlavitySims) return
  ;(window as any).KlavitySims = SimsLive
}

// Auto-install when loaded as a side-effecting module (browser only)
if (typeof window !== 'undefined') installKlavitySims()
