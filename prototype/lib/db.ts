// Turso / libSQL access: users, email-OTP login, sessions, accounts, projects, memberships.
import { createClient, type Client } from "@libsql/client"

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
export const db: Client | null = url ? createClient({ url, authToken }) : null

export async function initDb() {
  if (!db) { console.warn("⚠  No TURSO_DATABASE_URL — login is disabled."); return }
  await applySchema(db)
  await migrateV2(db)
  console.log("✓ Turso connected, schema ready")
}

// applySchema + migrateV2 take an explicit client so they can run against a LOCAL libsql
// file (file:…) or :memory: DB in tests — no production Turso needed for migration verification.
export async function applySchema(c: Client) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS login_otps (email TEXT NOT NULL, code TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS memberships (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(workspace_id, email))`,
    `CREATE TABLE IF NOT EXISTS integrations (
       scope TEXT NOT NULL,            -- 'workspace' | 'user'
       owner_id TEXT NOT NULL,         -- workspace_id or email
       integration TEXT NOT NULL,      -- 'plane' | 'jira' | ...
       config_json TEXT NOT NULL,      -- non-secret fields + encrypted token
       updated_at INTEGER NOT NULL,
       PRIMARY KEY (scope, owner_id)
     )`,
    `CREATE TABLE IF NOT EXISTS personas (
       id TEXT PRIMARY KEY,             -- sim_<uuid>
       workspace_id TEXT NOT NULL,
       name TEXT NOT NULL,
       role TEXT,
       type TEXT NOT NULL DEFAULT 'client',
       initials TEXT,
       accent TEXT,
       summary TEXT,
       insights_json TEXT,
       avatar TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS persona_ws_idx ON personas (workspace_id, created_at)`,

    // ── Sims-dashboard P0 (additive): durable ledger for screenshots + feedback + activity feed ──
    // Rows carry a denormalized project_id string ('proj_'+workspaceId); no FK, projects table lands in P2.
    `CREATE TABLE IF NOT EXISTS screenshots (
       id TEXT PRIMARY KEY,
       project_id TEXT,
       s3_key TEXT NOT NULL,
       bucket TEXT NOT NULL,
       content_type TEXT NOT NULL,
       acl TEXT NOT NULL DEFAULT 'private',
       bytes INTEGER,
       owner_email TEXT,
       expires_at INTEGER,
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS feedback (
       id TEXT PRIMARY KEY,
       project_id TEXT NOT NULL,
       sim_id TEXT,
       actor_email TEXT,
       url_host TEXT,
       url_path TEXT,
       observation TEXT,
       sentiment TEXT,
       severity TEXT,
       screenshot_id TEXT,
       suggested_bug_json TEXT,
       cited_trait_ids_json TEXT,
       source_quote TEXT,
       source_transcript_id TEXT,
       source_date INTEGER,
       plane_issue_key TEXT,
       plane_issue_url TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS fb_proj_idx ON feedback (project_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS fb_sim_idx ON feedback (sim_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS activity_events (
       id TEXT PRIMARY KEY,
       project_id TEXT NOT NULL,
       type TEXT NOT NULL,
       actor_email TEXT,
       sim_id TEXT,
       url_host TEXT,
       url_path TEXT,
       feedback_id TEXT,
       screenshot_id TEXT,
       meta_json TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS evt_proj_idx ON activity_events (project_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS evt_actor_idx ON activity_events (project_id, actor_email, created_at)`,

    // ── Sims-dashboard P2 (additive): company → projects → Sims model. ──
    // schema_meta gates the one-time, idempotent v2 migration (see migrateV2).
    `CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`,
    // COMPANY (was workspaces; accounts.id REUSES old workspace id — no re-login, no integrations rewrite).
    `CREATE TABLE IF NOT EXISTS accounts (
       id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS account_members (
       id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL,
       account_role TEXT NOT NULL,           -- 'owner' | 'admin' | 'member'
       created_at INTEGER NOT NULL, UNIQUE(account_id, email))`,
    `CREATE INDEX IF NOT EXISTS acct_mem_email_idx ON account_members (email)`,
    // PROJECTS — first project id is DETERMINISTIC: 'proj_'||account_id (no event backfill).
    `CREATE TABLE IF NOT EXISTS projects (
       id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'active',
       url_patterns_json TEXT,
       review_mode TEXT NOT NULL DEFAULT 'auto',
       review_budget_daily INTEGER DEFAULT 200,
       observability_mode TEXT NOT NULL DEFAULT 'named',
       created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS project_acct_idx ON projects (account_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS project_members (
       id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL,
       project_role TEXT NOT NULL,           -- 'admin' | 'member'
       invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`,
    `CREATE INDEX IF NOT EXISTS proj_mem_email_idx ON project_members (email)`,
  ]
  for (const s of stmts) await c.execute(s)
}

// ── schema_meta helpers ──
async function metaGet(c: Client, key: string): Promise<string | null> {
  const r = await c.execute({ sql: "SELECT value FROM schema_meta WHERE key=?", args: [key] })
  return r.rows.length ? String((r.rows[0] as any).value) : null
}
async function metaSet(c: Client, key: string, value: string) {
  await c.execute({ sql: "INSERT INTO schema_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [key, value] })
}

// ── §2.4 migration: single-workspace → accounts/projects. ──
// SAFE: additive only, never drops in this release. IDEMPOTENT: guarded by the migrated_v2 flag,
// and every write is INSERT OR IGNORE / existence-checked so a partial run (flag unset) re-runs
// cleanly with no duplicates. Old personas_v1 / workspaces / memberships are preserved untouched.
export async function migrateV2(c: Client) {
  if (await metaGet(c, "migrated_v2")) return // already migrated — fast no-op on every boot

  // 1. Rename old project-less personas → personas_v1 (only if not already done), then create the
  //    new project-scoped personas table. This is the only structural change and is idempotent.
  const hasV1 = await tableExists(c, "personas_v1")
  const hasPersonas = await tableExists(c, "personas")
  if (!hasV1 && hasPersonas && (await columnExists(c, "personas", "workspace_id"))) {
    await c.execute("ALTER TABLE personas RENAME TO personas_v1")
  }
  await c.execute(`CREATE TABLE IF NOT EXISTS personas (
       id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_transcript_id TEXT,
       name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client',
       initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT,
       created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
  await c.execute("CREATE INDEX IF NOT EXISTS persona_proj_idx ON personas (project_id, created_at)")

  // 2. workspaces → accounts + default project. owner_email = first admin (membership created_at ASC).
  const wsRows = (await c.execute("SELECT id, name, created_at FROM workspaces")).rows as any[]
  for (const w of wsRows) {
    const wid = String(w.id)
    const firstAdmin = (await c.execute({
      sql: "SELECT email FROM memberships WHERE workspace_id=? AND role='admin' ORDER BY created_at ASC LIMIT 1",
      args: [wid],
    })).rows[0] as any
    const ownerEmail = firstAdmin ? String(firstAdmin.email) : ""
    await c.execute({
      sql: "INSERT OR IGNORE INTO accounts (id,name,owner_email,created_at) VALUES (?,?,?,?)",
      args: [wid, String(w.name), ownerEmail, Number(w.created_at)],
    })
    await c.execute({
      sql: `INSERT OR IGNORE INTO projects (id,account_id,name,status,review_mode,review_budget_daily,observability_mode,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: ["proj_" + wid, wid, "Default Project", "active", "auto", 200, "named", Number(w.created_at), Number(w.created_at)],
    })
  }

  // 3. memberships → account_members (first admin→owner, other admins→admin, user→member)
  //    + project_members (admin→admin, else member).
  for (const w of wsRows) {
    const wid = String(w.id)
    const mems = (await c.execute({
      sql: "SELECT email, role, created_at FROM memberships WHERE workspace_id=? ORDER BY created_at ASC",
      args: [wid],
    })).rows as any[]
    let firstAdminSeen = false
    for (const m of mems) {
      const email = String(m.email), role = String(m.role), createdAt = Number(m.created_at)
      let acctRole: string
      if (role === "admin") {
        if (!firstAdminSeen) { acctRole = "owner"; firstAdminSeen = true } else acctRole = "admin"
      } else acctRole = "member"
      await c.execute({
        sql: "INSERT OR IGNORE INTO account_members (id,account_id,email,account_role,created_at) VALUES (?,?,?,?,?)",
        args: ["am_" + wid + "_" + email, wid, email, acctRole, createdAt],
      })
      await c.execute({
        sql: "INSERT OR IGNORE INTO project_members (id,project_id,email,project_role,invited_by,created_at) VALUES (?,?,?,?,?,?)",
        args: ["pm_" + wid + "_" + email, "proj_" + wid, email, role === "admin" ? "admin" : "member", null, createdAt],
      })
    }
  }

  // 4. personas_v1 → project-scoped personas (keep insights_json as-is; P3 normalizes to sim_traits).
  if (await tableExists(c, "personas_v1")) {
    const ps = (await c.execute("SELECT * FROM personas_v1")).rows as any[]
    for (const p of ps) {
      const wid = String(p.workspace_id)
      await c.execute({
        sql: `INSERT OR IGNORE INTO personas
              (id,project_id,source_transcript_id,name,role,type,initials,accent,summary,insights_json,avatar,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [String(p.id), "proj_" + wid, null, String(p.name), p.role ?? null,
               String(p.type || "client"), p.initials ?? null, p.accent ?? null, p.summary ?? null,
               p.insights_json ?? null, p.avatar ?? null, Number(p.created_at), Number(p.updated_at)],
      })
    }
  }

  // 5. re-scope workspace integrations → project (owner_id reuses id: 'proj_'||workspace_id).
  //    Guarded WHERE scope='workspace' makes the UPDATE a no-op on re-run.
  await c.execute("UPDATE integrations SET scope='project', owner_id='proj_'||owner_id WHERE scope='workspace'")

  // 6. flag LAST — only after every step above succeeded.
  await metaSet(c, "migrated_v2", String(Date.now()))
}

async function tableExists(c: Client, name: string): Promise<boolean> {
  const r = await c.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?", args: [name] })
  return r.rows.length > 0
}
async function columnExists(c: Client, table: string, col: string): Promise<boolean> {
  try {
    const r = await c.execute(`PRAGMA table_info(${table})`)
    return r.rows.some((x: any) => String(x.name) === col)
  } catch { return false }
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

// ── accounts / projects / two-tier roles (P2) ──
// Back-compat: `workspaceId` in Membership is the ACCOUNT id (== old workspace id), `role` is the
// effective account-level role mapped to the legacy admin|user vocabulary so old callers keep working.
export type Membership = { workspaceId: string; role: string; name: string }
export type ProjectRow = {
  id: string; accountId: string; name: string; status: string
  reviewMode: string; reviewBudgetDaily: number | null; observabilityMode: string
  createdAt: number; updatedAt: number
}
function rowToProject(x: any): ProjectRow {
  return {
    id: String(x.id), accountId: String(x.account_id), name: String(x.name),
    status: String(x.status || "active"), reviewMode: String(x.review_mode || "auto"),
    reviewBudgetDaily: x.review_budget_daily != null ? Number(x.review_budget_daily) : null,
    observabilityMode: String(x.observability_mode || "named"),
    createdAt: Number(x.created_at), updatedAt: Number(x.updated_at),
  }
}

// SHIM over the new model so legacy callsites (membershipsFor(me)[0]) keep working.
// Returns one row per ACCOUNT the user belongs to, role mapped owner|admin→'admin', member→'user'.
export async function membershipsFor(email: string): Promise<Membership[]> {
  const r = await db!.execute({
    sql: `SELECT am.account_id, am.account_role, a.name, am.created_at
          FROM account_members am JOIN accounts a ON a.id=am.account_id
          WHERE am.email=? ORDER BY am.created_at ASC`,
    args: [email],
  })
  return r.rows.map((x: any) => ({
    workspaceId: String(x.account_id),
    role: String(x.account_role) === "member" ? "user" : "admin",
    name: String(x.name),
  }))
}

// "Has any account_members/project_members row" — used for the OTP allowlist bypass.
export async function hasAnyMembership(email: string): Promise<boolean> {
  const r = await db!.execute({
    sql: `SELECT 1 FROM account_members WHERE email=? UNION SELECT 1 FROM project_members WHERE email=? LIMIT 1`,
    args: [email, email],
  })
  return r.rows.length > 0
}

// On first login: ensure account + owner account_member + default project + project-admin member. Idempotent.
export async function ensureAccount(email: string): Promise<Membership[]> {
  const existing = await membershipsFor(email)
  if (existing.length) return existing
  const aid = crypto.randomUUID()
  const local = email.split("@")[0]
  const now = Date.now()
  await db!.execute({ sql: "INSERT OR IGNORE INTO accounts (id,name,owner_email,created_at) VALUES (?,?,?,?)", args: [aid, `${local}'s Workspace`, email, now] })
  await db!.execute({ sql: "INSERT OR IGNORE INTO account_members (id,account_id,email,account_role,created_at) VALUES (?,?,?,?,?)", args: ["am_" + aid + "_" + email, aid, email, "owner", now] })
  await db!.execute({
    sql: `INSERT OR IGNORE INTO projects (id,account_id,name,status,review_mode,review_budget_daily,observability_mode,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: ["proj_" + aid, aid, "Default Project", "active", "auto", 200, "named", now, now],
  })
  await db!.execute({ sql: "INSERT OR IGNORE INTO project_members (id,project_id,email,project_role,invited_by,created_at) VALUES (?,?,?,?,?,?)", args: ["pm_" + aid + "_" + email, "proj_" + aid, email, "admin", null, now] })
  return membershipsFor(email)
}

export async function accountRole(accountId: string, email: string): Promise<string | null> {
  const r = await db!.execute({ sql: "SELECT account_role FROM account_members WHERE account_id=? AND email=?", args: [accountId, email] })
  return r.rows.length ? String((r.rows[0] as any).account_role) : null
}

export async function projectById(projectId: string): Promise<ProjectRow | null> {
  const r = await db!.execute({ sql: "SELECT * FROM projects WHERE id=?", args: [projectId] })
  return r.rows.length ? rowToProject(r.rows[0]) : null
}

// Projects the caller can see: every project in an account they belong to (owner/admin see all),
// plus any project with an explicit project_members row (plain members).
export async function listProjects(email: string): Promise<ProjectRow[]> {
  const r = await db!.execute({
    sql: `SELECT DISTINCT p.* FROM projects p
          WHERE p.account_id IN (SELECT account_id FROM account_members WHERE email=?)
             OR p.id IN (SELECT project_id FROM project_members WHERE email=?)
          ORDER BY p.created_at ASC`,
    args: [email, email],
  })
  return r.rows.map(rowToProject)
}

export async function createProject(accountId: string, name: string): Promise<ProjectRow> {
  const id = "proj_" + crypto.randomUUID()
  const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO projects (id,account_id,name,status,review_mode,review_budget_daily,observability_mode,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [id, accountId, name, "active", "auto", 200, "named", now, now],
  })
  const p = await projectById(id)
  return p!
}

// §2.3 effective role: max(account_role, project_role); account owner/admin ⇒ implicit project-admin.
export async function projectAccess(email: string, projectId: string): Promise<'admin' | 'member' | null> {
  const proj = await projectById(projectId)
  if (!proj) return null
  const acctRole = await accountRole(proj.accountId, email)
  if (acctRole === "owner" || acctRole === "admin") return "admin"
  const r = await db!.execute({ sql: "SELECT project_role FROM project_members WHERE project_id=? AND email=?", args: [projectId, email] })
  if (r.rows.length) return String((r.rows[0] as any).project_role) === "admin" ? "admin" : "member"
  if (acctRole === "member") return null // account member with no explicit project row sees nothing
  return null
}

// Project roster (project_members). Returns email/role/createdAt for the dashboard team panel.
export async function membersOfProject(projectId: string) {
  const r = await db!.execute({ sql: "SELECT email, project_role, created_at FROM project_members WHERE project_id=? ORDER BY created_at ASC", args: [projectId] })
  return r.rows.map((x: any) => ({ email: String(x.email), role: String(x.project_role), createdAt: Number(x.created_at) }))
}

// Invite/add a member to a project. Also ensures an account_members(member) row for account visibility.
export async function addProjectMember(projectId: string, accountId: string, email: string, projectRole: string, invitedBy?: string | null) {
  await upsertUser(email)
  const now = Date.now()
  await db!.execute({ sql: "INSERT OR IGNORE INTO account_members (id,account_id,email,account_role,created_at) VALUES (?,?,?,?,?)", args: ["am_" + accountId + "_" + email, accountId, email, "member", now] })
  await db!.execute({ sql: "INSERT INTO project_members (id,project_id,email,project_role,invited_by,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(project_id,email) DO NOTHING", args: ["pm_" + projectId + "_" + email, projectId, email, projectRole === "admin" ? "admin" : "member", invitedBy ?? null, now] })
}

// ── legacy shims (kept so any un-migrated callsite still compiles/behaves) ──
export async function ensureWorkspace(email: string): Promise<Membership[]> { return ensureAccount(email) }
// Account roster mapped to legacy admin|user vocabulary (owner/admin → 'admin', member → 'user').
export async function membersOf(accountId: string) {
  const r = await db!.execute({ sql: "SELECT email, account_role, created_at FROM account_members WHERE account_id=? ORDER BY created_at ASC", args: [accountId] })
  return r.rows.map((x: any) => ({ email: String(x.email), role: String(x.account_role) === "member" ? "user" : "admin", createdAt: Number(x.created_at) }))
}
export async function roleIn(accountId: string, email: string): Promise<string | null> {
  const role = await accountRole(accountId, email)
  if (role == null) return null
  return role === "member" ? "user" : "admin"
}

// ── integrations (tracker connections) ──
export type IntegrationScope = 'account' | 'project' | 'user' | 'workspace'
export type StoredIntegration = { integration: string; config: any; updatedAt: number }
export async function getIntegration(scope: IntegrationScope, ownerId: string): Promise<StoredIntegration | null> {
  const r = await db!.execute({ sql: "SELECT integration, config_json, updated_at FROM integrations WHERE scope=? AND owner_id=?", args: [scope, ownerId] })
  if (!r.rows.length) return null
  const x = r.rows[0] as any
  return { integration: String(x.integration), config: JSON.parse(String(x.config_json)), updatedAt: Number(x.updated_at) }
}
export async function setIntegration(scope: IntegrationScope, ownerId: string, integration: string, config: any) {
  await db!.execute({
    sql: "INSERT INTO integrations (scope,owner_id,integration,config_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(scope,owner_id) DO UPDATE SET integration=excluded.integration, config_json=excluded.config_json, updated_at=excluded.updated_at",
    args: [scope, ownerId, integration, JSON.stringify(config), Date.now()],
  })
}
export async function deleteIntegration(scope: IntegrationScope, ownerId: string) {
  await db!.execute({ sql: "DELETE FROM integrations WHERE scope=? AND owner_id=?", args: [scope, ownerId] })
}

// ── personas (Sims) — project-scoped as of P2 (insights_json kept; P3 normalizes to sim_traits) ──
export type PersonaRow = {
  id: string; projectId: string; name: string; role: string; type: string
  initials: string; accent: string; summary: string; insights: any[]; avatar: string | null
  createdAt: number; updatedAt: number
}
function rowToPersona(x: any): PersonaRow {
  return {
    id: String(x.id), projectId: String(x.project_id), name: String(x.name),
    role: String(x.role || ""), type: String(x.type || "client"),
    initials: String(x.initials || ""), accent: String(x.accent || "#6366f1"),
    summary: String(x.summary || ""), insights: x.insights_json ? JSON.parse(String(x.insights_json)) : [],
    avatar: x.avatar ? String(x.avatar) : null, createdAt: Number(x.created_at), updatedAt: Number(x.updated_at),
  }
}
export async function listPersonas(projectId: string): Promise<PersonaRow[]> {
  const r = await db!.execute({ sql: "SELECT * FROM personas WHERE project_id=? ORDER BY created_at ASC", args: [projectId] })
  return r.rows.map(rowToPersona)
}
export async function upsertPersona(id: string, projectId: string, data: Omit<PersonaRow, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) {
  const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO personas (id,project_id,name,role,type,initials,accent,summary,insights_json,avatar,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,type=excluded.type,
          initials=excluded.initials,accent=excluded.accent,summary=excluded.summary,
          insights_json=excluded.insights_json,avatar=excluded.avatar,updated_at=excluded.updated_at`,
    args: [id, projectId, data.name, data.role, data.type, data.initials, data.accent, data.summary,
           JSON.stringify(data.insights), data.avatar ?? null, now, now],
  })
}
export async function deletePersona(id: string, projectId: string) {
  await db!.execute({ sql: "DELETE FROM personas WHERE id=? AND project_id=?", args: [id, projectId] })
}

// ── screenshots / feedback / activity (Sims-dashboard ledger, P0) ──
// project_id is the denormalized 'proj_'+workspaceId string (no FK; projects table lands in P2).
export type ScreenshotInsert = {
  projectId?: string | null; s3Key: string; bucket: string; contentType: string
  acl?: string; bytes?: number | null; ownerEmail?: string | null; expiresAt?: number | null
}
export async function insertScreenshot(s: ScreenshotInsert): Promise<string> {
  const id = "shot_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO screenshots (id,project_id,s3_key,bucket,content_type,acl,bytes,owner_email,expires_at,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [id, s.projectId ?? null, s.s3Key, s.bucket, s.contentType, s.acl ?? "private",
           s.bytes ?? null, s.ownerEmail ?? null, s.expiresAt ?? null, Date.now()],
  })
  return id
}

export type FeedbackInsert = {
  projectId: string; simId?: string | null; actorEmail?: string | null
  urlHost?: string | null; urlPath?: string | null
  observation?: string | null; sentiment?: string | null; severity?: string | null
  screenshotId?: string | null; suggestedBug?: any; citedTraitIds?: any
  sourceQuote?: string | null; sourceTranscriptId?: string | null; sourceDate?: number | null
  planeIssueKey?: string | null; planeIssueUrl?: string | null
}
export async function insertFeedback(f: FeedbackInsert): Promise<string> {
  const id = "fb_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO feedback (id,project_id,sim_id,actor_email,url_host,url_path,observation,sentiment,severity,
          screenshot_id,suggested_bug_json,cited_trait_ids_json,source_quote,source_transcript_id,source_date,
          plane_issue_key,plane_issue_url,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, f.projectId, f.simId ?? null, f.actorEmail ?? null, f.urlHost ?? null, f.urlPath ?? null,
           f.observation ?? null, f.sentiment ?? null, f.severity ?? null, f.screenshotId ?? null,
           f.suggestedBug != null ? JSON.stringify(f.suggestedBug) : null,
           f.citedTraitIds != null ? JSON.stringify(f.citedTraitIds) : null,
           f.sourceQuote ?? null, f.sourceTranscriptId ?? null, f.sourceDate ?? null,
           f.planeIssueKey ?? null, f.planeIssueUrl ?? null, Date.now()],
  })
  return id
}

// Record the downstream tracker issue on a feedback row after it is filed (tracker is optional/best-effort).
export async function updateFeedbackTracker(id: string, planeIssueKey: string | null, planeIssueUrl: string | null) {
  await db!.execute({
    sql: "UPDATE feedback SET plane_issue_key=?, plane_issue_url=? WHERE id=?",
    args: [planeIssueKey, planeIssueUrl, id],
  })
}

export type ActivityInsert = {
  projectId: string; type: string; actorEmail?: string | null; simId?: string | null
  urlHost?: string | null; urlPath?: string | null
  feedbackId?: string | null; screenshotId?: string | null; meta?: any
}
export async function insertActivity(a: ActivityInsert): Promise<string> {
  const id = "evt_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO activity_events (id,project_id,type,actor_email,sim_id,url_host,url_path,feedback_id,screenshot_id,meta_json,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, a.projectId, a.type, a.actorEmail ?? null, a.simId ?? null, a.urlHost ?? null, a.urlPath ?? null,
           a.feedbackId ?? null, a.screenshotId ?? null, a.meta != null ? JSON.stringify(a.meta) : null, Date.now()],
  })
  return id
}

// ── dashboard reads (P1) — indexed, project-scoped, newest-first. Reads only. ──
export type ActivityRow = {
  id: string; projectId: string; type: string; actorEmail: string | null; simId: string | null
  urlHost: string | null; urlPath: string | null; feedbackId: string | null
  screenshotId: string | null; meta: any; createdAt: number
}
function rowToActivity(x: any): ActivityRow {
  return {
    id: String(x.id), projectId: String(x.project_id), type: String(x.type),
    actorEmail: x.actor_email != null ? String(x.actor_email) : null,
    simId: x.sim_id != null ? String(x.sim_id) : null,
    urlHost: x.url_host != null ? String(x.url_host) : null,
    urlPath: x.url_path != null ? String(x.url_path) : null,
    feedbackId: x.feedback_id != null ? String(x.feedback_id) : null,
    screenshotId: x.screenshot_id != null ? String(x.screenshot_id) : null,
    meta: x.meta_json ? JSON.parse(String(x.meta_json)) : null,
    createdAt: Number(x.created_at),
  }
}
// Recent activity for a project, newest-first. Non-admins pass actorEmail to see only their own rows
// (uses evt_actor_idx); admins omit it to see all (uses evt_proj_idx).
export async function listActivity(projectId: string, opts: { actorEmail?: string | null; limit?: number } = {}): Promise<ActivityRow[]> {
  const limit = opts.limit ?? 20
  const r = opts.actorEmail
    ? await db!.execute({ sql: "SELECT * FROM activity_events WHERE project_id=? AND actor_email=? ORDER BY created_at DESC LIMIT ?", args: [projectId, opts.actorEmail, limit] })
    : await db!.execute({ sql: "SELECT * FROM activity_events WHERE project_id=? ORDER BY created_at DESC LIMIT ?", args: [projectId, limit] })
  return r.rows.map(rowToActivity)
}

export type FeedbackRow = {
  id: string; projectId: string; simId: string | null; actorEmail: string | null
  urlHost: string | null; urlPath: string | null; observation: string | null
  sentiment: string | null; severity: string | null; screenshotId: string | null
  planeIssueKey: string | null; planeIssueUrl: string | null; createdAt: number
}
function rowToFeedback(x: any): FeedbackRow {
  return {
    id: String(x.id), projectId: String(x.project_id),
    simId: x.sim_id != null ? String(x.sim_id) : null,
    actorEmail: x.actor_email != null ? String(x.actor_email) : null,
    urlHost: x.url_host != null ? String(x.url_host) : null,
    urlPath: x.url_path != null ? String(x.url_path) : null,
    observation: x.observation != null ? String(x.observation) : null,
    sentiment: x.sentiment != null ? String(x.sentiment) : null,
    severity: x.severity != null ? String(x.severity) : null,
    screenshotId: x.screenshot_id != null ? String(x.screenshot_id) : null,
    planeIssueKey: x.plane_issue_key != null ? String(x.plane_issue_key) : null,
    planeIssueUrl: x.plane_issue_url != null ? String(x.plane_issue_url) : null,
    createdAt: Number(x.created_at),
  }
}
// Recent feedback for a project, newest-first (uses fb_proj_idx). withTicketOnly → only rows that
// reached the tracker (plane_issue_key set) — i.e. filed tickets.
export async function listFeedback(projectId: string, opts: { withTicketOnly?: boolean; limit?: number } = {}): Promise<FeedbackRow[]> {
  const limit = opts.limit ?? 20
  const r = opts.withTicketOnly
    ? await db!.execute({ sql: "SELECT * FROM feedback WHERE project_id=? AND plane_issue_key IS NOT NULL ORDER BY created_at DESC LIMIT ?", args: [projectId, limit] })
    : await db!.execute({ sql: "SELECT * FROM feedback WHERE project_id=? ORDER BY created_at DESC LIMIT ?", args: [projectId, limit] })
  return r.rows.map(rowToFeedback)
}

// Cheap headline counts for the dashboard (indexed scans).
export async function dashboardCounts(projectId: string): Promise<{ feedback: number; tickets: number; activity: number }> {
  const [fb, tk, ev] = await Promise.all([
    db!.execute({ sql: "SELECT COUNT(*) AS n FROM feedback WHERE project_id=?", args: [projectId] }),
    db!.execute({ sql: "SELECT COUNT(*) AS n FROM feedback WHERE project_id=? AND plane_issue_key IS NOT NULL", args: [projectId] }),
    db!.execute({ sql: "SELECT COUNT(*) AS n FROM activity_events WHERE project_id=?", args: [projectId] }),
  ])
  return {
    feedback: Number((fb.rows[0] as any).n),
    tickets: Number((tk.rows[0] as any).n),
    activity: Number((ev.rows[0] as any).n),
  }
}
