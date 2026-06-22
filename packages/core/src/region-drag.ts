// Right-click + drag to draw a rectangular region selection on the page. On release, the selected
// VIEWPORT rect ({x,y,w,h} in clientX/clientY coords) is handed to the host, which captures just that
// region and opens the bug composer with it as the default (first) screenshot.
//
// Shared by the in-page widget (packages/sdk) and the browser extension (packages/extension) so the
// gesture behaves identically across both surfaces — only the capture mechanism differs (the host owns
// onRegion). A plain right-click (no drag) shows the host's context menu via onPlainRightClick (on
// mouseup) rather than in the contextmenu event, because suppressNextMenu() returns true while the
// right button is held — allowing the host to close any existing menu at mousedown via onRightDown
// without a new menu immediately opening again.

import type { Rect } from "./crop"

export interface RegionDragHandle {
  /** True while the right button is held OR a drag just occurred → the host must NOT show its context menu. */
  suppressNextMenu(): boolean
  /** Remove all listeners + any visible selection rectangle. */
  destroy(): void
}

export interface RegionDragOptions {
  /** Called on a valid drag-release with the selected viewport rect. */
  onRegion: (rect: Rect) => void
  /** Called ONCE the moment a drag-select actually begins (movement passes the threshold). The host uses
   *  this to dismiss its context menu immediately so only the selection rectangle shows. */
  onDragStart?: () => void
  /** Called immediately on every right mousedown (after guard checks pass). The host uses this to close
   *  any open context menu before a potential drag, preventing the old menu from lingering during the
   *  drag-select overlay. Fires for both plain right-clicks and right-click-drags. */
  onRightDown?: () => void
  /** Called on mouseup when the right button was released with NO drag (a plain right-click). The host
   *  shows its context menu here instead of in the contextmenu event, because suppressNextMenu() returns
   *  true while pressing and the contextmenu event is fired before we know intent. */
  onPlainRightClick?: (x: number, y: number) => void
  /** Ignore presses whose target is the host's own UI (launcher/menu/composer/overlay). */
  isOwnTarget?: (e: MouseEvent) => boolean
  /** Skip the gesture entirely right now (e.g. the extension yields when the in-page widget is present). */
  shouldIgnore?: () => boolean
  /** Where to mount the selection rectangle (default document.body). A shadow root isolates it from page CSS. */
  mount?: HTMLElement | ShadowRoot
  /** Pixels of movement before a press becomes a drag (default 6). */
  threshold?: number
  /** Minimum rect size, in px, to count as a region capture (default 8). */
  minSize?: number
}

export function installRegionDrag(opts: RegionDragOptions): RegionDragHandle {
  const threshold = opts.threshold ?? 6
  const minSize = opts.minSize ?? 8

  let pressing = false
  let didDrag = false
  let justDragged = false
  let startX = 0
  let startY = 0
  let rectEl: HTMLDivElement | null = null

  const removeRect = () => { rectEl?.remove(); rectEl = null }

  const rectFrom = (ex: number, ey: number): Rect => ({
    x: Math.min(startX, ex),
    y: Math.min(startY, ey),
    w: Math.abs(ex - startX),
    h: Math.abs(ey - startY),
  })

  function onDown(e: MouseEvent) {
    if (e.button !== 2 || e.shiftKey) return                 // only plain right-button starts a region
    if (opts.shouldIgnore?.()) return
    if (opts.isOwnTarget?.(e)) return                        // don't hijack right-clicks on our own UI
    opts.onRightDown?.()  // dismiss any open menu immediately — before we know if this is a click or drag
    pressing = true
    didDrag = false
    startX = e.clientX
    startY = e.clientY
  }

  function onMove(e: MouseEvent) {
    if (!pressing) return
    if (!didDrag) {
      if (Math.abs(e.clientX - startX) < threshold && Math.abs(e.clientY - startY) < threshold) return
      didDrag = true
      opts.onDragStart?.()  // drag has begun → host dismisses its menu so only the selection shows
    }
    const r = rectFrom(e.clientX, e.clientY)
    if (!rectEl) {
      rectEl = document.createElement("div")
      // Spotlight selection: indigo outline + tint, with a dimming backdrop via a huge spread shadow.
      rectEl.style.cssText =
        "position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;border:1.5px solid #6366f1;" +
        "background:rgba(99,102,241,.12);box-shadow:0 0 0 9999px rgba(20,16,30,.30);border-radius:3px"
      ;(opts.mount ?? document.body).appendChild(rectEl)
    }
    rectEl.style.left = r.x + "px"
    rectEl.style.top = r.y + "px"
    rectEl.style.width = r.w + "px"
    rectEl.style.height = r.h + "px"
  }

  function onUp(e: MouseEvent) {
    if (!pressing) return
    pressing = false
    const r = rectFrom(e.clientX, e.clientY)
    removeRect()
    if (didDrag && r.w >= minSize && r.h >= minSize) {
      // Keep the menu suppressed for the contextmenu event that follows this mouseup.
      justDragged = true
      setTimeout(() => { justDragged = false }, 400)
      opts.onRegion(r)
    } else if (!didDrag) {
      // Plain right-click: the contextmenu event was suppressed (pressing was true), so the host shows
      // its menu here on release instead.
      opts.onPlainRightClick?.(e.clientX, e.clientY)
    }
  }

  // Capture phase so we see the gesture before page handlers; pointer-events:none on the rect keeps the
  // page interactive and the events flowing.
  document.addEventListener("mousedown", onDown, true)
  document.addEventListener("mousemove", onMove, true)
  document.addEventListener("mouseup", onUp, true)

  return {
    // pressing: contextmenu fired synchronously with mousedown on macOS — suppress until mouseup so no
    // new menu flashes during a potential drag. didDrag: mid-drag. justDragged: post-drag window.
    suppressNextMenu: () => pressing || didDrag || justDragged,
    destroy() {
      document.removeEventListener("mousedown", onDown, true)
      document.removeEventListener("mousemove", onMove, true)
      document.removeEventListener("mouseup", onUp, true)
      removeRect()
    },
  }
}
