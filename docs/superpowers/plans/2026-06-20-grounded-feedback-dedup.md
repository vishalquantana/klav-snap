# Grounded Sim Feedback + Suggested-Bug Dedup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor every trait quote that backs a Sim's feedback to the exact line in its source transcript (or honestly flag it), and collapse duplicate suggested bugs into one report (bump recurrence, no second ticket) on unchanged QA builds.

**Architecture:** Two subsystems over one shared "issue identity" core. (A) A pure `groundQuote` verifies/snaps LLM quotes against the transcript `raw_text` and records a `verified` bit + real offset, wired into the existing pure `applyReconcileOps`. (B) A pure deterministic `issueKeyFor` + lexical `lexicalSim` fallback decide if a new suggested bug duplicates an existing one; the two server insertion paths (`/api/feedback`, `/api/sim/review`) bump a recurrence counter instead of inserting + auto-copying. All logic lives in pure functions (TDD), the server just wires them in.

**Tech Stack:** TypeScript on Bun; libSQL/SQLite (`@libsql/client`); `node:crypto`; `bun test`. Spec: `docs/superpowers/specs/2026-06-20-grounded-feedback-dedup-design.md`.

## Global Constraints

- Migrations are additive, `columnExists`-guarded `ALTER`s in `initDb`/`applySchema` (`prototype/lib/db.ts`) — NEVER in `migrateV2` (it early-returns on existing prod DBs). Copy the existing `feedbackAlters` loop pattern (db.ts ~256).
- No new AI calls. Grounding and dedup are pure/local.
- No new runtime dependencies. Semantic fallback is lexical (trigram cosine), not vector embeddings.
- `verified` is tri-state: `1` (anchored), `0` (LLM text, unanchored), `null` (not attempted / legacy). Stored as INTEGER.
- Dedup applies ONLY to feedback carrying a `suggestedBug`. Pure-observation feedback inserts unchanged.
- Run tests from the `prototype/` directory: `cd prototype && bun test <file>`. The full `bun test` suite is the regression gate and must stay green.
- Commit after every task. Do NOT `git add -A` (concurrent sessions share the dir) — add only the files named in each task.
- Test email for any smoke action: `vishal@quantana.com.au`. NEVER `ramesh@quantana.in`.

---

### Task 1: `groundQuote` pure helper

**Files:**
- Modify: `prototype/lib/provenance.ts` (add helper + consts near the top, after the type exports ~line 96)
- Test: `prototype/lib/provenance.test.ts` (append tests)

**Interfaces:**
- Produces: `groundQuote(rawText: string | null, quote: string): { quote: string; offset: number | null; verified: boolean | null }`

- [ ] **Step 1: Write the failing tests**

Append to `prototype/lib/provenance.test.ts`:

```ts
import { groundQuote } from "./provenance"

test("groundQuote: exact substring → real offset + verified true", () => {
  const raw = "Sarah: The export button is hidden.\nJon: agreed."
  const g = groundQuote(raw, "The export button is hidden.")
  expect(g.verified).toBe(true)
  expect(g.offset).toBe(raw.indexOf("The export button is hidden."))
  expect(raw.slice(g.offset!, g.offset! + g.quote.length)).toBe(g.quote)
})

test("groundQuote: smart-quote / dash variant snaps to the real span, verified true", () => {
  const raw = `Mia: I can't find the "Save" toggle — it's gone.`
  const g = groundQuote(raw, `I can’t find the “Save” toggle — it’s gone.`)
  expect(g.verified).toBe(true)
  expect(g.offset).not.toBeNull()
  // snapped text is taken from rawText, so it round-trips at the offset
  expect(raw.slice(g.offset!, g.offset! + g.quote.length)).toBe(g.quote)
})

test("groundQuote: case/whitespace variant of a line (not a verbatim substring) → snaps to the real line", () => {
  // Quote differs from the line only by case + collapsed/extra whitespace, so exact (step 1)
  // and char-normalized substring (step 2) both miss; fuzzy line-snap (step 3) catches it.
  const raw = "Lee: The checkout page keeps timing out.\nAna: ok"
  const g = groundQuote(raw, "lee: the   checkout   page   keeps   timing   out.")
  expect(g.verified).toBe(true)
  expect(g.offset).toBe(0)
  expect(g.quote).toBe("Lee: The checkout page keeps timing out.")
})

test("groundQuote: unrelated quote < threshold → keep text, offset null, verified false", () => {
  const raw = "Sarah: The export button is hidden."
  const g = groundQuote(raw, "the onboarding wizard crashed on step three")
  expect(g.verified).toBe(false)
  expect(g.offset).toBeNull()
  expect(g.quote).toBe("the onboarding wizard crashed on step three")
})

test("groundQuote: null rawText → verified null (not attempted); empty quote → verified false", () => {
  expect(groundQuote(null, "anything")).toEqual({ quote: "anything", offset: null, verified: null })
  expect(groundQuote("some text", "")).toEqual({ quote: "", offset: null, verified: false })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd prototype && bun test lib/provenance.test.ts -t groundQuote`
Expected: FAIL — `groundQuote is not a function` / import error.

- [ ] **Step 3: Implement `groundQuote`**

In `prototype/lib/provenance.ts`, after the type exports (after the `defaultNewId` block, ~line 96), add:

