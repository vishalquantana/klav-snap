// lib/sim-review-pure.ts
// Pure helpers for the Sim-review pipeline — NO imports from ./db or @libsql/client.
// Exported separately so unit tests can load them without triggering the DB client.
import { createHash } from "node:crypto"

// ── Types ─────────────────────────────────────────────────────────────────────

/** One Sim's reaction to a page, enriched with dedup + recurrence context. */
export interface SimObservation {
  text: string                  // observation text
  sentiment: string | null      // positive | negative | neutral
  quote: string | null          // verbatim source quote from a trait, if cited
  hash: string                  // sha256 slice-16 dedup token — stable within a session
  suggestedBug?: any | null
  feedbackId?: string
  deduped?: boolean             // true when matched an existing feedback row
  recurrence?: any | null       // RecurrenceMemory (KLA-2) when deduped = true
}

export interface SimReview {
  simId: string
  simName: string
  initials?: string | null
  accent?: string | null
  observations: SimObservation[]
}

// ── hashObservation ──────────────────────────────────────────────────────────

/**
 * Stable 16-hex hash of an observation text — the client's session-dedup token.
 * Case- and whitespace-insensitive so "Button broken" and "  BUTTON BROKEN  "
 * are treated as the same observation and not shown twice.
 */
export function hashObservation(text: string): string {
  return createHash("sha256").update((text ?? "").trim().toLowerCase()).digest("hex").slice(0, 16)
}

// ── decodeDataUrl ─────────────────────────────────────────────────────────────

/**
 * Decode a data: URL → { bytes, contentType, base64 }.
 * Extracted from server.ts so lib/ consumers don't need to import server.ts.
 */
export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string; base64: string } | null {
  const m = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!m) return null
  const contentType = m[1] || "image/png"
  const isB64 = !!m[2]
  const data = m[3] || ""
  try {
    const bytes = isB64
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(data))
    const base64 = isB64 ? data : Buffer.from(bytes).toString("base64")
    return { bytes, contentType, base64 }
  } catch { return null }
}

// ── splitUrl ──────────────────────────────────────────────────────────────────

/**
 * Extract {urlHost, urlPath} from a page URL; strips query+fragment (privacy §5c).
 */
export function splitUrl(pageUrl: string): { urlHost: string | null; urlPath: string | null } {
  if (!pageUrl) return { urlHost: null, urlPath: null }
  try { const u = new URL(pageUrl); return { urlHost: u.host, urlPath: u.pathname } }
  catch { return { urlHost: null, urlPath: pageUrl.split(/[?#]/)[0] || null } }
}

// ── buildSimRunSummary ────────────────────────────────────────────────────────

/** Aggregate a SimReview[] into lightweight totals (for logging + sim_runs record). */
export function buildSimRunSummary(reviews: SimReview[]): {
  simCount: number; totalObservations: number; bugCount: number; dedupedCount: number; newCount: number
} {
  let totalObservations = 0, bugCount = 0, dedupedCount = 0, newCount = 0
  for (const rev of reviews) {
    totalObservations += rev.observations.length
    for (const o of rev.observations) {
      if (o.suggestedBug) bugCount++
      if (o.deduped) dedupedCount++
      else newCount++
    }
  }
  return { simCount: reviews.length, totalObservations, bugCount, dedupedCount, newCount }
}
