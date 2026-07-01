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

describe('buildModal button guards (re-entrancy)', () => {
  const ok = async () => ({ issueKey: '1', issueUrl: '' })

  it('Full Page capture is guarded against double-click — one in-flight capture, button disabled', async () => {
    let resolve!: (v: string) => void
    const onCaptureFull = vi.fn(() => new Promise<string>(r => { resolve = r }))
    const ctrl = buildModal('bug', { onCaptureFull, onSubmit: ok })
    const full = q(ctrl, '#klavity-full') as HTMLButtonElement
    full.click(); full.click(); full.click() // rapid triple-click
    expect(onCaptureFull).toHaveBeenCalledTimes(1)
    expect(full.disabled).toBe(true) // locked while capturing
    resolve('data:image/png;base64,FULL')
    await new Promise(r => setTimeout(r, 0))
    expect(full.disabled).toBe(false) // released after
    expect(ctrl.shadowRoot.querySelectorAll('.klavity-thumb').length).toBe(1)
    ctrl.close()
  })

  it('Submit is disabled and every capture button locked during upload', async () => {
    let resolve!: (v: { issueKey: string; issueUrl: string }) => void
    const onSubmit = vi.fn(() => new Promise<{ issueKey: string; issueUrl: string }>(r => { resolve = r }))
    const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onRegionCapture: async () => 'r', onSubmit })
    const desc = q(ctrl, '#klavity-desc') as HTMLTextAreaElement
    desc.value = 'a real bug'; desc.dispatchEvent(new Event('input'))
    const submit = q(ctrl, '#klavity-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    submit.click()
    expect(submit.disabled).toBe(true)
    expect(submit.textContent).toContain('Uploading')
    expect((q(ctrl, '#klavity-full') as HTMLButtonElement).disabled).toBe(true)
    expect((q(ctrl, '#klavity-region') as HTMLButtonElement).disabled).toBe(true)
    // The submit handler now awaits Promise.all(screenshotCompressed) before calling onSubmit,
    // so we need one microtask tick for resolve to be assigned.
    await new Promise(r => setTimeout(r, 0))
    resolve({ issueKey: 'K-1', issueUrl: '' })
    await new Promise(r => setTimeout(r, 0))
    ctrl.close()
  })

  it('Submit failure re-enables the composer and shows the error (never stuck)', async () => {
    const onSubmit = vi.fn(async () => { throw new Error('Network down') })
    const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onSubmit })
    const desc = q(ctrl, '#klavity-desc') as HTMLTextAreaElement
    desc.value = 'oops'; desc.dispatchEvent(new Event('input'))
    const submit = q(ctrl, '#klavity-submit') as HTMLButtonElement
    submit.click()
    await new Promise(r => setTimeout(r, 0))
    const err = q(ctrl, '#klavity-err') as HTMLElement
    expect(err.style.display).toBe('block')
    expect(err.textContent).toContain('Network down')
    expect(submit.disabled).toBe(false) // re-enabled (description still valid)
    expect(submit.textContent).toBe('Submit')
    expect((q(ctrl, '#klavity-full') as HTMLButtonElement).disabled).toBe(false)
    ctrl.close()
  })
})

describe('buildModal upload guards', () => {
  const ok = async () => ({ issueKey: '1', issueUrl: '' })
  const setFiles = (input: HTMLInputElement, files: File[]) =>
    Object.defineProperty(input, 'files', { value: files, configurable: true })

  it('enforces the 5-image cap with a clear message', () => {
    const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onSubmit: ok })
    for (let i = 0; i < 5; i++) ctrl.addScreenshot('data:image/png;base64,' + i)
    expect(ctrl.shadowRoot.querySelectorAll('.klavity-thumb').length).toBe(5)
    ctrl.addScreenshot('data:image/png;base64,SIXTH') // the 6th is blocked
    expect(ctrl.shadowRoot.querySelectorAll('.klavity-thumb').length).toBe(5)
    const err = q(ctrl, '#klavity-err') as HTMLElement
    expect(err.style.display).toBe('block')
    expect(err.textContent).toMatch(/up to 5/)
    ctrl.close()
  })

  it('rejects a non-image file with a message and adds nothing', async () => {
    const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onSubmit: ok })
    const input = q(ctrl, '#klavity-file') as HTMLInputElement
    setFiles(input, [new File(['hello'], 'notes.txt', { type: 'text/plain' })])
    input.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 0))
    expect(ctrl.shadowRoot.querySelectorAll('.klavity-thumb').length).toBe(0)
    expect((q(ctrl, '#klavity-err') as HTMLElement).textContent).toMatch(/isn't an image/)
    ctrl.close()
  })

  it('rejects an oversized image with a message and adds nothing', async () => {
    const ctrl = buildModal('bug', { onCaptureFull: async () => 'x', onSubmit: ok })
    const input = q(ctrl, '#klavity-file') as HTMLInputElement
    setFiles(input, [new File([new Uint8Array(11 * 1024 * 1024)], 'huge.png', { type: 'image/png' })])
    input.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 0))
    expect(ctrl.shadowRoot.querySelectorAll('.klavity-thumb').length).toBe(0)
    expect((q(ctrl, '#klavity-err') as HTMLElement).textContent).toMatch(/too large/)
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

