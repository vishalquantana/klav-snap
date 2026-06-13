import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitReport } from '../../src/integrations/jira'
import { DEFAULT_SETTINGS } from '../../src/types'
import type { IntegrationConfig } from '../../src/types'

const config: IntegrationConfig = {
  type: 'bug',
  description: 'Login button does nothing',
  screenshots: [],
  context: {
    pageUrl: 'https://app.example.com/login',
    userAgent: 'TestAgent',
    screenSize: '1920x1080',
    viewportSize: '1280x800',
    consoleErrors: [],
    networkFailures: [],
  },
  settings: {
    ...DEFAULT_SETTINGS,
    jira: { baseUrl: 'https://acme.atlassian.net', email: 'dev@acme.com', token: 'tok123', projectKey: 'ACME' },
  },
}

describe('jira.submitReport', () => {
  beforeEach(() => vi.resetAllMocks())

  it('creates a Jira issue and returns issueKey + issueUrl', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '10001', key: 'ACME-42', self: 'https://acme.atlassian.net/rest/api/3/issue/10001' }),
      } as Response)

    const result = await submitReport(config)

    expect(global.fetch).toHaveBeenCalledOnce()
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/rest/api/3/issue')
    expect(JSON.parse(opts.body).fields.issuetype.name).toBe('Bug')
    expect(JSON.parse(opts.body).fields.labels).toContain('klav-bug')
    expect(result.issueKey).toBe('ACME-42')
    expect(result.issueUrl).toBe('https://acme.atlassian.net/browse/ACME-42')
  })

  it('sets issuetype Story for feature requests', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: 'ACME-43' }),
    } as Response)

    await submitReport({ ...config, type: 'feature' })
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.fields.issuetype.name).toBe('Story')
    expect(body.fields.labels).toContain('klav-feature')
  })

  it('throws a user-friendly error on API failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as unknown as Response)

    await expect(submitReport(config)).rejects.toThrow('Jira API error 401')
  })
})
