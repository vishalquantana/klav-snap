import type { Connector, TicketPayload, ExportResult } from "./index"

// Build an Atlassian Document Format (ADF) doc wrapping plain text.
function toAdf(text: string): object {
  return {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  }
}

export const jiraConnector: Connector = {
  type: "jira",
  label: "Jira",
  fields: [
    { key: "host", label: "Jira Host", required: true, placeholder: "https://myorg.atlassian.net" },
    { key: "email", label: "Account Email", required: true, placeholder: "user@example.com" },
    { key: "token", label: "API Token", required: true, secret: true },
    { key: "project_key", label: "Project Key", required: true, placeholder: "PROJ" },
    { key: "issue_type", label: "Issue Type", placeholder: "Task" },
  ],

  validate(cfg) {
    for (const k of ["host", "email", "token", "project_key"] as const) {
      if (!cfg[k]) return { ok: false, error: `${k} is required` }
    }
    return { ok: true }
  },

  async createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult> {
    const { host, email, token, project_key } = cfg
    const issueType = cfg.issue_type || "Task"
    const url = `${host.replace(/\/$/, "")}/rest/api/3/issue`

    const credentials = Buffer.from(`${email}:${token}`).toString("base64")

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: project_key },
          issuetype: { name: issueType },
          summary: ticket.title,
          description: toAdf(ticket.body),
        },
      }),
    })

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200)
      throw new Error(`jira ${res.status}: ${text}`)
    }

    const json = await res.json()
    const key: string = json.key
    return {
      externalKey: key,
      externalUrl: `${host.replace(/\/$/, "")}/browse/${key}`,
    }
  },
}
