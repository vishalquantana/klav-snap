// In-process fixed-window rate limiter. The server runs as a single Bun process (klav.service),
// so a module-level Map is consistent for the whole instance. State resets on restart — acceptable
// for throttling auth abuse (an attacker can't force restarts), and the OTP brute-force surface is
// also bounded at the data layer by single-use codes (see createOtp).
//
// Two primitives over one window store:
//   allow(key, limit, windowMs)  — increment-and-test; returns false once the window is over `limit`.
//   record/count/clear           — track failures explicitly (increment on failure, peek to gate,
//                                   clear on success) for lockout-style counters.

interface Window { count: number; resetAt: number }
const windows = new Map<string, Window>()

// Opportunistic GC so abandoned keys don't accumulate across a long-lived process.
const MAX_KEYS = 50_000
function gc(now: number) {
  if (windows.size < MAX_KEYS) return
  for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k)
}

function bump(key: string, windowMs: number, now: number): number {
  const w = windows.get(key)
  if (!w || now >= w.resetAt) { gc(now); windows.set(key, { count: 1, resetAt: now + windowMs }); return 1 }
  w.count++
  return w.count
}

// Increment the window for `key` and return whether it is still within `limit`.
export function allow(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  return bump(key, windowMs, now) <= limit
}

// Increment a failure counter for `key`; returns the new count. Use with count()/clear().
export function record(key: string, windowMs: number, now: number = Date.now()): number {
  return bump(key, windowMs, now)
}

// Current count for `key` without incrementing (0 if absent or expired).
export function count(key: string, now: number = Date.now()): number {
  const w = windows.get(key)
  if (!w || now >= w.resetAt) return 0
  return w.count
}

// Milliseconds until `key`'s window resets (0 if absent/expired).
export function retryAfterMs(key: string, now: number = Date.now()): number {
  const w = windows.get(key)
  if (!w || now >= w.resetAt) return 0
  return w.resetAt - now
}

export function clear(key: string): void { windows.delete(key) }

// Test-only: wipe all windows so cases don't bleed into each other.
export function _resetAll(): void { windows.clear() }
