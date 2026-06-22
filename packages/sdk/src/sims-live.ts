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
 *   deploy(simIds, sims?)        — Mount the dock; show the given Sims (or "all").
 *   setReviewing(reviewing)      — Dev 4 calls true/false before/after each review.
 *   renderFeedback(...)          — Make a Sim pop up and show its observations.
 *   undeploy()                   — Tear down the dock entirely.
 *
 * Dev split:
 *   THIS FILE  → presence UI + window.KlavitySims API
 *   Dev 4      → DOM/scroll watch engine: calls setReviewing() + renderFeedback()
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
  /** Mount the dock. simIds="all" shows every Sim in the `sims` list. */
  deploy(simIds: string[] | 'all', sims?: LiveSimDescriptor[]): void
  /**
   * Signal that a review is in flight (Dev 4 calls this before/after each capture+POST).
   * When true, each avatar shows a pulsing accent ring — "thinking" state.
   * When false, the ring is removed and Sims return to idle.
   */
  setReviewing(reviewing: boolean): void
  /** Show a speech bubble from the named Sim with one or more observations. */
  renderFeedback(simId: string, simName: string, observations: LiveObservation[]): void
  /** Tear down the dock and all bubbles cleanly. */
  undeploy(): void
}

// ── Internal state ────────────────────────────────────────────────────────────

const HOST_ID = 'klav-sims-live'
let hostEl: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let dockEl: HTMLElement | null = null
/** Aborts global listeners (Escape key) created on deploy. */
let deployAbort: AbortController | null = null

interface SimSlot {
  /** The .ksl-slot wrapper element. */
  avatarEl: HTMLElement
  /** Persona colour — used for thinking ring + bubble left bar. */
  accent: string
  /** Cancel the active bubble (clears timer, triggers exit animation). */
  clearBubble: (() => void) | null
}
const simSlots = new Map<string, SimSlot>()

// ── CSS ───────────────────────────────────────────────────────────────────────

