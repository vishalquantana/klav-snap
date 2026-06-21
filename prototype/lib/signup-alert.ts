// Slack alert on new-user signup (server.ts → POST /api/auth/verify, wasNew branch).
//
// Klavity signup is email-OTP, so the stored user record is thin (email + created_at). This
// module enriches that with everything we can derive for free at the request moment:
//   • email domain → corporate-vs-freemail + inferred company + Clearbit logo + Gravatar
//   • IP geolocation (country/city/ISP/ASN/proxy-VPN-hosting flags) via ip-api.com (free, no key)
//   • User-Agent → browser / OS / device
//   • referer/origin → acquisition source
// then posts a Block-Kit message to SLACK_SIGNUP_WEBHOOK_URL.
//
// It is best-effort and MUST NOT affect signup: every path is guarded and the caller invokes it
// fire-and-forget. Set SLACK_SIGNUP_WEBHOOK_URL to enable; unset → silent no-op.

import { createHash } from "node:crypto"
import { safeFetch } from "./safe-fetch"
import { ipBlockReason } from "./url-guard"

export interface SignupContext {
  email: string
  ip: string
  userAgent?: string
  referer?: string
  /** epoch ms of the signup */
  at: number
}

// ── email ─────────────────────────────────────────────────────────────────────
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
  "protonmail.com", "pm.me", "gmx.com", "gmx.net", "mail.com", "yandex.com", "zoho.com",
  "fastmail.com", "hey.com", "tutanota.com", "qq.com", "163.com", "126.com",
])

export interface EmailInfo {
  local: string
  domain: string
  isFreeProvider: boolean
  /** Inferred company name from a corporate domain ("acme.io" → "Acme"); null for freemail. */
  company: string | null
  logoUrl: string | null
  gravatarUrl: string
}

export function parseEmail(email: string): EmailInfo {
  const e = String(email || "").trim().toLowerCase()
  const at = e.lastIndexOf("@")
  const local = at >= 0 ? e.slice(0, at) : e
  const domain = at >= 0 ? e.slice(at + 1) : ""
  const isFreeProvider = FREE_EMAIL_DOMAINS.has(domain)
  const company = domain && !isFreeProvider ? companyFromDomain(domain) : null
  const logoUrl = company ? `https://logo.clearbit.com/${domain}` : null
  return { local, domain, isFreeProvider, company, logoUrl, gravatarUrl: gravatarUrl(e) }
}

// Common two-level public suffixes so "quantana.com.au" → "Quantana", not "Com".
const TWO_LEVEL_SUFFIXES = new Set([
  "com.au", "net.au", "org.au", "co.uk", "org.uk", "me.uk", "co.nz", "co.za", "co.in",
  "co.jp", "com.br", "com.sg", "com.mx", "com.tr", "com.cn", "co.kr", "com.hk",
])

function companyFromDomain(domain: string): string {
  // Strip the registrable public suffix, then title-case the org label.
  const parts = domain.split(".")
  let idx = parts.length - 2 // label before a single-level TLD (acme.io → "acme")
  if (parts.length >= 3 && TWO_LEVEL_SUFFIXES.has(parts.slice(-2).join("."))) {
    idx = parts.length - 3 // label before a two-level suffix (quantana.com.au → "quantana")
  }
  const label = parts[Math.max(0, idx)] || domain
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function gravatarUrl(email: string): string {
  const hash = createHash("md5").update(String(email || "").trim().toLowerCase()).digest("hex")
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=128`
}

// ── user-agent ────────────────────────────────────────────────────────────────
export interface UaInfo { browser: string; os: string; device: string }

export function parseUserAgent(ua?: string): UaInfo {
  const s = ua || ""
  if (!s) return { browser: "unknown", os: "unknown", device: "unknown" }

  let os = "unknown"
  if (/Windows NT 10/.test(s)) os = "Windows 10/11"
  else if (/Windows/.test(s)) os = "Windows"
  else if (/iPhone|iPad|iPod/.test(s)) os = "iOS"
  else if (/Mac OS X/.test(s)) os = "macOS"
  else if (/Android/.test(s)) os = "Android"
  else if (/Linux/.test(s)) os = "Linux"
  else if (/CrOS/.test(s)) os = "ChromeOS"

  let browser = "unknown"
  // Order matters: Edge/Opera/Brave masquerade as Chrome; Chrome masquerades as Safari.
  if (/Edg\//.test(s)) browser = "Edge"
  else if (/OPR\/|Opera/.test(s)) browser = "Opera"
  else if (/Brave/.test(s)) browser = "Brave"
  else if (/Firefox\//.test(s)) browser = "Firefox"
  else if (/Chrome\//.test(s)) browser = "Chrome"
  else if (/Safari\//.test(s)) browser = "Safari"
  else if (/bot|crawl|spider|HeadlessChrome/i.test(s)) browser = "Bot/Headless"

  let device = "Desktop"
  if (/iPad|Tablet/.test(s)) device = "Tablet"
  else if (/Mobi|iPhone|Android.*Mobile/.test(s)) device = "Mobile"
  if (/bot|crawl|spider|HeadlessChrome/i.test(s)) device = "Bot"

  return { browser, os, device }
}

// ── geo (ip-api.com, free tier = HTTP only) ─────────────────────────────────────
//
// The free ip-api endpoint is plaintext HTTP; HTTPS needs a paid key. We therefore call it with a
// plain fetch rather than safeFetch (which mandates HTTPS). This is safe in THIS narrow case: the
// host is a hardcoded constant (no user-controlled target → no SSRF), no secret/auth header is
// attached, and the only request data is the user's already-public IP. Do NOT copy this pattern for
// user-supplied URLs — those must go through safeFetch.
const IP_API_FIELDS = "status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query"

export interface GeoInfo {
  country?: string
  countryCode?: string
  regionName?: string
  city?: string
  zip?: string
  lat?: number
  lon?: number
  timezone?: string
  isp?: string
  org?: string
  as?: string
  asname?: string
  reverse?: string
  mobile?: boolean
  proxy?: boolean
  hosting?: boolean
  query?: string
}

export async function geoLookup(ip: string): Promise<GeoInfo | null> {
  // Skip private/loopback/unknown IPs (local dev) — ip-api can't resolve them anyway.
  if (!ip || ip === "unknown") return null
  if (ipBlockReason(ip)) return null
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${IP_API_FIELDS}`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const j: any = await res.json()
    if (!j || j.status !== "success") return null
    return j as GeoInfo
  } catch {
    return null
  }
}

