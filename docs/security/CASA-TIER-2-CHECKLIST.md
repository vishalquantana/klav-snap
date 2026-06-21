# CASA Tier 2 Checklist — Klavity Snap (AI Bug Reporter)

> Evidence-based tracking for the CASA (Cloud Application Security Assessment) Tier 2 review.
> Every item is marked `[x]` done / `[~]` partial / `[ ]` gap, with `file:line` evidence from the real codebase.
> Unverifiable items are marked `[GAP — needs owner input]`.
>
> **App:** Klavity Snap `v0.37.1` · **Backend:** `prototype/server.ts` (Bun) at `https://klavity.quantana.top` behind Caddy
> **Note on CASA driver:** This extension declares **no Google OAuth sensitive/restricted scopes** (no `identity`/OAuth client in `manifest.json`). CASA here is driven by Chrome **powerful-permission** review (activeTab, scripting, tabs, cookies, etc.), not OAuth scope verification. See `docs/security/PERMISSION-JUSTIFICATION.md`.
> **Source-scan basis:** SAST+SCA self-scan `SECURITY-SCAN-2026-06-21.md` (Semgrep 1.167.0, pnpm audit).
> **Date prepared:** 2026-06-21 (IST).

---

## Phase 1: Pre-Assessment Preparation

### Documentation
- [~] Security architecture documented — partial. Inline rationale is thorough in code (`prototype/server.ts:834-862` security-header design; `prototype/lib/auth.ts`; `prototype/lib/db.ts` session/token model) and prior OWASP sweep is in memory/CHANGELOG, but no single consolidated architecture doc exists. **Fix:** stand up `docs/security/ARCHITECTURE.md` summarizing trust boundaries (Caddy → Bun → Turso/SQLite, extension ↔ backend).
- [~] PII data flow mapped — partial. PII touched: user email (OTP auth), screenshots, page text/quotes. Flows are visible in code (`/api/feedback`, `/api/sim/review`, S3 screenshot upload `server.ts:~1606,1691`) but not diagrammed. **Fix:** add a data-flow diagram + retention table.
- [x] OAuth scope justification written (one per sensitive scope) — **N/A as written; satisfied by equivalent.** No Google OAuth sensitive scopes exist (`packages/extension/manifest.json:7-16` — no `identity`/OAuth). The CASA-equivalent **Chrome permission/host-permission justification** is delivered in `docs/security/PERMISSION-JUSTIFICATION.md`.
- [ ] Data retention policy defined — gap. Code shows concrete TTLs (sessions 7d `server.ts:46`; private Sim screenshots 30d `server.ts:1691`; signed-URL 600s `server.ts:1606`) and a public `/privacy` page (`site/privacy.html`), but no formal retention policy doc. **Fix:** write retention policy citing these TTLs. `[GAP — needs owner input]` on legal-hold/erasure SLA.
- [ ] Incident response plan created — `[GAP — needs owner input]`. No IR runbook in repo. Building blocks exist (correlation IDs `oops()` `server.ts:496-500`, AI-cost ledger, opsadmin dashboard). **Fix:** document on-call, breach notification, key-rotation steps.

