# Encryption at Rest — Klavity Snap

**Date:** 2026-06-21 · **Scope:** every persistent data store behind https://klavity.quantana.top · **For:** CASA Tier 2 (ASVS V6 Stored Cryptography) + GDPR Art. 32.
Evidence is cited to `file:line`. "Provider-managed" = encryption is the hosting provider's responsibility and must be **confirmed in their console**, not in our code.

---

## Summary

| Store | Contents | At-rest encryption | Status |
|-------|----------|--------------------|--------|
| Turso / libSQL DB | emails, names, OTP (hashed), session + extension tokens (hashed), feedback text, `client_context_json` (UA/console/network/PII), screenshot metadata | **AES-256 at rest** (AWS volume + S3 SSE backups, Turso SOC 2); single-region `ap-south-1` | ✅ Confirmed — see [DB-ENCRYPTION-EVIDENCE.md](DB-ENCRYPTION-EVIDENCE.md) |
| Connector secrets (in DB) | Jira/Plane/GitHub/Linear/webhook API tokens | **AES-GCM-256, app-layer** (`lib/crypto.ts`) | ✅ Strong |
| Vultr Object Storage | screenshot images (may contain PII) | **AES-256 at rest (platform-managed, key rotation)** + objects **private** (fixed today) | ✅ Confirmed (Vultr Trust Center) |
| Secrets file | `KLAV_SECRET`, `TURSO_AUTH_TOKEN`, `SENDGRID_API_KEY`, `AWS_*`, OpenRouter key | Plaintext file on host (`/etc/klav/klav.env`) | ⚠️ Perms + rotation |
| In-transit (recap) | all client↔server traffic | TLS via Caddy + HSTS (`server.ts:857`) | ✅ |

**Bottom line:** the *secret-of-secrets* path is done well — connector tokens are AES-GCM-256 encrypted with a random per-message IV, and TLS/HSTS protect data in transit. The gaps are (1) **session/extension bearer tokens are stored in plaintext** in the DB, (2) DB and S3 **at-rest encryption is provider-managed and unverified**, and (3) the host **secrets file** needs perms/rotation discipline.

---

## 1. Database (Turso / libSQL)

- Connected via `@libsql/client` `createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN })` — `lib/db.ts:5-7`. This is **Turso Cloud** (DB `klav`, single-region AWS `ap-south-1`). **✅ Encrypted at rest** at the volume level (AWS AES-256 + S3 SSE for backups) per Turso's SOC 2 — see **[DB-ENCRYPTION-EVIDENCE.md](DB-ENCRYPTION-EVIDENCE.md)** for the full evidence (verified quote, `turso db show` output, token scope, BYOK feasibility, attestations).
- At the **application layer**: session/extension tokens + OTP codes are now **SHA-256 hashed** (E1/E2 below, ✅ done); other personal columns (`users.email/name`, `feedback.*`, `client_context_json`, screenshot ledger) rely on the platform volume encryption, not column-level crypto. Customer-managed-key (BYOK) is available but **not required for CASA Tier 2** (see evidence doc §2).

### 🟠 Finding E1 (Medium) — session & extension tokens stored in plaintext
`sessions.id` (`db.ts:40`, written `db.ts:601`) and `extension_tokens.token` (`db.ts:200`) **are the bearer tokens themselves, stored verbatim**. Anyone who reads the DB (backup leak, SQL injection elsewhere, Turso compromise, insider) can replay every live session and extension token → full account takeover, bypassing TLS and the OTP flow.
- **Best practice:** store only `sha256(token)`; on each request hash the presented token and look it up. The raw token exists only in the client cookie/header. (This is how session stores like Rails/Django/Lucia work.)
- **ASVS V3.2 / V6.2.** Migration: add `token_hash`, dual-read during rollover, drop the plaintext column.

### 🟡 Finding E2 (Low) — OTP codes stored in plaintext
`login_otps.code` is the raw 6-digit code (`db.ts:39,587`). Risk is bounded — single live code per email, short `expires_at`, single-use `used` flag, and auth rate-limiting (`lib/ratelimit.ts`) — but a DB read during the ~10-min window allows login. **Best practice:** store `sha256(code)`; compare hashes in `verifyOtp` (`db.ts:589`). Low priority given the existing controls.

---

## 2. Connector secrets — ✅ AES-GCM-256 (the reference implementation)

