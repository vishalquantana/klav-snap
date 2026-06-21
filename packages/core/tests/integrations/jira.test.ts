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
    expect(JSON.parse(opts.body).fields.labels).toContain('klavity-bug')
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
    expect(body.fields.labels).toContain('klavity-feature')
  })

  it('renders all console levels, network requests with timing, and custom metadata (G3/G5)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ key: 'ACME-44' }),
    } as Response)
    await submitReport({
      ...config,
      context: {
        ...config.context,
        consoleErrors: [
          { message: 'a log', timestamp: 1, level: 'log' },
          { message: 'boom', timestamp: 2, level: 'error' },
        ],
        networkFailures: [
          { url: 'https://api.x/ok', status: 200, method: 'GET', timestamp: 1, durationMs: 42 },
          { url: 'https://api.x/bad', status: 500, method: 'POST', timestamp: 2 },
        ],
        identity: { id: 'u_1', email: 'a@b.com' },
        metadata: { plan: 'pro' },
      },
    })
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    const text = body.fields.description.content[0].content[0].text as string
    expect(text).toContain('[log] `a log`')
    expect(text).toContain('[error] `boom`')
    expect(text).toContain('GET https://api.x/ok → 200 (42ms)')
    expect(text).toContain('POST https://api.x/bad → 500')
    expect(text).toContain('id=u_1')
    expect(text).toContain('plan=pro')
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
