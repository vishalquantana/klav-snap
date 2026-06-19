import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export interface UrlGuardOptions {
  /** Optional exact-or-suffix allowlist, e.g. ["plane.so"] matches "x.plane.so" and "plane.so". */
  allowHosts?: string[]
  /** Default false — only https permitted unless true. */
  allowHttp?: boolean
}

/**
 * Validates that an outbound URL is safe to fetch (anti-SSRF).
 *
 * Throws an Error whose message is safe to write to server logs but should NOT
 * be echoed back to clients. Returns the parsed URL when safe.
 */
export async function assertSafeUrl(raw: string, opts: UrlGuardOptions = {}): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("invalid URL")
  }

  // Scheme check.
  const scheme = url.protocol
  if (scheme === "https:") {
    // ok
  } else if (scheme === "http:") {
    if (!opts.allowHttp) throw new Error("blocked scheme: http (https required)")
  } else {
    throw new Error(`blocked scheme: ${scheme}`)
  }

  // Reject embedded credentials (user:pass@host).
  if (url.username || url.password) {
    throw new Error("blocked: credentials in URL")
  }

  const hostname = decodeHostname(url.hostname)
  if (!hostname) throw new Error("blocked: empty host")

  // Host allowlist (applied before DNS — cheap and authoritative).
  if (opts.allowHosts && opts.allowHosts.length > 0) {
    if (!hostMatchesAllowlist(hostname, opts.allowHosts)) {
      throw new Error("blocked host: not in allowlist")
    }
  }

  // Explicitly reject the "localhost" name regardless of resolution.
  if (hostname.toLowerCase() === "localhost") {
    throw new Error("blocked host: localhost")
  }

  // Literal IP? Check directly. Otherwise resolve and check every address.
  const literalKind = isIP(hostname)
  if (literalKind === 4 || literalKind === 6) {
    const reason = ipBlockReason(hostname)
    if (reason) throw new Error(`blocked host: ${reason}`)
  } else {
    let records: { address: string }[]
    try {
      records = await lookup(hostname, { all: true })
    } catch {
      throw new Error("blocked host: DNS resolution failed")
    }
    if (records.length === 0) throw new Error("blocked host: no DNS records")
    for (const rec of records) {
      const reason = ipBlockReason(rec.address)
      if (reason) throw new Error(`blocked host: ${reason}`)
    }
  }

  return url
}

/** Convenience wrapper: returns true/false instead of throwing. */
export async function isSafeUrl(raw: string, opts?: UrlGuardOptions): Promise<boolean> {
  try {
    await assertSafeUrl(raw, opts)
    return true
  } catch {
    return false
  }
}

/**
 * Returns true if `hostname` equals one of the allowlist entries or is a
 * subdomain of one (i.e. ends with "." + entry). Case-insensitive.
 */
export function hostMatchesAllowlist(hostname: string, allowHosts: string[]): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "")
  for (const raw of allowHosts) {
    const entry = raw.toLowerCase().replace(/^\.+/, "").replace(/\.$/, "")
    if (!entry) continue
    if (h === entry || h.endsWith("." + entry)) return true
  }
  return false
}

/** Strip the surrounding brackets URL puts around IPv6 literals. */
function decodeHostname(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) return host.slice(1, -1)
  return host
}

/**
 * Returns a short reason string if the given literal IP address falls in a
 * blocked range, or null if it is acceptable (public).
 */
export function ipBlockReason(ip: string): string | null {
  const kind = isIP(ip)
  if (kind === 4) return ipv4BlockReason(ip)
  if (kind === 6) return ipv6BlockReason(ip)
  // Not a valid IP literal — caller should not have reached here.
  return "unparseable address"
}

function ipv4BlockReason(ip: string): string | null {
  const octets = parseIpv4(ip)
  if (!octets) return "unparseable IPv4 address"
  return ipv4OctetsBlockReason(octets)
}

