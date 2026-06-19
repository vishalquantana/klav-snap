# Klavity Snap — OWASP Security Review

Standard: OWASP Top 10:2025 · ASVS 5.0 · LLM Top 10:2025 · Agentic AI Security 2026
Skill: `.claude/skills/owasp-security` (agamm/claude-code-owasp)
Date: 2026-06-19 · Scope: `prototype/server.ts`, `prototype/lib/*`, connectors, `public/dashboard.html`

Method: three parallel reviewers (auth/access-control, injection/crypto/config, LLM/agentic), each
reading the real code and citing `file:line`. Findings below verified against source, not inferred.

## Remediation status (2026-06-20)

- ✅ **C1** fixed — per-Sim/per-persona ownership guards added to all trait, evolution, and persona-edit
  routes (`server.ts`). Cross-tenant requests now 404. Regression tests in `server.traits.test.ts`.
- ✅ **C2** fixed — `PUT /api/personas/:id` now 404s when the persona isn't in the caller's project
  (no more `ON CONFLICT` overwrite). Test added.
- ✅ **H2** fixed — new `lib/url-guard.ts` (`assertSafeUrl`) blocks loopback/private/link-local/metadata
  hosts and non-https; wired into `/api/feedback`'s Plane fetch. 36 guard tests + 2 endpoint tests.
- ✅ **H1** fixed — per-email + per-IP OTP issuance throttle and per-(email,IP) verify lockout
  (`lib/ratelimit.ts`, wired into `/api/auth/request` + `/api/auth/verify`); also closes **M1** (a new
  code retires prior unused codes, `db.ts createOtp`) and **M3** (live OTP no longer logged unless the
  dev flag is set). Tests: `lib/ratelimit.test.ts`, `server.auth-ratelimit.test.ts`.
- ✅ **H3** fixed — `assertSafeUrl` enforced inside every connector adapter (`lib/connectors/*`, via
  `guard.ts`), covering both the connector-test endpoint and auto-copy. Loopback hatch is opt-in only
  via `KLAV_TEST_ALLOW_LOOPBACK=1` (no deployment sets it). SSRF tests added.
- ✅ **H5** fixed — `accent` validated to strict `#rrggbb` server-side (`normAccent`, persona POST/PUT)
  and rendered through a `safeAccent()` hex guard in `dashboard.html` (defense in depth).
- ✅ **H4** fixed — untrusted content (call transcripts, captured page URL) is wrapped in
  `<untrusted_data>` markers with forged-delimiter stripping (`lib/prompt-safety.ts`), and every
  system prompt (`EXTRACT_SYS`/`REACT_SYS`/`RECONCILE_SYS`) carries a guard instruction to treat that
  content as data, not instructions. Tests: `lib/prompt-safety.test.ts`.
### Medium batch (v0.23.0)

- ✅ **M2** fixed & **fully closed (v0.23.1)** — `/api/extension-token` mints a revocable, scoped `ext_`
  token instead of the raw session id, and `bearerEmail` now accepts **only** `ext_` tokens; the legacy
  session-id-as-bearer fallback is removed (prod logs showed zero usage). Session ids authenticate only
  as first-party HttpOnly cookies.
- ✅ **M4** fixed — all catch sites route through `oops()` which logs the exception with a short
  correlation id server-side and returns a generic message + id (no stack/DB/upstream text to clients);
  the Plane upstream-body echo is removed.
- ✅ **M5** fixed — the daily spend cap is now **enforced** in `chat()` (fail-closed once `ai_calls`
  today ≥ `OPS_DAILY_CAP_USD`), `/api/transcripts` is rate-limited per user + per project and rejects
  payloads over 100k chars (413).
- ✅ **M6** addressed — auto-copy is rate-capped per project (flood guard); the prompt-injection/output
  risks it raised are covered by the shipped H4 + H5. A mandatory human-approval gate was deliberately
  **not** added (auto-copy is an intended product feature); revisit if AI-originated tickets ever
  auto-file without user submission.
- ✅ **Hardening:** `assertSafeUrl` is now https-only by construction — the `allowHttp` option was
  removed, so no caller can ever opt into plaintext for an outbound request.

### Re-sweep batch (v0.25.0)

