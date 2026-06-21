# Security Architecture — Klavity Snap

> Prepared for Google CASA Tier 2. Every claim is cited to `file:line` in this repository
> as of the documented review. Where the code does not establish a control, the item is
> marked `[GAP — needs owner input]` and listed in **Gaps & Recommendations**.

---

## 1. Application Overview

**Application Name:** Klavity Snap (Klavity — AI Bug Reporter & Feedback)
**Description:** One-click, AI-assisted bug/feedback reporter. A Chrome MV3 extension and an
embeddable JavaScript widget capture page reports (screenshots, console/network context, optional
rrweb session replay); a Bun backend stores them, runs LLM-based "Sim" reviews, and can copy tickets
to external trackers (Plane/Jira/GitHub/Linear).
**Production URL:** https://klavity.quantana.top
**API URL:** Same origin — `https://klavity.quantana.top/api/*` (no separate API host).
The Chrome extension is published as MV3 (`packages/extension/manifest.json:1-57`).

The backend is a single Bun HTTP process (`prototype/server.ts`) fronted by Caddy on a Vultr host.
No Google OAuth scopes are requested anywhere (see `packages/extension/manifest.json:7-22` — no
`oauth2` block, no Google host permissions).

## 2. Architecture Diagram

```
                         TLS 1.2/1.3 (Let's Encrypt, auto via Caddy)
  ┌───────────────┐      ┌──────────────────────┐
  │ Browser (dash)│──────┤                      │
  │ Chrome ext MV3│──────┤  Caddy reverse proxy │   reverse_proxy 127.0.0.1:4317
  │ Embed widget  │──────┤  klav.quantana.top   │   (deploy/Caddyfile:1-13)
  └───────────────┘      └──────────┬───────────┘
                                    │ loopback HTTP (same box)
                                    ▼
                         ┌──────────────────────┐
                         │  Bun server.ts        │  port 4317, single process
                         │  (klav.service)       │  (deploy/klav.service:5-13)
                         └─────┬───────────┬─────┘
                               │           │
        libSQL/Turso (TLS)     │           │  outbound HTTPS only, SSRF-guarded
                               ▼           ▼
                   ┌────────────────┐   ┌──────────────────────────────────────┐
                   │ Turso / SQLite │   │ External services:                    │
                   │ (lib/db.ts)    │   │  • OpenRouter  (LLM)                   │
                   └────────────────┘   │  • SendGrid    (OTP + lead email)     │
                                        │  • S3-compatible object store (Bun S3)│
                                        │  • Plane / Jira / GitHub / Linear     │
                                        │    (connector copy-to-external)       │
                                        └──────────────────────────────────────┘
```

- Browser/extension/widget → Caddy: `deploy/Caddyfile:1-13` (TLS termination + zstd/gzip).
- Caddy → Bun: loopback `127.0.0.1:4317` (`deploy/Caddyfile:12`, `prototype/server.ts:38`).
- Bun → Turso: libSQL client created from `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`
  (`prototype/lib/db.ts:5-7`).
- Bun → external APIs: OpenRouter (`prototype/server.ts:42`), SendGrid (`prototype/lib/mail.ts:6`),
  S3 (`prototype/lib/s3.ts:1-23`), connectors (`prototype/lib/connectors/`).

## 3. Trust Boundaries

