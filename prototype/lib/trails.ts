import { db } from "./db"
import type { Trail, TrailStep, TrailStatus, StepAction, Fingerprint } from "./trails-types"

function uid(prefix: string): string { return prefix + crypto.randomUUID() }
function j<T>(v: T | null | undefined): string | null { return v == null ? null : JSON.stringify(v) }
function pj<T>(s: unknown): T | null { return s ? (JSON.parse(String(s)) as T) : null }

function rowToTrail(r: any): Trail {
  return {
    id: r.id, projectId: r.project_id, name: r.name, intent: r.intent, baseUrl: r.base_url,
    baselineRef: r.baseline_ref ?? null, authorKind: r.author_kind, status: r.status,
    createdBy: r.created_by ?? null, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

export async function createTrail(
  projectId: string,
  input: { name: string; intent?: string; baseUrl: string; authorKind?: Trail["authorKind"]; createdBy?: string },
): Promise<string> {
  const id = uid("trl_"); const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO trails (id, project_id, name, intent, base_url, baseline_ref, author_kind, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NULL, ?, 'draft', ?, ?, ?)`,
    args: [id, projectId, input.name, input.intent ?? "", input.baseUrl, input.authorKind ?? "human", input.createdBy ?? null, now, now],
  })
  return id
}

export async function getTrail(projectId: string, id: string): Promise<Trail | null> {
  const r = await db!.execute({ sql: `SELECT * FROM trails WHERE project_id=? AND id=?`, args: [projectId, id] })
  return r.rows.length ? rowToTrail(r.rows[0]) : null
}

export async function listTrails(projectId: string): Promise<Trail[]> {
  const r = await db!.execute({ sql: `SELECT * FROM trails WHERE project_id=? ORDER BY created_at DESC`, args: [projectId] })
  return r.rows.map(rowToTrail)
}

export async function setTrailStatus(projectId: string, id: string, status: TrailStatus): Promise<void> {
  await db!.execute({ sql: `UPDATE trails SET status=?, updated_at=? WHERE project_id=? AND id=?`, args: [status, Date.now(), projectId, id] })
}

function rowToStep(r: any): TrailStep {
  return {
    id: r.id, trailId: r.trail_id, projectId: r.project_id, idx: Number(r.idx),
    action: r.action as StepAction, actionValue: r.action_value ?? null,
    target: pj<Fingerprint>(r.target_json), checkpoint: pj<{ description: string }>(r.checkpoint_json),
    createdAt: Number(r.created_at),
  }
}

export async function addTrailStep(
  projectId: string, trailId: string,
  input: { idx: number; action: StepAction; actionValue?: string; target?: Fingerprint; checkpoint?: { description: string } },
): Promise<string> {
  const id = uid("tstep_")
  await db!.execute({
    sql: `INSERT INTO trail_steps (id, trail_id, project_id, idx, action, action_value, target_json, checkpoint_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, trailId, projectId, input.idx, input.action, input.actionValue ?? null, j(input.target), j(input.checkpoint), Date.now()],
  })
  return id
}

export async function listTrailSteps(projectId: string, trailId: string): Promise<TrailStep[]> {
  const r = await db!.execute({ sql: `SELECT * FROM trail_steps WHERE project_id=? AND trail_id=? ORDER BY idx ASC`, args: [projectId, trailId] })
  return r.rows.map(rowToStep)
}

import type { LocatorCacheRow } from "./trails-types"