function ipv4OctetsBlockReason(o: number[]): string | null {
  const [a, b] = o
  // Unspecified 0.0.0.0/8
  if (a === 0) return "unspecified address"
  // Loopback 127.0.0.0/8
  if (a === 127) return "loopback address"
  // Private 10.0.0.0/8
  if (a === 10) return "private address"
  // Private 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return "private address"
  // Private 192.168.0.0/16
  if (a === 192 && b === 168) return "private address"
  // Link-local 169.254.0.0/16 (includes 169.254.169.254 cloud metadata)
  if (a === 169 && b === 254) return "link-local address"
  return null
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  const out: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    out.push(n)
  }
  return out
}

function ipv6BlockReason(ip: string): string | null {
  const lower = ip.toLowerCase().replace(/%.*$/, "") // strip zone id if present

  // IPv4-mapped (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) — evaluate the embedded v4.
  const mapped = extractMappedIpv4(lower)
  if (mapped) {
    const reason = ipv4OctetsBlockReason(mapped)
    if (reason) return reason
    return null
  }

  const groups = expandIpv6(lower)
  if (!groups) return "unparseable IPv6 address"

  // Unspecified ::
  if (groups.every((g) => g === 0)) return "unspecified address"
  // Loopback ::1
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) {
    return "loopback address"
  }
  const first = groups[0]
  // Link-local fe80::/10
  if ((first & 0xffc0) === 0xfe80) return "link-local address"
  // Unique-local / private fc00::/7
  if ((first & 0xfe00) === 0xfc00) return "private address"
  return null
}

/**
 * If `ip` is an IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible IPv6 address,
 * return the four embedded octets, else null.
 */
function extractMappedIpv4(ip: string): number[] | null {
  // Dotted form, e.g. ::ffff:127.0.0.1 or ::127.0.0.1
  const dotted = ip.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dotted) {
    const prefix = dotted[1]
    if (prefix === "::ffff:" || prefix === "::") {
      return parseIpv4(dotted[2])
    }
    return null
  }
  // Hex form ::ffff:7f00:0001
  const groups = expandIpv6(ip)
  if (!groups) return null
  const isV4Mapped =
    groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff
  if (isV4Mapped) {
    const hi = groups[6]
    const lo = groups[7]
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]
  }
  return null
}

/**
 * Expand an IPv6 address (already lowercased, no zone, no embedded dotted-quad)
 * into exactly 8 numeric 16-bit groups. Returns null on parse failure.
 * Handles embedded dotted-quad tails by converting them to two hex groups.
 */
function expandIpv6(ip: string): number[] | null {
  let str = ip

  // Convert a trailing dotted-quad into two hex groups so the rest is uniform.
  const tail = str.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (tail) {
    const v4 = parseIpv4(tail[1])
    if (!v4) return null
    const g1 = ((v4[0] << 8) | v4[1]).toString(16)
    const g2 = ((v4[2] << 8) | v4[3]).toString(16)
    str = str.slice(0, tail.index) + g1 + ":" + g2
  }

  const hasDoubleColon = str.includes("::")
  if ((str.match(/::/g) || []).length > 1) return null

  let head: string[]
  let tailParts: string[]
  if (hasDoubleColon) {
    const [h, t] = str.split("::")
    head = h ? h.split(":") : []
    tailParts = t ? t.split(":") : []
  } else {
    head = str.split(":")
    tailParts = []
  }

  for (const part of [...head, ...tailParts]) {
    if (part === "" || !/^[0-9a-f]{1,4}$/.test(part)) return null
  }

  const groups: number[] = []
  if (hasDoubleColon) {
    const fill = 8 - head.length - tailParts.length
    if (fill < 0) return null
    for (const p of head) groups.push(parseInt(p, 16))
    for (let i = 0; i < fill; i++) groups.push(0)
    for (const p of tailParts) groups.push(parseInt(p, 16))
  } else {
    if (head.length !== 8) return null
    for (const p of head) groups.push(parseInt(p, 16))
  }

  if (groups.length !== 8) return null
  return groups
}
