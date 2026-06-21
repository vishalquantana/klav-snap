// Shared dev-tools capture (G2/G3): bounded ring buffers for console output + network requests,
// reused by the npm SDK (sdk/src/index.ts), the no-install embed widget (sdk/src/widget.ts), and
// the browser extension (extension/src/content.ts). One implementation so all three report paths
// attach the SAME technical context.
//
// Design:
//   • BOUNDED ring buffers (MAX_RING each) — memory + payload are capped no matter how chatty a page.
//   • FULL fidelity — ALL console levels (log/info/warn/error) and ALL network requests (fetch + XHR),
//     not only errors/failures. status 0 means the request never completed (network error / abort).
//   • Basic redaction — long strings are truncated and obvious secrets in URLs query strings are
//     masked, so we don't blow up payload size or capture credentials.
//   • Idempotent install — wrapping console/fetch/XHR more than once is a no-op (guarded by a flag),
//     so multiple report surfaces on one page don't double-wrap.

import type { ConsoleError, ConsoleLevel, NetworkFailure, ReportContext } from './types'

export const MAX_RING = 50
const MAX_MSG_LEN = 2000        // per console message
const MAX_URL_LEN = 1000        // per captured URL
const MAX_ARG_LEN = 500         // per stringified console arg

// Query-string keys whose values look secret — masked before a URL is stored.
const SECRET_KEY_RE = /^(?:token|access_token|refresh_token|api[_-]?key|apikey|key|secret|password|passwd|pwd|auth|authorization|session|sid|jwt|code|otp)$/i

export interface CaptureBuffers {
  consoleErrors: ConsoleError[]
  networkFailures: NetworkFailure[]
}

function pushBounded<T>(buf: T[], item: T) {
  buf.push(item)
  if (buf.length > MAX_RING) buf.shift()
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…[truncated]'
}

// Mask secret-looking query params in a URL so captured network logs never leak credentials.
export function redactUrl(raw: string): string {
  let url = String(raw || '')
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost')
    let changed = false
    u.searchParams.forEach((_v, k) => {
      if (SECRET_KEY_RE.test(k)) { u.searchParams.set(k, 'REDACTED'); changed = true }
    })
    if (changed) url = u.toString()
  } catch {
    // Not a parseable URL (relative/odd) — best-effort regex mask on query keys.
    url = url.replace(/([?&])([^=&]+)=([^&]*)/g, (m, sep, k, _v) =>
      SECRET_KEY_RE.test(k) ? `${sep}${k}=REDACTED` : m)
  }
  return truncate(url, MAX_URL_LEN)
}

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.message
  try { return truncate(JSON.stringify(a), MAX_ARG_LEN) } catch { return String(a) }
}

// Build the captured ReportContext from the buffers + the current environment.
export function buildReportContext(
  buffers: CaptureBuffers,
  extra: { identity?: ReportContext['identity']; metadata?: ReportContext['metadata'] } = {},
): ReportContext {
  const ctx: ReportContext = {
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    consoleErrors: [...buffers.consoleErrors],
    networkFailures: [...buffers.networkFailures],
  }
  if (extra.identity && Object.keys(extra.identity).length) ctx.identity = extra.identity
  if (extra.metadata && Object.keys(extra.metadata).length) ctx.metadata = extra.metadata
  return ctx
}

export interface InstallOptions {
  // Wrap console.log/info/warn/error in addition to error/rejection events (full fidelity, G3).
  consoleLevels?: boolean
  // Hook called for every console error captured — lets the extension run its auto-file logic.
  onError?: (message: string, stack?: string) => void
  // Guard so the network wrappers don't run when the extension context is invalidated.
  isContextValid?: () => boolean
}

