// ── On-Page Sims Feedback Journey — end-to-end smoke
// ─────────────────────────────────────────────────────────────────────────────
// Locks in the flagship live-Sim flow (CORS fixed, parallelised, overlay):
//
//   KlavitySims.deploy(simIds, sims)   → dock mounts (sims-live.ts)
//   → watch engine →  POST /api/sim/review
//   → runSimReviews(reactFn=mock)      → SimReview[] with observations
//   → KlavitySims.renderFeedback(…)   → sims-live draws bubble / halo
//   → showAnnotation(region)           → annotation-overlay marks the element
//
// The LLM reactFn is replaced by a deterministic mock so every assertion is
// stable, fast, and requires no network or real OpenRouter credit.
//
// Sections
//   I.   PIPELINE  — in-process runSimReviews, mock reactFn → real observations
//   II.  HTTP GATE — spawned server: /api/sim/review gate, projectId in response
//   III. SDK SURFACE — SimsLive.deploy / renderFeedback callable with pipeline data
//   IV.  OVERLAY GEOMETRY — region from Sim observation → clampRect / pinPosition

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ─────────────────────────────────────────────────────────────────────────────
// Ephemeral in-process DB (Section I).  Must set env BEFORE any import from ./db
// so the module singleton initialises to this file, not the default.
// ─────────────────────────────────────────────────────────────────────────────
const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const DB_FILE = join(tmpdir(), `klav-onpage-sims-${ts}.db`)
process.env.TURSO_DATABASE_URL = "file:" + DB_FILE
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema } = await import("./db")
const _inProcessDb = reconnectDb("file:" + DB_FILE)
await applySchema(_inProcessDb)

// Core pipeline (in-process)
const { runSimReviews } = await import("./sim-review")
const { hashObservation, buildSimRunSummary } = await import("./sim-review-pure")

// Annotation-overlay geometry (pure, no DOM)
const { clampRect, pinPosition } = await import("../../packages/sdk/src/annotation-overlay")

// SDK surface — import sims-live directly to avoid pulling in html-to-image / rrweb
// from index.ts (those browser-only packages are not resolvable in the bun test env).
const { SimsLive } = await import("../../packages/sdk/src/sims-live")
const KlavitySims = SimsLive   // KlavitySims is the public alias for SimsLive

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────
const PROJECT_ID = `proj_onpage_${ts}`
const SIM_A_ID   = `sim_a_${ts}`
const SIM_B_ID   = `sim_b_${ts}`

const SIM_A = { id: SIM_A_ID, name: "Aria QA",    role: "QA Engineer", initials: "AQ", accent: "#6366f1", summary: "Tests every flow.", insights: [] }
const SIM_B = { id: SIM_B_ID, name: "Ben Design", role: "UX Designer", initials: "BD", accent: "#ec4899", summary: "Cares about visual polish.", insights: [] }

// Deterministic reactions — positive sentiment keeps them below the bug-classifier
// HARD/SOFT thresholds so no insertFeedback DB write is triggered in Phase 2.
const REACTIONS_A = [
  {
    observation: "The hero section feels balanced and the CTA is well-positioned",
    sentiment: "satisfied",
    citedTraitIds: [],
    // region: 0–1 normalised viewport fractions (maps to annotation-overlay Rect)
    region: { x: 0.1, y: 0.05, w: 0.8, h: 0.35 },
  },
  {
    observation: "Navigation contrast is accessible and easy to read",
    sentiment: "positive",
    citedTraitIds: [],
  },
]
const REACTIONS_B = [
  {
    observation: "Call-to-action button has clear visual hierarchy",
    sentiment: "delighted",
    citedTraitIds: [],
  },
]

const mockReactFn = async (sim: any) => {
  if (sim.id === SIM_A_ID) return { data: { reactions: REACTIONS_A } }
  if (sim.id === SIM_B_ID) return { data: { reactions: REACTIONS_B } }
  return { data: { reactions: [] } }
}
const mockCitations = async () => ({
  citedTraitIds: [], sourceQuote: null, speaker: null,
  sourceTranscriptId: null, sourceDate: null,
  issueType: null, sourceQuoteVerified: null, recurrence: null,
})

// ═════════════════════════════════════════════════════════════════════════════
// I.  PIPELINE — in-process runSimReviews with mocked reactFn
// ═════════════════════════════════════════════════════════════════════════════

