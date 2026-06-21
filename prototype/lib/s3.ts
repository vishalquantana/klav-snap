import { S3Client } from 'bun'

const ENDPOINT = process.env.S3_ENDPOINT || ''
const REGION = process.env.S3_REGION || 'us-east-1'
const BUCKET = process.env.S3_BUCKET || ''
const FOLDER = (process.env.S3_FOLDER || 'uploads').replace(/\/+$/, '')
const ACCESS = process.env.AWS_ACCESS_KEY_ID || ''
const SECRET = process.env.AWS_SECRET_ACCESS_KEY || ''

export function s3Key(folder: string, ts: number, id: string, ext: string): string {
  return `${folder.replace(/\/+$/, '')}/${ts}-${id}.${ext}`
}

let client: S3Client | null = null
function getClient(): S3Client {
  if (!ENDPOINT || !BUCKET || !ACCESS || !SECRET) {
    throw new Error('S3 is not configured (set S3_ENDPOINT, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)')
  }
  if (!client) {
    client = new S3Client({ accessKeyId: ACCESS, secretAccessKey: SECRET, bucket: BUCKET, endpoint: ENDPOINT, region: REGION })
  }
  return client
}

export type UploadedScreenshot = { url: string; key: string; bucket: string; contentType: string; acl: string }

// Upload one screenshot and return its storage metadata (key/bucket so callers can record a durable
// `screenshots` ledger row). `acl` defaults to 'private' (no public bucket exposure — CASA/PII): the
// returned `url` is the (non-public) path-style URL and callers MUST serve it via a signed GET
// (`presignGet`) — for the dashboard via the membership-checked /api/screenshots/:id endpoint, and for
// external trackers by embedding a short-lived presigned URL. 'public-read' remains available for any
// caller that explicitly needs a permanent direct link, but should be avoided for user content.
export async function uploadScreenshotMeta(
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  acl: 'public-read' | 'private' = 'private',
): Promise<UploadedScreenshot> {
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
  const key = s3Key(FOLDER, Date.now(), crypto.randomUUID(), ext)
  // TODO SSE: Bun's S3Client.write has no server-side-encryption option (no x-amz-server-side-encryption
  // passthrough); enable bucket default encryption (SSE-S3/aws:kms) in the provider console instead.
  await getClient().write(key, bytes, { acl, type: contentType })
  return { url: `${ENDPOINT.replace(/\/+$/, '')}/${BUCKET}/${key}`, key, bucket: BUCKET, contentType, acl }
}

// Delete one object by key. Used by the data-retention sweep (C1) and GDPR erasure (C2) to remove the
// underlying S3 bytes when a screenshots ledger row is deleted. Best-effort: callers should catch/log.
export async function deleteObject(key: string): Promise<void> {
  await getClient().delete(key)
}

// Read one PRIVATE object's bytes (used by the /img permalink handler to stream a screenshot, and to
// pass bytes to connectors that natively attach the image). Throws if S3 isn't configured / not found.
export async function getObjectBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const f = getClient().file(key)
  const buf = await f.arrayBuffer()
  return { bytes: new Uint8Array(buf), contentType: f.type || "image/png" }
}

// Upload one screenshot and return its public path-style URL.
export async function uploadScreenshot(bytes: ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  return (await uploadScreenshotMeta(bytes, contentType)).url
}

// Presigned, time-limited GET URL for a PRIVATE object (Sim/live-review screenshots, §5d). The caller
// is responsible for membership-checking before handing this out. expiresInSec defaults to 10 minutes.
export function presignGet(key: string, expiresInSec = 600): string {
  return getClient().presign(key, { method: 'GET', expiresIn: expiresInSec })
}
