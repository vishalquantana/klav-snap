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

import { createSim, injectSimStyles, emotionFromSentiment, type SimProps } from '@klavity/core/sim'

// ── Public types ──────────────────────────────────────────────────────────────

export interface LiveSimDescriptor {
  id: string
  name: string
  initials?: string
  accent?: string
  photoUrl?: string
}

export interface LiveObservation {
  observation: string
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

// simId → { avatar el, bubble queue }
const simSlots = new Map<string, { avatarEl: HTMLElement; clearBubble: (() => void) | null }>()

// ── Shadow host setup ─────────────────────────────────────────────────────────

function ensureHost(): { host: HTMLElement; shadow: ShadowRoot } {
  if (hostEl && shadowRoot) return { host: hostEl, shadow: shadowRoot }
  hostEl = document.createElement('div')
  hostEl.id = HOST_ID
  // Fixed bottom-right, above everything.
  hostEl.style.cssText =
    'position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;'
  shadowRoot = hostEl.attachShadow({ mode: 'open' })
  injectSimStyles(shadowRoot)
  injectDockStyles(shadowRoot)
  document.body.appendChild(hostEl)
  return { host: hostEl, shadow: shadowRoot }
}

function injectDockStyles(root: ShadowRoot): void {
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }

    /* Dock — row of Sims, bottom-right */
    .ksl-dock {
      display: flex;
      flex-direction: row;
      align-items: flex-end;
      gap: 14px;
      pointer-events: auto;
    }

