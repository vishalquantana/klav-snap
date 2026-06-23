# Extension Allowlist Auto-Activate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side `GET /api/extension/match?url=` endpoint and wire the extension content script to call it on each page load, auto-activating the Sims dock for matching projects even without the site widget.

**Architecture:** The backend endpoint does auth-gated, rate-limited DB matching (reusing `matchMonitored` + `projectAccess`). The extension adds a `klavFetchServerMatch()` helper that calls it on boot and route-changes, storing the result in `klavApiMatchedProject`; `maybeActivate()` falls back to this when `klavMatchProject()` (cache-based) returns null. A pure `parseMatchResponse()` helper in a new `ext-match.ts` file is the only testable unit from the extension side.

**Tech Stack:** Bun + TypeScript (server), Vitest (extension unit tests), existing `rlAllow`, `matchMonitored`, `projectAccess`, `listProjects` from `lib/db.ts`.

## Global Constraints

- Work exclusively in the `klav-snap-wt-ext-allowlist-autoactivate` worktree on branch `feat/ext-allowlist-autoactivate`
- Do NOT touch CHANGELOG, package.json versions, or manifests
- Do NOT deploy — orchestrator handles that
- `bun test` in `prototype/` must be green before committing
- Extension vitest (`cd packages/extension && bun run test`) must pass
- No anonymous path: `ext_` Bearer or session cookie required for the new endpoint

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `prototype/server.ts` | **Modify** ~line 1848 | Add `GET /api/extension/match` handler after `/api/extension/config` block |
| `packages/extension/src/ext-match.ts` | **Create** | Pure `parseMatchResponse()` helper — no Chrome deps, fully testable |
| `packages/extension/src/content.ts` | **Modify** | Add `klavApiMatchedProject` state, `klavFetchServerMatch()`, call sites in `klavBootstrap` + `klavOnRouteChange`, fallback in `maybeActivate` |
| `prototype/server.ext-match.test.ts` | **Create** | Hermetic Bun test for the new endpoint (auth, matching, rate-limit, non-member isolation) |
| `packages/extension/src/ext-match.test.ts` | **Create** | Vitest pure unit tests for `parseMatchResponse` |

---

## Task 1: Create worktree

**Files:**
- (no code files — worktree setup only)

**Interfaces:**
- Produces: working directory `klav-snap-wt-ext-allowlist-autoactivate/` on branch `feat/ext-allowlist-autoactivate`

- [ ] **Step 1: Create worktree**

```bash
cd /Users/vishalkumar/Downloads/qbug
bash klav-snap/scripts/new-worktree.sh ext-allowlist-autoactivate
```

Expected output ends with: `✅ Worktree ready: .../klav-snap-wt-ext-allowlist-autoactivate`

- [ ] **Step 2: Confirm working directory**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate
git branch --show-current
```

Expected: `feat/ext-allowlist-autoactivate`

---

## Task 2: Backend endpoint `GET /api/extension/match`

**Files:**
- Modify: `prototype/server.ts` — insert ~25 lines immediately after the closing `}` of the `/api/extension/config` block (after line 1848 in the original; search for the literal string `"// ── monitoring consent"` and insert before it)

**Interfaces:**
- Consumes: `matchMonitored`, `listProjects`, `projectAccess`, `bearerEmail`, `sessionEmail`, `rlAllow`, `clientIp` — all already imported in `server.ts`
- Produces: `GET /api/extension/match?url=<encoded>` → `{ projects: [{projectId, name}] }` or 401

- [ ] **Step 1: Locate the insertion point**

Open `prototype/server.ts`. Find the line that reads:
```
    // ── monitoring consent (P3b) — grant / pause / revoke