```ts
// ── Quote grounding: verify/anchor an LLM-returned quote against the transcript text. ──
// Pure. Returns the real substring + char offset when found; flags (verified:false) when not.
const GROUND_DICE_THRESHOLD = 0.85

// 1:1 char substitutions (length-preserving so offsets stay valid against the ORIGINAL raw).
function subsChars(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
}
function normTokens(s: string): Set<string> {
  return new Set(subsChars(s).toLowerCase().replace(/\s+/g, " ").trim().split(" ").filter(Boolean))
}
function tokenDice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return (2 * inter) / (a.size + b.size)
}
// Line spans with their start offset in raw (skips blank lines).
function lineSpans(raw: string): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = []
  let i = 0
  for (const line of raw.split("\n")) {
    const start = i
    const end = i + line.length
    if (line.trim()) out.push({ start, end, text: line })
    i = end + 1 // account for the consumed "\n"
  }
  return out
}

export function groundQuote(
  rawText: string | null,
  quote: string,
): { quote: string; offset: number | null; verified: boolean | null } {
  const q = (quote ?? "").trim()
  if (rawText == null) return { quote: q, offset: null, verified: null }
  if (!q) return { quote: q, offset: null, verified: false }

  // 1) exact substring
  const exact = rawText.indexOf(q)
  if (exact >= 0) return { quote: q, offset: exact, verified: true }

  // 2) length-preserving char-normalized substring (curly quotes, dashes, nbsp)
  const subOffset = subsChars(rawText).indexOf(subsChars(q))
  if (subOffset >= 0) return { quote: rawText.slice(subOffset, subOffset + q.length), offset: subOffset, verified: true }

  // 3) fuzzy snap to the best-scoring line
  const qTokens = normTokens(q)
  if (qTokens.size === 0) return { quote: q, offset: null, verified: false }
  let best = { score: 0, start: -1, end: -1 }
  for (const sp of lineSpans(rawText)) {
    const score = tokenDice(qTokens, normTokens(sp.text))
    if (score > best.score) best = { score, start: sp.start, end: sp.end }
  }
  if (best.score >= GROUND_DICE_THRESHOLD && best.start >= 0) {
    return { quote: rawText.slice(best.start, best.end).trim(), offset: best.start, verified: true }
  }
  return { quote: q, offset: null, verified: false }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd prototype && bun test lib/provenance.test.ts -t groundQuote`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap
git add prototype/lib/provenance.ts prototype/lib/provenance.test.ts
git commit -m "feat(grounding): pure groundQuote helper (exact → char-norm → fuzzy snap)"
```

---

### Task 2: Ground quotes inside `applyReconcileOps`

**Files:**
- Modify: `prototype/lib/provenance.ts` (`Trait`, `TraitEventRow`, `ReconcileCtx`, `applyReconcileOps`)
- Test: `prototype/lib/provenance.test.ts`

**Interfaces:**
- Consumes: `groundQuote` (Task 1).
- Produces: `Trait.srcVerified?: boolean | null`; `TraitEventRow.verified?: boolean | null`; `ReconcileCtx.rawText?: string | null`. When `ctx.rawText` is a string, every trait write + event row carries a grounded `srcQuote`/`srcQuoteOffset`/`srcVerified` (resp. `quote`/`quoteOffset`/`verified`).

- [ ] **Step 1: Write the failing test**

Append to `prototype/lib/provenance.test.ts`:

```ts
import { applyReconcileOps } from "./provenance"

test("applyReconcileOps: grounds add quote against ctx.rawText (offset + verified)", () => {
  const raw = "Pat: The settings page never saves my changes."
  const res = applyReconcileOps([], [
    { op: "add", kind: "pain", text: "settings don't save", quote: "The settings page never saves my changes.", speaker: "Pat" },
  ], { simId: "s1", projectId: "p1", transcriptId: "t1", sourceDate: 100, now: 200, newId: () => "tid1", rawText: raw })

  const w = res.traitWrites[0].trait
  expect(w.srcVerified).toBe(true)
  expect(w.srcQuoteOffset).toBe(raw.indexOf("The settings page never saves my changes."))
  const evt = res.traitEvents[0]
  expect(evt.verified).toBe(true)
  expect(evt.quoteOffset).toBe(w.srcQuoteOffset)
})

test("applyReconcileOps: unmatched quote → verified false, offset null", () => {
  const res = applyReconcileOps([], [
    { op: "add", kind: "pain", text: "x", quote: "totally unrelated sentence here", speaker: "Pat" },
  ], { simId: "s1", projectId: "p1", transcriptId: "t1", sourceDate: 100, now: 200, newId: () => "tid1", rawText: "Pat: hello." })
  expect(res.traitWrites[0].trait.srcVerified).toBe(false)
  expect(res.traitWrites[0].trait.srcQuoteOffset).toBeNull()
})

