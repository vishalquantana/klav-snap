// @vitest-environment node
// No jsdom in this repo — we stub the minimal browser globals (window/navigator/screen/XHR) the
// capture module touches, mirroring the lightweight stubbing style used in the SDK widget tests.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installCapture, buildReportContext, redactUrl, MAX_RING, type CaptureBuffers } from '../src/capture'

function freshBuffers(): CaptureBuffers {
  return { consoleErrors: [], networkFailures: [] }
}

// Minimal window/navigator/screen so installCapture + buildReportContext run under node.
function stubBrowser() {
  const listeners: Record<string, Function[]> = {}
  const win: any = {
    location: { href: 'https://app.test/page' },
    screen: { width: 1920, height: 1080 },
    innerWidth: 1280,
    innerHeight: 720,
    onerror: null,
    addEventListener: (type: string, fn: Function) => { (listeners[type] ||= []).push(fn) },
    __listeners: listeners,
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('navigator', { userAgent: 'TestUA/1.0' })
  vi.stubGlobal('screen', win.screen)
  return win
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('redactUrl', () => {
  beforeEach(() => stubBrowser())
  it('masks secret-looking query params and keeps the rest', () => {
    const out = redactUrl('https://api.x.com/v1/u?token=abc123&page=2')
    expect(out).toContain('token=REDACTED')
    expect(out).toContain('page=2')
    expect(out).not.toContain('abc123')
  })
  it('leaves non-secret URLs intact', () => {
    expect(redactUrl('https://api.x.com/v1/u?page=2')).toBe('https://api.x.com/v1/u?page=2')
  })
})

describe('installCapture — console (G3 full fidelity)', () => {
  it('captures ALL console levels with a level tag, not just errors', () => {
    const win = stubBrowser()
    win.fetch = vi.fn()
    const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error }
    const buf = freshBuffers()
    try {
      installCapture(buf, { consoleLevels: true })
      console.log('hello log')
      console.info('an info')
      console.warn('a warning')
      console.error('an error')
    } finally {
      Object.assign(console, orig) // restore so vitest's own logging isn't captured
    }
    const levels = buf.consoleErrors.map((e) => e.level)
    expect(levels).toEqual(['log', 'info', 'warn', 'error'])
    expect(buf.consoleErrors[0].message).toBe('hello log')
  })

  it('keeps the ring buffer bounded to MAX_RING', () => {
    const win = stubBrowser()
    win.fetch = vi.fn()
    const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error }
    const buf = freshBuffers()
    try {
      installCapture(buf, { consoleLevels: true })
      for (let i = 0; i < MAX_RING + 25; i++) console.log('msg ' + i)
    } finally {
      Object.assign(console, orig)
    }
    expect(buf.consoleErrors.length).toBe(MAX_RING)
    expect(buf.consoleErrors[buf.consoleErrors.length - 1].message).toBe('msg ' + (MAX_RING + 24))
  })

  it('is idempotent — a second install does not double-wrap console', () => {
    const win = stubBrowser()
    win.fetch = vi.fn()
    const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error }
    const buf = freshBuffers()
    try {
      installCapture(buf, { consoleLevels: true })
      installCapture(buf, { consoleLevels: true }) // no-op
      console.log('once')
    } finally {
      Object.assign(console, orig)
    }
    expect(buf.consoleErrors.filter((e) => e.message === 'once').length).toBe(1)
  })
})

describe('installCapture — network (G3 fetch, all requests)', () => {
  it('records successful fetches (not only failures) with method/url/status/timing', async () => {
    const win = stubBrowser()
    win.fetch = vi.fn(async () => new Response('ok', { status: 200 }))
    const buf = freshBuffers()
    installCapture(buf, {})
    await win.fetch('https://api.x.com/data?token=zzz')
    expect(buf.networkFailures.length).toBe(1)
    const rec = buf.networkFailures[0]
    expect(rec.status).toBe(200)
    expect(rec.method).toBe('GET')
    expect(rec.url).toContain('token=REDACTED')
    expect(typeof rec.durationMs).toBe('number')
  })

  it('records a thrown fetch as status 0', async () => {
    const win = stubBrowser()
    win.fetch = vi.fn(async () => { throw new Error('network down') })
    const buf = freshBuffers()
    installCapture(buf, {})
    await expect(win.fetch('https://api.x.com/x')).rejects.toThrow()
    expect(buf.networkFailures[0].status).toBe(0)
  })
})

describe('buildReportContext', () => {
  beforeEach(() => stubBrowser())
  it('snapshots env + buffers and attaches identity/metadata when present', () => {
    const buf: CaptureBuffers = { consoleErrors: [{ message: 'e', timestamp: 1, level: 'error' }], networkFailures: [] }
    const ctx = buildReportContext(buf, { identity: { id: 'u1', email: 'a@b.com' }, metadata: { plan: 'pro' } })
    expect(ctx.userAgent).toBe('TestUA/1.0')
    expect(ctx.screenSize).toBe('1920x1080')
    expect(ctx.viewportSize).toBe('1280x720')
    expect(ctx.consoleErrors).toHaveLength(1)
    expect(ctx.identity?.id).toBe('u1')
    expect(ctx.metadata?.plan).toBe('pro')
    expect(ctx.consoleErrors).not.toBe(buf.consoleErrors)
  })

  it('omits identity/metadata when empty', () => {
    const ctx = buildReportContext(freshBuffers())
    expect(ctx.identity).toBeUndefined()
    expect(ctx.metadata).toBeUndefined()
  })
})
