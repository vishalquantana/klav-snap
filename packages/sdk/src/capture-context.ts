// G3 — Full-fidelity capture context for the no-install widget.
//
// Extends the shared console/fetch/XHR capture in @klavity/core/capture with
// PerformanceObserver integration that covers signals the JS wrappers cannot see:
//
//   • longtask   — main-thread blocks > 50 ms. Unique signal for jank / unresponsive-page bugs.
//   • paint      — first-paint + first-contentful-paint. Captured with buffered:true so entries
//                  recorded before the script ran are included.
//   • resource   — browser-loaded sub-resources (img, script, link/css, prefetch…).
//                  'fetch' and 'xmlhttprequest' initiators are skipped: the fetch/XHR wrappers
//                  already capture those with richer data (HTTP status codes, timing).
//
// All entries go into a shared ring buffer (MAX_PERF_ENTRIES) so memory + payload are bounded.
// The module is idempotent: calling installCaptureContext twice is safe.

import { installCapture, buildReportContext, redactUrl, type CaptureBuffers, type InstallOptions } from '@klavity/core/capture'
import type { PerfEntry, ReportContext } from '@klavity/core'

export const MAX_PERF_ENTRIES = 50

// Module-level ring buffer + install guard.
let _perfBuf: PerfEntry[] = []
let _perfInstalled = false

function pushPerf(e: PerfEntry) {
  _perfBuf.push(e)
  if (_perfBuf.length > MAX_PERF_ENTRIES) _perfBuf.shift()
}

// Install a single PerformanceObserver for one entry type. Uses the modern {type, buffered}
// form so entries that fired before the observer was installed (e.g. paint at page load) are
// included. Falls through silently when the type is unsupported — e.g. 'longtask' is not yet
// in Firefox stable, and some environments (workers, older Safari) have no PerformanceObserver.
function tryObserve(type: string, handler: PerformanceObserverCallback): void {
  try {
    const obs = new PerformanceObserver(handler)
    obs.observe({ type, buffered: true } as PerformanceObserverInit)
  } catch {
    // Entry type unsupported or buffered flag not supported — skip silently.
  }
}

// timeOrigin shortcut, guarded for environments where performance is unavailable.
function toEpochMs(startTime: number): number {
  return Math.round(
    (typeof performance !== 'undefined' && performance.timeOrigin != null
      ? performance.timeOrigin
      : 0) + startTime,
  )
}

export function installPerfCapture(): void {
  if (typeof PerformanceObserver === 'undefined' || _perfInstalled) return
  _perfInstalled = true

  // ── Long tasks: main-thread blocks > 50 ms ────────────────────────────────────────────────
  tryObserve('longtask', (list) => {
    for (const e of list.getEntries()) {
      pushPerf({
        type: 'longtask',
        name: 'longtask',
        startMs: toEpochMs(e.startTime),
        durationMs: Math.round(e.duration),
      })
    }
  })

  // ── Paint marks: first-paint + first-contentful-paint ─────────────────────────────────────
  // buffered:true ensures entries recorded before our script ran are included.
  tryObserve('paint', (list) => {
    for (const e of list.getEntries()) {
      pushPerf({
        type: 'paint',
        name: e.name,
        startMs: toEpochMs(e.startTime),
        durationMs: 0,
      })
    }
  })

  // ── Sub-resource loads: img, script, link/css, prefetch, etc. ─────────────────────────────
  // Skip 'fetch' and 'xmlhttprequest' initiators — covered by the fetch/XHR wrappers with
  // richer data (HTTP status codes). Skip data: URIs (inline content, no useful URL).
  tryObserve('resource', (list) => {
    for (const e of list.getEntries()) {
      const r = e as PerformanceResourceTiming
      const init = r.initiatorType || 'other'
      if (init === 'fetch' || init === 'xmlhttprequest') continue
      if (r.name.startsWith('data:')) continue
      pushPerf({
        type: 'resource',
        name: redactUrl(r.name),
        startMs: toEpochMs(r.startTime),
        durationMs: Math.round(r.duration),
        initiatorType: init,
      })
    }
  })
}

// Return a snapshot of the current perf ring buffer. Always returns a new array so callers
// cannot mutate the live buffer.
export function snapshotPerfEntries(): PerfEntry[] {
  return [..._perfBuf]
}

// All-in-one install for the widget: console + fetch/XHR capture (core) + PerformanceObserver.
// Idempotent — safe to call multiple times.
export function installCaptureContext(buffers: CaptureBuffers, opts?: Omit<InstallOptions, 'consoleLevels'>): void {
  installCapture(buffers, { consoleLevels: true, ...opts })
  installPerfCapture()
}

// Build the full ReportContext snapshot, extending the core context with perf entries.
export function buildCaptureContext(
  buffers: CaptureBuffers,
  extra: { identity?: ReportContext['identity']; metadata?: ReportContext['metadata'] } = {},
): ReportContext {
  const ctx = buildReportContext(buffers, extra)
  const perf = snapshotPerfEntries()
  if (perf.length) ctx.perfEntries = perf
  return ctx
}

// Test-only: reset module-level state so test suites start with a clean slate.
export function _resetForTest(): void {
  _perfBuf = []
  _perfInstalled = false
}
