// G1 — Session Replay: unified public API for the no-install widget and the npm SDK.
//
// Wraps the ring-buffer logic (replay-recorder.ts) and vendored-rrweb lazy-loading
// (load-recorder.ts) into a single createSessionReplay() factory with a clean
// start/stop/snapshot interface.
//
// TWO USAGE MODES:
//   Inline (npm SDK / extension):  pass `recordFn` — rrweb.record is already bundled.
//                                  Recording begins synchronously inside createSessionReplay().
//   Lazy   (widget embed):          pass `backendUrl` — rrweb is injected from
//                                  <backendUrl>/vendor/klv-buffer.min.js after mount.
//                                  The returned handle's snapshot()/hasRecording() return
//                                  [] / false until rrweb finishes loading (a few hundred ms).
//
// Either way the returned SessionReplay handle is fully synchronous — callers never await
// anything; recording starts in the background as soon as rrweb is available.
//
// PRIVACY DEFAULTS (matching rrweb best-practice and codebase posture):
//   maskAllInputs: true  — input values (passwords, PII) are never recorded.
//   maskText:      true  — all text is replaced with same-length asterisks.
//   recordCanvas:  false — canvas pixels excluded.
//   blockClass: 'klavity-no-record'  — hide any element with this class.
//
// SIZE/ROLLING-WINDOW DEFAULTS:
//   windowMs:   30_000   — retain the last ~30 seconds of events.
//   maxEvents:  2_000    — hard cap independent of time (memory guard).
// (Callers may override; ≥45 s window is also fine — server gzip caps the payload at 6 MB.)
//
// Best-effort throughout: rrweb load failures, recordFn errors, and stop() on a not-yet-started
// recorder all degrade silently — snapshot() returns [] and the report submits without replay.

import {
  startReplayRecording,
  type ReplayController,
  type TimedEvent,
  type StartReplayOptions,
} from './replay-recorder'
import { injectRecorderScript } from './load-recorder'

export type { TimedEvent }

// ── Public types ─────────────────────────────────────────────────────────────────────────────

export interface SessionReplayOptions extends StartReplayOptions {
  /**
   * Backend origin used to lazy-load the vendored rrweb recorder
   * (GET <backendUrl>/vendor/klv-buffer.min.js). Required when `recordFn` is not provided.
   * Ignored when `recordFn` is supplied.
   */
  backendUrl?: string

  /**
   * Provide an already-loaded `rrweb.record` function to skip lazy-loading.
   * Use this in the npm SDK (rrweb is bundled) and the browser extension.
   * When supplied, recording begins synchronously; `backendUrl` is ignored.
   */
  recordFn?: (opts: any) => (() => void) | undefined

  /**
   * Set to false to disable recording entirely (e.g. when the page author sets
   * data-replay="off" on the widget script tag). Default: true.
   */
  enabled?: boolean
}

export interface SessionReplay {
  /**
   * Return the current rolling buffer as a playable rrweb event array, safe to
   * JSON.stringify and attach to a bug report. Returns [] if recording has not yet
   * started, is disabled, or the buffer is not yet playable.
   */
  snapshot(): TimedEvent[]

  /**
   * True when the buffer holds a scrubbable recording (full DOM snapshot + at least
   * one incremental event). False before rrweb loads or if the buffer was just cleared.
   */
  hasRecording(): boolean

  /**
   * Stop the rrweb recorder and drop the buffer. Idempotent — safe to call multiple
   * times or before recording has started.
   */
  stop(): void
}

// ── Factory ───────────────────────────────────────────────────────────────────────────────────

/**
 * Create a rolling session-replay recorder. Returns a SessionReplay handle immediately;
 * recording begins synchronously (inline mode) or asynchronously once rrweb loads (lazy mode).
 */
export function createSessionReplay(opts: SessionReplayOptions): SessionReplay {
  let ctrl: ReplayController | null = null

  const replayOpts: StartReplayOptions = {
    windowMs:      opts.windowMs  ?? 30_000,
    maxEvents:     opts.maxEvents ?? 2_000,
    maskAllInputs: opts.maskAllInputs !== false,  // default ON
    maskText:      opts.maskText      !== false,  // default ON
  }

  if (opts.enabled !== false) {
    if (opts.recordFn) {
      // Inline mode: caller already has rrweb.record (npm SDK, extension).
      try {
        ctrl = startReplayRecording(opts.recordFn, replayOpts)
      } catch {
        ctrl = null
      }
    } else if (opts.backendUrl) {
      // Lazy mode: inject the vendored recorder script from the backend (widget embed).
      injectRecorderScript(opts.backendUrl)
        .then((rrweb) => {
          if (rrweb?.record) {
            try {
              ctrl = startReplayRecording(rrweb.record as any, replayOpts)
            } catch {
              ctrl = null
            }
          }
        })
        .catch(() => {
          // Network failure loading rrweb — degrade to no-replay silently.
        })
    }
  }

  return {
    snapshot():     TimedEvent[] { return ctrl?.getEvents()      ?? [] },
    hasRecording(): boolean      { return ctrl?.hasRecording()   ?? false },
    stop():         void         { ctrl?.stop(); ctrl = null },
  }
}
