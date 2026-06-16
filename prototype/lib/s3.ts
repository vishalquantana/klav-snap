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

// Upload one screenshot and return its public path-style URL.
export async function uploadScreenshot(bytes: ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
  const key = s3Key(FOLDER, Date.now(), crypto.randomUUID(), ext)
  await getClient().write(key, bytes, { acl: 'public-read', type: contentType })
  return `${ENDPOINT.replace(/\/+$/, '')}/${BUCKET}/${key}`
}
