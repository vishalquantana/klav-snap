// lib/recurrence-memory-db.test.ts
//
// DB-level unit tests for buildRecurrenceMemory() and listProjectRecurringIssues().
// Targets the four KLA-2 correctness properties that existing tests don't cover
// at the library layer:
//
//   1. Count math — firstSeen/lastSeen arithmetic, single-row vs multi-row clusters
//   2. isRegression logic — only true when re-reported AFTER resolution
//   3. Rollup sort + project scoping — regressed first, then count DESC, limit honoured
//   4. Enriched read fields — citedSimName lookup, expectationStatus linkage
//
// These are pure DB calls (no HTTP server subprocess) so they run fast and give
// targeted failure messages when the logic breaks.

import { test, expect } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unlinkSync } from "node:fs"

// ── Hermetic DB (unique per test run) ────────────────────────────────────────
const RUN     = `${Date.now()}_${Math.random().toString(36).slice(2)}`
const DB_FILE = join(tmpdir(), `klav-recmem-db-${RUN}.db`)

for (const s of ["", "-wal", "-shm"]) { try { unlinkSync(DB_FILE + s) } catch {} }

process.env.TURSO_DATABASE_URL  = "file:" + DB_FILE
process.env.TURSO_AUTH_TOKEN    = ""

// Dynamic import so env vars above take effect before the module initialises its DB connection.
const { db, applySchema, migrateV2 } = await import("./db")
const { buildRecurrenceMemory, listProjectRecurringIssues } = await import("./recurrence-memory")

await applySchema(db!)
await migrateV2(db!)

async function exec(sql: string, args: any[] = []) {
  await db!.execute({ sql, args })
}

// ── Fixed epoch timestamps — no Date.now(), deterministic ordering ────────────
const T0 = 1_740_000_000_000   // baseline
const T1 = T0 + 1_000_000      // +17 min
const T2 = T0 + 2_000_000      // +33 min
const T3 = T0 + 3_000_000      // +50 min
const T4 = T0 + 4_000_000      // +67 min
const T5 = T0 + 5_000_000      // +83 min

