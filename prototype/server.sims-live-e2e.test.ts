// ── Live-Sim E2E integration target (KLAVITYKLA-25)
// ─────────────────────────────────────────────────────────────────────────────
// This test covers the FULL live-Sim loop agreed by the 5-Dev parallel build:
//
//   window.KlavitySims.deploy(["id"] | "all")   (Dev1 UI + Dev2 SDK)
//   → Sim avatars dock bottom-right              (Dev1 UI)
//   → scroll / navigation / DOM mutation        (Dev5 watch engine)
//   → POST /api/sim/review {url, screenshotDataUrl, simIds, projectId,
//                            adhoc:true, sessionId, seenHashes?}
//   → {reviews:[{simId, simName, observations:[{text, sentiment, quote?, hash}]}]}
//   → window.KlavitySims.renderFeedback(simId, simName, observations)  (Dev2 SDK)
//   assert: repeated unchanged screen ⟹ NO duplicate feedback
//
// EXPECTED STATUS: ALL tests marked with [FAILS-UNTIL-INTEGRATED] will fail
// until the corresponding Dev delivers their part.  Tests marked [PASSES-NOW]
// already pass against the current server and serve as regression guards.
//
// Server-side tests (sections A–C) use the same hermetic spawn pattern as
// server.review-adhoc.test.ts: fresh temp DB + Bun.spawn server subprocess.
// Browser-side tests (section D) assert SDK export shape; they fail until
// Dev2 ships the KlavitySims module.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Temp DB for the server subprocess ────────────────────────────────────────
const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-sims-live-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(77)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
// SQLITE_BUSY guard: WAL + 5s timeout so spawned-server and rawClient writes don't collide.
await rawClient.execute("PRAGMA journal_mode=WAL")
await rawClient.execute("PRAGMA busy_timeout=5000")

async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// ── Minimal schema (mirrors applySchema + migrateV2) ─────────────────────────
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

// ── Fixtures ──────────────────────────────────────────────────────────────────
const OWNER_EMAIL = `owner-live-${ts}@test.local`
const SESSION_ID  = `sess_live_${ts}`
const ACCOUNT_ID  = `acct_live_${ts}`
const PROJECT_ID  = `proj_live_${ts}`
// Two Sims — we use both to test simIds filtering and per-Sim dedup.
const SIM_A_ID    = `sim_a_${ts}`
const SIM_B_ID    = `sim_b_${ts}`
const NOW = Date.now()

await rawExec(`INSERT INTO users (email, created_at) VALUES (?, ?)`, [OWNER_EMAIL, NOW])
await rawExec(`INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Live Sim Test Workspace", OWNER_EMAIL, NOW])
await rawExec(`INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, [`am_live_${ts}`, ACCOUNT_ID, OWNER_EMAIL, "owner", NOW])
// review_budget_daily=500 so the budget gate never blocks during tests.
await rawExec(`INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [PROJECT_ID, ACCOUNT_ID, "Live Sim Test Project", "active", "auto", 500, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  [`pm_live_${ts}`, PROJECT_ID, OWNER_EMAIL, "owner", null, NOW])
// Two personas (Sims) in the project.
await rawExec(`INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [SIM_A_ID, PROJECT_ID, "Alex Tester", "QA Engineer", "client", "AT", "#6366f1", "Checks every edge case.", "[]", NOW, NOW])
await rawExec(`INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [SIM_B_ID, PROJECT_ID, "Bella Designer", "UX Designer", "client", "BD", "#ec4899", "Cares about visual polish.", "[]", NOW, NOW])
// Session cookie.
await rawExec(`INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, [SESSION_ID, OWNER_EMAIL, NOW, NOW + 86400_000])

// ── Server subprocess ─────────────────────────────────────────────────────────
let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

// Minimal 1×1 PNG — hermetic, no real capture needed.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
// A second visually-distinct screenshot (different base64 body) to simulate page change.
const TINY_PNG_2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScAAAAAElFTkSuQmCC"

