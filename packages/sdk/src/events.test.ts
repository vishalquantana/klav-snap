// Tests for the G5 public event bus (events.ts) and the existing metadata API surface
// (parseScriptConfig, buildFeedbackForm with metadata in context).
//
// ── Public JS SDK quick-reference ───────────────────────────────────────────────────────────
//
//   // 1. Set user identity so every report is tagged (call before or after widget loads):
//   window.Klavity.identify({ id: 'u_42', email: 'ada@example.com', name: 'Ada' })
//
//   // 2. Attach arbitrary key/value metadata:
//   window.Klavity.setMetadata({ plan: 'pro', build: 'v2.1.0', tenant: 'acme' })
//
//   // 3. Open the report composer programmatically:
//   window.Klavity.open('bug')     // or 'feature'
//   window.Klavity.open()          // defaults to 'bug'
//
//   // 4. Subscribe to events:
//   const off = window.Klavity.on('submit', ({ issueKey, issueUrl, type }) => {
//     analytics.track('Bug filed', { issueKey, type })
//   })
//   window.Klavity.on('open',  ({ type }) => console.log('composer opened, type:', type))
//   window.Klavity.on('close', ()        => console.log('composer closed'))
//   off()  // unsubscribe when done
//
//   // 5. Script-tag config (alternative to JS calls — no JS required):
//   // <script src="https://app.klavity.com/widget.js"
//   //         data-project="proj_abc123"
//   //         data-user-id="u_42"
//   //         data-user-email="ada@example.com"
//   //         data-user-name="Ada"
//   //         data-meta='{"plan":"pro","build":"v2.1.0"}'
//   //         data-replay="on">
//   // </script>
//
// ────────────────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { on, emit, _clearListenersForTest } from './events'
import { parseScriptConfig } from './widget-lib'

beforeEach(() => _clearListenersForTest())

// ── event bus: on / emit / unsubscribe ───────────────────────────────────────────────────────
describe('on / emit', () => {
  it('calls a registered listener with the event payload', () => {
    const cb = vi.fn()
    on('submit', cb)
    emit('submit', { issueKey: 'KLA-42', issueUrl: null, type: 'bug' })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ issueKey: 'KLA-42', issueUrl: null, type: 'bug' })
  })

  it('calls all listeners registered for the same event', () => {
    const a = vi.fn(), b = vi.fn()
    on('open', a); on('open', b)
    emit('open', { type: 'feature' })
    expect(a).toHaveBeenCalledWith({ type: 'feature' })
    expect(b).toHaveBeenCalledWith({ type: 'feature' })
  })

  it('does NOT call listeners for a different event', () => {
    const submitCb = vi.fn()
    on('submit', submitCb)
    emit('open', { type: 'bug' })
    expect(submitCb).not.toHaveBeenCalled()
  })

  it('supports multiple event types independently', () => {
    const openCb = vi.fn(), closeCb = vi.fn(), submitCb = vi.fn()
    on('open',   openCb)
    on('close',  closeCb)
    on('submit', submitCb)
    emit('open',   { type: 'bug' })
    emit('close',  {})
    emit('submit', { issueKey: 'K-1', issueUrl: 'https://board.example.com/K-1', type: 'bug' })
    expect(openCb).toHaveBeenCalledOnce()
    expect(closeCb).toHaveBeenCalledOnce()
    expect(submitCb).toHaveBeenCalledOnce()
  })

  it('does not throw when no listeners are registered for an event', () => {
    expect(() => emit('submit', { issueKey: 'K-1', issueUrl: null, type: 'feature' })).not.toThrow()
  })

  it('never propagates listener errors — remaining listeners still fire', () => {
    const bad  = vi.fn().mockImplementation(() => { throw new Error('boom') })
    const good = vi.fn()
    on('open', bad)
    on('open', good)
    expect(() => emit('open', { type: 'bug' })).not.toThrow()
    expect(good).toHaveBeenCalled()
  })
})

// ── unsubscribe ───────────────────────────────────────────────────────────────────────────────
describe('unsubscribe (return value of on)', () => {
  it('removes the specific listener and prevents future calls', () => {
    const cb = vi.fn()
    const off = on('open', cb)
    off()
    emit('open', { type: 'bug' })
    expect(cb).not.toHaveBeenCalled()
  })

  it('is idempotent — calling off() twice does not throw', () => {
    const off = on('close', vi.fn())
    expect(() => { off(); off() }).not.toThrow()
  })

  it('only removes the targeted listener, not others for the same event', () => {
    const keep = vi.fn(), remove = vi.fn()
    on('submit', keep)
    const off = on('submit', remove)
    off()
    emit('submit', { issueKey: 'K-2', issueUrl: null, type: 'bug' })
    expect(keep).toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})

// ── parseScriptConfig: data-* metadata / identity ─────────────────────────────────────────────
// These test that embed sites can use the script-tag API without any JS calls.
describe('parseScriptConfig — G5 metadata via data-* attributes', () => {
  const script = (data: Record<string, string>, src = 'https://app.klavity.com/widget.js') =>
    ({ dataset: data, src })

  it('parses data-user-id / data-user-email / data-user-name into identity', () => {
    const cfg = parseScriptConfig(script({
      project: 'proj_abc',
      userId: 'u_42',
      userEmail: 'ada@example.com',
      userName: 'Ada Lovelace',
    }))
    expect(cfg.identity).toEqual({ id: 'u_42', email: 'ada@example.com', name: 'Ada Lovelace' })
  })

  it('parses data-meta JSON into metadata', () => {
    const cfg = parseScriptConfig(script({
      project: 'proj_abc',
      meta: JSON.stringify({ plan: 'pro', build: 'v2.1.0', tenant: 'acme' }),
    }))
    expect(cfg.metadata).toEqual({ plan: 'pro', build: 'v2.1.0', tenant: 'acme' })
  })

  it('coerces metadata values to strings', () => {
    const cfg = parseScriptConfig(script({
      project: 'p',
      meta: JSON.stringify({ count: 42, flag: true }),
    }))
    expect(cfg.metadata).toEqual({ count: '42', flag: 'true' })
  })

  it('caps metadata keys to 64 chars and values to 1000 chars', () => {
    const longKey = 'k'.repeat(80)
    const longVal = 'v'.repeat(1200)
    const cfg = parseScriptConfig(script({
      project: 'p',
      meta: JSON.stringify({ [longKey]: longVal }),
    }))
    const [k, v] = Object.entries(cfg.metadata!)[0]
    expect(k.length).toBe(64)
    expect(v.length).toBe(1000)
  })

  it('ignores malformed data-meta JSON without throwing', () => {
    const cfg = parseScriptConfig(script({ project: 'p', meta: '{invalid json}' }))
    expect(cfg.metadata).toBeUndefined()
  })

  it('returns identity: undefined and metadata: undefined when no data-* provided', () => {
    const cfg = parseScriptConfig(script({ project: 'p' }))
    expect(cfg.identity).toBeUndefined()
    expect(cfg.metadata).toBeUndefined()
  })

  it('omits identity fields that are not provided (partial identity is fine)', () => {
    const cfg = parseScriptConfig(script({ project: 'p', userEmail: 'ada@example.com' }))
    expect(cfg.identity).toEqual({ email: 'ada@example.com' })
    expect(cfg.identity!.id).toBeUndefined()
    expect(cfg.identity!.name).toBeUndefined()
  })
})
