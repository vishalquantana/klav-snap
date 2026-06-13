import type { IntegrationConfig, SubmitResult } from '../types'

function buildBody(config: IntegrationConfig): string {
  const { context, description } = config
  const errors = context.consoleErrors.map(e => `- \`${e.message}\``).join('\n') || '_none_'
  const failures = context.networkFailures.map(f => `- ${f.method} ${f.url} → ${f.status}`).join('\n') || '_none_'
  return [
    `*Page:* ${context.pageUrl}`,
    `*Browser:* ${context.userAgent}`,
    `*Screen:* ${context.screenSize}  |  *Viewport:* ${context.viewportSize}`,
    '',
    '----',
    description,
    '',
    '*Console errors:*',
    errors,
    '',
    '*Network failures:*',
    failures,
  ].join('\n')
}

export async function submitReport(config: IntegrationConfig): Promise<SubmitResult> {
  const { settings, type, description } = config
  const { baseUrl, email, token, projectKey } = settings.jira
  const auth = btoa(`${email}:${token}`)

  const issuetype = type === 'bug' ? 'Bug' : 'Story'
  const labels = type === 'bug' ? ['klav', 'klav-bug'] : ['klav', 'klav-feature']
  const summary = `[Klav] ${description.slice(0, 180)}`

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
    form.append('file', blob, `klav-screenshot-${Date.now()}.png`)
    await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'X-Atlassian-Token': 'no-check' },
      body: form,
    })
  }

  return { issueKey, issueUrl }
}
