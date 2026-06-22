import { describe, it, expect } from 'vitest'
import { normUrl, patternMatchesUrl, findProjectForUrl } from './project-url'
import type { KlavConfig } from '@klavity/core'

// ---------------------------------------------------------------------------
// normUrl
// ---------------------------------------------------------------------------
describe('normUrl', () => {
  it('strips https:// scheme', () => {
    expect(normUrl('https://example.com/path')).toBe('example.com/path')
  })
  it('strips http:// scheme', () => {
    expect(normUrl('http://example.com/')).toBe('example.com')
  })
  it('strips query string', () => {
    expect(normUrl('https://example.com/path?foo=bar')).toBe('example.com/path')
  })
  it('strips hash fragment', () => {
    expect(normUrl('https://example.com/path#section')).toBe('example.com/path')
  })
  it('strips trailing slash', () => {
    expect(normUrl('https://example.com/path/')).toBe('example.com/path')
  })
  it('lowercases', () => {
    expect(normUrl('https://Example.COM/Path')).toBe('example.com/path')
  })
  it('handles bare hostname (no slash)', () => {
    expect(normUrl('https://example.com')).toBe('example.com')
  })
  it('handles empty string', () => {
    expect(normUrl('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// patternMatchesUrl
// ---------------------------------------------------------------------------
describe('patternMatchesUrl', () => {
  // ── exact / prefix matching (no wildcard) ────────────────────────────────

  it('exact match: pattern == url (normalised)', () => {
    expect(patternMatchesUrl('app.example.com/dashboard', 'https://app.example.com/dashboard')).toBe(true)
  })

  it('prefix match: url starts with pattern + /', () => {
    expect(patternMatchesUrl('app.example.com', 'https://app.example.com/any/sub/path')).toBe(true)
  })

  it('prefix: does NOT match a different host that happens to start with the same chars', () => {
    // "app.example.com" must not match "app.example.community/..."
    expect(patternMatchesUrl('app.example.com', 'https://app.example.community/page')).toBe(false)
  })

  it('exact hostname pattern matches the root URL of that host', () => {
    expect(patternMatchesUrl('example.com', 'https://example.com/')).toBe(true)
  })

  it('prefix does NOT match a sibling path that does not start with pattern/', () => {
    expect(patternMatchesUrl('example.com/blog', 'https://example.com/blogroll')).toBe(false)
    expect(patternMatchesUrl('example.com/blog', 'https://example.com/blog/post')).toBe(true)
  })

  it('does not match a different host', () => {
    expect(patternMatchesUrl('app.example.com', 'https://other.example.com/path')).toBe(false)
  })

  // ── glob wildcard matching ───────────────────────────────────────────────

  it('wildcard: * matches any suffix', () => {
    expect(patternMatchesUrl('app.example.com/dash*', 'https://app.example.com/dashboard/settings')).toBe(true)
  })

  it('wildcard: * at start matches any host prefix', () => {
    expect(patternMatchesUrl('*.example.com/path', 'https://sub.example.com/path')).toBe(true)
  })

  it('wildcard: pattern with * does not match an unrelated url', () => {
    expect(patternMatchesUrl('app.example.com/dash*', 'https://app.example.com/profile')).toBe(false)
  })

  it('wildcard: * in the middle', () => {
    expect(patternMatchesUrl('app.*/path', 'https://app.example.com/path')).toBe(true)
    expect(patternMatchesUrl('app.*/path', 'https://app.example.com/other')).toBe(false)
  })

  // ── edge cases ───────────────────────────────────────────────────────────

  it('empty pattern returns false', () => {
    expect(patternMatchesUrl('', 'https://example.com')).toBe(false)
  })

  it('pattern with dot special chars is not treated as regex dot', () => {
    // "example.com" must not match "exampleXcom"
    expect(patternMatchesUrl('example.com', 'https://exampleXcom/path')).toBe(false)
  })

  it('case-insensitive comparison (both normalised to lower)', () => {
    expect(patternMatchesUrl('App.Example.COM/Dashboard', 'https://app.example.com/dashboard')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// findProjectForUrl
// ---------------------------------------------------------------------------

const makeConfig = (overrides: Partial<KlavConfig['projects'][number]>[] = []): KlavConfig => ({
  email: 'test@example.com',
  token: 'tok',
  backendUrl: 'https://klavity.quantana.top',
  syncedAt: 0,
  projects: [
    { id: 'proj-a', name: 'Project A', reviewMode: 'auto', monitoredUrls: ['app.example.com', 'staging.example.com/app*'], ...overrides[0] },
    { id: 'proj-b', name: 'Project B', reviewMode: 'auto', monitoredUrls: ['docs.example.com'], ...overrides[1] },
  ],
})

describe('findProjectForUrl', () => {
  it('returns matching project for an exact-host URL', () => {
    const p = findProjectForUrl('https://app.example.com/dashboard', makeConfig())
    expect(p?.id).toBe('proj-a')
  })

  it('returns matching project for a wildcard pattern', () => {
    const p = findProjectForUrl('https://staging.example.com/app/settings', makeConfig())
    expect(p?.id).toBe('proj-a')
  })

  it('returns the second project when the URL matches its pattern', () => {
    const p = findProjectForUrl('https://docs.example.com/guide', makeConfig())
    expect(p?.id).toBe('proj-b')
  })

  it('returns null when no project matches', () => {
    expect(findProjectForUrl('https://unrelated.com', makeConfig())).toBeNull()
  })

  it('returns null for empty URL', () => {
    expect(findProjectForUrl('', makeConfig())).toBeNull()
  })

  it('returns null for null config', () => {
    expect(findProjectForUrl('https://app.example.com', null)).toBeNull()
  })

  it('skips paused projects even when URL matches', () => {
    const cfg = makeConfig([{ reviewMode: 'paused' }])
    // proj-a is paused; proj-b doesn't match — should return null
    const p = findProjectForUrl('https://app.example.com/page', cfg)
    expect(p).toBeNull()
  })

  it('returns the first matching project when multiple projects could match', () => {
    const cfg: KlavConfig = {
      ...makeConfig(),
      projects: [
        { id: 'proj-first', name: 'First', reviewMode: 'auto', monitoredUrls: ['shared.example.com'] },
        { id: 'proj-second', name: 'Second', reviewMode: 'auto', monitoredUrls: ['shared.example.com'] },
      ],
    }
    const p = findProjectForUrl('https://shared.example.com/page', cfg)
    expect(p?.id).toBe('proj-first')
  })

  it('ignores chrome:// and about: URLs gracefully (no match)', () => {
    expect(findProjectForUrl('chrome://newtab/', makeConfig())).toBeNull()
    expect(findProjectForUrl('about:blank', makeConfig())).toBeNull()
  })
})
