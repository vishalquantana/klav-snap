// Turso / libSQL access: users, email-OTP login, sessions, accounts, projects, memberships.
import { createClient, type Client } from "@libsql/client"
import { insightsFromTraits, type Trait, type TraitKind, type TraitStatus, type TraitEventRow } from "./provenance"

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
export let db: Client | null = url ? createClient({ url, authToken }) : null

// Test-only: re-point the shared client at a specific DB file. All test files run in ONE
// Bun process with a shared module registry, so `db` is created exactly once at first import
// (capturing whichever file imported it first). Without this, every DB-backed test file would
// collide on that single DB. Each test file calls reconnectDb(its own file:) in a beforeAll so
// its tests run against an isolated database. Never called in production.
export function reconnectDb(dbUrl: string, token?: string): Client {
  db = createClient({ url: dbUrl, authToken: token })
  return db
}

export async function initDb() {
  if (!db) { console.warn("⚠  No TURSO_DATABASE_URL — login is disabled."); return }
  await applySchema(db)
  await migrateV2(db)
  // additive (idempotent): accounts.domain — added after the P2 migration, so existing prod
  // accounts need it ALTERed in; fresh DBs already have it from the accounts CREATE above.
  if (!(await columnExists(db, "accounts", "domain"))) {
    await db.execute("ALTER TABLE accounts ADD COLUMN domain TEXT").catch((e) => console.warn("accounts.domain ALTER skipped:", e?.message || e))
  }
  await migrateConnectorsPlane(db)
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
    // CANONICAL personas shape (§2.2, project-scoped). This is the single source of truth.
    // On a FRESH install this creates the project-scoped table directly (no workspace_id), so
    // migrateV2's rename guard (columnExists personas.workspace_id) is FALSE → no junk personas_v1.
    // On an EXISTING prod DB the live workspace_id-shaped `personas` already exists, so this
    // CREATE … IF NOT EXISTS no-ops and migrateV2 renames it to personas_v1, then re-creates this shape.
    `CREATE TABLE IF NOT EXISTS personas (
       id TEXT PRIMARY KEY,             -- sim_<uuid>
       project_id TEXT NOT NULL,
       source_transcript_id TEXT,
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
    // NOTE: persona_proj_idx is created in migrateV2 (after any v1→personas_v1 rename), not here:
    // on an EXISTING prod DB this CREATE TABLE no-ops over the live workspace_id-shaped `personas`,
    // so a project_id index here would fail until migrateV2 swaps in the canonical table.

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
       id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT NOT NULL, domain TEXT, created_at INTEGER NOT NULL)`,
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

    // ── Sims-dashboard P3a (additive): provenance — transcripts + normalized sim_traits + append-only audit. ──
    // No live/consent/extension surface here (that is P3b). project_id is the canonical 'proj_'+account id.
    // TRANSCRIPTS — now persisted; source_date drives "(Sarah, 2026-06-12)" citations.
    `CREATE TABLE IF NOT EXISTS transcripts (
       id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, raw_text TEXT NOT NULL,
       source_date INTEGER NOT NULL, speakers_json TEXT, added_by TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS transcript_proj_idx ON transcripts (project_id, source_date)`,
    // SIM TRAITS — normalized insight w/ provenance (trait_id is the STABLE citation key).
    `CREATE TABLE IF NOT EXISTS sim_traits (
       id TEXT PRIMARY KEY, sim_id TEXT NOT NULL, project_id TEXT NOT NULL,
       kind TEXT NOT NULL,                    -- 'pain'|'want'|'love'
       text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', -- active|superseded|contradicted
       strength INTEGER NOT NULL DEFAULT 1,
       src_transcript_id TEXT NOT NULL, src_quote TEXT NOT NULL, src_quote_offset INTEGER,
       src_speaker TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS trait_sim_idx ON sim_traits (sim_id, status)`,
    // TRAIT EVENTS — append-only audit: which transcript changed which trait.
    `CREATE TABLE IF NOT EXISTS trait_events (
       id TEXT PRIMARY KEY, trait_id TEXT NOT NULL, sim_id TEXT NOT NULL, transcript_id TEXT NOT NULL,
       op TEXT NOT NULL,                      -- create|reinforce|refine|contradict|supersede
       before_text TEXT, after_text TEXT, quote TEXT NOT NULL, quote_offset INTEGER,
       speaker TEXT, source_date INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS trait_evt_idx ON trait_events (trait_id, created_at)`,
    // RECONCILE RUNS — cost-guard cache: skip re-running reconcile for a (sim,transcript) pair (§5).
    `CREATE TABLE IF NOT EXISTS reconcile_runs (
       sim_id TEXT NOT NULL, transcript_id TEXT NOT NULL, created_at INTEGER NOT NULL,
       PRIMARY KEY (sim_id, transcript_id))`,

    // ── Sims-dashboard P3b (additive): live URL activation surface (§2.2). ──
    // MONITORED URLS — allowlist of url patterns (prefix/glob only, NO regex) where Sims may auto-comment.
    `CREATE TABLE IF NOT EXISTS monitored_urls (
       id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL,
       enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
       UNIQUE(project_id, url_pattern))`,
    `CREATE INDEX IF NOT EXISTS mon_url_proj_idx ON monitored_urls (project_id)`,
    // MONITORING CONSENT — per-member-per-project consent before first capture (privacy, binding §5).
    `CREATE TABLE IF NOT EXISTS monitoring_consent (
       id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL,
       status TEXT NOT NULL,                  -- 'granted' | 'paused' | 'revoked'
       granted_at INTEGER, updated_at INTEGER NOT NULL, UNIQUE(project_id, email))`,
    // REVIEW COUNTS — per-project-per-day atomic budget counter (the cost-cap spine, §5).
    `CREATE TABLE IF NOT EXISTS review_counts (
       project_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (project_id, day))`,
    // EXTENSION TOKENS — dedicated narrow-scope Bearer (R5 security pre-req): bound to email (+optional
    // project), replaces reusing the raw 7-day session id. resolveBearer accepts these alongside sessions.
    `CREATE TABLE IF NOT EXISTS extension_tokens (
       token TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT,
       created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS ext_tok_email_idx ON extension_tokens (email)`,
    // AI-CALL LEDGER — one row per OpenRouter call for the /opsadmin credit dashboard. Additive,
    // idempotent. cost_usd comes from OpenRouter's usage.cost (real credit $); null if absent.
    `CREATE TABLE IF NOT EXISTS ai_calls (
       id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, type TEXT NOT NULL, model TEXT NOT NULL,
       actor_email TEXT, project_id TEXT, input_tokens INTEGER, output_tokens INTEGER,
       cost_usd REAL, ok INTEGER NOT NULL DEFAULT 1)`,
    `CREATE INDEX IF NOT EXISTS ai_calls_created_idx ON ai_calls (created_at)`,
    `CREATE INDEX IF NOT EXISTS ai_calls_proj_idx ON ai_calls (project_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS ai_calls_type_idx ON ai_calls (type, created_at)`,

    // ── Cloud tickets + connectors (Task 1, additive). ──
    // CONNECTORS — per-project external destinations (webhook/plane/github/jira/linear).
    // config stores secret fields encrypted (callers encrypt before create/update).
    `CREATE TABLE IF NOT EXISTS connectors (
       id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL,
       config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0,
       enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT )`,
    `CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id)`,
    // TICKET EXPORTS — one row per copy-to-external action.
    `CREATE TABLE IF NOT EXISTS ticket_exports (
       id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL, project_id TEXT NOT NULL, connector_id TEXT NOT NULL,
       type TEXT NOT NULL, external_key TEXT, external_url TEXT, status TEXT NOT NULL,
       error TEXT, created_at INTEGER NOT NULL, created_by TEXT )`,
    `CREATE INDEX IF NOT EXISTS idx_texports_feedback ON ticket_exports(feedback_id)`,
    `CREATE INDEX IF NOT EXISTS idx_texports_project ON ticket_exports(project_id)`,
    // PERSONA EDITS — append-only audit of human persona identity edits (Sim Studio). One row per
    // changed field per PUT, tagged with the actor email.
    `CREATE TABLE IF NOT EXISTS persona_edits (
       id TEXT PRIMARY KEY, persona_id TEXT NOT NULL, project_id TEXT NOT NULL,
       field TEXT NOT NULL, before_val TEXT, after_val TEXT, actor TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS persona_edits_idx ON persona_edits (persona_id, created_at)`,
  ]
  for (const s of stmts) await c.execute(s)

  // ── additive (idempotent) columns — added after the P3a tables were deployed, so existing prod
  // DBs need these ALTERed in on every boot (migrateV2 early-returns when migrated_v2 is already
  // set, so these MUST live here, mirroring the accounts.domain pattern in initDb). ──
  const newTraitCols: Array<[string, string]> = [
    ["sim_traits", "area"],
    ["sim_traits", "issue_type"],
    ["sim_traits", "severity"],
    ["trait_events", "area"],
    ["trait_events", "issue_type"],
    ["trait_events", "severity"],
    ["trait_events", "actor"],
    ["sim_traits", "src_verified"],
    ["trait_events", "verified"],
  ]
  for (const [table, col] of newTraitCols) {
    if (!(await columnExists(c, table, col))) {
      await c.execute(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`).catch((e) =>
        console.warn(`${table}.${col} ALTER skipped:`, e?.message || e),
      )
    }
  }
  // Additive idempotent ALTERs for new feedback management columns.
  const feedbackAlters: [string, string][] = [
    ["status",     "TEXT NOT NULL DEFAULT 'open'"],
    ["assignee",   "TEXT"],
    ["notes",      "TEXT"],
    ["updated_at", "INTEGER"],
    ["issue_key",             "TEXT"],
    ["recurrence_count",      "INTEGER NOT NULL DEFAULT 1"],
    ["recurrence_dates_json", "TEXT"],
    ["last_seen_at",          "INTEGER"],
  ]
  for (const [col, def] of feedbackAlters) {
    if (!(await columnExists(c, "feedback", col))) {
      await c.execute(`ALTER TABLE feedback ADD COLUMN ${col} ${def}`).catch((e: any) =>
        console.warn(`feedback.${col} ALTER skipped:`, e?.message || e))
    }
  }
  await c.execute(`CREATE INDEX IF NOT EXISTS feedback_issue_idx ON feedback (project_id, issue_key)`)
    .catch((e: any) => console.warn("feedback_issue_idx skipped:", e?.message || e))
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

  // 1. Migrate EXISTING v1 personas only. applySchema owns the canonical project-scoped `personas`
  //    shape; here we only handle a live workspace_id-shaped table from an existing prod DB.
  //    FRESH install: applySchema already created the project-scoped `personas` (no workspace_id),
  //    so the guard below is FALSE → no rename, no junk personas_v1.
  //    EXISTING prod: the live `personas` has workspace_id → rename it to personas_v1, then the
  //    redundant-but-safe CREATE … IF NOT EXISTS re-creates the canonical project-scoped table.
  const hasV1 = await tableExists(c, "personas_v1")
  const hasPersonas = await tableExists(c, "personas")
  if (!hasV1 && hasPersonas && (await columnExists(c, "personas", "workspace_id"))) {
    await c.execute("ALTER TABLE personas RENAME TO personas_v1")
  }
  // Redundant on a fresh install (applySchema already made it); required after the rename above.
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
  //    Collision-safe + idempotent + non-lossy: copy each workspace row to a project row via
  //    INSERT OR IGNORE (a pre-existing 'proj_'+wid project row is PRESERVED — no PK throw on a
  //    half-migrated/retried state), then drop the now-redundant workspace rows. A second run finds
  //    no scope='workspace' rows → both statements are no-ops: zero duplicates, zero errors, no loss.
  await c.execute(
    `INSERT OR IGNORE INTO integrations (scope, owner_id, integration, config_json, updated_at)
     SELECT 'project', 'proj_'||owner_id, integration, config_json, updated_at
     FROM integrations WHERE scope='workspace'`,
  )
  await c.execute("DELETE FROM integrations WHERE scope='workspace'")

  // 6. flag LAST — only after every step above succeeded.
  await metaSet(c, "migrated_v2", String(Date.now()))
}

// ── Plane→connector one-time migration (guarded by schema_meta flag). ──
// For every integrations row with scope='project' and integration='plane', insert a connectors
// row (type='plane', auto_copy=1, enabled=1, config carries the existing encrypted token verbatim).
// Idempotent: guarded by the connectors_plane_migrated flag.
export async function migrateConnectorsPlane(c: Client) {
  if (await metaGet(c, "connectors_plane_migrated")) return // already done — fast no-op on every boot

  const rows = (await c.execute(
    "SELECT owner_id, config_json FROM integrations WHERE scope='project' AND integration='plane'"
  )).rows as any[]
  for (const row of rows) {
    const projectId = String(row.owner_id)
    const rawCfg = row.config_json ? JSON.parse(String(row.config_json)) : {}
    // carry token_enc across as key 'token' (encrypted — not decrypted here)
    const config: Record<string, string> = {}
    if (rawCfg.token_enc) config.token = String(rawCfg.token_enc)
    if (rawCfg.host) config.host = String(rawCfg.host)
    if (rawCfg.workspace) config.workspace = String(rawCfg.workspace)
    if (rawCfg.projectId) config.project_id = String(rawCfg.projectId)
    const id = "conn_" + crypto.randomUUID()
    await c.execute({
      sql: `INSERT OR IGNORE INTO connectors (id,project_id,type,name,config,auto_copy,enabled,created_at,created_by)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [id, projectId, "plane", "Plane (migrated)", JSON.stringify(config), 1, 1, Date.now(), null],
    })
  }
  await metaSet(c, "connectors_plane_migrated", String(Date.now()))
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
  // Single live code per email (M1): retire any prior unused codes so only the newest can verify.
  // Shrinks the brute-force surface and enforces clean single-use semantics.
  await db!.execute({ sql: "UPDATE login_otps SET used=1 WHERE email=? AND used=0", args: [email] })
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
// Persist the company domain on an account (used to tell clients from your own team).
export async function setAccountDomain(accountId: string, domain: string): Promise<void> {
  if (!db) return
  await db.execute({ sql: "UPDATE accounts SET domain=? WHERE id=?", args: [domain || null, accountId] })
}

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