A second full adversarial re-audit (clean-slate hunt + attempts to bypass the controls above) surfaced
real gaps — including bypasses of the earlier fixes. All High + the exploitable Mediums are now fixed,
with tests, via a multi-agent workflow.

- ✅ **SSRF redirect-following (High, A10)** — `fetch` followed 3xx to an unchecked host with the
  connector's secret header attached. New `lib/safe-fetch.ts` does `redirect:"manual"` and re-validates
  every hop through the guard (hop cap 5); all 5 connectors + the direct-Plane push route through it.
- ✅ **SSRF DNS-rebinding (High, A10)** — narrowed by re-validating the host immediately before each
  hop. Full IP-pinning isn't feasible in Bun's `fetch`; the residual narrow TOCTOU window is documented
  in `safe-fetch.ts` (allowHosts-pinned connectors are unaffected).
- ✅ **OTP lockout bypass via `X-Forwarded-For` spoofing (High, A07)** — `clientIp` now trusts XFF only
  when the socket peer is a trusted proxy (`isTrustedProxyPeer`); added an IP-independent per-email
  verify lockout (10/15 min) so IP rotation can't refresh the attempt budget.
- ✅ **Cross-tenant citation IDOR (Medium, A01)** — `/api/feedback`, `/api/react`, `/api/sim/review`
  now verify the supplied `sim_id` belongs to the caller's project before any trait/citation lookup
  (else treated as ephemeral, `simId=null`); `resolveCitations`/`listTraits`/`listTraitEvents` are
  project-scoped.
- ✅ **Cost-cap race (Medium, LLM10)** — replaced the non-atomic pre-check with an atomic
  `tryReserveDailySpend` reservation (fail-closed) + `reconcileDailySpend` to actual cost, so a
  concurrent burst can't overshoot `OPS_DAILY_CAP_USD`.
- ✅ **Connector error leak (Medium, A10)** — adapters throw generic errors (upstream body logged
  server-side only); the connector-test/export catches route through `oops()` so guard reasons aren't
  echoed (no blind-SSRF oracle).

### Still open (Low / Info — accepted or deferred)

- **Medium, deferred:** `ext_` widget tokens are account-wide rather than project-scoped (F5); legacy
  `/api/extract`/`/api/react`/`/api/persona/brief` lack per-user rate/size caps (the daily cost cap now
  bounds spend); no global security headers (CSP/HSTS/X-Frame-Options) — next batch.
- **Low:** verify response also returns `token: sid` in the body; `verifyOtp` check-then-act not atomic;
  `javascript:`/`data:` not scheme-checked on connector-supplied `href`s in the dashboard;
  `wrapUntrusted` regex is whitespace-naive (not independently exploitable).
- **Accepted:** wildcard CORS on bearer-auth widget routes; `emailAllowed` fail-open for open signup;
  LLM02 page content sent to OpenRouter (consented); vision (pixel) prompt injection (bounded: no tools,
  output escaped/validated).

All Critical + High findings, and all exploitable Mediums, are remediated with tests as of v0.25.0.

---

## Findings by severity

### 🔴 Critical

**C1 — Cross-tenant IDOR on trait / evolution / persona-edit endpoints (A01)**
`server.ts:1391-1463` (traits list/create/edit/delete), `:1318-1389` (evolution), `:957-960` (persona edits).
These take `simId`/`traitId`/`personaId` from the URL and call DB helpers scoped **only by that id**, never
by project (`listTraits(simId)` `db.ts:1022`, `updateTrait` `WHERE id=?` `db.ts:1014`, `listPersonaEdits`
`db.ts:1074`). `resolveProject` returns *the caller's own* project and never verifies the supplied id belongs
to it. Attack: user A calls `GET /api/sims/<B_simId>/traits` (or `PUT …/traits/<B_trait>`) and reads/edits
tenant B's customer research. Sibling routes `transcriptById`/`feedbackById`/`getConnectorById` *are* correctly
project-scoped — these are the odd ones out.
Fix: add the ownership guard the neighbouring `/evolution` route already uses (`server.ts:1331-1333`), or add
`project_id=?` to the WHERE clause of `listTraits`/`updateTrait`/`listTraitEvents`/`listPersonaEdits`.

