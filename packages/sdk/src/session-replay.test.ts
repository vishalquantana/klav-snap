// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSessionReplay } from './session-replay'

// ── dependency mocks ─────────────────────────────────────────────────────────────────────────
vi.mock('./load-recorder', () => ({ injectRecorderScript: vi.fn() }))
vi.mock('./replay-recorder', () => ({ startReplayRecording: vi.fn() }))

import { injectRecorderScript } from './load-recorder'
import { startReplayRecording } from './replay-recorder'

// Synthetic playable event set (meta + full-snapshot + one incremental).
const EVENTS = [
  { type: 4, timestamp: 100 },  // meta
  { type: 2, timestamp: 101 },  // full snapshot
  { type: 3, timestamp: 200 },  // incremental
]

function makeCtrl(events = EVENTS) {
  return {
    getEvents:    vi.fn(() => events),
    hasRecording: vi.fn(() => events.length >= 2),
    stop:         vi.fn(),
  }
}

// Advance the microtask queue so promise .then() callbacks have run.
const flush = () => new Promise<void>(r => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
})

// ── inline mode ───────────────────────────────────────────────────────────────────────────────
describe('inline mode (recordFn provided)', () => {
  it('starts recording synchronously and snapshot returns events immediately', () => {
    const ctrl = makeCtrl()
    vi.mocked(startReplayRecording).mockReturnValue(ctrl)
    const mockRecord = vi.fn()

    const replay = createSessionReplay({ recordFn: mockRecord })

    expect(startReplayRecording).toHaveBeenCalledWith(mockRecord, expect.objectContaining({ windowMs: 30_000, maxEvents: 2_000 }))
    expect(replay.snapshot()).toEqual(EVENTS)
  })

  it('does not call injectRecorderScript — rrweb is already present', () => {
    vi.mocked(startReplayRecording).mockReturnValue(makeCtrl())
    createSessionReplay({ recordFn: vi.fn() })
    expect(injectRecorderScript).not.toHaveBeenCalled()
  })

  it('forwards windowMs, maxEvents, maskAllInputs, maskText to startReplayRecording', () => {
    vi.mocked(startReplayRecording).mockReturnValue(makeCtrl())
    createSessionReplay({
      recordFn: vi.fn(),
      windowMs: 60_000,
      maxEvents: 3_000,
      maskAllInputs: false,
      maskText: false,
    })
    expect(startReplayRecording).toHaveBeenCalledWith(
      expect.any(Function),
      { windowMs: 60_000, maxEvents: 3_000, maskAllInputs: false, maskText: false },
    )
  })

  it('defaults maskAllInputs and maskText to true (privacy-first)', () => {
    vi.mocked(startReplayRecording).mockReturnValue(makeCtrl())
    createSessionReplay({ recordFn: vi.fn() })
    expect(startReplayRecording).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ maskAllInputs: true, maskText: true }),
    )
  })

  it('snapshot returns [] and no throw when recordFn throws during setup', () => {
    vi.mocked(startReplayRecording).mockImplementation(() => { throw new Error('rrweb init error') })
    const replay = createSessionReplay({ recordFn: vi.fn() })
    expect(replay.snapshot()).toEqual([])
    expect(replay.hasRecording()).toBe(false)
  })
})

