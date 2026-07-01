// Founder notifications on new bug/feature reports (server.ts → POST /api/feedback persist branch).
//
// Two channels, both best-effort and invoked fire-and-forget — a notification failure must NEVER
// block or fail the feedback insert (same contract as lib/signup-alert.ts):
//
//   1. EMAIL to the project's account owner/admins (fallback: accounts.owner_email), sent via the
//      same SendGrid transport the OTP flow uses (lib/mail.ts). Flood-controlled: at most ONE email
//      per project per REPORT_ALERT_WINDOW_MS (10 min). Reports arriving inside the window bump a
//      DB-backed pending counter; the next sent email says "+N more since your last alert". State
//      lives in the `report_alert_state` table (NOT memory) so it survives deploy restarts.
//
//   2. Optional per-project SLACK webhook: when the project's modal_config_json contains a
//      `slack_webhook_url` (set via POST /api/projects/:id/config, admin-only), a compact Block-Kit
//      message is posted PER report (not throttled — Slack is a firehose channel by choice).
//      SSRF posture: the stored URL must be https://hooks.slack.com/... and the outbound POST goes
//      through safeFetch with an allowHosts pin (house pattern, see lib/signup-alert.ts).
//
// Every DB/network dependency is injectable so tests run hermetically (no SendGrid, no Slack).

import type { Client } from "@libsql/client"
import { db } from "./db"
import { sendReportAlertEmail } from "./mail"
import { safeFetch } from "./safe-fetch"

export const REPORT_ALERT_WINDOW_MS = 10 * 60 * 1000 // 1 email per project per 10 minutes

export interface ReportAlertInput {
  projectId: string
  projectName: string
  /** projects.account_id — drives the owner/admin recipient lookup. */
  accountId: string
  feedbackId: string
  reportType: "bug" | "feature"
  /** Raw user description; truncated + HTML-escaped before rendering. */
  description: string
  pageUrl: string | null
  reporterEmail: string | null
  /** True when this report deduped into an existing row (recurrence bump). */
  isRecurrence: boolean
  /** Server BASE (KLAV_BASE_URL) — the dashboard ticket link is derived from it. */
  baseUrl: string
  /** epoch ms of the report */
  at: number
}

export interface ReportAlertDeps {
  db: Client
  sendEmail: (to: string[], subject: string, html: string, text: string) => Promise<void>
  postSlack: (webhookUrl: string, payload: unknown) => Promise<void>
  windowMs: number
}

// ── throttle state (DB-backed so it survives restarts) ───────────────────────────
// One row per project: last_email_at = when we last actually sent, pending_count = reports that
// arrived (and were skipped) since then.
const ensured = new WeakSet<Client>()
export async function ensureReportAlertTable(c: Client): Promise<void> {
  if (ensured.has(c)) return
  await c.execute(
    `CREATE TABLE IF NOT EXISTS report_alert_state (
       project_id TEXT PRIMARY KEY,
       last_email_at INTEGER NOT NULL DEFAULT 0,
       pending_count INTEGER NOT NULL DEFAULT 0
     )`,
  )
  ensured.add(c)
}

/**
 * Decide whether THIS report may send an email for the project.
 *
 * Returns { send: true, missedSinceLast } when the window has elapsed (missedSinceLast = reports
 * skipped since the previous email — render as "+N more since your last alert"); the row is
 * atomically stamped (conditional UPDATE on the previous last_email_at, so two racing writers
 * can't both claim the slot). Returns { send: false } inside the window and bumps pending_count.
 */
export async function claimAlertSlot(
  c: Client, projectId: string, now: number, windowMs: number = REPORT_ALERT_WINDOW_MS,
): Promise<{ send: boolean; missedSinceLast: number }> {
  await ensureReportAlertTable(c)
  await c.execute({
    sql: "INSERT OR IGNORE INTO report_alert_state (project_id, last_email_at, pending_count) VALUES (?, 0, 0)",
    args: [projectId],
  })
  const cur = await c.execute({
    sql: "SELECT last_email_at, pending_count FROM report_alert_state WHERE project_id=?",
    args: [projectId],
  })
  const last = Number((cur.rows[0] as any)?.last_email_at || 0)
  const pending = Number((cur.rows[0] as any)?.pending_count || 0)

  // last=0 means "never emailed for this project" → always send (don't treat epoch 0 as recent).
  if (last === 0 || now - last >= windowMs) {
    // Atomic claim: only succeeds if nobody else stamped the row since our SELECT.
    const claim = await c.execute({
      sql: "UPDATE report_alert_state SET last_email_at=?, pending_count=0 WHERE project_id=? AND last_email_at=?",
      args: [now, projectId, last],
    })
    if ((claim.rowsAffected ?? 0) > 0) return { send: true, missedSinceLast: pending }
    // Lost the race — a concurrent report just claimed the slot; this one becomes a pending bump.
  }
  await c.execute({
    sql: "UPDATE report_alert_state SET pending_count=pending_count+1 WHERE project_id=?",
    args: [projectId],
  })
  return { send: false, missedSinceLast: 0 }
}