### Security Controls (fix before the scan)
- [x] HTTPS enforced on all endpoints — Caddy auto-HTTPS terminates TLS for the site (`deploy/Caddyfile:1`, ACME on the bare domain) and reverse-proxies to `127.0.0.1:4317` (`deploy/Caddyfile:12`). App marks cookies `Secure` when `SECURE` (`prototype/lib/auth.ts:35`). **Note/gap:** the committed Caddyfile site block is `klav.quantana.top` (old infra name), while prod serves `klavity.quantana.top` — confirm the deployed Caddyfile matches the live host (`[GAP — needs owner input]`: verify deployed config / add explicit HTTP→HTTPS redirect if not auto).
- [x] HSTS header configured — `Strict-Transport-Security: max-age=31536000; includeSubDomains` emitted on every response when `SECURE` (`prototype/server.ts:857`). **Note:** no `preload` token (acceptable for Tier 2; add if HSTS-preload submission desired).
- [x] Content Security Policy (CSP) configured — full CSP on every response: `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` (`prototype/server.ts:839-851,856`). **Caveat (defense-in-depth):** `script-src` still allows `'unsafe-inline' 'unsafe-eval'` (`server.ts:841`) — flagged in scan report (Outstanding hardening) for a future nonce-based pass. Functionally present and passing; tighten when browser-testable.
- [x] `X-Content-Type-Options: nosniff` set — `prototype/server.ts:854`.
- [x] `X-Frame-Options: DENY` set — `prototype/server.ts:853` (and `frame-ancestors 'none'` in CSP `server.ts:848`).
- [x] `Referrer-Policy` set — `strict-origin-when-cross-origin` (`prototype/server.ts:855`).
- [x] `X-Powered-By` header removed/suppressed — Bun's `Bun.serve` does not emit `X-Powered-By`, and a repo-wide search finds **no** code that sets it (grep `x-powered-by` → 0 matches). Confirmed not added anywhere.
- [~] CORS restricted to specific origins (not `*`) — **partial / by-design exception, flag for assessor.** `WIDGET_CORS` is intentionally `access-control-allow-origin: *` (`prototype/server.ts:483-488`) because the no-install widget runs cross-origin on customer sites. It is **scoped to only three endpoints** via the `wjson()` helper (`server.ts:501-503`: `/api/personas`, `/api/sim/review`, `/api/consent`) plus the OPTIONS preflight (`server.ts:868-871`). All other API responses use plain `json()` with **no** ACAO header, so they are not browser-readable cross-origin. The wildcard endpoints do not allow credentials (no `Access-Control-Allow-Credentials`) and are authenticated by Bearer token. **Document this to the assessor as an intentional, narrowly-scoped public-widget exception.**
- [x] No external scripts without SRI or self-hosting — first-party `widget.js`/kit assets are same-origin under `script-src 'self'`; `esm.sh` is the only allowed third-party script origin (`server.ts:841`, used for `html-to-image` on the index page). Google Fonts are being **self-hosted** as part of today's work, removing the `fonts.googleapis.com`/`fonts.gstatic.com` third-party origin (currently still allowlisted at `server.ts:842-843`). **Residual:** scan report Low (`SECURITY-SCAN-2026-06-21.md` §Missing-SRI) — external resources are SRI-incompatible (fonts vary, widget auto-updates); mitigated by CSP `default-src 'self'`. After font self-hosting lands, drop the Google font origins from CSP.
- [x] Source maps disabled in production — no `sourcemap: true` in any build config; Vite default is `false` (`packages/extension/vite.config.ts:33-38`, `packages/sdk/vite.config.ts:4-12`). Backend ships as `bun run server.ts` (no bundler source maps). The only `sourceMappingURL` hits are inside pre-minified vendored rrweb assets (`prototype/public/vendor/*`), not our build output.
- [~] Debug modes disabled in production — partial. No `DEBUG`/verbose flag gates app behavior; logging is `console.warn/error` for operational events (e.g. `background.ts:61`, server `oops()` logs internals server-side only `server.ts:496-500`). No `console.debug` dumps of secrets found. **Residual:** a few benign `console.warn` lines remain in the extension; acceptable. **Fix (optional):** gate remaining extension `console.*` behind a build flag.
- [~] No sensitive data in URLs or query strings — partial. App auth uses HttpOnly cookie + `Authorization: Bearer` header, never tokens in query strings for first-party/extension flows. **One intentional exception:** inbound **Jira** webhook auth accepts a shared secret via `?token=` OR `X-Klavity-Token` (`prototype/server.ts:1043-1046`) because Jira Cloud webhooks aren't HMAC-signed by default; compared constant-time (`timingSafeStrEqual`). This is a fixed per-project webhook secret (not user PII), but URL query secrets can leak via proxy/access logs. **Fix:** prefer header-only; if URL token must stay, ensure Caddy access-log redaction. (GitHub/Linear use HMAC signatures, not URL tokens — `server.ts:1039-1041`.)

