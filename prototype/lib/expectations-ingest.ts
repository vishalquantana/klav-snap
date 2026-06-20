// prototype/lib/expectations-ingest.ts
// Best-effort ingest helpers: funnel Snap/Sim feedback and AutoSim findings into the expectations spine.
// NEVER throws into callers — every export wraps its body in try/catch.
import type { Client } from "@libsql/client"
import { upsertExpectation } from "./expectations-db"

/**
 * Ingest a Snap or Sim feedback event into the expectations spine.
 * Caller passes the same `dedupKey` used for feedback dedup (issueKeyForFeedback(...)) so
 * the two dedup keyspaces stay in perfect alignment.
 */
export async function ingestSnapOrSim(c: Client, args: {
  projectId: string
  feedbackId: string
  isSnap: boolean
  title: string
  dedupKey: string
  urlPath?: string | null
  area?: string | null
  issueType?: string | null
  citedTraitIds?: string[]
}): Promise<void> {
  try {
    await upsertExpectation(c, {
      projectId: args.projectId,
      title: args.title.slice(0, 200),
      area: args.area ?? null,
      urlPath: args.urlPath ?? null,
      dedupKey: args.dedupKey,
      source: { kind: args.isSnap ? "snap" : "sim", id: args.feedbackId },
    })
  } catch (e) {
    console.warn("[expectations] ingestSnapOrSim skipped:", String(e))
  }
}

/**
 * Ingest an AutoSim finding into the expectations spine.
 * findings carry their own dedupKey (a different keyspace from feedback);
 * cross-source collapse happens via the lexical title fallback in upsertExpectation.
 */
export async function ingestFinding(c: Client, args: {
  projectId: string
  findingId: string
  title: string
  dedupKey: string
  urlPath?: string | null
}): Promise<void> {
  try {
    await upsertExpectation(c, {
      projectId: args.projectId,
      title: args.title.slice(0, 200),
      urlPath: args.urlPath ?? null,
      dedupKey: args.dedupKey,
      source: { kind: "finding", id: args.findingId },
    })
  } catch (e) {
    console.warn("[expectations] ingestFinding skipped:", String(e))
  }
}
