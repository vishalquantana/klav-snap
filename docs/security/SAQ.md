# CASA Tier 2 — Self-Assessment Questionnaire (SAQ)

**Product:** Klavity Snap (backend `prototype/server.ts`, Bun; Turso DB; S3;
OpenRouter; SendGrid; Plane/Jira/GitHub/Linear connectors).
**Framework:** Google CASA Tier 2 (OWASP ASVS 5.0-aligned). This is a thorough
control-family skeleton, not the verbatim 54-question Google list; each control is
answered **Compliant / Partial / N/A** with one-line `file:line` or doc evidence.
Unknowns are marked `[GAP — needs owner input]`.

See also: `SECURITY-ARCHITECTURE.md`, `PII-DATA-FLOW.md`, `ENCRYPTION-AT-REST.md`,
`CASA-TIER-2-CHECKLIST.md`, `DATA-RETENTION-POLICY.md`,
`INCIDENT-RESPONSE-PLAN.md`, `SECRET-ROTATION.md`.

## A. Architecture, Design & Threat Modeling

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| A1 | Documented security architecture exists | Compliant | `docs/security/SECURITY-ARCHITECTURE.md` |
| A2 | Data-flow / PII inventory maintained | Compliant | `docs/security/PII-DATA-FLOW.md` |
| A3 | Threat model covering top risks | Partial | OWASP sweep done (memory: v0.22.0–v0.29.1); formal STRIDE doc `[GAP]` |

## B. Authentication

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| B1 | Email OTP login; codes are single-use + time-limited | Compliant | `db.ts:590-594` (10-min expiry, `used` flag) |
| B2 | OTP codes not stored in recoverable form | Compliant | sha256-hashed before storage, never raw (`db.ts:587-594`, `crypto.ts:36-37`) |
| B3 | OTP codes generated with a CSPRNG | Compliant | `crypto.getRandomValues` (`lib/auth.ts:11`) |
| B4 | Brute-force throttling on auth | Compliant | per-process rate limiter on OTP (`server.ts:763`, `lib/ratelimit.ts`) |
| B5 | Login allowlist (domain/email) supported | Compliant | `emailAllowed` (`lib/auth.ts:17-18`) |
| B6 | Dev OTP-echo disabled in prod | Compliant (config) | gated by `KLAV_DEV_SHOW_OTP` (`server.ts:41`); must be unset in prod |
| B7 | MFA | N/A | OTP-to-email is the single factor; no password to add 2FA to |

## C. Session & Token Management

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| C1 | Sessions are random bearer tokens | Compliant | random session id (`createSession`, `db.ts:600-601`) |
| C2 | Session expiry enforced | Compliant | `expires_at` checked on lookup (`db.ts:604-607`) |
| C3 | Logout invalidates session | Compliant | `deleteSession` (`db.ts:610-612`, `server.ts:1118-1121`) |
| C4 | Extension/widget tokens revocable + scoped | Compliant | `revoked` flag + project scope (`db.ts:200-202`, `db.ts:1725-1736`) |
| C5 | Cookies set secure/httpOnly | Partial | secure attrs gated by `SECURE` flag — verify prod sets it `[GAP — confirm]` |
| C6 | Expired sessions/tokens purged | Partial | read-rejected but not swept; pending `lib/retention.ts` (DATA-RETENTION-POLICY.md) |

## D. Access Control / Authorization

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| D1 | Tenant data is project-scoped | Compliant | queries scoped by `project_id` (e.g. `server.ts:404`, `db.ts:227,1859`) |
| D2 | Widget-token writes scoped to their project | Compliant | AsyncLocalStorage project-scoping (memory: F5 fix, v0.29.x) |
| D3 | Admin/ops routes gated | Compliant | `isOpsAdmin` returns 404 to others (`server.ts:2111,2123`; `lib/auth.ts:30`) |
| D4 | IDOR protections on object reads | Compliant | citation-IDOR fix (memory: v0.22.0+); `id=? AND project_id=?` patterns |
| D5 | Deny-by-default on unmatched routes | Partial | verify catch-all returns 404/403 not data `[GAP — confirm]` |

## E. Input Validation & Output Encoding

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| E1 | Request body size caps | Compliant | 128KB cap (`server.ts:1018`); transcript/AI-demo caps (`server.ts:1842,2939,2954,2965`) |
| E2 | Parameterized SQL (no string-built queries) | Compliant | all queries use `{sql, args}` bound params (e.g. `db.ts:590,594,604`) |
| E3 | SSRF protection on outbound fetch | Compliant | `lib/safe-fetch.ts`, `lib/url-guard.ts`, `lib/connectors/guard.ts` |
| E4 | Prompt-injection / LLM input hardening | Partial | `lib/prompt-safety.ts` exists; coverage of all AI paths `[GAP — confirm]` |
| E5 | Output encoding / XSS defense | Partial | API is JSON; server-rendered HTML escaping `[GAP — confirm]` |