| # | Boundary | From | To | Controls (cited) |
|---|----------|------|----|------------------|
| 1 | Internet → Caddy | Untrusted | Edge/TLS | TLS termination + compression (`deploy/Caddyfile:1-13`). HSTS added by app on HTTPS (`prototype/server.ts:857`). Optional Caddy `basic_auth` is **commented out** (`deploy/Caddyfile:8-10`). |
| 2 | Caddy → Bun | Edge | App | Loopback-only upstream `127.0.0.1:4317` (`deploy/Caddyfile:12`). App trusts `X-Forwarded-For` only when the socket peer is loopback/RFC1918 (`prototype/server.ts:799-831`), preventing XFF spoofing of rate-limit/lockout keys. |
| 3 | App → DB | App | Data | libSQL client over the Turso URL with auth token (`prototype/lib/db.ts:5-7`). All queries are parameterized (`db!.execute({ sql, args })`, e.g. `prototype/lib/db.ts:589-611`). Tenant scoping enforced in queries (see §5). |
| 4 | App → External APIs | App | Third-party | Central SSRF guard for all user-influenced outbound URLs: HTTPS-only, no credentials-in-URL, blocks loopback/RFC1918/link-local/cloud-metadata, resolves DNS and checks every A/AAAA record (`prototype/lib/url-guard.ts:15-176`). Connectors route through `guardConnectorUrl` (`prototype/lib/connectors/guard.ts:36-46`). Per-service API keys from env (§8). |
| 5 | Extension → Backend | Semi-trusted client | App | `Authorization: Bearer ext_…` dedicated, revocable extension tokens; raw session id is **not** accepted as a Bearer (`prototype/server.ts:599-615`). Tokens stored in `extension_tokens` with expiry + revoke (`prototype/lib/db.ts:1708-1737`). |
| 6 | Widget → Backend | Untrusted/cross-origin | App | CORS open for widget endpoints (`prototype/server.ts:483-488`); project-bound widget tokens constrained via AsyncLocalStorage so a leaked token cannot reach other projects (`prototype/server.ts:611-628`); anonymous `/api/feedback` rate-limited per IP (`prototype/server.ts:1141`, `:783-785`). |

## 4. Authentication Flow

Passwordless **email OTP** → server-side session cookie. Extension/widget use separate Bearer tokens.

```
1. POST /api/auth/request {email}
   - rate-limited per-email (5/15min) AND per-IP (30/15min)   (server.ts:1069, :760-762)
   - access-list check: emailAllowed() OR existing membership  (server.ts:1071-1072; auth.ts:16-24)
   - generate 6-digit OTP, store single-live code, 10-min TTL  (server.ts:1073-1074; db.ts:583-588)
   - email via SendGrid; code never logged unless DEV flag set (server.ts:1076-1077; mail.ts:2-20)

2. POST /api/auth/verify {email, code}
   - brute-force lockout: per-(email,IP) max 5, per-email max 10 wrong codes (server.ts:1089-1097, :764-770)
   - verifyOtp() consumes the code single-use (db.ts:589-594)
   - upsert user, ensureAccount(), mint session id = token() (32 random bytes) (server.ts:1106-1113; auth.ts:3-7)
   - createSession with 7-day expiry stored in `sessions` table (server.ts:1113; db.ts:600-601)
   - Set-Cookie klav_session: HttpOnly; SameSite=Lax; Secure(on HTTPS) (server.ts:1115; auth.ts:34-35)

3. Subsequent first-party requests:
   - sessionEmail(): read klav_session cookie → getSession() validates expiry (server.ts:593-598; db.ts:603-609)

4. Extension/widget requests:
   - bearerEmail(): Authorization: Bearer ext_… → getExtensionTokenInfo() (server.ts:599-615; db.ts:1724-1731)
   - widget token is project-bound; bound project recorded in AsyncLocalStorage (server.ts:611-613)

5. Logout:
   - POST /api/auth/logout → deleteSession() + clear cookie (server.ts:1118-1121; db.ts:610-611)
```

**Token specifics (from code):**
- Session id: `token()` = 32 cryptographically random bytes (`crypto.getRandomValues`) hex-encoded =
  256-bit entropy (`prototype/lib/auth.ts:3-7`). Stored server-side in `sessions`
  (`prototype/lib/db.ts:40`, `:600-601`); 7-day lifetime (`prototype/server.ts:46`, `:1113`).
- OTP: 6-digit numeric via `crypto.getRandomValues` (`prototype/lib/auth.ts:10-13`); single live code
  per email — prior unused codes retired on issue (`prototype/lib/db.ts:584-588`); single-use on verify
  (`prototype/lib/db.ts:589-594`); 10-minute TTL (`prototype/server.ts:1074`).
