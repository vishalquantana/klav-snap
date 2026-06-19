import type { Connector, TicketPayload, ExportResult } from "./index"
import { assertSafeUrl } from "../url-guard"

export const githubConnector: Connector = {
  type: "github",
  label: "GitHub Issues",
  fields: [
    { key: "owner", label: "Repository Owner", required: true, placeholder: "my-org" },
    { key: "repo", label: "Repository Name", required: true, placeholder: "my-repo" },
    { key: "token", label: "Personal Access Token", required: true, secret: true },
  ],

  validate(cfg) {
    for (const k of ["owner", "repo", "token"] as const) {
      if (!cfg[k]) return { ok: false, error: `${k} is required` }
    }
    return { ok: true }
  },

  async createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult> {
    const { owner, repo, token } = cfg
    const url = `https://api.github.com/repos/${owner}/${repo}/issues`

    // Endpoint host is fixed (api.github.com), but owner/repo are user-supplied
    // path segments. Guard for defense-in-depth — pin to github.com so a crafted
    // owner/repo can't redirect the request host, and reject private resolutions.
    await assertSafeUrl(url, { allowHosts: ["github.com"] })

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "Klavity",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: ticket.title, body: ticket.body }),
    })

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200)
      throw new Error(`github ${res.status}: ${text}`)
    }

    const json = await res.json()
    return {
      externalKey: `#${json.number}`,
      externalUrl: json.html_url,
    }
  },
}
