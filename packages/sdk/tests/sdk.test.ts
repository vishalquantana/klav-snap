import { describe, it, expect } from 'vitest'

describe('SDK exports', () => {
  it('exposes init and openModal as named exports', async () => {
    const mod = await import('../src/index')
    expect(typeof mod.init).toBe('function')
    expect(typeof mod.openModal).toBe('function')
  })

  it('default export has init and openModal', async () => {
    const mod = await import('../src/index')
    expect(typeof mod.default.init).toBe('function')
    expect(typeof mod.default.openModal).toBe('function')
  })
})
