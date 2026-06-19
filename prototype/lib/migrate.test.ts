// SAFE migration verification (§2.4) — runs against a LOCAL libsql file DB, never production Turso.
// Seeds the OLD schema, runs applySchema()+migrateV2(), asserts the cutover, then re-runs to prove idempotency.
import { test, expect } from "bun:test"
import { createClient, type Client } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unlinkSync } from "node:fs"
import { applySchema, migrateV2 } from "./db"

// Seed the pre-P2 ("v1") schema + a representative workspace with [admin, admin, user] + personas + integration.
async function seedV1(c: Client) {
  await c.execute(`CREATE TABLE users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
  await c.execute(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`)
  await c.execute(`CREATE TABLE memberships (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(workspace_id, email))`)
  await c.execute(`CREATE TABLE integrations (scope TEXT NOT NULL, owner_id TEXT NOT NULL, integration TEXT NOT NULL, config_json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (scope, owner_id))`)
  await c.execute(`CREATE TABLE personas (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)

  const wid = "ws-1"
  await c.execute({ sql: "INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)", args: [wid, "Acme", 1000] })
  // first admin (owner), a second admin, and a plain user — ordered by created_at.
  await c.execute({ sql: "INSERT INTO memberships (id,workspace_id,email,role,created_at) VALUES (?,?,?,?,?)", args: ["m1", wid, "owner@acme.com", "admin", 1000] })
  await c.execute({ sql: "INSERT INTO memberships (id,workspace_id,email,role,created_at) VALUES (?,?,?,?,?)", args: ["m2", wid, "admin2@acme.com", "admin", 1100] })
  await c.execute({ sql: "INSERT INTO memberships (id,workspace_id,email,role,created_at) VALUES (?,?,?,?,?)", args: ["m3", wid, "user@acme.com", "user", 1200] })
  await c.execute({ sql: "INSERT INTO users (email,created_at) VALUES (?,?)", args: ["owner@acme.com", 1000] })
  // a persona with insights_json
  const insights = JSON.stringify([{ kind: "pain", text: "Slow export", quote: "It takes forever" }])
  await c.execute({ sql: "INSERT INTO personas (id,workspace_id,name,role,type,initials,accent,summary,insights_json,avatar,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", args: ["sim_a", wid, "Sarah", "PM", "client", "SA", "#6366f1", "A PM", insights, null, 1300, 1300] })
  // a workspace-scoped integration that must re-scope to the project
  await c.execute({ sql: "INSERT INTO integrations (scope,owner_id,integration,config_json,updated_at) VALUES (?,?,?,?,?)", args: ["workspace", wid, "plane", JSON.stringify({ workspace: "acme", projectId: "p1", token_enc: "iv:ct" }), 1400] })
}

async function n(c: Client, sql: string, args: any[] = []): Promise<number> {
  const r = await c.execute({ sql, args })
  return Number((r.rows[0] as any).n)
}

test("v2 migration: seed → migrate → assert → re-run idempotent", async () => {
  const file = join(tmpdir(), `klav-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const c = createClient({ url: "file:" + file })
  try {
    await seedV1(c)
    // run the production schema + migration against this local file
    await applySchema(c)
    await migrateV2(c)

    // accounts: id reuses workspace id, owner_email = first admin
    const acct = (await c.execute("SELECT * FROM accounts WHERE id='ws-1'")).rows[0] as any
    expect(acct).toBeTruthy()
    expect(String(acct.name)).toBe("Acme")
    expect(String(acct.owner_email)).toBe("owner@acme.com")

    // projects: deterministic id 'proj_'+wid with §2.2 defaults
    const proj = (await c.execute("SELECT * FROM projects WHERE id='proj_ws-1'")).rows[0] as any
    expect(proj).toBeTruthy()
    expect(String(proj.account_id)).toBe("ws-1")
    expect(String(proj.name)).toBe("Default Project")
    expect(String(proj.review_mode)).toBe("auto")
    expect(String(proj.observability_mode)).toBe("named")
    expect(Number(proj.review_budget_daily)).toBe(200)

    // account_members: first admin→owner, other admins→admin, user→member
    const amRole = async (email: string) => String(((await c.execute({ sql: "SELECT account_role FROM account_members WHERE account_id='ws-1' AND email=?", args: [email] })).rows[0] as any).account_role)
    expect(await amRole("owner@acme.com")).toBe("owner")
    expect(await amRole("admin2@acme.com")).toBe("admin")
    expect(await amRole("user@acme.com")).toBe("member")

    // project_members: admin→admin, user→member
    const pmRole = async (email: string) => String(((await c.execute({ sql: "SELECT project_role FROM project_members WHERE project_id='proj_ws-1' AND email=?", args: [email] })).rows[0] as any).project_role)
    expect(await pmRole("owner@acme.com")).toBe("admin")
    expect(await pmRole("admin2@acme.com")).toBe("admin")
    expect(await pmRole("user@acme.com")).toBe("member")

    // personas re-scoped to 'proj_'+wid, insights_json preserved; personas_v1 preserved untouched
    const p = (await c.execute("SELECT * FROM personas WHERE id='sim_a'")).rows[0] as any
    expect(String(p.project_id)).toBe("proj_ws-1")
    expect(String(p.insights_json)).toContain("Slow export")
    const v1 = (await c.execute("SELECT * FROM personas_v1 WHERE id='sim_a'")).rows[0] as any
    expect(String(v1.workspace_id)).toBe("ws-1")

    // integration re-scoped workspace→project, owner_id='proj_'+wid
    const integ = (await c.execute("SELECT * FROM integrations WHERE scope='project'")).rows[0] as any
    expect(integ).toBeTruthy()
    expect(String(integ.owner_id)).toBe("proj_ws-1")
    expect((await n(c, "SELECT COUNT(*) AS n FROM integrations WHERE scope='workspace'"))).toBe(0)

    // migrated_v2 flag set
    const flag = (await c.execute("SELECT value FROM schema_meta WHERE key='migrated_v2'")).rows[0] as any
    expect(flag).toBeTruthy()

    // ── re-run: idempotent, no duplicates, no error ──
    await applySchema(c)
    await migrateV2(c)

    expect(await n(c, "SELECT COUNT(*) AS n FROM accounts")).toBe(1)
    expect(await n(c, "SELECT COUNT(*) AS n FROM projects")).toBe(1)
    expect(await n(c, "SELECT COUNT(*) AS n FROM account_members")).toBe(3)
    expect(await n(c, "SELECT COUNT(*) AS n FROM project_members")).toBe(3)
    expect(await n(c, "SELECT COUNT(*) AS n FROM personas")).toBe(1)
    expect(await n(c, "SELECT COUNT(*) AS n FROM personas_v1")).toBe(1)
    expect(await n(c, "SELECT COUNT(*) AS n FROM integrations WHERE scope='project'")).toBe(1)
    expect(await n(c, "SELECT COUNT(*) AS n FROM integrations WHERE scope='workspace'")).toBe(0)
  } finally {
    c.close()
    try { unlinkSync(file) } catch {}
    try { unlinkSync(file + "-wal") } catch {}
    try { unlinkSync(file + "-shm") } catch {}
  }
})