// ── recipients: account owner + admins; fallback to accounts.owner_email ─────────
export async function alertRecipients(c: Client, accountId: string): Promise<string[]> {
  const r = await c.execute({
    sql: `SELECT email FROM account_members WHERE account_id=? AND account_role IN ('owner','admin')
          ORDER BY CASE account_role WHEN 'owner' THEN 0 ELSE 1 END, created_at ASC, email ASC`,
    args: [accountId],
  })
  let emails = r.rows.map((x: any) => String(x.email).trim().toLowerCase()).filter(Boolean)
  if (!emails.length) {
    const o = await c.execute({ sql: "SELECT owner_email FROM accounts WHERE id=?", args: [accountId] })
    const owner = o.rows.length ? String((o.rows[0] as any).owner_email || "").trim().toLowerCase() : ""
    if (owner) emails = [owner]
  }
  return [...new Set(emails)]
}

// ── per-project Slack webhook (modal_config_json.slack_webhook_url) ──────────────
// Only https://hooks.slack.com/ URLs are honored — anything else stored in the config is ignored
// (defense in depth; the write path validates too, and safeFetch pins the host again at send time).
export async function projectSlackWebhook(c: Client, projectId: string): Promise<string | null> {
  try {
    const r = await c.execute({ sql: "SELECT modal_config_json FROM projects WHERE id=?", args: [projectId] })
    if (!r.rows.length) return null
    const cfg = JSON.parse(String((r.rows[0] as any).modal_config_json || "{}")) || {}
    const raw = typeof cfg.slack_webhook_url === "string" ? cfg.slack_webhook_url.trim() : ""
    return /^https:\/\/hooks\.slack\.com\//.test(raw) && raw.length <= 500 ? raw : null
  } catch {
    return null
  }
}

// ── formatting ────────────────────────────────────────────────────────────────────
const DESCRIPTION_PREVIEW_CHARS = 200

export function truncate(s: string, n: number): string {
  const t = String(s || "")
  return t.length > n ? t.slice(0, n - 3) + "..." : t
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch] as string))
}

export function ticketUrl(input: Pick<ReportAlertInput, "baseUrl" | "projectId">): string {
  // The dashboard's Tickets view is hash-routed (#tickets); project selection is a query param —
  // same shape the lead alert (/api/widget/lead) already links to, plus the tickets hash.
  return `${input.baseUrl.replace(/\/+$/, "")}/dashboard?project=${encodeURIComponent(input.projectId)}#tickets`
}

export function buildReportEmail(
  input: ReportAlertInput, missedSinceLast: number,
): { subject: string; html: string; text: string } {
  const kind = input.reportType === "feature" ? "feature request" : "bug report"
  const desc = truncate(input.description, DESCRIPTION_PREVIEW_CHARS)
  const link = ticketUrl(input)
  const more = missedSinceLast > 0 ? `+${missedSinceLast} more since your last alert` : ""

  const subject = `New ${kind} on ${input.projectName}` + (missedSinceLast > 0 ? ` (+${missedSinceLast} more)` : "")

  const textLines = [
    `New ${kind} on ${input.projectName}${input.isRecurrence ? " (recurring issue)" : ""}`,
    "",
    desc,
    "",
    input.pageUrl ? `Page: ${input.pageUrl}` : "",
    input.reporterEmail ? `Reported by: ${input.reporterEmail}` : "",
    more,
    "",
    `Open the ticket: ${link}`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "")
  const text = textLines.join("\n")

  // Plain, tasteful, table-free HTML consistent with sendLeadAlert (lib/mail.ts) — inline styles only.
  const f = "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
  const html = `<div style="${f};color:#1d1d24;max-width:560px">
  <p style="margin:0 0 12px;font-size:15px"><b>New ${escapeHtml(kind)}</b> on <b>${escapeHtml(input.projectName)}</b>${input.isRecurrence ? ' <span style="color:#8a8696">(recurring issue)</span>' : ""}</p>
  <div style="border:1px solid #e6e4ff;background:#f7f6ff;border-radius:10px;padding:14px 16px;margin:0 0 14px">
    <p style="margin:0;font-size:14px;line-height:1.55;color:#3f3a52">${escapeHtml(desc)}</p>
  </div>
  ${input.pageUrl ? `<p style="margin:0 0 6px;font-size:13px;color:#6b6678">Page: ${escapeHtml(input.pageUrl)}</p>` : ""}
  ${input.reporterEmail ? `<p style="margin:0 0 6px;font-size:13px;color:#6b6678">Reported by: <b>${escapeHtml(input.reporterEmail)}</b></p>` : ""}
  ${more ? `<p style="margin:0 0 6px;font-size:13px;color:#6366f1"><b>${escapeHtml(more)}</b></p>` : ""}
  <p style="margin:16px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Open in Klavity</a></p>
  <p style="margin:18px 0 0;font-size:11px;color:#b6b3c0">Sent by Klavity when a new report lands on your project. At most one email per project every 10 minutes.</p>
</div>`

  return { subject, html, text }
}