## F. Cryptography

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| F1 | Secrets encrypted at rest | Compliant | AES-GCM-256 for connector secrets (`lib/crypto.ts:20-31`, ENCRYPTION-AT-REST.md) |
| F2 | Strong, vetted algorithms only | Compliant | WebCrypto AES-GCM + SHA-256 (`crypto.ts`) |
| F3 | Unique IV per encryption | Compliant | random 12-byte IV per call (`crypto.ts:21`) |
| F4 | Keys sourced from env, not hardcoded | Compliant | `KLAV_SECRET` from env, 32-byte check (`crypto.ts:8-13`) |
| F5 | TLS in transit | Compliant | Caddy TLS + HSTS in prod (`server.ts:862`) |
| F6 | Documented key rotation | Compliant | `SECRET-ROTATION.md` (incl. KLAV_SECRET re-encrypt migration) |

## G. Data Protection & Privacy

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| G1 | Data retention policy defined | Compliant (policy) / Partial (enforcement) | `DATA-RETENTION-POLICY.md`; sweep pending `lib/retention.ts` |
| G2 | Screenshots stored private (not public) | Compliant | private upload + presigned GET (`s3.ts:35`, `server.ts:1216-1217`) |
| G3 | GDPR subject rights (access/erasure/portability) | `[GAP]` | no erasure/export/account-delete endpoints (PII-DATA-FLOW.md §6) |
| G4 | Consent captured for monitoring | Partial | per-member consent enforced (`db.ts:190-193`, `server.ts:1646-1662`); not for transcript subjects / leads |
| G5 | Sub-processor disclosure | `[GAP]` | SendGrid/OpenRouter/S3/Turso disclosure (PII-DATA-FLOW.md §4) |

## H. Logging, Monitoring & Error Handling

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| H1 | Errors logged server-side; generic to client | Compliant | `oops()` correlation id, generic client message (`server.ts:498-501`) |
| H2 | No secrets/PII leaked in error responses | Compliant | client gets only `{error, id}` (`server.ts:500-501`) |
| H3 | AI cost/usage ledger for anomaly detection | Compliant | `ai_calls` ledger (`db.ts:206-211`), `/opsadmin` dashboard |
| H4 | Centralized log retention / alerting | `[GAP]` | systemd/Caddy logs only; no aggregation/alerting evidenced |

## I. HTTP Security Headers

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| I1 | Content-Security-Policy set | Compliant | `server.ts:861` (CSP; esm.sh allowed per memory) |
| I2 | X-Frame-Options / clickjacking | Compliant | `DENY` (`server.ts:858`) |
| I3 | X-Content-Type-Options nosniff | Compliant | `server.ts:859` |
| I4 | HSTS in prod | Compliant | `server.ts:862` (when `SECURE`) |

## J. Rate Limiting / Resource Abuse

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| J1 | Auth + AI endpoints rate-limited | Compliant | `lib/ratelimit.ts` wired in `server.ts:15,763` (memory: AI rate+size caps v0.29.x) |
| J2 | AI spend cap | Partial | `OPS_DAILY_CAP_USD` display + atomic cost-cap (memory: v0.29.x); OpenRouter enforces real cap |
| J3 | Distributed/persistent rate-limit state | Partial | limiter is per-process (`ratelimit.ts`) — resets on restart, not shared across instances |

## K. Dependency & Supply-Chain Management

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| K1 | Pinned dependencies via lockfile | Compliant | `prototype/bun.lock`, `pnpm-lock.yaml` |
| K2 | Automated dependency vulnerability scanning | `[GAP]` | no Dependabot/audit-in-CI evidenced `[GAP — confirm CI]` |
| K3 | Recent security scan recorded | Compliant | `SECURITY-SCAN-2026-06-21.md` (repo root) |

## L. Secrets Management

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| L1 | Secrets in env file, not source | Compliant | `/etc/klav/klav.env`, `chmod 600` (deploy/klav.env.example header) |
| L2 | `.env` excluded from VCS | Partial | confirm `.gitignore` covers `.env` `[GAP — confirm]` |
| L3 | Rotation runbook exists | Compliant | `SECRET-ROTATION.md` |

## M. Incident Response

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| M1 | Documented IR plan | Compliant | `INCIDENT-RESPONSE-PLAN.md` |
| M2 | Breach-notification process (GDPR 72h) | Compliant (documented) | `INCIDENT-RESPONSE-PLAN.md` §5 |
| M3 | Named IR roles + contacts | `[GAP]` | role/contact placeholders unfilled (IR plan §1, §7) |
| M4 | Tabletop / drill cadence | `[GAP]` | annual exercise defined but not yet run (IR plan §8) |

## Summary of open GAPs

- GDPR subject-rights endpoints (access/erasure/portability) — none exist (G3).
- Retention enforcement — policy written, sweep (`lib/retention.ts`) not yet shipped (G1, C6).
- Operational ownership — IR roles/contacts, DPO, sub-processor disclosure, dep-scan CI, log alerting all need owner input (A3, G5, H4, K2, M3, M4).
