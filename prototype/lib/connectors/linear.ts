import type { Connector, TicketPayload, ExportResult } from "./index"
import { assertSafeUrl } from "../url-guard"

const LINEAR_API = "https://api.linear.app/graphql"

export const linearConnector: Connector = {
  type: "linear",
  label: "Linear",
  fields: [
    { key: "api_key", label: "API Key", required: true, secret: true },
    { key: "team_id", label: "Team ID", required: true, placeholder: "TEAM-UUID" },
  ],

  validate(cfg) {
    for (const k of ["api_key", "team_id"] as const) {
      if (!cfg[k]) return { ok: false, error: `${k} is required` }
    }
    return { ok: true }
  },

  async createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult> {
    const { api_key, team_id } = cfg

    // Endpoint is a fixed first-party host (not user-controlled). Guard for
    // defense-in-depth — pin to linear.app and reject if it ever resolves to a
    // private/loopback address (e.g. DNS-rebinding) before sending the API key.
    await assertSafeUrl(LINEAR_API, { allowHosts: ["linear.app"] })

    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Authorization": api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "mutation($t:String!,$d:String!,$tm:String!){ issueCreate(input:{title:$t,description:$d,teamId:$tm}){ issue { identifier url } } }",
        variables: { t: ticket.title, d: ticket.body, tm: team_id },
      }),
    })

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200)
      throw new Error(`linear ${res.status}: ${text}`)
    }

    const json = await res.json()
    if (json.errors && json.errors.length > 0) {
      throw new Error(`linear graphql: ${json.errors[0]?.message ?? "unknown error"}`)
    }

    const issue = json?.data?.issueCreate?.issue
    return {
      externalKey: issue?.identifier ?? null,
      externalUrl: issue?.url ?? null,
    }
  },
}
