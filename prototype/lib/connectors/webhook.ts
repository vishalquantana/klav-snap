import type { Connector, TicketPayload, ExportResult } from "./index"
import { guardConnectorUrl } from "./guard"

export const webhookConnector: Connector = {
  type: "webhook",
  label: "Webhook",
  fields: [
    { key: "url", label: "Webhook URL", required: true, placeholder: "https://hooks.example.com/..." },
    { key: "secret", label: "Secret / Bearer token", secret: true, placeholder: "Optional — sent as X-Klavity-Signature" },
  ],

  validate(cfg) {
    if (!cfg.url) return { ok: false, error: "url is required" }
    return { ok: true }
  },

  async createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (cfg.secret) headers["X-Klavity-Signature"] = cfg.secret

    // SSRF guard (H3): the entire webhook URL is user-supplied. Block loopback /
    // private / link-local / cloud-metadata targets and require https before the
    // outbound POST. Throws a log-safe Error that callers record as a failed export.
    await guardConnectorUrl(cfg.url)

    const res = await fetch(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ticket }),
    })

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200)
      throw new Error(`webhook ${res.status}: ${text}`)
    }

    // Best-effort parse; non-JSON 2xx still counts as success.
    let externalKey: string | null = null
    try {
      const json = await res.json()
      externalKey = (json?.id ?? json?.key ?? null) !== undefined
        ? String(json.id ?? json.key)
        : null
      // Treat "null" / "undefined" strings from coercion as null
      if (externalKey === "null" || externalKey === "undefined") externalKey = null
    } catch {
      // non-JSON body → leave externalKey null
    }

    return { externalUrl: cfg.url, externalKey }
  },
}
