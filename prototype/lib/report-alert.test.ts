// prototype/lib/report-alert.test.ts — founder notifications on new reports.
// Hermetic: in-memory libsql + injected mail/Slack mocks (no SendGrid, no network).
import { test, expect } from "bun:test"
import { createClient, type Client } from "@libsql/client"
import { applySchema } from "./db"
import {
  claimAlertSlot, alertRecipients, projectSlackWebhook, buildReportEmail,
  buildReportSlackPayload, notifyNewReport, ticketUrl, REPORT_ALERT_WINDOW_MS,
  type ReportAlertInput,
} from "./report-alert"

const WINDOW = REPORT_ALERT_WINDOW_MS

async function fresh(): Promise<Client> {
  const c = createClient({ url: "file::memory:" })
  await applySchema(c)
  // modal_config_json arrives via ALTER in initDb (prod); mirror it for the in-memory schema.
  await c.execute("ALTER TABLE projects ADD COLUMN modal_config_json TEXT DEFAULT '{}'").catch(() => {})
  return c
}

async function seedProject(c: Client, opts: { slackUrl?: string; admins?: Array<[string, string]>; ownerEmail?: string } = {}) {
  const now = Date.now()
  await c.execute({
    sql: "INSERT INTO accounts (id,name,owner_email,created_at) VALUES (?,?,?,?)",
    args: ["acct_1", "Acme", opts.ownerEmail ?? "vishal@quantana.com.au", now],
  })
  for (const [email, role] of opts.admins ?? []) {
    await c.execute({
      sql: "INSERT INTO account_members (id,account_id,email,account_role,created_at) VALUES (?,?,?,?,?)",
      args: [`am_${email}`, "acct_1", email, role, now],
    })
  }
  await c.execute({
    sql: "INSERT INTO projects (id,account_id,name,created_at,updated_at,modal_config_json) VALUES (?,?,?,?,?,?)",
    args: ["proj_1", "acct_1", "Acme Web", now, now, JSON.stringify(opts.slackUrl ? { theme: "light", slack_webhook_url: opts.slackUrl } : { theme: "light" })],
  })
}

function input(over: Partial<ReportAlertInput> = {}): ReportAlertInput {
  return {
    projectId: "proj_1", projectName: "Acme Web", accountId: "acct_1", feedbackId: "fb_1",
    reportType: "bug", description: "Checkout button does nothing on click",
    pageUrl: "https://acme.example/checkout", reporterEmail: "vishal@quantana.com.au",
    isRecurrence: false, baseUrl: "https://klavity.in", at: 1_000_000_000_000,
    ...over,
  }
}

// ── throttle (claimAlertSlot) ──────────────────────────────────────────────────────

test("first report for a project sends immediately", async () => {
  const c = await fresh()
  const slot = await claimAlertSlot(c, "proj_1", 1000, WINDOW)
  expect(slot).toEqual({ send: true, missedSinceLast: 0 })
})

test("second report inside the window is throttled and counted", async () => {
  const c = await fresh()
  const t0 = 1_000_000
  expect((await claimAlertSlot(c, "proj_1", t0, WINDOW)).send).toBe(true)
  expect((await claimAlertSlot(c, "proj_1", t0 + 1000, WINDOW)).send).toBe(false)
  expect((await claimAlertSlot(c, "proj_1", t0 + 2000, WINDOW)).send).toBe(false)
  // window elapses → sends again, reporting the 2 skipped reports
  const slot = await claimAlertSlot(c, "proj_1", t0 + WINDOW, WINDOW)
  expect(slot).toEqual({ send: true, missedSinceLast: 2 })
  // counter reset after the send
  const next = await claimAlertSlot(c, "proj_1", t0 + 2 * WINDOW, WINDOW)
  expect(next).toEqual({ send: true, missedSinceLast: 0 })
})

test("throttle state is per project", async () => {
  const c = await fresh()
  expect((await claimAlertSlot(c, "proj_a", 1000, WINDOW)).send).toBe(true)
  expect((await claimAlertSlot(c, "proj_b", 2000, WINDOW)).send).toBe(true) // separate project, own slot
  expect((await claimAlertSlot(c, "proj_a", 3000, WINDOW)).send).toBe(false)
})