// Rename a project (name only). Used by the signup onboarding to name the auto-created Default Project
// without spawning a duplicate. Caller must enforce projectAccess('admin'). Returns the updated row.
export async function renameProject(projectId: string, name: string): Promise<ProjectRow | null> {
  await db!.execute({ sql: "UPDATE projects SET name=?, updated_at=? WHERE id=?", args: [name, Date.now(), projectId] })
  return projectById(projectId)
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
  createdAt: number; updatedAt: number; traitCount?: number
}
function rowToPersona(x: any): PersonaRow {
  return {
    id: String(x.id), projectId: String(x.project_id), name: String(x.name),
    role: String(x.role || ""), type: String(x.type || "client"),
    initials: String(x.initials || ""), accent: String(x.accent || "#6366f1"),
    summary: String(x.summary || ""), insights: x.insights_json ? JSON.parse(String(x.insights_json)) : [],
    avatar: x.avatar ? String(x.avatar) : null, createdAt: Number(x.created_at), updatedAt: Number(x.updated_at),
    traitCount: x.trait_count != null ? Number(x.trait_count) : undefined,
  }
}
export async function listPersonas(projectId: string): Promise<PersonaRow[]> {
  const r = await db!.execute({
    sql: `SELECT p.*, (SELECT COUNT(*) FROM sim_traits t WHERE t.sim_id=p.id AND t.status='active') AS trait_count
          FROM personas p WHERE p.project_id=? ORDER BY p.created_at ASC`,
    args: [projectId],
  })
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

export type ScreenshotRow = {
  id: string; projectId: string | null; s3Key: string; bucket: string
  contentType: string; acl: string; bytes: number | null; ownerEmail: string | null
  expiresAt: number | null; createdAt: number
}
// Look up one screenshot ledger row by id (for the membership-checked signed-URL endpoint).
export async function screenshotById(id: string): Promise<ScreenshotRow | null> {
  const r = await db!.execute({ sql: "SELECT * FROM screenshots WHERE id=?", args: [id] })
  if (!r.rows.length) return null
  const x = r.rows[0] as any
  return {
    id: String(x.id), projectId: x.project_id != null ? String(x.project_id) : null,
    s3Key: String(x.s3_key), bucket: String(x.bucket), contentType: String(x.content_type),
    acl: String(x.acl || "private"), bytes: x.bytes != null ? Number(x.bytes) : null,
    ownerEmail: x.owner_email != null ? String(x.owner_email) : null,
    expiresAt: x.expires_at != null ? Number(x.expires_at) : null, createdAt: Number(x.created_at),
  }
}

export type FeedbackInsert = {
  projectId: string; simId?: string | null; actorEmail?: string | null
  urlHost?: string | null; urlPath?: string | null
  observation?: string | null; sentiment?: string | null; severity?: string | null
  screenshotId?: string | null; suggestedBug?: any; citedTraitIds?: any
  sourceQuote?: string | null; sourceTranscriptId?: string | null; sourceDate?: number | null
  planeIssueKey?: string | null; planeIssueUrl?: string | null
  issueKey?: string | null
}
export async function insertFeedback(f: FeedbackInsert): Promise<string> {
  const id = "fb_" + crypto.randomUUID()
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
export async function listActivity(projectId: string, opts: { actorEmail?: string | null; types?: string[]; limit?: number } = {}): Promise<ActivityRow[]> {
  const limit = opts.limit ?? 20
  // Optional type filter (R6 named observability: e.g. types=['review_run']). Inlined IN-list — values are
  // server-controlled enum strings, never user input.
  const typeFilter = opts.types && opts.types.length
    ? ` AND type IN (${opts.types.map(() => "?").join(",")})`
    : ""
  const typeArgs = opts.types && opts.types.length ? opts.types : []
  const r = opts.actorEmail
    ? await db!.execute({ sql: `SELECT * FROM activity_events WHERE project_id=? AND actor_email=?${typeFilter} ORDER BY created_at DESC LIMIT ?`, args: [projectId, opts.actorEmail, ...typeArgs, limit] })
    : await db!.execute({ sql: `SELECT * FROM activity_events WHERE project_id=?${typeFilter} ORDER BY created_at DESC LIMIT ?`, args: [projectId, ...typeArgs, limit] })
  return r.rows.map(rowToActivity)
}

export type FeedbackRow = {
  id: string; projectId: string; simId: string | null; actorEmail: string | null
  urlHost: string | null; urlPath: string | null; observation: string | null
  sentiment: string | null; severity: string | null; screenshotId: string | null
  suggestedBug: any | null; sourceQuote: string | null; citedTraitIds: any | null; sourceDate: number | null
  planeIssueKey: string | null; planeIssueUrl: string | null; createdAt: number
}
function safeJsonParse(s: any): any { try { return s ? JSON.parse(String(s)) : null } catch { return null } }
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
    suggestedBug: safeJsonParse(x.suggested_bug_json),
    sourceQuote: x.source_quote != null ? String(x.source_quote) : null,
    citedTraitIds: safeJsonParse(x.cited_trait_ids_json),
    sourceDate: x.source_date != null ? Number(x.source_date) : null,
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

// ── AI-call ledger (/opsadmin) ── one row per OpenRouter call; reads are global (not project-scoped).
export type AiCallInsert = {
  type: string; model: string; actorEmail?: string | null; projectId?: string | null
  inputTokens?: number | null; outputTokens?: number | null; costUsd?: number | null; ok?: boolean
}
export type AiCallRow = {
  id: string; createdAt: number; type: string; model: string
  actorEmail: string | null; projectId: string | null
  inputTokens: number | null; outputTokens: number | null; costUsd: number | null; ok: boolean
}

export async function recordAiCall(a: AiCallInsert): Promise<void> {
  const id = "ai_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO ai_calls (id,created_at,type,model,actor_email,project_id,input_tokens,output_tokens,cost_usd,ok)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [id, Date.now(), a.type, a.model, a.actorEmail ?? null, a.projectId ?? null,
           a.inputTokens ?? null, a.outputTokens ?? null, a.costUsd ?? null, a.ok === false ? 0 : 1],
  })
}