function rowToCache(r: any): LocatorCacheRow {
  return {
    id: r.id, projectId: r.project_id, trailId: r.trail_id, stepId: r.step_id,
    cacheKey: r.cache_key, resolvedSelector: r.resolved_selector, fingerprint: pj<Fingerprint>(r.fingerprint_json),
    confidence: Number(r.confidence), source: r.source, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

export async function upsertLocatorCache(
  projectId: string,
  input: { trailId: string; stepId: string; cacheKey: string; resolvedSelector: string; fingerprint?: Fingerprint; confidence?: number; source?: "crystallize" | "heal" },
): Promise<string> {
  const id = uid("lc_"); const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO locator_cache (id, project_id, trail_id, step_id, cache_key, resolved_selector, fingerprint_json, confidence, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id, step_id) DO UPDATE SET
            cache_key=excluded.cache_key,
            resolved_selector=excluded.resolved_selector,
            fingerprint_json=excluded.fingerprint_json,
            confidence=excluded.confidence,
            source=excluded.source,
            updated_at=excluded.updated_at`,
    args: [id, projectId, input.trailId, input.stepId, input.cacheKey, input.resolvedSelector, j(input.fingerprint), input.confidence ?? 1.0, input.source ?? "crystallize", now, now],
  })
  return id
}

export async function getLocatorByKey(projectId: string, key: string): Promise<LocatorCacheRow | null> {
  const r = await db!.execute({ sql: `SELECT * FROM locator_cache WHERE project_id=? AND cache_key=?`, args: [projectId, key] })
  return r.rows.length ? rowToCache(r.rows[0]) : null
}

export async function getCacheForStep(projectId: string, stepId: string): Promise<LocatorCacheRow | null> {
  const r = await db!.execute({ sql: `SELECT * FROM locator_cache WHERE project_id=? AND step_id=? ORDER BY updated_at DESC LIMIT 1`, args: [projectId, stepId] })
  return r.rows.length ? rowToCache(r.rows[0]) : null
}

import type { Walk, RunStep, Verdict, Tier, FailureClass } from "./trails-types"

function rowToWalk(r: any): Walk {
  return {
    id: r.id, trailId: r.trail_id, projectId: r.project_id, trigger: r.trigger,
    status: r.status, llmCalls: Number(r.llm_calls), summary: pj<Record<string, unknown>>(r.summary_json),
    startedAt: Number(r.started_at), finishedAt: r.finished_at == null ? null : Number(r.finished_at),
  }
}

function rowToRunStep(r: any): RunStep {
  return {
    id: r.id, runId: r.run_id, trailId: r.trail_id, stepId: r.step_id, projectId: r.project_id,
    idx: Number(r.idx), tier: r.tier as Tier, verdict: r.verdict as Verdict, confidence: Number(r.confidence),
    diagnosis: (r.diagnosis ?? null) as FailureClass | null, healed: Number(r.healed) === 1,
    evidence: pj<Record<string, unknown>>(r.evidence_json), createdAt: Number(r.created_at),
  }
}

export async function startWalk(projectId: string, trailId: string, trigger: "manual" = "manual"): Promise<string> {
  const id = uid("walk_")
  await db!.execute({
    sql: `INSERT INTO trail_runs (id, trail_id, project_id, trigger, status, llm_calls, summary_json, started_at, finished_at)
          VALUES (?, ?, ?, ?, 'running', 0, NULL, ?, NULL)`,
    args: [id, trailId, projectId, trigger, Date.now()],
  })
  return id
}

export async function addRunStep(
  projectId: string,
  input: { runId: string; trailId: string; stepId: string; idx: number; tier: Tier; verdict: Verdict; confidence?: number; diagnosis?: FailureClass; healed?: boolean; evidence?: Record<string, unknown> },
): Promise<string> {
  const id = uid("rstep_")
  await db!.execute({
    sql: `INSERT INTO run_steps (id, run_id, trail_id, step_id, project_id, idx, tier, verdict, confidence, diagnosis, healed, evidence_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.runId, input.trailId, input.stepId, projectId, input.idx, input.tier, input.verdict, input.confidence ?? 0, input.diagnosis ?? null, input.healed ? 1 : 0, j(input.evidence), Date.now()],
  })
  return id
}

export async function finishWalk(projectId: string, runId: string, input: { status: Verdict; llmCalls: number; summary?: Record<string, unknown> }): Promise<void> {
  await db!.execute({
    sql: `UPDATE trail_runs SET status=?, llm_calls=?, summary_json=?, finished_at=? WHERE project_id=? AND id=?`,
    args: [input.status, input.llmCalls, j(input.summary), Date.now(), projectId, runId],
  })
}

export async function getWalk(projectId: string, runId: string): Promise<Walk | null> {
  const r = await db!.execute({ sql: `SELECT * FROM trail_runs WHERE project_id=? AND id=?`, args: [projectId, runId] })
  return r.rows.length ? rowToWalk(r.rows[0]) : null
}

export async function listRunSteps(projectId: string, runId: string): Promise<RunStep[]> {
  const r = await db!.execute({ sql: `SELECT * FROM run_steps WHERE project_id=? AND run_id=? ORDER BY idx ASC`, args: [projectId, runId] })
  return r.rows.map(rowToRunStep)
}

export async function listWalks(projectId: string, trailId: string): Promise<Walk[]> {
  const r = await db!.execute({ sql: `SELECT * FROM trail_runs WHERE project_id=? AND trail_id=? ORDER BY started_at DESC`, args: [projectId, trailId] })
  return r.rows.map(rowToWalk)
}

// Recent Walks across the whole project (any trail), newest-first. Powers the Trails dashboard.
export async function listRecentWalks(projectId: string, limit = 20): Promise<Walk[]> {
  const r = await db!.execute({ sql: `SELECT * FROM trail_runs WHERE project_id=? ORDER BY started_at DESC LIMIT ?`, args: [projectId, limit] })
  return r.rows.map(rowToWalk)
}

import type { Finding, FindingKind, FindingStatus } from "./trails-types"

