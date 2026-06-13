import type { IntegrationConfig, SubmitResult } from '../types'

export async function submitReport(config: IntegrationConfig): Promise<SubmitResult> {
  const { settings, description, context } = config
  const { token, workspace, projectId } = settings.plane

  const res = await fetch(
    `https://api.plane.so/api/v1/workspaces/${workspace}/projects/${projectId}/issues/`,
    {
      method: 'POST',
      headers: { 'X-API-Key': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `[Klav] ${description.slice(0, 180)}`,
        description_html: `<p>${description}</p><p><strong>Page:</strong> ${context.pageUrl}</p>`,
      }),
    },
  )

  if (!res.ok) throw new Error(`Plane API error ${res.status}: ${await res.text()}`)

  const data = await res.json() as { sequence_id: number }
  return {
    issueKey: String(data.sequence_id),
    issueUrl: `https://app.plane.so/${workspace}/projects/${projectId}/issues/`,
  }
}
