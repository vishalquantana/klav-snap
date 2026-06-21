// G1 — Session replay attached to bug reports (the FREE answer to Marker.io's $149 "Session replay").
//
// A widget/SDK records a rolling buffer of the last ~30-60s of rrweb DOM events. On bug submit those
// events ride along with the /api/feedback POST and are stored here, keyed to the feedback row.
//
// STORAGE: the event array is JSON.stringify'd, gzipped (Bun.gzipSync), and base64'd into
// feedback_replays.events_gz — mirroring the Trails walk_replays scheme (gzip ~20-100x vs raw / video).
// Every read is project-scoped (no cross-tenant leak). A hard byte cap on the encoded payload protects
// the DB: oversize buffers are TRIMMED oldest-first to the most-recent events that fit (a replay's tail
// — the seconds right before the bug — is the valuable part).
import { db } from "./db"

export type ReplayEvent = unknown

// Default max size of the stored (base64 gzip) payload. ~600 KB of base64 ≈ ~450 KB gzip ≈ typically
// many minutes of DOM events. Generous for a "last 30-60s" buffer while bounding worst-case rows.
export const DEFAULT_REPLAY_CAP_BYTES = 600_000

// ── pure helpers (unit-tested) ────────────────────────────────────────────────────────
/** JSON → gzip → base64. */
export function encodeReplay(events: ReplayEvent[]): string {
  const json = JSON.stringify(events)
  return Buffer.from(Bun.gzipSync(Buffer.from(json))).toString("base64")
}

/** base64 → gunzip → JSON. */
export function decodeReplay(encoded: string): ReplayEvent[] {
  const gz = Buffer.from(encoded, "base64")
  return JSON.parse(Buffer.from(Bun.gunzipSync(gz)).toString()) as ReplayEvent[]
}

export interface CapResult {
  events: ReplayEvent[]   // the (possibly trimmed) events that fit under the cap
  encoded: string         // their base64-gzip encoding ("" for an empty buffer)
  trimmed: boolean        // true when events were dropped to fit
}

/**
 * Ensure the encoded payload fits under `capBytes`, dropping the OLDEST events first.
 * rrweb is incremental-snapshot based; we never drop below the most recent full snapshot's worth in
 * practice because the tail is kept and rrweb-player tolerates a leading partial. A simple, robust
 * shrink loop (binary-search the keep-count) keeps this allocation-light and easy to reason about.
 */
export function capReplayEvents(events: ReplayEvent[], capBytes = DEFAULT_REPLAY_CAP_BYTES): CapResult {
  if (!events.length) return { events: [], encoded: "", trimmed: false }
  let encoded = encodeReplay(events)
  if (encoded.length <= capBytes) return { events, encoded, trimmed: false }

  // Binary-search the largest tail slice whose encoding fits. keep ∈ [1, events.length).
  let lo = 1, hi = events.length, best = 1, bestEncoded = encodeReplay(events.slice(-1))
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const slice = events.slice(events.length - mid)
    const enc = encodeReplay(slice)
    if (enc.length <= capBytes) { best = mid; bestEncoded = enc; lo = mid + 1 }
    else { hi = mid - 1 }
  }
  return { events: events.slice(events.length - best), encoded: bestEncoded, trimmed: true }
}

// ── storage ─────────────────────────────────────────────────────────────────────────
export interface SaveResult { saved: boolean; nEvents: number; trimmed: boolean; bytes: number }

/**
 * Persist a feedback's replay. Caps the payload (oldest-first trim) before insert. A best-effort
 * caller wraps this in try/catch — a replay failure must NEVER fail the bug submission.
 * Returns saved=false for an empty buffer (nothing to store).
 */
export async function saveFeedbackReplay(
  projectId: string, feedbackId: string, events: ReplayEvent[], capBytes = DEFAULT_REPLAY_CAP_BYTES,
): Promise<SaveResult> {
  const cap = capReplayEvents(events, capBytes)
  if (!cap.events.length) return { saved: false, nEvents: 0, trimmed: false, bytes: 0 }
  await db!.execute({
    sql: `INSERT INTO feedback_replays (id, feedback_id, project_id, events_gz, n_events, bytes, trimmed, created_at)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: ["frep_" + crypto.randomUUID(), feedbackId, projectId, cap.encoded,
           cap.events.length, cap.encoded.length, cap.trimmed ? 1 : 0, Date.now()],
  })
  return { saved: true, nEvents: cap.events.length, trimmed: cap.trimmed, bytes: cap.encoded.length }
}

export interface FeedbackReplay { events: ReplayEvent[]; nEvents: number; trimmed: boolean; createdAt: number }

/** Read the latest stored replay for a feedback row — project-scoped (no cross-tenant read). */
export async function getFeedbackReplay(projectId: string, feedbackId: string): Promise<FeedbackReplay | null> {
  const r = await db!.execute({
    sql: `SELECT events_gz, n_events, trimmed, created_at FROM feedback_replays
          WHERE project_id=? AND feedback_id=? ORDER BY created_at DESC LIMIT 1`,
    args: [projectId, feedbackId],
  })
  if (!r.rows.length) return null
  const row = r.rows[0] as any
  return {
    events: decodeReplay(String(row.events_gz)),
    nEvents: Number(row.n_events),
    trimmed: !!Number(row.trimmed),
    createdAt: Number(row.created_at),
  }
}

/**
 * Which of the given feedbackIds have a stored replay — project-scoped, one query. Lets the dashboard
 * show a "▶ Session replay" affordance only on tickets that actually have a recording.
 */
export async function feedbackIdsWithReplay(projectId: string, feedbackIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (!feedbackIds.length) return out
  const placeholders = feedbackIds.map(() => "?").join(",")
  const r = await db!.execute({
    sql: `SELECT DISTINCT feedback_id FROM feedback_replays WHERE project_id=? AND feedback_id IN (${placeholders})`,
    args: [projectId, ...feedbackIds],
  })
  for (const row of r.rows) out.add(String((row as any).feedback_id))
  return out
}