// ── formatting ──────────────────────────────────────────────────────────────────
export function flagEmoji(cc?: string): string {
  if (!cc || cc.length !== 2 || !/^[a-zA-Z]{2}$/.test(cc)) return ""
  const base = 0x1f1e6
  const up = cc.toUpperCase()
  return String.fromCodePoint(base + (up.charCodeAt(0) - 65), base + (up.charCodeAt(1) - 65))
}

export function formatIST(ms: number): string {
  // Always render in IST regardless of the host timezone.
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(ms)) + " IST"
}

function field(label: string, value: string) {
  return { type: "mrkdwn", text: `*${label}*\n${value}` }
}

export function buildSlackPayload(ctx: SignupContext, geo: GeoInfo | null, em: EmailInfo, ua: UaInfo) {
  const locParts = [geo?.city, geo?.regionName, geo?.country].filter(Boolean)
  const location = locParts.length ? `${flagEmoji(geo?.countryCode)} ${locParts.join(", ")}`.trim() : "—"

  const network = geo?.isp || geo?.org
    ? `${geo?.isp || geo?.org || ""}${geo?.as ? ` (${geo.as})` : ""}`.trim()
    : "—"

  const riskFlags: string[] = []
  if (geo?.proxy) riskFlags.push("⚠️ proxy/VPN")
  if (geo?.hosting) riskFlags.push("🏢 hosting/datacenter")
  if (geo?.mobile) riskFlags.push("📱 mobile network")
  if (ua.device === "Bot" || ua.browser === "Bot/Headless") riskFlags.push("🤖 bot/headless")

  const fields = [
    field("Email", `\`${ctx.email}\``),
    field("Company", em.company ? `${em.company} (${em.domain})` : `Personal · ${em.domain || "—"}`),
    field("Location", location),
    field("Network", network),
    field("Device", `${ua.browser} · ${ua.os} · ${ua.device}`),
    field("IP", `\`${ctx.ip}\`${geo?.reverse ? ` · ${geo.reverse}` : ""}`),
    field("Source", ctx.referer ? `<${ctx.referer}|${truncate(ctx.referer, 60)}>` : "Direct / unknown"),
    field("Signed up", formatIST(ctx.at)),
  ]
  if (em.logoUrl) fields.push(field("Logo", `<${em.logoUrl}|company logo>`))

  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: "🎉 New Klavity signup", emoji: true } },
    {
      type: "section",
      fields,
      accessory: { type: "image", image_url: em.logoUrl || em.gravatarUrl, alt_text: em.company || ctx.email },
    },
  ]
  if (riskFlags.length) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: riskFlags.join("  ·  ") }] })
  }
  if (ctx.userAgent) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `UA: \`${truncate(ctx.userAgent, 230)}\`` }] })
  }

  return { text: `🎉 New Klavity signup: ${ctx.email}${em.company ? ` (${em.company})` : ""}`, blocks }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

// ── orchestration ─────────────────────────────────────────────────────────────
export async function notifyNewSignup(ctx: SignupContext): Promise<void> {
  const webhook = process.env.SLACK_SIGNUP_WEBHOOK_URL
  if (!webhook) return // disabled

  try {
    const em = parseEmail(ctx.email)
    const ua = parseUserAgent(ctx.userAgent)
    const geo = await geoLookup(ctx.ip)
    const payload = buildSlackPayload(ctx, geo, em, ua)

    const res = await safeFetch(
      webhook,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
      { allowHosts: ["hooks.slack.com"] },
    )
    if (!res.ok) console.error(`signup slack alert: webhook returned ${res.status}`)
  } catch (err: any) {
    console.error("signup slack alert (non-fatal):", err?.message || err)
  }
}
