// Permanent, unguessable, revocable image links for external tracker tickets.
//
// Screenshots live PRIVATE in S3 (no public-read, not enumerable). A bug ticket in Jira/Plane/etc.
// needs the image to render indefinitely, but an S3 presigned URL maxes out at 7 days (SigV4). So we
// embed a link to OUR server instead: `/img/<id>.<hmac>`. The HMAC (keyed by KLAV_SECRET) makes the
// token unforgeable; the link never expires but is instantly revocable by deleting the screenshots
// row (the /img handler 404s when the row is gone) and is served from our domain so we can audit it.
//
// This is strictly better than the old public-read bucket: not enumerable, revocable, auditable, and
// no third-party can mint a valid token without the secret.
import { createHmac, timingSafeEqual } from "node:crypto"

function key(): string {
  const k = process.env.KLAV_SECRET
  if (!k) throw new Error("KLAV_SECRET is not set (needed to sign image links)")
  return k
}

function hmacHex(id: string): string {
  return createHmac("sha256", key()).update(`img:${id}`).digest("hex")
}

// Token embedded in the ticket: `<screenshotId>.<hmac>`.
export function signImageToken(id: string): string {
  return `${id}.${hmacHex(id)}`
}

// Returns the screenshot id if the token is authentic, else null. Constant-time HMAC compare.
export function verifyImageToken(token: string): string | null {
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const id = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: string
  try { expected = hmacHex(id) } catch { return null }
  if (sig.length !== expected.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null
  } catch { return null }
  return id
}