const DOCK_CSS = `
  :host { all: initial; font-family: system-ui, -apple-system, sans-serif; }

  /* ── Visually-hidden live announcer for screen readers ── */
  .ksl-sr {
    position: absolute;
    width: 1px; height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    pointer-events: none;
  }

  /* ── Dock ── */
  /*
   * flex-wrap: wrap-reverse stacks overflow rows ABOVE the first row, so the
   * dock always grows upward — keeps Sims visually anchored to the bottom-right.
   * justify-content: flex-end right-aligns each row so new Sims fill in from
   * the right, matching the corner-anchor feel.
   */
  .ksl-dock {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap-reverse;
    justify-content: flex-end;
    align-items: flex-end;
    gap: 10px;
    max-width: min(400px, calc(100vw - 32px));
    pointer-events: auto;
    /* Tight visual row-gap when Sims wrap into two rows */
    row-gap: 6px;
  }

  /* ── Jump-up entrance per Sim (staggered via --ksl-idx) ── */
  @keyframes ksl-jumpin {
    0%   { transform: translateY(80px) scale(.6);  opacity: 0; }
    52%  { transform: translateY(-14px) scale(1.1); opacity: 1; }
    72%  { transform: translateY(6px)  scale(.95); }
    88%  { transform: translateY(-2px) scale(1.01); }
    100% { transform: translateY(0)   scale(1);    opacity: 1; }
  }
  .ksl-slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: default;
    animation: ksl-jumpin .62s cubic-bezier(.34,1.36,.64,1) both;
    animation-delay: calc(var(--ksl-idx, 0) * 72ms);
    pointer-events: auto;
  }

  /* ── "Watching…" idle label — shown before first feedback ── */
  /*
   * Pulsing "watching…" text sits below each Sim avatar so the dock isn't
   * just floating circles with no affordance. Hidden while a bubble is active
   * (ksl-has-bubble) or while the Sim is thinking (ksl-thinking).
   */
  .ksl-idle {
    font-family: ui-monospace, 'JetBrains Mono', monospace;
    font-size: 8.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: rgba(255,255,255,.25);
    margin-top: 3px;
    white-space: nowrap;
    opacity: 1;
    transition: opacity .3s ease;
    animation: ksl-idle-breathe 2.8s ease-in-out infinite;
    pointer-events: none;
    user-select: none;
  }
  @keyframes ksl-idle-breathe {
    0%, 100% { opacity: .45; }
    50%       { opacity: .85; }
  }
  /* Hide "watching…" while a bubble is active or Sim is thinking */
  .ksl-slot.ksl-has-bubble .ksl-idle,
  .ksl-slot.ksl-thinking   .ksl-idle { opacity: 0 !important; animation: none; }

  /* ── Thinking / analyzing state ── */
  /*
   * While Dev 4 has a review in flight, setReviewing(true) adds .ksl-thinking
   * to every slot. A pulsing accent ring replaces the avatar's default shadow,
   * giving clear feedback that analysis is happening — like a "loading" ring.
   * The --ksl-accent custom property is set per-slot in JS so each Sim's ring
   * matches its personal colour.
   */
  @keyframes ksl-thinking-ring {
    0%, 100% {
      box-shadow:
        0 8px 22px -6px rgba(0,0,0,.7),
        0 0 0 2px var(--ksl-accent, #6366f1),
        0 0 10px rgba(99,102,241,.3);
    }
    50% {
      box-shadow:
        0 8px 22px -6px rgba(0,0,0,.7),
        0 0 0 3.5px var(--ksl-accent, #6366f1),
        0 0 22px rgba(99,102,241,.6);
    }
  }
  .ksl-slot.ksl-thinking .ksim-head {
    animation: ksl-thinking-ring 1.35s ease-in-out infinite !important;
  }

  /* ── Speech bubble ── */
  /*
   * Anchored to bottom:100%+gap above the slot, right-aligned to the slot edge.
   * transform-origin: bottom center means the spring animation pops FROM the
   * Sim's head upward — matching the homepage roaming-Sim speech bubble feel.
   */
  .ksl-bubble {
    position: absolute;
    bottom: calc(100% + 10px);
    right: 0;
    width: 200px;
    transform-origin: bottom center;
    /* Warm dark glass — homepage .sim .speech style */
    background: linear-gradient(168deg, rgba(28,22,16,.97) 0%, rgba(18,14,10,.99) 100%);
    border: 1px solid #3a332b;
    border-left-width: 3px;       /* set to persona accent in JS */
    border-radius: 13px;
    padding: 10px 30px 10px 11px; /* right padding makes room for close btn */
    box-shadow:
      0 20px 52px rgba(0,0,0,.65),
      0 6px 20px rgba(0,0,0,.4),
      inset 0 1px 0 rgba(255,255,255,.07);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    backdrop-filter: blur(12px) saturate(140%);
    pointer-events: auto;
    z-index: 10;
    /* Enter animation */
    animation: ksl-bubble-in .32s cubic-bezier(.34,1.36,.64,1) both;
  }

  @keyframes ksl-bubble-in {
    0%   { transform: translateY(18px) scale(.78); opacity: 0; }
    58%  { transform: translateY(-4px)  scale(1.04); opacity: 1; }
    80%  { transform: translateY(2px)   scale(.98); }
    100% { transform: translateY(0)     scale(1);   opacity: 1; }
  }
  @keyframes ksl-bubble-out {
    0%   { transform: translateY(0)     scale(1);   opacity: 1; }
    100% { transform: translateY(-10px) scale(.88); opacity: 0; }
  }

  .ksl-bubble.is-out {
    pointer-events: none;
    animation: ksl-bubble-out .24s ease-in forwards;
  }

  /* Tail — double-layer for crisp edge, pointing down toward the Sim head */
  .ksl-bubble::after {
    content: '';
    position: absolute;
    bottom: -8px;
    right: 16px;
    border: 7px solid transparent;
    border-top-color: #3a332b;
    border-bottom: none;
    pointer-events: none;
  }
  .ksl-bubble::before {
    content: '';
    position: absolute;
    bottom: -6px;
    right: 17px;
    border: 6px solid transparent;
    border-top-color: #1c1610;
    border-bottom: none;
    z-index: 1;
    pointer-events: none;
  }

  /* Monospace name tag — homepage .sim .speech .sp-tag style */
  .ksl-b-tag {
    font-family: ui-monospace, 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: .09em;
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* accent colour set inline */
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
    margin-left: 7px;
    vertical-align: middle;
    background: rgba(233,79,55,.22);
    color: #e8849a;
  }
  .ksl-b-sev.sev-medium { background: rgba(244,169,60,.2);   color: #e8a24a; }
  .ksl-b-sev.sev-low    { background: rgba(127,209,196,.15); color: #7fd1c4; }

  /* Observation body text */
  .ksl-b-obs {
    font-size: 12.5px;
    line-height: 1.47;
    color: #cec6bd;
  }

  /* "+N more" count */
  .ksl-b-more {
    font-size: 11px;
    color: #5e5852;
    margin-top: 5px;
    font-style: italic;
  }

  /* Dismiss button — top-right corner of bubble */
  .ksl-b-close {
    position: absolute;
    top: 7px; right: 8px;
    background: none;
    border: none;
    cursor: pointer;
    color: #5e5852;
    font-size: 13px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    pointer-events: auto;
    transition: color .15s, background .15s;
  }
  .ksl-b-close:hover   { color: #f5f3ee; background: rgba(255,255,255,.1); }
  .ksl-b-close:focus-visible {
    outline: 2px solid #8b5cf6;
    outline-offset: 2px;
  }

  /* ── Close-all badge — revealed on dock hover ── */
  .ksl-close-all {
    position: absolute;
    top: -10px; left: -10px;
    width: 20px; height: 20px;
    border-radius: 50%;
    background: #1a1510;
    border: 1px solid #3a332b;
    color: #7a7268;
    font-size: 11px;
    display: grid;
    place-items: center;
    cursor: pointer;
    pointer-events: auto;
    opacity: 0;
    transition: opacity .2s, color .15s, background .15s;
    z-index: 20;
  }
  .ksl-dock:hover .ksl-close-all { opacity: 1; }
  .ksl-close-all:hover   { color: #f5f3ee; background: #2a2218; }
  .ksl-close-all:focus-visible {
    opacity: 1;
    outline: 2px solid #8b5cf6;
    outline-offset: 2px;
  }

  /* ── Responsive: narrow viewports ── */
  @media (max-width: 480px) {
    .ksl-dock { max-width: calc(100vw - 24px); gap: 7px; }
    .ksl-bubble { width: min(180px, calc(100vw - 40px)); font-size: 12px; }
  }

  /* ── Reduced-motion: disable all animations ── */
  @media (prefers-reduced-motion: reduce) {
    .ksl-slot                    { animation: none !important; opacity: 1; transform: none; }
    .ksl-slot.ksl-thinking .ksim-head { animation: none !important; }
    .ksl-idle                    { animation: none !important; opacity: .6; }
    .ksl-bubble, .ksl-bubble.is-out { animation: none !important; opacity: 1; transform: none; }
  }
`

