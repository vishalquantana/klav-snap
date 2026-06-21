// C1 — data-retention / TTL sweep. Periodically purges expired credentials and screenshots so we don't
// retain personal data (OTP codes, sessions) or PII screenshots past their lifetime (GDPR storage
// limitation, OWASP). Wired in server.ts to run shortly after boot and every 6h thereafter; GUARDED so
// it never runs under tests (NODE_ENV==='test').
import { db, deleteExpiredOtps, deleteExpiredSessions, expiredScreenshotKeys, deleteScreenshotRow } from "./db"
import { deleteObject } from "./s3"

export type RetentionResult = { otps: number; sessions: number; screenshots: number; s3Errors: number }

export async function runRetentionSweep(now = Date.now()): Promise<RetentionResult> {
  const result: RetentionResult = { otps: 0, sessions: 0, screenshots: 0, s3Errors: 0 }
  if (!db) return result // no DB configured → nothing to sweep

  result.otps = await deleteExpiredOtps(now)
  result.sessions = await deleteExpiredSessions(now)

  // Screenshots: delete the S3 object first (best-effort), then the ledger row. If S3 deletion fails we
  // still drop the DB row but count the error — a stale object is preferable to an un-prunable ledger.
  const expired = await expiredScreenshotKeys(now)
  for (const s of expired) {
    try {
      await deleteObject(s.s3Key)
    } catch (e: any) {
      result.s3Errors++
      console.warn(`retention: S3 delete failed for ${s.s3Key}: ${e?.message || e}`)
    }
    await deleteScreenshotRow(s.id)
    result.screenshots++
  }

  if (result.otps || result.sessions || result.screenshots) {
    console.log(`✓ retention sweep: ${result.otps} otps, ${result.sessions} sessions, ${result.screenshots} screenshots (${result.s3Errors} s3 errors)`)
  }
  return result
}
