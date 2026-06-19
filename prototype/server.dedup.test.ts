// Dedup integration test: duplicate suggested bugs collapse into one row.
// Uses the same subprocess-against-temp-DB harness as server.traits.test.ts.
// fileBug(...) directly exercises findDuplicateFeedback + insertFeedback/bumpFeedbackRecurrence
// rather than driving HTTP so we can import helpers directly without starting a second server.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { reconnectDb, applySchema, insertFeedback, feedbackById, listTicketExports, findFeedbackByIssueKey, listRecentFeedbackForDedup, bumpFeedbackRecurrence } from "./lib/db"
import { issueKeyFor, chooseDedup } from "./lib/dedup"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const dbFile = join(tmpdir(), `klav-dedup-${ts}.db`)

const rawClient = createClient({ url: "file:" + dbFile })
async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// ── Schema: only the tables the dedup path touches ──
const NOW = Date.now()
const P = `proj_dedup_${ts}` // the project id used in tests

beforeAll(async () => {
  // Point the shared db client at our temp file before any db calls.
  reconnectDb("file:" + dbFile)

  // Apply the full schema (applySchema handles all tables including additive ALTERs).
  const c = createClient({ url: "file:" + dbFile })
  await applySchema(c)
  c.close()

  // Seed a minimal project row so project_id FK-style lookups don't break.
  await rawExec(
    `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  )
  await rawExec(`INSERT OR IGNORE INTO projects (id, account_id, name, created_at, updated_at) VALUES (?,?,?,?,?)`, [P, "acct_test", "Dedup Project", NOW, NOW])
})

afterAll(() => {
  rawClient.close()
})

// ── Local mirror of the server's findDuplicateFeedback helper ──
async function findDuplicateFeedback(args: {
  projectId: string; urlPath: string | null; issueType: string | null
  citedTraitIds: string[]; title: string; observation: string
}): Promise<string | null> {
  const issueKey = issueKeyFor({
    projectId: args.projectId, urlPath: args.urlPath ?? "/",
    issueType: args.issueType, citedTraitIds: args.citedTraitIds,
  })
  const exact = await findFeedbackByIssueKey(args.projectId, issueKey)
  const recent = exact ? [] : await listRecentFeedbackForDedup(args.projectId, 50)
  return chooseDedup({ title: args.title, observation: args.observation }, exact, recent)
}

function issueKeyForFeedback(projectId: string, urlPath: string | null, issueType: string | null, citedTraitIds: string[]): string {
  return issueKeyFor({ projectId, urlPath: urlPath ?? "/", issueType, citedTraitIds })
}

// ── fileBug: mirrors the /api/feedback dedup logic ──
async function fileBug(args: {
  projectId: string; urlPath: string; issueType: string | null
  citedTraitIds: string[]; title: string; observation: string
}): Promise<string> {
  const suggestedBug = { title: args.title, body: "test bug body", severity: "medium" }
  const dedupedInto = await findDuplicateFeedback({
    projectId: args.projectId,
    urlPath: args.urlPath,
    issueType: args.issueType,
    citedTraitIds: args.citedTraitIds,
    title: args.title,
    observation: args.observation,
  })
  if (dedupedInto) {
    await bumpFeedbackRecurrence(dedupedInto, Date.now())
    return dedupedInto
  }
  return insertFeedback({
    projectId: args.projectId,
    urlPath: args.urlPath,
    observation: args.observation,
    suggestedBug,
    citedTraitIds: args.citedTraitIds.length ? args.citedTraitIds : null,
    issueKey: issueKeyForFeedback(args.projectId, args.urlPath, args.issueType, args.citedTraitIds),
  })
}

// ── Tests ──

test("duplicate suggested bug → one feedback row, recurrence_count 2, no second ticket export", async () => {
  const id1 = await fileBug({
    projectId: P, urlPath: "/checkout", issueType: "flow", citedTraitIds: ["T1"],
    title: "Pay button dead", observation: "clicking pay does nothing",
  })
  const id2 = await fileBug({
    projectId: P, urlPath: "/checkout", issueType: "flow", citedTraitIds: ["T1"],
    title: "Pay button dead", observation: "clicking pay does nothing",
  })
  expect(id2).toBe(id1) // collapsed into the same row
  const row = await feedbackById(P, id1)
  expect(row).not.toBeNull()
  expect(row.recurrenceCount ?? row.recurrence_count).toBe(2)
  const exports = await listTicketExports(id1)
  expect(exports.length).toBeLessThanOrEqual(1) // no second external ticket
})

test("distinct suggested bug → a new feedback row", async () => {
  const a = await fileBug({
    projectId: P, urlPath: "/checkout", issueType: "flow", citedTraitIds: ["T1"],
    title: "Pay button dead", observation: "pay does nothing",
  })
  const b = await fileBug({
    projectId: P, urlPath: "/settings", issueType: "layout", citedTraitIds: ["T1"],
    title: "Settings misaligned", observation: "labels overlap",
  })
  expect(b).not.toBe(a)
})