export async function opsTotals(): Promise<{ totalCost: number; totalInputTokens: number; totalOutputTokens: number; callCount: number }> {
  const r = await db!.execute(
    `SELECT COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(input_tokens),0) AS inp,
            COALESCE(SUM(output_tokens),0) AS outp, COUNT(*) AS n FROM ai_calls`)
  const x = r.rows[0] as any
  return { totalCost: Number(x.cost), totalInputTokens: Number(x.inp), totalOutputTokens: Number(x.outp), callCount: Number(x.n) }
}

export async function opsDaily(days = 30): Promise<{ day: string; cost: number; calls: number }[]> {
  const sinceMs = Date.now() - days * 86400000
  const r = await db!.execute({
    sql: `SELECT date(created_at/1000,'unixepoch') AS day, COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS calls
          FROM ai_calls WHERE created_at >= ? GROUP BY day ORDER BY day DESC`,
    args: [sinceMs],
  })
  return r.rows.map((x: any) => ({ day: String(x.day), cost: Number(x.cost), calls: Number(x.calls) }))
}

export async function opsByProject(): Promise<{ projectId: string | null; projectName: string | null; cost: number; calls: number }[]> {
  const r = await db!.execute(
    `SELECT a.project_id AS pid, p.name AS name, COALESCE(SUM(a.cost_usd),0) AS cost, COUNT(*) AS calls
     FROM ai_calls a LEFT JOIN projects p ON p.id = a.project_id
     GROUP BY a.project_id, p.name ORDER BY cost DESC`)
  return r.rows.map((x: any) => ({
    projectId: x.pid != null ? String(x.pid) : null,
    projectName: x.name != null ? String(x.name) : null,
    cost: Number(x.cost), calls: Number(x.calls),
  }))
}

export async function opsByTypeModel(): Promise<{ type: string; model: string; cost: number; calls: number }[]> {
  const r = await db!.execute(
    `SELECT type, model, COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS calls
     FROM ai_calls GROUP BY type, model ORDER BY cost DESC`)
  return r.rows.map((x: any) => ({ type: String(x.type), model: String(x.model), cost: Number(x.cost), calls: Number(x.calls) }))
}

function rowToAiCall(x: any): AiCallRow {
  return {
    id: String(x.id), createdAt: Number(x.created_at), type: String(x.type), model: String(x.model),
    actorEmail: x.actor_email != null ? String(x.actor_email) : null,
    projectId: x.project_id != null ? String(x.project_id) : null,
    inputTokens: x.input_tokens != null ? Number(x.input_tokens) : null,
    outputTokens: x.output_tokens != null ? Number(x.output_tokens) : null,
    costUsd: x.cost_usd != null ? Number(x.cost_usd) : null,
    ok: Number(x.ok) === 1,
  }
}

