// @vitest-environment jsdom
// KLA-6 G3 — console and network capture coverage.
//
// The existing capture-context.test.ts covers the PerformanceObserver layer.
// This file covers the other half of installCaptureContext: the console.* hooks
// and the fetch / XHR wrappers that go into the networkFailures ring-buffer,
// with special focus on PRIVACY (request bodies and auth headers must not be stored).
//
// All tests use `consoleLevels: true` (what installCaptureContext passes through)
// and are isolated: each saves + restores console methods and window.fetch so
// wrappers do not accumulate across tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installCaptureContext, buildCaptureContext, _resetForTest } from './capture-context'
import type { CaptureBuffers } from '@klavity/core/capture'

function makeBuf(): CaptureBuffers { return { consoleErrors: [], networkFailures: [] } }

// Save console methods so we can restore them after each test, preventing the
// capture wrappers from accumulating across tests (each test re-installs into a
// fresh buffer, but only restoring ensures no dead wrapper chains build up).
let _savedConsole: Record<string, (...a: any[]) => void> = {}

beforeEach(() => {
  _savedConsole = {}
  for (const level of ['log', 'info', 'warn', 'error']) {
    _savedConsole[level] = (console as any)[level]
  }
  _resetForTest()
  delete (window as any).__klavityCaptureInstalled
  // Minimal PerformanceObserver stub (perf capture is not under test here).
  vi.stubGlobal('PerformanceObserver', class { observe() {} disconnect() {} })
})
afterEach(() => {
  // Restore console methods before vi.unstubAllGlobals so the chain is clean.
  for (const [level, fn] of Object.entries(_savedConsole)) {
    (console as any)[level] = fn
  }
  vi.unstubAllGlobals()
})

// ── Console capture ───────────────────────────────────────────────────────────

describe('console capture', () => {
  it('console.error is recorded in consoleErrors with level:error and a timestamp', () => {
    const buf = makeBuf()
    installCaptureContext(buf)
    console.error('something crashed')
    expect(buf.consoleErrors).toHaveLength(1)
    expect(buf.consoleErrors[0]).toMatchObject({ message: 'something crashed', level: 'error' })
    expect(typeof buf.consoleErrors[0].timestamp).toBe('number')
  })

  it('console.warn is recorded with level:warn', () => {
    const buf = makeBuf()
    installCaptureContext(buf)
    console.warn('watch out')
    const entry = buf.consoleErrors.find(e => e.level === 'warn')
    expect(entry).toBeTruthy()
    expect(entry?.message).toBe('watch out')
  })

  it('console.log is recorded with level:log', () => {
    const buf = makeBuf()
    installCaptureContext(buf)
    console.log('debug message')
    expect(buf.consoleErrors.some(e => e.level === 'log' && e.message === 'debug message')).toBe(true)
  })

  it('console.info is recorded with level:info', () => {
    const buf = makeBuf()
    installCaptureContext(buf)
    console.info('info entry')
    expect(buf.consoleErrors.some(e => e.level === 'info' && e.message === 'info entry')).toBe(true)
  })

  it('multiple console levels accumulate in insertion order', () => {
    const buf = makeBuf()
    installCaptureContext(buf)
    console.log('first')
    console.warn('second')
    console.error('third')
    const levels = buf.consoleErrors.map(e => e.level)
    expect(levels).toContain('log')
    expect(levels).toContain('warn')
    expect(levels).toContain('error')
    const msgs = buf.consoleErrors.map(e => e.message)
    expect(msgs.indexOf('first')).toBeLessThan(msgs.indexOf('second'))
    expect(msgs.indexOf('second')).toBeLessThan(msgs.indexOf('third'))
  })

  it('multi-argument console.error messages are joined into a single string', () => {
    const buf = makeBuf()
    installCaptureContext(buf)
    console.error('arg1', 'arg2', 42)
    // The implementation joins args: 'arg1 arg2 42'
    expect(buf.consoleErrors[0].message).toContain('arg1')
    expect(buf.consoleErrors[0].message).toContain('arg2')
  })

  it('console.error still forwards to the original console (no swallowing)', () => {
    const buf = makeBuf()
    const original = vi.fn()
    ;(console as any).error = original
    _savedConsole.error = original
    installCaptureContext(buf)
    console.error('should still call original')
    expect(original).toHaveBeenCalled()
  })
})