// Shared across section-I tests (populated by I.1)
let pipeline: Awaited<ReturnType<typeof runSimReviews>> = []

test("I.1: mock reactFn → runSimReviews returns one SimReview per Sim", async () => {
  pipeline = await runSimReviews({
    projectId: PROJECT_ID,
    urlPath: "/pricing",
    urlHost: "example.com",
    pageUrl: "https://example.com/pricing",
    imageB64: "aGVsbG8=",        // "hello" base64 — no real screenshot needed
    mediaType: "image/png",
    targetSims: [SIM_A, SIM_B],
    actorEmail: "test@example.local",
    screenshotId: `screen_${ts}`,
    seenKeys: [`${SIM_A_ID}:test`, `${SIM_B_ID}:test`],
    adhoc: true,                  // bypass seenHashes / near-dup for clean first run
    reactFn: mockReactFn,
    resolveCitationsFn: mockCitations,
    db: null,
  })

  expect(pipeline).toHaveLength(2)
  expect(pipeline.map(r => r.simId)).toContain(SIM_A_ID)
  expect(pipeline.map(r => r.simId)).toContain(SIM_B_ID)
}, 10_000)

test("I.2: each SimReview carries the correct simName", () => {
  const nameA = pipeline.find(r => r.simId === SIM_A_ID)?.simName
  const nameB = pipeline.find(r => r.simId === SIM_B_ID)?.simName
  expect(nameA).toBe("Aria QA")
  expect(nameB).toBe("Ben Design")
})

test("I.3: observations carry stable hash, text, and sentiment", () => {
  const revA = pipeline.find(r => r.simId === SIM_A_ID)!
  expect(revA.observations).toHaveLength(2)

  const obs0 = revA.observations[0]
  expect(typeof obs0.observation).toBe("string")
  expect(obs0.observation.length).toBeGreaterThan(0)
  expect(obs0.hash).toMatch(/^[0-9a-f]{16}$/)
  expect(obs0.hash).toBe(hashObservation(obs0.observation))  // hash must be stable
  expect(typeof obs0.sentiment).toBe("string")
})

test("I.4: observation with region carries a parsed ObsRegion (x/y/w/h)", () => {
  const revA = pipeline.find(r => r.simId === SIM_A_ID)!
  const obs   = revA.observations.find(o => o.region !== null)!
  expect(obs).toBeTruthy()
  expect(typeof obs.region!.x).toBe("number")
  expect(typeof obs.region!.y).toBe("number")
  expect(typeof obs.region!.w).toBe("number")
  expect(typeof obs.region!.h).toBe("number")
  // Normalised fractions must be in [0, 1]
  expect(obs.region!.x).toBeGreaterThanOrEqual(0)
  expect(obs.region!.x).toBeLessThanOrEqual(1)
})

test("I.5: seenHashes dedup — second call with same hashes returns zero observations", async () => {
  const allHashes = new Set(pipeline.flatMap(r => r.observations.map(o => o.hash)))
  const deduped = await runSimReviews({
    projectId: PROJECT_ID,
    urlPath: "/pricing",
    urlHost: "example.com",
    pageUrl: "https://example.com/pricing",
    imageB64: "aGVsbG8=",
    mediaType: "image/png",
    targetSims: [SIM_A, SIM_B],
    actorEmail: "test@example.local",
    screenshotId: `screen2_${ts}`,
    seenKeys: [`${SIM_A_ID}:test2`, `${SIM_B_ID}:test2`],
    seenHashes: allHashes,        // client says: I already showed all these
    adhoc: false,                 // dedup is active
    reactFn: mockReactFn,
    resolveCitationsFn: mockCitations,
    db: null,
  })
  const totalObs = deduped.flatMap(r => r.observations)
  expect(totalObs).toHaveLength(0)   // every hash was seen → all dropped
}, 10_000)

test("I.6: buildSimRunSummary aggregates correctly (2 Sims, 3 observations, 0 bugs)", () => {
  const s = buildSimRunSummary(pipeline)
  expect(s.simCount).toBe(2)
  expect(s.totalObservations).toBe(3)   // 2 from Sim A + 1 from Sim B
  expect(s.newCount).toBe(3)
  expect(s.bugCount).toBe(0)            // positive observations → no bug candidates
})