// ── Shadow host ───────────────────────────────────────────────────────────────

function ensureHost(): ShadowRoot {
  if (hostEl && shadowRoot) return shadowRoot
  hostEl = document.createElement('div')
  hostEl.id = HOST_ID
  hostEl.style.cssText =
    'position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;'
  shadowRoot = hostEl.attachShadow({ mode: 'open' })
  injectSimStyles(shadowRoot)
  const style = document.createElement('style')
  style.textContent = DOCK_CSS
  shadowRoot.appendChild(style)
  document.body.appendChild(hostEl)
  return shadowRoot
}

// ── deploy() ─────────────────────────────────────────────────────────────────

function deploy(simIds: string[] | 'all', sims: LiveSimDescriptor[] = []): void {
  if (typeof document === 'undefined') return   // SSR / Node guard
  undeploy()                                     // clean slate before re-mounting

  const shadow = ensureHost()
  deployAbort = new AbortController()

  // Escape key undeploys (convenience + a11y)
  document.addEventListener(
    'keydown',
    (e) => { if (e.key === 'Escape') undeploy() },
    { signal: deployAbort.signal },
  )

  // Visually-hidden aria-live region — announces feedback to screen readers
  const announcer = document.createElement('div')
  announcer.className = 'ksl-sr'
  announcer.id = 'ksl-announcer'
  announcer.setAttribute('aria-live', 'polite')
  announcer.setAttribute('aria-atomic', 'true')
  shadow.appendChild(announcer)

  // Dock container
  dockEl = document.createElement('div')
  dockEl.className = 'ksl-dock'
  dockEl.setAttribute('role', 'region')
  dockEl.setAttribute('aria-label', 'Sims — live feedback')
  shadow.appendChild(dockEl)

  // Close-all badge (revealed on hover, keyboard-focusable)
  const closeAll = document.createElement('button')
  closeAll.className = 'ksl-close-all'
  closeAll.setAttribute('aria-label', 'Stop all Sim reviews')
  closeAll.title = 'Stop Sim reviews'
  closeAll.textContent = '✕'
  closeAll.addEventListener('click', undeploy)
  dockEl.appendChild(closeAll)

  const visibleSims = simIds === 'all'
    ? sims
    : sims.filter((s) => (simIds as string[]).includes(s.id))

  if (visibleSims.length === 0) {
    console.warn('[KlavitySims] deploy() called with no matching sims — dock not mounted. '
      + 'Pass sims descriptors as the second argument or ensure simIds match.')
    undeploy()
    return
  }

  // Cap at 8 visible Sims; wrap-reverse CSS stacks overflow rows above the first
  const shown = visibleSims.slice(0, 8)

  shown.forEach((sim, idx) => {
    const accent = sim.accent || '#6366f1'

    const slot = document.createElement('div')
    slot.className = 'ksl-slot'
    slot.dataset.simId = sim.id
    slot.setAttribute('aria-label', sim.name)
    // CSS var drives staggered jump-in delay (avoids brittle :nth-child rules)
    slot.style.setProperty('--ksl-idx', String(idx))
    // Per-slot accent var for the thinking-ring animation
    slot.style.setProperty('--ksl-accent', accent)

    // Sim avatar — smaller on narrow viewports (CSS @media can't change SimProps)
    const size = (typeof window !== 'undefined' && window.innerWidth <= 480) ? 38 : 46
    const props: SimProps = {
      name: sim.name,
      initials: sim.initials,
      photoUrl: sim.photoUrl,
      color: accent,
      animate: true,
      legs: true,
      size,
    }
    slot.appendChild(createSim(props))

    // "watching…" idle label — visible before first feedback or between bubbles
    const idle = document.createElement('span')
    idle.className = 'ksl-idle'
    idle.textContent = 'watching'
    idle.setAttribute('aria-hidden', 'true')
    slot.appendChild(idle)

    dockEl!.appendChild(slot)
    simSlots.set(sim.id, { avatarEl: slot, accent, clearBubble: null })
  })
}

