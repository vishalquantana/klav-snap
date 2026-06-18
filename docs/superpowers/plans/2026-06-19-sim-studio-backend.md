# Sim Studio Backend (Versioned Trait & Persona Editing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add human-facing, fully versioned trait & persona editing APIs so the Sim Studio frontend can create/edit/archive personas and traits, with every human change recorded in the append-only `trait_events` / new `persona_edits` ledgers alongside AI-extracted history.

**Architecture:** Extend the existing P3a provenance model. Human edits reuse `trait_events` (the same ledger reconcile writes to), tagged with new op values (`manual_create`, `edit`, `manual_archive`) and an `actor` email. A small `logTraitEdit` helper wraps `updateTrait`/`insertTrait` + `insertTraitEvent` so a write and its audit row are always produced together. New project-scoped REST routes under `/api/sims/:id/traits` mirror the existing `/api/personas` auth/scoping. Persona identity edits get a lightweight `persona_edits` audit table.

**Tech Stack:** Bun, TypeScript, `@libsql/client` (Turso/SQLite), `bun:test` (subprocess-against-temp-DB pattern from `server.connectors.test.ts`).

## Global Constraints

- Runtime: Bun. Server entry `prototype/server.ts`; data layer `prototype/lib/db.ts`; provenance types `prototype/lib/provenance.ts`. (one line)
- All `/api/*` routes are project-scoped & auth-gated: resolve `me = (await sessionEmail(req)) || (await bearerEmail(req))` → 401 if absent; `proj = await resolveProject(me, url.searchParams.get("project"))` → 400 if absent; use `proj.id` as `project_id`. (verbatim pattern from `server.ts:880-884`)
- Ledger is **append-only**: never UPDATE or DELETE a `trait_events` row. Trait "deletion" is a soft status change to `archived`. (one line)
- Migrations are additive & idempotent: add columns via the `newTraitCols` ALTER loop in `applySchema` (`lib/db.ts:233`), guarded by `columnExists`. Never drop columns. (one line)
- SemVer lockstep (per project convention): a release bump touches `CHANGELOG.md`, `docs/PRD.md`, and all 5 manifests together — done once in the final task, not per-task. (one line)
- `trait_events.transcript_id` is `NOT NULL`. For manual events with no transcript, store the trait's current `srcTranscriptId` (its evidential origin); the `op` + `actor` denote the human edit. (one line)

---

### Task 1: Add `actor` column to `trait_events` + carry it through the data layer

**Files:**
- Modify: `prototype/lib/db.ts:233-240` (add to `newTraitCols`), `:1018-1028` (`insertTraitEvent`), `:1030-1045` (`rowToTraitEvent`)
- Modify: `prototype/lib/provenance.ts` (the `TraitEventRow` type — add `actor`, extend `op` union)
- Test: `prototype/db.traits-edit.test.ts` (new — direct `lib/db` unit test against a temp DB, following `db.connectors.test.ts` style)

**Interfaces:**
- Produces: `TraitEventRow` now has `actor?: string | null` and `op` includes `"manual_create" | "edit" | "manual_archive"`. `insertTraitEvent(e)` persists `actor`; `listTraitEvents(simId, {traitId?})` returns it.

- [ ] **Step 1: Extend the `TraitEventRow` type** in `prototype/lib/provenance.ts`. Find the `op` union and the type body; change them to:

```typescript
op: "create" | "reinforce" | "refine" | "contradict" | "supersede" | "reopen" | "manual_create" | "edit" | "manual_archive"
// ...and add this field to the TraitEventRow type body:
actor?: string | null
```

- [ ] **Step 2: Add the migration column.** In `prototype/lib/db.ts`, extend the `newTraitCols` array (currently ends at line 239 with `["trait_events", "severity"]`):