// Helper: insert a feedback row with explicit timestamps (bypasses insertFeedback's Date.now()).
async function seedFb(opts: {
  id: string; projectId: string; observation?: string; status?: string
  issueKey?: string | null; simId?: string | null; suggestedBugTitle?: string
  count?: number; datesJson?: number[]; lastSeenAt?: number
  resolvedAt?: number | null; createdAt?: number
}) {
  const count      = opts.count ?? 1
  const dates      = opts.datesJson ?? [opts.createdAt ?? T0]
  const lastSeen   = opts.lastSeenAt ?? dates.at(-1) ?? opts.createdAt ?? T0
  const created    = opts.createdAt ?? T0
  const suggestion = opts.suggestedBugTitle
    ? JSON.stringify({ title: opts.suggestedBugTitle }) : null

  await exec(
    `INSERT INTO feedback
       (id, project_id, sim_id, observation, status, issue_key, suggested_bug_json,
        recurrence_count, recurrence_dates_json, last_seen_at, resolved_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [opts.id, opts.projectId, opts.simId ?? null,
     opts.observation ?? "test observation", opts.status ?? "open",
     opts.issueKey ?? null, suggestion,
     count, JSON.stringify(dates), lastSeen,
     opts.resolvedAt ?? null, created],
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. COUNT MATH
// ═════════════════════════════════════════════════════════════════════════════

const P_CM = `proj_cm_${RUN}`

test("CM1: brand-new issue — count=1, firstSeenAt=lastSeenAt=created_at", async () => {
  const id = `fb_cm1_${RUN}`
  await seedFb({ id, projectId: P_CM, count: 1, datesJson: [T0], createdAt: T0 })

  const mem = await buildRecurrenceMemory(db!, id, P_CM)
  expect(mem).not.toBeNull()
  expect(mem!.count).toBe(1)
  expect(mem!.firstSeenAt).toBe(T0)
  expect(mem!.lastSeenAt).toBe(T0)
})

test("CM2: issue reported 5× — count=5, firstSeenAt immutable, lastSeenAt = latest bump", async () => {
  const id = `fb_cm2_${RUN}`
  const ik = `ik_cm2_${RUN}`
  await seedFb({ id, projectId: P_CM, issueKey: ik,
    count: 5, datesJson: [T0, T1, T2, T3, T4], lastSeenAt: T4, createdAt: T0 })

  const mem = await buildRecurrenceMemory(db!, id, P_CM)
  expect(mem!.count).toBe(5)
  expect(mem!.firstSeenAt).toBe(T0)   // original created_at — never changes
  expect(mem!.lastSeenAt).toBe(T4)    // advances to latest occurrence
  expect(mem!.firstSeenAt).toBeLessThan(mem!.lastSeenAt)
})

test("CM3: two rows sharing the same issue_key aggregate counts (2+3=5)", async () => {
  const ik  = `ik_cm3_${RUN}`
  const id1 = `fb_cm3a_${RUN}`
  const id2 = `fb_cm3b_${RUN}`

  // Row 1: original, seen T0+T1
  await seedFb({ id: id1, projectId: P_CM, issueKey: ik,
    count: 2, datesJson: [T0, T1], lastSeenAt: T1, createdAt: T0 })
  // Row 2: second report cluster (same key), seen T2–T4
  await seedFb({ id: id2, projectId: P_CM, issueKey: ik,
    count: 3, datesJson: [T2, T3, T4], lastSeenAt: T4, createdAt: T2 })

  const mem = await buildRecurrenceMemory(db!, id1, P_CM)
  expect(mem!.count).toBe(5)          // 2 + 3 across both rows
  expect(mem!.firstSeenAt).toBe(T0)   // earliest across the cluster
  expect(mem!.lastSeenAt).toBe(T4)    // latest across the cluster
})

test("CM4: listProjectRecurringIssues excludes count=1 non-regressed issues", async () => {
  const id = `fb_cm4_${RUN}`
  await seedFb({ id, projectId: P_CM, count: 1, datesJson: [T0], createdAt: T0 })

  const results = await listProjectRecurringIssues(db!, P_CM)
  const ids = results.map(r => r.feedbackId)
  expect(ids).not.toContain(id)
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. isREGRESSION LOGIC
//    Formula: regressed = resolvedAt != null && lastSeenAt > resolvedAt
// ═════════════════════════════════════════════════════════════════════════════

const P_IR = `proj_ir_${RUN}`

test("IR1: recurring open ticket (resolved_at=null) → regressed=false regardless of count", async () => {
  const id = `fb_ir1_${RUN}`
  await seedFb({ id, projectId: P_IR,
    status: "open", count: 4, datesJson: [T0, T1, T2, T3], lastSeenAt: T3,
    resolvedAt: null, createdAt: T0 })

  const mem = await buildRecurrenceMemory(db!, id, P_IR)
  expect(mem!.regressed).toBe(false)
  expect(mem!.resolvedAt).toBeNull()
})

test("IR2: ticket resolved at T2, then seen at T3 — regressed=true (lastSeenAt > resolvedAt)", async () => {
  const id = `fb_ir2_${RUN}`
  const ik = `ik_ir2_${RUN}`
  // Three dates: T0 (created), T1, T3 (resurfaced AFTER resolution at T2)
  await seedFb({ id, projectId: P_IR, issueKey: ik, status: "done",
    count: 3, datesJson: [T0, T1, T3], lastSeenAt: T3,
    resolvedAt: T2, createdAt: T0 })

  const mem = await buildRecurrenceMemory(db!, id, P_IR)
  expect(mem!.regressed).toBe(true)
  expect(mem!.resolvedAt).toBe(T2)
  expect(mem!.lastSeenAt).toBe(T3)
  expect(mem!.lastSeenAt).toBeGreaterThan(mem!.resolvedAt!)
})

test("IR3: ticket resolved at T4, last_seen_at=T2 — regressed=false (resolved AFTER last report)", async () => {
  // Pattern: all reports happened before resolution — nobody re-filed after it was closed.
  const id = `fb_ir3_${RUN}`
  await seedFb({ id, projectId: P_IR, status: "done",
    count: 3, datesJson: [T0, T1, T2], lastSeenAt: T2,
    resolvedAt: T4, createdAt: T0 })

  const mem = await buildRecurrenceMemory(db!, id, P_IR)
  expect(mem!.regressed).toBe(false)
  // Sanity: confirm the timestamps make sense
  expect(mem!.lastSeenAt).toBeLessThan(mem!.resolvedAt!)
})

test("IR4: single occurrence (count=1) with resolved_at set — regressed=false", async () => {
  // Resolved at T2, only ever seen at T0 (created_at) — no post-resolution recurrence.
  const id = `fb_ir4_${RUN}`
  await seedFb({ id, projectId: P_IR, status: "done",
    count: 1, datesJson: [T0], lastSeenAt: T0,
    resolvedAt: T2, createdAt: T0 })

  const mem = await buildRecurrenceMemory(db!, id, P_IR)
  expect(mem!.regressed).toBe(false)
  expect(mem!.count).toBe(1)
})

test("IR5: isRegression boundary — resolvedAt=T2, lastSeenAt=T2 (equal, not strictly greater) → false", async () => {
  // Edge: last_seen_at == resolved_at. Condition is strictly >, so this is false.
  const id = `fb_ir5_${RUN}`
  await seedFb({ id, projectId: P_IR, status: "done",
    count: 2, datesJson: [T0, T2], lastSeenAt: T2,
    resolvedAt: T2, createdAt: T0 })

  const mem = await buildRecurrenceMemory(db!, id, P_IR)
  expect(mem!.regressed).toBe(false)   // lastSeenAt (T2) is NOT > resolvedAt (T2)
})

// ═════════════════════════════════════════════════════════════════════════════
// 3. ROLLUP SORT + PROJECT SCOPING
// ═════════════════════════════════════════════════════════════════════════════

const P_RS  = `proj_rs_${RUN}`
const P_RSF = `proj_rs_foreign_${RUN}`   // foreign project — must never bleed into P_RS

// Seed four issues in P_RS + one foreign:
//   A  regressed, count=2  → sorts FIRST (regression beats any count)
//   B  not regressed, count=5  → sorts second (highest non-regressed count)
//   C  not regressed, count=3  → sorts third
//   D  not regressed, count=1  → EXCLUDED (count=1 and not regressed)
// In P_RSF:
//   X  not regressed, count=9  → must not appear in P_RS results

const FA = `fb_rs_a_${RUN}`, FB = `fb_rs_b_${RUN}`
const FC = `fb_rs_c_${RUN}`, FD = `fb_rs_d_${RUN}`, FX = `fb_rs_x_${RUN}`

// A: regressed (resolved at T2, last seen at T3 > T2)
await seedFb({ id: FA, projectId: P_RS, issueKey: `ik_rs_a_${RUN}`,
  status: "done", count: 2, datesJson: [T0, T3], lastSeenAt: T3, resolvedAt: T2, createdAt: T0 })
// B: high-count non-regressed
await seedFb({ id: FB, projectId: P_RS,
  status: "open", count: 5, datesJson: [T0,T1,T2,T3,T4], lastSeenAt: T4, createdAt: T0 })
// C: medium-count non-regressed
await seedFb({ id: FC, projectId: P_RS,
  status: "open", count: 3, datesJson: [T0,T1,T2], lastSeenAt: T2, createdAt: T0 })
// D: single-occurrence — must be excluded
await seedFb({ id: FD, projectId: P_RS,
  status: "open", count: 1, datesJson: [T0], lastSeenAt: T0, createdAt: T0 })
// X: high-count in a DIFFERENT project
await seedFb({ id: FX, projectId: P_RSF,
  status: "open", count: 9, datesJson: [T0,T1,T2,T3,T4,T5], lastSeenAt: T5, createdAt: T0 })

test("RS1: regressed issue sorts above non-regressed issues regardless of count", async () => {
  const results = await listProjectRecurringIssues(db!, P_RS)

  expect(results.length).toBeGreaterThanOrEqual(3)        // A, B, C (D is excluded)
  expect(results[0].feedbackId).toBe(FA)                  // regressed → always first
  expect(results[0].regressed).toBe(true)
  expect(results[0].count).toBe(2)                        // count=2, lower than B's 5 — still wins
})

test("RS2: non-regressed issues are sorted by count descending (B:5 before C:3)", async () => {
  const results = await listProjectRecurringIssues(db!, P_RS)
  const nonReg = results.filter(r => !r.regressed)

  expect(nonReg[0].feedbackId).toBe(FB)   // count=5
  expect(nonReg[1].feedbackId).toBe(FC)   // count=3
  expect(nonReg[0].count).toBeGreaterThan(nonReg[1].count)
})

test("RS3: tiebreaker — same count, more recent lastSeenAt sorts first", async () => {
  const P_TIE = `proj_tie_${RUN}`
  const E1 = `fb_tie1_${RUN}`, E2 = `fb_tie2_${RUN}`

  // Both count=3; E1 is more recent
  await seedFb({ id: E1, projectId: P_TIE, status: "open",
    count: 3, datesJson: [T2, T3, T5], lastSeenAt: T5, createdAt: T2 })
  await seedFb({ id: E2, projectId: P_TIE, status: "open",
    count: 3, datesJson: [T0, T1, T2], lastSeenAt: T2, createdAt: T0 })

  const results = await listProjectRecurringIssues(db!, P_TIE)
  expect(results[0].feedbackId).toBe(E1)   // T5 > T2 → more recent first
  expect(results[1].feedbackId).toBe(E2)
})

test("RS4: count=1 non-regressed issue is excluded from rollup", async () => {
  const results = await listProjectRecurringIssues(db!, P_RS)
  const ids = results.map(r => r.feedbackId)
  expect(ids).not.toContain(FD)
})

test("RS5: project scoping — foreign project's issues never appear in this project's rollup", async () => {
  const results = await listProjectRecurringIssues(db!, P_RS)
  const ids = results.map(r => r.feedbackId)
  expect(ids).not.toContain(FX)
})

test("RS6: foreign project sees its own issues but not P_RS issues", async () => {
  const foreignResults = await listProjectRecurringIssues(db!, P_RSF)
  const foreignIds = foreignResults.map(r => r.feedbackId)
  expect(foreignIds).toContain(FX)
  // None of P_RS's IDs should bleed in
  for (const rsId of [FA, FB, FC]) {
    expect(foreignIds).not.toContain(rsId)
  }
})

test("RS7: limit parameter caps the result set", async () => {
  // P_RS has 3 qualifying issues (A, B, C) — request only 2
  const capped = await listProjectRecurringIssues(db!, P_RS, { limit: 2 })
  expect(capped.length).toBe(2)
  // Must still be the top-2 by sort: A (regressed) then B (count=5)
  expect(capped[0].feedbackId).toBe(FA)
  expect(capped[1].feedbackId).toBe(FB)
})

test("RS8: limit=1 returns only the highest-priority issue", async () => {
  const [top] = await listProjectRecurringIssues(db!, P_RS, { limit: 1 })
  expect(top.feedbackId).toBe(FA)    // regressed → always #1
  expect(top.regressed).toBe(true)
})

// ═════════════════════════════════════════════════════════════════════════════
// 4. ENRICHED READ FIELDS
// ═════════════════════════════════════════════════════════════════════════════

const P_EF   = `proj_ef_${RUN}`
const SIM_EF = `sim_ef_${RUN}`
const IK_EF  = `ik_ef_${RUN}`

// Seed a persona so citedSimName can be resolved from the DB
await exec(
  `INSERT INTO personas (id, project_id, name, role, type, initials, accent, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?,?)`,
  [SIM_EF, P_EF, "Betty Tester", "QA Lead", "client", "BT", "#10b981", T0, T0],
)
// Seed an expectation linked via issue_key = dedup_key
await exec(
  `INSERT INTO expectations (id, project_id, dedup_key, title, status, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?)`,
  [`exp_ef_${RUN}`, P_EF, IK_EF, "Login loop bug", "enforced", T0, T0],
)

const FB_EF = `fb_ef1_${RUN}`
await seedFb({ id: FB_EF, projectId: P_EF, simId: SIM_EF, issueKey: IK_EF,
  observation: "Login loop", status: "open",
  count: 3, datesJson: [T0, T1, T2], lastSeenAt: T2, createdAt: T0 })

test("EF1: citedSimName is resolved from the personas table via sim_id", async () => {
  const mem = await buildRecurrenceMemory(db!, FB_EF, P_EF)
  expect(mem).not.toBeNull()
  expect(mem!.citedSimId).toBe(SIM_EF)
  expect(mem!.citedSimName).toBe("Betty Tester")
})

test("EF2: expectationId and expectationStatus are linked via issue_key → dedup_key", async () => {
  const mem = await buildRecurrenceMemory(db!, FB_EF, P_EF)
  expect(mem!.expectationId).not.toBeNull()
  expect(mem!.expectationStatus).toBe("enforced")
})

test("EF3: firstSeenAt equals created_at, lastSeenAt equals the latest occurrence date", async () => {
  const mem = await buildRecurrenceMemory(db!, FB_EF, P_EF)
  expect(mem!.firstSeenAt).toBe(T0)   // original created_at
  expect(mem!.lastSeenAt).toBe(T2)    // latest in recurrence_dates_json
})

test("EF4: buildRecurrenceMemory returns null for an ID in a different project", async () => {
  // Correct project works
  const mem = await buildRecurrenceMemory(db!, FB_EF, P_EF)
  expect(mem).not.toBeNull()

  // Wrong project → null (not an error, just not found)
  const memWrong = await buildRecurrenceMemory(db!, FB_EF, `proj_nonexistent_${RUN}`)
  expect(memWrong).toBeNull()
})

test("EF5: summary string encodes count ordinal + firstSeen date + Sim attribution", async () => {
  const mem = await buildRecurrenceMemory(db!, FB_EF, P_EF)
  // count=3 → "3rd occurrence"
  expect(mem!.summary).toContain("3rd occurrence")
  // firstSeenAt=T0 → ISO date string present
  const expectedDate = new Date(T0).toISOString().slice(0, 10)
  expect(mem!.summary).toContain(expectedDate)
  // Sim attribution
  expect(mem!.summary).toContain("Betty Tester")
  expect(mem!.summary).toContain("(Sim)")
})

test("EF6: occurrences array is sorted chronologically, one entry per date", async () => {
  const mem = await buildRecurrenceMemory(db!, FB_EF, P_EF)
  const seen = mem!.occurrences.map(o => o.seenAt)
  // Must be ascending
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
  }
  // All three dates present
  expect(seen).toContain(T0)
  expect(seen).toContain(T1)
  expect(seen).toContain(T2)
})