- Extension token: `ext_` + two UUIDs (~256-bit), with `email`, optional `project_id`, `expires_at`,
  `revoked` (`prototype/lib/db.ts:1710-1719`). Resolution honors revoke + expiry
  (`prototype/lib/db.ts:1724-1731`). Issued with the same 7-day TTL as sessions
  (`prototype/server.ts:1533`, `:1565`).
- Storage: session cookie is **HttpOnly** (not readable by JS); cookie also `SameSite=Lax` and `Secure`
  in production (`prototype/lib/auth.ts:34-35`, `SECURE` at `prototype/server.ts:40`).

**Invalidation:** logout deletes the session row (`prototype/lib/db.ts:610-611`); expired sessions fail
`getSession` (`prototype/lib/db.ts:606-608`); extension/widget tokens are revocable
(`revokeExtensionToken`, `prototype/lib/db.ts:1735-1737`). `[GAP]` There is no "log out all sessions" /
bulk-revoke endpoint and no rotation of an active session id.

## 5. Authorization Model

| Layer | Mechanism | Description (cited) |
|-------|-----------|---------------------|
| API / route | Auth resolve then `projectAccess` | Each protected route resolves caller via `sessionEmail() || bearerEmail()` then gates on a project (e.g. `prototype/server.ts:1439`, `:1574`, `:1807`). |
| Account/Project RBAC | Effective role = max(account, project) | `projectAccess()` returns `admin`/`member`/`null`; account owner/admin ⇒ implicit project-admin; account member with no explicit project row sees nothing (`prototype/lib/db.ts:773-783`). |
| Project visibility | Scoped SELECTs | `listProjects()` returns only projects in the caller's accounts or with an explicit `project_members` row (`prototype/lib/db.ts:698-707`). |
| Widget-token scoping | AsyncLocalStorage bound-project | A project-bound Bearer records `boundProject`; `resolveProject()` rejects a mismatched `?project=` and forces the bound project, so a leaked widget token cannot reach the owner's other projects (`prototype/server.ts:611-628`). Per-request store established at `prototype/server.ts:23`, `:3023`. |
| Citation IDOR (A01) | Cross-tenant guard on sim_id | Attacker-supplied `sim_id` is verified to belong to the project before any trait/citation read; otherwise treated as ephemeral (`simId=null`) so no cross-tenant trait read occurs (`prototype/server.ts:1246-1250`). `resolveCitations` is also project-scoped (`prototype/server.ts:1264`, helper `:375-376`). |
| Ops admin | Fail-closed allowlist | `/opsadmin` gated by `isOpsAdmin()` against `OPS_ADMIN_EMAILS`; empty/unset ⇒ nobody qualifies (`prototype/lib/auth.ts:26-32`). |
| Ticket export | Admin-only | `POST /api/feedback/:id/export` is admin-only; `PATCH /api/feedback/:id` allowed to any project member (`prototype/server.ts:2554`, `:2570`). |
| Storage (S3) | Per-object ACL + presigned GET | **All screenshots stored `private`** (default since 2026-06-21, `prototype/lib/s3.ts:35`); served only via short-lived presigned GET after a membership check (`/api/screenshots/:id`, `prototype/server.ts:1598-1615`). External tracker tickets embed a 7-day presigned URL (`server.ts:1216-1217`). See ENCRYPTION-AT-REST.md. |

`[GAP]` Authorization is enforced per-route in handler code rather than via a single central middleware,
so coverage relies on each route correctly calling `projectAccess`. A consolidated authz middleware /
audit would reduce the risk of a future route omitting the check.

## 6. Data Protection

### Encryption in Transit