`lib/crypto.ts` encrypts every third-party tracker token before it touches the DB:
- **AES-256-GCM** via WebCrypto (`crypto.subtle`), authenticated encryption (integrity + confidentiality).
- **Fresh 96-bit random IV per message** (`crypto.getRandomValues(new Uint8Array(12))`) — no IV reuse.
- Key = `KLAV_SECRET`, a base64-encoded **32-byte** key, length-validated at load (`crypto.ts` `getKey()`); never hardcoded.
- Ciphertext stored as `iv:ct` (base64). Connectors read it back via `decryptSecret` (`db.ts:557` `token_enc`).
This is exactly what the rest of the sensitive columns (E1) should aspire to. **One gap: there is no `KLAV_SECRET` rotation procedure** — rotating it today would orphan all stored ciphertext. Document a re-encrypt-on-rotate routine.

---

## 3. Vultr Object Storage (screenshots)

- Screenshots are uploaded **`private`** by default (`lib/s3.ts:35`, fixed 2026-06-21) — no longer world-readable. The dashboard serves them via the membership-checked `/api/screenshots/:id` presign (`server.ts:1598-1615`); external tracker tickets embed the permanent revocable signed link `/img/<id>.<hmac>` (`lib/imgsign.ts`).
- **At-rest encryption is satisfied at the platform level.** Vultr's Trust Center states: *"Data at rest is secured with AES 256 encryption using customer managed or hardware security module keys with automated rotation"*; in transit *"TLS 1.3 and certificate pinning."* Vultr Object Storage is covered by **SOC 2+ (HIPAA), ISO 27001, PCI DSS, ISO 27017/27018**.

### ✅ E3 (resolved/documented) — at-rest encryption confirmed
No action needed for baseline at-rest: Vultr encrypts all object data with **AES-256** + key rotation (audited under SOC 2 / ISO 27001). Bucket-default SSE-S3 / `PutBucketEncryption` is **not exposed** by Vultr's S3 API (absent from their S3 compatibility matrix) — and unnecessary given platform-level encryption. **SSE-C** (customer-provided keys) *is* supported if the assessor ever requires *customer-managed* keys for screenshots; that would require passing the key per request (code change) — not implemented, noted as available.
**Evidence to attach:** Vultr Trust Center page (AES-256 at rest / TLS 1.3) + SOC 2 / ISO 27001 listing; our private-ACL + presigned/signed-link access path.
Sources: Vultr Trust Center (https://www.vultr.com/trust-center/), Object Storage security best practices (https://docs.vultr.com/platform/security-best-practices/vultr-object-storage), SSE-C guide (https://docs.vultr.com/how-to-use-server-side-encryption-sse-c-with-s3-object-storage-on-vultr).

---

## 4. Secrets at rest (host)

- Secrets load from `/etc/klav/klav.env` via the systemd unit's `EnvironmentFile` (`deploy/klav.service`); `.env` is gitignored (not in VCS).
- **🟡 Finding E4 (Low):** this is a **plaintext file on the Vultr host**. Ensure it is `chmod 600`, root-owned, on an encrypted volume; longer term consider a secrets manager (Vault/SSM/Doppler). Also **`deploy/klav.env.example` is missing the real keys** (`KLAV_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SENDGRID_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_*`, OpenRouter key) — add them as placeholders so the deployment contract is auditable.

---

## 5. Priority & CASA/ASVS mapping

| Finding | Sev | Fix | ASVS |
|---------|-----|-----|------|
| E1 — plaintext session/ext tokens | Medium | ✅ Done — `sha256(token)` at rest with dual-read migration (`lib/db.ts`) | V3.2, V6.2 |
| E2 — plaintext OTP codes | Low | ✅ Done — hashed before store (`lib/db.ts`) | V6.2 |
| E3 — Vultr Object Storage at-rest | — | ✅ Confirmed AES-256 platform encryption (Trust Center) + private ACL; no action | V6.1 |
| (DB) Turso at-rest | — | ✅ Confirmed AES-256 (AWS volume + S3 SSE, SOC 2); attach SOC 2/DPA — see DB-ENCRYPTION-EVIDENCE.md | V6.1 |
| E4 — host secrets file | Low | 600 perms + encrypted volume + rotation; ✅ `klav.env.example` completed | V6.4, V2.10 |
| `KLAV_SECRET` rotation | Low | ✅ Documented in SECRET-ROTATION.md (re-encrypt-on-rotate) | V6.4 |

**Already strong (keep as evidence):** AES-256-GCM connector secrets with per-message IV (`crypto.ts`); session/ext tokens + OTP now SHA-256 at rest; TLS + HSTS in transit (`server.ts:857`); Vultr Object Storage AES-256 at rest + private ACLs + signed-link access; SOC 2 / ISO 27001 platform certs.

---
*Companion docs: [SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md) §6, [PII-DATA-FLOW.md](PII-DATA-FLOW.md) §3.*
