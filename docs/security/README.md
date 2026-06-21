# Klavity Snap — CASA Tier 2 Readiness

**Last updated:** 2026-06-21 · **Target:** Google CASA Tier 2 (driven by the Chrome extension's powerful permissions — `cookies`, `tabs`, `scripting`, optional `<all_urls>`; **no Google OAuth sensitive scopes**).

This folder holds the evidence pack. Every claim is cited to `file:line` in the codebase.

| Doc | Purpose |
|-----|---------|
| [SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md) | Trust boundaries, auth/authz, encryption, headers, infra |
| [PII-DATA-FLOW.md](PII-DATA-FLOW.md) | Every PII field entry→storage→sharing→deletion |
| [PERMISSION-JUSTIFICATION.md](PERMISSION-JUSTIFICATION.md) | Per-permission justification + removal candidates |
| [CASA-TIER-2-CHECKLIST.md](CASA-TIER-2-CHECKLIST.md) | Phase-by-phase tracker with evidence |
| [ENCRYPTION-AT-REST.md](ENCRYPTION-AT-REST.md) | At-rest encryption status per data store + findings |
| [DB-ENCRYPTION-EVIDENCE.md](DB-ENCRYPTION-EVIDENCE.md) | Turso DB at-rest, BYOK, replicas, token scope, attestations (assessor evidence) |
| [../SECURITY-SCAN-2026-06-21.md](../SECURITY-SCAN-2026-06-21.md) | SAST+SCA scan + remediations (feeds Phase 2) |

---

## ✅ Done this session

- **SAST Medium (DOM-XSS)** — extension Sim renderer now HTML-escapes all AI/server fields (`content.ts`).
- **SCA** — all 5 advisories cleared; `pnpm audit` → **0 vulnerabilities** (esbuild pinned via `pnpm-workspace.yaml`).
- **SAST Low (ReDoS)** — `globToRegExp` input bounded (`db.ts`).
- **Missing-SRI (A08)** — **Google Fonts self-hosted** (`site/fonts/`); CSP tightened to drop both Google origins; no third-party font CDN remains.
- **S3 screenshots `public-read` (A01/PII)** — **fixed**: uploads now default `private` (`s3.ts:35`); dashboard reads via membership-checked `/api/screenshots/:id`. External tracker tickets get a **permanent, revocable signed link** `/img/<id>.<hmac>` (`lib/imgsign.ts`, streams the private object — no expiry, replaces the 7-day presign) **plus native attachment** into Plane/Jira/Linear (image lives in the tracker; graceful fallback to the link; GitHub/webhook use the link). No world-readable objects. Prototype suite 513/0.
- **Backend hardening** — session/extension tokens + OTP codes now **SHA-256 hashed at rest**; webhook token moved to header; **retention sweep** (`lib/retention.ts`) + **GDPR export/erasure** endpoints added. CI workflow added.

## ✅ Controls already PASSING (verified in code)

HTTPS + HSTS · full CSP · `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · `Referrer-Policy` (`server.ts:839-857`, applied to every response via `withSecurityHeaders` `server.ts:3023`) · no `X-Powered-By` · server-side authN (OTP sessions + bearer tokens) and authZ (project/workspace scoping, widget-token AsyncLocalStorage binding, citation-IDOR guard) · session expiry + server-side logout · parameterized queries (no SQLi) · SSRF guard (`url-guard.ts`) · rate limiting · connector secrets AES-GCM-256 (`crypto.ts`) · source maps off in prod · no Google OAuth sensitive scopes.

---

## ⚠️ Action items before submission

### A. Quick wins (owner sign-off; small changes)
| # | Item | Where | Note |
|---|------|-------|------|
| A1 | ✅ **DONE — removed 4 dead tracker host-permissions** (`*.atlassian.net`, `api.linear.app`, `api.github.com`, `api.plane.so`); version bumped to 0.38.0 | `manifest.json` | Still needs **manual Web Store re-upload** to take effect. |
| A2 | ✅ **DONE — S3 screenshots `private` + permanent signed link + native attachment** | `s3.ts:35`, `lib/imgsign.ts`, `lib/connectors/*` | Permanent revocable `/img` link (no expiry) + native attach to Plane/Jira/Linear. |
| A3 | ✅ **DONE — webhook token moved to header** (`?token=` deprecated fallback) | `server.ts`, `lib/connectors/inbound.ts` | — |
| A4 | ✅ **DONE — `klav.env.example` completed** | `deploy/klav.env.example` | All `process.env.*` enumerated with placeholders. |
| A5 | Verify deployed Caddy host matches `klavity.quantana.top` (file says `klav.quantana.top`) | `deploy/Caddyfile` | **Open** — confirm prod config (ops). |
| A6 | Drop `http://localhost/*` from the **published** extension build | `manifest.json` | **Open** — kept (dev needs it); split dev/prod build later. Minor. |

### B. Hardening (needs browser-tested pass)
- **CSP `script-src` still has `'unsafe-inline' 'unsafe-eval'`** (`server.ts:841`) — move to nonce-based CSP. Biggest remaining XSS defense-in-depth gap.

### C. New work required for CASA/GDPR (features + docs)
| # | Item | Type |
|---|------|------|
| C1 | ✅ **DONE — data-retention sweep** (`lib/retention.ts`): expired OTPs/sessions/screenshots (+ S3 object), 6h interval, test-guarded | Feature |
| C2 | ✅ **DONE — GDPR endpoints** `GET /api/me/export` + `POST /api/me/delete` (cascade erasure incl. S3) | Feature |
| C3 | **At-rest encryption** — ✅ tokens/OTP SHA-256 hashed; ✅ **Vultr Object Storage AES-256** (Trust Center, private ACL); ✅ **Turso DB AES-256 at rest** (AWS volume + S3 SSE, SOC 2; single-region `ap-south-1`, DB-scoped token) — see [DB-ENCRYPTION-EVIDENCE.md](DB-ENCRYPTION-EVIDENCE.md). **Remaining:** attach Turso SOC 2 + signed DPA + subprocessors screenshot | Evidence |
| C7 | **Optional hardening (non-blocking):** enable Turso **Delete Protection** on `klav`; **rotate** `TURSO_AUTH_TOKEN` with an expiry post-review | Ops |
| C4 | **Sub-processor DPAs** — document OpenRouter, SendGrid, AWS S3 | **Open** (Legal/doc) |
| C5 | ✅ **DONE — CI pipeline** (`.github/workflows/ci.yml`): frozen-lockfile install + build + test + audit + weekly audit cron. Branch protection = repo setting (open) | Process |
| C6 | ✅ **DONE — CASA docs**: SAQ, Data Retention Policy, Incident Response Plan, Encryption-at-rest, Secret Rotation all written | Doc |

---

## Bottom line

As of v0.38.0 the **code-side CASA work is essentially complete**: SAST/SCA clean, headers/auth/authz/injection defenses in place, tokens+OTP hashed at rest, retention + GDPR export/erasure shipped, screenshots private with permanent revocable links + native tracker attachments, fonts self-hosted, extension least-privilege, CI live, and the full evidence pack written. What remains is **non-code / ops & legal**: confirm Turso at-rest encryption, enable S3 bucket default SSE, set secrets-file perms + branch protection, sign sub-processor DPAs, verify the prod Caddy host, e2e-verify the native-attachment API calls against live trackers, and (hardening) migrate CSP off `unsafe-inline`/`unsafe-eval` with an in-browser pass.
