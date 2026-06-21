import type { IntegrationConfig, SubmitResult } from '../types'

export async function submitReport(config: IntegrationConfig): Promise<SubmitResult> {
  const { settings, type, description, context, screenshots, projectId, replayEvents } = config
  const form = new FormData()
  form.append('type', type)
  form.append('description', description)
  form.append('page_url', context.pageUrl)
  form.append('context', JSON.stringify(context))
  if (projectId) form.append('project_id', projectId)
  // G1 session replay: attach the rolling rrweb buffer when present.
  if (replayEvents && replayEvents.length) form.append('replay_events', JSON.stringify(replayEvents))

  // Klavity mode: signed-in user. The backend resolves their personal→team connection,
  // so the tracker token never leaves the server — we send only a Bearer token.
  const useKlavity = settings.connectionMode === 'klavity' && !!settings.klavToken
  if (!useKlavity) {
    // Direct mode (Phase 1): forward this browser's own Plane creds over TLS.
    const { plane } = settings
    form.append('plane_token', plane.token)
    form.append('plane_workspace', plane.workspace)
    form.append('plane_project_id', plane.projectId)
    form.append('plane_host', plane.host)
  }

  for (let i = 0; i < screenshots.length; i++) {
    const blob = await (await fetch(screenshots[i])).blob()
    form.append('screenshots', blob, `screenshot-${i}.png`)
  }

  const headers: Record<string, string> = useKlavity ? { Authorization: `Bearer ${settings.klavToken}` } : {}
  const res = await fetch(`${settings.backendUrl}/api/feedback`, { method: 'POST', headers, body: form })

  if (!res.ok) throw new Error(`Klavity backend error ${res.status}: ${await res.text()}`)

  const data = await res.json() as { id: string; jira_key?: string; issue_url?: string }
  return {
    issueKey: data.jira_key ?? data.id,
    issueUrl: data.issue_url ?? settings.backendUrl,
  }
}
