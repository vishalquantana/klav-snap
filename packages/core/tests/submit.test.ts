import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchSubmit } from '../src/submit'
import type { KlavitySettings, SubmitReportPayload } from '../src/types'
import { DEFAULT_SETTINGS } from '../src/types'

const mockPayload: SubmitReportPayload = {
  type: 'bug',
  description: 'button broken',
  screenshots: [],
  context: {
    pageUrl: 'https://example.com',
    userAgent: 'TestAgent',
    screenSize: '1920x1080',
    viewportSize: '1280x800',
    consoleErrors: [],
    networkFailures: [],
  },
}

describe('dispatchSubmit', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls the jira integration in direct mode', async () => {
    const mockJira = vi.fn().mockResolvedValue({ issueKey: 'PROJ-1', issueUrl: 'https://jira/PROJ-1' })
    const settings: KlavitySettings = { ...DEFAULT_SETTINGS, integration: 'jira', backendUrl: '' }
    const result = await dispatchSubmit(mockPayload, settings, { jira: mockJira })
    expect(mockJira).toHaveBeenCalledOnce()
    expect(result.issueKey).toBe('PROJ-1')
  })

  it('calls backend integration when backendUrl is set', async () => {
    const mockBackend = vi.fn().mockResolvedValue({ issueKey: 'PROJ-2', issueUrl: 'https://klav.io/PROJ-2' })
    const settings: KlavitySettings = { ...DEFAULT_SETTINGS, backendUrl: 'https://klav.io' }
    const result = await dispatchSubmit(mockPayload, settings, { backend: mockBackend })
    expect(mockBackend).toHaveBeenCalledOnce()
    expect(result.issueKey).toBe('PROJ-2')
  })

  it('throws if no handler found', async () => {
    const settings: KlavitySettings = { ...DEFAULT_SETTINGS, integration: 'linear', backendUrl: '' }
    await expect(dispatchSubmit(mockPayload, settings, {})).rejects.toThrow('No handler')
  })

  it('backend submit includes project_id and never routes to a direct tracker', async () => {
    const calls: Record<string, boolean> = {}
    const backend = vi.fn(async (cfg: any) => { calls.backend = true; expect(cfg.projectId).toBe('proj_X'); return { issueKey: '1', issueUrl: '' } })
    const jira = vi.fn(async () => { calls.jira = true; return { issueKey: 'J', issueUrl: '' } })
    await dispatchSubmit(
      { type: 'bug', description: 'd', context: { pageUrl: 'https://x' } as any, screenshots: [], projectId: 'proj_X' } as any,
      { ...DEFAULT_SETTINGS, backendUrl: 'https://k', connectionMode: 'klavity', klavToken: 't' },
      { backend, jira } as any,
    )
    expect(calls.backend).toBe(true); expect(calls.jira).toBeUndefined()
  })
})
