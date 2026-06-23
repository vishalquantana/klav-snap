// @vitest-environment jsdom
// Tests for the G3 PerformanceObserver capture extension in capture-context.ts.
// PerformanceObserver is mocked so tests run deterministically without a real browser.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  installPerfCapture, snapshotPerfEntries, buildCaptureContext,
  installCaptureContext, MAX_PERF_ENTRIES, _resetForTest,
} from './capture-context'
import type { CaptureBuffers } from '@klavity/core/capture'

// ── PerformanceObserver mock ──────────────────────────────────────────────────────────────────
// Stores callback + observed type for each observer so tests can fire synthetic entries.
type ObserverRecord = { handler: PerformanceObserverCallback; type: string }
const observers: ObserverRecord[] = []

class MockPerformanceObserver {
  private _handler: PerformanceObserverCallback
  constructor(handler: PerformanceObserverCallback) { this._handler = handler }
  observe(opts: any) {
    observers.push({ handler: this._handler, type: opts.type ?? '' })
  }
  disconnect() {}
}

// Fire a synthetic PerformanceObserver callback for a given entry type.
function fireObserver(type: string, entries: Partial<PerformanceEntry & PerformanceResourceTiming>[]) {
  const rec = observers.find(o => o.type === type)
  if (!rec) return
  const list: PerformanceObserverEntryList = {
    getEntries: () => entries as PerformanceEntry[],
    getEntriesByType: () => entries as PerformanceEntry[],
    getEntriesByName: () => entries as PerformanceEntry[],
  }
  rec.handler(list, {} as PerformanceObserver)
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────
function makeBuffers(): CaptureBuffers {
  return { consoleErrors: [], networkFailures: [] }
}

const ORIGIN = 1_700_000_000_000

beforeEach(() => {
  _resetForTest()
  observers.length = 0
  // Reset core capture guard so installCaptureContext tests start clean.
  delete (window as any).__klavityCaptureInstalled
  // Stub performance with a fixed timeOrigin so epoch math is deterministic across all tests.
  vi.stubGlobal('performance', {
    timeOrigin: ORIGIN,
    now: () => 0,
    getEntriesByType: () => [],
    mark: () => {},
    measure: () => {},
  })
  vi.stubGlobal('PerformanceObserver', MockPerformanceObserver)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// ── installPerfCapture ────────────────────────────────────────────────────────────────────────
describe('installPerfCapture', () => {
  it('registers observers for longtask, paint, and resource', () => {
    installPerfCapture()
    const types = observers.map(o => o.type).sort()
    expect(types).toEqual(['longtask', 'paint', 'resource'])
  })

  it('is idempotent — a second call does not register duplicate observers', () => {
    installPerfCapture()
    installPerfCapture()
    expect(observers.length).toBe(3)  // exactly one per type, not six
  })

  it('is a no-op when PerformanceObserver is not available', () => {
    vi.stubGlobal('PerformanceObserver', undefined)
    expect(() => installPerfCapture()).not.toThrow()
    expect(observers.length).toBe(0)
  })

  it('does not throw when an entry type is unsupported (observe throws)', () => {
    class ThrowingObserver extends MockPerformanceObserver {
      observe() { throw new Error('not supported') }
    }
    vi.stubGlobal('PerformanceObserver', ThrowingObserver)
    expect(() => installPerfCapture()).not.toThrow()
  })
})

// ── longtask entries ──────────────────────────────────────────────────────────────────────────
describe('longtask capture', () => {
  it('pushes a longtask entry with correct shape and epoch timestamp', () => {
    installPerfCapture()
    fireObserver('longtask', [{ entryType: 'longtask', startTime: 200, duration: 80, name: 'self' }])
    const snap = snapshotPerfEntries()
    expect(snap).toHaveLength(1)
    expect(snap[0]).toMatchObject({
      type: 'longtask',
      name: 'longtask',
      startMs: ORIGIN + 200,
      durationMs: 80,
    })
    expect(snap[0].initiatorType).toBeUndefined()
  })
})

// ── paint entries ─────────────────────────────────────────────────────────────────────────────
describe('paint capture', () => {
  it('pushes first-paint and first-contentful-paint entries', () => {
    installPerfCapture()
    fireObserver('paint', [
      { entryType: 'paint', name: 'first-paint', startTime: 312, duration: 0 },
      { entryType: 'paint', name: 'first-contentful-paint', startTime: 420, duration: 0 },
    ])
    const snap = snapshotPerfEntries()
    expect(snap).toHaveLength(2)
    expect(snap[0]).toMatchObject({ type: 'paint', name: 'first-paint', startMs: ORIGIN + 312, durationMs: 0 })
    expect(snap[1]).toMatchObject({ type: 'paint', name: 'first-contentful-paint', startMs: ORIGIN + 420, durationMs: 0 })
  })
})

// ── resource entries ──────────────────────────────────────────────────────────────────────────
describe('resource capture', () => {
  it('captures img and script resources', () => {
    installPerfCapture()
    fireObserver('resource', [
      { entryType: 'resource', name: 'https://example.com/logo.png', startTime: 100, duration: 45, initiatorType: 'img' },
      { entryType: 'resource', name: 'https://example.com/app.js', startTime: 150, duration: 200, initiatorType: 'script' },
    ])
    const snap = snapshotPerfEntries()
    expect(snap).toHaveLength(2)
    expect(snap[0]).toMatchObject({ type: 'resource', initiatorType: 'img', durationMs: 45 })
    expect(snap[1]).toMatchObject({ type: 'resource', initiatorType: 'script', durationMs: 200 })
  })

  it('skips fetch initiator (already captured with status codes by fetch wrapper)', () => {
    installPerfCapture()
    fireObserver('resource', [
      { entryType: 'resource', name: 'https://api.example.com/data', startTime: 50, duration: 80, initiatorType: 'fetch' },
      { entryType: 'resource', name: 'https://example.com/style.css', startTime: 60, duration: 30, initiatorType: 'link' },
    ])
    const snap = snapshotPerfEntries()
    expect(snap).toHaveLength(1)
    expect(snap[0].initiatorType).toBe('link')
  })

  it('skips xmlhttprequest initiator (already captured by XHR wrapper)', () => {
    installPerfCapture()
    fireObserver('resource', [
      { entryType: 'resource', name: 'https://api.example.com/xhr', startTime: 50, duration: 60, initiatorType: 'xmlhttprequest' },
    ])
    expect(snapshotPerfEntries()).toHaveLength(0)
  })

  it('skips data: URIs', () => {
    installPerfCapture()
    fireObserver('resource', [
      { entryType: 'resource', name: 'data:image/png;base64,abc', startTime: 10, duration: 1, initiatorType: 'img' },
      { entryType: 'resource', name: 'https://example.com/real.png', startTime: 20, duration: 10, initiatorType: 'img' },
    ])
    const snap = snapshotPerfEntries()
    expect(snap).toHaveLength(1)
    expect(snap[0].name).toContain('real.png')
  })

  it('redacts secret query params from resource URLs', () => {
    installPerfCapture()
    fireObserver('resource', [
      { entryType: 'resource', name: 'https://cdn.example.com/img.jpg?token=secret123&size=lg', startTime: 10, duration: 20, initiatorType: 'img' },
    ])
    const snap = snapshotPerfEntries()
    expect(snap[0].name).not.toContain('secret123')
    expect(snap[0].name).toContain('REDACTED')
    expect(snap[0].name).toContain('size=lg')  // non-secret params kept
  })
})

// ── ring buffer ───────────────────────────────────────────────────────────────────────────────
describe('ring buffer', () => {
  it(`caps at MAX_PERF_ENTRIES (${MAX_PERF_ENTRIES}) and drops the oldest entry`, () => {
    installPerfCapture()
    // Fill beyond the cap with longtask entries
    const entries = Array.from({ length: MAX_PERF_ENTRIES + 5 }, (_, i) => ({
      entryType: 'longtask', name: 'self', startTime: i * 10, duration: 55,
    }))
    fireObserver('longtask', entries)
    const snap = snapshotPerfEntries()
    expect(snap).toHaveLength(MAX_PERF_ENTRIES)
    // Oldest (startTime=0) dropped; most recent entry should be the last one
    expect(snap[snap.length - 1].startMs).toBe(ORIGIN + (MAX_PERF_ENTRIES + 4) * 10)
  })
})

// ── snapshotPerfEntries ───────────────────────────────────────────────────────────────────────
describe('snapshotPerfEntries', () => {
  it('returns an empty array before any entries are captured', () => {
    expect(snapshotPerfEntries()).toEqual([])
  })

  it('returns a copy — mutating the snapshot does not affect the live buffer', () => {
    installPerfCapture()
    fireObserver('paint', [{ entryType: 'paint', name: 'first-paint', startTime: 100, duration: 0 }])
    const snap = snapshotPerfEntries()
    snap.push({ type: 'longtask', name: 'injected', startMs: 0, durationMs: 0 })
    // The live buffer should still have exactly 1 entry
    expect(snapshotPerfEntries()).toHaveLength(1)
  })
})

// ── buildCaptureContext ───────────────────────────────────────────────────────────────────────
describe('buildCaptureContext', () => {
  it('includes perfEntries when the buffer is non-empty', () => {
    installPerfCapture()
    fireObserver('paint', [{ entryType: 'paint', name: 'first-paint', startTime: 200, duration: 0 }])
    const ctx = buildCaptureContext(makeBuffers())
    expect(ctx.perfEntries).toBeDefined()
    expect(ctx.perfEntries!).toHaveLength(1)
    expect(ctx.perfEntries![0].type).toBe('paint')
  })

  it('omits perfEntries when the buffer is empty', () => {
    const ctx = buildCaptureContext(makeBuffers())
    expect(ctx.perfEntries).toBeUndefined()
  })

  it('includes the standard context fields from buildReportContext', () => {
    const ctx = buildCaptureContext(makeBuffers())
    expect(ctx).toHaveProperty('pageUrl')
    expect(ctx).toHaveProperty('userAgent')
    expect(ctx).toHaveProperty('consoleErrors')
    expect(ctx).toHaveProperty('networkFailures')
  })

  it('passes identity and metadata through to the context', () => {
    const ctx = buildCaptureContext(makeBuffers(), {
      identity: { id: 'user-1', email: 'a@b.com' },
      metadata: { plan: 'pro' },
    })
    expect(ctx.identity).toEqual({ id: 'user-1', email: 'a@b.com' })
    expect(ctx.metadata).toEqual({ plan: 'pro' })
  })
})

// ── installCaptureContext ─────────────────────────────────────────────────────────────────────
describe('installCaptureContext', () => {
  it('also installs console/fetch/XHR capture (sets __klavityCaptureInstalled)', () => {
    const buffers = makeBuffers()
    installCaptureContext(buffers)
    expect((window as any).__klavityCaptureInstalled).toBe(true)
  })

  it('also installs PerformanceObserver watchers', () => {
    installCaptureContext(makeBuffers())
    expect(observers.length).toBeGreaterThan(0)
  })

  it('is idempotent — calling twice does not throw or duplicate observers', () => {
    const buffers = makeBuffers()
    expect(() => { installCaptureContext(buffers); installCaptureContext(buffers) }).not.toThrow()
    // core guard: __klavityCaptureInstalled; perf guard: _perfInstalled — both ensure no doubles
    expect(observers.length).toBe(3) // exactly one observer per perf type
  })
})
