// Layer E — findings gate: pure decision, precision metric, injected-filer executor, real connector filer.
// Hermetic local libsql (mirrors the trails engine e2e suites). NO network: the filer is injected as a
// mock in the executor tests; the real connector filer is exercised only for its no-connector null path.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-gate-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema, migrateV2 } = await import("./db")
let db: any
beforeAll(async () => { db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const T = await import("./trails")
const G = await import("./trails-findings-gate")

// ── Task 1: pure decision + precision ───────────────────────────────────────────

test("decideFindingAction: only high-confidence regressions auto-file", () => {
  expect(G.decideFindingAction({ kind: "regression", confidence: 0.95 })).toBe("auto_file")
  expect(G.decideFindingAction({ kind: "regression", confidence: 0.5 })).toBe("queue")
  expect(G.decideFindingAction({ kind: "amber_heal", confidence: 0.99 })).toBe("queue")
  expect(G.decideFindingAction({ kind: "visual", confidence: 0.99 })).toBe("queue")
})

test("projectPrecision = filed/(filed+dismissed), ignoring still-queued", async () => {
  const proj = "proj_prec"
  const walk = await T.startWalk(proj, "trl_x")
  const a = await T.recordFinding(proj, { runId: walk, trailId: "trl_x", kind: "regression", title: "A", confidence: 0.95, dedupKey: "a" })
  const b = await T.recordFinding(proj, { runId: walk, trailId: "trl_x", kind: "regression", title: "B", confidence: 0.95, dedupKey: "b" })
  const c = await T.recordFinding(proj, { runId: walk, trailId: "trl_x", kind: "regression", title: "C", confidence: 0.95, dedupKey: "c" })
  await T.setFindingStatus(proj, a.id, "filed")
  await T.setFindingStatus(proj, b.id, "filed")
  await T.setFindingStatus(proj, c.id, "dismissed")
  const p = await G.projectPrecision(proj)
  expect(p.filed).toBe(2); expect(p.dismissed).toBe(1); expect(p.precision).toBeCloseTo(2 / 3)
})

// ── Task 2: executor with injected filer ────────────────────────────────────────

test("processWalkFindings auto-files high-confidence regressions, queues the rest", async () => {
  const proj = "proj_gate_exec"
  const walk = await T.startWalk(proj, "trl_g")
  await T.recordFinding(proj, { runId: walk, trailId: "trl_g", kind: "regression", title: "gone", confidence: 0.95, dedupKey: "g1" })
  await T.recordFinding(proj, { runId: walk, trailId: "trl_g", kind: "amber_heal", title: "unsure", confidence: 0.99, dedupKey: "g2" })
  const filer = async () => ({ connectorRef: "plane:PROJ-7" })
  const res = await G.processWalkFindings(proj, walk, { filer })
  expect(res.autoFiled).toHaveLength(1)
  expect(res.queued).toHaveLength(1)
  const filed = (await T.listFindings(proj, { status: "auto_filed" }))[0]
  expect(filed.connectorRef).toBe("plane:PROJ-7")
})

test("fileFindingById files a queued finding via the injected filer", async () => {
  const proj = "proj_gate_file"
  const walk = await T.startWalk(proj, "trl_f")
  const f = await T.recordFinding(proj, { runId: walk, trailId: "trl_f", kind: "amber_heal", title: "review me", confidence: 0.7, dedupKey: "f1" })
  const filer = async () => ({ connectorRef: "github:owner/repo#42" })
  const res = await G.fileFindingById(proj, f.id, { filer })
  expect(res.ok).toBe(true)
  expect(res.connectorRef).toBe("github:owner/repo#42")
  const filed = (await T.listFindings(proj, { status: "filed" })).find((x) => x.id === f.id)
  expect(filed?.connectorRef).toBe("github:owner/repo#42")
})

test("dismissFinding removes it from the queue and precision", async () => {
  const proj = "proj_gate_dismiss"
  const walk = await T.startWalk(proj, "trl_d")
  const f = await T.recordFinding(proj, { runId: walk, trailId: "trl_d", kind: "amber_heal", title: "x", confidence: 0.7, dedupKey: "d1" })
  await G.dismissFinding(proj, f.id)
  expect((await T.listFindings(proj, { status: "queued" })).some((x) => x.id === f.id)).toBe(false)
})

// ── Anti-slop guarantee: a dismissed finding is never re-filed (Priority 1) ───────
// A human-dismissed regression that recurs on the next Walk must NOT be re-queued or auto-filed.
test("recordFinding: a dismissed regression that recurs is NOT resurrected (stays dismissed, recurrence bumped)", async () => {
  const proj = "proj_dismiss_dedup"
  const walk1 = await T.startWalk(proj, "trl_dd")
  const first = await T.recordFinding(proj, { runId: walk1, trailId: "trl_dd", kind: "regression", title: "flaky reg", confidence: 0.95, dedupKey: "rec1" })
  expect(first.deduped).toBe(false)
  await T.setFindingStatus(proj, first.id, "dismissed")

  // Next Walk surfaces the SAME finding (same dedupKey).
  const walk2 = await T.startWalk(proj, "trl_dd")
  const again = await T.recordFinding(proj, { runId: walk2, trailId: "trl_dd", kind: "regression", title: "flaky reg", confidence: 0.95, dedupKey: "rec1" })

  // Deduped onto the existing row — NOT a fresh queued insert.
  expect(again.deduped).toBe(true)
  expect(again.id).toBe(first.id)
  expect(again.recurrence).toBe(2)

  // Exactly one row for this dedupKey, still dismissed, never re-queued.
  const all = await T.listFindings(proj)
  const rows = all.filter((x) => x.dedupKey === "rec1")
  expect(rows).toHaveLength(1)
  expect(rows[0].status).toBe("dismissed")
  expect(rows[0].recurrence).toBe(2)
  expect((await T.listFindings(proj, { status: "queued" })).some((x) => x.dedupKey === "rec1")).toBe(false)

  // And it would never auto-file: processWalkFindings only touches queued rows for this run.
  let filerCalls = 0
  const filer = async () => { filerCalls++; return { connectorRef: "plane:NOPE-1" } }
  const res = await G.processWalkFindings(proj, walk2, { filer })
  expect(res.autoFiled).toHaveLength(0)
  expect(filerCalls).toBe(0)
})

// ── Resurrection guard on the human file route (Priority 2) ───────────────────────
test("fileFindingById refuses to file a dismissed finding (ok:false, status unchanged)", async () => {
  const proj = "proj_file_guard"
  const walk = await T.startWalk(proj, "trl_fg")
  const f = await T.recordFinding(proj, { runId: walk, trailId: "trl_fg", kind: "regression", title: "gone", confidence: 0.95, dedupKey: "fg1" })
  await G.dismissFinding(proj, f.id)
  let filerCalls = 0
  const filer = async () => { filerCalls++; return { connectorRef: "plane:X-1" } }
  const res = await G.fileFindingById(proj, f.id, { filer })
  expect(res.ok).toBe(false)
  expect(filerCalls).toBe(0) // never even attempted the push
  const after = (await T.listFindings(proj)).find((x) => x.id === f.id)
  expect(after?.status).toBe("dismissed")
})

test("fileFindingById refuses to re-file an already-filed finding", async () => {
  const proj = "proj_file_guard2"
  const walk = await T.startWalk(proj, "trl_fg2")
  const f = await T.recordFinding(proj, { runId: walk, trailId: "trl_fg2", kind: "regression", title: "gone", confidence: 0.95, dedupKey: "fg2" })
  const filer = async () => ({ connectorRef: "plane:Y-1" })
  expect((await G.fileFindingById(proj, f.id, { filer })).ok).toBe(true)
  // Second attempt on the now-'filed' finding is refused.
  const res = await G.fileFindingById(proj, f.id, { filer })
  expect(res.ok).toBe(false)
})

// ── dismiss hardening (Priority 3) ────────────────────────────────────────────────
test("dismissFinding only acts on an existing, in-project, queued finding", async () => {
  const proj = "proj_dismiss_guard"
  const walk = await T.startWalk(proj, "trl_dg")
  const f = await T.recordFinding(proj, { runId: walk, trailId: "trl_dg", kind: "amber_heal", title: "x", confidence: 0.7, dedupKey: "dg1" })

  // Non-existent id → no-op false.
  expect(await G.dismissFinding(proj, "find_does_not_exist")).toBe(false)
  // Foreign project id → no-op false, original untouched.
  expect(await G.dismissFinding("proj_other", f.id)).toBe(false)
  expect((await T.listFindings(proj)).find((x) => x.id === f.id)?.status).toBe("queued")
  // The real, queued finding → true.
  expect(await G.dismissFinding(proj, f.id)).toBe(true)
  expect((await T.listFindings(proj)).find((x) => x.id === f.id)?.status).toBe("dismissed")
  // Already-dismissed → no-op false (not currently queued).
  expect(await G.dismissFinding(proj, f.id)).toBe(false)
})

// ── Task 3: real connector filer (pure ticket build + no-connector null) ─────────

test("buildTicketFromFinding embeds grounded evidence + heal diff", () => {
  const t = G.buildTicketFromFinding({
    id: "find_1", projectId: "proj_z", runId: "walk_1", stepId: "tstep_1", trailId: "trl_1",
    kind: "regression", title: "Checkout button gone", evidence: { fromSelector: "#checkout", toSelector: null, rationale: "no checkout affordance" },
    groundQuote: "no checkout affordance", confidence: 0.95, dedupKey: "k", recurrence: 1, status: "queued", connectorRef: null, createdAt: 1, updatedAt: 1,
  } as any, "https://klavity.quantana.top")
  expect(t.title).toContain("Checkout button gone")
  expect(t.body).toContain("no checkout affordance")
  expect(t.body).toContain("#checkout")
  expect(t.severity).toBe("high")
  expect(t.klavityUrl).toContain("/trails?project=proj_z")
})

test("realFiler returns null when the project has no auto-copy connector", async () => {
  const r = await G.realFiler("proj_no_connector", { id: "find_x" } as any)
  expect(r).toBeNull()
})