test("throttle state survives a 'restart' (fresh in-process caller, same DB)", async () => {
  // State is in the DB, not module memory: a second claim with the same client after the first
  // send is refused purely from the persisted row.
  const c = await fresh()
  await claimAlertSlot(c, "proj_1", 5000, WINDOW)
  const r = await c.execute("SELECT last_email_at, pending_count FROM report_alert_state WHERE project_id='proj_1'")
  expect(Number((r.rows[0] as any).last_email_at)).toBe(5000)
  expect(Number((r.rows[0] as any).pending_count)).toBe(0)
})

// ── recipients ─────────────────────────────────────────────────────────────────────

test("recipients = account owner + admins, not plain members", async () => {
  const c = await fresh()
  await seedProject(c, {
    admins: [
      ["owner@acme.io", "owner"],
      ["admin@acme.io", "admin"],
      ["member@acme.io", "member"],
    ],
  })
  expect(await alertRecipients(c, "acct_1")).toEqual(["owner@acme.io", "admin@acme.io"])
})

test("recipients fall back to accounts.owner_email when no member rows exist", async () => {
  const c = await fresh()
  await seedProject(c, { ownerEmail: "vishal@quantana.com.au" })
  expect(await alertRecipients(c, "acct_1")).toEqual(["vishal@quantana.com.au"])
})

// ── Slack webhook config ───────────────────────────────────────────────────────────

test("projectSlackWebhook reads modal_config_json.slack_webhook_url", async () => {
  const c = await fresh()
  await seedProject(c, { slackUrl: "https://hooks.slack.com/services/T0/B0/xyz" })
  expect(await projectSlackWebhook(c, "proj_1")).toBe("https://hooks.slack.com/services/T0/B0/xyz")
})

test("projectSlackWebhook rejects non-hooks.slack.com and missing config", async () => {
  const c = await fresh()
  await seedProject(c, { slackUrl: "https://evil.example/hook" })
  expect(await projectSlackWebhook(c, "proj_1")).toBeNull()
  expect(await projectSlackWebhook(c, "proj_missing")).toBeNull()
})

// ── content builders ───────────────────────────────────────────────────────────────

test("email carries project, type, truncated description, page, reporter, and ticket link", async () => {
  const longDesc = "x".repeat(400)
  const { subject, html, text } = buildReportEmail(input({ description: longDesc }), 0)
  expect(subject).toBe("New bug report on Acme Web")
  expect(html).toContain("Acme Web")
  expect(html).toContain("x".repeat(197) + "...") // first ~200 chars only
  expect(html).not.toContain("x".repeat(201))
  expect(html).toContain("https://acme.example/checkout")
  expect(html).toContain("vishal@quantana.com.au")
  expect(html).toContain("https://klavity.in/dashboard?project=proj_1#tickets")
  expect(text).toContain("https://klavity.in/dashboard?project=proj_1#tickets")
})

test("email batches the skipped count into subject and body", async () => {
  const { subject, html } = buildReportEmail(input({ reportType: "feature" }), 3)
  expect(subject).toBe("New feature request on Acme Web (+3 more)")
  expect(html).toContain("+3 more since your last alert")
})

test("email HTML-escapes user-controlled fields", async () => {
  const { html } = buildReportEmail(input({ description: '<img src=x onerror=alert(1)>', projectName: 'A<b>&"c' }), 0)
  expect(html).not.toContain("<img src=x")
  expect(html).toContain("&lt;img")
  expect(html).toContain("A&lt;b&gt;&amp;&quot;c")
})

test("slack payload is compact Block-Kit with a ticket button", async () => {
  const p = buildReportSlackPayload(input({ isRecurrence: true }))
  expect(p.text).toContain("Acme Web")
  const blocks = p.blocks as any[]
  expect(blocks[0].type).toBe("header")
  expect(JSON.stringify(blocks)).toContain("(recurring)")
  const actions = blocks.find((b) => b.type === "actions")
  expect(actions.elements[0].url).toBe(ticketUrl(input()))
})

// ── notifyNewReport orchestration ──────────────────────────────────────────────────