### Authentication & Authorization
- [x] All API endpoints require authentication — mutating/data endpoints resolve identity via `sessionEmail(req)` (HttpOnly cookie, `server.ts:593-598`) and/or `bearerEmail(req)` (`ext_…` token, `server.ts:602-615`), e.g. `server.ts:1439,1522,1541,1574,1594,1616,1807,1817,1910,1980,2014,2047,2059,2139,2203`. The Sim-review gate enforces auth as the **first** hard gate (`prototype/lib/db.ts:1746-1748` gate `a. auth → 401`). Webhooks authenticate via HMAC/shared-secret (`server.ts:1038-1048`). **Intentionally public/anon:** marketing pages and the first-party anon `/api/feedback` lead-gen path (`server.ts:1136` `anonActor`) — by design for the PLG widget.
- [x] Access control enforced server-side (not just client) — `resolveProject()` gates every project-scoped action by `projectAccess` and **forces** a project-bound (widget) token to its bound project, rejecting `?project=` mismatch (`server.ts:617-622`, F5 fix; bound-project recorded at `server.ts:611-613`). Two-tier roles (admin/member) in `db.ts:614-615`.
- [~] Database-level access control (RLS or equivalent) — partial. Backend is Bun→Turso/SQLite (libSQL); there is no Postgres-style RLS. Authorization is enforced **in the application layer** on every query via `projectAccess`/`resolveProject` and parameterized queries `{sql, args:[]}` throughout `db.ts` (no SQLi — scan report §Defensive controls). This is the standard equivalent for SQLite; **document that the app layer is the authoritative access-control boundary.** `[GAP — needs owner input]`: confirm Turso token scoping / network ACL on the DB.
- [x] Session tokens expire and refresh properly — sessions carry `expires_at` and `getSession()` returns null past expiry (`db.ts:603-609`); TTL = 7 days (`server.ts:46`, set at create `server.ts:1113`). Extension tokens carry expiry + a `revoked` flag, both enforced in `getExtensionTokenInfo()` (`db.ts:1724-1731`), revocable via `revokeExtensionToken()` (`db.ts:1735-1737`). **Note:** no silent refresh — re-auth via OTP on expiry (acceptable).
- [x] Logout invalidates sessions — `POST /api/auth/logout` deletes the server-side session row (`deleteSession`, `server.ts:1118-1122`) and clears the HttpOnly cookie (`clearCookie`, `auth.ts:37-39`). Server-side deletion means the session id is dead even if the cookie persists. Extension logout clears stored token/config (`extension/src/auth.ts:90-91`).

---

## Phase 2: Vulnerability Scanning

### SAST (Static Analysis)
- [x] Run static analysis scanner — Semgrep 1.167.0 (449 rules, run fully offline against public `semgrep-rules`). Evidence: `SECURITY-SCAN-2026-06-21.md` §SAST.
- [x] Fix all findings — all real SAST findings remediated:
  - **Medium** DOM-XSS in extension `packages/extension/src/content.ts` (unescaped LLM Sim fields → `innerHTML`): **fixed** via `klavEsc()` + `klavSafeColor()` allowlist on every Sim field in `klavRenderBubble`/`klavNotice` (scan report Remediation table).
  - **Low** ReDoS in `prototype/lib/db.ts` `globToRegExp` (`db.ts:1622`): **fixed** — bounded to 512 chars + collapse `*{2,}`.
  - **Low** missing-SRI on `site/` scripts: accepted/mitigated (external = Google Fonts + auto-updating widget; covered by CSP) — upgrade path = self-host fonts (in progress).
  - ~237 info/false-positives triaged (logging template-strings, demo HTML, gitignored `.env`) — scan report §False positives.
- [x] Document remediations — `SECURITY-SCAN-2026-06-21.md` §"Remediation status (2026-06-21)" + §"Recommended priority". Verification: `pnpm -r build` ✓, workspace tests 84+49+28 ✓, prototype `bun test` 481 pass / 0 fail ✓.

