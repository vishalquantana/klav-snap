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
): Promise<string> {
  const img = await loadImage(dataUrl)
  const sx = clamp(rect.x + scrollX, 0, img.naturalWidth - 1)
  const sy = clamp(rect.y + scrollY, 0, img.naturalHeight - 1)
  const sw = clamp(rect.w, 1, img.naturalWidth - sx)
  const sh = clamp(rect.h, 1, img.naturalHeight - sy)
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas.toDataURL('image/png')
}
