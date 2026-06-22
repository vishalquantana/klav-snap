// Task 2: POST /api/sim/review with adhoc:true bypasses allowlist/consent gates.
// Spins a real server subprocess against a fresh temp DB (no monitored_urls seeded)
// and asserts:
//   1) adhoc + valid projectId + valid screenshot → passes all passive gates (NOT reason
//      offAllowlist/needsConsent/paused/alreadyReviewed/unauthorized); the server may
//      subsequently fail at S3 upload (not configured in test env) returning reason:"error"
//      or succeed with reviews:[] — either is acceptable because the GATE was bypassed.
//   2) adhoc without projectId → 401 unauthorized (auth/project gate must still fire).
//
// Hermetic: no real network calls required for gate assertions. LLM/S3 calls happen only
// AFTER all gates pass, so a 500 "error" response confirms gate bypass not gate block.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Dedicated temp DB for the subprocess ──────────────────────────────────────
const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-adhoc-${ts}.db`)

// 32-byte AES-GCM key for this test run (all-42 bytes)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

// ── Seed the DB via a raw client (NOT the shared db module) ──────────────────
const rawClient = createClient({ url: "file:" + srvDbFile })

async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// Minimal schema (mirrors applySchema from db.ts — same tables as server.widget.test.ts)
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, suggested_bug_json TEXT, cited_trait_ids_json TEXT, source_quote TEXT, source_transcript_id TEXT, source_date INTEGER, plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT, updated_at INTEGER, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS ticket_exports (id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL, project_id TEXT NOT NULL, connector_id TEXT NOT NULL, type TEXT NOT NULL, external_key TEXT, external_url TEXT, status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, created_by TEXT)`)
await rawExec(`CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT, feedback_id TEXT, screenshot_id TEXT, meta_json TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS monitored_urls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, UNIQUE(project_id, url_pattern))`)
await rawExec(`CREATE TABLE IF NOT EXISTS monitoring_consent (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, granted_at INTEGER, updated_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS extension_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0)`)
await rawExec(`CREATE TABLE IF NOT EXISTS screenshots (id TEXT PRIMARY KEY, project_id TEXT, s3_key TEXT NOT NULL, bucket TEXT, content_type TEXT, acl TEXT, bytes INTEGER, owner_email TEXT, expires_at INTEGER, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS review_counts (project_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (project_id, day))`)
await rawExec(`CREATE INDEX IF NOT EXISTS ext_tok_email_idx ON extension_tokens(email)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS idx_connectors_project ON connectors(project_id)`)
await rawExec(`CREATE INDEX IF NOT EXISTS mon_url_proj_idx ON monitored_urls(project_id)`)

// ── Seed fixtures ─────────────────────────────────────────────────────────────
// Member with project access but NO monitored_urls in the project (adhoc must bypass allowlist gate)
const MEMBER_EMAIL = `member-adhoc-${ts}@test.local`
const MEMBER_SID = `sess_adhoc_${ts}`

const ACCOUNT_ID = `acct_adhoc_${ts}`
const PROJECT_ID = `proj_adhoc_${ts}`
const NOW = Date.now()

// Account + member user — use review_budget_daily=200 so budget gate passes
await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [MEMBER_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Adhoc Test Workspace", MEMBER_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_adhoc_${ts}`, ACCOUNT_ID, MEMBER_EMAIL, "owner", NOW])
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Adhoc Test Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [`pm_adhoc_${ts}`, PROJECT_ID, MEMBER_EMAIL, "member", null, NOW])
// NO monitored_urls, NO monitoring_consent — so non-adhoc would be blocked by offAllowlist/needsConsent

// Session
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [MEMBER_SID, MEMBER_EMAIL, NOW, NOW + 86400_000])

// ── Spawn the server on a random port ─────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

// Minimal valid 1x1 PNG data URL (hermetic, no real capture needed)
const TINY_PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

beforeAll(async () => {
  serverPort = 42000 + Math.floor(Math.random() * 1000)
  BASE = `http://localhost:${serverPort}`

  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(serverPort),
      TURSO_DATABASE_URL: "file:" + srvDbFile,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET,
      KLAV_BASE_URL: BASE,
      KLAV_ALLOWED_DOMAINS: "test.local",
      KLAV_DEV_SHOW_OTP: "1",
      SENDGRID_API_KEY: "",
      KLAV_MAIL_FROM: "",
      OPENROUTER_API_KEY: "test-key",
      // No S3 env vars — uploadScreenshotMeta will throw, exercising the gate boundary
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  // Wait until the server is ready (max 10s)
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
      if (r && r.status < 500) break
    } catch { /* not ready yet */ }
    await Bun.sleep(150)
  }
})

afterAll(() => {
  serverProc?.kill()
  rawClient.close()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

// GATE-BYPASS ASSERTION:
// With adhoc:true + a valid projectId, the server bypasses the passive gates
// (allowlist, consent, dedupe) and proceeds past them. Since S3 is not configured
// in the test environment, the server will error at uploadScreenshotMeta and return
// 500 { reason: "error" }.  That is DISTINCT from any gate-block response
// (offAllowlist → 403, needsConsent → 412, paused → 423, unauthorized → 401) and
// confirms the adhoc path was taken.
//
// If in future S3/LLM are mocked, the assertion would tighten to ok:true + reviews:[].
// For now we scope to gate-outcome: the reason must not be a passive-gate block.
test("adhoc:true with valid projectId bypasses offAllowlist/needsConsent gates", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `klav_session=${MEMBER_SID}`,
    },
    body: JSON.stringify({
      adhoc: true,
      projectId: PROJECT_ID,
      url: "https://some-non-allowlisted-site.example.com/page",
      screenshotDataUrl: TINY_PNG_DATA_URL,
    }),
  })

  const body = await r.json()

  // Must NOT be a passive-gate block
  const GATE_BLOCK_REASONS = ["offAllowlist", "needsConsent", "paused", "userPaused", "alreadyReviewed"]
  expect(GATE_BLOCK_REASONS).not.toContain(body.reason)

  // Must NOT be unauthorized (auth + project resolved correctly)
  expect(body.reason).not.toBe("unauthorized")

  // Status must NOT be a gate-block code (401 unauthorized, 403 offAllowlist, 412 needsConsent, 423 paused)
  const GATE_BLOCK_STATUSES = [401, 403, 412, 423]
  expect(GATE_BLOCK_STATUSES).not.toContain(r.status)

  // Either succeeded (ok:true, reviews array) or hit post-gate infra error (ok:false, reason:"error")
  // Both prove the gate was bypassed.
  expect(body.ok === true || (body.ok === false && body.reason === "error")).toBe(true)
}, 15000)

// AUTH GATE ASSERTION:
// Without a projectId, adhoc:true hits the explicit adhoc guard (before project-resolution branches),
// which immediately returns 401 unauthorized without attempting allowlist auto-resolution.
test("adhoc:true without projectId returns 401 unauthorized", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `klav_session=${MEMBER_SID}`,
    },
    body: JSON.stringify({
      adhoc: true,
      // no projectId — server should return "Pick a project to analyze this page."
      url: "https://some-non-allowlisted-site.example.com/page",
      screenshotDataUrl: TINY_PNG_DATA_URL,
    }),
  })

  expect(r.status).toBe(401)
  const body = await r.json()
  expect(body.ok).toBe(false)
  expect(body.reason).toBe("unauthorized")
}, 15000)
