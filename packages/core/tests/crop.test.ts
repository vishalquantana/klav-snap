import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cropDataUrl } from '../src/crop'

// Mock HTMLCanvasElement and HTMLImageElement for jsdom
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: vi.fn(),
          }),
          toDataURL: () => 'data:image/png;base64,cropped',
        }
      }
      throw new Error(`unexpected createElement(${tag})`)
    },
  })
})

describe('cropDataUrl', () => {
  it('clamps crop rect to image bounds', async () => {
    const mockImg = { naturalWidth: 100, naturalHeight: 200 }
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      src = ''
      naturalWidth = mockImg.naturalWidth
      naturalHeight = mockImg.naturalHeight
      set src(_: string) { setTimeout(() => this.onload?.(), 0) }
    })

    const result = await cropDataUrl('data:image/png;base64,abc', { x: -10, y: -10, w: 999, h: 999 }, 0, 0)
    expect(result).toBe('data:image/png;base64,cropped')
  })

  it('returns a string starting with data:', async () => {
    const result = await cropDataUrl('data:image/png;base64,abc', { x: 0, y: 0, w: 50, h: 50 }, 0, 0)
    expect(result).toMatch(/^data:/)
  })
})
