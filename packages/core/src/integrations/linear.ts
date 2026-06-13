import type { IntegrationConfig, SubmitResult } from '../types'

export async function submitReport(config: IntegrationConfig): Promise<SubmitResult> {
  const { settings, type, description, context } = config
  const { apiKey, teamId } = settings.linear

  const body = [
    description,
    '',
    `**Page:** ${context.pageUrl}`,
    `**Browser:** ${context.userAgent}`,
  ].join('\n')

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier url }
          }
        }
      `,
      variables: {
        input: {
          teamId,
          title: `[Klav] ${description.slice(0, 180)}`,
          description: body,
          labelNames: type === 'bug' ? ['Bug'] : [],
        },
      },
    }),
  })

  const json = await res.json() as { data?: { issueCreate?: { issue?: { identifier: string; url: string } } }; errors?: Array<{ message: string }> }

  if (json.errors?.length) {
    throw new Error(`Linear API error: ${json.errors[0].message}`)
  }

  const issue = json.data?.issueCreate?.issue
  if (!issue) throw new Error('Linear: no issue returned')

  return { issueKey: issue.identifier, issueUrl: issue.url }
}
