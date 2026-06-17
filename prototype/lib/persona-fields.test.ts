// Task 3: DB row-mapper + SQL tests for area/issueType/severity fields,
// listTraitEvents({ traitId }) filter, and getRecentlyResolvedTraits.
// Hermetic pattern: set TURSO_DATABASE_URL to a local file BEFORE importing ./db.
import { test, expect, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { unlinkSync } from "node:fs"

const DB_FILE = join(tmpdir(), `klav-pf-${Date.now()}-${randomUUID()}.db`)
function rmDb() {
  for (const s of ["", "-wal", "-shm"]) { try { unlinkSync(DB_FILE + s) } catch {} }
}
rmDb()
process.env.TURSO_DATABASE_URL = "file:" + DB_FILE
delete process.env.TURSO_AUTH_TOKEN

async function loadDb() {
  const m = await import("./db")
  await m.applySchema(m.db!)
  await m.migrateV2(m.db!)
  return m
}

afterAll(rmDb)

// Bun shares one module registry across test files in a single `bun test` process, so the `db`
// singleton (created at import time from whichever db-touching test imported first) is shared --
// meaning these rows can land in a db another file also writes. Namespace every id with a
// unique per-run suffix so rows can never collide with another file's fixtures.
const RUN = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const T = (s: string) => `trait_pf_${s}_${RUN}`
const S = (s: string) => `sim_pf_${s}_${RUN}`
const PR = (s: string) => `proj_pf_${s}_${RUN}`

const SIM = S("1")
const PROJ = PR("1")
const NOW = 5000

// -- helpers ------------------------------------------------------------------

function makeTrait(over: Record<string, any>) {
  return {
    id: "trait_" + randomUUID(),
    simId: SIM,
    projectId: PROJ,
    kind: "pain" as const,
    text: "default text",
    status: "active" as const,
    strength: 1,
    srcTranscriptId: "tr_1",
    srcQuote: "some quote",
    srcQuoteOffset: null,
    srcSpeaker: null,
    createdAt: NOW,
    updatedAt: NOW,
    area: null,
    issueType: null,
    severity: null,
    ...over,
  }
}

function makeEvent(traitId: string, over: Record<string, any> = {}) {
  return {
    traitId,
    simId: SIM,
    transcriptId: "tr_1",
    op: "create" as const,
    beforeText: null,
    afterText: "some text",
    quote: "a quote",
    quoteOffset: null,
    speaker: null,
    sourceDate: NOW,
    reason: null,
    createdAt: NOW,
    area: null,
    issueType: null,
    severity: null,
    ...over,
  }
}

// -- test 1: insertTrait / listTraits round-trip with typed fields -------------

test("insertTrait + listTraits: area/issueType/severity persisted and returned", async () => {
  const db = await loadDb()

  const id1 = T("t1")
  const id2 = T("t2")

  // Insert a trait WITH the typed fields
  const t1 = makeTrait({
    id: id1,
    text: "Label copy is confusing",
    area: "checkout-flow",
    issueType: "label-copy",
    severity: "medium",
  })
  await db.insertTrait(t1)

  // Insert a trait WITHOUT the typed fields (null)
  const t2 = makeTrait({ id: id2, text: "Navigation too slow" })
  await db.insertTrait(t2)

  const traits = await db.listTraits(SIM)
  const found1 = traits.find((t) => t.id === id1)
  const found2 = traits.find((t) => t.id === id2)

  expect(found1).toBeTruthy()
  expect(found1!.area).toBe("checkout-flow")
  expect(found1!.issueType).toBe("label-copy")
  expect(found1!.severity).toBe("medium")

  expect(found2).toBeTruthy()
  expect(found2!.area).toBeNull()
  expect(found2!.issueType).toBeNull()
  expect(found2!.severity).toBeNull()
})

// -- test 2: updateTrait round-trip with typed fields -------------------------

test("updateTrait: area/issueType/severity persisted and returned", async () => {
  const db = await loadDb()

  const idUpd = T("upd")
  const t = makeTrait({ id: idUpd, text: "Layout breaks on mobile" })
  await db.insertTrait(t)

  // Update with typed fields set
  const updated = {
    ...t,
    area: "settings-screen",
    issueType: "layout",
    severity: "high",
    updatedAt: NOW + 100,
  }
  await db.updateTrait(updated)

  const traits = await db.listTraits(SIM)
  const found = traits.find((x) => x.id === idUpd)
  expect(found).toBeTruthy()
  expect(found!.area).toBe("settings-screen")
  expect(found!.issueType).toBe("layout")
  expect(found!.severity).toBe("high")
})

// -- test 3: insertTraitEvent + listTraitEvents round-trip with typed fields --

test("insertTraitEvent + listTraitEvents: area/issueType/severity persisted and returned", async () => {
  const db = await loadDb()

  const idEvt1 = T("evt1")
  const t = makeTrait({ id: idEvt1, text: "Performance issue in export" })
  await db.insertTrait(t)

  const e1 = makeEvent(idEvt1, {
    area: "export-modal",
    issueType: "performance",
    severity: "high",
    createdAt: NOW + 10,
  })
  const e2 = makeEvent(idEvt1, {
    op: "reinforce" as const,
    createdAt: NOW + 20,
    // no typed fields -- should come back null
  })
  await db.insertTraitEvent(e1)
  await db.insertTraitEvent(e2)

  const events = await db.listTraitEvents(SIM)
  const forTrait = events.filter((e) => e.traitId === idEvt1)
  expect(forTrait.length).toBeGreaterThanOrEqual(2)

  const withFields = forTrait.find((e) => e.area === "export-modal")
  expect(withFields).toBeTruthy()
  expect(withFields!.area).toBe("export-modal")
  expect(withFields!.issueType).toBe("performance")
  expect(withFields!.severity).toBe("high")

  const noFields = forTrait.find((e) => e.op === "reinforce")
  expect(noFields).toBeTruthy()
  expect(noFields!.area).toBeNull()
  expect(noFields!.issueType).toBeNull()
  expect(noFields!.severity).toBeNull()
})

// -- test 4: listTraitEvents({ traitId }) filter narrows correctly -------------

test("listTraitEvents: traitId filter narrows to one trait's events", async () => {
  const db = await loadDb()

  const idFA = T("fA")
  const idFB = T("fB")

  // Two distinct traits, each with their own event
  const tA = makeTrait({ id: idFA, text: "A pain" })
  const tB = makeTrait({ id: idFB, text: "B pain" })
  await db.insertTrait(tA)
  await db.insertTrait(tB)

  await db.insertTraitEvent(makeEvent(idFA, { createdAt: NOW + 30, area: "area-A" }))
  await db.insertTraitEvent(makeEvent(idFB, { createdAt: NOW + 40, area: "area-B" }))

  // Without filter: both traits' events present
  const all = await db.listTraitEvents(SIM)
  const hasA = all.some((e) => e.traitId === idFA)
  const hasB = all.some((e) => e.traitId === idFB)
  expect(hasA).toBe(true)
  expect(hasB).toBe(true)

  // With traitId filter: only A's events
  const filtered = await db.listTraitEvents(SIM, { traitId: idFA })
  expect(filtered.every((e) => e.traitId === idFA)).toBe(true)
  expect(filtered.some((e) => e.traitId === idFB)).toBe(false)
  expect(filtered.length).toBeGreaterThanOrEqual(1)
})

// -- test 5: getRecentlyResolvedTraits returns contradicted/superseded, newest-first --

test("getRecentlyResolvedTraits: returns contradicted/superseded only, newest-first, excludes active", async () => {
  const db = await loadDb()

  const SIM2 = S("resolved")
  const base = { simId: SIM2, projectId: PROJ }

  const idActive = T("r_active")
  const idContra = T("r_contra")
  const idSuper  = T("r_super")

  const tActive = makeTrait({ ...base, id: idActive, text: "Active pain", status: "active", updatedAt: 3000 })
  const tContra = makeTrait({ ...base, id: idContra, text: "Contradicted pain", status: "contradicted", updatedAt: 2000, area: "billing", issueType: "label-copy" })
  const tSuper  = makeTrait({ ...base, id: idSuper,  text: "Superseded pain", status: "superseded", updatedAt: 1000, area: "onboarding", issueType: "flow" })

  await db.insertTrait(tActive)
  await db.insertTrait(tContra)
  await db.insertTrait(tSuper)

  const resolved = await db.getRecentlyResolvedTraits(SIM2)

  // Must exclude active
  expect(resolved.some((t) => t.id === idActive)).toBe(false)

  // Must include contradicted + superseded
  expect(resolved.some((t) => t.id === idContra)).toBe(true)
  expect(resolved.some((t) => t.id === idSuper)).toBe(true)

  // Newest-first by updated_at
  const ids = resolved.map((t) => t.id)
  const contraIdx = ids.indexOf(idContra)
  const superIdx  = ids.indexOf(idSuper)
  expect(contraIdx).toBeLessThan(superIdx) // contradicted (updatedAt=2000) before superseded (1000)

  // Fields present
  const contra = resolved.find((t) => t.id === idContra)!
  expect(contra.area).toBe("billing")
  expect(contra.issueType).toBe("label-copy")

  // Respects limit
  const limited = await db.getRecentlyResolvedTraits(SIM2, 1)
  expect(limited.length).toBe(1)
  expect(limited[0].id).toBe(idContra) // newest
})