export async function opsRecentCalls(limit = 50, offset = 0): Promise<AiCallRow[]> {
  const r = await db!.execute({ sql: `SELECT * FROM ai_calls ORDER BY created_at DESC LIMIT ? OFFSET ?`, args: [limit, offset] })
  return r.rows.map(rowToAiCall)
}

export async function opsTodaySpend(): Promise<number> {
  const r = await db!.execute(
    `SELECT COALESCE(SUM(cost_usd),0) AS cost FROM ai_calls WHERE date(created_at/1000,'unixepoch') = date('now')`)
  return Number((r.rows[0] as any).cost)
}

// ── model mix (/opsadmin) ── persisted weighted model selection, stored in schema_meta. ──
export async function getModelWeights(): Promise<Record<string, number>> {
  const r = await db!.execute({ sql: "SELECT value FROM schema_meta WHERE key=?", args: ["model_weights"] })
  if (!r.rows.length) return {}
  try {
    const o = JSON.parse(String((r.rows[0] as any).value))
    return o && typeof o === "object" && !Array.isArray(o) ? o : {}
  } catch { return {} }
}
export async function setModelWeights(weights: Record<string, number>): Promise<void> {
  await db!.execute({
    sql: "INSERT INTO schema_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    args: ["model_weights", JSON.stringify(weights)],
  })
}

// ── transcripts / sim_traits / trait_events (P3a provenance) ──
// project_id is the canonical 'proj_'+account id. No live/consent/extension surface here (P3b).

export type TranscriptRow = {
  id: string; projectId: string; title: string | null; rawText: string
  sourceDate: number; speakers: string[] | null; addedBy: string; createdAt: number
}
function rowToTranscript(x: any): TranscriptRow {
  return {
    id: String(x.id), projectId: String(x.project_id),
    title: x.title != null ? String(x.title) : null, rawText: String(x.raw_text),
    sourceDate: Number(x.source_date),
    speakers: x.speakers_json ? JSON.parse(String(x.speakers_json)) : null,
    addedBy: String(x.added_by), createdAt: Number(x.created_at),
  }
}
export type TranscriptInsert = {
  projectId: string; title?: string | null; rawText: string
  sourceDate: number; speakers?: string[] | null; addedBy: string; id?: string
}
export async function insertTranscript(t: TranscriptInsert): Promise<string> {
  const id = t.id ?? "tr_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO transcripts (id,project_id,title,raw_text,source_date,speakers_json,added_by,created_at)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [id, t.projectId, t.title ?? null, t.rawText, t.sourceDate,
           t.speakers != null ? JSON.stringify(t.speakers) : null, t.addedBy, Date.now()],
  })
  return id
}
export async function listTranscripts(projectId: string): Promise<TranscriptRow[]> {
  const r = await db!.execute({ sql: "SELECT * FROM transcripts WHERE project_id=? ORDER BY source_date DESC", args: [projectId] })
  return r.rows.map(rowToTranscript)
}

// Return a single transcript only if it belongs to projectId (parameterized WHERE id=? AND project_id=?).
// Returns null when the transcript does not exist or belongs to a different project.
export async function transcriptById(projectId: string, id: string): Promise<TranscriptRow | null> {
  const r = await db!.execute({ sql: "SELECT * FROM transcripts WHERE id=? AND project_id=?", args: [id, projectId] })
  return r.rows.length ? rowToTranscript(r.rows[0]) : null
}

// Distinct transcripts referenced by the sim's trait_events.transcriptId, excluding the
// "legacy_import" sentinel, joined to the project's transcript rows, newest-first by sourceDate.
export async function sourceTranscriptsForSim(
  simId: string,
  projectId: string,
): Promise<{ id: string; title: string | null; sourceDate: number; addedBy: string }[]> {
  const events = await listTraitEvents(simId)
  const ids = [...new Set(events.map((e) => e.transcriptId).filter((t): t is string => !!t && t !== "legacy_import"))]
  if (!ids.length) return []
  const byId = new Map((await listTranscripts(projectId)).map((t) => [t.id, t]))
  return ids
    .map((id) => byId.get(id))
    .filter((t): t is TranscriptRow => !!t)
    .map((t) => ({ id: t.id, title: t.title, sourceDate: t.sourceDate, addedBy: t.addedBy }))
    .sort((a, b) => b.sourceDate - a.sourceDate)
}

