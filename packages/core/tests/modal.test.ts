import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildModal } from '../src/modal'

beforeEach(() => { document.body.innerHTML = '' })

function q(ctrl: any, sel: string) { return ctrl.shadowRoot.querySelector(sel) as HTMLElement | null }

describe('buildModal paste-image support', () => {
  it('paste handler is registered on open and removed on close', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const remSpy = vi.spyOn(document, 'removeEventListener')
    const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    expect(addSpy.mock.calls.some(c => c[0] === 'paste')).toBe(true)
    ctrl.close()
    expect(remSpy.mock.calls.some(c => c[0] === 'paste')).toBe(true)
    addSpy.mockRestore(); remSpy.mockRestore()
  })
})

describe('buildModal region capture', () => {
  it('shows the Region button only when onRegionCapture is provided', () => {
    const withRegion = buildModal('bug', { onCaptureFull: async () => 'x', onRegionCapture: async () => 'r', onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    expect(q(withRegion, '#klavity-region')).not.toBeNull()
    withRegion.close()
    const without = buildModal('bug', { onCaptureFull: async () => 'x', onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    expect(q(without, '#klavity-region')).toBeNull()
    without.close()
  })

  it('region click → overlay drag resolves onRegionCapture with a css-pixel rect, then addScreenshot', async () => {
    const onRegionCapture = vi.fn(async (_r: any) => 'data:image/png;base64,REGION')
    const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onRegionCapture, onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    ;(q(ctrl, '#klavity-region') as HTMLButtonElement).click()
    const overlay = document.querySelector('[data-klavity-region-overlay]') as HTMLElement
    expect(overlay).not.toBeNull()
    overlay.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 20, bubbles: true }))
    overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 80, bubbles: true }))
    overlay.dispatchEvent(new PointerEvent('pointerup',   { clientX: 60, clientY: 80, bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(onRegionCapture).toHaveBeenCalledWith({ x: 10, y: 20, w: 50, h: 60 })
    // Fix 2: assert the returned data URL was actually added to the strip
    expect(ctrl.shadowRoot.querySelector('.klavity-thumb')).not.toBeNull()
    ctrl.close()
  })

  it('Esc while region overlay is mounted cancels the overlay but does NOT close the modal', () => {
    const onRegionCapture = vi.fn(async (_r: any) => 'data:image/png;base64,REGION')
    const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onRegionCapture, onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    ;(q(ctrl, '#klavity-region') as HTMLButtonElement).click()
    const overlay = document.querySelector('[data-klavity-region-overlay]') as HTMLElement
    expect(overlay).not.toBeNull()
    // Fire Esc — should cancel region overlay, not close the modal
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    // Overlay must be gone
    expect(document.querySelector('[data-klavity-region-overlay]')).toBeNull()
    // Modal host must still be in the DOM
    expect(document.body.contains(ctrl.shadowRoot.host)).toBe(true)
    ctrl.close()
  })
})

describe('buildModal autoCaptureOnOpen', () => {
  it('autoCaptureOnOpen calls onCaptureFull once on mount', async () => {
    vi.useFakeTimers()
    const onCaptureFull = vi.fn(async () => 'data:image/png;base64,FULL')
    const ctrl = buildModal('bug', { onCaptureFull, autoCaptureOnOpen: true, onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    await vi.advanceTimersByTimeAsync(250)
    expect(onCaptureFull).toHaveBeenCalledTimes(1)
    ctrl.close(); vi.useRealTimers()
  })
  it('without autoCaptureOnOpen, onCaptureFull is NOT called on mount', async () => {
    vi.useFakeTimers()
    const onCaptureFull = vi.fn(async () => 'x')
    const ctrl = buildModal('bug', { onCaptureFull, onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    await vi.advanceTimersByTimeAsync(250)
    expect(onCaptureFull).not.toHaveBeenCalled()
    ctrl.close(); vi.useRealTimers()
  })
})