```typescript
  const newTraitCols: Array<[string, string]> = [
    ["sim_traits", "area"],
    ["sim_traits", "issue_type"],
    ["sim_traits", "severity"],
    ["trait_events", "area"],
    ["trait_events", "issue_type"],
    ["trait_events", "severity"],
    ["trait_events", "actor"],
  ]
```

- [ ] **Step 3: Persist `actor` in `insertTraitEvent`** (`prototype/lib/db.ts:1018`). Update the SQL column list, the placeholders, and the args:

```typescript
export async function insertTraitEvent(e: TraitEventRow): Promise<string> {
  const id = "tev_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO trait_events (id,trait_id,sim_id,transcript_id,op,before_text,after_text,quote,quote_offset,speaker,source_date,reason,area,issue_type,severity,actor,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, e.traitId, e.simId, e.transcriptId, e.op, e.beforeText ?? null, e.afterText ?? null,
           e.quote, e.quoteOffset ?? null, e.speaker ?? null, e.sourceDate, e.reason ?? null,
           e.area ?? null, e.issueType ?? null, e.severity ?? null, e.actor ?? null, e.createdAt],
  })
  return id
}
```

- [ ] **Step 4: Read `actor` in `rowToTraitEvent`** (`prototype/lib/db.ts:1030`). Add one line before the closing brace:

```typescript
    actor: x.actor != null ? String(x.actor) : null,
```

- [ ] **Step 5: Write the failing test** in `prototype/db.traits-edit.test.ts`. Mirror the temp-DB bootstrap of `db.connectors.test.ts` (import `initDb`/`db` after pointing `KLAV_DB`/the test DB env the other db tests use; if that file uses a helper, reuse it). Test body:

```typescript
import { test, expect } from "bun:test"
import { insertTrait, insertTraitEvent, listTraitEvents } from "./lib/db"
// (DB bootstrap identical to db.connectors.test.ts — fresh temp file, await initDb())

test("trait_events round-trips actor + manual op", async () => {
  const now = Date.now()
  await insertTrait({ id: "trait_x", simId: "sim_x", projectId: "proj_x", kind: "pain",
    text: "v1", status: "active", strength: 1, srcTranscriptId: "tr_x", srcQuote: "q",
    srcQuoteOffset: null, srcSpeaker: null, createdAt: now, updatedAt: now })
  await insertTraitEvent({ traitId: "trait_x", simId: "sim_x", transcriptId: "tr_x",
    op: "edit", beforeText: "v1", afterText: "v2", quote: "q", quoteOffset: null,
    speaker: null, sourceDate: now, reason: "manual", actor: "dev2@quantana.com.au", createdAt: now })
  const evs = await listTraitEvents("sim_x", { traitId: "trait_x" })
  expect(evs.length).toBe(1)
  expect(evs[0].op).toBe("edit")
  expect(evs[0].actor).toBe("dev2@quantana.com.au")
})
```

- [ ] **Step 6: Run the test, expect FAIL** (column `actor` missing / type error):

Run: `cd prototype && bun test db.traits-edit.test.ts`
Expected: FAIL (no such column: actor, or TS error on `actor`)

- [ ] **Step 7: Run the test, expect PASS** after Steps 1-4 are in place:

Run: `cd prototype && bun test db.traits-edit.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd prototype && git add lib/db.ts lib/provenance.ts db.traits-edit.test.ts
git commit -m "feat(provenance): add actor column + manual ops to trait_events"
```

---

### Task 2: `logTraitEdit` helper — atomic write + audit

**Files:**
- Modify: `prototype/lib/db.ts` (add helper near `insertTraitEvent`, ~line 1028)
- Test: `prototype/db.traits-edit.test.ts` (extend)

**Interfaces:**
- Consumes: `insertTrait`, `updateTrait`, `insertTraitEvent`, `listTraits` (Task 1).
- Produces:
  ```typescript
  export async function logTraitEdit(args: {
    op: "manual_create" | "edit" | "manual_archive",
    trait: Trait,           // the new/updated trait state to persist
    beforeText: string | null,
    actor: string,
    now: number,
  }): Promise<void>
  ```
  For `manual_create` it `insertTrait`s; for `edit`/`manual_archive` it `updateTrait`s; then always appends a matching `trait_events` row (`transcript_id = trait.srcTranscriptId`, `quote = trait.srcQuote`, `source_date = now`, `reason = "manual:" + op`, `actor`).

