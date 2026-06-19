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
          ON CONFLICT(cache_key) DO UPDATE SET
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
