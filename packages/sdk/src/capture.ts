// CSP/CORS-resilient screenshot capture wrapper around html-to-image's toPng.
//
// WHY: to inline a screenshot, html-to-image fetch()es every <img>/background URL to read its bytes.
// On strict-CSP customer sites (connect-src 'self'), those cross-origin fetches are blocked, which
// previously (a) made the WHOLE capture fail — blank / "0/5 images" — because a failed resource with no
// imagePlaceholder becomes '' and breaks the final SVG, and (b) flooded the console with one
// browser-emitted "Refused to connect … violates CSP" error PER image (uncatchable from JS — the only
// way to avoid them is to not fetch).
//
// FIX: skip cross-origin <img> up front (they're never fetched → no CSP spam, the image is just omitted),
// and set imagePlaceholder so any resource that still fails (same-origin hiccup, cross-origin CSS
// background image we can't pre-filter) degrades to a transparent gap instead of rejecting. The capture
// then always produces a screenshot of everything readable, and we log at most ONE summary line.

import { toPng } from "html-to-image"

// 1×1 transparent GIF — the most universally-valid tiny placeholder. Used so a blocked image renders as a
// transparent gap rather than breaking the capture.
export const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

const CAPTURE_TIMEOUT_MS = 8_000
const MAX_FALLBACK_EDGE = 4_096
const MAX_FALLBACK_PIXELS = 16_000_000
const FALLBACK_RENDER_BUDGET_MS = 500
const MAX_FALLBACK_ELEMENTS = 10_000
const EMERGENCY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4kwAAAAASUVORK5CYII="

/**
 * True when an <img> src points to a different origin than the page, so html-to-image's fetch() to inline
 * it would be blocked under a strict CSP (connect-src 'self') / CORS. data:/blob: and relative/same-origin
 * srcs are always fetchable, so they are NOT cross-origin. Pure + unit-tested.
 */
export function isCrossOriginImageSrc(src: string, pageOrigin: string): boolean {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false
  try {
    return new URL(src, pageOrigin).origin !== pageOrigin
  } catch {
    return false
  }
}

function isBlockedCrossOriginImg(node: Node): boolean {
  const el = node as HTMLImageElement
  if (!el || el.tagName !== "IMG") return false
  const src = el.currentSrc || el.src || ""
  return isCrossOriginImageSrc(src, location.origin)
}

function warn(message: string): void {
  try { console.warn(message) } catch { /* noop */ }
}

function isTransparent(color: string): boolean {
  return !color || color === "transparent" || color === "rgba(0, 0, 0, 0)"
}

/**
 * Last-resort renderer used when html-to-image rejects or stalls. It deliberately never reads image
 * bytes, so a customer page's CORS/CSP cannot taint or block the canvas. The result is less detailed than
 * html-to-image, but retains the page's layout, backgrounds, borders and text for a usable Sim review.
 */