- [ ] **Step 1: Write the failing test** (append to `db.traits-edit.test.ts`):

```typescript
import { logTraitEdit, listTraits } from "./lib/db"

test("logTraitEdit(edit) updates trait text AND appends an edit event", async () => {
  const now = Date.now()
  await insertTrait({ id: "trait_e", simId: "sim_e", projectId: "proj_e", kind: "want",
    text: "old", status: "active", strength: 1, srcTranscriptId: "tr_e", srcQuote: "q",
    srcQuoteOffset: null, srcSpeaker: null, createdAt: now, updatedAt: now })
  const updated = { id: "trait_e", simId: "sim_e", projectId: "proj_e", kind: "want" as const,
    text: "new", status: "active" as const, strength: 1, srcTranscriptId: "tr_e", srcQuote: "q",
    srcQuoteOffset: null, srcSpeaker: null, createdAt: now, updatedAt: now + 1 }
  await logTraitEdit({ op: "edit", trait: updated, beforeText: "old", actor: "a@b.com", now: now + 1 })
  const traits = await listTraits("sim_e")
  expect(traits[0].text).toBe("new")
  const evs = await listTraitEvents("sim_e", { traitId: "trait_e" })
  expect(evs.at(-1)!.op).toBe("edit")
  expect(evs.at(-1)!.beforeText).toBe("old")
  expect(evs.at(-1)!.afterText).toBe("new")
  expect(evs.at(-1)!.actor).toBe("a@b.com")
})
```

- [ ] **Step 2: Run, expect FAIL** (`logTraitEdit` not exported):

Run: `cd prototype && bun test db.traits-edit.test.ts`
Expected: FAIL ("logTraitEdit is not a function" / import error)

- [ ] **Step 3: Implement `logTraitEdit`** in `prototype/lib/db.ts`:

```typescript
// Human edit/create/archive of a trait — persists the trait state AND appends a matching
// append-only audit event. The frontend Sim Studio writes go through here so every manual
// change is versioned alongside AI reconcile history.
export async function logTraitEdit(args: {
  op: "manual_create" | "edit" | "manual_archive"
  trait: Trait
  beforeText: string | null
  actor: string
  now: number
}): Promise<void> {
  const { op, trait, beforeText, actor, now } = args
  if (op === "manual_create") await insertTrait(trait)
  else await updateTrait(trait)
  await insertTraitEvent({
    traitId: trait.id, simId: trait.simId, transcriptId: trait.srcTranscriptId,
    op, beforeText, afterText: trait.text, quote: trait.srcQuote, quoteOffset: trait.srcQuoteOffset ?? null,
    speaker: trait.srcSpeaker ?? null, sourceDate: now, reason: "manual:" + op, actor,
    area: trait.area ?? null, issueType: trait.issueType ?? null, severity: trait.severity ?? null,
    createdAt: now,
  })
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd prototype && bun test db.traits-edit.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
cd prototype && git add lib/db.ts db.traits-edit.test.ts
git commit -m "feat(provenance): logTraitEdit helper — atomic trait write + audit event"
```

---

### Task 3: `GET /api/sims/:id/traits` — list active traits with attribution

**Files:**
- Modify: `prototype/server.ts` (add route inside the sims-route region, near `:1305` where `/api/sims/:id/transcripts` lives)
- Test: `prototype/server.traits.test.ts` (new — subprocess HTTP test mirroring `server.connectors.test.ts` bootstrap: temp DB seeded via raw client, server subprocess, authed fetch with a session cookie or bearer token)