// Install full-fidelity capture onto `window`, writing into the provided buffers. Idempotent: a
// second call with the same buffers object is a no-op (prevents double-wrapping when several report
// surfaces coexist on one page). Returns the buffers for convenience.
export function installCapture(buffers: CaptureBuffers, opts: InstallOptions = {}): CaptureBuffers {
  if (typeof window === 'undefined') return buffers
  const w = window as unknown as { __klavityCaptureInstalled?: boolean }
  if (w.__klavityCaptureInstalled) return buffers
  w.__klavityCaptureInstalled = true

  const valid = () => (opts.isContextValid ? opts.isContextValid() : true)

  const pushConsole = (level: ConsoleLevel, message: string, stack?: string) => {
    pushBounded(buffers.consoleErrors, { message: truncate(message, MAX_MSG_LEN), stack, timestamp: Date.now(), level })
  }

  // ── error + unhandled-rejection events (always captured as level:error) ──
  const prevOnError = window.onerror
  window.onerror = (msg, src, line, col, err) => {
    if (valid()) {
      const message = String(msg)
      pushConsole('error', message, err?.stack)
      opts.onError?.(message, err?.stack)
    }
    return typeof prevOnError === 'function' ? prevOnError.call(window, msg, src, line, col, err) : false
  }
  window.addEventListener('unhandledrejection', (e) => {
    if (!valid()) return
    const reason = (e as PromiseRejectionEvent).reason
    const message = String(reason?.message ?? reason)
    pushConsole('error', message, reason?.stack)
    opts.onError?.(message, reason?.stack)
  })

  // ── all console levels (G3) ──
  if (opts.consoleLevels) {
    const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error']
    for (const level of levels) {
      const orig = (console as any)[level] as ((...a: any[]) => void) | undefined
      if (typeof orig !== 'function') continue
      ;(console as any)[level] = (...args: any[]) => {
        try { if (valid()) pushConsole(level, args.map(stringifyArg).join(' ')) } catch { /* never break console */ }
        return orig.apply(console, args)
      }
    }
  }

  // ── all fetch requests (G3): record method/url/status/timing, not just failures ──
  const origFetch = window.fetch
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    if (!valid()) return origFetch(...args)
    const started = Date.now()
    const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof URL ? args[0].href : (args[0] as Request).url)
    const method = (typeof args[0] === 'object' && args[0] && 'method' in (args[0] as Request) ? (args[0] as Request).method : (args[1] as RequestInit | undefined)?.method) || 'GET'
    try {
      const res = await origFetch(...args)
      pushBounded(buffers.networkFailures, { url: redactUrl(url), status: res.status, method: String(method).toUpperCase(), timestamp: started, durationMs: Date.now() - started })
      return res
    } catch (err) {
      // Network-level failure (DNS/CORS/abort): status 0.
      pushBounded(buffers.networkFailures, { url: redactUrl(url), status: 0, method: String(method).toUpperCase(), timestamp: started, durationMs: Date.now() - started })
      throw err
    }
  }

  // ── all XMLHttpRequest requests (G3): wrap open/send ──
  const XHR = (window as any).XMLHttpRequest
  if (XHR && XHR.prototype) {
    const origOpen = XHR.prototype.open
    const origSend = XHR.prototype.send
    XHR.prototype.open = function (this: any, method: string, url: string, ...rest: any[]) {
      this.__klav = { method: String(method || 'GET').toUpperCase(), url: String(url || '') }
      return origOpen.call(this, method, url, ...rest)
    }
    XHR.prototype.send = function (this: any, ...sendArgs: any[]) {
      const meta = this.__klav
      if (meta && valid()) {
        const started = Date.now()
        this.addEventListener('loadend', () => {
          try {
            pushBounded(buffers.networkFailures, {
              url: redactUrl(meta.url),
              status: Number(this.status) || 0,
              method: meta.method,
              timestamp: started,
              durationMs: Date.now() - started,
            })
          } catch { /* ignore */ }
        })
      }
      return origSend.apply(this, sendArgs)
    }
  }

  return buffers
}
