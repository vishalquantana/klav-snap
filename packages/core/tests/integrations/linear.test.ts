import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitReport } from '../../src/integrations/linear'
import { DEFAULT_SETTINGS } from '../../src/types'
import type { IntegrationConfig } from '../../src/types'

const config: IntegrationConfig = {
  type: 'bug',
  description: 'Dashboard crashes on load',
  screenshots: [],
  context: {
    pageUrl: 'https://app.example.com',
    userAgent: 'TestAgent',
    screenSize: '1920x1080',
    viewportSize: '1280x800',
    consoleErrors: [],
    networkFailures: [],
  },
  settings: { ...DEFAULT_SETTINGS, linear: { apiKey: 'lin_api_123', teamId: 'team_abc' } },
}

describe('linear.submitReport', () => {
  beforeEach(() => vi.resetAllMocks())

  it('sends a GraphQL IssueCreate mutation', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issueCreate: { success: true, issue: { id: 'iss_1', identifier: 'ENG-12', url: 'https://linear.app/team/issue/ENG-12' } } } }),
    } as Response)

    const result = await submitReport(config)

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.query).toContain('IssueCreate')
    expect(result.issueKey).toBe('ENG-12')
    expect(result.issueUrl).toBe('https://linear.app/team/issue/ENG-12')
  })

  it('throws on GraphQL error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: 'Invalid API key' }] }),
    } as Response)

    await expect(submitReport(config)).rejects.toThrow('Linear API error: Invalid API key')
  })
})