// ── setReviewing() ────────────────────────────────────────────────────────────

function setReviewing(reviewing: boolean): void {
  if (!dockEl) return
  simSlots.forEach(({ avatarEl }) => {
    avatarEl.classList.toggle('ksl-thinking', reviewing)
  })
}

// ── renderFeedback() ──────────────────────────────────────────────────────────

function renderFeedback(
  simId: string,
  simName: string,
  observations: LiveObservation[],
): void {
  if (!dockEl || !shadowRoot) return
  const slot = simSlots.get(simId)
  if (!slot) {
    console.warn(`[KlavitySims] renderFeedback: simId "${simId}" not in dock — deploy() first or check simId matches.`)
    return
  }

  // Dismiss any existing bubble before showing a new one
  slot.clearBubble?.()

  if (!observations.length) return

  const first = observations[0]
  const extraCount = observations.length - 1

  // Update the aria-live announcer (empty then refill forces re-announcement)
  const announcer = shadowRoot.getElementById('ksl-announcer')
  if (announcer) {
    announcer.textContent = ''
    requestAnimationFrame(() => {
      if (!shadowRoot) return
      const a = shadowRoot.getElementById('ksl-announcer')
      if (a) {
        a.textContent = `${simName}: ${first.text || ''}${
          extraCount > 0 ? ` and ${extraCount} more` : ''
        }`
      }
    })
  }

  // ── Build the bubble ──────────────────────────────────────────────────────

  const bubble = document.createElement('div')
  bubble.className = 'ksl-bubble'
  bubble.setAttribute('role', 'status')
  bubble.setAttribute('aria-label', `Feedback from ${simName}`)
  // Persona-coloured left stripe — homepage speech-bubble identity marker
  bubble.style.borderLeftColor = slot.accent

  // Dismiss button
  const closeBtn = document.createElement('button')
  closeBtn.className = 'ksl-b-close'
  closeBtn.setAttribute('aria-label', `Dismiss feedback from ${simName}`)
  closeBtn.textContent = '✕'

  // Name tag — monospace, accent colour, homepage .sp-tag style
  const tag = document.createElement('div')
  tag.className = 'ksl-b-tag'
  tag.style.color = slot.accent
  // textContent throughout — LLM output must never reach innerHTML
  tag.textContent = simName

  // Severity badge
  if (first.severity && first.severity !== 'none') {
    const sevClass =
      first.severity === 'medium' ? ' sev-medium' :
      first.severity === 'low'    ? ' sev-low'    : ''
    const sev = document.createElement('span')
    sev.className = `ksl-b-sev${sevClass}`
    sev.setAttribute('aria-label', `Severity: ${first.severity}`)
    sev.textContent = first.severity
    tag.appendChild(sev)
  }

  // Observation text
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
  // Show has-bubble class → hides the "watching…" idle label
  slot.avatarEl.classList.add('ksl-has-bubble')

  // ── Dismiss logic ─────────────────────────────────────────────────────────

  let dismissed = false
  const dismiss = () => {
    if (dismissed) return
    dismissed = true
    clearTimeout(autoTimer)
    bubble.classList.add('is-out')
    // Remove from DOM after exit animation completes (24ms padding over 0.24s animation)
    setTimeout(() => {
      bubble.remove()
      // Restore idle label once bubble is fully gone
      if (simSlots.get(simId)?.clearBubble == null) {
        slot.avatarEl.classList.remove('ksl-has-bubble')
      }
    }, 265)
    // Clear the slot reference only if this is still the registered clear fn
    if (simSlots.get(simId)?.clearBubble === clearFn) {
      simSlots.get(simId)!.clearBubble = null
    }
  }

  const autoTimer = setTimeout(dismiss, 14_000)
  const clearFn = () => { clearTimeout(autoTimer); dismiss() }

  closeBtn.addEventListener('click', clearFn)
  slot.clearBubble = clearFn
}

