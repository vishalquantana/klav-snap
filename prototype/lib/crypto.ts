// AES-GCM-256 encryption of secrets at rest. Key from KLAV_SECRET (base64, 32 bytes).
const enc = new TextEncoder()
const dec = new TextDecoder()

let keyPromise: Promise<CryptoKey> | null = null
function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const raw = process.env.KLAV_SECRET
    if (!raw) throw new Error('KLAV_SECRET is not set (base64-encoded 32-byte key)')
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
    if (bytes.length !== 32) throw new Error('KLAV_SECRET must decode to 32 bytes')
    keyPromise = crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }
  return keyPromise
}

function b64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)) }
function unb64(s: string): Uint8Array { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) }

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), enc.encode(plain)))
  return `${b64(iv)}:${b64(ct)}`
}

export async function decryptSecret(blob: string): Promise<string> {
  const [ivb, ctb] = blob.split(':')
  if (!ivb || !ctb) throw new Error('malformed ciphertext')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivb) }, await getKey(), unb64(ctb))
  return dec.decode(pt)
}

// Non-reversible SHA-256 (hex) — used to store bearer credentials (session ids, extension tokens,
// OTP codes) hashed at rest (E1/E2) so a DB read can't be replayed as a credential. Deterministic
// (no salt) on purpose: lookups are by exact hash. Uses Bun's CryptoHasher.
export function sha256hex(s: string): string {
  return new Bun.CryptoHasher('sha256').update(s).digest('hex')
}
