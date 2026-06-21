import type { IntegrationConfig, SubmitResult } from '../types'

function buildBody(config: IntegrationConfig): string {
  const { context, description } = config
  // G3: render the richer captured set — all console levels (tagged) and all network requests
  // (status + timing), not just errors/failures. Level defaults to 'error' for legacy rows.
  const logs = context.consoleErrors.map(e => `- [${e.level ?? 'error'}] \`${e.message}\``).join('\n') || '_none_'
  const requests = context.networkFailures
    .map(f => `- ${f.method} ${f.url} → ${f.status}${f.durationMs != null ? ` (${f.durationMs}ms)` : ''}`)
    .join('\n') || '_none_'
  const lines = [
    `*Page:* ${context.pageUrl}`,
    `*Browser:* ${context.userAgent}`,
    `*Screen:* ${context.screenSize}  |  *Viewport:* ${context.viewportSize}`,
  ]
  // G5: surface custom identity + metadata when present.
  const idEntries = context.identity ? Object.entries(context.identity).filter(([, v]) => v != null) : []
  const metaEntries = context.metadata ? Object.entries(context.metadata) : []
  if (idEntries.length || metaEntries.length) {
    lines.push(`*User / metadata:* ${[...idEntries, ...metaEntries].map(([k, v]) => `${k}=${v}`).join(', ')}`)
  }
  return [
    ...lines,
    '',
    '----',
    description,
    '',
    '*Console:*',
    logs,
    '',
    '*Network:*',
    requests,
  ].join('\n')
}

export async function submitReport(config: IntegrationConfig): Promise<SubmitResult> {
  const { settings, type, description } = config
  const { baseUrl, email, token, projectKey } = settings.jira
  const auth = btoa(`${email}:${token}`)

  const issuetype = type === 'bug' ? 'Bug' : 'Story'
  const labels = type === 'bug' ? ['klavity', 'klavity-bug'] : ['klavity', 'klavity-feature']
  const summary = `[Klavity] ${description.slice(0, 180)}`

  const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary,
        description: { version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: buildBody(config) }] }] },
        issuetype: { name: issuetype },
        labels,
      },
    }),
  })

  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`Jira API error ${res.status}: ${msg}`)
  }

  const data = await res.json() as { key: string }
  const issueKey = data.key
  const issueUrl = `${baseUrl}/browse/${issueKey}`

  for (const dataUrl of config.screenshots) {
    const blob = await (await fetch(dataUrl)).blob()
    const form = new FormData()
    form.append('file', blob, `klavity-screenshot-${Date.now()}.png`)
    await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'X-Atlassian-Token': 'no-check' },
      body: form,
    })
  }

  return { issueKey, issueUrl }
}
