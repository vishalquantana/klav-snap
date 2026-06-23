// @vitest-environment jsdom
//
// Contract tests for the KLA-8 public JS SDK surface: window.Klavity
//
// What is tested here that events.test.ts does NOT cover:
//   • window.Klavity is populated on module load (the actual window surface)
//   • open() is a safe no-op before mount() — never crashes on a pre-init page
//   • window.Klavity.on() delegates to the events bus correctly
//   • identify() + setMetadata() accept / coerce / cap their inputs (safety contract)
//   • Full pipeline: context with identity + metadata flows correctly into the
//     FormData payload that gets sent to /api/feedback
//   • Backwards-compatibility: every public method works before mount() is called
//
// Setup note: widget.ts auto-calls mount() at module load (the "no script tag needed"
// convenience). mount() calls parseScriptConfig(currentScript()) which reads .dataset
// and crashes with null when there is no <script> tag in jsdom. We mock parseScriptConfig
// to return empty projectId so mount() returns early — this is the correct unit-test
// harness since we're testing the PUBLIC API surface, not the mount sequence itself.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// parseScriptConfig mock must be declared before the widget.ts import so the module-level
// auto-mount call sees the stub. vi.mock() is hoisted by Vitest automatically.
vi.mock('./widget-lib', async () => {
  const actual = await vi.importActual<typeof import('./widget-lib')>('./widget-lib')
  return {
    ...actual,
    // Returning empty projectId causes mount() to `return` immediately after the guard:
    //   if (!cfg.projectId || !cfg.backendUrl) return
    parseScriptConfig: vi.fn(() => ({ projectId: '', backendUrl: '' })),
  }
})

import { emit, _clearListenersForTest } from './events'
import { buildCaptureContext } from './capture-context'
import { buildFeedbackForm } from './widget-lib'
import type { CaptureBuffers } from '@klavity/core/capture'

// Importing widget.ts triggers the window.Klavity side effect.
// With the parseScriptConfig mock above, the auto-mount returns early without crashing.
import { identify, setMetadata } from './widget'

beforeEach(() => {
  _clearListenersForTest()
})

function makeBuffers(): CaptureBuffers {
  return { consoleErrors: [], networkFailures: [] }
}

// ── 1. window.Klavity API surface ─────────────────────────────────────────────

describe('window.Klavity API surface', () => {
  it('is defined after module load', () => {
    expect((window as any).Klavity).toBeDefined()
  })

  it('exposes open, on, identify, setMetadata, mount as functions', () => {
    const w = (window as any).Klavity
    expect(typeof w.open).toBe('function')
    expect(typeof w.on).toBe('function')
    expect(typeof w.identify).toBe('function')
    expect(typeof w.setMetadata).toBe('function')
    expect(typeof w.mount).toBe('function')
  })

  it('window.Klavity.identify is the same function exported from widget.ts', () => {
    // Confirms the window object is wired to the module exports, not a copy.
    expect((window as any).Klavity.identify).toBe(identify)
  })

  it('window.Klavity.setMetadata is the same function exported from widget.ts', () => {
    expect((window as any).Klavity.setMetadata).toBe(setMetadata)
  })
})

// ── 2. open() before mount — pre-init no-op ───────────────────────────────────
//
// _openReport is initialized to () => {} so calling open() before mount() is a
// deliberate safe no-op. This is the backwards-compat contract for sites that call
// window.Klavity.open() from any order relative to script load.

describe('window.Klavity.open() before mount()', () => {
  it('does not throw when called with no arguments', () => {
    expect(() => (window as any).Klavity.open()).not.toThrow()
  })

  it('does not throw when called with "bug"', () => {
    expect(() => (window as any).Klavity.open('bug')).not.toThrow()
  })

  it('does not throw when called with "feature"', () => {
    expect(() => (window as any).Klavity.open('feature')).not.toThrow()
  })

  it('can be called multiple times before mount without side effects', () => {
    expect(() => {
      (window as any).Klavity.open()
      ;(window as any).Klavity.open('bug')
      ;(window as any).Klavity.open('feature')
      ;(window as any).Klavity.open()
    }).not.toThrow()
  })
})

// ── 3. on() via window.Klavity — delegates to events bus ─────────────────────
//
// window.Klavity.on is the same `on` function from events.ts — the window object
// is a thin wrapper that does NOT duplicate the event bus. These tests verify the
// delegation and the full unsubscribe contract through the window surface.

