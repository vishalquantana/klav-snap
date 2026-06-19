import type { Connector, TicketPayload, ExportResult } from "./index"
import { safeFetch } from "../safe-fetch"

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

    // SSRF guard (H3): the entire webhook URL is user-supplied. safeFetch validates the
    // target (and every redirect hop) against the central url-guard, disables auto-redirect
    // following, and re-validates each hop — blocking loopback / private / link-local /
    // cloud-metadata targets and requiring https before any outbound POST.
    const res = await safeFetch(
      cfg.url,
      { method: "POST", headers, body: JSON.stringify({ ticket }) },
      { allowLoopbackInTest: true },
    )

    if (!res.ok) {
      // Log the upstream body server-side only; never embed it in the thrown Error (it can
      // contain attacker-influenced content / be an SSRF oracle when echoed to a client).
      const text = (await res.text().catch(() => "")).slice(0, 200)
      console.error(`webhook upstream error ${res.status}: ${text}`)
      throw new Error(`tracker request failed (HTTP ${res.status})`)
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