    /* Jump-up entrance animation */
    @keyframes ksl-jumpin {
      0%   { transform: translateY(80px) scale(.7); opacity: 0; }
      60%  { transform: translateY(-10px) scale(1.06); opacity: 1; }
      80%  { transform: translateY(4px) scale(.97); }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
    .ksl-slot {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      animation: ksl-jumpin .55s cubic-bezier(.34,1.36,.64,1) both;
      pointer-events: auto;
    }
    /* Stagger each Sim's entrance */
    .ksl-slot:nth-child(1) { animation-delay: 0ms; }
    .ksl-slot:nth-child(2) { animation-delay: 70ms; }
    .ksl-slot:nth-child(3) { animation-delay: 140ms; }
    .ksl-slot:nth-child(4) { animation-delay: 210ms; }
    .ksl-slot:nth-child(5) { animation-delay: 280ms; }

    /* Speech bubble — sits above the Sim head */
    @keyframes ksl-bubble-in {
      from { transform: translateY(8px) scale(.9); opacity: 0; }
      to   { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes ksl-bubble-out {
      from { transform: translateY(0) scale(1); opacity: 1; }
      to   { transform: translateY(-6px) scale(.92); opacity: 0; }
    }
    .ksl-bubble {
      position: absolute;
      bottom: calc(100% + 10px);
      right: 0;
      width: 200px;
      background: #15110d;
      color: #f5f3ee;
      border: 1px solid #3d3730;
      border-radius: 14px;
      padding: 10px 12px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12.5px;
      line-height: 1.45;
      box-shadow: 0 16px 40px rgba(0,0,0,.55), 0 4px 12px rgba(0,0,0,.3);
      pointer-events: auto;
      animation: ksl-bubble-in .28s cubic-bezier(.34,1.36,.64,1) both;
      z-index: 10;
    }
    .ksl-bubble.is-out {
      animation: ksl-bubble-out .22s ease-in both;
    }
    /* Tail */
    .ksl-bubble::after {
      content: '';
      position: absolute;
      bottom: -7px;
      right: 18px;
      border: 6px solid transparent;
      border-top-color: #3d3730;
      border-bottom: none;
    }
    .ksl-bubble::before {
      content: '';
      position: absolute;
      bottom: -6px;
      right: 19px;
      border: 5px solid transparent;
      border-top-color: #15110d;
      border-bottom: none;
      z-index: 1;
    }
    /* Bubble content */
    .ksl-b-name {
      font-weight: 700;
      font-size: 11.5px;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ksl-b-sev {
      font-family: ui-monospace, monospace;
      font-size: 9px;
      letter-spacing: .06em;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(233,79,55,.22);
      color: #e8849a;
    }
    .ksl-b-sev.sev-medium { background: rgba(244,169,60,.2); color: #e8a24a; }
    .ksl-b-sev.sev-low    { background: rgba(127,209,196,.15); color: #7fd1c4; }
    .ksl-b-obs { font-size: 12.5px; color: #d8d0c8; }
    .ksl-b-more { font-size: 11px; color: #8a8276; margin-top: 4px; }

    /* Close button */
    .ksl-b-close {
      position: absolute;
      top: 7px; right: 8px;
      background: none; border: none; cursor: pointer;
      color: #8a8276; font-size: 14px; line-height: 1; padding: 0 2px;
      pointer-events: auto;
    }
    .ksl-b-close:hover { color: #f5f3ee; }

    /* Undeploy badge on the dock (for Dev 6 right-click to wire up) */
    .ksl-close-all {
      position: absolute;
      top: -8px; left: -8px;
      width: 18px; height: 18px;
      border-radius: 50%;
      background: #2a2420;
      border: 1px solid #3d3730;
      color: #8a8276;
      font-size: 11px;
      display: grid; place-items: center;
      cursor: pointer;
      pointer-events: auto;
      opacity: 0;
      transition: opacity .2s;
    }
    .ksl-dock:hover .ksl-close-all { opacity: 1; }
  `
  root.appendChild(style)
}

// ── Deploy ────────────────────────────────────────────────────────────────────

function deploy(simIds: string[] | 'all', sims: LiveSimDescriptor[] = []): void {
  undeploy()

  const { shadow } = ensureHost()

  dockEl = document.createElement('div')
  dockEl.className = 'ksl-dock'
  shadow.appendChild(dockEl)

  // Close-all affordance (top-left of dock, revealed on hover)
  const closeAll = document.createElement('button')
  closeAll.className = 'ksl-close-all'
  closeAll.title = 'Stop Sim reviews'
  closeAll.textContent = '✕'
  closeAll.addEventListener('click', undeploy)
  dockEl.appendChild(closeAll)

  const visibleSims = simIds === 'all'
    ? sims
    : sims.filter((s) => (simIds as string[]).includes(s.id))

  // Cap at 6 visible Sims to avoid overflowing the dock
  const shown = visibleSims.slice(0, 6)

  for (const sim of shown) {
    const slot = document.createElement('div')
    slot.className = 'ksl-slot'
    slot.dataset.simId = sim.id

    const props: SimProps = {
      name: sim.name,
      initials: sim.initials,
      photoUrl: sim.photoUrl,
      color: sim.accent || '#6366f1',
      animate: true,
      legs: true,
      size: 46,
    }
    const avatar = createSim(props)
    slot.appendChild(avatar)
    dockEl.appendChild(slot)
    simSlots.set(sim.id, { avatarEl: slot, clearBubble: null })
  }
}

// ── renderFeedback ────────────────────────────────────────────────────────────

function renderFeedback(simId: string, simName: string, observations: LiveObservation[]): void {
  if (!dockEl || !shadowRoot) return
  const slot = simSlots.get(simId)
  if (!slot) return

  // Dismiss any existing bubble for this Sim
  slot.clearBubble?.()

  if (!observations.length) return

  const first = observations[0]
  const extraCount = observations.length - 1

  const bubble = document.createElement('div')
  bubble.className = 'ksl-bubble'

  // Close button
  const closeBtn = document.createElement('button')
  closeBtn.className = 'ksl-b-close'
  closeBtn.textContent = '✕'
  closeBtn.title = 'Dismiss'

  // Name + severity
  const nameRow = document.createElement('div')
  nameRow.className = 'ksl-b-name'
  // Use textContent (not innerHTML) — LLM-sourced text may be adversarial
  const nameSpan = document.createTextNode(simName)
  nameRow.appendChild(nameSpan)
  if (first.severity && first.severity !== 'none') {
    const sev = document.createElement('span')
    sev.className = 'ksl-b-sev' + (first.severity === 'medium' ? ' sev-medium' : first.severity === 'low' ? ' sev-low' : '')
    sev.textContent = first.severity
    nameRow.appendChild(sev)
  }

  // Observation text
  const obsEl = document.createElement('div')
  obsEl.className = 'ksl-b-obs'
  obsEl.textContent = first.observation || ''

  bubble.appendChild(closeBtn)
  bubble.appendChild(nameRow)
  bubble.appendChild(obsEl)

  if (extraCount > 0) {
    const more = document.createElement('div')
    more.className = 'ksl-b-more'
    more.textContent = `+${extraCount} more observation${extraCount > 1 ? 's' : ''}`
    bubble.appendChild(more)
  }

  slot.avatarEl.appendChild(bubble)

  // Auto-dismiss after 14s
  let dismissed = false
  const dismiss = () => {
    if (dismissed) return
    dismissed = true
    bubble.classList.add('is-out')
    setTimeout(() => bubble.remove(), 230)
    slot.clearBubble = null
  }

  const timer = setTimeout(dismiss, 14_000)
  closeBtn.addEventListener('click', () => { clearTimeout(timer); dismiss() })
  slot.clearBubble = () => { clearTimeout(timer); dismiss() }
}

// ── Undeploy ──────────────────────────────────────────────────────────────────

function undeploy(): void {
  simSlots.forEach((s) => s.clearBubble?.())
  simSlots.clear()
  dockEl?.remove()
  dockEl = null
  if (hostEl) { hostEl.remove(); hostEl = null; shadowRoot = null }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const SimsLive: KlavitySimsAPI = { deploy, renderFeedback, undeploy }

/**
 * Install on window.KlavitySims. Safe to call multiple times — only installs once.
 * Called by the widget/extension bootstrap after loading this module.
 */
export function installKlavitySims(): void {
  if ((window as any).KlavitySims) return
  ;(window as any).KlavitySims = SimsLive
}

// Auto-install when loaded as a side-effecting module
installKlavitySims()