// ── undeploy() ────────────────────────────────────────────────────────────────

function undeploy(): void {
  // 1. Cancel all in-flight bubble timers (prevents orphaned setTimeout callbacks)
  simSlots.forEach((s) => {
    if (s.clearBubble) {
      s.clearBubble()
      s.clearBubble = null
    }
  })
  simSlots.clear()

  // 2. Abort global listeners (Escape key, etc.)
  deployAbort?.abort()
  deployAbort = null

  // 3. Remove dock element
  dockEl?.remove()
  dockEl = null

  // 4. Remove the entire shadow host — this implicitly removes the announcer,
  //    all slots, all bubbles, and their element-level listeners.
  if (hostEl) {
    hostEl.remove()
    hostEl = null
    shadowRoot = null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const SimsLive: KlavitySimsAPI = { deploy, setReviewing, renderFeedback, undeploy }

/**
 * Install on window.KlavitySims. Safe to call multiple times — only installs once.
 * No-ops in SSR / service-worker contexts.
 */
export function installKlavitySims(): void {
  if (typeof window === 'undefined') return
  if ((window as any).KlavitySims) return
  ;(window as any).KlavitySims = SimsLive
}

// Auto-install when loaded as a side-effecting module (browser only)
if (typeof window !== 'undefined') installKlavitySims()