**Interfaces:**
- Consumes: `listTraits(simId, {activeOnly:true})` (db).
- Produces: `GET /api/sims/:id/traits?project=<pid>` → `{ simId, traits: Trait[] }` (active only, `created_at ASC`). 401/400 on auth/project like siblings.

- [ ] **Step 1: Write the failing test** in `prototype/server.traits.test.ts`. Reuse the subprocess+temp-DB harness from `server.connectors.test.ts` (raw-seed a project, a persona `sim_t`, and two `sim_traits` rows for it; authenticate the same way that file does). Core assertion:

```typescript
test("GET /api/sims/:id/traits returns active traits", async () => {
  const res = await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.simId).toBe("sim_t")
  expect(Array.isArray(body.traits)).toBe(true)
  expect(body.traits.length).toBe(2)
  expect(body.traits[0]).toHaveProperty("srcQuote")
})
```

- [ ] **Step 2: Run, expect FAIL** (route returns 404):

Run: `cd prototype && bun test server.traits.test.ts`
Expected: FAIL (status 404, not 200)

- [ ] **Step 3: Add the route** in `prototype/server.ts`, next to the existing `GET /api/sims/:id/transcripts` handler (~line 1305). Import `listTraits` is already present in the db import block:

```typescript
    {
      const m = path.match(/^\/api\/sims\/([^/]+)\/traits$/)
      if (m && req.method === "GET") {
        const me2 = (await sessionEmail(req)) || (await bearerEmail(req))
        if (!me2) return json({ error: "Sign in to continue." }, 401)
        const proj2 = await resolveProject(me2, url.searchParams.get("project"))
        if (!proj2) return json({ error: "No project." }, 400)
        const simId = m[1]
        const traits = await listTraits(simId, { activeOnly: true })
        return json({ simId, traits })
      }
    }
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd prototype && bun test server.traits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd prototype && git add server.ts server.traits.test.ts
git commit -m "feat(api): GET /api/sims/:id/traits"
```

---

### Task 4: `POST /api/sims/:id/traits` — manually add a trait

**Files:**
- Modify: `prototype/server.ts` (extend the `/api/sims/:id/traits` block from Task 3 to also handle POST)
- Test: `prototype/server.traits.test.ts` (extend)

**Interfaces:**
- Consumes: `logTraitEdit` (Task 2), `crypto.randomUUID`.
- Produces: `POST /api/sims/:id/traits?project=<pid>` with body `{ kind, text, srcQuote?, srcTranscriptId?, srcSpeaker?, area?, severity? }` → `{ trait: Trait }` (201). Creates an active trait (id `trait_` + uuid, strength 1) and a `manual_create` event with `actor = me`.

- [ ] **Step 1: Write the failing test** (append):