function renderFetchFreeFallback(
  node: HTMLElement,
  filter?: (n: HTMLElement) => boolean,
  requestedPixelRatio = 1,
): string {
  try {
    const rootRect = node.getBoundingClientRect()
    const cssWidth = Math.max(1, Math.ceil(Math.max(node.scrollWidth, node.clientWidth, rootRect.width)))
    const cssHeight = Math.max(1, Math.ceil(Math.max(node.scrollHeight, node.clientHeight, rootRect.height)))
    const wantedRatio = Math.max(0.1, requestedPixelRatio)
    const edgeRatio = Math.min(MAX_FALLBACK_EDGE / cssWidth, MAX_FALLBACK_EDGE / cssHeight)
    const pixelRatio = Math.min(wantedRatio, edgeRatio, Math.sqrt(MAX_FALLBACK_PIXELS / (cssWidth * cssHeight)))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.floor(cssWidth * pixelRatio))
    canvas.height = Math.max(1, Math.floor(cssHeight * pixelRatio))
    const context = canvas.getContext("2d")
    if (!context) return EMERGENCY_PNG

    context.scale(pixelRatio, pixelRatio)
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, cssWidth, cssHeight)

    const deadline = Date.now() + FALLBACK_RENDER_BUDGET_MS
    let paintedElements = 0
    const outOfBudget = () => paintedElements >= MAX_FALLBACK_ELEMENTS || Date.now() >= deadline
    const paint = (element: HTMLElement, isRoot = false): void => {
      if (outOfBudget()) return
      paintedElements++
      if (!isRoot && filter && !filter(element)) return
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return

      const rect = element.getBoundingClientRect()
      const x = rect.left - rootRect.left
      const y = rect.top - rootRect.top
      if (rect.width > 0 && rect.height > 0) {
        if (!isTransparent(style.backgroundColor)) {
          context.fillStyle = style.backgroundColor
          context.fillRect(x, y, rect.width, rect.height)
        }

        const borderWidth = parseFloat(style.borderTopWidth)
        if (borderWidth > 0 && style.borderTopStyle !== "none" && !isTransparent(style.borderTopColor)) {
          context.strokeStyle = style.borderTopColor
          context.lineWidth = borderWidth
          context.strokeRect(x, y, rect.width, rect.height)
        }

        if (element.tagName === "IMG") {
          context.fillStyle = "#f1f5f9"
          context.fillRect(x, y, rect.width, rect.height)
          context.strokeStyle = "#cbd5e1"
          context.lineWidth = 1
          context.strokeRect(x, y, rect.width, rect.height)
        }
      }

      for (const child of Array.from(element.childNodes)) {
        if (outOfBudget()) break
        if (child instanceof HTMLElement) {
          paint(child)
          continue
        }
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue
        try {
          const range = document.createRange()
          range.selectNodeContents(child)
          const textRect = range.getBoundingClientRect()
          if (textRect.width <= 0 || textRect.height <= 0) continue
          context.save()
          context.beginPath()
          context.rect(textRect.left - rootRect.left, textRect.top - rootRect.top, textRect.width, textRect.height)
          context.clip()
          context.fillStyle = style.color
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
          context.textBaseline = "top"
          context.fillText(child.textContent.trim(), textRect.left - rootRect.left, textRect.top - rootRect.top)
          context.restore()
        } catch { /* an individual text node must not abort the screenshot */ }
      }
    }

    paint(node, true)
    const dataUrl = canvas.toDataURL("image/png")
    return dataUrl.startsWith("data:image/png") ? dataUrl : EMERGENCY_PNG
  } catch {
    return EMERGENCY_PNG
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`capture timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

/**
 * Resilient toPng: never hard-fails because an image can't be fetched. Composes the caller's filter (e.g.
 * "exclude the widget host") with a cross-origin <img> skip, and sets imagePlaceholder as a safety net.
 * Emits at most ONE summary warning naming how many images were omitted.
 */
export async function safeToPng(
  node: HTMLElement,
  opts: { filter?: (n: HTMLElement) => boolean; pixelRatio?: number } = {},
): Promise<string> {
  let skipped = 0
  const callerFilter = opts.filter
  const pixelRatio = opts.pixelRatio ?? 1
  try {
    const out = await withTimeout(toPng(node, {
      skipFonts: true,
      pixelRatio,
      imagePlaceholder: TRANSPARENT_PIXEL,
      filter: (n: HTMLElement) => {
        if (callerFilter && !callerFilter(n)) return false
        if (isBlockedCrossOriginImg(n)) { skipped++; return false }
        return true
      },
    }), CAPTURE_TIMEOUT_MS)
    if (!out.startsWith("data:image/png")) throw new Error("capture returned a non-PNG result")
    if (skipped) {
      warn(`[Klavity] capture: omitted ${skipped} cross-origin image(s) the page's CSP/CORS blocks — captured the rest`)
    }
    return out
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    warn(`[Klavity] capture: html-to-image unavailable (${reason}); using fetch-free fallback`)
    return renderFetchFreeFallback(node, callerFilter, pixelRatio)
  }
}