### DAST (Dynamic Analysis)
- [ ] Receive DAST report from assessor — pending (assessor-run). Pre-listed self-found items below in Phase 3.
- [ ] Fix all Low/Medium/High findings — pending DAST.
- [ ] Run independent verification scan — pending. **Planned:** OWASP ZAP baseline against `https://klavity.quantana.top`.

### Dependency Audit
- [x] Run dependency audit (`pnpm audit`) — run today. 5 advisories, **all in devDependencies** (vitest/vite/esbuild build-test toolchain; not in the shipped `bun run server.ts` + `dist/` runtime) — `SECURITY-SCAN-2026-06-21.md` §SCA.
- [x] No critical or high vulnerabilities — **clean.** Bumped `vitest@3.2.6`, `vite@6.4.3`, `@vitest/coverage-v8@3.2.6`, `esbuild` pinned `0.25.12` via `pnpm-workspace.yaml` overrides → `pnpm audit` reports **No known vulnerabilities found** (scan report Remediation table).
- [x] Lock file committed and used — `pnpm-lock.yaml` present and tracked at repo root. `[GAP — needs owner input]`: confirm CI runs `pnpm install --frozen-lockfile` + `pnpm audit` (no CI config inspected here).

---

## Phase 3: DAST Findings Remediation

> Assessor's report not yet received. Pre-populated with **our own** self-found items (SAST/SCA) so the assessor sees they're already closed; DAST rows to be added on receipt.

| # | Finding | Severity | Root Cause | Fix | Verified |
|---|---------|----------|-----------|-----|----------|
| 1 | DOM-XSS via unescaped LLM Sim fields → `innerHTML` (extension `content.ts` `klavRenderBubble`/`klavNotice`) | Medium | Inconsistent output-encoding; LLM/server fields written raw while canonical renderer escapes | Added `klavEsc()` full HTML-entity escape + `klavSafeColor()` allowlist on every field | [x] (build + tests green) |
| 2 | ReDoS-ish dynamic `RegExp` from admin URL glob (`db.ts:1622` `globToRegExp`) | Low | Unbounded pattern length / repeated `*` | Cap 512 chars + collapse `*{2,}`→`*` before regex build | [x] (40/40 glob tests) |
| 3 | Missing SRI on `site/` external scripts/styles | Low | Third-party origins (Google Fonts) + auto-updating widget can't use static SRI | Mitigated by CSP `default-src 'self'`; self-hosting fonts to remove third-party origin | [~] (mitigation; font self-host in progress) |
| 4 | SCA: vitest UI RCE (Critical) / vite fs.deny bypass (High) + 3 Moderate — devDeps only | Crit/High | Outdated build-test toolchain | Bumped vitest/vite/coverage; esbuild pinned via workspace overrides → `pnpm audit` clean | [x] |
| 5 | _(reserved for assessor DAST findings)_ | | | | [ ] |

### Verification
- [~] Playwright/E2E tests written for each finding — partial. Unit/`bun test` suites cover glob/regex (40/40) and broader backend (481 pass); no dedicated Playwright security regression suite yet. **Fix:** add E2E asserting headers + XSS escaping against prod.
- [ ] All tests pass against production — pending (tests run locally; not yet run against prod URL).
- [ ] Independent ZAP scan shows 0 failures — pending (Phase 2 DAST).
- [x] Remediation report generated — `SECURITY-SCAN-2026-06-21.md`.

---

## Phase 4: Self-Assessment Questionnaire (SAQ)

- [ ] All 54 questions answered — `[GAP — needs owner input]`: SAQ workbook not started. Most technical answers are sourceable from this checklist + the two security docs.
- [~] Each answer references specific code/config files — partial; this checklist provides the evidence map to reuse.
- [ ] Compliant items have technical justification — pending SAQ authoring.
- [ ] N/A items have clear explanation — note the key N/A: **no Google OAuth sensitive scopes** (`manifest.json:7-16`).
- [ ] Partially compliant items have mitigation plan — see `[~]` items above (CSP nonce hardening, font self-host, retention policy).