```
The new handler goes **immediately before** that comment line (i.e., right after the closing `}` of the `/api/extension/config` block).

- [ ] **Step 2: Insert the handler**

Add this block at the insertion point:

```typescript
    // ── extension URL match (R5b) — bearer-gated real-time allowlist check.
    // Returns the caller's accessible projects whose enabled monitored-URL patterns
    // match the supplied url. Designed for the extension content-script: call on
    // each page load with the ext_ token; use result to activate when the cached
    // config is stale or hasn't yet synced.
    // SECURITY: missing auth → 401 (no project info). Authenticated non-member →
    // { projects: [] } — never discloses whether a project monitors the URL.
    if (req.method === "GET" && path === "/api/extension/match") {
      const meM = (await bearerEmail(req)) || (await sessionEmail(req))
      if (!meM) return json({ error: "Sign in to continue." }, 401)
      // Rate-limit: per token prefix (60/min) and per IP (120/min).
      const tok8 = (req.headers.get("authorization") || "").slice(7, 15)
      if (!rlAllow(`extmatch:tok:${tok8}`, 60, 60_000)) return json({ error: "rate limited" }, 429)
      if (!rlAllow(`extmatch:ip:${clientIp(req, server)}`, 120, 60_000)) return json({ error: "rate limited" }, 429)
      const rawUrl = url.searchParams.get("url") || ""
      if (!rawUrl || rawUrl.length > 2048 || !/^https?:\/\//i.test(rawUrl)) {
        return json({ projects: [] })
      }
      const accessible = await listProjects(meM)
      const matched: { projectId: string; name: string }[] = []
      for (const p of accessible) {
        if (!(await projectAccess(meM, p.id))) continue
        if (await matchMonitored(p.id, rawUrl)) matched.push({ projectId: p.id, name: p.name })
      }
      return json({ projects: matched })
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate/prototype
bun run --bun tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to this change — check that no new errors mention `extmatch` or `meM`).

---

## Task 3: Pure helper `packages/extension/src/ext-match.ts`

**Files:**
- Create: `packages/extension/src/ext-match.ts`

**Interfaces:**
- Consumes: nothing (pure, no imports)
- Produces:
  - `parseMatchResponse(data: unknown): { id: string; name: string } | null` — exported, used by `content.ts` and tested by `ext-match.test.ts`

- [ ] **Step 1: Create the file**

```typescript
// ext-match.ts — pure helper for parsing /api/extension/match responses.
// No Chrome APIs, no DOM, no module-level side effects — fully unit-testable.

/**
 * Parse the raw JSON body from GET /api/extension/match.
 * Returns the first matched project { id, name } or null.
 * Never throws — malformed data produces null.
 */
export function parseMatchResponse(data: unknown): { id: string; name: string } | null {
  if (!data || typeof data !== 'object') return null
  const list = (data as any).projects
  if (!Array.isArray(list) || list.length === 0) return null
  const first = list[0]
  if (!first || typeof first !== 'object') return null
  const id = String(first.projectId ?? '')
  const name = String(first.name ?? '')
  if (!id) return null
  return { id, name }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate/packages/extension
bun run --bun tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

---

## Task 4: Extension vitest for `parseMatchResponse`

**Files:**
- Create: `packages/extension/src/ext-match.test.ts`

**Interfaces:**
- Consumes: `parseMatchResponse` from `./ext-match`
- Produces: passing vitest suite covering valid / empty / malformed inputs

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest'
import { parseMatchResponse } from './ext-match'

describe('parseMatchResponse', () => {
  it('returns first project on a well-formed response', () => {
    const data = { projects: [{ projectId: 'proj_abc', name: 'My App' }] }
    expect(parseMatchResponse(data)).toEqual({ id: 'proj_abc', name: 'My App' })
  })

  it('returns only the first project when multiple are returned', () => {
    const data = { projects: [
      { projectId: 'proj_1', name: 'First' },
      { projectId: 'proj_2', name: 'Second' },
    ]}
    expect(parseMatchResponse(data)).toEqual({ id: 'proj_1', name: 'First' })
  })

  it('returns null for an empty projects array', () => {
    expect(parseMatchResponse({ projects: [] })).toBeNull()
  })

  it('returns null for missing projects key', () => {
    expect(parseMatchResponse({ other: 'stuff' })).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseMatchResponse(null)).toBeNull()
  })

  it('returns null for a non-object primitive', () => {
    expect(parseMatchResponse('bad')).toBeNull()
  })

  it('returns null when projectId is missing', () => {
    const data = { projects: [{ name: 'No ID' }] }
    expect(parseMatchResponse(data)).toBeNull()
  })

  it('returns null when projectId is empty string', () => {
    const data = { projects: [{ projectId: '', name: 'Empty' }] }
    expect(parseMatchResponse(data)).toBeNull()
  })

  it('coerces name to string when numeric', () => {
    const data = { projects: [{ projectId: 'proj_x', name: 42 }] }
    expect(parseMatchResponse(data)).toEqual({ id: 'proj_x', name: '42' })
  })
})
```

