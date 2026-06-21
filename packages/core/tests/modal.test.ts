import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildModal } from '../src/modal'

beforeEach(() => { document.body.innerHTML = '' })

function q(ctrl: any, sel: string) { return ctrl.shadowRoot.querySelector(sel) as HTMLElement | null }

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
    ctrl.close()
  })
})
