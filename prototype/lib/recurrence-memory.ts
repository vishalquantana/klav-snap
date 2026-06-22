// lib/recurrence-memory.ts
// Computes a "RecurrenceMemory" for a feedback row: how many times was this issue seen,
// when, by whom (Sim or human reporter), and whether an expectation has been corroborated.
// Pure helpers (ordinal, buildSummary) are exported separately for unit testing without a DB.
import type { Client } from "@libsql/client"

export type RecurrenceMemory = {
  feedbackId: string
  count: number                    // 1 = first seen, 2 = first recurrence, etc.
  firstSeenAt: number              // created_at of the original row (ms)
  lastSeenAt: number               // most recent recurrence timestamp (ms)
  dates: number[]                  // all recurrence timestamps from recurrence_dates_json
  expectationId: string | null     // linked expectation ID if the issue reached the spine
  expectationStatus: string | null // candidate | validated | enforced | retired
  citedSimId: string | null        // Sim ID if originally filed by a Sim (virtual customer)
  citedSimName: string | null      // Sim display name, looked up from personas
  summary: string                  // human-readable: "3rd occurrence. First filed by Alice (Sim) on 2026-06-10."
}

/** ordinal(2) → "2nd", ordinal(11) → "11th", ordinal(21) → "21st" */
export function ordinal(n: number): string {
  const abs = Math.abs(n)
  const mod100 = abs % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (abs % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

/** Build the human-readable summary string. Pure — testable without a DB. */
export function buildSummary(count: number, firstSeenAt: number, citedSimName: string | null): string {
  const dateStr = new Date(firstSeenAt).toISOString().slice(0, 10)
  const reporter = citedSimName ? `by ${citedSimName} (Sim)` : `by a previous reporter`
  if (count <= 1) return `First occurrence filed ${reporter} on ${dateStr}.`
  return `${ordinal(count)} occurrence. First filed ${reporter} on ${dateStr}.`
}

/**
 * Build the full RecurrenceMemory for a feedback row.
 * Reads: recurrence columns, linked expectation (via issue_key → dedup_key), Sim name.
 * Returns null when the feedback row doesn't exist in this project.
 */
export async function buildRecurrenceMemory(
  c: Client,
  feedbackId: string,
  projectId: string,
): Promise<RecurrenceMemory | null> {
  const r = await c.execute({
    sql: `SELECT recurrence_count, recurrence_dates_json, last_seen_at, created_at, sim_id, issue_key
          FROM feedback WHERE id=? AND project_id=?`,
    args: [feedbackId, projectId],
  })
  if (!r.rows.length) return null
  const x = r.rows[0] as any

  const count = Number(x.recurrence_count ?? 1)
  let dates: number[] = []
  try { dates = JSON.parse(x.recurrence_dates_json || "[]") } catch { dates = [] }
  const firstSeenAt = Number(x.created_at)
  const lastSeenAt = x.last_seen_at != null ? Number(x.last_seen_at) : (dates.at(-1) ?? firstSeenAt)
  const simId: string | null = x.sim_id != null ? String(x.sim_id) : null
  const issueKey: string | null = x.issue_key != null ? String(x.issue_key) : null

  // Look up the linked expectation via the feedback's issue_key (= dedup_key on expectations).
  // The expectations spine is fed by ingestSnapOrSim which uses the same issueKeyForFeedback.
  let expectationId: string | null = null
  let expectationStatus: string | null = null
  if (issueKey) {
    const er = await c.execute({
      sql: "SELECT id, status FROM expectations WHERE project_id=? AND dedup_key=? LIMIT 1",
      args: [projectId, issueKey],
    })
    if (er.rows.length) {
      const ev = er.rows[0] as any
      expectationId = String(ev.id)
      expectationStatus = String(ev.status)
    }
  }

  // Look up Sim display name from personas for "cited virtual customer" attribution.
  let citedSimName: string | null = null
  if (simId) {
    const sr = await c.execute({
      sql: "SELECT name FROM personas WHERE id=? AND project_id=? LIMIT 1",
      args: [simId, projectId],
    })
    if (sr.rows.length) citedSimName = String((sr.rows[0] as any).name)
  }

  const summary = buildSummary(count, firstSeenAt, citedSimName)
  return {
    feedbackId, count, firstSeenAt, lastSeenAt, dates,
    expectationId, expectationStatus,
    citedSimId: simId, citedSimName, summary,
  }
}