test("notifyNewReport emails owner/admins and posts Slack when configured", async () => {
  const c = await fresh()
  await seedProject(c, { admins: [["owner@acme.io", "owner"]], slackUrl: "https://hooks.slack.com/services/T0/B0/xyz" })
  const mails: any[] = [], hooks: any[] = []
  await notifyNewReport(input(), {
    db: c,
    sendEmail: async (to, subject, html, text) => { mails.push({ to, subject, html, text }) },
    postSlack: async (url, payload) => { hooks.push({ url, payload }) },
  })
  expect(mails.length).toBe(1)
  expect(mails[0].to).toEqual(["owner@acme.io"])
  expect(mails[0].subject).toBe("New bug report on Acme Web")
  expect(hooks.length).toBe(1)
  expect(hooks[0].url).toBe("https://hooks.slack.com/services/T0/B0/xyz")
})

test("second report inside the window: no email, but Slack still fires per report", async () => {
  const c = await fresh()
  await seedProject(c, { admins: [["owner@acme.io", "owner"]], slackUrl: "https://hooks.slack.com/services/T0/B0/xyz" })
  const mails: any[] = [], hooks: any[] = []
  const deps = {
    db: c,
    sendEmail: async (...a: any[]) => { mails.push(a) },
    postSlack: async (...a: any[]) => { hooks.push(a) },
  }
  await notifyNewReport(input({ at: 1_000_000 }), deps)
  await notifyNewReport(input({ at: 1_000_000 + 1000, feedbackId: "fb_2" }), deps)
  expect(mails.length).toBe(1)
  expect(hooks.length).toBe(2)
  // next window's email carries the batched count
  await notifyNewReport(input({ at: 1_000_000 + WINDOW, feedbackId: "fb_3" }), deps)
  expect(mails.length).toBe(2)
  expect(mails[1][1]).toContain("(+1 more)")
})

test("no Slack webhook configured: email only, no webhook call", async () => {
  const c = await fresh()
  await seedProject(c, { admins: [["owner@acme.io", "owner"]] })
  const mails: any[] = [], hooks: any[] = []
  await notifyNewReport(input(), {
    db: c,
    sendEmail: async (...a: any[]) => { mails.push(a) },
    postSlack: async (...a: any[]) => { hooks.push(a) },
  })
  expect(mails.length).toBe(1)
  expect(hooks.length).toBe(0)
})

test("notifyNewReport NEVER throws: mail transport failure", async () => {
  const c = await fresh()
  await seedProject(c, { admins: [["owner@acme.io", "owner"]], slackUrl: "https://hooks.slack.com/services/T0/B0/xyz" })
  const hooks: any[] = []
  await expect(notifyNewReport(input(), {
    db: c,
    sendEmail: async () => { throw new Error("SendGrid 500") },
    postSlack: async (...a: any[]) => { hooks.push(a) },
  })).resolves.toBeUndefined()
  expect(hooks.length).toBe(1) // email failure must not stop the Slack channel
})

test("notifyNewReport NEVER throws: Slack failure and broken DB", async () => {
  const c = await fresh()
  await seedProject(c, { slackUrl: "https://hooks.slack.com/services/T0/B0/xyz" })
  await expect(notifyNewReport(input(), {
    db: c,
    sendEmail: async () => {},
    postSlack: async () => { throw new Error("slack down") },
  })).resolves.toBeUndefined()

  // A client whose every call explodes (e.g. DB unreachable mid-deploy) still resolves cleanly.
  const broken = { execute: async () => { throw new Error("db gone") } } as unknown as Client
  await expect(notifyNewReport(input(), {
    db: broken,
    sendEmail: async () => { throw new Error("unreachable") },
    postSlack: async () => { throw new Error("unreachable") },
  })).resolves.toBeUndefined()
})

test("no recipients resolvable: claim still consumed, no crash, no email", async () => {
  const c = await fresh()
  // No accounts/members seeded at all — recipients are empty.
  await c.execute({ sql: "INSERT INTO projects (id,account_id,name,created_at,updated_at) VALUES ('proj_1','acct_none','P',1,1)", args: [] })
  const mails: any[] = []
  await notifyNewReport(input(), {
    db: c,
    sendEmail: async (...a: any[]) => { mails.push(a) },
    postSlack: async () => {},
  })
  expect(mails.length).toBe(0)
})
