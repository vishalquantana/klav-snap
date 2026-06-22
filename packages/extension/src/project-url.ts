/**
 * project-url.ts — Pure URL-matching helpers for project-follows-URL auto-selection.
 *
 * These are intentionally dependency-free (no chrome.*, no DOM) so they can be
 * unit-tested without a Chrome runtime.  Mirrors klavNormUrl / klavPatternMatches
 * in content.ts and patternMatchesUrl on the server — keep the three in sync.
 */

import type { KlavConfig, KlavMonitoredProject } from '@klavity/core'

/**
 * Strip scheme, query, fragment, and trailing slash from a URL so patterns can be
 * compared against raw browser URLs without worrying about format noise.
 */
export function normUrl(u: string): string {
  return String(u || '').trim()
    .replace(/^https?:\/\//i, '')    // strip scheme
    .replace(/[?#].*$/, '')          // strip query + fragment
    .replace(/\/+$/, '')             // strip trailing slash
    .toLowerCase()
}

/**
 * Returns true when `url` matches `pattern` using prefix or simple glob (* only).
 * Intentionally no regex patterns — mirrors the server's patternMatchesUrl (db.ts).
 *
 * Examples:
 *   patternMatchesUrl("app.example.com/dashboard", "https://app.example.com/dashboard") → true
 *   patternMatchesUrl("app.example.com/dash*",     "https://app.example.com/dashboard/settings") → true
 *   patternMatchesUrl("app.example.com",           "https://app.example.com/any/path") → true (prefix)
 *   patternMatchesUrl("app.example.com",           "https://other.example.com/") → false
 */
export function patternMatchesUrl(pattern: string, url: string): boolean {
  const p = normUrl(pattern)
  const u = normUrl(url)
  if (!p) return false
  if (!p.includes('*')) return u === p || u.startsWith(p + '/')
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + esc).test(u)
}

/**
 * Returns the first non-paused project whose monitoredUrls patterns match `url`,
 * or null if no project claims this URL.  The caller writes the returned project's
 * id to `klavSelectedProjectId` storage — it does NOT mutate the config.
 */
export function findProjectForUrl(url: string, config: KlavConfig | null): KlavMonitoredProject | null {
  if (!url || !config) return null
  for (const p of config.projects) {
    if (p.reviewMode === 'paused') continue
    if (p.monitoredUrls.some((pat) => patternMatchesUrl(pat, url))) return p
  }
  return null
}