// ── Fetch capture — method, URL, status, timing ───────────────────────────────

describe('fetch capture', () => {
  it('GET fetch is recorded with url, status 200, method GET, and numeric timing fields', async () => {
    const buf = makeBuf()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 } as Response))
    installCaptureContext(buf)

    await window.fetch('https://api.example.com/users')

    expect(buf.networkFailures).toHaveLength(1)
    expect(buf.networkFailures[0]).toMatchObject({
      url: 'https://api.example.com/users',
      status: 200,
      method: 'GET',
    })
    expect(typeof buf.networkFailures[0].timestamp).toBe('number')
    expect(typeof buf.networkFailures[0].durationMs).toBe('number')
  })

  it('POST fetch records method:POST but does NOT store the request body (privacy)', async () => {
    const buf = makeBuf()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 201 } as Response))
    installCaptureContext(buf)

    await window.fetch('https://api.example.com/feedback', {
      method: 'POST',
      body: JSON.stringify({ creditCard: '4111111111111111', ssn: '123-45-6789' }),
    })

    expect(buf.networkFailures[0].method).toBe('POST')
    const captured = JSON.stringify(buf.networkFailures[0])
    // The request body MUST NOT appear in any captured field
    expect(captured).not.toContain('4111111111111111')
    expect(captured).not.toContain('123-45-6789')
    expect(captured).not.toContain('creditCard')
    expect(captured).not.toContain('ssn')
  })

  it('fetch with Authorization header does NOT store the header value (privacy)', async () => {
    const buf = makeBuf()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 } as Response))
    installCaptureContext(buf)

    await window.fetch('https://api.example.com/secure', {
      headers: { Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.super-secret-jwt-payload' },
    })

    const captured = JSON.stringify(buf.networkFailures[0])
    // The auth token MUST NOT appear in any captured field
    expect(captured).not.toContain('super-secret-jwt-payload')
    expect(captured).not.toContain('Authorization')
    expect(captured).not.toContain('Bearer')
  })

  it('fetch URL with secret query params is redacted before storage', async () => {
    const buf = makeBuf()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 } as Response))
    installCaptureContext(buf)

    await window.fetch('https://cdn.example.com/asset?api_key=my-secret-key&format=webp')

    const entry = buf.networkFailures[0]
    expect(entry.url).not.toContain('my-secret-key')
    expect(entry.url).toContain('REDACTED')
    expect(entry.url).toContain('format=webp')   // non-secret param is kept
  })

  it('network-level failure (fetch rejects) is recorded with status 0', async () => {
    const buf = makeBuf()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    installCaptureContext(buf)

    await window.fetch('https://api.example.com/offline').catch(() => {})

    expect(buf.networkFailures).toHaveLength(1)
    expect(buf.networkFailures[0].status).toBe(0)
    expect(buf.networkFailures[0].url).toContain('offline')
  })

  it('4xx / 5xx responses are recorded (all statuses captured, not just failures)', async () => {
    const buf = makeBuf()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 } as Response))
    installCaptureContext(buf)

    await window.fetch('https://api.example.com/missing')

    expect(buf.networkFailures[0].status).toBe(404)
  })
})

// ── buildCaptureContext wires console + network into the payload ───────────────

describe('buildCaptureContext — console and network in output', () => {
  it('captured console errors appear in ctx.consoleErrors', () => {
    const buf = makeBuf()
    installCaptureContext(buf)
    console.error('real payload error')
    const ctx = buildCaptureContext(buf)
    expect(ctx.consoleErrors.some(e => e.message === 'real payload error')).toBe(true)
  })

  it('captured network failures appear in ctx.networkFailures', async () => {
    const buf = makeBuf()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 502 } as Response))
    installCaptureContext(buf)
    await window.fetch('https://api.example.com/error')
    const ctx = buildCaptureContext(buf)
    expect(ctx.networkFailures.some(n => n.status === 502)).toBe(true)
  })

  it('ctx.consoleErrors + networkFailures are copies — mutating ctx does not affect buffers', () => {
    const buf = makeBuf()
    installCaptureContext(buf)
    console.error('snapshot test')
    const ctx = buildCaptureContext(buf)
    ctx.consoleErrors.push({ message: 'injected', level: 'error', timestamp: 0 })
    // The live buffer must be unaffected
    expect(buf.consoleErrors.some(e => e.message === 'injected')).toBe(false)
  })
})