function rowToFinding(r: any): Finding {
  return {
    id: r.id, projectId: r.project_id, runId: r.run_id, stepId: r.step_id ?? null, trailId: r.trail_id,
    kind: r.kind as FindingKind, title: r.title, evidence: pj<Record<string, unknown>>(r.evidence_json),
    groundQuote: r.ground_quote ?? null, confidence: Number(r.confidence), dedupKey: r.dedup_key,
    recurrence: Number(r.recurrence), status: r.status as FindingStatus, connectorRef: r.connector_ref ?? null,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

export async function recordFinding(
  projectId: string,
  input: { runId: string; trailId: string; stepId?: string; kind: FindingKind; title: string; evidence?: Record<string, unknown>; groundQuote?: string; confidence: number; dedupKey: string; status?: FindingStatus },
): Promise<{ id: string; deduped: boolean; recurrence: number }> {
  // Dedup against ANY prior non-new row for this (project, dedupKey): the open states
  // ('queued','auto_filed','filed') AND 'dismissed'. Including 'dismissed' is the §6 anti-slop guarantee
  // — a human dismissal permanently suppresses that finding, so a recurrence must collapse onto the
  // existing dismissed row (bump recurrence, KEEP status='dismissed') and never resurrect to a fresh
  // queued/auto-fileable row. For open rows we behave as before (bump recurrence, status untouched).
  const open = await db!.execute({
    sql: `SELECT id, recurrence FROM findings WHERE project_id=? AND dedup_key=? AND status IN ('queued','auto_filed','filed','dismissed') ORDER BY created_at ASC LIMIT 1`,
    args: [projectId, input.dedupKey],
  })
  if (open.rows.length) {
    const id = String((open.rows[0] as any).id); const recurrence = Number((open.rows[0] as any).recurrence) + 1
    // recurrence + updated_at only; status is never changed here, so a dismissed row stays dismissed.
    await db!.execute({ sql: `UPDATE findings SET recurrence=?, updated_at=? WHERE id=?`, args: [recurrence, Date.now(), id] })
    // best-effort spine bump for a recurring finding
    try {
      const { ingestFinding } = await import("./expectations-ingest")
      await ingestFinding(db!, { projectId, findingId: id, title: input.title, dedupKey: input.dedupKey, urlPath: null })
    } catch (e) { console.warn("[expectations] recordFinding dedup ingest skipped:", String(e)) }
    return { id, deduped: true, recurrence }
  }
  const id = uid("find_"); const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO findings (id, project_id, run_id, step_id, trail_id, kind, title, evidence_json, ground_quote, confidence, dedup_key, recurrence, status, connector_ref, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?)`,
    args: [id, projectId, input.runId, input.stepId ?? null, input.trailId, input.kind, input.title, j(input.evidence), input.groundQuote ?? null, input.confidence, input.dedupKey, input.status ?? "queued", now, now],
  })
  // best-effort spine ingest: an AutoSim finding is also a discovery source
  try {
    const { ingestFinding } = await import("./expectations-ingest")
    await ingestFinding(db!, { projectId, findingId: id, title: input.title, dedupKey: input.dedupKey, urlPath: null })
  } catch (e) { console.warn("[expectations] recordFinding ingest skipped:", String(e)) }
  return { id, deduped: false, recurrence: 1 }
}

export async function listFindings(projectId: string, opts?: { status?: FindingStatus }): Promise<Finding[]> {
  const r = opts?.status
    ? await db!.execute({ sql: `SELECT * FROM findings WHERE project_id=? AND status=? ORDER BY updated_at DESC`, args: [projectId, opts.status] })
    : await db!.execute({ sql: `SELECT * FROM findings WHERE project_id=? ORDER BY updated_at DESC`, args: [projectId] })
  return r.rows.map(rowToFinding)
}

export async function setFindingStatus(projectId: string, id: string, status: FindingStatus, connectorRef?: string): Promise<void> {
  await db!.execute({
    sql: `UPDATE findings SET status=?, connector_ref=COALESCE(?, connector_ref), updated_at=? WHERE project_id=? AND id=?`,
    args: [status, connectorRef ?? null, Date.now(), projectId, id],
  })
}

// Insert an assert-type trail step at afterStepIdx+1. Returns the new "ts_"-prefixed step id.
// Used by the enforce/confirm graduation endpoint to crystallize a validated expectation into a
// deterministic Playwright assertion in an existing Trail.
export async function insertAssertStep(
  projectId: string,
  trailId: string,
  afterStepIdx: number,
  target: Record<string, string>,
  description: string,
): Promise<string> {
  const id = "ts_" + crypto.randomUUID()
  await db!.execute({
    sql: `UPDATE trail_steps SET idx = idx + 1 WHERE project_id=? AND trail_id=? AND idx >= ?`,
    args: [projectId, trailId, afterStepIdx + 1],
  })
  await db!.execute({
    sql: `INSERT INTO trail_steps (id, trail_id, project_id, idx, action, action_value, target_json, checkpoint_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, trailId, projectId, afterStepIdx + 1, "assert", null,
           JSON.stringify(target), JSON.stringify({ kind: "visible", description }), Date.now()],
  })
  return id
}

export async function deleteTrailStep(projectId: string, stepId: string): Promise<void> {
  await db!.execute({ sql: `DELETE FROM trail_steps WHERE id=? AND project_id=?`, args: [stepId, projectId] })
}