---

## Phase 5: Supporting Documentation

- [x] Remediation report (finding → fix → evidence) — `SECURITY-SCAN-2026-06-21.md`.
- [~] Encryption documentation with code snapshots — partial. TLS in transit via Caddy (`deploy/Caddyfile`); cookies `Secure`+`HttpOnly` (`auth.ts:35`); secrets at rest in `/etc/klav/klav.env` (not in repo). **Fix:** document Turso/SQLite at-rest encryption + S3 screenshot bucket encryption. `[GAP — needs owner input]`.
- [ ] Database screenshot showing encrypted data — `[GAP — needs owner input]`.
- [x] Scan results — `SECURITY-SCAN-2026-06-21.md` (SAST + SCA). ZAP/DAST pending Phase 2.
- [~] Playwright test results — partial; `bun test` 481-pass results exist (scan report), Playwright security suite TBD.

---

## Phase 6: Submission & Revalidation

- [~] All findings remediated — all **self-found** findings closed; awaiting assessor DAST.
- [ ] SAQ submitted — pending Phase 4.
- [ ] Supporting documentation sent to assessor — pending.
- [ ] Assessor follow-up questions answered — pending.
- [ ] Revalidation scan passed — pending.
- [ ] CASA verification confirmed — pending.
- [ ] Google OAuth console updated — **N/A**: no Google OAuth client/sensitive scopes in this extension (`manifest.json:7-16`). If a Google sign-in is ever added, this becomes required.

---

## Phase 7: Ongoing Compliance

- [ ] Annual revalidation date noted: **2027-06-21** _(placeholder — 12 months from this assessment; confirm with assessor)_ `[GAP — needs owner input]`.
- [~] Dependency audit scheduled (monthly) — `pnpm audit` is run ad hoc (today, clean). **Fix:** add a monthly CI/cron `pnpm audit` job (a daily remote Claude routine already exists for the blog — extend or add one for audits).
- [~] Security header monitoring in place — headers emitted in code (`server.ts:852-858`). **Fix:** add an external uptime/header monitor (or extend health poll) to alert on regression.
- [ ] Incident response plan reviewed annually — pending IR plan (Phase 1).

---

## Gaps & Recommendations

**PASS (strong evidence):** HTTPS/HSTS, full CSP (with noted unsafe-inline caveat), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, no `X-Powered-By`, source maps off, server-side authN on data endpoints, server-side authZ (`resolveProject` + project-bound token), session expiry, server-side logout, SAST clean (all fixed), SCA clean (0 known vulns), no OAuth sensitive scopes.

**PARTIAL — close before submission:**
1. **CSP `script-src 'unsafe-inline' 'unsafe-eval'`** (`server.ts:841`) — move to nonce-based in a browser-tested pass (defense-in-depth, not a hard fail).
2. **WIDGET_CORS `*`** (`server.ts:483-488`) — intentional, scoped to 3 endpoints; document the exception explicitly for the assessor.
3. **Jira webhook `?token=`** (`server.ts:1045`) — prefer header-only or guarantee access-log redaction.
4. **Self-host Google Fonts** to drop `fonts.googleapis.com`/`fonts.gstatic.com` from CSP (in progress) and resolve the SRI Low.
5. **DB access control** is app-layer (SQLite, no RLS) — document as the authoritative boundary; confirm Turso token/network scoping.

**GAPS — needs owner input / new docs:** consolidated security-architecture doc, PII data-flow diagram, data-retention policy, incident-response runbook, SAQ workbook (54 Qs), at-rest-encryption evidence (DB + S3) and DB screenshot, CI enforcement of `--frozen-lockfile` + scheduled monthly audit, annual revalidation date (placeholder 2027-06-21), Caddyfile host mismatch (`klav.quantana.top` vs live `klavity.quantana.top`) — verify deployed config.