- [ ] **Step 2: Run the extension test suite**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate/packages/extension
bun run test
```

Expected: all vitest tests pass (including the new 9 cases above). The `--passWithNoTests` flag is already set in package.json so the command doesn't fail if other tests are skipped.

---

## Task 5: Extension content-script integration

**Files:**
- Modify: `packages/extension/src/content.ts`
  - Import `parseMatchResponse` from `./ext-match`
  - Add `klavApiMatchedProject` module-level state (~after line 599 where `klavConfig` is declared)
  - Add `klavFetchServerMatch(url)` function (~after `klavConsentKey` / before `klavSimsEnabled`)
  - Modify `maybeActivate()` to fall back to `klavApiMatchedProject`
  - Modify `klavBootstrap()` to call `klavFetchServerMatch` before `maybeActivate`
  - Modify `klavOnRouteChange()` to reset and re-fetch

**Interfaces:**
- Consumes: `parseMatchResponse` from `./ext-match` (Task 3), `klavConfig` (already in scope)
- Produces: `klavApiMatchedProject` — used inside `maybeActivate`

- [ ] **Step 1: Add import at the top of `content.ts`**

Find the existing import block at the top of `content.ts`. After the last import line (currently ends with `import { widgetPresent } from './coexist'` or similar), add:

```typescript
import { parseMatchResponse } from './ext-match'
```

- [ ] **Step 2: Add `klavApiMatchedProject` state**

Find the block that starts `let klavConfig: KlavConfig | null = null` (around line 599). Add immediately after it:

```typescript
// Server-side match result for the current URL — populated by klavFetchServerMatch().
// Used as a fallback in maybeActivate() when the cached config doesn't cover this URL.
let klavApiMatchedProject: { id: string; name: string } | null = null
```

- [ ] **Step 3: Add `klavFetchServerMatch()` function**

Find the function `async function klavSimsEnabled()` (around line 693). Add this function **before** it:

```typescript
// Calls GET /api/extension/match?url= to discover whether the caller is a member of
// any project whose allowlist matches `url`. Result is cached in klavApiMatchedProject
// for the current URL context and cleared on route changes. Best-effort: any fetch
// or parse failure silently leaves klavApiMatchedProject at its current value (null).
async function klavFetchServerMatch(url: string): Promise<void> {
  if (!klavConfig?.token || !klavConfig?.backendUrl) return
  try {
    const base = klavConfig.backendUrl.replace(/\/+$/, '')
    const r = await fetch(
      `${base}/api/extension/match?url=${encodeURIComponent(url)}`,
      { headers: { authorization: `Bearer ${klavConfig.token}` } }
    )
    if (!r.ok) return
    klavApiMatchedProject = parseMatchResponse(await r.json())
  } catch {
    // offline / server error — keep existing value (null on first call)
  }
}
```

- [ ] **Step 4: Add fallback in `maybeActivate()`**

Find the lines in `maybeActivate()` that read:
```typescript
  const url = location.href
  const project = klavMatchProject(url)
  // Off-allowlist: tear down indicator and stop.
  if (!project) { klavIndicatorEl?.remove(); klavIndicatorEl = null; return }
```

Replace with:
```typescript
  const url = location.href
  let project = klavMatchProject(url)
  // Server-match fallback: if the local cache doesn't cover this URL but the server
  // confirmed membership, synthesize a minimal project descriptor and activate.
  if (!project && klavApiMatchedProject) {
    project = {
      id: klavApiMatchedProject.id,
      name: klavApiMatchedProject.name,
      reviewMode: 'auto',   // optimistic; server re-gates on /api/sim/review
      monitoredUrls: [],    // server already confirmed the URL match — no client re-check needed
    }
  }
  // Off-allowlist: tear down indicator and stop.
  if (!project) { klavIndicatorEl?.remove(); klavIndicatorEl = null; return }
```

- [ ] **Step 5: Call `klavFetchServerMatch` in `klavBootstrap()`**

Find `klavBootstrap()`:
```typescript
async function klavBootstrap() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return
  const resp = await klavSend<{ ok: boolean; config: KlavConfig | null }>({ kind: 'KLAV_GET_CONFIG' })
  klavConfig = resp?.config ?? null
  // Boot review first — observers armed after so the first IO fire is suppressed.
  await maybeActivate('boot')
```

Replace with:
```typescript
async function klavBootstrap() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return
  const resp = await klavSend<{ ok: boolean; config: KlavConfig | null }>({ kind: 'KLAV_GET_CONFIG' })
  klavConfig = resp?.config ?? null
  // Server-side match: check current URL against backend allowlist before activating.
  // Runs before maybeActivate so the fallback project is ready at boot.
  await klavFetchServerMatch(location.href)
  // Boot review first — observers armed after so the first IO fire is suppressed.
  await maybeActivate('boot')
