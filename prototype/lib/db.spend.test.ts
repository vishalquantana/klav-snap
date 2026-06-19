// FIX A focused tests: the ATOMIC daily-spend reservation cap (cost-cap race fix) + reconcile,
// plus FIX B project-scoped trait reads. Hermetic: point the module's `db` singleton at a fresh
// LOCAL libsql file by setting TURSO_DATABASE_URL *before* importing ./db (client made at import).
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-spend-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const {
  reconnectDb, applySchema, db: _db,
  tryReserveDailySpend, reconcileDailySpend, reservedDailySpend, DEFAULT_AI_CALL_EST_USD,
  recordAiCall, opsTodaySpend,
  insertTrait, insertTraitEvent, listTraits, listTraitEvents,
} = await import("./db")

let db: any
beforeAll(async () => {
  db = reconnectDb("file:" + file)
  await applySchema(db)
})

// One UTC day → one shared daily_ai_spend row. Tests that assert exact totals must run in isolation,
// so each spend test FIRST clears today's row to a known baseline.
async function resetDay() {
  await db.execute("DELETE FROM daily_ai_spend")
  await db.execute("DELETE FROM ai_calls")
}

// ── FIX A: tryReserveDailySpend ──────────────────────────────────────────────────────────────────
test("tryReserveDailySpend: succeeds while under cap, denies at/over cap (atomic)", async () => {
  await resetDay()
  const cap = 1.0
  // 0.4 + 0.4 = 0.8 <= 1.0 → both succeed.
  expect(await tryReserveDailySpend(0.4, cap)).toBe(true)
  expect(await tryReserveDailySpend(0.4, cap)).toBe(true)
  expect(await reservedDailySpend()).toBeCloseTo(0.8, 6)
  // 0.8 + 0.4 = 1.2 > 1.0 → denied, reserved unchanged.
  expect(await tryReserveDailySpend(0.4, cap)).toBe(false)
  expect(await reservedDailySpend()).toBeCloseTo(0.8, 6)
  // exact-fit 0.2 lands us at the cap (0.8 + 0.2 = 1.0 <= 1.0) → allowed.
  expect(await tryReserveDailySpend(0.2, cap)).toBe(true)
  expect(await reservedDailySpend()).toBeCloseTo(1.0, 6)
  // now at cap → any positive est denied.
  expect(await tryReserveDailySpend(0.0001, cap)).toBe(false)
})

test("tryReserveDailySpend: fails closed on non-positive est or cap", async () => {
  await resetDay()
  expect(await tryReserveDailySpend(0, 10)).toBe(false)
  expect(await tryReserveDailySpend(-1, 10)).toBe(false)
  expect(await tryReserveDailySpend(0.01, 0)).toBe(false)
  expect(await tryReserveDailySpend(0.01, -5)).toBe(false)
  expect(await tryReserveDailySpend(NaN, 10)).toBe(false)
  expect(await tryReserveDailySpend(0.01, NaN)).toBe(false)
  expect(await reservedDailySpend()).toBe(0)
})

test("tryReserveDailySpend: seeds today's row from real ai_calls spend", async () => {
  await resetDay()
  // Real spend already recorded today (e.g. before a restart) must count against the cap.
  await recordAiCall({ type: "react", model: "m", costUsd: 0.7 })
  expect(await opsTodaySpend()).toBeCloseTo(0.7, 6)
  const cap = 1.0
  // First reservation seeds reserved=0.7 from ai_calls; 0.7 + 0.2 = 0.9 <= 1.0 → allowed.
  expect(await tryReserveDailySpend(0.2, cap)).toBe(true)
  expect(await reservedDailySpend()).toBeCloseTo(0.9, 6)
  // 0.9 + 0.2 = 1.1 > 1.0 → denied (real spend kept us near the cap).
  expect(await tryReserveDailySpend(0.2, cap)).toBe(false)
})

test("tryReserveDailySpend: concurrent calls never collectively exceed the cap", async () => {
  await resetDay()
  const cap = 1.0
  const est = 0.1 // exactly 10 fit under a $1.00 cap
  const results = await Promise.all(Array.from({ length: 50 }, () => tryReserveDailySpend(est, cap)))
  const granted = results.filter(Boolean).length
  expect(granted).toBe(10)
  expect(await reservedDailySpend()).toBeCloseTo(1.0, 6)
})

