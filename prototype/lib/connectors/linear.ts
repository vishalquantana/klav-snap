import type { Connector, TicketPayload, ExportResult } from "./index"
import { safeFetch } from "../safe-fetch"

const LINEAR_API = "https://api.linear.app/graphql"

export const linearConnector: Connector = {
  type: "linear",
  label: "Linear",
  fields: [
    { key: "api_key", label: "API Key", required: true, secret: true },
    { key: "team_id", label: "Team ID", required: true, placeholder: "TEAM-UUID" },
    // Two-way sync (G4): the webhook signing secret Linear shows when you create the webhook.
    // Used ONLY to verify inbound Linear-Signature (HMAC-SHA256); never sent outbound. Optional —
    // leave blank to keep this connector outbound-only.
    { key: "inbound_secret", label: "Inbound Webhook Secret (optional, for two-way sync)", secret: true },
  ],

  validate(cfg) {
    for (const k of ["api_key", "team_id"] as const) {
      if (!cfg[k]) return { ok: false, error: `${k} is required` }
    }
    return { ok: true }
  },

  async createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult> {
    const { api_key, team_id } = cfg

    // Endpoint is a fixed first-party host (not user-controlled). safeFetch pins to
    // linear.app and re-validates every hop — rejecting any private/loopback resolution
    // (e.g. DNS-rebinding) or a redirect off-host before sending the API key.
    const res = await safeFetch(
      LINEAR_API,
      {
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
      },
      { allowHosts: ["linear.app"] },
    )

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200)
      console.error(`linear upstream error ${res.status}: ${text}`)
      throw new Error(`tracker request failed (HTTP ${res.status})`)
    }

    const json = await res.json()
    if (json.errors && json.errors.length > 0) {
      console.error(`linear graphql error: ${json.errors[0]?.message ?? "unknown error"}`)
      throw new Error("tracker request failed (GraphQL error)")
    }

    const issue = json?.data?.issueCreate?.issue
    return {
      externalKey: issue?.identifier ?? null,
      externalUrl: issue?.url ?? null,
    }
  },
}
