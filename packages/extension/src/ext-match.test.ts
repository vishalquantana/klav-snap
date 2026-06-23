import { describe, it, expect } from 'vitest'
import { parseMatchResponse } from './ext-match'

describe('parseMatchResponse', () => {
  it('returns first project on a well-formed response', () => {
    const data = { projects: [{ projectId: 'proj_abc', name: 'My App' }] }
    expect(parseMatchResponse(data)).toEqual({ id: 'proj_abc', name: 'My App' })
  })

  it('returns only the first project when multiple are returned', () => {
    const data = { projects: [
      { projectId: 'proj_1', name: 'First' },
      { projectId: 'proj_2', name: 'Second' },
    ]}
    expect(parseMatchResponse(data)).toEqual({ id: 'proj_1', name: 'First' })
  })

  it('returns null for an empty projects array', () => {
    expect(parseMatchResponse({ projects: [] })).toBeNull()
  })

  it('returns null for missing projects key', () => {
    expect(parseMatchResponse({ other: 'stuff' })).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseMatchResponse(null)).toBeNull()
  })

  it('returns null for a non-object primitive', () => {
    expect(parseMatchResponse('bad')).toBeNull()
  })

  it('returns null when projectId is missing', () => {
    const data = { projects: [{ name: 'No ID' }] }
    expect(parseMatchResponse(data)).toBeNull()
  })

  it('returns null when projectId is empty string', () => {
    const data = { projects: [{ projectId: '', name: 'Empty' }] }
    expect(parseMatchResponse(data)).toBeNull()
  })

  it('coerces name to string when numeric', () => {
    const data = { projects: [{ projectId: 'proj_x', name: 42 }] }
    expect(parseMatchResponse(data)).toEqual({ id: 'proj_x', name: '42' })
  })
})