// Representative screen hash (would normally be sha256(screenshotDataUrl) in the SDK).
const SCREEN_HASH_1 = "hash_screen_aabbccdd"
const SCREEN_HASH_2 = "hash_screen_eeff1122"

beforeAll(async () => {
  serverPort = 43000 + Math.floor(Math.random() * 1000)
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
      // No S3 — uploadScreenshotMeta throws, exercising the gate/response boundary.
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
      if (r && r.status < 500) break
    } catch { /* not ready */ }
    await Bun.sleep(150)
  }
})

afterAll(() => {
  serverProc?.kill()
  rawClient.close()
})

// ══════════════════════════════════════════════════════════════════════════════
// A. RESPONSE SHAPE — contract between server and SDK
// ══════════════════════════════════════════════════════════════════════════════

// [FAILS-UNTIL-INTEGRATED] — Dev3 (server) must rename `reactions` → `observations`
// and each item must have {text, sentiment, hash} (not {observation, sentiment}).
// Until then, the server returns `reviews[].reactions` and the assert below fails.
test("A1: /api/sim/review response has reviews[].observations shape (not reactions)", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `klav_session=${SESSION_ID}` },
    body: JSON.stringify({
      adhoc: true,
      projectId: PROJECT_ID,
      sessionId: `live_session_${ts}`,
      url: "https://example.com/dashboard",
      screenshotDataUrl: TINY_PNG,
      simIds: [SIM_A_ID],
    }),
  })

  const body = await r.json()
  // Gate must pass (no 401/403/412/423)
  expect([401, 403, 412, 423]).not.toContain(r.status)
  expect(body.reason).not.toBe("unauthorized")
  expect(body.reason).not.toBe("offAllowlist")

  // Either fully succeeded or hit post-gate infra error (no S3 in test env).
  // Either way, response must include a `reviews` array.
  expect(Array.isArray(body.reviews)).toBe(true)

  // [KEY CONTRACT] Each review entry must have `observations`, NOT `reactions`.
  // Shape: { simId, simName, observations: [{ text, sentiment, hash }] }
  for (const rev of body.reviews) {
    expect(typeof rev.simId).toBe("string")
    expect(typeof rev.simName).toBe("string")
    expect(Array.isArray(rev.observations)).toBe(true)           // NEW field — fails until Dev3 ships
    expect(rev.reactions).toBeUndefined()                         // OLD field — must be gone
    for (const obs of rev.observations) {
      expect(typeof obs.text).toBe("string")                      // renamed from obs.observation
      expect(typeof obs.sentiment).toBe("string")
      expect(typeof obs.hash).toBe("string")                      // NEW field — stable dedup key
      // obs.quote is optional but must be string when present
      if (obs.quote != null) expect(typeof obs.quote).toBe("string")
    }
  }
}, 15_000)

// [FAILS-UNTIL-INTEGRATED] — Dev4 (server) must accept `sessionId` in the POST body
// and use it to namespace per-session server-side dedup.
test("A2: /api/sim/review accepts sessionId param without error", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `klav_session=${SESSION_ID}` },
    body: JSON.stringify({
      adhoc: true,
      projectId: PROJECT_ID,
      sessionId: `live_session_${ts}_a2`,     // NEW: live-session identifier
      url: "https://example.com/pricing",
      screenshotDataUrl: TINY_PNG,
      simIds: [SIM_A_ID],
    }),
  })

  const body = await r.json()
  // sessionId must not cause a 400 "unknown field" or similar rejection.
  expect(r.status).not.toBe(400)
  expect(body.reason).not.toBe("badRequest")
  // Server must still return a reviews array (even if empty due to S3 error path)
  expect(Array.isArray(body.reviews) || body.ok === false).toBe(true)
}, 15_000)