function rowToTrait(x: any): Trait {
  return {
    id: String(x.id), simId: String(x.sim_id), projectId: String(x.project_id),
    kind: String(x.kind) as TraitKind, text: String(x.text),
    status: String(x.status || "active") as TraitStatus, strength: Number(x.strength ?? 1),
    srcTranscriptId: String(x.src_transcript_id), srcQuote: String(x.src_quote),
    srcQuoteOffset: x.src_quote_offset != null ? Number(x.src_quote_offset) : null,
    srcVerified: x.src_verified != null ? Number(x.src_verified) === 1 : null,
    srcSpeaker: x.src_speaker != null ? String(x.src_speaker) : null,
    createdAt: Number(x.created_at), updatedAt: Number(x.updated_at),
    area: x.area != null ? String(x.area) : null,
    issueType: x.issue_type != null ? String(x.issue_type) : null,
    severity: x.severity != null ? String(x.severity) : null,
  }
}
// Insert a brand-new trait. Accepts a fully-formed Trait (e.g. a TraitWrite{mode:'insert'}.trait).
export async function insertTrait(t: Trait): Promise<string> {
  await db!.execute({
    sql: `INSERT INTO sim_traits (id,sim_id,project_id,kind,text,status,strength,src_transcript_id,src_quote,src_quote_offset,src_verified,src_speaker,area,issue_type,severity,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [t.id, t.simId, t.projectId, t.kind, t.text, t.status, t.strength,
           t.srcTranscriptId, t.srcQuote, t.srcQuoteOffset ?? null,
           t.srcVerified == null ? null : (t.srcVerified ? 1 : 0),
           t.srcSpeaker ?? null,
           t.area ?? null, t.issueType ?? null, t.severity ?? null, t.createdAt, t.updatedAt],
  })
  return t.id
}
// Update a trait's mutable columns (text/status/strength/provenance/updatedAt + typed fields) — used by reconcile writes.
export async function updateTrait(t: Trait): Promise<void> {
  await db!.execute({
    sql: `UPDATE sim_traits SET kind=?,text=?,status=?,strength=?,src_transcript_id=?,src_quote=?,src_quote_offset=?,src_verified=?,src_speaker=?,area=?,issue_type=?,severity=?,updated_at=? WHERE id=?`,
    args: [t.kind, t.text, t.status, t.strength, t.srcTranscriptId, t.srcQuote,
           t.srcQuoteOffset ?? null, t.srcVerified == null ? null : (t.srcVerified ? 1 : 0),
           t.srcSpeaker ?? null,
           t.area ?? null, t.issueType ?? null, t.severity ?? null, t.updatedAt, t.id],
  })
}
export async function listTraits(simId: string, opts: { activeOnly?: boolean } = {}): Promise<Trait[]> {
  const r = opts.activeOnly
    ? await db!.execute({ sql: "SELECT * FROM sim_traits WHERE sim_id=? AND status='active' ORDER BY created_at ASC", args: [simId] })
    : await db!.execute({ sql: "SELECT * FROM sim_traits WHERE sim_id=? ORDER BY created_at ASC", args: [simId] })
  return r.rows.map(rowToTrait)
}

// Append a trait_event audit row (append-only — never updated/deleted).
export async function insertTraitEvent(e: TraitEventRow): Promise<string> {
  const id = "tev_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO trait_events (id,trait_id,sim_id,transcript_id,op,before_text,after_text,quote,quote_offset,verified,speaker,source_date,reason,area,issue_type,severity,actor,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, e.traitId, e.simId, e.transcriptId, e.op, e.beforeText ?? null, e.afterText ?? null,
           e.quote, e.quoteOffset ?? null, e.verified == null ? null : (e.verified ? 1 : 0),
           e.speaker ?? null, e.sourceDate, e.reason ?? null,
           e.area ?? null, e.issueType ?? null, e.severity ?? null, e.actor ?? null, e.createdAt],
  })
  return id
}

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

// ── persona_edits: append-only audit of human persona identity edits (Sim Studio). ──
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

function rowToTraitEvent(x: any): TraitEventRow {
  return {
    traitId: String(x.trait_id), simId: String(x.sim_id), transcriptId: String(x.transcript_id),
    op: String(x.op) as TraitEventRow["op"],
    beforeText: x.before_text != null ? String(x.before_text) : null,
    afterText: x.after_text != null ? String(x.after_text) : null,
    quote: String(x.quote), quoteOffset: x.quote_offset != null ? Number(x.quote_offset) : null,
    verified: x.verified != null ? Number(x.verified) === 1 : null,
    speaker: x.speaker != null ? String(x.speaker) : null,
    sourceDate: Number(x.source_date),
    reason: x.reason != null ? String(x.reason) : null,
    createdAt: Number(x.created_at),
    area: x.area != null ? String(x.area) : null,
    issueType: x.issue_type != null ? String(x.issue_type) : null,
    severity: x.severity != null ? String(x.severity) : null,
    actor: x.actor != null ? String(x.actor) : null,
  }
}

// List trait_events for a sim. Optional { traitId } narrows to a single trait's events (react path
// can fetch one trait's audit chain without a full sim scan).
export async function listTraitEvents(simId: string, opts: { traitId?: string } = {}): Promise<TraitEventRow[]> {
  const r = opts.traitId
    ? await db!.execute({ sql: "SELECT * FROM trait_events WHERE sim_id=? AND trait_id=? ORDER BY created_at ASC", args: [simId, opts.traitId] })
    : await db!.execute({ sql: "SELECT * FROM trait_events WHERE sim_id=? ORDER BY created_at ASC", args: [simId] })
  return r.rows.map(rowToTraitEvent)
}

// Return recently contradicted/superseded traits for the reopen feed (RECONCILE_SYS context).
// Ordered newest-first by updated_at; limit defaults to 20.
export type RecentlyResolvedTrait = {
  id: string
  kind: string
  text: string
  area: string | null
  issueType: string | null
  severity: string | null
  status: string
  updatedAt: number
}
export async function getRecentlyResolvedTraits(simId: string, limit = 20): Promise<RecentlyResolvedTrait[]> {
  const r = await db!.execute({
    sql: `SELECT id, kind, text, area, issue_type, severity, status, updated_at
          FROM sim_traits WHERE sim_id=? AND status IN ('contradicted','superseded')
          ORDER BY updated_at DESC LIMIT ?`,
    args: [simId, limit],
  })
  return r.rows.map((x: any): RecentlyResolvedTrait => ({
    id: String(x.id),
    kind: String(x.kind),
    text: String(x.text),
    area: x.area != null ? String(x.area) : null,
    issueType: x.issue_type != null ? String(x.issue_type) : null,
    severity: x.severity != null ? String(x.severity) : null,
    status: String(x.status),
    updatedAt: Number(x.updated_at),
  }))
}

// ── reconcile_runs cost-guard cache (§5): skip re-reconciling a (sim,transcript) pair. ──
export async function hasReconcileRun(simId: string, transcriptId: string): Promise<boolean> {
  const r = await db!.execute({ sql: "SELECT 1 FROM reconcile_runs WHERE sim_id=? AND transcript_id=? LIMIT 1", args: [simId, transcriptId] })
  return r.rows.length > 0
}
export async function markReconcileRun(simId: string, transcriptId: string): Promise<void> {
  await db!.execute({
    sql: "INSERT OR IGNORE INTO reconcile_runs (sim_id,transcript_id,created_at) VALUES (?,?,?)",
    args: [simId, transcriptId, Date.now()],
  })
}

// Lazy "legacy import" backfill (§2.4 step 4 semantics, applied at reconcile time so it also covers
// Sims saved after the P2 migration). A Sim created/saved before P3a has a populated `insights_json`
// but ZERO `sim_traits` rows — so the first reconcile could only `add` (no traits to evolve) and
// `rebuildInsightsJson` would then OVERWRITE insights_json with only the freshly-extracted traits,
// silently discarding the Sim's prior insights. This seeds one active trait + a 'create' trait_event
// per existing insight, anchored to a synthetic `legacy_import` transcript id (source_date ≈ the
// persona's created_at, so citations render "(legacy import)"). IDEMPOTENT: only runs when the Sim
// has zero existing traits, so a second call is a no-op. Returns the number of traits seeded.
//
// Accepts BOTH insight shapes seen in the wild:
//  - legacy EXTRACT_SYS / brief shape: { kind, text, quote }
//  - P3a cache shape (insightsFromTraits): { traitId, kind, text, quote, speaker, sourceTranscriptId, strength }
export async function ensureTraitsSeeded(simId: string): Promise<number> {
  // Guard: only seed when there are NO traits at all (any status) — so reinforce/refine evolution
  // is possible afterward and we never double-seed.
  const existing = await listTraits(simId) // all statuses
  if (existing.length) return 0

  const r = await db!.execute({ sql: "SELECT project_id, insights_json, created_at FROM personas WHERE id=?", args: [simId] })
  if (!r.rows.length) return 0
  const row = r.rows[0] as any
  const projectId = String(row.project_id)
  const createdAt = Number(row.created_at) || Date.now()
  let insights: any[] = []
  try { insights = row.insights_json ? JSON.parse(String(row.insights_json)) : [] } catch { insights = [] }
  if (!Array.isArray(insights) || !insights.length) return 0

  const validKinds = new Set(["pain", "want", "love"])
  let seeded = 0
  for (const ins of insights) {
    const kind = String(ins?.kind || "")
    if (!validKinds.has(kind)) continue
    const text = String(ins?.text || ins?.quote || "").trim()
    if (!text) continue
    const quote = String(ins?.quote || ins?.text || "").trim() || text
    const now = Date.now()
    const trait: Trait = {
      id: "trait_" + crypto.randomUUID(),
      simId, projectId, kind: kind as TraitKind, text,
      status: "active", strength: Number(ins?.strength) > 0 ? Number(ins.strength) : 1,
      srcTranscriptId: "legacy_import", srcQuote: quote, srcQuoteOffset: null,
      srcSpeaker: ins?.speaker != null ? String(ins.speaker) : null,
      createdAt, updatedAt: now,
    }
    await insertTrait(trait)
    await insertTraitEvent({
      traitId: trait.id, simId, transcriptId: "legacy_import", op: "create",
      beforeText: null, afterText: text, quote, quoteOffset: null,
      speaker: trait.srcSpeaker, sourceDate: createdAt, reason: "legacy import", createdAt: now,
    })
    seeded += 1
  }
  return seeded
}

// Recompute a persona's insights_json read cache from its ACTIVE sim_traits and persist it.
// Keeps insights_json as the denormalized cache the dashboard/studio render from. Returns the cache.
// DEFENSIVE no-op: if the active-trait set is empty while insights_json is currently non-empty, do
// NOT overwrite — a zero-trait rebuild must never silently wipe a Sim's prior insights (C1 guard).
export async function rebuildInsightsJson(simId: string) {
  const active = await listTraits(simId, { activeOnly: true })
  const insights = insightsFromTraits(active)
  if (!insights.length) {
    const cur = await db!.execute({ sql: "SELECT insights_json FROM personas WHERE id=?", args: [simId] })
    const curJson = cur.rows.length ? (cur.rows[0] as any).insights_json : null
    let curArr: any[] = []
    try { curArr = curJson ? JSON.parse(String(curJson)) : [] } catch { curArr = [] }
    if (Array.isArray(curArr) && curArr.length) return curArr // keep existing — don't wipe
  }
  await db!.execute({
    sql: "UPDATE personas SET insights_json=?, updated_at=? WHERE id=?",
    args: [JSON.stringify(insights), Date.now(), simId],
  })
  return insights
}

// ── monitored_urls / consent / review budget / extension tokens (P3b live activation) ──
// project_id is the canonical 'proj_'+account id. Patterns are prefix/glob ONLY (no regex).

export type MonitoredUrlRow = { id: string; projectId: string; urlPattern: string; enabled: boolean; createdAt: number }
function rowToMonitoredUrl(x: any): MonitoredUrlRow {
  return { id: String(x.id), projectId: String(x.project_id), urlPattern: String(x.url_pattern), enabled: Number(x.enabled) === 1, createdAt: Number(x.created_at) }
}
// All patterns for a project (admin view). enabledOnly → only rows the extension should act on.
export async function listMonitoredUrls(projectId: string, opts: { enabledOnly?: boolean } = {}): Promise<MonitoredUrlRow[]> {
  const r = opts.enabledOnly
    ? await db!.execute({ sql: "SELECT * FROM monitored_urls WHERE project_id=? AND enabled=1 ORDER BY created_at ASC", args: [projectId] })
    : await db!.execute({ sql: "SELECT * FROM monitored_urls WHERE project_id=? ORDER BY created_at ASC", args: [projectId] })
  return r.rows.map(rowToMonitoredUrl)
}
// Add (or re-enable) a pattern. Idempotent via UNIQUE(project_id,url_pattern). Returns the row id.
export async function addMonitoredUrl(projectId: string, urlPattern: string, enabled = true): Promise<string> {
  const id = "mon_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO monitored_urls (id,project_id,url_pattern,enabled,created_at) VALUES (?,?,?,?,?)
          ON CONFLICT(project_id,url_pattern) DO UPDATE SET enabled=excluded.enabled`,
    args: [id, projectId, urlPattern, enabled ? 1 : 0, Date.now()],
  })
  const r = await db!.execute({ sql: "SELECT id FROM monitored_urls WHERE project_id=? AND url_pattern=?", args: [projectId, urlPattern] })
  return r.rows.length ? String((r.rows[0] as any).id) : id
}
export async function setMonitoredUrlEnabled(projectId: string, id: string, enabled: boolean): Promise<void> {
  await db!.execute({ sql: "UPDATE monitored_urls SET enabled=? WHERE project_id=? AND id=?", args: [enabled ? 1 : 0, projectId, id] })
}
// Edit a pattern in place. UNIQUE(project_id,url_pattern) means renaming onto an existing
// pattern throws a constraint error — the caller surfaces that as a friendly message.
export async function setMonitoredUrlPattern(projectId: string, id: string, urlPattern: string): Promise<void> {
  await db!.execute({ sql: "UPDATE monitored_urls SET url_pattern=? WHERE project_id=? AND id=?", args: [urlPattern, projectId, id] })
}
export async function removeMonitoredUrl(projectId: string, id: string): Promise<void> {
  await db!.execute({ sql: "DELETE FROM monitored_urls WHERE project_id=? AND id=?", args: [projectId, id] })
}

