import { test, expect } from 'bun:test'
import { encryptSecret, decryptSecret } from './crypto'

// 32-byte base64 key for the test
process.env.KLAV_SECRET = Buffer.from(new Uint8Array(32).fill(7)).toString('base64')

test('round-trips a secret', async () => {
  const enc = await encryptSecret('plane_tok_123')
  expect(enc).not.toContain('plane_tok_123')
  expect(await decryptSecret(enc)).toBe('plane_tok_123')
})

test('two encryptions of the same value differ (random IV)', async () => {
  expect(await encryptSecret('x')).not.toBe(await encryptSecret('x'))
})

test('decrypt rejects tampered ciphertext', async () => {
  const enc = await encryptSecret('secret')
  const bad = enc.slice(0, -2) + (enc.endsWith('A') ? 'BB' : 'AA')
  await expect(decryptSecret(bad)).rejects.toBeDefined()
})