// ══════════════════════════════════════════════════════════════════════════════
// B. SESSION DEDUP — unchanged screen must not produce duplicate feedback
// ══════════════════════════════════════════════════════════════════════════════

// [FAILS-UNTIL-INTEGRATED] — Dev4 (server) must honour `seenHashes` from the client.
// When the watch engine sends seenHashes:[SCREEN_HASH_1], the server must skip any
// Sim whose (simId, hash) pair was already reviewed, and return an empty reviews
// array for those Sims (not re-run the vision model or insert duplicate feedback).
test("B1: seenHashes dedup — same screenshot hash returns empty reviews", async () => {
  const liveSession = `live_session_${ts}_b1`
  const commonBody = {
    adhoc: true,
    projectId: PROJECT_ID,
    sessionId: liveSession,
    url: "https://example.com/page-b1",
    simIds: [SIM_A_ID],
  }
  const headers = { "Content-Type": "application/json", Cookie: `klav_session=${SESSION_ID}` }

  // First call: no seenHashes → server reviews the screen (gate passes or hits S3 error, both fine).
  const r1 = await fetch(`${BASE}/api/sim/review`, {
    method: "POST", headers,
    body: JSON.stringify({ ...commonBody, screenshotDataUrl: TINY_PNG, seenHashes: [] }),
  })
  const b1 = await r1.json()
  expect([401, 403, 412, 423]).not.toContain(r1.status)

  // Second call: same screenshot hash in seenHashes → server must NOT re-review.
  // Expected: ok:true, reviews:[] (deduped — no re-run for unchanged screen).
  const r2 = await fetch(`${BASE}/api/sim/review`, {
    method: "POST", headers,
    body: JSON.stringify({
      ...commonBody,
      screenshotDataUrl: TINY_PNG,
      seenHashes: [SCREEN_HASH_1],              // client says: I already have feedback for this hash
      simIds: [SIM_A_ID],
    }),
  })
  const b2 = await r2.json()
  expect(r2.status).toBe(200)
  expect(b2.ok).toBe(true)
  expect(Array.isArray(b2.reviews)).toBe(true)
  // [KEY ASSERTION] No Sim reviews run for an already-seen hash.
  expect(b2.reviews.length).toBe(0)            // fails until Dev4 implements seenHashes gate
}, 15_000)

// [FAILS-UNTIL-INTEGRATED] — corollary: a DIFFERENT hash on the same session MUST
// trigger a fresh review (otherwise the dedup is too aggressive).
test("B2: seenHashes dedup — new screenshot hash is NOT skipped", async () => {
  const liveSession = `live_session_${ts}_b2`
  const headers = { "Content-Type": "application/json", Cookie: `klav_session=${SESSION_ID}` }

  // seenHashes contains hash_1 only; we send hash_2 screenshotDataUrl → must NOT be deduplicated.
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST", headers,
    body: JSON.stringify({
      adhoc: true,
      projectId: PROJECT_ID,
      sessionId: liveSession,
      url: "https://example.com/page-b2",
      screenshotDataUrl: TINY_PNG_2,            // different screenshot
      seenHashes: [SCREEN_HASH_1],              // hash of a DIFFERENT (old) screen
      simIds: [SIM_A_ID],
    }),
  })
  const body = await r.json()
  // Gate must pass.
  expect([401, 403, 412, 423]).not.toContain(r.status)
  // The review was attempted (not short-circuited), so it either succeeded or hit S3 — not deduped.
  // Deduped path returns reviews:[]; non-deduped returns reviews with entries (or server error for S3).
  // We assert it did NOT return empty reviews[] with ok:true, which is the dedup short-circuit shape.
  const isDeduped = body.ok === true && Array.isArray(body.reviews) && body.reviews.length === 0
  expect(isDeduped).toBe(false)                // must not dedup a genuinely new screenshot
}, 15_000)

// ══════════════════════════════════════════════════════════════════════════════
// C. simIds FILTER — only requested Sims are reviewed   [PASSES-NOW]
// ══════════════════════════════════════════════════════════════════════════════

