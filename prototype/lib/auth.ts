// Auth helpers: random tokens, email allowlist, cookie (de)serialisation.

export function token(bytes = 32): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// 6-digit numeric one-time code.
export function otp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
  return String(n).padStart(6, "0")
}

// Allow all if no allowlist configured; otherwise require email or its domain to be listed.
export function emailAllowed(email: string): boolean {
  const domains = (process.env.KLAV_ALLOWED_DOMAINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  const emails = (process.env.KLAV_ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (!domains.length && !emails.length) return true
  const e = email.toLowerCase()
  if (emails.includes(e)) return true
  const dom = e.split("@")[1] || ""
  return domains.includes(dom)
}

export function cookie(name: string, val: string, maxAge: number, secure: boolean): string {
  return `${name}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`
}
export function clearCookie(name: string, secure: boolean): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`
}
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  ;(header || "").split(";").forEach((p) => {
    const i = p.indexOf("=")
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim()
  })
  return out
}
