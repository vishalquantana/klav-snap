import { describe, it, expect, vi } from 'vitest'
import { makeCaptureAwaiter } from './capture-bridge'

describe('capture awaiter (single-slot)', () => {
  it('resolves the in-flight capture when settle() is called', async () => {
    const sent: any[] = []
    const a = makeCaptureAwaiter({ send: (m) => sent.push(m), timeoutMs: 50 })
    const p = a.captureFull()
    expect(sent).toEqual([{ kind: 'CAPTURE_TAB' }])
    a.settle('data:image/png;base64,OK')
    await expect(p).resolves.toBe('data:image/png;base64,OK')
  })
  it('rejects on timeout when no settle arrives', async () => {
    const a = makeCaptureAwaiter({ send: () => {}, timeoutMs: 10 })
    await expect(a.captureFull()).rejects.toBeTruthy()
  })
  it('rejects a second concurrent capture (single in flight)', async () => {
    const a = makeCaptureAwaiter({ send: () => {}, timeoutMs: 1000 })
    const p1 = a.captureFull()
    await expect(a.captureFull()).rejects.toThrow(/in flight/i)
    a.settle('x'); await expect(p1).resolves.toBe('x')
  })
})