**C2 — `PUT /api/personas/:id` overwrites other tenants' personas (A01)**
`server.ts:919-960`. `upsertPersona(pid,…)` does `ON CONFLICT(id) DO UPDATE` with **no `project_id` guard** in
the UPDATE branch — PUT on another tenant's `sim_id` overwrites name/role/summary/insights. (DELETE *is* scoped,
good.) Fix: reject when the `before` lookup (`server.ts:925`) returns nothing for the caller's project; add
`project_id=?` to the persona UPDATE.

### 🟠 High

**H1 — No rate limiting / brute-force protection on OTP (A07, ASVS 5.0 L1)**
`server.ts:665-683`, `verifyOtp` `db.ts:427`. 6-digit code (10⁶), 10-min window, **zero** throttle/lockout on
`/api/auth/verify`; `/api/auth/request` is also unthrottled (OTP/email bombing). Brute-forceable.
Fix: per-email + per-IP attempt counter (lock after ~5 fails, backoff); rate-limit request (1/60s, 5/hr);
consider 8-digit codes.

**H2 — Unauthenticated SSRF via `plane_host` in `/api/feedback` (A05/A10)**
`server.ts:718-722` reads `plane_host` from the form; `:860` fetches `${planeHost}/api/v1/…` and `:865` echoes
up to 300 chars of the response back. This "direct Plane mode" path needs **no auth**. Attack:
`plane_host=http://169.254.169.254/…` → server hits the cloud metadata service and leaks the body.
Fix: allowlist Plane hosts (e.g. `*.plane.so` / admin-configured), require https, block RFC1918/link-local/
loopback after DNS resolution; ideally gate the direct-creds path behind auth.

**H3 — SSRF via connector `url`/`host` (admin-gated) (A05/A10)**
`webhook.ts:20`, `jira.ts:38`, `plane.ts:23` all `fetch()` user-supplied URLs with no validation; reachable via
`POST /api/projects/:pid/connectors/test` (`server.ts:1927`, admin-only). A project admin can scan/hit the
internal network. Fix: route all connector fetches through one shared outbound guard (same as H2).

**H4 — Prompt injection: untrusted page/transcript concatenated as instructions (LLM01)**
`server.ts:193, 205-213, 229-239`. Transcript text and captured page content are appended after bare labels
(`"TRANSCRIPT:\n\n" + transcript`) with no delimiters and no "treat as data, not instructions" guard. A hostile
page (captured by `/api/sim/review`) or transcript can hijack persona generation and emit attacker-chosen JSON.
Fix: wrap untrusted content in explicit delimiters, strip the closing delimiter from input, and instruct each
system prompt to never follow commands found inside the data tags.

**H5 — Stored XSS / CSS-injection via model-generated `accent` (LLM05)**
`dashboard.html:769, 793`. The model-produced `accent` hex is interpolated raw into a `style` attribute with
**no escaping and no hex validation** (every sibling field uses `esc()`; `accent` does not). Server stores it
unvalidated (`server.ts:910, 931`). Combined with H4, a prompt-injected transcript can set `accent` to an
attribute-breakout payload. Fix: validate `accent` against `/^#[0-9a-fA-F]{6}$/` server-side on insert/update;
escape client-side / set via `el.style.background`.

### 🟡 Medium

**M1 — Requesting a new OTP doesn't invalidate prior codes (A07)** — `createOtp` always INSERTs; `verifyOtp`
accepts any unused/unexpired code (`db.ts:424-428`). Mark prior codes used before inserting.

**M2 — Raw 7-day session id reused as a Bearer token (A07/A01)** — `bearerEmail` falls back to `getSession(tok)`
and `/api/extension-token` returns the session cookie value as a bearer (`server.ts:468-475, 1686-1690`). A
leaked bearer = full session access. The proper `ext_` token path exists — use it and drop the fallback. Note
`ext_` tokens aren't per-project scoped in `bearerEmail`/`resolveProject` either (effectively account-wide).

**M3 — OTP written to stdout / `DEV_SHOW_OTP` leak (A09/A07)** — `server.ts:659` logs the live code on mail
failure; `:660` returns it in the HTTP response if the dev flag is set. Never log the code; assert the flag off
in prod.

**M4 — Error responses leak internal exception messages (A10)** — many catch blocks return `e.message` at 500
(`:661, :682, :886, :917, :950, :1053, :1220, :1315, :1462, :1681, :1819`), plus `:865` echoes upstream body.
Return a generic message + error id; log details server-side only.

