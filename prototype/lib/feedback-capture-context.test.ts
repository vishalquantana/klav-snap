// KLA-6 server-side: sanitizeClientContext + clientContextHtml/Lines with perfEntries.
//
// Tests the new perfEntries path added in feat/widget-console-network-capture (v0.39.189):
// the server sanitizes perf entries from the /api/feedback context payload, caps them at 50,
// coerces unknown types, and renders them into HTML (for Plane) and plain-text (for connectors).
//
// All tests are pure (no server, no DOM, no network).

import { test, expect, describe } from 'bun:test'
import { sanitizeClientContext, clientContextHtml, clientContextLines } from './feedback'

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeClientContext — perfEntries path
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeClientContext — perfEntries', () => {
  test('preserves valid longtask entry', () => {
    const raw = {
      perfEntries: [{ type: 'longtask', name: 'longtask', startMs: 1700000200000, durationMs: 120 }],
    }
    const out = sanitizeClientContext(raw)
    expect(out.perfEntries).toHaveLength(1)
    expect(out.perfEntries[0]).toMatchObject({
      type: 'longtask',
      name: 'longtask',
      startMs: 1700000200000,
      durationMs: 120,
    })
    expect(out.perfEntries[0].initiatorType).toBeUndefined()
  })

  test('preserves paint entry (first-paint / first-contentful-paint)', () => {
    const raw = {
      perfEntries: [{ type: 'paint', name: 'first-contentful-paint', startMs: 1700000001500, durationMs: 0 }],
    }
    const out = sanitizeClientContext(raw)
    expect(out.perfEntries[0]).toMatchObject({ type: 'paint', name: 'first-contentful-paint', durationMs: 0 })
  })

  test('preserves resource entry with initiatorType', () => {
    const raw = {
      perfEntries: [{ type: 'resource', name: 'https://cdn.example.com/app.js', startMs: 1700000001000, durationMs: 210, initiatorType: 'script' }],
    }
    const out = sanitizeClientContext(raw)
    expect(out.perfEntries[0]).toMatchObject({ type: 'resource', initiatorType: 'script', durationMs: 210 })
  })

  test('unknown type is coerced to "resource" (allowlist guard)', () => {
    const raw = {
      perfEntries: [{ type: 'unknown-type-injection', name: 'x', startMs: 0, durationMs: 0 }],
    }
    const out = sanitizeClientContext(raw)
    expect(out.perfEntries[0].type).toBe('resource')
  })

  test('initiatorType is omitted when absent from the raw entry', () => {
    const raw = {
      perfEntries: [{ type: 'longtask', name: 'longtask', startMs: 0, durationMs: 80 }],
    }
    const out = sanitizeClientContext(raw)
    expect('initiatorType' in out.perfEntries[0]).toBe(false)
  })

  test('caps perfEntries at CTX_MAX_ENTRIES (50)', () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      type: 'resource', name: `https://cdn.example.com/img${i}.png`, startMs: i * 1000, durationMs: 10, initiatorType: 'img',
    }))
    const out = sanitizeClientContext({ perfEntries: entries })
    expect(out.perfEntries).toHaveLength(50)
    // Slice preserves the first 50 (oldest) entries
    expect(out.perfEntries[0].name).toContain('img0')
    expect(out.perfEntries[49].name).toContain('img49')
  })

  test('numeric fields are coerced even when received as strings', () => {
    const raw = {
      perfEntries: [{ type: 'longtask', name: 'longtask', startMs: '1700000000', durationMs: '80' }],
    }
    const out = sanitizeClientContext(raw)
    expect(typeof out.perfEntries[0].startMs).toBe('number')
    expect(typeof out.perfEntries[0].durationMs).toBe('number')
    expect(out.perfEntries[0].durationMs).toBe(80)
  })

  test('returns null for null / non-object input', () => {
    expect(sanitizeClientContext(null)).toBeNull()
    expect(sanitizeClientContext(undefined)).toBeNull()
    expect(sanitizeClientContext('garbage')).toBeNull()
    expect(sanitizeClientContext(42)).toBeNull()
  })

  test('returns null for empty object', () => {
    expect(sanitizeClientContext({})).toBeNull()
  })

  test('perfEntries coexists with consoleErrors and networkFailures', () => {
    const raw = {
      userAgent: 'TestBrowser/1.0',
      consoleErrors: [{ message: 'oops', level: 'error', timestamp: 1 }],
      networkFailures: [{ url: 'https://api.example.com/fail', status: 500, method: 'GET', timestamp: 2 }],
      perfEntries: [{ type: 'paint', name: 'first-paint', startMs: 100, durationMs: 0 }],
    }
    const out = sanitizeClientContext(raw)
    expect(out.userAgent).toBe('TestBrowser/1.0')
    expect(out.consoleErrors).toHaveLength(1)
    expect(out.networkFailures).toHaveLength(1)
    expect(out.perfEntries).toHaveLength(1)
    expect(out.perfEntries[0].type).toBe('paint')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// clientContextHtml — perfEntries rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('clientContextHtml — perfEntries', () => {
  test('renders a Performance section when perfEntries is present', () => {
    const ctx = {
      perfEntries: [
        { type: 'longtask', name: 'longtask', startMs: 1700000000100, durationMs: 95 },
        { type: 'resource', name: 'https://cdn.example.com/logo.png', startMs: 1700000000200, durationMs: 32, initiatorType: 'img' },
      ],
    }
    const html = clientContextHtml(ctx)
    expect(html).toContain('Performance (2)')
    expect(html).toContain('[longtask]')
    expect(html).toContain('95ms')
    expect(html).toContain('[resource]')
    expect(html).toContain('[img]')
    expect(html).toContain('logo.png')
  })

  test('escapes HTML in perfEntry names (XSS guard)', () => {
    const ctx = {
      perfEntries: [
        { type: 'resource', name: 'https://evil.com/<script>alert(1)</script>.png', startMs: 0, durationMs: 10, initiatorType: 'img' },
      ],
    }
    const html = clientContextHtml(ctx)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('omits the Performance section when perfEntries is absent', () => {
    const ctx = { userAgent: 'Mozilla/5.0' }
    const html = clientContextHtml(ctx)
    expect(html).not.toContain('Performance')
    expect(html).not.toContain('perfEntries')
  })

  test('omits duration suffix when durationMs is 0 (paint entries have duration:0)', () => {
    const ctx = {
      perfEntries: [{ type: 'paint', name: 'first-paint', startMs: 1700000000300, durationMs: 0 }],
    }
    const html = clientContextHtml(ctx)
    // Should not append "0ms" for zero-duration paint entries
    expect(html).not.toContain('0ms')
    expect(html).toContain('first-paint')
  })

  test('returns empty string when ctx is null', () => {
    expect(clientContextHtml(null)).toBe('')
    expect(clientContextHtml(undefined)).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// clientContextLines — perfEntries plain-text rendering (connectors)
// ─────────────────────────────────────────────────────────────────────────────

describe('clientContextLines — perfEntries', () => {
  test('renders perfEntries as plain-text lines with type, initiatorType, name, duration', () => {
    const ctx = {
      perfEntries: [
        { type: 'longtask', name: 'longtask', startMs: 0, durationMs: 110 },
        { type: 'resource', name: 'https://cdn.example.com/font.woff2', startMs: 0, durationMs: 67, initiatorType: 'other' },
      ],
    }
    const lines = clientContextLines(ctx)
    expect(lines).toContain('Performance (2):')
    const longtaskLine = lines.find(l => l.includes('[longtask]'))
    expect(longtaskLine).toBeTruthy()
    expect(longtaskLine).toContain('110ms')
    const resourceLine = lines.find(l => l.includes('font.woff2'))
    expect(resourceLine).toBeTruthy()
    expect(resourceLine).toContain('[other]')
    expect(resourceLine).toContain('67ms')
  })

  test('omits duration suffix when durationMs is 0', () => {
    const ctx = {
      perfEntries: [{ type: 'paint', name: 'first-contentful-paint', startMs: 0, durationMs: 0 }],
    }
    const lines = clientContextLines(ctx)
    const paintLine = lines.find(l => l.includes('first-contentful-paint'))
    expect(paintLine).not.toContain('ms')
  })

  test('returns empty array when ctx is null', () => {
    expect(clientContextLines(null)).toEqual([])
    expect(clientContextLines(undefined)).toEqual([])
  })

  test('full sanitize → clientContextLines pipeline round-trip', () => {
    // Simulate the /api/feedback flow: raw payload from browser → sanitize → render.
    const rawContext = {
      userAgent: 'Chrome/125',
      perfEntries: [
        { type: 'longtask', name: 'longtask', startMs: 1700000001000, durationMs: 87 },
        { type: 'paint', name: 'first-paint', startMs: 1700000000400, durationMs: 0 },
        { type: 'resource', name: 'https://cdn.example.com/bundle.js', startMs: 1700000000600, durationMs: 180, initiatorType: 'script' },
      ],
    }
    const sanitized = sanitizeClientContext(rawContext)
    const lines = clientContextLines(sanitized)
    expect(lines.some(l => l.includes('Performance (3):'))).toBe(true)
    expect(lines.some(l => l.includes('[longtask]') && l.includes('87ms'))).toBe(true)
    expect(lines.some(l => l.includes('[paint]') && l.includes('first-paint'))).toBe(true)
    expect(lines.some(l => l.includes('[script]') && l.includes('bundle.js') && l.includes('180ms'))).toBe(true)
  })
})
