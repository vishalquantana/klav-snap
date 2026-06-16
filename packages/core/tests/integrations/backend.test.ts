import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitReport } from '../../src/integrations/backend'
import { DEFAULT_SETTINGS } from '../../src/types'
import type { IntegrationConfig } from '../../src/types'

const config: IntegrationConfig = {
  type: 'bug',
  description: 'Export fails silently',
  screenshots: [], // empty to avoid data-URL fetch in this unit test
  context: { pageUrl: 'https://app.example.com', userAgent: 'Test', screenSize: '1920x1080', viewportSize: '1280x800', consoleErrors: [], networkFailures: [] },
  settings: {
    ...DEFAULT_SETTINGS,
    backendUrl: 'https://klavity.quantana.top',
    plane: { token: 'plane_tok', host: 'https://plane.quantana.top', workspace: 'qbuilder', projectId: 'proj_123' },
  },
}

describe('backend.submitReport', () => {
  beforeEach(() => vi.resetAllMocks())

  it('forwards report fields and Plane creds as multipart form data', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'fb_1', jira_key: '42', issue_url: 'https://plane.quantana.top/x' }),
    } as Response)

    const result = await submitReport(config)
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://klavity.quantana.top/api/feedback')
    const form = opts.body as FormData
    expect(form.get('type')).toBe('bug')
    expect(form.get('description')).toBe('Export fails silently')
    expect(form.get('page_url')).toBe('https://app.example.com')
    expect(form.get('plane_token')).toBe('plane_tok')
    expect(form.get('plane_workspace')).toBe('qbuilder')
    expect(form.get('plane_project_id')).toBe('proj_123')
    expect(form.get('plane_host')).toBe('https://plane.quantana.top')
    expect(result.issueKey).toBe('42')
    expect(result.issueUrl).toBe('https://plane.quantana.top/x')
  })

  it('in Klavity mode sends a Bearer token and forwards no creds', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'fb_2', jira_key: '7', issue_url: 'https://plane.quantana.top/y' }),
    } as Response)

    const klavityConfig: IntegrationConfig = {
      ...config,
      settings: { ...config.settings, connectionMode: 'klavity', klavToken: 'sess_abc' },
    }
    await submitReport(klavityConfig)
    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer sess_abc')
    const form = opts.body as FormData
    expect(form.get('plane_token')).toBeNull()
    expect(form.get('description')).toBe('Export fails silently')
  })
})