**M5 — Unbounded consumption: no rate limit, display-only cost cap (LLM10)** — no rate limiting anywhere. The
atomic budget gates only `/api/sim/review`; `/api/transcripts` fires **two** LLM calls (4000+3000 max_tokens)
with only a 20-char *minimum* input check and no spend gate (`server.ts:1235-1286`). `OPS_DAILY_CAP_USD` is
**display-only** (confirmed `server.ts:449`) — enforcement is left to OpenRouter. Add token-bucket rate limits,
sum the `ai_calls` ledger and fail closed at a server-side daily cap, cap transcript length. (90s timeout +
max_tokens caps are present — good.)

**M6 — Excessive agency: auto-copy files external tickets from AI content without approval (LLM06/ASI02)** —
`server.ts:795-842`. Enabled auto-copy connectors push every new feedback row to Jira/GitHub/Linear/Plane/webhook
with model-generated title/body and no per-item human review; combines with H4/H5 to auto-propagate injected
content. (Connector setup is admin-only and secrets encrypted — good.) Add a human-approval queue or clear
labeling + per-project rate limit for AI-originated tickets.

### 🔵 Low / Info

- **Wildcard CORS** (`server.ts:366-371`) — `allow-origin: *` but **not** credentialed and widget uses bearer
  (not cookie) auth, so not the classic vuln. Keep tokens out of cookies; switch to an origin allowlist if any
  `wjson` route ever uses cookie auth.
- **`emailAllowed` is fail-open by design** (`auth.ts:16-24`) — unconfigured deployment allows any email to
  self-provision. Acceptable for open signup; set `KLAV_ALLOWED_*` to close it. (`isOpsAdmin` is fail-closed.)
- **LLM02** — full page screenshots + transcript sent to OpenRouter unredacted (`server.ts:209-210`). URL
  query/fragment is stripped for storage (good). Document the third-party flow; optional PII redaction for
  regulated tenants.
- **ASI06 context poisoning** — stored traits re-enter later prompts, but blast radius is bounded (project-scoped,
  `citedTraitIds` validated, reconcile ops schema-sanitized). Mitigated mainly by fixing H4.

---

## Verified safe (no action)

- **SQL injection — SAFE.** Every value-bearing query is parameterized (`args: [...]`). The only template-literal
  SQL interpolates hardcoded constant column/table arrays (`db.ts:240-264, 418`) or static `col=?` fragments;
  `IN (…)` lists use 1:1 `?` placeholders. No user input concatenated into SQL.
- **Cryptography — strong.** AES-256-GCM via WebCrypto, fresh random 12-byte IV per encryption, key from
  `KLAV_SECRET` validated to 32 bytes, **no hardcoded key / no insecure fallback** (throws if unset). `crypto.ts`.
- **Secret redaction — works.** `redactConnectorConfig` (`server.ts:569-581`) blanks every `secret:true` field
  and exposes only `has<Key>` booleans on all client responses; secrets stored encrypted (`token_enc`).
- **OpenRouter key — not exposed.** Used only in the upstream Authorization header (`server.ts:119`); never
  returned or logged.
- **XSS — escaped everywhere except `accent` (H5).** All other dynamic HTML passes through `escapeHtml`.
- **Session entropy / logout — correct.** 256-bit CSPRNG session ids; `ext_`/widget tokens UUIDv4; logout
  deletes the server row and clears the cookie; cookies `HttpOnly; SameSite=Lax; Secure(https)`.
- **`/opsadmin` gating — fail-closed.** Requires `isOpsAdmin`, returns 404 (not 403) to others.
- **System prompt — no secrets / no auth logic.** `EXTRACT_SYS`/`REACT_SYS`/`RECONCILE_SYS` are task-only.

---

## Suggested fix order

1. **C1 + C2** — one-line per-route ownership checks (neighbouring routes already show the pattern). Highest blast radius.
2. **H1** — OTP rate limiting / lockout.
3. **H2 + H3 + M4** — a shared outbound-fetch guard (allowlist + private-IP block) + stop forwarding `e.message`.
4. **H5 then H4** — hex-validate `accent` (quick), then delimiter-wrap untrusted LLM input.
5. **M5 / M6** — rate limiting + server-enforced cost cap; approval/labeling for AI-originated auto-copy.