```

- [ ] **Step 6: Reset and re-fetch on route change in `klavOnRouteChange()`**

Find `klavOnRouteChange()`. It contains these lines in sequence:
```typescript
  klavBootGuard = false  // boot guard is per-page-load only; new routes fire freely

  // Tear down observers...
```

After `klavBootGuard = false`, add:
```typescript
  // Reset server match for the new route and re-query asynchronously.
  klavApiMatchedProject = null
  void klavFetchServerMatch(location.href)
```

- [ ] **Step 7: TypeScript compile check**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate/packages/extension
bun run --bun tsc --noEmit 2>&1 | head -30
```

Expected: no new errors (existing Chrome-type errors are pre-existing and acceptable).

---

## Task 6: Hermetic server test for `GET /api/extension/match`

**Files:**
- Create: `prototype/server.ext-match.test.ts`

**Interfaces:**
- Consumes: the live server subprocess + real DB (same hermetic pattern as `server.widget.test.ts`)
- Produces: passing Bun tests covering: 401 no-auth, empty-list non-match, correct match, non-member empty, non-http URL

- [ ] **Step 1: Write the test file**

```typescript
// GET /api/extension/match — hermetic server test.
// Spins a real server subprocess against a fresh temp DB, seeds a project +
// monitored URL, and exercises the auth, matching, and isolation guarantees.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-extmatch-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

const rawClient = createClient({ url: "file:" + srvDbFile })
await rawClient.execute("PRAGMA journal_mode=WAL")
await rawClient.execute("PRAGMA busy_timeout=5000")

async function rawExec(sql: string, args: any[] = []) {
  await rawClient.execute({ sql, args })
}

// ── Minimal schema ────────────────────────────────────────────────────────────
await rawExec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT, plan TEXT NOT NULL DEFAULT 'free', created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS account_members (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, account_role TEXT NOT NULL, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', review_mode TEXT NOT NULL DEFAULT 'auto', review_budget_daily INTEGER NOT NULL DEFAULT 200, observability_mode TEXT NOT NULL DEFAULT 'named', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS project_members (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, project_role TEXT NOT NULL, invited_by TEXT, created_at INTEGER NOT NULL, UNIQUE(project_id, email))`)
await rawExec(`CREATE TABLE IF NOT EXISTS monitored_urls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, url_pattern TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS extension_tokens (id TEXT PRIMARY KEY, email TEXT NOT NULL, project_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`)
await rawExec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`)

// ── Seed data ─────────────────────────────────────────────────────────────────
const NOW = Date.now()
const MEMBER_EMAIL = "member@test.local"
const OTHER_EMAIL  = "other@test.local"
const ACCOUNT_ID   = "acc_test"
const PROJECT_ID   = "proj_match_test"
const TOKEN_MEMBER = "ext_membertoken000"
const TOKEN_OTHER  = "ext_othertoken000"

await rawExec(`INSERT INTO users VALUES (?, ?, ?)`, [MEMBER_EMAIL, "Member", NOW])
await rawExec(`INSERT INTO users VALUES (?, ?, ?)`, [OTHER_EMAIL,  "Other",  NOW])
await rawExec(`INSERT INTO accounts VALUES (?, ?, ?, ?)`, [ACCOUNT_ID, "Test Acc", "free", NOW])
await rawExec(`INSERT INTO account_members VALUES (?, ?, ?, ?, ?)`, ["am1", ACCOUNT_ID, MEMBER_EMAIL, "member", NOW])
await rawExec(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [PROJECT_ID, ACCOUNT_ID, "Match Project", "active", "auto", 200, "named", NOW, NOW])
await rawExec(`INSERT INTO project_members VALUES (?, ?, ?, ?, ?, ?)`, ["pm1", PROJECT_ID, MEMBER_EMAIL, "member", null, NOW])
await rawExec(`INSERT INTO monitored_urls VALUES (?, ?, ?, ?, ?)`, ["mu1", PROJECT_ID, "bigidea.quantana.top", 1, NOW])
// other user is NOT a project member
await rawExec(`INSERT INTO extension_tokens VALUES (?, ?, ?, ?, ?)`, [TOKEN_MEMBER, MEMBER_EMAIL, null, NOW + 86400000, NOW])
await rawExec(`INSERT INTO extension_tokens VALUES (?, ?, ?, ?, ?)`, [TOKEN_OTHER,  OTHER_EMAIL,  null, NOW + 86400000, NOW])

let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  const port = 32200 + Math.floor(Math.random() * 500)
  BASE = `http://localhost:${port}`
  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: "file:" + srvDbFile,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET,
      KLAV_BASE_URL: BASE,
      KLAV_ALLOWED_DOMAINS: "test.local",
      KLAV_DEV_SHOW_OTP: "1",
      SENDGRID_API_KEY: "",
    },
    stdout: "ignore",
    stderr: "ignore",
  })
  // Wait for server to be ready
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok || r.status < 500) break } catch { /**/ }
    await new Promise(r => setTimeout(r, 200))
  }
})

