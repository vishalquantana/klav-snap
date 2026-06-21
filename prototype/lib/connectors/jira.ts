import type { Connector, TicketPayload, ExportResult } from "./index"
import { safeFetch } from "../safe-fetch"

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
    // Two-way sync (G4): shared secret you embed in the Jira webhook URL (?token=…) or send
    // as the X-Klavity-Token header. Jira Cloud webhooks aren't HMAC-signed by default, so this
    // token is the auth. Verified on inbound only; never sent outbound. Optional — blank = outbound-only.
    { key: "inbound_secret", label: "Inbound Webhook Secret (optional, for two-way sync)", secret: true },
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

    // SSRF guard (H3): `host` is user-supplied. safeFetch validates the constructed URL and
    // every redirect hop (loopback / private / link-local / metadata blocked, https required,
    // no auto-redirect to an unchecked host) before credentials are ever sent.
    const res = await safeFetch(
      url,
      {
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
      },
      { allowLoopbackInTest: true },
    )

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200)
      console.error(`jira upstream error ${res.status}: ${text}`)
      throw new Error(`tracker request failed (HTTP ${res.status})`)
    }

    const json = await res.json()
    const key: string = json.key
    return {
      externalKey: key,
      externalUrl: `${host.replace(/\/$/, "")}/browse/${key}`,
    }
  },
}
