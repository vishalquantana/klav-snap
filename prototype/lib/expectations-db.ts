// prototype/lib/expectations-db.ts
import type { Client } from "@libsql/client"
import { mergeSource, nextStatus, matchExpectation,
  type SourceRef, type Corroboration, type ExpStatus } from "./expectations"

export type ExpectationRow = {
  id: string; projectId: string; title: string; area: string | null; urlPath: string | null
  status: ExpStatus; sourceRefs: SourceRef[]; corroboration: Corroboration
  dedupKey: string; enforcedStepId: string | null; createdAt: number; updatedAt: number
}

function rowTo(x: any): ExpectationRow {
  return {
    id: x.id, projectId: x.project_id, title: x.title, area: x.area ?? null, urlPath: x.url_path ?? null,
    status: x.status, sourceRefs: JSON.parse(x.source_refs_json || "[]"),
    corroboration: JSON.parse(x.corroboration_json || "{}"),
    dedupKey: x.dedup_key, enforcedStepId: x.enforced_step_id ?? null,
    createdAt: Number(x.created_at), updatedAt: Number(x.updated_at),
  }
}

export async function getExpectation(c: Client, id: string): Promise<ExpectationRow | null> {
  const r = await c.execute({ sql: "SELECT * FROM expectations WHERE id=?", args: [id] })
  return r.rows.length ? rowTo(r.rows[0]) : null
}

export async function listExpectations(c: Client, projectId: string, status?: ExpStatus): Promise<ExpectationRow[]> {
  const r = status
    ? await c.execute({ sql: "SELECT * FROM expectations WHERE project_id=? AND status=? ORDER BY updated_at DESC", args: [projectId, status] })
    : await c.execute({ sql: "SELECT * FROM expectations WHERE project_id=? ORDER BY updated_at DESC", args: [projectId] })
  return r.rows.map(rowTo)
}

export async function upsertExpectation(c: Client, input: {
  projectId: string; title: string; area?: string | null; urlPath?: string | null; dedupKey: string; source: SourceRef
}): Promise<ExpectationRow> {
  const now = Date.now()
  // 1) exact dedup_key match in-project
  const exact = await c.execute({ sql: "SELECT * FROM expectations WHERE project_id=? AND dedup_key=? LIMIT 1", args: [input.projectId, input.dedupKey] })
  let existing: ExpectationRow | null = exact.rows.length ? rowTo(exact.rows[0]) : null
  // 2) else lexical near-duplicate over same-project titles
  if (!existing) {
    const all = await listExpectations(c, input.projectId)
    const matchId = matchExpectation({ title: input.title }, all.map((e) => ({ id: e.id, title: e.title })))
    if (matchId) existing = all.find((e) => e.id === matchId) ?? null
  }
  if (existing) {
    const corr = mergeSource(existing.corroboration, input.source.kind)
    const refs = [...existing.sourceRefs, input.source]
    const status = nextStatus(existing.status, corr)
    await c.execute({
      sql: "UPDATE expectations SET corroboration_json=?, source_refs_json=?, status=?, updated_at=? WHERE id=?",
      args: [JSON.stringify(corr), JSON.stringify(refs), status, now, existing.id],
    })
    return (await getExpectation(c, existing.id))!
  }
  const id = "exp_" + crypto.randomUUID()
  const corr = mergeSource({ snap: false, sim: false, recurrence: 0 }, input.source.kind)
  const status = nextStatus("candidate", corr)
  await c.execute({
    sql: `INSERT INTO expectations (id,project_id,title,area,url_path,status,source_refs_json,corroboration_json,dedup_key,enforced_step_id,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, input.projectId, input.title, input.area ?? null, input.urlPath ?? null, status,
           JSON.stringify([input.source]), JSON.stringify(corr), input.dedupKey, null, now, now],
  })
  return (await getExpectation(c, id))!
}

export async function setExpectationStatus(c: Client, id: string, status: ExpStatus): Promise<void> {
  await c.execute({ sql: "UPDATE expectations SET status=?, updated_at=? WHERE id=?", args: [status, Date.now(), id] })
}

export async function setExpectationEnforced(c: Client, id: string, enforcedStepId: string): Promise<void> {
  await c.execute({ sql: "UPDATE expectations SET status='enforced', enforced_step_id=?, updated_at=? WHERE id=?", args: [enforcedStepId, Date.now(), id] })
}