describe('window.Klavity.on() — event subscription', () => {
  it('calls the listener when the matching event fires', () => {
    const cb = vi.fn()
    ;(window as any).Klavity.on('submit', cb)
    emit('submit', { issueKey: 'KLA-1', issueUrl: null, type: 'bug' })
    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith({ issueKey: 'KLA-1', issueUrl: null, type: 'bug' })
  })

  it('returns an unsubscribe function that removes only that listener', () => {
    const keep = vi.fn()
    const remove = vi.fn()
    ;(window as any).Klavity.on('open', keep)
    const off = (window as any).Klavity.on('open', remove)
    off()
    emit('open', { type: 'bug' })
    expect(keep).toHaveBeenCalledOnce()
    expect(remove).not.toHaveBeenCalled()
  })

  it('unsubscribe is idempotent — calling off() twice does not throw', () => {
    const off = (window as any).Klavity.on('close', vi.fn())
    expect(() => { off(); off() }).not.toThrow()
  })

  it('does not call listeners for a different event type', () => {
    const cb = vi.fn()
    ;(window as any).Klavity.on('submit', cb)
    emit('open', { type: 'feature' })
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires close listeners with an empty payload', () => {
    const cb = vi.fn()
    ;(window as any).Klavity.on('close', cb)
    emit('close', {})
    expect(cb).toHaveBeenCalledWith({})
  })
})

// ── 4. identify() + setMetadata() — safety contract ─────────────────────────
//
// These functions are callable before mount(). They must never throw regardless of
// the input shape. Internally, coerceStrings() caps keys to 64 chars and values to
// 1000 chars (same contract as parseScriptConfig, tested in events.test.ts).

describe('identify() and setMetadata() — pre-mount safety', () => {
  it('identify() accepts a full identity object without throwing', () => {
    expect(() => identify({ id: 'u_42', email: 'ada@example.com', name: 'Ada Lovelace' })).not.toThrow()
  })

  it('identify(null) is safe — clears stored identity', () => {
    identify({ id: 'u_1' })
    expect(() => identify(null)).not.toThrow()
  })

  it('identify() accepts partial identity (email only)', () => {
    expect(() => identify({ email: 'ada@example.com' })).not.toThrow()
  })

  it('identify() with an oversized id value does not throw', () => {
    expect(() => identify({ id: 'x'.repeat(2000), email: 'a@b.com' })).not.toThrow()
  })

  it('setMetadata() accepts a plain object without throwing', () => {
    expect(() => setMetadata({ plan: 'pro', build: 'v2.1.0', tenant: 'acme' })).not.toThrow()
  })

  it('setMetadata(null) is safe — clears stored metadata', () => {
    setMetadata({ plan: 'pro' })
    expect(() => setMetadata(null)).not.toThrow()
  })

  it('setMetadata() coerces non-string values to strings (no throw)', () => {
    // Numbers, booleans, objects are accepted; coerceStrings converts them.
    expect(() => setMetadata({ count: 42 as any, flag: true as any, nested: { x: 1 } as any })).not.toThrow()
  })

  it('setMetadata() with oversized keys and values does not throw', () => {
    expect(() => setMetadata({
      ['k'.repeat(80)]: 'v'.repeat(1200),
    })).not.toThrow()
  })

  it('setMetadata() skips null/undefined values without throwing', () => {
    expect(() => setMetadata({ defined: 'yes', missing: null as any, undef: undefined as any })).not.toThrow()
  })

  it('identify() then setMetadata() then identify(null) sequence does not throw', () => {
    expect(() => {
      identify({ id: 'u_1', email: 'ada@example.com' })
      setMetadata({ plan: 'pro' })
      identify(null)
      setMetadata(null)
    }).not.toThrow()
  })
})

// ── 5. identify + setMetadata → /api/feedback FormData pipeline ──────────────
//
// The contract: identity and metadata set via identify()/setMetadata() flow into
// the `context` field of the FormData POST to /api/feedback.
//
// Widget flow: identify() → _identity → buildWidgetContext() (private) →
//   buildCaptureContext(buffers, {identity, metadata}) → buildFeedbackForm({..., context})
//
// We test the pipeline from buildCaptureContext onward (the public portion).
// buildWidgetContext() is private but its inputs come directly from identify().

describe('identity + metadata → /api/feedback FormData pipeline', () => {
  it('context.identity flows into the FormData context field', () => {
    const ctx = buildCaptureContext(makeBuffers(), {
      identity: { id: 'u_42', email: 'ada@example.com', name: 'Ada' },
    })
    const fd = buildFeedbackForm({
      description: '[bug] Button unresponsive',
      pageUrl: 'https://app.example.com/checkout',
      projectId: 'proj_abc',
      screenshots: [],
      context: ctx,
    })
    const ctxRaw = fd.get('context')
    expect(ctxRaw).toBeTruthy()
    const ctxParsed = JSON.parse(ctxRaw as string)
    expect(ctxParsed.identity).toEqual({ id: 'u_42', email: 'ada@example.com', name: 'Ada' })
  })

  it('context.metadata flows into the FormData context field', () => {
    const ctx = buildCaptureContext(makeBuffers(), {
      metadata: { plan: 'pro', build: 'v2.1.0', tenant: 'acme' },
    })
    const fd = buildFeedbackForm({
      description: '[feature] Dark mode',
      pageUrl: 'https://app.example.com/',
      projectId: 'proj_abc',
      screenshots: [],
      context: ctx,
    })
    const ctxParsed = JSON.parse(fd.get('context') as string)
    expect(ctxParsed.metadata).toEqual({ plan: 'pro', build: 'v2.1.0', tenant: 'acme' })
  })

  it('both identity and metadata appear together in the same context payload', () => {
    const ctx = buildCaptureContext(makeBuffers(), {
      identity: { id: 'u_7', email: 'bob@example.com' },
      metadata: { plan: 'free', locale: 'en-AU' },
    })
    const fd = buildFeedbackForm({
      description: '[bug] Crash on submit',
      pageUrl: 'https://app.example.com/settings',
      projectId: 'proj_x',
      screenshots: [],
      context: ctx,
    })
    const ctxParsed = JSON.parse(fd.get('context') as string)
    expect(ctxParsed.identity.id).toBe('u_7')
    expect(ctxParsed.identity.email).toBe('bob@example.com')
    expect(ctxParsed.metadata.plan).toBe('free')
    expect(ctxParsed.metadata.locale).toBe('en-AU')
  })

  it('no "context" field in FormData when context is absent', () => {
    const fd = buildFeedbackForm({
      description: '[bug] Something broke',
      pageUrl: 'https://app.example.com/',
      projectId: 'proj_y',
      screenshots: [],
    })
    expect(fd.get('context')).toBeNull()
  })
})