// This gate already exists in the current server (reqSimIds filtering, line ~1941).
// Treat it as a regression guard so it doesn't accidentally break during integration.
test("C1: simIds filter — only the requested Sim appears in reviews", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `klav_session=${SESSION_ID}` },
    body: JSON.stringify({
      adhoc: true,
      projectId: PROJECT_ID,
      url: "https://example.com/simids-test",
      screenshotDataUrl: TINY_PNG,
      simIds: [SIM_A_ID],       // only Sim A — Sim B must NOT appear in reviews
    }),
  })
  const body = await r.json()
  expect([401, 403, 412, 423]).not.toContain(r.status)
  expect(body.reason).not.toBe("unauthorized")
  // reviews (or reactions in current server) must only contain SIM_A_ID entries.
  const reviews: any[] = Array.isArray(body.reviews) ? body.reviews : []
  for (const rev of reviews) {
    expect(rev.simId).toBe(SIM_A_ID)
    expect(rev.simId).not.toBe(SIM_B_ID)
  }
}, 15_000)

// [PASSES-NOW] With adhoc:true + valid project the gate always passes (same as review-adhoc.test.ts).
test("C2: adhoc:true with valid projectId passes all passive gates [PASSES-NOW]", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `klav_session=${SESSION_ID}` },
    body: JSON.stringify({
      adhoc: true,
      projectId: PROJECT_ID,
      url: "https://no-allowlist-match.example.com/any/path",
      screenshotDataUrl: TINY_PNG,
    }),
  })
  const body = await r.json()
  const PASSIVE_GATE_REASONS = ["offAllowlist", "needsConsent", "paused", "userPaused", "alreadyReviewed"]
  expect(PASSIVE_GATE_REASONS).not.toContain(body.reason)
  expect(body.reason).not.toBe("unauthorized")
  expect([401, 403, 412, 423]).not.toContain(r.status)
  expect(body.ok === true || (body.ok === false && body.reason === "error")).toBe(true)
}, 15_000)

// ══════════════════════════════════════════════════════════════════════════════
// D. BROWSER API SURFACE — KlavitySims SDK exports   [FAILS-UNTIL-INTEGRATED]
// ══════════════════════════════════════════════════════════════════════════════
// Dev2 must export a `KlavitySims` object (or class) from @klavity/sdk with:
//   .deploy(simIds: string[] | "all", opts: { projectId: string, backendUrl: string }) → void
//   .renderFeedback(simId: string, simName: string, observations: Observation[]) → void
// where Observation = { text: string; sentiment: string; hash: string; quote?: string }
//
// These tests import from the SDK source directly (workspace: path). They will fail
// with "does not provide an export named 'KlavitySims'" until Dev2 ships the module.

test("D1: @klavity/sdk exports KlavitySims with deploy() method", async () => {
  // Dynamic import so the failure is at test time, not module-load time.
  const sdk = await import("@klavity/sdk").catch((e: any) => ({ __importError: e.message })) as any
  expect(sdk.__importError).toBeUndefined()   // SDK must load
  expect(typeof sdk.KlavitySims).not.toBe("undefined")           // export must exist
  expect(typeof sdk.KlavitySims?.deploy).toBe("function")        // .deploy() must be a function
})

test("D2: KlavitySims.deploy() accepts string[] or 'all' as first argument", async () => {
  const sdk = await import("@klavity/sdk").catch((e: any) => ({ __importError: e.message })) as any
  expect(sdk.__importError).toBeUndefined()
  const { KlavitySims } = sdk
  expect(() => KlavitySims.deploy(["sim_1", "sim_2"], { projectId: "p1", backendUrl: "http://localhost" })).not.toThrow()
  expect(() => KlavitySims.deploy("all", { projectId: "p1", backendUrl: "http://localhost" })).not.toThrow()
})

