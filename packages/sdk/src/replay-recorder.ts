// G1 — client-side session-replay recorder for the no-install widget + npm SDK.
//
// Records a ROLLING buffer of the last ~window-ms of rrweb DOM events. On bug submit the recent
// events are serialized and attached to the report (form field `replay_events`). This is the free
// answer to Marker.io's paid "Session replay" — captured continuously, attached to every report.
//
// PRIVACY: rrweb runs with maskAllInputs + a text masker by default (see startReplayRecording). The
// ring buffer keeps only the trailing window so we never ship a user's whole session — just the
// seconds leading up to the bug.
//
// This file's ReplayRingBuffer is pure/deterministic and unit-tested; the rrweb wiring
// (startReplayRecording) is a thin DOM shim documented for manual verification.

// rrweb EventType numeric tags (kept local so the buffer logic has no rrweb import dependency):
const EVENT_FULL_SNAPSHOT = 2
const EVENT_META = 4

export interface TimedEvent { type: number; timestamp: number; data?: unknown; [k: string]: unknown }

export interface RingOptions {
  /** Trailing time window to retain, in ms (e.g. 45_000 for ~45s). */
  windowMs: number
  /** Hard cap on retained events regardless of the window (memory guard). */
  maxEvents: number
}

/**
 * A rolling window of rrweb events. Two guards on every push:
 *   1. time-window prune: drop events older than (newest.timestamp - windowMs)
 *   2. hard max-event cap: drop oldest beyond maxEvents
 * BUT the most recent Meta + FullSnapshot pair is ALWAYS retained — pruning past the snapshot would
 * make the buffer unplayable (rrweb-player needs a full snapshot to reconstruct the DOM). The kept
 * snapshot is re-emitted at the head of snapshot() so the trailing incremental events apply cleanly.
 */
export class ReplayRingBuffer {
  private events: TimedEvent[] = []
  private lastMeta: TimedEvent | null = null
  private lastFull: TimedEvent | null = null
  constructor(private opts: RingOptions) {}

  push(e: TimedEvent): void {
    if (e.type === EVENT_META) this.lastMeta = e
    if (e.type === EVENT_FULL_SNAPSHOT) {
      this.lastFull = e
      // A new full snapshot makes everything before it redundant — reset the incremental tail.
      this.events = []
    }
    this.events.push(e)
    this.prune()
  }

  private prune(): void {
    if (!this.events.length) return
    const newest = this.events[this.events.length - 1].timestamp
    const floor = newest - this.opts.windowMs
    // Time-window prune (but never drop the retained snapshot/meta — they live OUTSIDE this.events).
    let i = 0
    while (i < this.events.length && this.events[i].timestamp < floor) i++
    if (i > 0) this.events = this.events.slice(i)
    // Hard cap.
    if (this.events.length > this.opts.maxEvents) {
      this.events = this.events.slice(this.events.length - this.opts.maxEvents)
    }
  }

  /** A playable, head-anchored copy: [meta?, fullSnapshot, ...trailing incrementals]. */
  snapshot(): TimedEvent[] {
    const head: TimedEvent[] = []
    // Only prepend the retained snapshot/meta if they aren't already at the head of the tail.
    const hasFullInTail = this.events.some(e => e.type === EVENT_FULL_SNAPSHOT)
    if (!hasFullInTail && this.lastFull) {
      if (this.lastMeta) head.push(this.lastMeta)
      head.push(this.lastFull)
    }
    return [...head, ...this.events]
  }

  /** True when the buffer can produce a scrubbable replay (a full snapshot + at least one more event). */
  isPlayable(): boolean {
    const snap = this.snapshot()
    const hasFull = snap.some(e => e.type === EVENT_FULL_SNAPSHOT)
    return hasFull && snap.length >= 2
  }

  clear(): void {
    this.events = []
    this.lastMeta = null
    this.lastFull = null
  }
}

// ── rrweb wiring (DOM shim — manual-verify) ───────────────────────────────────────────
export interface ReplayController {
  /** Current rolling buffer as a playable event array (safe to JSON.stringify and attach). */
  getEvents: () => TimedEvent[]
  /** Whether there's a playable recording right now. */
  hasRecording: () => boolean
  /** Stop recording and drop the buffer. */
  stop: () => void
}

export interface StartReplayOptions {
  windowMs?: number
  maxEvents?: number
  /** Override masking — defaults to ON (maskAllInputs + masked text) for privacy. */
  maskAllInputs?: boolean
  maskText?: boolean
}

/**
 * Start an rrweb recorder feeding a rolling buffer. `recordFn` is rrweb's `record` (injected so the
 * heavy dep loads lazily and so this is testable without a DOM). Returns a controller the report flow
 * uses to grab the trailing events on submit.
 *
 * Privacy defaults: maskAllInputs=true (passwords/PII in inputs never recorded) and a text masker that
 * replaces all text with asterisks unless the caller opts out. This mirrors the codebase's
 * default-on PII posture; a per-project toggle can later relax masking for first-party dogfood.
 */
export function startReplayRecording(
  recordFn: (opts: any) => (() => void) | undefined,
  opts: StartReplayOptions = {},
): ReplayController {
  const buf = new ReplayRingBuffer({
    windowMs: opts.windowMs ?? 45_000,
    maxEvents: opts.maxEvents ?? 2000,
  })
  const maskAllInputs = opts.maskAllInputs !== false
  const maskText = opts.maskText !== false

  let stopFn: (() => void) | undefined
  try {
    stopFn = recordFn({
      emit(e: TimedEvent) { try { buf.push(e) } catch { /* never let recording break the page */ } },
      maskAllInputs,
      // Mask every text node by default. rrweb calls maskTextFn(text) per node; '*' keeps layout.
      maskTextFn: maskText ? (text: string) => '*'.repeat(text.length) : undefined,
      // Don't record <script>/<noscript> contents and obvious secrets.
      blockClass: 'klavity-no-record',
      ignoreClass: 'klavity-no-record',
      recordCanvas: false,
      collectFonts: false,
    })
  } catch { /* rrweb unavailable / record threw — degrade to no replay */ }

  return {
    getEvents: () => (buf.isPlayable() ? buf.snapshot() : []),
    hasRecording: () => buf.isPlayable(),
    stop: () => { try { stopFn?.() } catch {} ; buf.clear() },
  }
}
