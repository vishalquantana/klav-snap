# HANDOFF — OWASP deferred-Medium batch (✅ COMPLETE)

**Status:** ✅ SHIPPED & deployed. v0.29.0 (commit 7dbf2f8) closed all 3 deferred Mediums; v0.29.1
(commit cc4a2ec) is a post-deploy CSP follow-up (allow `https://esm.sh` in script-src for the landing
page's html-to-image module import). 361 tests pass; all 5 security headers live on prod. The ALS
approach worked (F5 test proved propagation through Bun) — the WeakMap fallback was NOT needed.
Everything below is the original runbook, kept for the audit trail.

**Status (original):** WIP, uncommitted. Target release: **v0.29.0** (repo is currently at 0.28.1).
**Date:** 2026-06-20. **Working dir:** `/Users/vishalkumar/Downloads/qbug/klav-snap` (NOT a git worktree — shared with another active session shipping Klavity OS Trails).

## ⚠️ Read first — concurrent-session hazards
- Another Claude session is actively working in this SAME dir (it shipped 0.24.0→0.28.1; file watchers/linters touch mtimes).
- **NEVER `git add -A`.** Stage only the explicit files listed below. Verify `git diff --cached --name-only` before every commit.
- Before deploy/push: `git fetch origin && git log origin/master --oneline -1` — if the other session pushed, rebase/replan; resolve any `server.ts`/`db.ts` overlap carefully.
- Leave untracked artifacts alone (`.claude/`, `dna-logo-*.html`, `docs/backlog/`, `docs/superpowers/plans|research/`, `store-screenshots/`, `klavity-snap-0.21.1.zip`).

## What this batch is
Fix the 3 deferred Mediums + cheap Lows from the OWASP re-sweep (see `docs/security-owasp-review.md`):
1. **F5 — `ext_` widget tokens were account-wide, not project-scoped** (A01/ASI03).
2. **Legacy AI endpoints lack per-user rate + size caps** (`/api/persona/brief`, `/api/extract`, `/api/react`) (LLM10).
3. **No security headers** (CSP/HSTS/X-Frame-Options/nosniff/Referrer-Policy) (A02).

## DONE (edits already on disk — uncommitted)
All in `prototype/`. **Verified known-good:** `bun test server.traits.test.ts` → 22/22 pass with these edits in place (server boots; F5/ALS/headers/restructure did NOT break existing flows). Only the 3 AI-route rate checks + the new tests are not yet added.

> ⚠️ `bun build server.ts --outfile=...` currently FAILS on `chromium-bidi`/`playwright-core` — that's the OTHER session's Trails dependency failing to BUNDLE, NOT a problem with this code. Prod runs `bun run server.ts` (on-demand resolution), and `bun test` works. Use `bun test` (not `bun build`) to validate.

**`lib/db.ts`** — added `getExtensionTokenInfo(token) → {email, projectId|null}` (selects `project_id`); rewrote `getExtensionTokenEmail` to delegate to it.

**`server.ts`:**
- Import: added `getExtensionTokenInfo` to the `./lib/db` import; added `import { AsyncLocalStorage } from "node:async_hooks"`.
- Added `const reqCtx = new AsyncLocalStorage<{ boundProject?: string|null }>()` after imports.
- `bearerEmail()` now uses `getExtensionTokenInfo`, and on a project-bound token sets `reqCtx.getStore().boundProject = info.projectId`. Returns `info.email`.
- `resolveProject()` now first reads `reqCtx.getStore()?.boundProject`; if set (bound widget token), it **rejects a mismatched `?project=`** and **forces the bound project** (so a leaked widget token can't reach the owner's other projects). Account-wide tokens/cookies are unaffected.
- **Serve restructured:** the old `Bun.serve({...async fetch(req,server){ <BODY> }})` is now `async function handle(req, server){ <BODY> }` + a new `Bun.serve({ ... async fetch(req,server){ return reqCtx.run({}, async () => withSecurityHeaders(await handle(req, server))) } })` at the very end of the file. NOTE: the body kept its original (deeper) indentation — functionally fine, JS doesn't care.
- Added `CSP`, `SEC_HEADERS`, `withSecurityHeaders(res)` just above `handle`. CSP is intentionally permissive (Google Fonts + `'unsafe-inline'`/`'unsafe-eval'` + blob/data) so it won't break the dashboard / Trails rrweb player / marketing, while locking `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and blocking 3rd-party scripts. HSTS only when `SECURE`.
- Added constants `AI_DEMO_WINDOW/AI_DEMO_PER_USER (40)/AI_DEMO_MAX_CHARS (100_000)/AI_DEMO_MAX_IMG_B64 (12_000_000)` and a helper `aiDemoLimited(meEmail, req, server)` (keys by email else `clientIp`) right after the `AUTOCOPY_*` constants.

## TODO (remaining — do in order)

### 1. Wire the AI-demo caps into the 3 routes (`server.ts`)
Routes (grep `path === "/api/persona/brief"`, `"/api/extract"`, `"/api/react"`). In each, AFTER the `meX = (await sessionEmail(req)) || (await bearerEmail(req))` line and BEFORE the `chat()`/`extractPersonas`/`reactToPage` call, add:
```ts
if (aiDemoLimited(meX, req, server)) return json({ error: "Too many requests. Please wait and try again." }, 429, { "Retry-After": "3600" })
```
Plus size caps (return before the LLM call):
- `/api/persona/brief`: `if (String(brief).length > AI_DEMO_MAX_CHARS) return json({ error: "Brief too long." }, 413)`
- `/api/extract`: `if (String(transcript).length > AI_DEMO_MAX_CHARS) return json({ error: "Transcript too large." }, 413)`
- `/api/react`: `if (String(imageB64).length > AI_DEMO_MAX_IMG_B64) return json({ error: "Image too large." }, 413)`
(`server` is in scope inside `handle`.)

### 2. Tests (`prototype/server.traits.test.ts`, subprocess-against-temp-DB pattern)
- **Security headers:** any response has `x-frame-options: DENY` and a `content-security-policy` header. (Deterministic, e.g. on `GET /favicon.svg` or an API 401.)
- **AI-demo size cap:** `POST /api/persona/brief` with a >100k-char brief → 413 (returns before any LLM call — hermetic).
- **F5 (CRITICAL — this also proves AsyncLocalStorage propagates in Bun):**
  - Seed a 2nd project owned by `AUTHED_EMAIL` (e.g. `PROJECT_ID_2`) + an `extension_tokens` row bound to `PROJECT_ID` (insert via `rawExec`: `INSERT INTO extension_tokens (token,email,project_id,created_at,expires_at,revoked) VALUES ('ext_bound_x', AUTHED_EMAIL, PROJECT_ID, NOW, NOW+86400000, 0)`).
  - `GET /api/personas?project=${PROJECT_ID}` with `Authorization: Bearer ext_bound_x` → **200**.
  - `GET /api/personas?project=${PROJECT_ID_2}` with the same bearer → **deny (400 "No project."/404)** — the bound token must NOT reach the other owned project.
  - Schema: `server.traits.test.ts` already creates most tables; ADD `extension_tokens` (cols: `token TEXT PRIMARY KEY, email TEXT, project_id TEXT, created_at INTEGER, expires_at INTEGER, revoked INTEGER DEFAULT 0`).
  - **If this test FAILS OPEN** (bound token reaches PROJECT_ID_2 → 200), AsyncLocalStorage is NOT propagating through Bun.serve/libsql awaits. **Fallback:** replace the ALS approach with explicit threading — `const boundProjectByReq = new WeakMap<Request,string|null>()`, set it in `bearerEmail` (`boundProjectByReq.set(req, info.projectId ?? null)`), add an optional `req` param to `resolveProject`, read `boundProjectByReq.get(req)`, and append `, req` to every `resolveProject(...)` call site (there are ~16; grep `resolveProject(`). This is bulletproof (no propagation risk).

### 3. Build + test
`cd prototype && bun build server.ts --target=bun --outfile=/dev/null` (must bundle clean) then `bun test` (was 256 pass before this batch + ~83 from Trails = expect ~330+; ensure 0 fail).

### 4. Version lockstep → 0.29.0 (per `klavity_semver` memory)
Bump together: `docs/PRD.md` `**Version:**` header; new top `CHANGELOG.md` entry `## [0.29.0] — <date>` (### Security); `package.json` (root), `packages/core|extension|sdk/package.json`, `packages/extension/manifest.json`. (Use `perl -i -pe 's/"version": "0\.28\.1"/"version": "0.29.0"/ if $. < 10'`.) Re-verify with the Grep tool, not `grep` (rtk hook mangles bare grep output).

### 5. Update `docs/security-owasp-review.md`
Move F5 / AI-rate-caps / security-headers from "deferred" to fixed (v0.29.0). Remaining Lows: verify `token:sid` in body, `verifyOtp` not atomic, `javascript:`/`data:` href scheme-check, `wrapUntrusted` whitespace regex.

### 6. Commit (EXPLICIT files only) + tag + push
Stage exactly: `prototype/server.ts prototype/lib/db.ts prototype/server.traits.test.ts docs/security-owasp-review.md CHANGELOG.md docs/PRD.md package.json packages/core/package.json packages/extension/package.json packages/extension/manifest.json packages/sdk/package.json` (+ any new test file). Commit msg style: end with the Happy/Claude co-author trailer (see CLAUDE.md). `git tag v0.29.0`. Push master + tag.

### 7. Deploy (see `deploy_restart_gotcha` memory)
```
ssh root@66.135.20.62 'bash -s' <<'EOF'
chown -R klav:klav /opt/klav
su - klav -c 'cd /opt/klav && git fetch origin -q && git reset --hard origin/master | tail -1'
su - klav -c 'cd /opt/klav/prototype && ~/.bun/bin/bun install --production | tail -2'
systemctl restart klav; sleep 6
echo "active=$(systemctl is-active klav) deployed=$(git -C /opt/klav rev-parse --short HEAD)"
EOF
```
**Verify `deployed` == pushed SHA** (active alone is not proof). Poll `https://klavity.quantana.top/` for 200 (~10s boot; 502 early is the boot race).

### 8. Post-deploy verification (IMPORTANT — CSP risk)
- **Browser-verify CSP didn't break anything:** load `https://klavity.quantana.top/`, the dashboard, and `/trails`; check the console for `Content-Security-Policy` violation errors and confirm fonts/replay render. If anything breaks, loosen the offending CSP directive (most likely add a host to `style-src`/`connect-src`/`script-src`, or relax `worker-src`/`media-src` for rrweb) and redeploy.
- Confirm a response carries the new headers: `curl -sI https://klavity.quantana.top/ | grep -iE 'x-frame|content-security|strict-transport'`.

### 9. Memory
Update `klavity_security_owasp.md` (+ MEMORY.md index line): F5/AI-caps/headers SHIPPED v0.29.0; note ALS-vs-threading choice made; list any remaining Lows.

## Remaining after this batch (Lows, optional next)
verify response returns `token:sid` in body (drop it); `verifyOtp` check-then-act not atomic; `javascript:`/`data:` not scheme-checked on connector-supplied `href`s in `dashboard.html`; `wrapUntrusted` regex is whitespace-naive.

## Key facts
- Prod: `klavity.quantana.top` → Vultr `66.135.20.62` (`ssh root@` works, key-based). Deploy dir `/opt/klav` (git checkout on master), service `klav.service`, secrets `/etc/klav/klav.env`. Caddy terminates TLS → Bun on `:4317` (peer is loopback → `isTrustedProxyPeer` trusts XFF, which the new F5/rate-limit code relies on for real client IPs).
- Tests: `bun test` from `prototype/`. Server tests spawn a real subprocess vs a temp DB; they set `KLAV_TEST_ALLOW_LOOPBACK=1` only where a localhost receiver is needed.
- Prod Plane connector is on a public host (`plane.quantana.top` → 139.84.156.188) so the SSRF guard allows it — don't break that.