// Compact Block-Kit payload, modeled on lib/signup-alert.ts (no emoji — CI guard).
export function buildReportSlackPayload(input: ReportAlertInput): { text: string; blocks: unknown[] } {
  const kind = input.reportType === "feature" ? "Feature request" : "Bug report"
  const desc = truncate(input.description, DESCRIPTION_PREVIEW_CHARS)
  const link = ticketUrl(input)
  const fields: Array<{ type: string; text: string }> = [
    { type: "mrkdwn", text: `*Project*\n${input.projectName}` },
    { type: "mrkdwn", text: `*Type*\n${kind}${input.isRecurrence ? " (recurring)" : ""}` },
  ]
  if (input.pageUrl) fields.push({ type: "mrkdwn", text: `*Page*\n${truncate(input.pageUrl, 120)}` })
  if (input.reporterEmail) fields.push({ type: "mrkdwn", text: `*Reporter*\n${input.reporterEmail}` })
  return {
    text: `New ${kind.toLowerCase()} on ${input.projectName}: ${truncate(input.description, 80)}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `New ${kind.toLowerCase()}: ${input.projectName}`, emoji: false } },
      { type: "section", text: { type: "mrkdwn", text: `>${desc.replace(/\n/g, "\n>")}` } },
      { type: "section", fields },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Klavity", emoji: false }, url: link }] },
    ],
  }
}

// ── default transports ────────────────────────────────────────────────────────────
async function defaultPostSlack(webhookUrl: string, payload: unknown): Promise<void> {
  const res = await safeFetch(
    webhookUrl,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    { allowHosts: ["hooks.slack.com"] },
  )
  if (!res.ok) console.error(`report slack alert: webhook returned ${res.status}`)
}

// ── orchestration ──────────────────────────────────────────────────────────────────
/**
 * Fire-and-forget entrypoint called from POST /api/feedback after the row persists.
 * NEVER throws — every path (throttle DB, SendGrid, Slack) is guarded independently so a
 * notification failure can't fail the feedback insert, and an email failure can't stop Slack.
 */
export async function notifyNewReport(
  input: ReportAlertInput, overrides: Partial<ReportAlertDeps> = {},
): Promise<void> {
  try {
    const c = overrides.db ?? db
    if (!c) return // no DB configured (local dev without Turso) → nothing to do
    const windowMs = overrides.windowMs ?? REPORT_ALERT_WINDOW_MS
    const sendEmail = overrides.sendEmail ?? sendReportAlertEmail
    const postSlack = overrides.postSlack ?? defaultPostSlack

    // 1. Email — throttled per project (DB-backed, restart-safe).
    try {
      const slot = await claimAlertSlot(c, input.projectId, input.at, windowMs)
      if (slot.send) {
        const to = await alertRecipients(c, input.accountId)
        if (to.length) {
          const { subject, html, text } = buildReportEmail(input, slot.missedSinceLast)
          await sendEmail(to, subject, html, text)
        }
      }
    } catch (err: any) {
      console.error("report alert email (non-fatal):", err?.message || err)
    }

    // 2. Slack — per report, only when the project config carries a hooks.slack.com URL.
    try {
      const hook = await projectSlackWebhook(c, input.projectId)
      if (hook) await postSlack(hook, buildReportSlackPayload(input))
    } catch (err: any) {
      console.error("report alert slack (non-fatal):", err?.message || err)
    }
  } catch (err: any) {
    console.error("report alert (non-fatal):", err?.message || err)
  }
}
