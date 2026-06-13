import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitReport } from '../../src/integrations/plane'
import { DEFAULT_SETTINGS } from '../../src/types'
import type { IntegrationConfig } from '../../src/types'

const config: IntegrationConfig = {
  type: 'bug',
  description: 'Export fails silently',
  screenshots: [],
  context: { pageUrl: 'https://app.example.com', userAgent: 'Test', screenSize: '1920x1080', viewportSize: '1280x800', consoleErrors: [], networkFailures: [] },
  settings: { ...DEFAULT_SETTINGS, plane: { token: 'plane_tok', workspace: 'acme', projectId: 'proj_123' } },
}

describe('plane.submitReport', () => {
  beforeEach(() => vi.resetAllMocks())

  it('creates a Plane issue', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'iss_plane_1', sequence_id: 7 }),
    } as Response)

    const result = await submitReport(config)
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/api/v1/workspaces/acme/projects/proj_123/issues/')
    expect(opts.headers['X-API-Key']).toBe('plane_tok')
    expect(result.issueKey).toBe('7')
  })

  it('throws on API failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' } as unknown as Response)
    await expect(submitReport(config)).rejects.toThrow('Plane API error 403')
  })
})
