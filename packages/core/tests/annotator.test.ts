// packages/core/tests/annotator.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Annotator } from '../src/annotator'
import type { Shape } from '../src/types'

function makeCanvas() {
  return {
    width: 400,
    height: 300,
    getContext: () => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      ellipse: vi.fn(),
      fillText: vi.fn(),
      canvas: { width: 400, height: 300 },
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
      font: '',
      lineCap: '' as CanvasLineCap,
    }),
    toDataURL: (type?: string) => `data:${type ?? 'image/png'};base64,flat`,
  } as unknown as HTMLCanvasElement
}

describe('Annotator', () => {
  it('starts with no shapes', () => {
    const a = new Annotator(makeCanvas(), 'data:image/png;base64,img')
    expect(a.shapes).toHaveLength(0)
  })

  it('addShape increases shape count', () => {
    const a = new Annotator(makeCanvas(), 'data:image/png;base64,img')
    const shape: Shape = { type: 'rect', color: '#ff0000', x: 10, y: 10, w: 50, h: 50 }
    a.addShape(shape)
    expect(a.shapes).toHaveLength(1)
  })

  it('undo removes last shape', () => {
    const a = new Annotator(makeCanvas(), 'data:image/png;base64,img')
    a.addShape({ type: 'rect', color: '#ff0000', x: 0, y: 0, w: 10, h: 10 })
    a.addShape({ type: 'rect', color: '#0000ff', x: 5, y: 5, w: 10, h: 10 })
    a.undo()
    expect(a.shapes).toHaveLength(1)
    expect(a.shapes[0].color).toBe('#ff0000')
  })

  it('clear removes all shapes', () => {
    const a = new Annotator(makeCanvas(), 'data:image/png;base64,img')
    a.addShape({ type: 'rect', color: '#ff0000', x: 0, y: 0, w: 10, h: 10 })
    a.clearAll()
    expect(a.shapes).toHaveLength(0)
  })

  it('accepts a circle shape', () => {
    const a = new Annotator(makeCanvas(), 'data:image/png;base64,img')
    const shape: Shape = { type: 'circle', color: '#ff0000', x: 50, y: 50, rx: 20, ry: 10 }
    a.addShape(shape)
    expect(a.shapes).toHaveLength(1)
    expect(a.shapes[0].type).toBe('circle')
  })

  it('computeLineWidth scales with image width', () => {
    const a = new Annotator(makeCanvas(), 'data:image/png;base64,img')
    // canvas.width = 400 → lineWidth = max(3, 400/400) = 3
    expect(a.computeLineWidth()).toBe(3)
  })

  it('save returns a data URL', async () => {
    const a = new Annotator(makeCanvas(), 'data:image/png;base64,img')
    const result = await a.save()
    expect(result).toMatch(/^data:/)
  })
})