// ── FIX A: reconcileDailySpend ─────────────────────────────────────────────────────────────────
test("reconcileDailySpend: adjusts reserved by (actual - est), clamps at >= 0", async () => {
  await resetDay()
  const cap = 10
  await tryReserveDailySpend(0.5, cap) // reserved = 0.5
  // call was cheaper than estimated → frees headroom (0.5 + (0.2 - 0.5) = 0.2).
  await reconcileDailySpend(0.5, 0.2)
  expect(await reservedDailySpend()).toBeCloseTo(0.2, 6)
  // call was pricier than estimated → consumes more (0.2 + (0.9 - 0.1) = 1.0).
  await reconcileDailySpend(0.1, 0.9)
  expect(await reservedDailySpend()).toBeCloseTo(1.0, 6)
  // a huge negative delta can't drive reserved below 0 (clamped).
  await reconcileDailySpend(100, 0)
  expect(await reservedDailySpend()).toBe(0)
})

test("reconcileDailySpend: zero delta is a no-op", async () => {
  await resetDay()
  await tryReserveDailySpend(0.3, 10)
  await reconcileDailySpend(0.3, 0.3) // delta 0
  expect(await reservedDailySpend()).toBeCloseTo(0.3, 6)
})

test("DEFAULT_AI_CALL_EST_USD is a sane positive default", () => {
  expect(typeof DEFAULT_AI_CALL_EST_USD).toBe("number")
  expect(DEFAULT_AI_CALL_EST_USD).toBeGreaterThan(0)
})

// ── FIX B: project-scoped trait reads (backward-compatible) ──────────────────────────────────────
const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
function mkTrait(simId: string, projectId: string, id: string) {
  const now = Date.now()
  return {
    id, simId, projectId, kind: "pain" as const, text: "t-" + id, status: "active" as const,
    strength: 1, srcTranscriptId: "tr_" + id, srcQuote: "q", srcQuoteOffset: null,
    srcSpeaker: null, createdAt: now, updatedAt: now,
    area: null, issueType: null, severity: null, srcVerified: null,
  }
}

test("listTraits/listTraitEvents: projectId scopes the read; omitted = backward-compatible", async () => {
  const sim = `sim_${RUN}`
  const projA = `proj_A_${RUN}`, projB = `proj_B_${RUN}`
  // Same sim_id deliberately spans two projects (the IDOR scenario): a trait in A and one in B.
  const tA = mkTrait(sim, projA, `tA_${RUN}`)
  const tB = mkTrait(sim, projB, `tB_${RUN}`)
  await insertTrait(tA as any)
  await insertTrait(tB as any)
  const now = Date.now()
  const evA = { traitId: tA.id, simId: sim, transcriptId: tA.srcTranscriptId, op: "create" as const,
    beforeText: null, afterText: "t", quote: "q", quoteOffset: null, speaker: null,
    sourceDate: now, reason: null, createdAt: now } as any
  const evB = { traitId: tB.id, simId: sim, transcriptId: tB.srcTranscriptId, op: "create" as const,
    beforeText: null, afterText: "t", quote: "q", quoteOffset: null, speaker: null,
    sourceDate: now, reason: null, createdAt: now } as any
  await insertTraitEvent(evA)
  await insertTraitEvent(evB)

  // No projectId → sees BOTH (unchanged legacy behavior).
  const allTraits = await listTraits(sim)
  expect(allTraits.map(t => t.id).sort()).toEqual([tA.id, tB.id].sort())
  const allEvents = await listTraitEvents(sim)
  expect(allEvents.map(e => e.traitId).sort()).toEqual([tA.id, tB.id].sort())

  // Scoped to project A → only A's trait/event.
  const aTraits = await listTraits(sim, { projectId: projA })
  expect(aTraits.map(t => t.id)).toEqual([tA.id])
  const aEvents = await listTraitEvents(sim, { projectId: projA })
  expect(aEvents.map(e => e.traitId)).toEqual([tA.id])

  // Scoped to project B → only B's; A's trait is not leaked.
  const bTraits = await listTraits(sim, { projectId: projB })
  expect(bTraits.map(t => t.id)).toEqual([tB.id])
  const bEvents = await listTraitEvents(sim, { projectId: projB })
  expect(bEvents.map(e => e.traitId)).toEqual([tB.id])

  // activeOnly + projectId compose; wrong project → empty (defense-in-depth).
  expect((await listTraits(sim, { activeOnly: true, projectId: projA })).map(t => t.id)).toEqual([tA.id])
  expect(await listTraits(sim, { projectId: `proj_NONE_${RUN}` })).toEqual([])
  expect(await listTraitEvents(sim, { projectId: `proj_NONE_${RUN}` })).toEqual([])
})
