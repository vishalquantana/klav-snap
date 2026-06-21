import type { Connector, TicketPayload, ExportResult } from "./index"
import { safeFetch } from "../safe-fetch"

export const planeConnector: Connector = {
  type: "plane",
  label: "Plane",
  fields: [
    { key: "host", label: "API Host", placeholder: "https://api.plane.so" },
    { key: "workspace", label: "Workspace Slug", required: true },
    { key: "project_id", label: "Project ID", required: true },
    { key: "token", label: "API Key", required: true, secret: true },
    // Two-way sync (G4): shared secret sent by Plane's webhook as X-Plane-Signature.
    // Verified on inbound only; never sent outbound. Optional — blank = outbound-only.
    { key: "inbound_secret", label: "Inbound Webhook Secret (optional, for two-way sync)", secret: true },
  ],

  validate(cfg) {
    for (const k of ["workspace", "project_id", "token"] as const) {
      if (!cfg[k]) return { ok: false, error: `${k} is required` }
    }
    return { ok: true }
  },

  async createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult> {
    const host = cfg.host?.replace(/\/$/, "") || "https://api.plane.so"
    const { workspace, project_id, token } = cfg
    const apiUrl = `${host}/api/v1/workspaces/${workspace}/projects/${project_id}/issues/`

    // SSRF guard (H3): `host` is user-supplied (self-hosted Plane is allowed, but must be a
    // public https host). safeFetch validates the URL and every redirect hop (loopback /
    // private / link-local / metadata blocked, https required) before the X-API-Key is sent.
    const res = await safeFetch(
      apiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": token,
        },
        body: JSON.stringify({
          name: ticket.title,
          description_html: ticket.body,
        }),
      },
      { allowLoopbackInTest: true },
    )

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200)
      console.error(`plane upstream error ${res.status}: ${text}`)
      throw new Error(`tracker request failed (HTTP ${res.status})`)
    }

    const json = await res.json()
    const id: string = String(json.id)
    const seqId: string | null = json.sequence_id != null ? String(json.sequence_id) : null

    // URL: strip /api suffix from host for the web URL
    const webBase = host.replace(/\/api$/, "")
    const externalUrl = `${webBase}/${workspace}/projects/${project_id}/issues/${id}`
    const externalKey = seqId ?? id

    return { externalKey, externalUrl }
  },
}