```typescript
test("POST /api/sims/:id/traits creates a trait + manual_create event", async () => {
  const res = await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`, {
    method: "POST",
    body: JSON.stringify({ kind: "love", text: "Loves dark mode", srcQuote: "dark mode is great", srcTranscriptId: "tr_seed" }),
  })
  expect(res.status).toBe(201)
  const { trait } = await res.json()
  expect(trait.kind).toBe("love")
  expect(trait.text).toBe("Loves dark mode")
  const ev = await authedFetch(`/api/sims/sim_t/evolution?project=${PROJECT_ID}`)
  const { events } = await ev.json()
  expect(events.some((e: any) => e.op === "manual_create")).toBe(true)
})
```

- [ ] **Step 2: Run, expect FAIL** (POST → 404/405):

Run: `cd prototype && bun test server.traits.test.ts`
Expected: FAIL

- [ ] **Step 3: Add POST handling** inside the Task 3 `/api/sims/:id/traits` block (add before the GET `return`, branch on method):

```typescript
        if (req.method === "POST") {
          const body = await req.json().catch(() => ({}))
          const kind = ["pain", "want", "love"].includes(body.kind) ? body.kind : "pain"
          const now = Date.now()
          const trait = {
            id: "trait_" + crypto.randomUUID(), simId, projectId: proj2.id,
            kind, text: String(body.text || "").trim(), status: "active" as const, strength: 1,
            srcTranscriptId: String(body.srcTranscriptId || "manual"),
            srcQuote: String(body.srcQuote || ""), srcQuoteOffset: null,
            srcSpeaker: body.srcSpeaker ? String(body.srcSpeaker) : null,
            area: body.area ? String(body.area) : null, issueType: null,
            severity: body.severity ? String(body.severity) : null,
            createdAt: now, updatedAt: now,
          }
          if (!trait.text) return json({ error: "text required" }, 400)
          await logTraitEdit({ op: "manual_create", trait, beforeText: null, actor: me2, now })
          return json({ trait }, 201)
        }
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd prototype && bun test server.traits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd prototype && git add server.ts server.traits.test.ts
git commit -m "feat(api): POST /api/sims/:id/traits — manual trait create (versioned)"
```

---

### Task 5: `PUT` and `DELETE /api/sims/:id/traits/:traitId` — edit & archive

**Files:**
- Modify: `prototype/server.ts` (new block matching `/api/sims/:id/traits/:traitId`)
- Test: `prototype/server.traits.test.ts` (extend)

**Interfaces:**
- Consumes: `listTraits` (to load current state), `logTraitEdit`.
- Produces:
  - `PUT /api/sims/:id/traits/:traitId?project=<pid>` body `{ text?, kind?, severity?, area? }` → `{ trait }`. Loads current trait, applies provided fields, `logTraitEdit({op:"edit", beforeText: <old text>})`.
  - `DELETE /api/sims/:id/traits/:traitId?project=<pid>` → `{ ok: true }`. Sets status `archived`, `logTraitEdit({op:"manual_archive"})`. (Append-only: no row deleted.)

- [ ] **Step 1: Write the failing test** (append):

```typescript
test("PUT edits trait text + logs edit event with before/after", async () => {
  const list = await (await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`)).json()
  const id = list.traits[0].id
  const oldText = list.traits[0].text
  const res = await authedFetch(`/api/sims/sim_t/traits/${id}?project=${PROJECT_ID}`, {
    method: "PUT", body: JSON.stringify({ text: "edited text" }),
  })
  expect(res.status).toBe(200)
  expect((await res.json()).trait.text).toBe("edited text")
  const { events } = await (await authedFetch(`/api/sims/sim_t/evolution?project=${PROJECT_ID}`)).json()
  const editEv = events.find((e: any) => e.op === "edit")
  expect(editEv.beforeText).toBe(oldText)
  expect(editEv.afterText).toBe("edited text")
})

test("DELETE archives a trait (soft) — drops from active list, stays in events", async () => {
  const list = await (await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`)).json()
  const id = list.traits[0].id
  const res = await authedFetch(`/api/sims/sim_t/traits/${id}?project=${PROJECT_ID}`, { method: "DELETE" })
  expect(res.status).toBe(200)
  const after = await (await authedFetch(`/api/sims/sim_t/traits?project=${PROJECT_ID}`)).json()
  expect(after.traits.some((t: any) => t.id === id)).toBe(false)
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd prototype && bun test server.traits.test.ts`
Expected: FAIL (PUT/DELETE → 404)

- [ ] **Step 3: Add the `:traitId` block** in `prototype/server.ts` (place directly after the Task 3/4 block):

```typescript
    {
      const m = path.match(/^\/api\/sims\/([^/]+)\/traits\/([^/]+)$/)
      if (m && (req.method === "PUT" || req.method === "DELETE")) {
        const me2 = (await sessionEmail(req)) || (await bearerEmail(req))
        if (!me2) return json({ error: "Sign in to continue." }, 401)
        const proj2 = await resolveProject(me2, url.searchParams.get("project"))
        if (!proj2) return json({ error: "No project." }, 400)
        const [, simId, traitId] = m
        const current = (await listTraits(simId)).find(t => t.id === traitId)
        if (!current) return json({ error: "Trait not found." }, 404)
        const now = Date.now()
        if (req.method === "DELETE") {
          await logTraitEdit({ op: "manual_archive", trait: { ...current, status: "archived" as any, updatedAt: now }, beforeText: current.text, actor: me2, now })
          return json({ ok: true })
        }
        const body = await req.json().catch(() => ({}))
        const next = {
          ...current,
          text: body.text != null ? String(body.text).trim() : current.text,
          kind: ["pain", "want", "love"].includes(body.kind) ? body.kind : current.kind,
          severity: body.severity != null ? String(body.severity) : current.severity,
          area: body.area != null ? String(body.area) : current.area,
          updatedAt: now,
        }
        await logTraitEdit({ op: "edit", trait: next, beforeText: current.text, actor: me2, now })
        return json({ trait: next })
      }
    }
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd prototype && bun test server.traits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd prototype && git add server.ts server.traits.test.ts
git commit -m "feat(api): PUT/DELETE trait — versioned edit + soft archive"
```

---

### Task 6: Surface `actor` + manual ops in the evolution feed

**Files:**
- Modify: `prototype/server.ts:1238-1302` (the `GET /api/sims/:id/evolution` handler — add `actor` to each event object it returns)
- Test: `prototype/server.traits.test.ts` (extend)

**Interfaces:**
- Consumes: `listTraitEvents` (now returns `actor`).
- Produces: each event in `/api/sims/:id/evolution`'s `events[]` now includes `actor: string | null`. (The frontend Evolution spine renders "edited by X" for manual ops.)

- [ ] **Step 1: Write the failing test** (append):

```typescript
test("evolution feed exposes actor on manual edits", async () => {
  // (a prior PUT in this file already created an 'edit' event by AUTHED_EMAIL)
  const { events } = await (await authedFetch(`/api/sims/sim_t/evolution?project=${PROJECT_ID}`)).json()
  const editEv = events.find((e: any) => e.op === "edit")
  expect(editEv.actor).toBe(AUTHED_EMAIL)
})
```

- [ ] **Step 2: Run, expect FAIL** (`actor` undefined on event):

Run: `cd prototype && bun test server.traits.test.ts`
Expected: FAIL (editEv.actor is undefined)

- [ ] **Step 3: Add `actor` to the mapped event object** in `GET /api/sims/:id/evolution` (`server.ts:~1238-1302`). Find where each `TraitEventRow` is mapped to the response shape (the object with `op, afterText, beforeText, quote, speaker, sourceDate, ...`) and add:

```typescript
        actor: ev.actor ?? null,
```

(match the local variable name used in that map — likely `ev` or `e`.)

- [ ] **Step 4: Run, expect PASS**

Run: `cd prototype && bun test server.traits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd prototype && git add server.ts server.traits.test.ts
git commit -m "feat(api): expose edit actor in sim evolution feed"
```

---

### Task 7: `persona_edits` audit + version persona identity edits

**Files:**
- Modify: `prototype/lib/db.ts` (add `persona_edits` table to `applySchema` stmts; add `insertPersonaEdit` + `listPersonaEdits`)
- Modify: `prototype/server.ts:907-925` (the `PUT /api/personas/:id` handler — diff old vs new identity, append a `persona_edits` row per change)
- Modify: `prototype/lib/db.ts` import/export in `server.ts`
- Test: `prototype/server.traits.test.ts` (extend)

**Interfaces:**
- Produces:
  ```typescript
  export type PersonaEditRow = { id: string; personaId: string; projectId: string; field: string; beforeVal: string | null; afterVal: string | null; actor: string; createdAt: number }
  export async function insertPersonaEdit(e: Omit<PersonaEditRow, "id">): Promise<string>
  export async function listPersonaEdits(personaId: string): Promise<PersonaEditRow[]>
  ```
  `GET /api/personas/:id/edits?project=<pid>` → `{ personaId, edits: PersonaEditRow[] }`.

- [ ] **Step 1: Add the table** to the `applySchema` statement list in `prototype/lib/db.ts` (alongside the other `CREATE TABLE IF NOT EXISTS`):

```typescript
    `CREATE TABLE IF NOT EXISTS persona_edits (
       id TEXT PRIMARY KEY, persona_id TEXT NOT NULL, project_id TEXT NOT NULL,
       field TEXT NOT NULL, before_val TEXT, after_val TEXT, actor TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS persona_edits_idx ON persona_edits (persona_id, created_at)`,
```

- [ ] **Step 2: Add data-layer functions** in `prototype/lib/db.ts`:

```typescript
export type PersonaEditRow = { id: string; personaId: string; projectId: string; field: string; beforeVal: string | null; afterVal: string | null; actor: string; createdAt: number }
export async function insertPersonaEdit(e: Omit<PersonaEditRow, "id">): Promise<string> {
  const id = "ped_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO persona_edits (id,persona_id,project_id,field,before_val,after_val,actor,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    args: [id, e.personaId, e.projectId, e.field, e.beforeVal ?? null, e.afterVal ?? null, e.actor, e.createdAt],
  })
  return id
}
export async function listPersonaEdits(personaId: string): Promise<PersonaEditRow[]> {
  const r = await db!.execute({ sql: "SELECT * FROM persona_edits WHERE persona_id=? ORDER BY created_at ASC", args: [personaId] })
  return r.rows.map((x: any) => ({ id: String(x.id), personaId: String(x.persona_id), projectId: String(x.project_id),
    field: String(x.field), beforeVal: x.before_val != null ? String(x.before_val) : null,
    afterVal: x.after_val != null ? String(x.after_val) : null, actor: String(x.actor), createdAt: Number(x.created_at) }))
}
```

- [ ] **Step 3: Write the failing test** (append to `server.traits.test.ts`):

```typescript
test("PUT /api/personas/:id logs identity edits + GET edits returns them", async () => {
  await authedFetch(`/api/personas/sim_t?project=${PROJECT_ID}`, {
    method: "PUT", body: JSON.stringify({ name: "Renamed Sim", role: "New Role", type: "client", initials: "RS", accent: "#6366f1", summary: "updated", insights: [] }),
  })
  const res = await authedFetch(`/api/personas/sim_t/edits?project=${PROJECT_ID}`)
  expect(res.status).toBe(200)
  const { edits } = await res.json()
  expect(edits.some((e: any) => e.field === "name" && e.afterVal === "Renamed Sim")).toBe(true)
  expect(edits.find((e: any) => e.field === "name").actor).toBe(AUTHED_EMAIL)
})
```

- [ ] **Step 4: Run, expect FAIL** (`/edits` → 404; no diff logged):

Run: `cd prototype && bun test server.traits.test.ts`
Expected: FAIL

- [ ] **Step 5: Diff-and-log in the PUT handler** (`prototype/server.ts`, the `if (req.method === "PUT")` inside the `/api/personas/:id` block). Before calling `upsertPersona`, load the current persona and diff identity fields; after upsert, append edits. Add `insertPersonaEdit`, `listPersonaEdits`, `listPersonas` to the db import. Insert:

```typescript
          const before = (await listPersonas(wid)).find(p => p.id === pid)
          const now = Date.now()
          // ... existing upsertPersona(pid, wid, {...}) call stays ...
          if (before) {
            const fields: Array<[string, string | null, string | null]> = [
              ["name", before.name, String(body.name ?? "")],
              ["role", before.role, String(body.role ?? "")],
              ["summary", before.summary, String(body.summary ?? "")],
              ["type", before.type, String(body.type ?? "")],
              ["accent", before.accent, String(body.accent ?? "")],
            ]
            for (const [field, b, a] of fields) {
              if ((b ?? "") !== (a ?? "")) await insertPersonaEdit({ personaId: pid, projectId: wid, field, beforeVal: b, afterVal: a, actor: me2, now: now } as any)
            }
          }