// Helper: cleanup a local libsql file + its sidecars.
function rmDb(file: string) {
  try { unlinkSync(file) } catch {}
  try { unlinkSync(file + "-wal") } catch {}
  try { unlinkSync(file + "-shm") } catch {}
}

// FRESH INSTALL: applySchema must create the canonical project-scoped personas directly, so
// migrateV2 produces no junk personas_v1 and a second boot is a clean no-op.
test("fresh install: applySchema creates project-scoped personas, no junk personas_v1", async () => {
  const file = join(tmpdir(), `klav-fresh-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const c = createClient({ url: "file:" + file })
  try {
    // No v1 seed — empty DB, exactly like a brand-new deployment.
    await applySchema(c)
    await migrateV2(c)

    // personas exists with the §2.2 project-scoped shape (project_id present, no workspace_id).
    const cols = (await c.execute("PRAGMA table_info(personas)")).rows.map((x: any) => String(x.name))
    expect(cols).toContain("project_id")
    expect(cols).toContain("source_transcript_id")
    expect(cols).not.toContain("workspace_id")

    // No junk personas_v1 table was created.
    expect(await tableExistsT(c, "personas_v1")).toBe(false)

    // migrated_v2 flag set.
    const flag = (await c.execute("SELECT value FROM schema_meta WHERE key='migrated_v2'")).rows[0] as any
    expect(flag).toBeTruthy()

    // Second run is a clean no-op: no error, still no personas_v1, personas still project-scoped.
    await applySchema(c)
    await migrateV2(c)
    expect(await tableExistsT(c, "personas_v1")).toBe(false)
    const cols2 = (await c.execute("PRAGMA table_info(personas)")).rows.map((x: any) => String(x.name))
    expect(cols2).toContain("project_id")
    expect(cols2).not.toContain("workspace_id")
  } finally {
    c.close()
    rmDb(file)
  }
})

// INTEGRATIONS COLLISION: a workspace integration AND a pre-existing project row with the same
// owner_id='proj_'+wid must NOT cause a PK throw; the existing project config is preserved.
test("integrations collision: re-scope is collision-safe and non-lossy", async () => {
  const file = join(tmpdir(), `klav-integ-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const c = createClient({ url: "file:" + file })
  try {
    await seedV1(c) // workspace ws-1 + a scope='workspace' integration (owner_id='ws-1')
    // Simulate a half-migrated/retried state: the project-scoped row already exists for proj_ws-1.
    await applySchema(c)
    const existingCfg = JSON.stringify({ workspace: "acme", projectId: "p1", token_enc: "EXISTING:keep" })
    await c.execute({
      sql: "INSERT INTO integrations (scope,owner_id,integration,config_json,updated_at) VALUES (?,?,?,?,?)",
      args: ["project", "proj_ws-1", "plane", existingCfg, 9999],
    })

    // Must not throw on the PK (scope,owner_id) collision.
    await migrateV2(c)

    // Exactly one project row for proj_ws-1, and it kept the PRE-EXISTING config (INSERT OR IGNORE).
    const projRows = (await c.execute("SELECT * FROM integrations WHERE scope='project' AND owner_id='proj_ws-1'")).rows as any[]
    expect(projRows.length).toBe(1)
    expect(String(projRows[0].config_json)).toContain("EXISTING:keep")
    // Workspace row consumed; no lingering scope='workspace' rows.
    expect(await n(c, "SELECT COUNT(*) AS n FROM integrations WHERE scope='workspace'")).toBe(0)

    // Re-run: still no throw, still exactly one project row, no duplicates.
    await applySchema(c)
    await migrateV2(c)
    expect(await n(c, "SELECT COUNT(*) AS n FROM integrations WHERE scope='project' AND owner_id='proj_ws-1'")).toBe(1)
    expect(await n(c, "SELECT COUNT(*) AS n FROM integrations WHERE scope='workspace'")).toBe(0)
  } finally {
    c.close()
    rmDb(file)
  }
})

async function tableExistsT(c: Client, name: string): Promise<boolean> {
  const r = await c.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?", args: [name] })
  return r.rows.length > 0
}

async function columnExistsT(c: Client, table: string, col: string): Promise<boolean> {
  try {
    const r = await c.execute(`PRAGMA table_info(${table})`)
    return r.rows.some((x: any) => String(x.name) === col)
  } catch { return false }
}

// PROD-SAFE ADDITIVE MIGRATION: columns added in initDb/applySchema (NOT migrateV2).
// This test seeds a DB with migrated_v2 ALREADY set and the OLD sim_traits/trait_events shape
// (no area/issue_type/severity), then runs applySchema() and asserts the columns appear —
// proving that existing prod DBs (where migrateV2 is a fast no-op) get the new columns.
test("persona-quality additive columns: migrated_v2 already set → applySchema adds area/issue_type/severity", async () => {
  const file = join(tmpdir(), `klav-persona-q-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const c = createClient({ url: "file:" + file })
  try {
    // Seed the schema manually to simulate an existing prod DB that has already been migrated_v2.
    // Crucially, sim_traits and trait_events do NOT have the new columns yet.
    await c.execute(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
    await c.execute(`CREATE TABLE IF NOT EXISTS sim_traits (
       id TEXT PRIMARY KEY, sim_id TEXT NOT NULL, project_id TEXT NOT NULL,
       kind TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
       strength INTEGER NOT NULL DEFAULT 1,
       src_transcript_id TEXT NOT NULL, src_quote TEXT NOT NULL, src_quote_offset INTEGER,
       src_speaker TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
    await c.execute(`CREATE TABLE IF NOT EXISTS trait_events (
       id TEXT PRIMARY KEY, trait_id TEXT NOT NULL, sim_id TEXT NOT NULL, transcript_id TEXT NOT NULL,
       op TEXT NOT NULL, before_text TEXT, after_text TEXT, quote TEXT NOT NULL, quote_offset INTEGER,
       speaker TEXT, source_date INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL)`)
    // Seed one existing row in each table (no new columns) to verify existing rows survive.
    await c.execute({
      sql: `INSERT INTO sim_traits (id,sim_id,project_id,kind,text,status,strength,src_transcript_id,src_quote,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: ["trait_old1", "sim_1", "proj_1", "pain", "Slow export", "active", 1, "tr_1", "It is slow", 1000, 1000],
    })
    await c.execute({
      sql: `INSERT INTO trait_events (id,trait_id,sim_id,transcript_id,op,quote,source_date,created_at)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: ["tev_old1", "trait_old1", "sim_1", "tr_1", "create", "It is slow", 1000, 1000],
    })
    // Set migrated_v2 flag so migrateV2() returns immediately (simulating a prod DB).
    await c.execute({
      sql: "INSERT INTO schema_meta (key,value) VALUES (?,?)",
      args: ["migrated_v2", String(Date.now())],
    })

    // Verify columns are NOT present before applySchema runs.
    expect(await columnExistsT(c, "sim_traits", "area")).toBe(false)
    expect(await columnExistsT(c, "sim_traits", "issue_type")).toBe(false)
    expect(await columnExistsT(c, "sim_traits", "severity")).toBe(false)
    expect(await columnExistsT(c, "trait_events", "area")).toBe(false)
    expect(await columnExistsT(c, "trait_events", "issue_type")).toBe(false)
    expect(await columnExistsT(c, "trait_events", "severity")).toBe(false)

    // Run applySchema (same as what initDb does on every boot).
    await applySchema(c)

    // Assert the new columns exist on BOTH tables.
    expect(await columnExistsT(c, "sim_traits", "area")).toBe(true)
    expect(await columnExistsT(c, "sim_traits", "issue_type")).toBe(true)
    expect(await columnExistsT(c, "sim_traits", "severity")).toBe(true)
    expect(await columnExistsT(c, "trait_events", "area")).toBe(true)
    expect(await columnExistsT(c, "trait_events", "issue_type")).toBe(true)
    expect(await columnExistsT(c, "trait_events", "severity")).toBe(true)

    // Existing rows survive with null in the new columns.
    const trait = (await c.execute("SELECT * FROM sim_traits WHERE id='trait_old1'")).rows[0] as any
    expect(trait).toBeTruthy()
    expect(String(trait.text)).toBe("Slow export")
    expect(trait.area).toBeNull()
    expect(trait.issue_type).toBeNull()
    expect(trait.severity).toBeNull()

    const evt = (await c.execute("SELECT * FROM trait_events WHERE id='tev_old1'")).rows[0] as any
    expect(evt).toBeTruthy()
    expect(String(evt.op)).toBe("create")
    expect(evt.area).toBeNull()
    expect(evt.issue_type).toBeNull()
    expect(evt.severity).toBeNull()

    // Idempotent: second applySchema() call must not throw and columns still exist.
    await applySchema(c)
    expect(await columnExistsT(c, "sim_traits", "area")).toBe(true)
    expect(await columnExistsT(c, "sim_traits", "issue_type")).toBe(true)
    expect(await columnExistsT(c, "sim_traits", "severity")).toBe(true)
    expect(await columnExistsT(c, "trait_events", "area")).toBe(true)
    expect(await columnExistsT(c, "trait_events", "issue_type")).toBe(true)
    expect(await columnExistsT(c, "trait_events", "severity")).toBe(true)
    // Row count still intact after second run.
    expect(await n(c, "SELECT COUNT(*) AS n FROM sim_traits")).toBe(1)
    expect(await n(c, "SELECT COUNT(*) AS n FROM trait_events")).toBe(1)
  } finally {
    c.close()
    rmDb(file)
  }
})

test("grounded+dedup columns exist after initDb (additive, idempotent)", async () => {
  const file = join(tmpdir(), `klav-dedup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const c = createClient({ url: "file:" + file })
  try {
    // No v1 seed — empty DB, exactly like a brand-new deployment.
    await applySchema(c)
    await migrateV2(c)

    expect(await columnExistsT(c, "sim_traits", "src_verified")).toBe(true)
    expect(await columnExistsT(c, "trait_events", "verified")).toBe(true)
    expect(await columnExistsT(c, "feedback", "issue_key")).toBe(true)
    expect(await columnExistsT(c, "feedback", "recurrence_count")).toBe(true)
    expect(await columnExistsT(c, "feedback", "recurrence_dates_json")).toBe(true)
    expect(await columnExistsT(c, "feedback", "last_seen_at")).toBe(true)
  } finally {
    c.close()
    rmDb(file)
  }
})