// ═════════════════════════════════════════════════════════════════════════════
// II.  HTTP GATE — spawned server: /api/sim/review returns projectId
//      (LLM fails with test-key → reviews:[] but the gate must pass and echo
//      projectId so the client knows which project processed the request)
// ═════════════════════════════════════════════════════════════════════════════

const SRV_DB  = join(tmpdir(), `klav-onpage-srv-${ts}.db`)
const SRV_KEY = Buffer.from(new Uint8Array(32).fill(99)).toString("base64")
let srvProc: ReturnType<typeof Bun.spawn>
let BASE: string

// Seed server DB directly (same pattern as server.sims-live-e2e.test.ts)
const srvClient = createClient({ url: "file:" + SRV_DB })
await srvClient.execute("PRAGMA journal_mode=WAL")
await srvClient.execute("PRAGMA busy_timeout=5000")

const SRV_OWNER  = `owner_onpage_${ts}@test.local`
const SRV_SESS   = `sess_onpage_${ts}`
const SRV_ACCT   = `acct_onpage_${ts}`
const SRV_PROJ   = `proj_onpage_srv_${ts}`
const SRV_SIM    = `sim_onpage_${ts}`
const NOW = Date.now()

for (const sql of [
  `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT, domain TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, UNIQUE(account_id, email))`,
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL DEFAULT 'member', invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`,
  `CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT, type TEXT NOT NULL DEFAULT 'client', initials TEXT, accent TEXT, summary TEXT, insights_json TEXT, avatar TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sim_id TEXT, actor_email TEXT, url_host TEXT, url_path TEXT, observation TEXT, sentiment TEXT, severity TEXT, screenshot_id TEXT, suggested_bug_json TEXT, cited_trait_ids_json TEXT, source_quote TEXT, source_transcript_id TEXT, source_date INTEGER, plane_issue_key TEXT, plane_issue_url TEXT, status TEXT NOT NULL DEFAULT 'open', assignee TEXT, notes TEXT, updated_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, actor_email TEXT, sim_id TEXT, url_host TEXT, url_path TEXT, feedback_id TEXT, screenshot_id TEXT, meta_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS screenshots (id TEXT PRIMARY KEY, project_id TEXT, s3_key TEXT NOT NULL, bucket TEXT, content_type TEXT, acl TEXT, bytes INTEGER, owner_email TEXT, expires_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS review_counts (project_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (project_id, day))`,
  `CREATE TABLE IF NOT EXISTS monitored_urls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, UNIQUE(project_id, url_pattern))`,
  `CREATE TABLE IF NOT EXISTS monitoring_consent (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, granted_at INTEGER, updated_at INTEGER NOT NULL, UNIQUE(project_id, email))`,
  `CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', auto_copy INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS extension_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_fb_proj ON feedback(project_id)`,
  `CREATE INDEX IF NOT EXISTS mon_url_proj_idx ON monitored_urls(project_id)`,
]) { await srvClient.execute(sql) }

