// P3a provenance core test — exercises the PURE applyReconcileOps + insightsFromTraits.
// Feeds a current-trait set + a mixed op list and asserts: correct trait writes, append-only
// trait_events, insights rebuilt from ACTIVE traits only, and that contradict/supersede MARK
// the old trait (status change) rather than deleting it.
import { test, expect, afterAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { unlinkSync } from "node:fs"
import {
  applyReconcileOps,
  insightsFromTraits,
  type Trait,
  type ReconcileOp,
  type ReconcileCtx,
} from "./provenance"

// DB-backed tests below use the db module's OWN client (captured from TURSO_DATABASE_URL at import).
// Set the env to a fresh local file BEFORE the first `import("./db")` so the cached module binds to it,
// then drive applySchema/migrateV2/helpers all through that same client (no second connection).
const DB_FILE = join(tmpdir(), `klav-prov-${Date.now()}-${randomUUID()}.db`)
// Start from a guaranteed-clean file: drop any leftover DB + WAL/SHM sidecars from a prior
// (possibly crashed/interrupted) run so seeded personas with fixed ids can't collide. The DB
// module captures its client from TURSO_DATABASE_URL at import, so set the env BEFORE loadDb().
function rmDbFile() {
  for (const suffix of ["", "-wal", "-shm"]) { try { unlinkSync(DB_FILE + suffix) } catch {} }
}
rmDbFile()
process.env.TURSO_DATABASE_URL = "file:" + DB_FILE
delete process.env.TURSO_AUTH_TOKEN
async function loadDb() {
  const m = await import("./db")
  await m.applySchema(m.db!)
  await m.migrateV2(m.db!)
  return m
}
afterAll(rmDbFile)

const SIM = "sim_sarah"
const PROJ = "proj_acme"

function trait(over: Partial<Trait> & Pick<Trait, "id" | "kind" | "text">): Trait {
  return {
    simId: SIM, projectId: PROJ, status: "active", strength: 1,
    srcTranscriptId: "tr_old", srcQuote: "old quote", srcQuoteOffset: 0,
    srcSpeaker: "Sarah", createdAt: 1000, updatedAt: 1000,
    ...over,
  }
}

// deterministic id factory for stable assertions on newly created traits.
function ctx(): ReconcileCtx {
  let n = 0
  return {
    simId: SIM, projectId: PROJ, transcriptId: "tr_new", sourceDate: 2000,
    now: 5000, newId: () => `new_${++n}`,
  }
}

test("applyReconcileOps: mixed ops produce correct writes, append-only events, active-only insights", () => {
  const current: Trait[] = [
    trait({ id: "t_pain", kind: "pain", text: "Export is slow", strength: 2 }),
    trait({ id: "t_want", kind: "want", text: "Wants dark mode" }),
    trait({ id: "t_love", kind: "love", text: "Loves the search" }),
  ]

  const ops: ReconcileOp[] = [
    // reinforce an existing pain
    { op: "reinforce", kind: "pain", text: "Export is slow", quote: "still takes forever", quoteOffset: 10, speaker: "Sarah", traitId: "t_pain" },
    // refine an existing want's text
    { op: "refine", kind: "want", text: "Wants a true dark theme, not just dimmed", quote: "I need a proper dark mode", quoteOffset: 20, speaker: "Sarah", traitId: "t_want" },
    // contradict the love trait (she changed her mind)
    { op: "contradict", kind: "love", text: "No longer loves search", quote: "search is broken now", quoteOffset: 30, speaker: "Sarah", traitId: "t_love" },
    // brand-new trait
    { op: "add", kind: "pain", text: "Onboarding confusing", quote: "I got lost setting up", quoteOffset: 40, speaker: "Sarah" },
    // supersede: not in current set initially -> add a target then supersede in a second run; here supersede t_pain? keep separate below
  ]

  const res = applyReconcileOps(current, ops, ctx())

  // ── trait writes ──
  // reinforce(update) + refine(update) + contradict(update) + add(insert) = 4 writes
  expect(res.traitWrites.length).toBe(4)

  const reinforce = res.traitWrites.find((w) => w.trait.id === "t_pain")!
  expect(reinforce.mode).toBe("update")
  expect(reinforce.trait.strength).toBe(3) // 2 -> 3
  expect(reinforce.trait.srcQuote).toBe("still takes forever")
  expect(reinforce.trait.srcTranscriptId).toBe("tr_new")
  expect(reinforce.trait.status).toBe("active")

  const refine = res.traitWrites.find((w) => w.trait.id === "t_want")!
  expect(refine.mode).toBe("update")
  expect(refine.trait.text).toBe("Wants a true dark theme, not just dimmed")
  expect(refine.trait.strength).toBe(2)

  const contradicted = res.traitWrites.find((w) => w.trait.id === "t_love")!
  expect(contradicted.mode).toBe("update")
  expect(contradicted.trait.status).toBe("contradicted") // MARKED, not deleted

  const added = res.traitWrites.find((w) => w.mode === "insert")!
  expect(added.trait.id).toBe("new_1")
  expect(added.trait.text).toBe("Onboarding confusing")
  expect(added.trait.status).toBe("active")

  // ── trait_events: append-only, one per op (create/reinforce/refine/contradict) ──
  expect(res.traitEvents.length).toBe(4)
  const ops_seen = res.traitEvents.map((e) => e.op).sort()
  expect(ops_seen).toEqual(["contradict", "create", "refine", "reinforce"])
  // every event is grounded in the new transcript + carries the quote/source_date
  for (const e of res.traitEvents) {
    expect(e.transcriptId).toBe("tr_new")
    expect(e.sourceDate).toBe(2000)
    expect(e.quote.length).toBeGreaterThan(0)
    expect(e.createdAt).toBe(5000)
  }
  const refineEvt = res.traitEvents.find((e) => e.op === "refine")!
  expect(refineEvt.beforeText).toBe("Wants dark mode")
  expect(refineEvt.afterText).toBe("Wants a true dark theme, not just dimmed")

  // ── active-trait set: t_pain (active), t_want (active), new_1 (active). t_love contradicted -> excluded. ──
  const activeIds = res.activeTraits.map((t) => t.id).sort()
  expect(activeIds).toEqual(["new_1", "t_pain", "t_want"])
  expect(res.activeTraits.every((t) => t.status === "active")).toBe(true)

  // ── insights rebuilt from ACTIVE only (contradicted love is gone) ──
  const insights = insightsFromTraits(res.activeTraits)
  expect(insights.length).toBe(3)
  expect(insights.find((i) => i.kind === "love")).toBeUndefined()
  expect(insights.map((i) => i.traitId).sort()).toEqual(["new_1", "t_pain", "t_want"])
})

test("supersede marks old trait superseded (not deleted) and creates a new active replacement", () => {
  const current: Trait[] = [
    trait({ id: "t_old", kind: "want", text: "Wants CSV export" }),
  ]
  const ops: ReconcileOp[] = [
    { op: "supersede", kind: "want", text: "Wants full Excel export, not CSV", quote: "CSV isn't enough, I need Excel", quoteOffset: 5, speaker: "Sarah", traitId: "t_old" },
  ]
  const res = applyReconcileOps(current, ops, ctx())

  // one update (old -> superseded) + one insert (replacement)
  expect(res.traitWrites.length).toBe(2)
  const oldW = res.traitWrites.find((w) => w.trait.id === "t_old")!
  expect(oldW.mode).toBe("update")
  expect(oldW.trait.status).toBe("superseded") // MARKED, still present
  const newW = res.traitWrites.find((w) => w.mode === "insert")!
  expect(newW.trait.status).toBe("active")
  expect(newW.trait.text).toBe("Wants full Excel export, not CSV")

  // events: a 'supersede' event on the OLD trait (referencing new) + a 'create' for the new trait
  const supEvt = res.traitEvents.find((e) => e.op === "supersede")!
  expect(supEvt.traitId).toBe("t_old")
  expect(supEvt.reason).toContain("superseded_by:")
  expect(res.traitEvents.some((e) => e.op === "create" && e.traitId === newW.trait.id)).toBe(true)

  // active set: only the replacement (old superseded is excluded)
  expect(res.activeTraits.map((t) => t.id)).toEqual([newW.trait.id])

  // input not mutated (purity): the original current trait is still active
  expect(current[0].status).toBe("active")
})

test("ops targeting a missing/inactive trait fall back to a new active trait (no signal lost)", () => {
  const res = applyReconcileOps(
    [trait({ id: "t_gone", kind: "pain", text: "x", status: "contradicted" })],
    [{ op: "reinforce", kind: "pain", text: "New pain surfaced", quote: "this is new", traitId: "t_missing" },
     { op: "refine", kind: "want", text: "Refine of inactive", quote: "q", traitId: "t_gone" }],
    ctx(),
  )
  // both become inserts
  expect(res.traitWrites.every((w) => w.mode === "insert")).toBe(true)
  expect(res.traitWrites.length).toBe(2)
  expect(res.traitEvents.every((e) => e.op === "create")).toBe(true)
  // the originally-contradicted trait stays excluded from active
  expect(res.activeTraits.some((t) => t.id === "t_gone")).toBe(false)
})

// ── legacy-seed path (DB-backed, local libsql file like migrate.test.ts/provenance core) ──
// A pre-P3a Sim has insights_json populated but ZERO sim_traits. ensureTraitsSeeded must seed one
// active trait + a 'create' trait_event per insight (src_transcript_id='legacy_import'), be idempotent,
// and afterward a reconcile op set must be able to reinforce/refine an EXISTING (seeded) trait.
test("ensureTraitsSeeded: legacy insights → active traits + create events; idempotent; enables reinforce/refine", async () => {
  const dbMod = await loadDb()
  {
    // Unique persona id per run so the shared file DB can't collide on a re-run / leftover state.
    const SID = "sim_legacy_" + randomUUID(), PID = "proj_acme"
    // Legacy persona: insights_json populated, NO sim_traits rows. Legacy EXTRACT_SYS shape {kind,text,quote}.
    const legacyInsights = JSON.stringify([
      { kind: "pain", text: "Export is slow", quote: "It takes forever to export" },
      { kind: "want", text: "Wants dark mode", quote: "I really want a dark theme" },
      { kind: "love", text: "Loves the search", quote: "Search is amazing" },
    ])
    await dbMod.db!.execute({
      sql: `INSERT INTO personas (id,project_id,name,role,type,initials,accent,summary,insights_json,avatar,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [SID, PID, "Sarah", "PM", "client", "SA", "#6366f1", "A PM", legacyInsights, null, 1300, 1300],
    })

    // precondition: zero traits.
    expect((await dbMod.listTraits(SID)).length).toBe(0)

    // ── seed ──
    const seeded = await dbMod.ensureTraitsSeeded(SID)
    expect(seeded).toBe(3)

    const traits = await dbMod.listTraits(SID)
    expect(traits.length).toBe(3)
    expect(traits.every((t) => t.status === "active")).toBe(true)
    expect(traits.every((t) => t.srcTranscriptId === "legacy_import")).toBe(true)
    expect(traits.map((t) => t.kind).sort()).toEqual(["love", "pain", "want"])
    // src_quote = the insight quote; source_date ≈ persona created_at.
    const painT = traits.find((t) => t.kind === "pain")!
    expect(painT.text).toBe("Export is slow")
    expect(painT.srcQuote).toBe("It takes forever to export")

    // one 'create' trait_event per insight, anchored to legacy_import w/ reason 'legacy import'.
    const events = await dbMod.listTraitEvents(SID)
    expect(events.length).toBe(3)
    expect(events.every((e) => e.op === "create")).toBe(true)
    expect(events.every((e) => e.transcriptId === "legacy_import")).toBe(true)
    expect(events.every((e) => e.reason === "legacy import")).toBe(true)
    expect(events.every((e) => e.sourceDate === 1300)).toBe(true)

    // ── idempotent: a second call seeds nothing more ──
    const again = await dbMod.ensureTraitsSeeded(SID)
    expect(again).toBe(0)
    expect((await dbMod.listTraits(SID)).length).toBe(3)
    expect((await dbMod.listTraitEvents(SID)).length).toBe(3)

    // ── after seeding, a reconcile op set can REINFORCE + REFINE existing seeded traits (real evolution) ──
    const active = await dbMod.listTraits(SID, { activeOnly: true })
    const reinforceId = active.find((t) => t.kind === "pain")!.id
    const refineId = active.find((t) => t.kind === "want")!.id
    const ops: ReconcileOp[] = [
      { op: "reinforce", kind: "pain", text: "Export is slow", quote: "still painfully slow", speaker: "Sarah", traitId: reinforceId },
      { op: "refine", kind: "want", text: "Wants a true OLED dark theme", quote: "needs proper dark mode", speaker: "Sarah", traitId: refineId },
    ]
    const res = applyReconcileOps(active, ops, { simId: SID, projectId: PID, transcriptId: "tr_new", sourceDate: 2000 })
    // both target EXISTING traits → updates (NOT inserts) — proving evolution, not add-only.
    expect(res.traitWrites.every((w) => w.mode === "update")).toBe(true)
    expect(res.traitWrites.length).toBe(2)
    expect(res.traitEvents.map((e) => e.op).sort()).toEqual(["refine", "reinforce"])
    const refined = res.activeTraits.find((t) => t.id === refineId)!
    expect(refined.text).toBe("Wants a true OLED dark theme")
    const reinforced = res.activeTraits.find((t) => t.id === reinforceId)!
    expect(reinforced.strength).toBe(2) // 1 → 2

    // ── rebuildInsightsJson with active traits keeps insights; with zero active it must NOT wipe ──
    for (const w of res.traitWrites) await dbMod.updateTrait(w.trait)
    const rebuilt = await dbMod.rebuildInsightsJson(SID)
    expect(rebuilt.length).toBe(3) // 3 active traits still present
  }
})

// C1 guard: rebuildInsightsJson must be a NO-OP (not wipe) when active-trait set is empty but
// insights_json is currently non-empty (defensive against any future zero-trait path).
test("rebuildInsightsJson does NOT wipe insights_json when there are zero active traits", async () => {
  const dbMod = await loadDb()
  // Unique persona id per run so the shared file DB can't collide on a re-run / leftover state.
  const SID = "sim_noactive_" + randomUUID(), PID = "proj_acme"
  const insights = JSON.stringify([{ kind: "pain", text: "Slow export", quote: "It takes forever" }])
  await dbMod.db!.execute({
    sql: `INSERT INTO personas (id,project_id,name,role,type,initials,accent,summary,insights_json,avatar,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [SID, PID, "Bob", "Dev", "client", "BO", "#6366f1", "", insights, null, 1300, 1300],
  })
  // No sim_traits rows at all → zero active. rebuild must keep the existing insights_json.
  const out = await dbMod.rebuildInsightsJson(SID)
  expect(out.length).toBe(1) // returned the preserved existing insights, not []
  const r = await dbMod.db!.execute({ sql: "SELECT insights_json FROM personas WHERE id=?", args: [SID] })
  expect(JSON.parse(String((r.rows[0] as any).insights_json)).length).toBe(1) // NOT wiped
})
