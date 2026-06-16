// Turso / libSQL access: users, email-OTP login, sessions, workspaces, memberships.
import { createClient, type Client } from "@libsql/client"

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
export const db: Client | null = url ? createClient({ url, authToken }) : null

export async function initDb() {
  if (!db) { console.warn("⚠  No TURSO_DATABASE_URL — login is disabled."); return }
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS login_otps (email TEXT NOT NULL, code TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS memberships (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(workspace_id, email))`,
  ]
  for (const s of stmts) await db.execute(s)
  console.log("✓ Turso connected, schema ready")
}

// ── OTP ──
export async function createOtp(email: string, code: string, expiresAt: number) {
  await db!.execute({ sql: "INSERT INTO login_otps (email,code,expires_at,used) VALUES (?,?,?,0)", args: [email, code, expiresAt] })
}
export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const r = await db!.execute({ sql: "SELECT rowid FROM login_otps WHERE email=? AND code=? AND used=0 AND expires_at>? ORDER BY expires_at DESC LIMIT 1", args: [email, code, Date.now()] })
  if (!r.rows.length) return false
  await db!.execute({ sql: "UPDATE login_otps SET used=1 WHERE rowid=?", args: [(r.rows[0] as any).rowid] })
  return true
}

// ── users / sessions ──
export async function upsertUser(email: string) {
  await db!.execute({ sql: "INSERT INTO users (email,created_at) VALUES (?,?) ON CONFLICT(email) DO NOTHING", args: [email, Date.now()] })
}
export async function createSession(id: string, email: string, expiresAt: number) {
  await db!.execute({ sql: "INSERT INTO sessions (id,email,created_at,expires_at) VALUES (?,?,?,?)", args: [id, email, Date.now(), expiresAt] })
}
export async function getSession(id: string): Promise<string | null> {
  const r = await db!.execute({ sql: "SELECT email,expires_at FROM sessions WHERE id=?", args: [id] })
  if (!r.rows.length) return null
  const row = r.rows[0] as any
  if (Number(row.expires_at) < Date.now()) return null
  return String(row.email)
}
export async function deleteSession(id: string) {
  await db!.execute({ sql: "DELETE FROM sessions WHERE id=?", args: [id] })
}

// ── workspaces / memberships ──
export type Membership = { workspaceId: string; role: string; name: string }
export async function membershipsFor(email: string): Promise<Membership[]> {
  const r = await db!.execute({ sql: "SELECT m.workspace_id, m.role, w.name FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.email=? ORDER BY m.created_at ASC", args: [email] })
  return r.rows.map((x: any) => ({ workspaceId: String(x.workspace_id), role: String(x.role), name: String(x.name) }))
}
// On first login, give the user their own workspace as admin.
export async function ensureWorkspace(email: string): Promise<Membership[]> {
  const existing = await membershipsFor(email)
  if (existing.length) return existing
  const wid = crypto.randomUUID()
  const local = email.split("@")[0]
  await db!.execute({ sql: "INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)", args: [wid, `${local}'s Workspace`, Date.now()] })
  await db!.execute({ sql: "INSERT INTO memberships (id,workspace_id,email,role,created_at) VALUES (?,?,?,?,?)", args: [crypto.randomUUID(), wid, email, "admin", Date.now()] })
  return membershipsFor(email)
}
export async function membersOf(workspaceId: string) {
  const r = await db!.execute({ sql: "SELECT email, role, created_at FROM memberships WHERE workspace_id=? ORDER BY created_at ASC", args: [workspaceId] })
  return r.rows.map((x: any) => ({ email: String(x.email), role: String(x.role), createdAt: Number(x.created_at) }))
}
export async function roleIn(workspaceId: string, email: string): Promise<string | null> {
  const r = await db!.execute({ sql: "SELECT role FROM memberships WHERE workspace_id=? AND email=?", args: [workspaceId, email] })
  return r.rows.length ? String((r.rows[0] as any).role) : null
}
export async function addMember(workspaceId: string, email: string, role: string) {
  await upsertUser(email)
  await db!.execute({ sql: "INSERT INTO memberships (id,workspace_id,email,role,created_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id,email) DO NOTHING", args: [crypto.randomUUID(), workspaceId, email, role, Date.now()] })
}
