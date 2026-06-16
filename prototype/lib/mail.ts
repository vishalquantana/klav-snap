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
      from: { email: from, name: "Klav" },
      subject: `Your Klav code: ${code}`,
      content: [
        { type: "text/plain", value: `Your Klav sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't request it, ignore this email.` },
        { type: "text/html", value: `<div style="font-family:system-ui,sans-serif;color:#1d1d1f"><p>Your Klav sign-in code:</p><p style="font-size:34px;font-weight:800;letter-spacing:.22em;font-family:ui-monospace,monospace">${code}</p><p style="color:#888;font-size:13px">Expires in 10 minutes.</p></div>` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
