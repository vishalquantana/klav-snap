import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cropDataUrl } from '../src/crop'

let lastDrawImageArgs: number[] = []

// Mock HTMLCanvasElement and HTMLImageElement for jsdom
beforeEach(() => {
  lastDrawImageArgs = []
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: (_img: unknown, ...rest: number[]) => { lastDrawImageArgs = rest },
          }),
          toDataURL: () => 'data:image/png;base64,cropped',
        }
      }
      throw new Error(`unexpected createElement(${tag})`)
    },
  })
})

function stubImage(naturalWidth: number, naturalHeight: number) {
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null
    naturalWidth = naturalWidth
    naturalHeight = naturalHeight
    set src(_: string) { setTimeout(() => this.onload?.(), 0) }
  })
}

describe('cropDataUrl', () => {
  it('clamps crop rect to image bounds', async () => {
    stubImage(100, 200)
    const result = await cropDataUrl('data:image/png;base64,abc', { x: -10, y: -10, w: 999, h: 999 }, 0, 0)
    expect(result).toBe('data:image/png;base64,cropped')
  })

  it('returns a string starting with data:', async () => {
    stubImage(100, 200)
    const result = await cropDataUrl('data:image/png;base64,abc', { x: 0, y: 0, w: 50, h: 50 }, 0, 0)
    expect(result).toMatch(/^data:/)
  })

  it('maps the CSS rect 1:1 when scale is 1 (html-to-image path)', async () => {
    stubImage(1280, 8000)
    await cropDataUrl('x', { x: 400, y: 350, w: 300, h: 200 }, 0, 100, 1)
    const [sx, sy, sw, sh] = lastDrawImageArgs
    expect([sx, sy, sw, sh]).toEqual([400, 450, 300, 200])
  })

  it('scales the CSS rect + scroll by the source pixel ratio (downscaled fallback)', async () => {
    // Fallback downscaled a 1280×8000 CSS page to a 640×4000 image (scale 0.5). A viewport rect at
    // (400,350) while scrolled 1000px down must land at image px (200, 675), NOT raw (400, 1350).
    stubImage(640, 4000)
    await cropDataUrl('x', { x: 400, y: 350, w: 300, h: 200 }, 0, 1000, 0.5)
    const [sx, sy, sw, sh] = lastDrawImageArgs
    expect([sx, sy, sw, sh]).toEqual([200, 675, 150, 100])
  })
})
