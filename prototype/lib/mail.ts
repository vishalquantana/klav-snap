// A short, on-brand line under the code — picks one deterministically from the
// code so it varies between sends but stays stable for a given code (testable,
// no Math.random). Same energy as a sign-in email that doesn't feel robotic.
const OTP_NOTES = [
  "It's not a bug — it's an undocumented feature. Let's go document it.",
  "The best time to catch a bug was in staging. The second best is now.",
  "Behind every clean release is a great bug report someone filed.",
  "Ship fast. Klavity catches what slips.",
  "Every flaky test has a story. We're here to read it.",
]
function pickNote(code: string): string {
  let h = 0
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return OTP_NOTES[h % OTP_NOTES.length]
}

// Branded, email-client-safe OTP template. Table-based + inline styles only
// (no flexbox/grid) so it renders consistently in Gmail / Outlook / Apple Mail.
// Indigo #6366f1 is the Klavity brand accent (see tokens.css --indigo).
export function otpEmailHtml(code: string): string {
  const f = "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f7">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 2px 10px rgba(20,16,40,.10)">
        <!-- dark brand band -->
        <tr><td align="center" style="background:#1e1b4b;padding:26px 28px 18px">
          <div style="${f};font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-.02em">Klavity</div>
          <div style="${f};font-size:12px;font-weight:600;color:#a5b4fc;letter-spacing:.16em;text-transform:uppercase;margin-top:4px">AI Bug Reporter</div>
        </td></tr>
        <!-- accent band -->
        <tr><td align="center" style="background:#4f46e5;background:linear-gradient(135deg,#6366f1,#4f46e5);padding:18px 28px">
          <div style="${f};font-size:19px;font-weight:700;color:#ffffff">Your sign-in code</div>
        </td></tr>
        <!-- code -->
        <tr><td style="padding:34px 32px 6px">
          <div style="border:1px solid #e6e4ff;background:#f7f6ff;border-radius:14px;padding:26px 16px;text-align:center">
            <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:40px;font-weight:700;letter-spacing:.32em;color:#4338ca">${code}</span>
          </div>
          <p style="margin:18px 0 0;${f};font-size:13px;color:#8a8696;text-align:center">Enter it to finish signing in — it works once and expires in <strong style="color:#6b6678">10 minutes</strong>.</p>
        </td></tr>
        <!-- personality callout -->
        <tr><td style="padding:22px 32px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ff;border-left:3px solid #6366f1;border-radius:8px">
            <tr><td style="padding:14px 16px">
              <div style="${f};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6366f1">✦ From the team</div>
              <div style="${f};font-size:14px;line-height:1.5;color:#3f3a52;margin-top:5px;font-style:italic">${pickNote(code)}</div>
            </td></tr>
          </table>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:18px 32px 28px">
          <div style="border-top:1px solid #eceaf2;padding-top:16px">
            <p style="margin:0;${f};font-size:12px;line-height:1.6;color:#a3a0ad">Didn't request this? You can safely ignore this email — no one can sign in without the code above.</p>
          </div>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;${f};font-size:11px;color:#b6b3c0">Sent by Klavity · AI that finds your bugs before your users do</p>
    </td></tr>
  </table>
</body></html>`
}

// Email OTP via SendGrid (raw API; no SDK). Requires a VERIFIED sender.
export async function sendOtp(to: string, code: string) {
  const key = process.env.SENDGRID_API_KEY
  const from = process.env.KLAV_MAIL_FROM || "klav@quantana.com.au"
  if (!key) throw new Error("SENDGRID_API_KEY not set")
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: "Klavity" },
      subject: `Your Klavity code: ${code}`,
      content: [
        { type: "text/plain", value: `Your Klavity sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't request it, ignore this email.` },
        { type: "text/html", value: otpEmailHtml(code) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

export async function sendLeadAlert(to: string, lead: { email: string; description: string; pageUrl: string; referrer?: string; projectName: string; feedbackUrl: string }) {
  const key = process.env.SENDGRID_API_KEY
  const from = process.env.KLAV_MAIL_FROM || "klav@quantana.com.au"
  if (!key) throw new Error("SENDGRID_API_KEY not set")
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string))
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: "Klavity Leads" },
      subject: `🌱 New Klavity lead: ${lead.email}`,
      content: [{ type: "text/html", value:
        `<div style="font-family:system-ui,sans-serif;color:#1d1d1f">
         <p><b>New lead</b> from the ${esc(lead.projectName)} widget.</p>
         <p>Email: <b>${esc(lead.email)}</b></p>
         <p>They reported: ${esc(lead.description)}</p>
         <p>Page: ${esc(lead.pageUrl)}</p>
         ${lead.referrer ? `<p>Came from: ${esc(lead.referrer)}</p>` : ""}
         <p><a href="${esc(lead.feedbackUrl)}">Open in Klavity →</a></p></div>` }],
    }),
  })
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