test("applyReconcileOps: no rawText in ctx → verified null (back-compat)", () => {
  const res = applyReconcileOps([], [
    { op: "add", kind: "pain", text: "x", quote: "anything", speaker: "Pat" },
  ], { simId: "s1", projectId: "p1", transcriptId: "t1", sourceDate: 100, now: 200, newId: () => "tid1" })
  expect(res.traitWrites[0].trait.srcVerified ?? null).toBeNull()
  expect(res.traitEvents[0].verified ?? null).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/provenance.test.ts -t "applyReconcileOps: grounds"`
Expected: FAIL — `srcVerified` undefined / `rawText` not on ctx type.

- [ ] **Step 3: Add the fields to the types**

In `prototype/lib/provenance.ts`:

In `Trait` (after `srcSpeaker: string | null`, ~line 24) add:
```ts
  srcVerified?: boolean | null
```
In `ReconcileCtx` (after `sourceDate: number`, ~line 53) add:
```ts
  rawText?: string | null
```
In `TraitEventRow` (after `quoteOffset: number | null`, ~line 74) add:
```ts
  verified?: boolean | null
```

- [ ] **Step 4: Ground every quote write/event in `applyReconcileOps`**

In `applyReconcileOps`, immediately after `const newId = ctx.newId ?? defaultNewId` (~line 117), add a grounding helper:
```ts
  const ground = (o: ReconcileOp) => groundQuote(ctx.rawText ?? null, o.quote)
```

In `baseEvt` (the `TraitEventRow` literal, ~line 132) replace the `quote` + `quoteOffset` lines and add `verified`:
```ts
    quote: ground(o).quote,
    quoteOffset: ground(o).offset,
    verified: ground(o).verified,
```

In `mkTrait` (the `Trait` literal, ~line 150) replace the `srcQuote` + `srcQuoteOffset` lines and add `srcVerified`:
```ts
    srcQuote: ground(o).quote,
    srcQuoteOffset: ground(o).offset,
    srcVerified: ground(o).verified,
```

In the `reinforce` case (~line 188) replace the three provenance lines:
```ts
        targetActive.srcTranscriptId = ctx.transcriptId
        targetActive.srcQuote = ground(o).quote
        targetActive.srcQuoteOffset = ground(o).offset
        targetActive.srcVerified = ground(o).verified
        targetActive.srcSpeaker = o.speaker ?? null
```

In the `refine` case (~line 205) make the same replacement:
```ts
        targetActive.srcTranscriptId = ctx.transcriptId
        targetActive.srcQuote = ground(o).quote
        targetActive.srcQuoteOffset = ground(o).offset
        targetActive.srcVerified = ground(o).verified
        targetActive.srcSpeaker = o.speaker ?? null
```

In the `supersede` case where it sets `targetResolved.srcQuote` (~line 259) make the same replacement:
```ts
        targetResolved.srcTranscriptId = ctx.transcriptId
        targetResolved.srcQuote = ground(o).quote
        targetResolved.srcQuoteOffset = ground(o).offset
        targetResolved.srcVerified = ground(o).verified
        targetResolved.srcSpeaker = o.speaker ?? null
```

> Note: `mkTrait` already covers the NEW trait that `supersede` and `reopen` create (both call `mkTrait`/`addNew`), so no other sites need changes.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd prototype && bun test lib/provenance.test.ts`
Expected: PASS (all, incl. the 3 new + existing provenance tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap
git add prototype/lib/provenance.ts prototype/lib/provenance.test.ts
git commit -m "feat(grounding): applyReconcileOps grounds quotes via ctx.rawText"
```

---

### Task 3: DB schema + mappers for `verified` and dedup columns

**Files:**
- Modify: `prototype/lib/db.ts` (ALTER loops ~239–267; `rowToTrait` ~991; `insertTrait` ~1006; `updateTrait` ~1017; `insertTraitEvent` ~1033; `rowToTraitEvent` ~1084)
- Test: `prototype/lib/migrate.test.ts`

**Interfaces:**
- Produces (new columns): `sim_traits.src_verified INTEGER`, `trait_events.verified INTEGER`, `feedback.issue_key TEXT`, `feedback.recurrence_count INTEGER DEFAULT 1`, `feedback.recurrence_dates_json TEXT`, `feedback.last_seen_at INTEGER`, plus index `feedback_issue_idx (project_id, issue_key)`. `rowToTrait`/`rowToTraitEvent` read the new verified column; `insertTrait`/`updateTrait`/`insertTraitEvent` write it.

- [ ] **Step 1: Write the failing migration test**

Append to `prototype/lib/migrate.test.ts` a test that boots a DB and asserts the new columns exist (reuse the file's existing `columnExistsT` helper at line 194 and its DB-setup pattern). Add:

```ts
test("grounded+dedup columns exist after initDb (additive, idempotent)", async () => {
  const c = await freshInitDb() // use the same boot helper the other tests in this file use
  expect(await columnExistsT(c, "sim_traits", "src_verified")).toBe(true)
  expect(await columnExistsT(c, "trait_events", "verified")).toBe(true)
  expect(await columnExistsT(c, "feedback", "issue_key")).toBe(true)
  expect(await columnExistsT(c, "feedback", "recurrence_count")).toBe(true)
  expect(await columnExistsT(c, "feedback", "recurrence_dates_json")).toBe(true)
  expect(await columnExistsT(c, "feedback", "last_seen_at")).toBe(true)
})
```

> If `migrate.test.ts` has no `freshInitDb` helper, mirror the exact boot/seed pattern used by the existing "columns appear after boot" test in that file (it already imports the db module and calls the init path). Match its setup line-for-line.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/migrate.test.ts -t "grounded+dedup columns"`
Expected: FAIL — columns not present.

- [ ] **Step 3: Add the ALTERs**

In `prototype/lib/db.ts`, extend the `newTraitCols` array (~239) with the two verified columns:
```ts
    ["sim_traits", "src_verified"],
    ["trait_events", "verified"],
```
> These ride the same loop that does `ALTER TABLE ${table} ADD COLUMN ${col} TEXT`. INTEGER vs TEXT affinity is irrelevant in SQLite for our 0/1/null usage, so the existing `TEXT` loop is fine; do NOT special-case them.

Extend the `feedbackAlters` array (~256) with the dedup columns:
```ts
    ["issue_key",              "TEXT"],
    ["recurrence_count",       "INTEGER NOT NULL DEFAULT 1"],
    ["recurrence_dates_json",  "TEXT"],
    ["last_seen_at",           "INTEGER"],
```

After the `feedbackAlters` loop (after line ~267, before the closing brace of the function), add the index:
```ts
  await c.execute(`CREATE INDEX IF NOT EXISTS feedback_issue_idx ON feedback (project_id, issue_key)`)
    .catch((e: any) => console.warn("feedback_issue_idx skipped:", e?.message || e))
```

- [ ] **Step 4: Thread `verified` through the trait mappers/writers**

In `rowToTrait` (~991), add after the `srcQuoteOffset` line:
```ts
    srcVerified: x.src_verified != null ? Number(x.src_verified) === 1 : null,
```
In `insertTrait` (~1006): add `src_verified` to the column list and a value. New SQL + args:
```ts
    sql: `INSERT INTO sim_traits (id,sim_id,project_id,kind,text,status,strength,src_transcript_id,src_quote,src_quote_offset,src_verified,src_speaker,area,issue_type,severity,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [t.id, t.simId, t.projectId, t.kind, t.text, t.status, t.strength,
           t.srcTranscriptId, t.srcQuote, t.srcQuoteOffset ?? null,
           t.srcVerified == null ? null : (t.srcVerified ? 1 : 0),
           t.srcSpeaker ?? null,
           t.area ?? null, t.issueType ?? null, t.severity ?? null, t.createdAt, t.updatedAt],
```
In `updateTrait` (~1017): add `src_verified=?` to the SET list and its arg:
```ts
    sql: `UPDATE sim_traits SET kind=?,text=?,status=?,strength=?,src_transcript_id=?,src_quote=?,src_quote_offset=?,src_verified=?,src_speaker=?,area=?,issue_type=?,severity=?,updated_at=? WHERE id=?`,
    args: [t.kind, t.text, t.status, t.strength, t.srcTranscriptId, t.srcQuote,
           t.srcQuoteOffset ?? null, t.srcVerified == null ? null : (t.srcVerified ? 1 : 0),
           t.srcSpeaker ?? null,
           t.area ?? null, t.issueType ?? null, t.severity ?? null, t.updatedAt, t.id],
```
In `insertTraitEvent` (~1033): add `verified` to the column list + value:
```ts
    sql: `INSERT INTO trait_events (id,trait_id,sim_id,transcript_id,op,before_text,after_text,quote,quote_offset,verified,speaker,source_date,reason,area,issue_type,severity,actor,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, e.traitId, e.simId, e.transcriptId, e.op, e.beforeText ?? null, e.afterText ?? null,
           e.quote, e.quoteOffset ?? null, e.verified == null ? null : (e.verified ? 1 : 0),
           e.speaker ?? null, e.sourceDate, e.reason ?? null,
           e.area ?? null, e.issueType ?? null, e.severity ?? null, e.actor ?? null, e.createdAt],
```
In `rowToTraitEvent` (~1084), add after the `quoteOffset` line:
```ts
    verified: x.verified != null ? Number(x.verified) === 1 : null,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd prototype && bun test lib/migrate.test.ts`
Then the provenance DB round-trip still green: `cd prototype && bun test lib/provenance.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap
git add prototype/lib/db.ts prototype/lib/migrate.test.ts
git commit -m "feat(db): src_verified/verified + feedback dedup columns (additive ALTERs)"
```

---

### Task 4: Dedup pure helpers (`issueKeyFor`, `lexicalSim`, `chooseDedup`)

**Files:**
- Create: `prototype/lib/dedup.ts`
- Test: `prototype/lib/dedup.test.ts`

**Interfaces:**
- Produces:
  - `normalizeUrlPath(p: string): string`
  - `issueKeyFor(parts: { projectId: string; urlPath: string; issueType: string | null; citedTraitIds: string[] }): string`
  - `lexicalSim(a: string, b: string): number`  (0..1)
  - `chooseDedup(cand: { title: string; observation: string }, exactMatch: { id: string } | null, recent: Array<{ id: string; title: string; observation: string }>, threshold?: number): string | null`

- [ ] **Step 1: Write the failing tests**

Create `prototype/lib/dedup.test.ts`:

```ts
import { test, expect } from "bun:test"
import { normalizeUrlPath, issueKeyFor, lexicalSim, chooseDedup } from "./dedup"

test("normalizeUrlPath strips query/hash + trailing slash", () => {
  expect(normalizeUrlPath("/checkout/?step=2#pay")).toBe("/checkout")
  expect(normalizeUrlPath("/")).toBe("/")
  expect(normalizeUrlPath("")).toBe("/")
})

test("issueKeyFor is stable across citedTraitIds order, varies by issueType/path/project", () => {
  const base = { projectId: "p1", urlPath: "/checkout", issueType: "flow", citedTraitIds: ["a", "b"] }
  expect(issueKeyFor(base)).toBe(issueKeyFor({ ...base, citedTraitIds: ["b", "a"] }))
  expect(issueKeyFor(base)).not.toBe(issueKeyFor({ ...base, issueType: "layout" }))
  expect(issueKeyFor(base)).not.toBe(issueKeyFor({ ...base, urlPath: "/cart" }))
  expect(issueKeyFor(base)).not.toBe(issueKeyFor({ ...base, projectId: "p2" }))
  // path normalization folds into the key
  expect(issueKeyFor(base)).toBe(issueKeyFor({ ...base, urlPath: "/checkout/?x=1" }))
})

test("lexicalSim: identical ~1, paraphrase high, unrelated low", () => {
  expect(lexicalSim("export button is hidden", "export button is hidden")).toBeGreaterThan(0.99)
  expect(lexicalSim("the export button is hidden", "export button is hidden on this page")).toBeGreaterThan(0.5)
  expect(lexicalSim("export button is hidden", "checkout payment timed out")).toBeLessThan(0.3)
})

test("chooseDedup: exact match wins; else semantic ≥ threshold; else null", () => {
  expect(chooseDedup({ title: "x", observation: "y" }, { id: "fb1" }, [])).toBe("fb1")
  const recent = [{ id: "fb2", title: "Export button is hidden", observation: "" }]
  expect(chooseDedup({ title: "Export button is hidden", observation: "" }, null, recent, 0.82)).toBe("fb2")
  expect(chooseDedup({ title: "Onboarding wizard crashes", observation: "" }, null, recent, 0.82)).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd prototype && bun test lib/dedup.test.ts`
Expected: FAIL — module `./dedup` not found.

- [ ] **Step 3: Implement `prototype/lib/dedup.ts`**

```ts
// Pure, DB-free issue-identity + similarity helpers for suggested-bug dedup.
import { createHash } from "node:crypto"

export function normalizeUrlPath(p: string): string {
  const noFragQuery = (p || "").split("#")[0].split("?")[0]
  const trimmed = noFragQuery.replace(/\/+$/, "")
  return trimmed || "/"
}

// Deterministic exact issue identity: same screen + same issue type + same cited traits.
export function issueKeyFor(parts: {
  projectId: string
  urlPath: string
  issueType: string | null
  citedTraitIds: string[]
}): string {
  const key = [
    parts.projectId,
    normalizeUrlPath(parts.urlPath),
    parts.issueType ?? "",
    [...parts.citedTraitIds].sort().join(","),
  ].join("|")
  return createHash("sha256").update(key).digest("hex").slice(0, 32)
}

function trigrams(s: string): Set<string> {
  const norm = (s || "").toLowerCase().replace(/\s+/g, " ").trim()
  const out = new Set<string>()
  if (!norm) return out
  const padded = `  ${norm} `
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

// Cosine-like similarity over character-trigram sets. 0..1.
export function lexicalSim(a: string, b: string): number {
  const A = trigrams(a)
  const B = trigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / Math.sqrt(A.size * B.size)
}

// Decide which existing feedback id (if any) this candidate duplicates.
// Exact key match (looked up by the caller) wins; else best semantic match ≥ threshold.
export function chooseDedup(
  cand: { title: string; observation: string },
  exactMatch: { id: string } | null,
  recent: Array<{ id: string; title: string; observation: string }>,
  threshold = 0.82,
): string | null {
  if (exactMatch) return exactMatch.id
  let best: { id: string | null; score: number } = { id: null, score: 0 }
  for (const r of recent) {
    const score = Math.max(lexicalSim(cand.title, r.title), lexicalSim(cand.observation, r.observation))
    if (score > best.score) best = { id: r.id, score }
  }
  return best.score >= threshold ? best.id : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd prototype && bun test lib/dedup.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap
git add prototype/lib/dedup.ts prototype/lib/dedup.test.ts
git commit -m "feat(dedup): pure issueKeyFor + lexicalSim + chooseDedup"
```

---

### Task 5: DB dedup helpers + `FeedbackInsert` fields

**Files:**
- Modify: `prototype/lib/db.ts` (`FeedbackInsert` ~699; `insertFeedback` ~707; add three helpers near `listFeedback` ~813)
- Test: `prototype/lib/dedup-db.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `FeedbackInsert` gains `issueKey?: string | null`.
  - `insertFeedback` writes `issue_key`, `recurrence_count=1`, `recurrence_dates_json=[today]`, `last_seen_at=now`.
  - `findFeedbackByIssueKey(projectId: string, issueKey: string): Promise<{ id: string } | null>`
  - `listRecentFeedbackForDedup(projectId: string, limit?: number): Promise<Array<{ id: string; title: string; observation: string }>>`
  - `bumpFeedbackRecurrence(id: string, atMs: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/dedup-db.test.ts` (mirror the DB-setup pattern in `prototype/lib/single-sim.test.ts` — it imports the db module + inits an in-memory/test DB and uses a project id constant `P`):

```ts
import { test, expect } from "bun:test"
import { insertFeedback, findFeedbackByIssueKey, listRecentFeedbackForDedup, bumpFeedbackRecurrence, feedbackById } from "./db"
// Reuse whatever init/setup helper single-sim.test.ts uses; bind P to a test project id.

test("findFeedbackByIssueKey returns the row; bump increments count + appends date", async () => {
  const id = await insertFeedback({ projectId: P, observation: "export hidden", suggestedBug: { title: "Export hidden" }, issueKey: "k1" })
  const found = await findFeedbackByIssueKey(P, "k1")
  expect(found?.id).toBe(id)

  await bumpFeedbackRecurrence(id, 1750000000000)
  const row = await feedbackById(P, id)
  expect(row.recurrenceCount ?? row.recurrence_count).toBe(2)
  const dates = JSON.parse(row.recurrenceDatesJson ?? row.recurrence_dates_json ?? "[]")
  expect(dates).toContain(1750000000000)
})

test("listRecentFeedbackForDedup returns id/title/observation for the project", async () => {
  await insertFeedback({ projectId: P, observation: "checkout times out", suggestedBug: { title: "Checkout timeout" }, issueKey: "k2" })
  const recent = await listRecentFeedbackForDedup(P, 50)
  expect(recent.some(r => r.title === "Checkout timeout" || r.observation === "checkout times out")).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/dedup-db.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement**

In `prototype/lib/db.ts`:

Add to `FeedbackInsert` (~699), after `sourceDate?: number | null`:
```ts
  issueKey?: string | null
```
In `insertFeedback` (~707) extend the SQL column list + values to persist the dedup fields. Replace the function body's `execute` with:
```ts
  const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO feedback (id,project_id,sim_id,actor_email,url_host,url_path,observation,sentiment,severity,
          screenshot_id,suggested_bug_json,cited_trait_ids_json,source_quote,source_transcript_id,source_date,
          plane_issue_key,plane_issue_url,issue_key,recurrence_count,recurrence_dates_json,last_seen_at,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, f.projectId, f.simId ?? null, f.actorEmail ?? null, f.urlHost ?? null, f.urlPath ?? null,
           f.observation ?? null, f.sentiment ?? null, f.severity ?? null, f.screenshotId ?? null,
           f.suggestedBug != null ? JSON.stringify(f.suggestedBug) : null,
           f.citedTraitIds != null ? JSON.stringify(f.citedTraitIds) : null,
           f.sourceQuote ?? null, f.sourceTranscriptId ?? null, f.sourceDate ?? null,
           f.planeIssueKey ?? null, f.planeIssueUrl ?? null,
           f.issueKey ?? null, 1, JSON.stringify([now]), now, now],
  })
  return id
```

Add three helpers after `listFeedback` (~813):
```ts
export async function findFeedbackByIssueKey(projectId: string, issueKey: string): Promise<{ id: string } | null> {
  if (!issueKey) return null
  const r = await db!.execute({
    sql: "SELECT id FROM feedback WHERE project_id=? AND issue_key=? ORDER BY created_at DESC LIMIT 1",
    args: [projectId, issueKey],
  })
  return r.rows.length ? { id: String((r.rows[0] as any).id) } : null
}

export async function listRecentFeedbackForDedup(projectId: string, limit = 50): Promise<Array<{ id: string; title: string; observation: string }>> {
  const r = await db!.execute({
    sql: `SELECT id, observation, suggested_bug_json FROM feedback
          WHERE project_id=? AND suggested_bug_json IS NOT NULL
          ORDER BY created_at DESC LIMIT ?`,
    args: [projectId, limit],
  })
  return r.rows.map((x: any) => {
    let title = ""
    try { title = String(JSON.parse(x.suggested_bug_json || "{}")?.title || "") } catch { title = "" }
    return { id: String(x.id), title, observation: x.observation != null ? String(x.observation) : "" }
  })
}

export async function bumpFeedbackRecurrence(id: string, atMs: number): Promise<void> {
  const r = await db!.execute({ sql: "SELECT recurrence_count, recurrence_dates_json FROM feedback WHERE id=?", args: [id] })
  if (!r.rows.length) return
  const row = r.rows[0] as any
  const count = Number(row.recurrence_count ?? 1) + 1
  let dates: number[] = []
  try { dates = JSON.parse(row.recurrence_dates_json || "[]") } catch { dates = [] }
  dates.push(atMs)
  await db!.execute({
    sql: "UPDATE feedback SET recurrence_count=?, recurrence_dates_json=?, last_seen_at=? WHERE id=?",
    args: [count, JSON.stringify(dates), atMs, id],
  })
}
```

> If `rowToFeedback`/`feedbackById` do not already surface `recurrence_count`/`recurrence_dates_json`, add them to `rowToFeedback` (~791) as `recurrenceCount: Number(x.recurrence_count ?? 1)` and `recurrenceDatesJson: x.recurrence_dates_json != null ? String(x.recurrence_dates_json) : null` so the test's `feedbackById` assertions read them. Match the camelCase mapping style already used in that mapper.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd prototype && bun test lib/dedup-db.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap
git add prototype/lib/db.ts prototype/lib/dedup-db.test.ts
git commit -m "feat(dedup): feedback issue_key persistence + lookup/bump db helpers"
```

---

### Task 6: `resolveCitations` returns `issueType` + `sourceQuoteVerified`

**Files:**
- Modify: `prototype/server.ts` (`resolveCitations` ~293–340)
- Test: covered by the server test in Task 7 (no isolated test needed; this is a small return-shape extension).

**Interfaces:**
- Produces: `resolveCitations(...)` return object gains `issueType: string | null` (from the primary cited trait) and `sourceQuoteVerified: boolean | null` (the primary trait's `srcVerified`).

- [ ] **Step 1: Extend the return type + empty object**

In `prototype/server.ts`, in `resolveCitations` (~293), add `issueType` and `sourceQuoteVerified` to the declared return type and to `empty`:
```ts
async function resolveCitations(simId: string | null, citedTraitIds: any): Promise<{
  citedTraitIds: string[]; sourceQuote: string | null; speaker: string | null; sourceTranscriptId: string | null; sourceDate: number | null;
  issueType: string | null; sourceQuoteVerified: boolean | null;
  recurrence: any
}> {
  const empty = { citedTraitIds: [] as string[], sourceQuote: null, speaker: null, sourceTranscriptId: null, sourceDate: null, issueType: null, sourceQuoteVerified: null, recurrence: null }
```

- [ ] **Step 2: Populate from the primary trait**

In the return at the end of `resolveCitations` (~337), add the two fields sourced from `primary`:
```ts
    issueType: (primary as any).issueType ?? null,
    sourceQuoteVerified: (primary as any).srcVerified ?? null,
```

- [ ] **Step 3: Typecheck**

Run: `cd prototype && bun build server.ts --target=bun --outfile=/dev/null` (or the repo's typecheck script if present, e.g. `bun run typecheck`).
Expected: no type errors referencing `resolveCitations`.

- [ ] **Step 4: Commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap
git add prototype/server.ts
git commit -m "feat(grounding): resolveCitations returns issueType + sourceQuoteVerified"
```

---

### Task 7: Wire dedup into the two insertion paths + thread rawText

**Files:**
- Modify: `prototype/server.ts` — reconcile call (~1354), `/api/feedback` path (~848–895), `/api/sim/review` path (~1256–1268)
- Test: `prototype/server.dedup.test.ts` (new)

**Interfaces:**
- Consumes: `groundQuote` (via `applyReconcileOps` ctx), `issueKeyFor`, `chooseDedup` (Task 4), `findFeedbackByIssueKey`/`listRecentFeedbackForDedup`/`bumpFeedbackRecurrence` (Task 5), `resolveCitations` extended shape (Task 6).
- Produces: on a duplicate suggested bug, NO new `feedback` row and NO auto-copy; the existing row's `recurrence_count` is bumped. Review responses include `deduped: true` on a deduped reaction.

- [ ] **Step 1: Thread rawText into the reconcile pass**

In `prototype/server.ts`, the transcript reconcile loop builds ctx at `applyReconcileOps(traitsForApply, ops, { simId, projectId, transcriptId, sourceDate })` (~1354). Add `rawText`:
```ts
          const res = applyReconcileOps(traitsForApply, ops, { simId, projectId, transcriptId, sourceDate, rawText: text })
```
(`text` is the transcript body already in scope at ~1301.)

- [ ] **Step 2: Add the import**

At the top of `prototype/server.ts` where `lib/dedup` symbols are needed, add:
```ts
import { issueKeyFor, chooseDedup } from "./lib/dedup"
import { findFeedbackByIssueKey, listRecentFeedbackForDedup, bumpFeedbackRecurrence } from "./lib/db"
```
(Fold the db imports into the existing `from "./lib/db"` import list if one exists.)

- [ ] **Step 3: Add a small server-local dedup resolver**

Near the other server helpers (e.g. just below `resolveCitations`), add:
```ts
// Decide whether a suggested bug duplicates an existing project report. Returns the existing
// feedback id to collapse into, or null to insert fresh. Pure decision over DB lookups.
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
// Re-export the key so insert sites store it on new rows.
function issueKeyForFeedback(projectId: string, urlPath: string | null, issueType: string | null, citedTraitIds: string[]): string {
  return issueKeyFor({ projectId, urlPath: urlPath ?? "/", issueType, citedTraitIds })
}
```

- [ ] **Step 4: Wire the `/api/feedback` path (ticket-creating)**

In `prototype/server.ts` between `citation = await resolveCitations(...)` (~848) and `feedbackId = await insertFeedback({...})` (~850), insert the dedup check. Only dedup when there is a `suggestedBug`:
```ts
              let dedupedInto: string | null = null
              if (suggestedBug) {
                dedupedInto = await findDuplicateFeedback({
                  projectId, urlPath, issueType: citation.issueType,
                  citedTraitIds: citation.citedTraitIds,
                  title: String(suggestedBug?.title || ""), observation,
                })
              }
              if (dedupedInto) {
                await bumpFeedbackRecurrence(dedupedInto, Date.now())
                feedbackId = dedupedInto
              } else {
                feedbackId = await insertFeedback({
                  projectId, simId, actorEmail: actor, urlHost, urlPath,
                  observation, sentiment, severity, screenshotId, suggestedBug,
                  citedTraitIds: citation.citedTraitIds.length ? citation.citedTraitIds : null,
                  sourceQuote: citation.sourceQuote, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate,
                  planeIssueKey: null, planeIssueUrl: null,
                  issueKey: suggestedBug ? issueKeyForFeedback(projectId, urlPath, citation.issueType, citation.citedTraitIds) : null,
                })
              }
```
Then gate the activity + auto-copy block on a FRESH insert only. Change the existing `if (feedbackId) {` that wraps auto-copy (~865) to:
```ts
              if (feedbackId && !dedupedInto) {
```
And gate the `insertActivity({ type: "feedback_filed", ... })` (~857) the same way (a recurrence bump is not a new filing) — wrap it in `if (!dedupedInto)`.

- [ ] **Step 5: Wire the `/api/sim/review` path (dashboard rows)**

In `prototype/server.ts`, the review reactions loop (~1255) currently always inserts. Replace the body of `for (const r of reactions) { ... }` with:
```ts
          for (const r of reactions) {
            const citation = await resolveCitations(sim.id, r?.citedTraitIds)
            const bug = r?.suggestedBug
            let dedupedInto: string | null = null
            if (bug) {
              dedupedInto = await findDuplicateFeedback({
                projectId, urlPath, issueType: citation.issueType,
                citedTraitIds: citation.citedTraitIds,
                title: String(bug?.title || ""), observation: r?.observation ?? "",
              })
            }
            let feedbackId: string
            if (dedupedInto) {
              await bumpFeedbackRecurrence(dedupedInto, Date.now())
              feedbackId = dedupedInto
              r.deduped = true
            } else {
              feedbackId = await insertFeedback({
                projectId, simId: sim.id, actorEmail: meR, urlHost, urlPath,
                observation: r?.observation ?? null, sentiment: r?.sentiment ?? null,
                severity: r?.suggestedBug?.severity ?? null, screenshotId, suggestedBug: r?.suggestedBug ?? null,
                citedTraitIds: citation.citedTraitIds.length ? citation.citedTraitIds : null,
                sourceQuote: citation.sourceQuote, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate,
                issueKey: bug ? issueKeyForFeedback(projectId, urlPath, citation.issueType, citation.citedTraitIds) : null,
              })
            }
            r.citation = citation.citedTraitIds.length
              ? { citedTraitIds: citation.citedTraitIds, sourceQuote: citation.sourceQuote, speaker: citation.speaker, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate, sourceQuoteVerified: citation.sourceQuoteVerified, recurrence: citation.recurrence }
              : null
            r.feedbackId = feedbackId
          }
```

- [ ] **Step 6: Write the server dedup test**

Create `prototype/server.dedup.test.ts`. Mirror the harness in `prototype/server.traits.test.ts` (it boots the server/app + seeds a project + sim with traits). The test seeds one sim with one trait id `T1`, then files the SAME suggested bug twice via `/api/feedback` (or directly exercises `findDuplicateFeedback` + the insert/bump helpers if the HTTP harness is heavy) and asserts:

```ts
test("duplicate suggested bug → one feedback row, recurrence_count 2, no second ticket export", async () => {
  // file #1
  const id1 = await fileBug({ projectId: P, urlPath: "/checkout", issueType: "flow", citedTraitIds: ["T1"], title: "Pay button dead", observation: "clicking pay does nothing" })
  // file #2 — identical issue identity
  const id2 = await fileBug({ projectId: P, urlPath: "/checkout", issueType: "flow", citedTraitIds: ["T1"], title: "Pay button dead", observation: "clicking pay does nothing" })
  expect(id2).toBe(id1) // collapsed into the same row
  const row = await feedbackById(P, id1)
  expect(row.recurrenceCount ?? row.recurrence_count).toBe(2)
  const exports = await listTicketExports(id1)
  expect(exports.length).toBeLessThanOrEqual(1) // no second external ticket
})

test("distinct suggested bug → a new feedback row", async () => {
  const a = await fileBug({ projectId: P, urlPath: "/checkout", issueType: "flow", citedTraitIds: ["T1"], title: "Pay button dead", observation: "pay does nothing" })
  const b = await fileBug({ projectId: P, urlPath: "/settings", issueType: "layout", citedTraitIds: ["T1"], title: "Settings misaligned", observation: "labels overlap" })
  expect(b).not.toBe(a)
})
```

> `fileBug` is a thin local helper in the test that calls the same code path the server uses — either POST `/api/feedback` through the test app, or directly: compute the dedup decision via `findDuplicateFeedback`, then `bumpFeedbackRecurrence` or `insertFeedback({..., issueKey})`. Use whichever the existing `server.traits.test.ts` harness makes easy; assert behavior, not transport.

- [ ] **Step 7: Run the test + full suite**

Run: `cd prototype && bun test server.dedup.test.ts`
Then: `cd prototype && bun test`
Expected: PASS; full suite green.

- [ ] **Step 8: Commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap
git add prototype/server.ts prototype/server.dedup.test.ts
git commit -m "feat(dedup): collapse duplicate suggested bugs (bump recurrence, no re-file) in both insert paths; thread rawText into reconcile"
```

---

### Task 8: Version bump + changelog + manifests

**Files:**
- Modify: `CHANGELOG.md`, `docs/PRD.md`, and the 5 manifests (the `manifest.json` / `package.json` set kept in lockstep per the SemVer memory — locate via `grep -rl '"version"' --include=manifest.json --include=package.json` across `packages/`, `prototype/`, and the extension; match whatever the previous version-bump commit touched).
- Test: none (metadata).

**Interfaces:** none.

- [ ] **Step 1: Pick the next MINOR version**

This is a new user-facing capability → next MINOR. Read the current version from `CHANGELOG.md`'s top entry and increment the minor (e.g. `0.21.1` → `0.22.0`).

- [ ] **Step 2: Update all five manifests + the changelog**

Set the same new version in all 5 manifests. Add a `CHANGELOG.md` entry:
```markdown
## 0.X.0 — 2026-06-20
### Added
- Grounded Sim feedback: trait quotes are now verified/anchored to the exact transcript line (`groundQuote`); citations carry a `verified` bit + real character offset. Unmatched quotes are flagged, never fabricated.
- Suggested-bug dedup: duplicate bugs on an unchanged build collapse into the existing report (recurrence counter bumped, re-sighting dates recorded) instead of filing duplicate feedback rows / external tickets. Hybrid identity = deterministic key (project + path + issueType + cited traits) with a lexical-similarity fallback.
```

- [ ] **Step 3: Add the PRD note**

In `docs/PRD.md`, add a short note under the relevant section that quote grounding is verify-and-anchor with a `verified` tri-state, and suggested-bug dedup is prospective (collapses new duplicates; no retroactive backfill of `src_verified` or de-duplication of pre-existing rows).

- [ ] **Step 4: Commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap
git add CHANGELOG.md docs/PRD.md <the 5 manifest paths>
git commit -m "chore: bump to 0.X.0 — grounded feedback + suggested-bug dedup"
```

---

## Self-Review

**Spec coverage:**
- Subsystem A grounding (`groundQuote`, snap-then-flag, wiring into `applyReconcileOps`, `verified` tri-state) → Tasks 1, 2, 3, 6, 7-step1.
- Subsystem B dedup (hybrid key + lexical fallback, collapse + bump recurrence, before auto-copy, both insertion paths) → Tasks 4, 5, 7.
- Schema additivity in `initDb` → Task 3.
- `resolveCitations` carries `sourceQuoteVerified` → Task 6; `issueType` for the key → Task 6.
- Legacy seeds stay `verified=null` → no task needed (confirmed in spec; `ensureTraitsSeeded` untouched).
- Tests (pure-first + server) → each task's test steps; full-suite gate in Task 7-step7.
- Version/docs lockstep → Task 8.

**Placeholder scan:** no "TBD"/"handle edge cases"/"similar to" — each code step shows full code. The two soft spots (test-harness reuse in Tasks 5 & 7) explicitly instruct mirroring a named existing test file and assert behavior, not a vague "write tests."

**Type consistency:** `groundQuote` returns `{ quote, offset, verified }` used identically in Task 2; `srcVerified`/`verified` are `boolean | null` in the types and serialized `null | 0 | 1` in Task 3; `issueKeyFor` param shape matches between Tasks 4 and 7; `findDuplicateFeedback`/`chooseDedup` signatures match their call sites; `resolveCitations` added fields (`issueType`, `sourceQuoteVerified`) are produced in Task 6 and consumed in Task 7.
