import { describe, it, expect } from 'vitest'
import { ReplayRingBuffer, type TimedEvent } from './replay-recorder'

const ev = (t: number, type = 3): TimedEvent => ({ type, timestamp: t, data: {} })

describe('ReplayRingBuffer', () => {
  it('keeps events within the time window, pruning by timestamp', () => {
    const buf = new ReplayRingBuffer({ windowMs: 1000, maxEvents: 1000 })
    buf.push(ev(0))
    buf.push(ev(500))
    buf.push(ev(1200)) // pushing this prunes anything older than 1200-1000=200 → drops ev(0)
    const out = buf.snapshot()
    expect(out.map(e => e.timestamp)).toEqual([500, 1200])
  })

  it('enforces a hard max-event cap, dropping the oldest', () => {
    const buf = new ReplayRingBuffer({ windowMs: 10_000_000, maxEvents: 3 })
    buf.push(ev(1)); buf.push(ev(2)); buf.push(ev(3)); buf.push(ev(4))
    expect(buf.snapshot().map(e => e.timestamp)).toEqual([2, 3, 4])
  })

  it('always retains the most recent full-snapshot (type 2) so the replay can render', () => {
    // type 2 = FullSnapshot, type 4 = Meta. A buffer pruned past its snapshot would be unplayable;
    // the ring keeps the latest meta+full-snapshot pair even when the time window would drop them.
    const buf = new ReplayRingBuffer({ windowMs: 1000, maxEvents: 1000 })
    buf.push(ev(0, 4))   // meta
    buf.push(ev(1, 2))   // full snapshot
    for (let t = 100; t <= 5000; t += 100) buf.push(ev(t, 3)) // many incremental events over 5s
    const out = buf.snapshot()
    // the full snapshot (and its meta) must survive even though they're far outside the 1s window
    expect(out.some(e => e.type === 2)).toBe(true)
    expect(out.some(e => e.type === 4)).toBe(true)
    // and it must come before the incremental events
    const firstFull = out.findIndex(e => e.type === 2)
    const firstInc = out.findIndex(e => e.type === 3)
    expect(firstFull).toBeLessThan(firstInc)
  })

  it('snapshot returns a copy (caller mutation does not corrupt the buffer)', () => {
    const buf = new ReplayRingBuffer({ windowMs: 1000, maxEvents: 10 })
    buf.push(ev(1))
    const snap = buf.snapshot()
    snap.push(ev(999))
    expect(buf.snapshot()).toHaveLength(1)
  })

  it('reports whether it holds a playable recording (needs a full snapshot + ≥1 more event)', () => {
    const buf = new ReplayRingBuffer({ windowMs: 1000, maxEvents: 10 })
    expect(buf.isPlayable()).toBe(false)
    buf.push(ev(0, 4)); buf.push(ev(1, 2))
    expect(buf.isPlayable()).toBe(false) // snapshot alone isn't enough to scrub
    buf.push(ev(2, 3))
    expect(buf.isPlayable()).toBe(true)
  })

  it('clear empties the buffer', () => {
    const buf = new ReplayRingBuffer({ windowMs: 1000, maxEvents: 10 })
    buf.push(ev(1, 2)); buf.push(ev(2, 3))
    buf.clear()
    expect(buf.snapshot()).toHaveLength(0)
    expect(buf.isPlayable()).toBe(false)
  })
})
