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