await srvClient.execute({ sql: `INSERT INTO users (email, created_at) VALUES (?, ?)`, args: [SRV_OWNER, NOW] })
await srvClient.execute({ sql: `INSERT INTO accounts (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)`, args: [SRV_ACCT, "Onpage Test", SRV_OWNER, NOW] })
await srvClient.execute({ sql: `INSERT INTO account_members (id, account_id, email, account_role, created_at) VALUES (?, ?, ?, ?, ?)`, args: [`am_op_${ts}`, SRV_ACCT, SRV_OWNER, "owner", NOW] })
await srvClient.execute({ sql: `INSERT INTO projects (id, account_id, name, status, review_mode, review_budget_daily, observability_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [SRV_PROJ, SRV_ACCT, "On-Page Test Project", "active", "auto", 500, "named", NOW, NOW] })
await srvClient.execute({ sql: `INSERT INTO project_members (id, project_id, email, project_role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, args: [`pm_op_${ts}`, SRV_PROJ, SRV_OWNER, "owner", null, NOW] })
await srvClient.execute({ sql: `INSERT INTO personas (id, project_id, name, role, type, initials, accent, summary, insights_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [SRV_SIM, SRV_PROJ, "Aria QA", "QA Engineer", "client", "AQ", "#6366f1", "Tests every flow.", "[]", NOW, NOW] })
await srvClient.execute({ sql: `INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)`, args: [SRV_SESS, SRV_OWNER, NOW, NOW + 86_400_000] })

const SESSION_COOKIE = `klav_session=${SRV_SESS}`
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

beforeAll(async () => {
  const port = 44300 + Math.floor(Math.random() * 400)
  BASE = `http://localhost:${port}`

  srvProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: join(import.meta.dir, ".."),   // server.ts lives in prototype/, not prototype/lib/
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: "file:" + SRV_DB,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: SRV_KEY,
      KLAV_BASE_URL: BASE,
      KLAV_ALLOWED_DOMAINS: "test.local",
      KLAV_DEV_SHOW_OTP: "1",
      SENDGRID_API_KEY: "",
      KLAV_MAIL_FROM: "",
      OPENROUTER_API_KEY: "test-key",   // non-functional → LLM fails safely, reviews:[]
    },
    stdout: "pipe", stderr: "pipe",
  })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/favicon.svg`).catch(() => null); if (r && r.status < 500) break } catch { /* not ready */ }
    await Bun.sleep(150)
  }
}, 15_000)   // allow 15s for server startup (default bun beforeAll timeout is 5s)

afterAll(() => { srvProc?.kill(); srvClient.close() })

test("II.1: /api/sim/review gate passes — adhoc + valid session + known projectId", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: SESSION_COOKIE },
    body: JSON.stringify({ adhoc: true, projectId: SRV_PROJ, url: "https://example.local/pricing", screenshotDataUrl: TINY_PNG, simIds: [SRV_SIM] }),
  })
  const body = await r.json()
  expect([401, 403, 412, 423]).not.toContain(r.status)
  expect(body.reason).not.toBe("unauthorized")
  expect(body.reason).not.toBe("offAllowlist")
  expect(Array.isArray(body.reviews)).toBe(true)
}, 15_000)

test("II.2: response echoes projectId — review fires for the right project", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: SESSION_COOKIE },
    body: JSON.stringify({ adhoc: true, projectId: SRV_PROJ, url: "https://example.local/dash", screenshotDataUrl: TINY_PNG }),
  })
  const body = await r.json()
  // Key assertion: response always carries the projectId so the client knows
  // which project processed the review request.
  expect(body.projectId).toBe(SRV_PROJ)
}, 15_000)

test("II.3: unknown projectId → unauthorized (review cannot fire for a foreign project)", async () => {
  const r = await fetch(`${BASE}/api/sim/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: SESSION_COOKIE },
    body: JSON.stringify({ adhoc: true, projectId: "proj_does_not_exist", url: "https://example.local/", screenshotDataUrl: TINY_PNG }),
  })
  const body = await r.json()
  expect(body.ok).toBe(false)
  expect(body.reason).toBe("unauthorized")
}, 15_000)

// ═════════════════════════════════════════════════════════════════════════════
// III.  SDK SURFACE — SimsLive / KlavitySims callable; pipeline data fits
// ═════════════════════════════════════════════════════════════════════════════

test("III.1: KlavitySims and SimsLive are the same canonical export", () => {
  expect(SimsLive).toBeDefined()
  expect(KlavitySims).toBe(SimsLive)     // KlavitySims is the public alias of SimsLive
})

test("III.2: KlavitySims.deploy() accepts simIds + sims descriptors without throwing in Node", () => {
  const sims = [
    { id: SIM_A_ID, name: "Aria QA",    initials: "AQ", accent: "#6366f1" },
    { id: SIM_B_ID, name: "Ben Design", initials: "BD", accent: "#ec4899" },
  ]
  // In Node (no document) deploy() exits early via `if (typeof document === 'undefined')`.
  // The function must be callable with correct arg shapes and must not throw.
  expect(() => KlavitySims.deploy([SIM_A_ID, SIM_B_ID], sims)).not.toThrow()
  expect(() => KlavitySims.deploy("all", sims)).not.toThrow()
})

test("III.3: KlavitySims.renderFeedback() processes real pipeline observations without throwing", () => {
  // Feed the actual observations produced by Section I into renderFeedback,
  // proving the data contract between runSimReviews and sims-live is intact.
  // In Node (no dockEl) it no-ops silently — must not throw.
  const revA = pipeline.find(r => r.simId === SIM_A_ID)!
  expect(() => KlavitySims.renderFeedback(revA.simId, revA.simName, revA.observations)).not.toThrow()
  const revB = pipeline.find(r => r.simId === SIM_B_ID)!
  expect(() => KlavitySims.renderFeedback(revB.simId, revB.simName, revB.observations)).not.toThrow()
})