afterAll(() => {
  serverProc?.kill()
  rawClient.close()
})

const MONITORED_URL = "https://bigidea.quantana.top/dashboard"
const OFF_URL       = "https://totally-different-site.io/page"

// ── Tests ─────────────────────────────────────────────────────────────────────

test("401 when no Authorization header", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`)
  expect(r.status).toBe(401)
})

test("empty projects when url is missing / blank", async () => {
  const r = await fetch(`${BASE}/api/extension/match`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("empty projects when url does not match any allowlist", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(OFF_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("returns matching project for member on monitored URL", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body.projects)).toBe(true)
  expect(body.projects.length).toBeGreaterThan(0)
  expect(body.projects[0].projectId).toBe(PROJECT_ID)
  expect(body.projects[0].name).toBe("Match Project")
})

test("non-member gets empty list — no existence disclosure", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent(MONITORED_URL)}`, {
    headers: { authorization: `Bearer ${TOKEN_OTHER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("returns empty list for non-http url", async () => {
  const r = await fetch(`${BASE}/api/extension/match?url=${encodeURIComponent("ftp://bad.example.com/")}`, {
    headers: { authorization: `Bearer ${TOKEN_MEMBER}` },
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  expect(body.projects).toEqual([])
})

test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const r = await fetch(`${BASE}/api/extension/match`, { method: "OPTIONS" })
  expect(r.status).toBe(204)
  expect(r.headers.get("access-control-allow-origin")).toBeTruthy()
})
```

- [ ] **Step 2: Run the full prototype test suite**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate/prototype
bun test 2>&1 | tail -20
```

Expected: the new `server.ext-match.test.ts` tests pass. The overall pass count should be >= the pre-change count (381). Pre-existing `@libsql/client` errors in other files are acceptable.

---

## Task 7: Final checks, rebase, and commit

**Files:**
- No new files — only git operations

- [ ] **Step 1: Run extension vitest one more time**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate/packages/extension
bun run test
```

Expected: all tests pass.

- [ ] **Step 2: Run prototype bun test**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate/prototype
bun test 2>&1 | tail -10
```

Expected: pass count >= pre-change count; no new failures.

- [ ] **Step 3: Fetch and rebase on latest master**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate
git fetch origin master
git rebase origin/master
```

Resolve trivially if conflicts arise (theirs-wins on version files; keep your changes on other files).

- [ ] **Step 4: Re-run tests after rebase**

```bash
cd prototype && bun test 2>&1 | tail -5
cd ../packages/extension && bun run test
```

- [ ] **Step 5: Stage and commit**

```bash
cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-ext-allowlist-autoactivate
git add prototype/server.ts \
        prototype/server.ext-match.test.ts \
        packages/extension/src/ext-match.ts \
        packages/extension/src/ext-match.test.ts \
        packages/extension/src/content.ts \
        docs/superpowers/specs/2026-06-23-ext-allowlist-autoactivate-design.md \
        docs/superpowers/plans/2026-06-23-ext-allowlist-autoactivate.md

git commit -m "$(cat <<'EOF'
feat(ext): server-side allowlist match + extension auto-activate fallback

Adds GET /api/extension/match?url= — auth-gated (ext_ Bearer / session),
rate-limited (60/min per token, 120/min per IP), returns {projectId,name}
for every accessible project whose enabled monitored-URL patterns match
the supplied URL. Non-members always receive []; no existence disclosure.

Extension content.ts gains klavFetchServerMatch() called on boot and SPA
route changes; maybeActivate() falls back to the server-matched project
when the cached KlavConfig doesn't cover the current URL. Pure helper
parseMatchResponse() extracted to ext-match.ts for testability.

Tests: hermetic Bun server test (7 cases) + 9 Vitest unit tests.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

Expected: commit succeeds; orchestrator picks up `feat/ext-allowlist-autoactivate` within ~30s.