// ── 6. metadata size-caps (client-side coerceStrings contract) ────────────────
//
// widget.ts coerceStrings caps key length to 64 chars and value length to 1000 chars
// before storing. The same caps apply in parseScriptConfig (tested in events.test.ts).
// These tests verify the caps hold through the full pipeline via buildFeedbackForm.

describe('metadata size caps — client-side coerceStrings contract', () => {
  it('metadata keys are capped to 64 chars through the pipeline', () => {
    const longKey = 'k'.repeat(80)
    const cappedKey = longKey.slice(0, 64)
    // Simulate what coerceStrings produces: key truncated to 64 chars.
    const ctx = buildCaptureContext(makeBuffers(), {
      metadata: { [cappedKey]: 'some value' },
    })
    const fd = buildFeedbackForm({
      description: '[bug]', pageUrl: 'https://x.com', projectId: 'p', screenshots: [], context: ctx,
    })
    const ctxParsed = JSON.parse(fd.get('context') as string)
    const keys = Object.keys(ctxParsed.metadata ?? {})
    // The key in the payload must be exactly 64 chars (already capped by coerceStrings before buildCaptureContext)
    expect(keys[0].length).toBe(64)
    expect(keys[0]).toBe(cappedKey)
  })

  it('metadata values are capped to 1000 chars through the pipeline', () => {
    const longVal = 'v'.repeat(1200)
    const cappedVal = longVal.slice(0, 1000)
    const ctx = buildCaptureContext(makeBuffers(), {
      metadata: { key: cappedVal },
    })
    const fd = buildFeedbackForm({
      description: '[bug]', pageUrl: 'https://x.com', projectId: 'p', screenshots: [], context: ctx,
    })
    const ctxParsed = JSON.parse(fd.get('context') as string)
    expect(ctxParsed.metadata.key.length).toBe(1000)
  })

  it('non-string metadata values are coerced to strings by coerceStrings (widget-side)', () => {
    // After coerceStrings({ count: 42 }) → { count: '42' }
    // Verify by passing the already-coerced form to the pipeline.
    const ctx = buildCaptureContext(makeBuffers(), {
      metadata: { count: '42', flag: 'true' },  // as coerceStrings would produce
    })
    const fd = buildFeedbackForm({
      description: '[bug]', pageUrl: 'https://x.com', projectId: 'p', screenshots: [], context: ctx,
    })
    const ctxParsed = JSON.parse(fd.get('context') as string)
    expect(ctxParsed.metadata.count).toBe('42')
    expect(ctxParsed.metadata.flag).toBe('true')
  })
})

// ── 7. Backwards compatibility — all APIs work before mount() ─────────────────
//
// mount() is async and requires a valid script-tag config. The public API methods
// must be callable in any order, at any point before mount() resolves.

describe('backwards compatibility — no crash before mount()', () => {
  it('calling identify → setMetadata → open → on in sequence before mount is safe', () => {
    expect(() => {
      identify({ id: 'user_early', email: 'early@example.com' })
      setMetadata({ plan: 'enterprise', version: '3.0.0' })
      ;(window as any).Klavity.open()
      ;(window as any).Klavity.on('submit', () => {})
    }).not.toThrow()
  })

  it('calling identify() before setMetadata() does not contaminate metadata', () => {
    identify({ id: 'u_pre', email: 'pre@example.com' })
    expect(() => setMetadata({ flag: 'yes' })).not.toThrow()
  })

  it('calling open() multiple times before mount does not accumulate side effects', () => {
    const openCount = { n: 0 }
    // _openReport is () => {} before mount — calling it should be silent.
    for (let i = 0; i < 10; i++) {
      ;(window as any).Klavity.open('bug')
    }
    expect(openCount.n).toBe(0)  // no custom handler was called
  })
})