// ── lazy mode ─────────────────────────────────────────────────────────────────────────────────
describe('lazy mode (backendUrl provided)', () => {
  it('snapshot returns [] before rrweb finishes loading', () => {
    vi.mocked(injectRecorderScript).mockReturnValue(new Promise(() => {}))  // never resolves
    const replay = createSessionReplay({ backendUrl: 'https://klavity.example.com' })
    expect(replay.snapshot()).toEqual([])
    expect(replay.hasRecording()).toBe(false)
  })

  it('calls injectRecorderScript with the correct backendUrl', () => {
    vi.mocked(injectRecorderScript).mockReturnValue(new Promise(() => {}))
    createSessionReplay({ backendUrl: 'https://klavity.example.com' })
    expect(injectRecorderScript).toHaveBeenCalledWith('https://klavity.example.com')
  })

  it('snapshot returns events after rrweb loads and recording starts', async () => {
    const ctrl = makeCtrl()
    vi.mocked(startReplayRecording).mockReturnValue(ctrl)
    vi.mocked(injectRecorderScript).mockResolvedValue({ record: vi.fn() })

    const replay = createSessionReplay({ backendUrl: 'https://klavity.example.com' })
    expect(replay.snapshot()).toEqual([])   // empty before promise resolves

    await flush()

    expect(replay.snapshot()).toEqual(EVENTS)
    expect(replay.hasRecording()).toBe(true)
  })

  it('snapshot returns [] when injectRecorderScript rejects', async () => {
    vi.mocked(injectRecorderScript).mockRejectedValue(new Error('network error'))
    const replay = createSessionReplay({ backendUrl: 'https://klavity.example.com' })
    await flush()
    expect(replay.snapshot()).toEqual([])
  })

  it('snapshot returns [] when rrweb global has no .record function', async () => {
    vi.mocked(injectRecorderScript).mockResolvedValue({ record: undefined })
    const replay = createSessionReplay({ backendUrl: 'https://klavity.example.com' })
    await flush()
    expect(replay.snapshot()).toEqual([])
    expect(startReplayRecording).not.toHaveBeenCalled()
  })

  it('snapshot returns [] when startReplayRecording throws after rrweb loads', async () => {
    vi.mocked(injectRecorderScript).mockResolvedValue({ record: vi.fn() })
    vi.mocked(startReplayRecording).mockImplementation(() => { throw new Error('record error') })
    const replay = createSessionReplay({ backendUrl: 'https://klavity.example.com' })
    await flush()
    expect(replay.snapshot()).toEqual([])
  })
})

// ── disabled mode ─────────────────────────────────────────────────────────────────────────────
describe('disabled mode (enabled: false)', () => {
  it('does not inject rrweb or start recording', () => {
    const replay = createSessionReplay({ backendUrl: 'https://klavity.example.com', enabled: false })
    expect(injectRecorderScript).not.toHaveBeenCalled()
    expect(startReplayRecording).not.toHaveBeenCalled()
    expect(replay.snapshot()).toEqual([])
    expect(replay.hasRecording()).toBe(false)
  })

  it('is also a no-op when no backendUrl or recordFn is supplied', () => {
    const replay = createSessionReplay({ enabled: false })
    expect(replay.snapshot()).toEqual([])
  })
})

// ── stop ──────────────────────────────────────────────────────────────────────────────────────
describe('stop()', () => {
  it('calls ctrl.stop() and makes subsequent snapshot() return []', () => {
    const ctrl = makeCtrl()
    vi.mocked(startReplayRecording).mockReturnValue(ctrl)

    const replay = createSessionReplay({ recordFn: vi.fn() })
    expect(replay.snapshot()).toEqual(EVENTS)

    replay.stop()

    expect(ctrl.stop).toHaveBeenCalledTimes(1)
    // ctrl is nulled after stop — snapshot/hasRecording fall back to defaults
    expect(replay.snapshot()).toEqual([])
    expect(replay.hasRecording()).toBe(false)
  })

  it('is idempotent — calling stop twice does not throw', () => {
    const ctrl = makeCtrl()
    vi.mocked(startReplayRecording).mockReturnValue(ctrl)
    const replay = createSessionReplay({ recordFn: vi.fn() })
    expect(() => { replay.stop(); replay.stop() }).not.toThrow()
  })

  it('is safe to call before recording starts (disabled or pre-load)', () => {
    const replay = createSessionReplay({ enabled: false })
    expect(() => replay.stop()).not.toThrow()
  })

  it('stop called after lazy load race: ctrl already set, then stopped', async () => {
    const ctrl = makeCtrl()
    vi.mocked(startReplayRecording).mockReturnValue(ctrl)
    vi.mocked(injectRecorderScript).mockResolvedValue({ record: vi.fn() })

    const replay = createSessionReplay({ backendUrl: 'https://klavity.example.com' })
    await flush()

    expect(replay.snapshot()).toEqual(EVENTS)
    replay.stop()
    expect(ctrl.stop).toHaveBeenCalled()
    expect(replay.snapshot()).toEqual([])
  })
})

// ── hasRecording ──────────────────────────────────────────────────────────────────────────────
describe('hasRecording()', () => {
  it('delegates to ctrl.hasRecording() when available', () => {
    const ctrl = makeCtrl()
    vi.mocked(startReplayRecording).mockReturnValue(ctrl)
    const replay = createSessionReplay({ recordFn: vi.fn() })
    expect(replay.hasRecording()).toBe(ctrl.hasRecording())
    expect(ctrl.hasRecording).toHaveBeenCalled()
  })

  it('returns false when not recording (no-op guard)', () => {
    const replay = createSessionReplay({ enabled: false })
    expect(replay.hasRecording()).toBe(false)
  })
})