// matchMonitored: prefix/glob ONLY (NO regex). A pattern matches `url` on host+path when, after
// normalizing both (strip scheme, query, fragment, trailing slash), the url starts with the pattern's
// literal prefix — with '*' acting as a wildcard for any run of characters. Examples:
//   'app.example.com/billing'   matches 'https://app.example.com/billing/invoices?x=1'
//   'app.example.com/*/settings' matches 'app.example.com/team/settings'
// Returns the matched MonitoredUrlRow (first enabled match) or null.
function normForMatch(u: string): string {
  let s = String(u || "").trim()
  s = s.replace(/^https?:\/\//i, "")          // strip scheme
  s = s.replace(/[?#].*$/, "")                // strip query + fragment (path-only, §5)
  s = s.replace(/\/+$/, "")                   // strip trailing slash(es)
  return s.toLowerCase()
}
function globToRegExp(pattern: string): RegExp {
  // Escape everything except '*', which becomes '.*'. Anchored at start (prefix match), open at end.
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp("^" + esc)
}
export function patternMatchesUrl(pattern: string, url: string): boolean {
  const p = normForMatch(pattern)
  const u = normForMatch(url)
  if (!p) return false
  if (!p.includes("*")) return u === p || u.startsWith(p + "/")  // prefix on a path boundary
  return globToRegExp(p).test(u)
}
export async function matchMonitored(projectId: string, url: string): Promise<MonitoredUrlRow | null> {
  const rows = await listMonitoredUrls(projectId, { enabledOnly: true })
  for (const row of rows) if (patternMatchesUrl(row.urlPattern, url)) return row
  return null
}

export function hostOfPattern(pattern: string): string {
  return String(pattern || "").trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[?#].*$/, "")
    .split("/")[0]
    .replace(/\*+$/, "")
    .toLowerCase()
}

export async function originAllowedForProject(projectId: string, origin: string): Promise<boolean> {
  let host = ""
  try { host = new URL(origin).host.toLowerCase() } catch { return false }
  if (!host) return false
  const rows = await listMonitoredUrls(projectId, { enabledOnly: true })
  return rows.some(r => hostOfPattern(r.urlPattern) === host)
}

// ── monitoring consent (per-member-per-project) ──
export type ConsentRow = { projectId: string; email: string; status: string; grantedAt: number | null; updatedAt: number }
export async function getConsent(projectId: string, email: string): Promise<ConsentRow | null> {
  const r = await db!.execute({ sql: "SELECT * FROM monitoring_consent WHERE project_id=? AND email=?", args: [projectId, email] })
  if (!r.rows.length) return null
  const x = r.rows[0] as any
  return { projectId: String(x.project_id), email: String(x.email), status: String(x.status), grantedAt: x.granted_at != null ? Number(x.granted_at) : null, updatedAt: Number(x.updated_at) }
}
// Upsert consent status. granted_at is stamped the first time status becomes 'granted' and preserved after.
export async function setConsent(projectId: string, email: string, status: 'granted' | 'paused' | 'revoked'): Promise<void> {
  const now = Date.now()
  const existing = await getConsent(projectId, email)
  const grantedAt = status === "granted" ? (existing?.grantedAt ?? now) : (existing?.grantedAt ?? null)
  await db!.execute({
    sql: `INSERT INTO monitoring_consent (id,project_id,email,status,granted_at,updated_at) VALUES (?,?,?,?,?,?)
          ON CONFLICT(project_id,email) DO UPDATE SET status=excluded.status, granted_at=excluded.granted_at, updated_at=excluded.updated_at`,
    args: ["con_" + projectId + "_" + email, projectId, email, status, grantedAt, now],
  })
}

// ── project review_mode (user/admin pause) ──
export async function getReviewMode(projectId: string): Promise<string | null> {
  const r = await db!.execute({ sql: "SELECT review_mode FROM projects WHERE id=?", args: [projectId] })
  return r.rows.length ? String((r.rows[0] as any).review_mode) : null
}
export async function setReviewMode(projectId: string, mode: 'auto' | 'ready' | 'paused'): Promise<void> {
  await db!.execute({ sql: "UPDATE projects SET review_mode=?, updated_at=? WHERE id=?", args: [mode, Date.now(), projectId] })
}

// tryConsumeReviewBudget: ATOMIC per-project-per-day budget cap (§5). Returns true iff it incremented
// the day's count to a value <= budget (i.e. the caller is allowed to spend one review); false when the
// day is already at/over budget. The UPDATE … WHERE count<budget is the atomic gate: only one writer can
// take the row from (budget-1)→budget. budget<=0 always denies. Row is lazily created at count=0 first.
export async function tryConsumeReviewBudget(projectId: string, day: string, budget: number): Promise<boolean> {
  if (!Number.isFinite(budget) || budget <= 0) return false
  await db!.execute({
    sql: "INSERT INTO review_counts (project_id,day,count) VALUES (?,?,0) ON CONFLICT(project_id,day) DO NOTHING",
    args: [projectId, day],
  })
  const r = await db!.execute({
    sql: "UPDATE review_counts SET count=count+1 WHERE project_id=? AND day=? AND count<?",
    args: [projectId, day, budget],
  })
  return Number(r.rowsAffected) > 0
}
// Read the current day's consumed count (0 if no row yet).
export async function reviewBudgetUsed(projectId: string, day: string): Promise<number> {
  const r = await db!.execute({ sql: "SELECT count FROM review_counts WHERE project_id=? AND day=?", args: [projectId, day] })
  return r.rows.length ? Number((r.rows[0] as any).count) : 0
}

// ── extension tokens (dedicated narrow-scope Bearer, R5 pre-req) ──
// Issue (or rotate) a token bound to email (+optional project). Replaces reusing the raw session id.
export async function issueExtensionToken(email: string, projectId?: string | null, ttlMs?: number | null): Promise<string> {
  const token = "ext_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")
  const now = Date.now()
  const expiresAt = ttlMs && ttlMs > 0 ? now + ttlMs : null
  await db!.execute({
    sql: "INSERT INTO extension_tokens (token,email,project_id,created_at,expires_at,revoked) VALUES (?,?,?,?,?,0)",
    args: [token, email, projectId ?? null, now, expiresAt],
  })
  return token
}
// Resolve a dedicated extension token → email, honoring revoked + expiry. Returns null if not an ext token.
export async function getExtensionTokenEmail(token: string): Promise<string | null> {
  const r = await db!.execute({ sql: "SELECT email, expires_at, revoked FROM extension_tokens WHERE token=?", args: [token] })
  if (!r.rows.length) return null
  const x = r.rows[0] as any
  if (Number(x.revoked) === 1) return null
  if (x.expires_at != null && Number(x.expires_at) < Date.now()) return null
  return String(x.email)
}
export async function revokeExtensionToken(token: string): Promise<void> {
  await db!.execute({ sql: "UPDATE extension_tokens SET revoked=1 WHERE token=?", args: [token] })
}

// ── /api/sim/review guardrail ordering (§5, binding) ──
// PURE decision function: given the already-resolved state for one review attempt, return the FIRST
// failing gate (or { ok:true } if all pass). Kept pure + side-effect-free so the ordering is unit-testable
// without mocking HTTP/AI/S3. The endpoint resolves each input via the async helpers above, in this order,
// and short-circuits on the first block — so an off-allowlist URL is NEVER captured/reviewed (gate d), and
// no vision/screenshot work happens until every gate passes.
//
// Gate order (each a hard gate):
//   a. auth        — caller authenticated + has project access            → 401 'unauthorized'
//   b. paused      — admin pause (review_mode==='paused') OR user pause
//                    (consent 'paused'|'revoked')                          → 423 'paused' / 'userPaused'
//   c. consent     — consent must be 'granted' (else needs first capture)  → 412 'needsConsent'
//   d. allowlist   — url matches an enabled monitored pattern (ALLOWLIST
//                    ONLY — never review off-allowlist)                    → 403 'offAllowlist'
//   e. dedupe      — (sim,urlPath,domSig) already reviewed                 → 200 'alreadyReviewed'
//   f. budget      — per-project daily atomic cap not exhausted            → 429 'budgetExhausted'
export type ReviewGateInput = {
  authed: boolean
  reviewMode: string | null            // project's review_mode ('auto'|'ready'|'paused')
  consentStatus: string | null         // caller's monitoring_consent status ('granted'|'paused'|'revoked'|null)
  allowlistMatch: boolean              // url matched an ENABLED monitored pattern
  alreadyReviewed: boolean             // (sim,urlPath,domSig) dedupe hit
  budgetConsumed: boolean              // tryConsumeReviewBudget succeeded (a slot was taken)
  adhoc?: boolean                      // explicit user-initiated "Analyze this page" — bypasses passive gates
}
export type ReviewGateResult = { ok: true } | { ok: false; reason: string; status: number; message: string }
export function reviewGate(i: ReviewGateInput): ReviewGateResult {
  if (!i.authed) return { ok: false, reason: "unauthorized", status: 401, message: "Sign in to continue." }
  // Ad-hoc "Analyze this page" is an explicit, user-initiated one-shot review. It bypasses the passive-
  // monitoring gates (admin/user pause, consent, allowlist, dedupe) — the extension's per-domain confirm
  // covers consent — but the daily budget cost guard (gate f) still applies.
  if (i.adhoc) {
    if (!i.budgetConsumed) return { ok: false, reason: "budgetExhausted", status: 429, message: "The project's daily review budget is exhausted; reviews were auto-paused." }
    return { ok: true }
  }
  if (i.reviewMode === "paused") return { ok: false, reason: "paused", status: 423, message: "Reviews are paused for this project by an admin." }
  if (i.consentStatus === "paused" || i.consentStatus === "revoked") return { ok: false, reason: "userPaused", status: 423, message: "You have paused Sim reviews. Resume to continue." }
  if (i.consentStatus !== "granted") return { ok: false, reason: "needsConsent", status: 412, message: "Consent is required before Sims can review pages you visit." }
  if (!i.allowlistMatch) return { ok: false, reason: "offAllowlist", status: 403, message: "This URL is not on the project's monitored allowlist." }
  if (i.alreadyReviewed) return { ok: false, reason: "alreadyReviewed", status: 200, message: "This page was already reviewed." }
  if (!i.budgetConsumed) return { ok: false, reason: "budgetExhausted", status: 429, message: "The project's daily review budget is exhausted; reviews were auto-paused." }
  return { ok: true }
}

// Stable dedupe key for a single review: (sim_id, normalized url path, dom signature). Promotes the
// existing `klav_dev_react_*` hash pattern — a page isn't re-reviewed for the same Sim until its DOM
// signature changes. domSig is the caller-supplied content hash ('' when absent → path-level dedupe).
export function reviewDedupeKey(simId: string, urlPath: string, domSig: string | null | undefined): string {
  return `${simId}|${(urlPath || "").replace(/\/+$/, "").toLowerCase()}|${domSig || ""}`
}

// UTC day string (YYYY-MM-DD) for the per-project budget counter row.
export function reviewDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

// ── Connectors + ticket_exports (Task 1: cloud tickets + connectors) ──

export type ConnectorType = "webhook" | "plane" | "github" | "jira" | "linear"
export type ConnectorRow = {
  id: string
  projectId: string
  type: ConnectorType
  name: string
  config: Record<string, string>  // secret fields still encrypted — callers decrypt before use
  autoCopy: boolean
  enabled: boolean
  createdAt: number
  createdBy: string | null
}
export type TicketExportRow = {
  id: string
  feedbackId: string
  projectId: string
  connectorId: string
  type: string
  externalKey: string | null
  externalUrl: string | null
  status: "ok" | "failed"
  error: string | null
  createdAt: number
  createdBy: string | null
}

function rowToConnector(x: any): ConnectorRow {
  let config: Record<string, string> = {}
  try { config = x.config ? JSON.parse(String(x.config)) : {} } catch { config = {} }
  return {
    id: String(x.id),
    projectId: String(x.project_id),
    type: String(x.type) as ConnectorType,
    name: String(x.name),
    config,
    autoCopy: Number(x.auto_copy) === 1,
    enabled: Number(x.enabled) === 1,
    createdAt: Number(x.created_at),
    createdBy: x.created_by != null ? String(x.created_by) : null,
  }
}

function rowToTicketExport(x: any): TicketExportRow {
  return {
    id: String(x.id),
    feedbackId: String(x.feedback_id),
    projectId: String(x.project_id),
    connectorId: String(x.connector_id),
    type: String(x.type),
    externalKey: x.external_key != null ? String(x.external_key) : null,
    externalUrl: x.external_url != null ? String(x.external_url) : null,
    status: String(x.status) as "ok" | "failed",
    error: x.error != null ? String(x.error) : null,
    createdAt: Number(x.created_at),
    createdBy: x.created_by != null ? String(x.created_by) : null,
  }
}

// config secrets are stored encrypted (callers encrypt before calling create/update).
// listConnectors does NOT decrypt.
export async function listConnectors(projectId: string): Promise<ConnectorRow[]> {
  const r = await db!.execute({
    sql: "SELECT * FROM connectors WHERE project_id=? ORDER BY created_at ASC",
    args: [projectId],
  })
  return r.rows.map(rowToConnector)
}

export async function getConnectorById(projectId: string, id: string): Promise<ConnectorRow | null> {
  const r = await db!.execute({
    sql: "SELECT * FROM connectors WHERE project_id=? AND id=?",
    args: [projectId, id],
  })
  return r.rows.length ? rowToConnector(r.rows[0]) : null
}

export async function createConnector(
  projectId: string,
  c: { type: ConnectorType; name: string; config: Record<string, string>; autoCopy: boolean; createdBy: string | null }
): Promise<string> {
  const id = "conn_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO connectors (id,project_id,type,name,config,auto_copy,enabled,created_at,created_by)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [id, projectId, c.type, c.name, JSON.stringify(c.config), c.autoCopy ? 1 : 0, 1, Date.now(), c.createdBy ?? null],
  })
  return id
}

export async function updateConnector(
  projectId: string,
  id: string,
  patch: Partial<{ name: string; config: Record<string, string>; autoCopy: boolean; enabled: boolean }>
): Promise<void> {
  const sets: string[] = []
  const args: any[] = []
  if (patch.name !== undefined) { sets.push("name=?"); args.push(patch.name) }
  if (patch.config !== undefined) { sets.push("config=?"); args.push(JSON.stringify(patch.config)) }
  if (patch.autoCopy !== undefined) { sets.push("auto_copy=?"); args.push(patch.autoCopy ? 1 : 0) }
  if (patch.enabled !== undefined) { sets.push("enabled=?"); args.push(patch.enabled ? 1 : 0) }
  if (!sets.length) return
  args.push(projectId, id)
  await db!.execute({ sql: `UPDATE connectors SET ${sets.join(",")} WHERE project_id=? AND id=?`, args })
}

export async function removeConnector(projectId: string, id: string): Promise<void> {
  await db!.execute({ sql: "DELETE FROM connectors WHERE project_id=? AND id=?", args: [projectId, id] })
}

// Only connectors that are both enabled=1 AND auto_copy=1.
export async function listAutoCopyConnectors(projectId: string): Promise<ConnectorRow[]> {
  const r = await db!.execute({
    sql: "SELECT * FROM connectors WHERE project_id=? AND enabled=1 AND auto_copy=1 ORDER BY created_at ASC",
    args: [projectId],
  })
  return r.rows.map(rowToConnector)
}

// Update feedback management columns. Always sets updated_at. Returns true if a row was updated
// (i.e. the feedback belongs to the given project), false if no rows matched (cross-project guard).
export async function updateFeedbackMeta(
  projectId: string,
  feedbackId: string,
  meta: Partial<{ status: string; assignee: string | null; notes: string | null }>
): Promise<boolean> {
  const sets: string[] = ["updated_at=?"]
  const args: any[] = [Date.now()]
  if (meta.status !== undefined) { sets.push("status=?"); args.push(meta.status) }
  if ("assignee" in meta) { sets.push("assignee=?"); args.push(meta.assignee ?? null) }
  if ("notes" in meta) { sets.push("notes=?"); args.push(meta.notes ?? null) }
  args.push(projectId, feedbackId)
  const r = await db!.execute({
    sql: `UPDATE feedback SET ${sets.join(",")} WHERE project_id=? AND id=?`,
    args,
  })
  return Number(r.rowsAffected) > 0
}

// Fetch a single feedback row scoped to a project. Returns null if not found in this project.
// Maps to camelCase including the new status/assignee/notes/updatedAt columns.
export async function feedbackById(projectId: string, id: string): Promise<any | null> {
  const r = await db!.execute({
    sql: "SELECT * FROM feedback WHERE project_id=? AND id=?",
    args: [projectId, id],
  })
  if (!r.rows.length) return null
  const x = r.rows[0] as any
  return {
    id: String(x.id),
    projectId: String(x.project_id),
    simId: x.sim_id != null ? String(x.sim_id) : null,
    actorEmail: x.actor_email != null ? String(x.actor_email) : null,
    urlHost: x.url_host != null ? String(x.url_host) : null,
    urlPath: x.url_path != null ? String(x.url_path) : null,
    pageUrl: x.url_path != null ? String(x.url_path) : null,
    observation: x.observation != null ? String(x.observation) : null,
    sentiment: x.sentiment != null ? String(x.sentiment) : null,
    severity: x.severity != null ? String(x.severity) : null,
    screenshotId: x.screenshot_id != null ? String(x.screenshot_id) : null,
    planeIssueKey: x.plane_issue_key != null ? String(x.plane_issue_key) : null,
    planeIssueUrl: x.plane_issue_url != null ? String(x.plane_issue_url) : null,
    status: x.status != null ? String(x.status) : "open",
    assignee: x.assignee != null ? String(x.assignee) : null,
    notes: x.notes != null ? String(x.notes) : null,
    updatedAt: x.updated_at != null ? Number(x.updated_at) : null,
    createdAt: Number(x.created_at),
    recurrenceCount: Number(x.recurrence_count ?? 1),
    recurrenceDatesJson: x.recurrence_dates_json != null ? String(x.recurrence_dates_json) : null,
  }
}

export async function addTicketExport(
  x: Omit<TicketExportRow, "id" | "createdAt">
): Promise<string> {
  const id = "exp_" + crypto.randomUUID()
  await db!.execute({
    sql: `INSERT INTO ticket_exports (id,feedback_id,project_id,connector_id,type,external_key,external_url,status,error,created_at,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, x.feedbackId, x.projectId, x.connectorId, x.type, x.externalKey ?? null,
           x.externalUrl ?? null, x.status, x.error ?? null, Date.now(), x.createdBy ?? null],
  })
  return id
}

export async function listTicketExports(feedbackId: string): Promise<TicketExportRow[]> {
  const r = await db!.execute({
    sql: "SELECT * FROM ticket_exports WHERE feedback_id=? ORDER BY created_at DESC",
    args: [feedbackId],
  })
  return r.rows.map(rowToTicketExport)
}

// Batch fetch exports for a list of feedback ids. Groups newest-first per feedback id.
// Returns a map feedbackId → TicketExportRow[].
export async function exportsForFeedbackIds(ids: string[]): Promise<Record<string, TicketExportRow[]>> {
  if (!ids.length) return {}
  const placeholders = ids.map(() => "?").join(",")
  const r = await db!.execute({
    sql: `SELECT * FROM ticket_exports WHERE feedback_id IN (${placeholders}) ORDER BY created_at DESC`,
    args: ids,
  })
  const result: Record<string, TicketExportRow[]> = {}
  for (const row of r.rows) {
    const x = rowToTicketExport(row as any)
    if (!result[x.feedbackId]) result[x.feedbackId] = []
    result[x.feedbackId].push(x)
  }
  return result
}