test("III.4: onTriage hook is null by default and settable", () => {
  expect(KlavitySims.onTriage).toBeNull()
  const cb = () => {}
  KlavitySims.onTriage = cb
  expect(KlavitySims.onTriage).toBe(cb)
  KlavitySims.onTriage = null   // restore
})

// ═════════════════════════════════════════════════════════════════════════════
// IV.  OVERLAY GEOMETRY — region from Sim observation → valid viewport coords
// ═════════════════════════════════════════════════════════════════════════════

test("IV.1: clampRect keeps observation region inside a 1280×720 viewport", () => {
  // Convert the normalised (0–1) region from REACTIONS_A[0] to CSS px for a 1280×720 viewport
  const reg = REACTIONS_A[0].region
  const VW = 1280, VH = 720
  const rect = { x: Math.round(reg.x * VW), y: Math.round(reg.y * VH), w: Math.round(reg.w * VW), h: Math.round(reg.h * VH) }
  const clamped = clampRect(rect, VW, VH)
  expect(clamped.x).toBeGreaterThanOrEqual(0)
  expect(clamped.y).toBeGreaterThanOrEqual(0)
  expect(clamped.x + clamped.w).toBeLessThanOrEqual(VW)
  expect(clamped.y + clamped.h).toBeLessThanOrEqual(VH)
})

test("IV.2: pinPosition flips below when element is near the viewport top", () => {
  const VW = 1280, VH = 720
  // Nav bar at y=60 — fitsAbove = (60 − 96 − 14 ≥ 10) = −50 ≥ 10 = false → flips below
  const navRect = { x: 0, y: 60, w: 1280, h: 60 }
  const { below, top } = pinPosition(navRect, 224, 96, VW, VH)
  expect(below).toBe(true)
  expect(top).toBeGreaterThan(navRect.y)   // pin placed below the element
})

test("IV.3: pinPosition places pin above an element in the middle of the viewport", () => {
  const VW = 1280, VH = 720
  // Element at y=400 — fitsAbove = (400 − 96 − 14 ≥ 10) = 290 ≥ 10 = true → above
  const rect = { x: 100, y: 400, w: 400, h: 100 }
  const { below, top } = pinPosition(rect, 224, 96, VW, VH)
  expect(below).toBe(false)
  expect(top).toBeLessThan(rect.y)   // pin sits above the element
})

test("IV.4: pinPosition clamps left edge — wide pin near right viewport edge", () => {
  const VW = 1280, VH = 720
  const rect = { x: 1200, y: 300, w: 100, h: 60 }   // element at far right
  const { left } = pinPosition(rect, 224, 96, VW, VH)
  expect(left + 224).toBeLessThanOrEqual(VW - 10)    // pin stays on-screen
})

// ═════════════════════════════════════════════════════════════════════════════
// V.  END-TO-END DATA CONTRACT
//     Prove the full chain: mock reactFn → SimReview[] → renderFeedback input
//     carries every field needed for the on-page overlay.
// ═════════════════════════════════════════════════════════════════════════════

test("V.1: observations carry all fields renderFeedback / sims-live needs", () => {
  for (const rev of pipeline) {
    expect(typeof rev.simId).toBe("string")
    expect(typeof rev.simName).toBe("string")
    expect(Array.isArray(rev.observations)).toBe(true)
    // Legacy 'reactions' field must be absent (renamed to 'observations')
    expect((rev as any).reactions).toBeUndefined()
    for (const obs of rev.observations) {
      expect(typeof obs.observation).toBe("string")
      expect(obs.observation.length).toBeGreaterThan(0)
      expect(obs.hash).toMatch(/^[0-9a-f]{16}$/)
      // region is null OR a valid ObsRegion
      if (obs.region !== null && obs.region !== undefined) {
        expect(typeof obs.region.x).toBe("number")
        expect(typeof obs.region.y).toBe("number")
        expect(typeof obs.region.w).toBe("number")
        expect(typeof obs.region.h).toBe("number")
      }
    }
  }
})

test("V.2: hashes are stable — recomputing from observation text gives identical hash", () => {
  for (const rev of pipeline) {
    for (const obs of rev.observations) {
      expect(obs.hash).toBe(hashObservation(obs.observation))
    }
  }
})
