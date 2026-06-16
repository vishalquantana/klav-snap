import type { IntegrationConfig, SubmitResult } from '../types'

export async function submitReport(config: IntegrationConfig): Promise<SubmitResult> {
  const { settings, type, description, context, screenshots } = config
  const form = new FormData()
  form.append('type', type)
  form.append('description', description)
  form.append('page_url', context.pageUrl)
  form.append('context', JSON.stringify(context))

  // Phase 1: forward Plane creds over TLS so the backend can create the issue.
  // (Phase 2 replaces this with a Klavity Bearer token + server-side connection.)
  const { plane } = settings
  form.append('plane_token', plane.token)
  form.append('plane_workspace', plane.workspace)
  form.append('plane_project_id', plane.projectId)
  form.append('plane_host', plane.host)

  for (let i = 0; i < screenshots.length; i++) {
    const blob = await (await fetch(screenshots[i])).blob()
    form.append('screenshots', blob, `screenshot-${i}.png`)
  }

  const res = await fetch(`${settings.backendUrl}/api/feedback`, { method: 'POST', body: form })

  if (!res.ok) throw new Error(`Klavity backend error ${res.status}: ${await res.text()}`)

  const data = await res.json() as { id: string; jira_key?: string; issue_url?: string }
  return {
    issueKey: data.jira_key ?? data.id,
    issueUrl: data.issue_url ?? settings.backendUrl,
  }
}