describe('buildModal success screen auto-dismiss', () => {
  const ok = async () => ({ issueKey: 'K-1', issueUrl: '' })

  it('closes automatically after 5 seconds if showEmail and showCta are false', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const success = {
      copy: {
        headline: 'Bug filed',
        body: 'Thanks',
        emailLabel: '',
        ctaText: '',
        ctaUrl: '',
        showEmail: false,
        showCta: false
      }
    }
    const ctrl = buildModal('bug', {
      onCaptureFull: async () => 'x',
      onSubmit: ok,
      onClose,
      success
    })
    
    // Trigger submit
    const desc = q(ctrl, '#klavity-desc') as HTMLTextAreaElement
    desc.value = 'test bug'; desc.dispatchEvent(new Event('input'))
    const submit = q(ctrl, '#klavity-submit') as HTMLButtonElement
    submit.click()
    
    // Await submit promise resolution
    await vi.advanceTimersByTimeAsync(0)
    
    // Check that success screen is rendered and has the progress bar
    expect(q(ctrl, '.klavity-toast-progress')).not.toBeNull()
    
    // Check it hasn't closed yet
    expect(onClose).not.toHaveBeenCalled()
    
    // Advance 5 seconds
    await vi.advanceTimersByTimeAsync(5000)
    
    expect(onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does not close automatically if showEmail is true until email is submitted', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onLead = vi.fn(async () => {})
    const success = {
      copy: {
        headline: 'Bug filed',
        body: 'Provide email',
        emailLabel: 'Notify me',
        ctaText: '',
        ctaUrl: '',
        showEmail: true,
        showCta: false
      },
      onLead
    }
    const ctrl = buildModal('bug', {
      onCaptureFull: async () => 'x',
      onSubmit: ok,
      onClose,
      success
    })
    
    // Trigger submit
    const desc = q(ctrl, '#klavity-desc') as HTMLTextAreaElement
    desc.value = 'test bug'; desc.dispatchEvent(new Event('input'))
    const submit = q(ctrl, '#klavity-submit') as HTMLButtonElement
    submit.click()
    
    // Await submit promise resolution
    await vi.advanceTimersByTimeAsync(0)
    
    // Should NOT have the progress bar yet
    expect(q(ctrl, '.klavity-toast-progress')).toBeNull()
    
    // Advance 10 seconds, should not close
    await vi.advanceTimersByTimeAsync(10000)
    expect(onClose).not.toHaveBeenCalled()
    
    // Enter email and submit lead
    const emailInput = q(ctrl, '.klavity-lead input') as HTMLInputElement
    emailInput.value = 'test@example.com'
    const leadBtn = q(ctrl, '.klavity-lead button') as HTMLButtonElement
    leadBtn.click()
    
    // Await lead submit resolution
    await vi.advanceTimersByTimeAsync(0)
    
    // Should have progress bar now
    expect(q(ctrl, '.klavity-toast-progress')).not.toBeNull()
    
    // Advance 5 seconds, should close
    await vi.advanceTimersByTimeAsync(5000)
    expect(onClose).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('hover pauses the 5s auto-dismiss and unhover resumes with the remaining time', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const success = {
      copy: {
        headline: 'Bug filed',
        body: 'Thanks',
        emailLabel: '',
        ctaText: '',
        ctaUrl: '',
        showEmail: false,
        showCta: false
      }
    }
    const ctrl = buildModal('bug', {
      onCaptureFull: async () => 'x',
      onSubmit: ok,
      onClose,
      success
    })

    // Trigger submit
    const desc = q(ctrl, '#klavity-desc') as HTMLTextAreaElement
    desc.value = 'test bug'; desc.dispatchEvent(new Event('input'))
    const submit = q(ctrl, '#klavity-submit') as HTMLButtonElement
    submit.click()
    await vi.advanceTimersByTimeAsync(0)

    const modal = q(ctrl, '.klavity-modal') as HTMLElement
    const progress = q(ctrl, '.klavity-toast-progress') as HTMLElement
    expect(progress).not.toBeNull()

    // t=2s: hover the toast — countdown pauses, progress bar freezes
    await vi.advanceTimersByTimeAsync(2000)
    modal.dispatchEvent(new MouseEvent('mouseenter'))
    expect(progress.style.animationPlayState).toBe('paused')

    // 10s hovered — must still be open
    await vi.advanceTimersByTimeAsync(10000)
    expect(onClose).not.toHaveBeenCalled()

    // Unhover — resumes with the remaining ~3s
    modal.dispatchEvent(new MouseEvent('mouseleave'))
    expect(progress.style.animationPlayState).toBe('running')
    await vi.advanceTimersByTimeAsync(2999)
    expect(onClose).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onClose).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('manual close while hover-paused still closes and fires onClose once', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const success = {
      copy: {
        headline: 'Bug filed',
        body: 'Thanks',
        emailLabel: '',
        ctaText: '',
        ctaUrl: '',
        showEmail: false,
        showCta: false
      }
    }
    const ctrl = buildModal('bug', {
      onCaptureFull: async () => 'x',
      onSubmit: ok,
      onClose,
      success
    })

    const desc = q(ctrl, '#klavity-desc') as HTMLTextAreaElement
    desc.value = 'test bug'; desc.dispatchEvent(new Event('input'))
    ;(q(ctrl, '#klavity-submit') as HTMLButtonElement).click()
    await vi.advanceTimersByTimeAsync(0)

    const modal = q(ctrl, '.klavity-modal') as HTMLElement
    modal.dispatchEvent(new MouseEvent('mouseenter')) // pause
    ctrl.close() // manual close while paused
    expect(onClose).toHaveBeenCalledTimes(1)
    // No stray timer should fire close/onClose again
    await vi.advanceTimersByTimeAsync(20000)
    expect(onClose).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})

describe('buildModal Screen tooltip positioning', () => {
  it('clamps tooltip within modal and viewport boundaries', () => {
    const ctrl = buildModal('bug', {
      onCaptureFull: async () => 'x',
      onCaptureSharp: async () => 'sharp',
      onSubmit: async () => ({ issueKey: '1', issueUrl: '' })
    })

    const sharpBtn = ctrl.shadowRoot.querySelector('#klavity-sharp') as HTMLElement
    const modalEl = ctrl.shadowRoot.querySelector('.klavity-modal') as HTMLElement
    expect(sharpBtn).not.toBeNull()
    expect(modalEl).not.toBeNull()

    // Mock getBoundingClientRect
    const sharpBtnSpy = vi.spyOn(sharpBtn, 'getBoundingClientRect').mockReturnValue({
      left: 200,
      right: 320,
      top: 400,
      bottom: 440,
      width: 120,
      height: 40,
      x: 200,
      y: 400,
      toJSON: () => {}
    })

    const modalSpy = vi.spyOn(modalEl, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 580,
      top: 200,
      bottom: 600,
      width: 480,
      height: 400,
      x: 100,
      y: 200,
      toJSON: () => {}
    })

    sharpBtn.dispatchEvent(new MouseEvent('mouseenter'))

    const floatTip = ctrl.shadowRoot.querySelector('.kl-float-tip') as HTMLElement
    expect(floatTip).not.toBeNull()
    
    // Center of button is 260, TIP_W / 2 is 114 -> preferred left is 146px.
    // Clamped left boundary is modalRect.left (100) + PAD (8) = 108px.
    // So left should be 146px.
    expect(floatTip.style.left).toBe('146px')

    sharpBtnSpy.mockRestore()
    modalSpy.mockRestore()
    ctrl.close()
  })

  it('autoCaptureOnOpen highlights Full Page as active, and removing all screenshots clears active state', async () => {
    vi.useFakeTimers()
    const onCaptureFull = vi.fn(async () => 'data:image/png;base64,FULL')
    const ctrl = buildModal('bug', { onCaptureFull, autoCaptureOnOpen: true, onSubmit: async () => ({ issueKey: '1', issueUrl: '' }) })
    
    // Auto-capture runs on setTimeout(..., 200)
    await vi.advanceTimersByTimeAsync(250)
    
    const fullBtn = q(ctrl, '#klavity-full') as HTMLButtonElement
    expect(fullBtn.classList.contains('kl-active')).toBe(true)
    
    // Remove the screenshot
    const rmBtn = q(ctrl, '.klavity-rm') as HTMLButtonElement
    expect(rmBtn).not.toBeNull()
    rmBtn.click()
    
    // Active state should be cleared since screenshots length is 0
    expect(fullBtn.classList.contains('kl-active')).toBe(false)
    
    ctrl.close()
    vi.useRealTimers()
  })
})
