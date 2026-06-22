// Pure geometry helpers for the getDisplayMedia "sharp" full-page capture (scroll-stitch). The DOM
// orchestration (getDisplayMedia, the <video>, scrolling, hiding fixed elements, drawing to canvas) lives
// in widget.ts; these are extracted so the geometry is deterministic + unit-tested. Modelled on GoFullPage.

/**
 * The ordered list of scrollY positions to step through for a full-page capture. Steps by one viewport
 * height; the FINAL position is clamped so the last frame aligns flush to the page bottom (its overlap
 * with the previous frame is simply overdrawn on the canvas, giving a seamless stitch). Always returns at
 * least [0].
 */
export function planScrollStitch(fullHeight: number, viewportHeight: number): number[] {
  if (!(viewportHeight > 0)) return [0]
  const lastTop = Math.max(0, fullHeight - viewportHeight)
  const ys: number[] = []
  let y = 0
  // hard cap on rows so a pathological (e.g. infinite-scroll) page can't loop forever
  for (let i = 0; i < 200; i++) {
    const targetY = Math.min(y, lastTop)
    ys.push(targetY)
    if (targetY >= lastTop) break
    y += viewportHeight
  }
  return ys
}

/**
 * Clamp the page height to capture so the output canvas stays within the browser's per-dimension limit
 * (~16384px in Chrome) and memory. `scale` = stream pixels per CSS pixel (≈ devicePixelRatio, but derived
 * from the actual stream so a downscaled large-tab capture is handled). Returns CSS pixels.
 */
export function clampCaptureHeight(docHeight: number, scale: number, maxCanvasPx = 16000): number {
  if (!(scale > 0)) return docHeight
  return Math.max(0, Math.min(docHeight, Math.floor(maxCanvasPx / scale)))
}
