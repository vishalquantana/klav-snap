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

// ── integrations (tracker connections) ──
export type StoredIntegration = { integration: string; config: any; updatedAt: number }
export async function getIntegration(scope: 'workspace' | 'user', ownerId: string): Promise<StoredIntegration | null> {
  const r = await db!.execute({ sql: "SELECT integration, config_json, updated_at FROM integrations WHERE scope=? AND owner_id=?", args: [scope, ownerId] })
  if (!r.rows.length) return null
  const x = r.rows[0] as any
  return { integration: String(x.integration), config: JSON.parse(String(x.config_json)), updatedAt: Number(x.updated_at) }
}
export async function setIntegration(scope: 'workspace' | 'user', ownerId: string, integration: string, config: any) {
  await db!.execute({
    sql: "INSERT INTO integrations (scope,owner_id,integration,config_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(scope,owner_id) DO UPDATE SET integration=excluded.integration, config_json=excluded.config_json, updated_at=excluded.updated_at",
    args: [scope, ownerId, integration, JSON.stringify(config), Date.now()],
  })
}
export async function deleteIntegration(scope: 'workspace' | 'user', ownerId: string) {
  await db!.execute({ sql: "DELETE FROM integrations WHERE scope=? AND owner_id=?", args: [scope, ownerId] })
}

// ── personas (Sims) ──
export type PersonaRow = {
  id: string; workspaceId: string; name: string; role: string; type: string
  initials: string; accent: string; summary: string; insights: any[]; avatar: string | null
  createdAt: number; updatedAt: number
}
function rowToPersona(x: any): PersonaRow {
  return {
    id: String(x.id), workspaceId: String(x.workspace_id), name: String(x.name),
    role: String(x.role || ""), type: String(x.type || "client"),
    initials: String(x.initials || ""), accent: String(x.accent || "#6366f1"),
    summary: String(x.summary || ""), insights: x.insights_json ? JSON.parse(String(x.insights_json)) : [],
    avatar: x.avatar ? String(x.avatar) : null, createdAt: Number(x.created_at), updatedAt: Number(x.updated_at),
  }
}
export async function listPersonas(workspaceId: string): Promise<PersonaRow[]> {
  const r = await db!.execute({ sql: "SELECT * FROM personas WHERE workspace_id=? ORDER BY created_at ASC", args: [workspaceId] })
  return r.rows.map(rowToPersona)
}
export async function upsertPersona(id: string, workspaceId: string, data: Omit<PersonaRow, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>) {
  const now = Date.now()
  await db!.execute({
    sql: `INSERT INTO personas (id,workspace_id,name,role,type,initials,accent,summary,insights_json,avatar,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,type=excluded.type,
          initials=excluded.initials,accent=excluded.accent,summary=excluded.summary,
          insights_json=excluded.insights_json,avatar=excluded.avatar,updated_at=excluded.updated_at`,
    args: [id, workspaceId, data.name, data.role, data.type, data.initials, data.accent, data.summary,
           JSON.stringify(data.insights), data.avatar ?? null, now, now],
  })
}
export async function deletePersona(id: string, workspaceId: string) {
  await db!.execute({ sql: "DELETE FROM personas WHERE id=? AND workspace_id=?", args: [id, workspaceId] })
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