| Connection | Protocol (cited) |
|------------|------------------|
| User/extension/widget → App | TLS via Caddy (Let's Encrypt automatic HTTPS) (`deploy/Caddyfile:1-13`); HSTS `max-age=31536000; includeSubDomains` set by app on HTTPS (`prototype/server.ts:857`). |
| Caddy → Bun | Plaintext HTTP over loopback `127.0.0.1` on the same host (`deploy/Caddyfile:12`) — not exposed off-box. |
| App → Turso | libSQL client over the configured `TURSO_DATABASE_URL` (Turso uses `libsql://`/HTTPS in production) (`prototype/lib/db.ts:5-7`). `[GAP]` Production URL scheme not pinned in repo; confirm `libsql://`/TLS in `/etc/klav/klav.env`. |
| App → External APIs | HTTPS only — outbound URLs forced to `https:` by the SSRF guard (`prototype/lib/url-guard.ts:26-28`); OpenRouter/SendGrid/S3 endpoints are HTTPS (`prototype/server.ts:42`, `prototype/lib/mail.ts:6`). |

### Encryption at Rest

| Data Category | Method (cited) | Key Management |
|---------------|----------------|----------------|
| Connector / integration secrets (Plane/Jira/etc. tokens, inbound webhook secrets) | **AES-GCM-256** application-layer encryption before storage; ciphertext as `iv:ct` (`prototype/lib/crypto.ts:1-31`); written via `encryptSecret`/`decryptSecret` (`prototype/server.ts:11`, `:1026`, `:1183`, `:1346`) | Key from env `KLAV_SECRET` (base64, 32 bytes); imported as non-extractable `CryptoKey` (`prototype/lib/crypto.ts:6-15`). |
| DB rows (users, sessions, feedback, transcripts, screenshots metadata) | Stored in Turso/SQLite; **no application-level encryption** of general rows. Disk-level encryption depends on the Turso platform / host volume — not established in repo. `[GAP]` | Platform-managed (Turso) — confirm with provider. |
| S3 object payloads (screenshots, replays) | All objects now **`private`** (`s3.ts:35`); **no application-level encryption** of payloads. Bucket/server-side encryption (SSE) is provider config, not in repo. `[GAP — enable/confirm SSE]` | Provider/bucket policy — confirm SSE on the bucket. See ENCRYPTION-AT-REST.md §3. |

Application does not log live OTP codes in normal operation (`prototype/server.ts:1076-1077`) and never
echoes internal exceptions to clients — generic error + correlation id only (`prototype/server.ts:493-500`).

## 7. Security Headers

Applied to **every** response via `withSecurityHeaders` (`prototype/server.ts:859-862`); values from
`CSP`/`SEC_HEADERS` (`prototype/server.ts:839-858`).

| Header | Value |
|--------|-------|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` (only when serving HTTPS / `SECURE`) (`prototype/server.ts:857`) |
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://esm.sh; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'` (`prototype/server.ts:839-851`) |
| X-Content-Type-Options | `nosniff` (`prototype/server.ts:854`) |
| X-Frame-Options | `DENY` (`prototype/server.ts:853`) |
| Referrer-Policy | `strict-origin-when-cross-origin` (`prototype/server.ts:855`) |

**Known weakness (acknowledged in code):** `script-src` includes `'unsafe-inline'` and `'unsafe-eval'`
(plus `blob:` and `https://esm.sh`), which weakens XSS defense. The code comment states the intent to
"Tighten script-src to nonces in a later, browser-tested pass" (`prototype/server.ts:838`, value at
`:841`). `frame-ancestors 'none'`, `object-src 'none'`, and `base-uri 'self'` are in place. CORS for
widget endpoints is `Access-Control-Allow-Origin: *` (`prototype/server.ts:483-488`) — intentional for
the cross-origin widget, mitigated by token scoping (§5) and per-IP rate limits.

## 8. External Services & Integrations

| Service | Purpose | Data Shared | Authentication (cited) |
|---------|---------|-------------|------------------------|
| OpenRouter | LLM inference (Sim persona extraction, screenshot reactions, Trails vision) | Transcript text, screenshots (page images), prompts | API key `OPENROUTER_API_KEY` as Bearer to `https://openrouter.ai/api/v1/...` (`prototype/server.ts:36`, `:42`; key in `deploy/klav.env.example:3`) |
| SendGrid | Transactional email (login OTP, lead alerts) | Recipient email, OTP code, lead details | API key `SENDGRID_API_KEY` as Bearer to `https://api.sendgrid.com/v3/mail/send` (`prototype/lib/mail.ts:2-19`, `:22-44`) |
| S3-compatible object store | Store/serve screenshots and session-replay blobs | Screenshot images, rrweb event blobs | `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` via Bun `S3Client` (`prototype/lib/s3.ts:1-23`); private objects via presigned GET (`prototype/lib/s3.ts:50-52`) |
| Plane | Copy bug tickets to Plane (default connector) | Feedback/bug title, body, citation line | API token, **AES-GCM encrypted at rest**, decrypted at use (`prototype/server.ts:1183`; `prototype/lib/db.ts:546-568`); outbound URL SSRF-guarded (`prototype/lib/connectors/guard.ts`) |
| Jira / GitHub / Linear | Optional copy-to-external connectors | Feedback/bug title + body | Per-connector secret encrypted in `connectors.config` (`prototype/lib/db.ts:223-226`, `:1346`); SSRF-guarded outbound (`prototype/lib/connectors/guard.ts:36-46`). GitHub inbound uses HMAC; Plane inbound uses constant-time secret compare (`prototype/server.ts:504-507`, `:1021-1026`) |

No Google APIs / Google OAuth are used (confirmed by absence in `packages/extension/manifest.json:7-22`).

## 9. Secrets Management

| Secret Type | Storage Location | Access Method (cited) |
|-------------|------------------|------------------------|
| OpenRouter / SendGrid / S3 / Turso / `KLAV_SECRET` / `OPS_ADMIN_EMAILS` | Process environment, loaded from `/etc/klav/klav.env` | systemd `EnvironmentFile=/etc/klav/klav.env` (`deploy/klav.service:9`); read via `process.env.*` (e.g. `prototype/server.ts:36`, `prototype/lib/db.ts:5-6`, `prototype/lib/crypto.ts:8`, `prototype/lib/mail.ts:3`) |
| Encryption key (`KLAV_SECRET`) | Env var (base64 32 bytes) | `process.env.KLAV_SECRET` → non-extractable AES-GCM key (`prototype/lib/crypto.ts:6-15`) |
| Connector / integration tokens | Turso DB, **encrypted** | `encryptSecret`/`decryptSecret` (AES-GCM) (`prototype/lib/crypto.ts:20-31`) |
| Turso DB credentials | Env (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) | `createClient({ url, authToken })` (`prototype/lib/db.ts:5-7`) |

- The example template `deploy/klav.env.example` documents non-secret defaults and placeholders only
  (`OPENROUTER_API_KEY=sk-or-v1-REPLACE_ME`, model, port, `OPS_ADMIN_EMAILS`, `OPS_DAILY_CAP_USD`)
  and instructs `chmod 600`, owned by the `klav` user, "never commit the real one"
  (`deploy/klav.env.example:1-12`).
- `.env` is **gitignored** (`.gitignore:9`), so real secrets are not committed.
- `[GAP]` `deploy/klav.env.example` omits several env vars the code actually requires
  (`KLAV_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SENDGRID_API_KEY`, `AWS_*`, `S3_*`) — the
  example should list every required secret so operators do not miss one.
- `[GAP]` No secret-rotation procedure or secrets manager (Vault/KMS) is evident; secrets live in a
  plaintext env file on the host (mode 600).

## 10. Infrastructure Security

- **Hosting:** Vultr VPS (66.135.20.62), single Bun process behind Caddy
  (`deploy/klav.service`, `deploy/Caddyfile`).
- **TLS / edge:** Caddy with automatic Let's Encrypt HTTPS, `reverse_proxy` to loopback `:4317`
  (`deploy/Caddyfile:1-13`). App adds HSTS + security headers (§7).
- **Service hardening:** systemd unit runs as non-root user `klav`, `NoNewPrivileges=true`,
  `ProtectSystem=full`, `ProtectHome=read-only`, `PrivateTmp=true`, `Restart=always`
  (`deploy/klav.service:5-20`).
- **Deploy flow:** `deploy/deploy.sh` pulls `--ff-only`, runs `bun install --production`, restarts
  `klav.service` (`deploy/deploy.sh:5-29`). Note: when invoked via `su - klav -c`, the service restart
  can be skipped — operators run `systemctl restart klav` as root after deploy (operational note).
- **Dependency management:** pnpm workspace with an enforced single patched **esbuild** override
  `esbuild: "0.25.12"`, closing GHSA-67mh-4wv8-2f99 (dev-server CORS, ≤0.24.2) and
  GHSA-g7r4-m6w7-qqqr (Windows dev-server file read, 0.27.3–0.28.0) (`pnpm-workspace.yaml`,
  `overrides`/`allowBuilds` block). `node_modules`/`dist`/`bun.lock` are gitignored (`.gitignore:1-11`).
  `[GAP]` `pnpm-lock.yaml` presence/commit not confirmed in repo root; confirm a committed lockfile for
  reproducible installs.
- **CI/CD:** `[GAP]` No CI workflows present (`.github/workflows/` is absent). Tests exist
  (`prototype/lib/*.test.ts`, `prototype/server.*.test.ts`) but are not run by an automated pipeline.
- **Branch protection:** `[GAP — needs owner input]` Not evident from repo; GitHub branch-protection
  rules cannot be confirmed from source.
- **Rate limiting / abuse controls:** in-process fixed-window limiter (`prototype/lib/ratelimit.ts`),
  applied to OTP request/verify (`prototype/server.ts:1069`, `:1096`), anonymous feedback
  (`:1141`), LLM/transcript endpoints with size caps (`:772-797`, `:1823`, `:1829`, `:2926-2952`),
  auto-copy flood (`:1329`), and request body caps (e.g. 128 KB inbound at `:1008`). `[GAP]` The limiter
  is per-process in-memory and resets on restart (documented at `prototype/lib/ratelimit.ts:1-9`);
  acceptable for a single instance but not horizontally scalable.

---

## Gaps & Recommendations

1. **Session bulk-revocation / rotation (§4)** — No "logout everywhere" or session-rotation endpoint.
   *Fix:* add an endpoint to delete all `sessions`/`extension_tokens` rows for an email and rotate the
   session id on privilege change.
2. **Centralized authorization (§5)** — Authz is per-route. *Fix:* introduce a single auth/authz
   middleware (resolve identity + `projectAccess`) all protected routes pass through, with a test that
   fails if a route reads project data without it.
3. **Turso URL/TLS not pinned in repo (§6)** — *Fix:* document/verify `libsql://` (TLS) in
   `/etc/klav/klav.env` and assert the scheme at boot.
4. **DB at-rest encryption unconfirmed (§6)** — General rows are not app-encrypted. *Fix:* confirm
   Turso platform encryption (or host-volume encryption) and record the attestation.
5. **S3 at-rest encryption unconfirmed (§6)** — *Fix:* enable bucket-level SSE (e.g. SSE-S3/KMS) and
   document it.
6. **CSP `script-src 'unsafe-inline'`/`'unsafe-eval'` (§7)** — *Fix:* migrate inline scripts to nonces
   and remove `unsafe-eval` (already flagged in code at `prototype/server.ts:838`).
7. **`klav.env.example` incomplete (§9)** — *Fix:* add all required secrets (`KLAV_SECRET`,
   `TURSO_*`, `SENDGRID_API_KEY`, `AWS_*`, `S3_*`) to the example with placeholders.
8. **No secret rotation / manager (§9)** — *Fix:* document a rotation runbook; consider a secrets
   manager (Vault/KMS) over a plaintext env file.
9. **Committed lockfile unconfirmed (§10)** — *Fix:* ensure `pnpm-lock.yaml` is committed for
   reproducible, auditable installs.
10. **No CI pipeline (§10)** — *Fix:* add a GitHub Actions workflow running the existing test suite plus
    `pnpm audit` / dependency review on every PR.
11. **Branch protection unknown (§10)** — *Fix:* enable required reviews + status checks on the default
    branch and record the policy.
12. **In-memory rate limiter (§10)** — single-instance only. *Fix:* move to a shared store (e.g. Turso
    or Redis) before scaling beyond one process.
13. **Deploy restart can be skipped (§10)** — *Fix:* make `deploy.sh` always restart the service (run
    the restart as root) and poll `/health` before reporting success.