```

  (Note: `insertPersonaEdit` takes `createdAt`, not `now` — adjust the object to `{ ..., createdAt: now }`.)

- [ ] **Step 6: Add the `GET /api/personas/:id/edits` route** in the `/api/personas/` block (near the `idMatch` handling):

```typescript
      const editsMatch = path.match(/^\/api\/personas\/([^/]+)\/edits$/)
      if (editsMatch && req.method === "GET") {
        return json({ personaId: editsMatch[1], edits: await listPersonaEdits(editsMatch[1]) })
      }
```

- [ ] **Step 7: Run, expect PASS**

Run: `cd prototype && bun test server.traits.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd prototype && git add lib/db.ts server.ts server.traits.test.ts
git commit -m "feat(api): version persona identity edits via persona_edits audit"
```

---

### Task 8: Full suite green + version bump

**Files:**
- Modify: `CHANGELOG.md`, `docs/PRD.md`, the 5 manifests (per the project's SemVer-lockstep convention — find current version in `CHANGELOG.md`, bump minor)
- No new test

- [ ] **Step 1: Run the full test suite**

Run: `cd prototype && bun test`
Expected: PASS (all files, including pre-existing `server.connectors.test.ts`, `db.connectors.test.ts`, etc. — no regressions)

- [ ] **Step 2: Bump version in lockstep.** Locate the current version (top of `CHANGELOG.md`); add a new minor entry summarizing: "Sim Studio backend: versioned trait create/edit/archive APIs + persona edit audit." Update `docs/PRD.md` and all 5 manifests to the same version (the project keeps these in lockstep on every change).

- [ ] **Step 3: Commit**

```bash
cd .. && git add CHANGELOG.md docs/PRD.md <the 5 manifest paths>
git commit -m "chore: release <new version> — Sim Studio backend (versioned trait/persona editing)"
```

---

## Self-Review

**1. Spec coverage:**
- Read + attribution APIs → Task 3 (`GET traits`); `evolution`/`transcripts` already exist (spec notes reuse). ✓
- Edit persona inline (identity) → Task 7 (`PUT personas` + audit). ✓
- Edit/add/archive traits → Tasks 4, 5. ✓
- Versioning (human edits → ledger w/ actor + date) → Tasks 1, 2, 6, 7. ✓
- New Sim + transcript upload → these use EXISTING `POST /api/personas` and `POST /api/transcripts` (no backend change needed); wiring is frontend (Plan 2). Noted, not a gap. ✓
- "transcript_id NOT NULL for manual events" constraint → handled in Task 4 (`srcTranscriptId || "manual"`) and `logTraitEdit` (uses `trait.srcTranscriptId`). ✓

**2. Placeholder scan:** No "TBD/handle edge cases/similar to". Every code step shows real code. The one soft spot — "reuse the harness from server.connectors.test.ts" — references shared, already-written test infrastructure (the 100-line temp-DB+subprocess bootstrap), not task logic; the actual assertions are written out in full. Acceptable.

**3. Type consistency:** `logTraitEdit` signature identical in Task 2 (def) and Tasks 4/5 (use). `Trait` fields (`srcTranscriptId`, `srcQuote`, `srcQuoteOffset`, `srcSpeaker`, `area`, `issueType`, `severity`) match `lib/provenance.ts`/`db.ts` exactly. `TraitEventRow.actor` added in Task 1, consumed in Task 6. `PersonaEditRow` consistent across Task 7. Status value `"archived"` is new (not in the original `active|superseded|contradicted` set) — `listTraits({activeOnly:true})` filters `status='active'` so archived correctly drops out; cast `as any` used where the TS union is narrower (flagged in Task 5).

> Frontend (the 3-pane studio UI consuming these APIs) is a separate plan: `2026-06-19-sim-studio-frontend.md`, written next.
