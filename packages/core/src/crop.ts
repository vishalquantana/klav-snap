export interface Rect { x: number; y: number; w: number; h: number }

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

export async function cropDataUrl(
  dataUrl: string,
  rect: Rect,
  scrollX = window.scrollX,
  scrollY = window.scrollY,
  // Image pixels per CSS pixel of the captured page. 1 when the screenshot is rendered 1:1 with CSS
  // coords (html-to-image at pixelRatio 1). MUST be passed when the source image is NOT 1:1 — e.g. the
  // CSP fetch-free fallback downscales tall pages (>4096px) to stay under canvas limits, so a viewport
  // rect in CSS px would otherwise crop the wrong, often clamped → black, area. (The extension instead
  // pre-multiplies rect+scroll by dpr and leaves scale at 1.)
  scale = 1,
): Promise<string> {
  const img = await loadImage(dataUrl)
  const sx = clamp((rect.x + scrollX) * scale, 0, img.naturalWidth - 1)
  const sy = clamp((rect.y + scrollY) * scale, 0, img.naturalHeight - 1)
  const sw = clamp(rect.w * scale, 1, img.naturalWidth - sx)
  const sh = clamp(rect.h * scale, 1, img.naturalHeight - sy)
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas.toDataURL('image/png')
}
