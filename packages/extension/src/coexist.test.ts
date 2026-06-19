import { describe, it, expect, afterEach } from 'vitest'
import { widgetPresent } from './coexist'

const realDoc = (globalThis as any).document

afterEach(() => { (globalThis as any).document = realDoc })

describe('widgetPresent', () => {
  it('false when no host node', () => {
    (globalThis as any).document = { getElementById: (_id: string) => null }
    expect(widgetPresent()).toBe(false)
  })
  it('true when #klavity-widget-host exists', () => {
    (globalThis as any).document = { getElementById: (id: string) => id === 'klavity-widget-host' ? {} : null }
    expect(widgetPresent()).toBe(true)
  })
})