test("D3: @klavity/sdk exports KlavitySims.renderFeedback(simId, simName, observations)", async () => {
  const sdk = await import("@klavity/sdk").catch((e: any) => ({ __importError: e.message })) as any
  expect(sdk.__importError).toBeUndefined()
  const { KlavitySims } = sdk
  expect(typeof KlavitySims?.renderFeedback).toBe("function")    // .renderFeedback() must be a function
  // Must accept the exact observation shape from the server contract.
  const observations = [
    { text: "The checkout CTA is barely visible", sentiment: "negative", hash: "h1", quote: "users miss this button" },
    { text: "Loading indicator is missing", sentiment: "negative", hash: "h2" },
  ]
  // Should not throw when called with valid arguments (even in a non-browser context it must be safe).
  expect(() => KlavitySims.renderFeedback("sim_1", "Alex Tester", observations)).not.toThrow()
})

// ══════════════════════════════════════════════════════════════════════════════
// E. FULL LOOP SMOKE — gate → observation shape → dedup in one flow
// ══════════════════════════════════════════════════════════════════════════════

// [FAILS-UNTIL-INTEGRATED] — combines A + B: gate passes, response has observations,
// second call with same hash produces empty reviews (no double-bill).
test("E1: full live-sim loop — gate passes, observations returned, dedup on second call", async () => {
  const liveSession = `live_session_${ts}_e1`
  const headers = { "Content-Type": "application/json", Cookie: `klav_session=${SESSION_ID}` }
  const pageUrl = "https://example.com/full-loop-test"

  // ── Step 1: first watch-engine call (new screen, no seenHashes) ──
  const r1 = await fetch(`${BASE}/api/sim/review`, {
    method: "POST", headers,
    body: JSON.stringify({
      adhoc: true,
      projectId: PROJECT_ID,
      sessionId: liveSession,
      url: pageUrl,
      screenshotDataUrl: TINY_PNG,
      simIds: [SIM_A_ID, SIM_B_ID],
      seenHashes: [],
    }),
  })
  const b1 = await r1.json()

  // Gate passed — no passive-gate block and no auth failure.
  expect([401, 403, 412, 423]).not.toContain(r1.status)
  expect(b1.reason).not.toBe("unauthorized")
  expect(Array.isArray(b1.reviews)).toBe(true)

  // [FAILS-UNTIL-INTEGRATED] Each review must have `observations` with hash field.
  for (const rev of b1.reviews) {
    expect(Array.isArray(rev.observations)).toBe(true)
    for (const obs of rev.observations) {
      expect(typeof obs.hash).toBe("string")
      expect(obs.hash.length).toBeGreaterThan(0)
    }
  }

  // ── Step 2: same call with screenshot hashes in seenHashes → must be deduplicated ──
  // Extract hashes returned from step 1 (or use the known test hash if step 1 errored).
  const step1Hashes: string[] = b1.reviews
    .flatMap((rev: any) => (rev.observations ?? []).map((o: any) => o.hash))
    .filter(Boolean)
  const dedupeHashes = step1Hashes.length > 0 ? step1Hashes : [SCREEN_HASH_1]

  const r2 = await fetch(`${BASE}/api/sim/review`, {
    method: "POST", headers,
    body: JSON.stringify({
      adhoc: true,
      projectId: PROJECT_ID,
      sessionId: liveSession,
      url: pageUrl,
      screenshotDataUrl: TINY_PNG,    // same screenshot
      simIds: [SIM_A_ID, SIM_B_ID],
      seenHashes: dedupeHashes,       // tell server: already seen this screen
    }),
  })
  const b2 = await r2.json()

  // [KEY ASSERTION] Unchanged screen → no reviews (dedup short-circuit).
  expect(r2.status).toBe(200)
  expect(b2.ok).toBe(true)
  expect(b2.reviews).toEqual([])      // fails until Dev4 implements seenHashes
}, 20_000)
