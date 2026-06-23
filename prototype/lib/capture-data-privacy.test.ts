// Security / privacy tests for capture-data storage:
// (a) URL query-param redaction in networkFailures (SENSITIVE_PARAM_NAMES / redactSensitiveParams)
// (b) sanitizeClientContext wires redaction into stored networkFailures
// (c) pruneOldFeedbackReplays retention function (project-scoped, returns deleted count)
//
// All pure unit tests — no server process, no network.

import { test, expect, describe } from 'bun:test'
import { redactSensitiveParams, sanitizeClientContext, SENSITIVE_PARAM_NAMES } from './feedback'

// ── (a) redactSensitiveParams ─────────────────────────────────────────────────

describe('redactSensitiveParams', () => {
  test('replaces known sensitive param value with [REDACTED]', () => {
    const url = 'https://api.stripe.com/v1/charges?api_key=sk_live_secret123&limit=10'
    const out = redactSensitiveParams(url)
    expect(out).not.toContain('sk_live_secret123')
    expect(out).toContain('REDACTED')
    expect(out).toContain('limit=10')   // non-sensitive param preserved
  })

  test('redacts all SENSITIVE_PARAM_NAMES variants', () => {
    for (const name of SENSITIVE_PARAM_NAMES) {
      const url = `https://example.com/api?${name}=supersecret&safe=yes`
      const out = redactSensitiveParams(url)
      expect(out).not.toContain('supersecret')
      expect(out).toContain('REDACTED')
      expect(out).toContain('safe=yes')
    }
  })

  test('is case-insensitive on param name (TOKEN vs token)', () => {
    const url = 'https://app.example.com/data?TOKEN=abc123'
    const out = redactSensitiveParams(url)
    expect(out).not.toContain('abc123')
    expect(out).toContain('REDACTED')
  })

  test('leaves URLs with no sensitive params unchanged', () => {
    const url = 'https://api.example.com/v1/items?page=2&limit=20&sort=created_at'
    expect(redactSensitiveParams(url)).toBe(url)
  })

  test('handles multiple sensitive params in one URL', () => {
    const url = 'https://svc.io/q?token=tok_abc&api_key=key_xyz&page=1'
    const out = redactSensitiveParams(url)
    expect(out).not.toContain('tok_abc')
    expect(out).not.toContain('key_xyz')
    expect(out).toContain('page=1')
  })

  test('returns relative/unparseable URLs unchanged (no crash)', () => {
    expect(redactSensitiveParams('/relative/path?token=x')).toBe('/relative/path?token=x')
    expect(redactSensitiveParams('')).toBe('')
    expect(redactSensitiveParams('not a url at all')).toBe('not a url at all')
  })

  test('handles URL with no query string', () => {
    const url = 'https://example.com/api/v1/items'
    expect(redactSensitiveParams(url)).toBe(url)
  })

  test('keeps hash fragment intact (URL constructor preserves it)', () => {
    const url = 'https://example.com/path?api_key=secret#section'
    const out = redactSensitiveParams(url)
    expect(out).not.toContain('secret')
    expect(out).toContain('#section')
  })
})

// ── (b) sanitizeClientContext redacts networkFailure URLs ─────────────────────

describe('sanitizeClientContext — networkFailures URL redaction', () => {
  test('strips api_key from networkFailure URL before storage', () => {
    const raw = {
      networkFailures: [{
        url: 'https://api.stripe.com/v1/charges?api_key=sk_live_XXX&amount=100',
        status: 401, method: 'GET', timestamp: 1700000000000,
      }],
    }
    const out = sanitizeClientContext(raw)
    const stored = out.networkFailures[0].url
    expect(stored).not.toContain('sk_live_XXX')
    expect(stored).toContain('REDACTED')
    expect(stored).toContain('amount=100')   // safe param preserved
  })

  test('strips access_token from networkFailure URL', () => {
    const raw = {
      networkFailures: [{
        url: 'https://graph.facebook.com/me?access_token=EAABsb&fields=id',
        status: 200, method: 'GET', timestamp: 0,
      }],
    }
    const out = sanitizeClientContext(raw)
    expect(out.networkFailures[0].url).not.toContain('EAABsb')
    expect(out.networkFailures[0].url).toContain('REDACTED')
    expect(out.networkFailures[0].url).toContain('fields=id')
  })

  test('networkFailure URL with no sensitive params stored verbatim', () => {
    const raw = {
      networkFailures: [{
        url: 'https://api.example.com/v1/orders?page=1&limit=20',
        status: 500, method: 'POST', timestamp: 0,
      }],
    }
    const out = sanitizeClientContext(raw)
    expect(out.networkFailures[0].url).toBe('https://api.example.com/v1/orders?page=1&limit=20')
  })

  test('non-absolute URLs pass through unchanged (relative cannot carry structured params)', () => {
    const raw = {
      networkFailures: [{
        url: '/api/internal?token=x',   // relative — URL parser would fail
        status: 403, method: 'GET', timestamp: 0,
      }],
    }
    const out = sanitizeClientContext(raw)
    // Should not throw; url is returned as-is since it's not parseable by URL()
    expect(out.networkFailures[0].url).toBe('/api/internal?token=x')
  })

  test('does not expose clientContext fields not explicitly allow-listed', () => {
    const raw = {
      clientSecret: 'SHOULD_NOT_APPEAR',
      consoleErrors: [],
      networkFailures: [],
    }
    const out = sanitizeClientContext(raw)
    // clientSecret is not in the allow-list — it must be absent
    expect(JSON.stringify(out)).not.toContain('SHOULD_NOT_APPEAR')
    expect(out.clientSecret).toBeUndefined()
  })
})

// ── (c) pruneOldFeedbackReplays ───────────────────────────────────────────────
// Pure logic test: verify the function exists with the correct signature and
// that REPLAY_RETAIN_MS matches the documented 90-day policy.

import { pruneOldFeedbackReplays, REPLAY_RETAIN_MS } from './feedback-replay'

describe('pruneOldFeedbackReplays', () => {
  test('REPLAY_RETAIN_MS equals 90 days in ms', () => {
    expect(REPLAY_RETAIN_MS).toBe(90 * 24 * 60 * 60 * 1000)
  })

  test('function is exported and accepts (projectId, maxAgeMs) signature', () => {
    // Verify it's callable — the DB call will fail without a real DB but the
    // function reference and arity are what we're confirming here.
    expect(typeof pruneOldFeedbackReplays).toBe('function')
    expect(pruneOldFeedbackReplays.length).toBe(1)   // projectId required; maxAgeMs has a default
  })
})
