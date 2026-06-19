// Shared SSRF guard wrapper for connector adapters (OWASP H3).
//
// Adapters fetch USER-SUPPLIED hosts/URLs (webhook URL, Jira/Plane host) reachable
// via POST /api/projects/:pid/connectors/test and the auto-copy hook. Every such
// outbound fetch must pass through the central url-guard so the server cannot be
// coerced into hitting loopback / RFC1918 / link-local / cloud-metadata addresses.
//
// This module is a thin pass-through to lib/url-guard.ts — it does NOT reimplement
// any IP/host classification. Its only addition is a narrowly-scoped, OFF-by-default
// test escape hatch so the integration tests can point a connector at a real local
// receiver (127.0.0.1 / localhost) without weakening the production guard.

import { assertSafeUrl as baseAssertSafeUrl, type UrlGuardOptions } from "../url-guard"

/**
 * True only when the integration harness explicitly opts in via KLAV_TEST_ALLOW_LOOPBACK=1.
 * Deliberately NOT gated on the generic NODE_ENV (frameworks/tools set that, and a prod misconfig
 * must never silently reopen loopback SSRF). No deployment sets this var, so the full guard applies.
 *
 * Exported so safe-fetch.ts can reuse the SAME hatch rule (single source of truth) without
 * duplicating it or the underlying IP classification (which lives in url-guard.ts).
 */
export function loopbackAllowedForTests(): boolean {
  return process.env.KLAV_TEST_ALLOW_LOOPBACK === "1"
}

/**
 * Guard an outbound connector URL against SSRF. Throws a log-safe Error (do NOT
 * echo to clients) if the target is unsafe; returns the parsed URL when allowed.
 *
 * Production behaviour is identical to url-guard's assertSafeUrl. Under the test
 * runner ONLY, a localhost/loopback http target is permitted (and only then) so
 * the hermetic integration tests can exercise the auto-copy path against a real
 * local receiver. This never relaxes the guard in production.
 */
export async function guardConnectorUrl(raw: string, opts: UrlGuardOptions = {}): Promise<URL> {
  try {
    return await baseAssertSafeUrl(raw, opts)
  } catch (e) {
    if (loopbackAllowedForTests() && isLoopbackTarget(raw)) {
      // Test-only: allow the local receiver. Re-parse so callers still get a URL.
      return new URL(raw)
    }
    throw e
  }
}

/**
 * Cheap check: is `raw` a localhost / 127.0.0.0/8 / ::1 target? (test gate only)
 * Exported so safe-fetch.ts reuses the identical loopback definition.
 */
export function isLoopbackTarget(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (host === "localhost") return true
  if (host === "::1") return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  return false
}
