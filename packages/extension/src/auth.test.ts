import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  backendBase, pickProject, trySilentLogin, requestCode, verifyCode,
  isSignedIn, signOut, getSelectedProjectId, setSelectedProjectId,
} from './auth'

// ── In-memory fake chrome ──────────────────────────────────────────────
function makeChrome(opts: { cookie?: string; hasCookies?: boolean } = {}) {
  const sync: Record<string, any> = {}
  const local: Record<string, any> = {}
  const get = (store: Record<string, any>) => (key: string | string[]) => {
    if (typeof key === 'string') return Promise.resolve({ [key]: store[key] })
    const out: Record<string, any> = {}
    for (const k of key) out[k] = store[k]
    return Promise.resolve(out)
  }
  return {
    sync, local,
    storage: {
      sync: { get: get(sync), set: (o: any) => { Object.assign(sync, o); return Promise.resolve() } },
      local: {
        get: get(local),
        set: (o: any) => { Object.assign(local, o); return Promise.resolve() },
        remove: (keys: string[]) => { for (const k of keys) delete local[k]; return Promise.resolve() },
      },
    },
    cookies: opts.hasCookies === false ? undefined : {
      get: vi.fn().mockResolvedValue(opts.cookie ? { value: opts.cookie } : null),
    },
    runtime: {
      lastError: undefined as any,
      sendMessage: vi.fn((_msg: any, cb: any) => cb({ ok: true, config: { email: 'a@b.com', token: 'ext_x', backendUrl: 'https://klavity.quantana.top', projects: [], syncedAt: 1 } })),
    },
  }
}

beforeEach(() => { vi.restoreAllMocks() })

describe('backendBase', () => {
  it('defaults to production and strips trailing slash', () => {
    expect(backendBase({})).toBe('https://klavity.quantana.top')
    expect(backendBase({ backendUrl: 'http://localhost:3000/' })).toBe('http://localhost:3000')
  })
})

describe('pickProject', () => {
  const projects = [{ id: 'p1', name: 'A', reviewMode: 'auto', monitoredUrls: [] }, { id: 'p2', name: 'B', reviewMode: 'auto', monitoredUrls: [] }]
  it('returns the saved project when it exists', () => {
    expect(pickProject(projects, 'p2')?.id).toBe('p2')
  })
  it('falls back to the first project when saved id is missing', () => {
    expect(pickProject(projects, 'gone')?.id).toBe('p1')
    expect(pickProject(projects, null)?.id).toBe('p1')
  })
  it('returns null when there are no projects', () => {
    expect(pickProject([], 'p1')).toBeNull()
  })
})

describe('trySilentLogin', () => {
  it('persists the cookie token and returns true', async () => {
    const c = makeChrome({ cookie: 'sess_123' })
    ;(globalThis as any).chrome = c
    expect(await trySilentLogin()).toBe(true)
    expect(c.sync.klavSettings.klavToken).toBe('sess_123')
    expect(c.sync.klavSettings.connectionMode).toBe('klavity')
    expect(c.runtime.sendMessage).toHaveBeenCalled()
  })
  it('returns false when there is no cookie', async () => {
    ;(globalThis as any).chrome = makeChrome({ cookie: undefined })
    expect(await trySilentLogin()).toBe(false)
  })
  it('returns false when the cookies API is unavailable', async () => {
    ;(globalThis as any).chrome = makeChrome({ hasCookies: false })
    expect(await trySilentLogin()).toBe(false)
  })
})

describe('requestCode / verifyCode', () => {
  it('requestCode returns ok on 200', async () => {
    ;(globalThis as any).chrome = makeChrome()
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    expect(await requestCode('a@b.com')).toEqual({ ok: true })
  })
  it('requestCode surfaces the server error on non-200', async () => {
    ;(globalThis as any).chrome = makeChrome()
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'not on access list' }) })
    expect(await requestCode('a@b.com')).toEqual({ ok: false, error: 'not on access list' })
  })
  it('verifyCode persists the token and triggers sync on success', async () => {
    const c = makeChrome(); ;(globalThis as any).chrome = c
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, token: 'sess_v' }) })
    expect(await verifyCode('a@b.com', '123456')).toEqual({ ok: true })
    expect(c.sync.klavSettings.klavToken).toBe('sess_v')
    expect(c.runtime.sendMessage).toHaveBeenCalled()
  })
  it('verifyCode fails when no token is returned', async () => {
    ;(globalThis as any).chrome = makeChrome()
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid or expired code.' }) })
    expect(await verifyCode('a@b.com', '000000')).toEqual({ ok: false, error: 'Invalid or expired code.' })
  })
})

describe('isSignedIn / signOut / selected project', () => {
  it('isSignedIn reflects klavConfig.email', async () => {
    const c = makeChrome(); ;(globalThis as any).chrome = c
    expect(await isSignedIn()).toBe(false)
    c.local.klavConfig = { email: 'a@b.com' }
    expect(await isSignedIn()).toBe(true)
  })
  it('signOut clears token + cached config/sims/project', async () => {
    const c = makeChrome(); ;(globalThis as any).chrome = c
    c.sync.klavSettings = { klavToken: 't', connectionMode: 'klavity' }
    c.local.klavConfig = { email: 'a@b.com' }; c.local.klavSims = [1]; c.local.klavSelectedProjectId = 'p1'
    await signOut()
    expect(c.sync.klavSettings.klavToken).toBe('')
    expect(c.sync.klavSettings.connectionMode).toBe('direct')
    expect(c.local.klavConfig).toBeUndefined()
    expect(c.local.klavSelectedProjectId).toBeUndefined()
  })
  it('remembers the selected project id', async () => {
    const c = makeChrome(); ;(globalThis as any).chrome = c
    expect(await getSelectedProjectId()).toBeNull()
    await setSelectedProjectId('p2')
    expect(await getSelectedProjectId()).toBe('p2')
  })
})
