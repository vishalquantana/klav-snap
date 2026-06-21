# Klavity — Data-at-Rest & Database Security Evidence (Turso Cloud)

**Subject:** Google CASA Tier 2 + GDPR Art. 32 — encryption-at-rest and database access controls
**Application:** Klavity (klavity.quantana.top)
**Data store:** Turso Cloud (libSQL)
**Database (name):** `klav`  ·  **ID:** `019ecec7-0a01-7534-9c9e-9ac4a11aae1c`  ·  **Group:** `aiquantana`
**Database URL:** `libsql://klav-vishalquantana.aws-ap-south-1.turso.io`
**Hosting / region:** Turso Cloud on AWS `ap-south-1` (Mumbai) — **single region, single primary instance, no replicas**
**Connection method:** libSQL client using `url` + `authToken` only (no `encryptionKey` → Turso Cloud BYOK not active)
**Prepared / verified:** 2026-06-21
**Status:** Vendor docs verified against Turso's live documentation; account-specific facts confirmed via `turso db show klav`. Remaining **[ACTION]** items are the three gated trust-center artifacts to attach before submission.

---

## 0. Evidence-handling note for the assessor

Strongest evidence per control, in order:
1. **Turso SOC 2 Type II report + signed DPA** — request at <https://trust.turso.tech> (gated; login / NDA click-through). **[ACTION]**
2. **Turso subprocessors list** (confirms AWS + region) — <https://trust.turso.tech/subprocessors>. **[ACTION: screenshot]**
3. **AWS public ISO 27001 certificate** (lists `ap-south-1`) — AWS compliance site (sub-processor layer; supplementary — Turso's SOC 2 already covers the AWS layer).
4. **Customer-captured CLI output** — `turso db show klav` (✅ captured, see §3).

---

## 1. Encryption at rest — current state

| Item | Finding |
|---|---|
| Is `klav` encrypted at rest? | **Yes.** |
| Mechanism active | **Platform-default: AWS volume-level encryption (AES-256) + S3 server-side encryption for backups**, applied to all Turso Cloud databases as part of Turso's SOC 2 controls. |
| Turso native / BYOK encryption active? | **No.** BYOK is a database-creation-time property (`--remote-encryption-key`); this DB was created without one and the app passes no key. |

**Protects:** physical media theft, disk disposal/decommissioning, raw storage compromise — data is encrypted on disk and in S3 with provider-managed keys.
**Does NOT protect against:** logical access by the processor (Turso) or anyone with access to the running instance — the storage layer transparently decrypts for the service. Provider-managed infrastructure encryption is **not** customer-managed-key encryption.

**GDPR Art. 32 characterisation:** volume-level AES-256 is a valid "encryption of personal data" technical measure; describe it accurately as **provider-managed infrastructure encryption**, not customer-controlled key encryption.

**Authoritative source (verified verbatim 2026-06-21):** Turso encryption docs — <https://docs.turso.tech/cloud/encryption>: *"All databases are encrypted-at-rest at the volume level in the Turso Cloud, as part of our SOC2 standards."*

---

## 2. BYOK (customer-managed key) — feasibility, path, impact

**Important correction:** BYOK **cannot** be enabled by adding `encryptionKey` to the libSQL connection — that option encrypts a **local/embedded** SQLite file, and does **not** activate Turso Cloud server-side at-rest BYOK. Turso Cloud BYOK is a **creation-time** property; **rekeying an existing database is not supported** (Turso docs: *"Rekeying is not supported yet."*).

**Migration path** (required — `klav` cannot be retrofitted in place):
1. Dump the current database to a file.
2. Create a **new** encrypted DB from the dump:
   ```bash
   turso db create klav-enc \
     --remote-encryption-key "$KEY" \
     --remote-encryption-cipher aes256gcm \
     --from-file klav.db
   ```
3. Supply the key per connection (remote-encryption connection config / `TURSO_DB_REMOTE_ENCRYPTION_KEY`).
4. Repoint the app, verify, cut over, delete the old DB.

**Technical properties (verified against docs):**
- **Per-page AEAD** — each 4 KiB page encrypted individually with a unique nonce.
- **Cipher options:** `aes128gcm`, `aes256gcm`, `chacha20poly1305`, `aegis128l`/`aegis128x2`/`aegis128x4`/`aegis256`/`aegis256x2`/`aegis256x4`. *(For an assessment that pattern-matches on "256", prefer `aes256gcm` or `aegis256`.)*
- **Key handling:** provided **per connection, in memory only**, never written to disk, **never seen/stored by Turso** — satisfies "not even the processor can read the data."
- **Key loss = permanent data loss** (no recovery) → customer key management (secrets manager, escrow, rotation) becomes a required control.
- **Plan:** Pro or Enterprise.
- **Coverage:** DB file + WAL on disk and S3; branching and PITR inherit the same cipher + key.

> **Scope guidance:** For **CASA Tier 2**, the platform default (AWS volume AES-256 + Turso SOC 2) is normally **sufficient** — BYOK is an above-and-beyond, zero-trust-of-processor control. Treat this section as *feasibility documented*; **do not perform the migration unless the assessor explicitly requires customer-managed-key confidentiality from the processor.**

**Sources:** <https://docs.turso.tech/cloud/encryption> · <https://turso.tech/blog/turso-cloud-native-encryption>

---

## 3. Backups, replicas, embedded replicas — confirmed via `turso db show klav`

```
Name:               klav
URL:                libsql://klav-vishalquantana.aws-ap-south-1.turso.io
ID:                 019ecec7-0a01-7534-9c9e-9ac4a11aae1c
Group:              aiquantana
Version:            2026.7.3
Locations:          aws-ap-south-1
Size:               1.1 MB
Delete Protection:  No
Database Instances:  aws-ap-south-1  primary  aws-ap-south-1
```

| Asset | Encryption at rest | Location |
|---|---|---|
| Primary DB file + WAL | AWS volume encryption (default). | AWS `ap-south-1` |
| Backups (S3) + point-in-time recovery | S3 server-side encryption (default). | **`ap-south-1`** (single-region — co-located) |
| Multi-region / group replicas | **N/A — none.** Single instance only. | — |
| Embedded / edge replicas (client-side) | **N/A — not used.** App connects with `url`+`authToken` (no `syncUrl`/embedded replica); no client-side local copy exists. | — |

**Data residency:** all personal data and backups remain in **India (Mumbai, `ap-south-1`)** — single region, no cross-region replication.

> ⚠️ **Resilience finding — `Delete Protection: No`.** Not an encryption control, but an availability/integrity safeguard (SOC 2 "A"). **Recommend enabling delete protection** on the production DB (Turso dashboard → database settings, or the CLI delete-protection config — verify the flag with `turso db --help`). Cheap, prevents accidental destruction.

**Source:** <https://docs.turso.tech/cloud/encryption> ("The database file and Write-Ahead Log (WAL) file on disk and on S3.")

---

## 4. Database auth token — scope, least privilege, rotation, expiry

**✅ Confirmed: the deployed token is database-scoped (not an org/platform admin token).** The `TURSO_AUTH_TOKEN` JWT decodes to claims including `"a":"rw"` and `"id":"019ecec7-0a01-7534-9c9e-9ac4a11aae1c"` — the `id` **matches the `klav` database ID**, proving it is scoped to this single database, with read-write access, and **no `exp` claim (non-expiring)**.

| Property | Finding |
|---|---|
| Scope | **Database-scoped** (token `id` = `klav` DB ID). Not a platform/organization token. ✅ |
| Authorization level | `full-access` (read-write). Appropriate — the app writes. Read-only/fine-grained available if a future workload allows. |
| Expiry | **Non-expiring** (no `exp`). Turso default is `never`; configurable (e.g. `90d`). |
| Rotation | `turso db tokens invalidate klav` (revokes all), then `turso db tokens create klav --expiration 90d` (verify flag). |

> **Recommendation:** the token has resided in `.env`/`/etc/klav/klav.env` during this review — **rotate it now** and re-mint with an expiry; document a cadence (quarterly + on personnel change). Update `/etc/klav/klav.env` and restart `klav.service` after.

**Sources:** <https://docs.turso.tech/api-reference/databases/create-token> · <https://turso.tech/blog/authorization-api-platform-saga-part-2-448f7622>

---

## 5. Attestations (SOC 2 / ISO 27001 / GDPR)

| Entity | Attestation | Evidence source |
|---|---|---|
| **Turso** | **SOC 2 Type II** (completed, zero exceptions); annual third-party pentest (Doyensec). **No public ISO 27001 for Turso itself** — do not claim it. | Report via <https://trust.turso.tech> **[ACTION: request + download]** |
| **AWS (`ap-south-1`)** | SOC 1/2/3, **ISO 27001**, 27017, 27018, 27701, PCI DSS; `ap-south-1` in scope. | AWS public ISO 27001 cert (compliance site). Supplementary. |
| **GDPR** | Privacy policy published; **DPA** available (names AWS as sub-processor). | <https://turso.tech/privacy-policy> · DPA via trust center **[ACTION: obtain signed DPA]** |

**Caution:** cite ISO 27001 only at the **AWS sub-processor** layer; SOC 2 Type II at the **Turso** layer.

**Source:** <https://turso.tech/blog/turso-achieves-soc2-compliance> · <https://trust.turso.tech>

---

## 6. Summary & remaining actions

**Confirmed (closed):**
- ✅ Encrypted at rest — AWS volume AES-256 + S3 SSE backups (Turso SOC 2). Verified quote.
- ✅ Single region `ap-south-1`; no multi-region or embedded replicas; data residency = India.
- ✅ Auth token is **database-scoped**, read-write (token `id` = DB ID).
- ✅ BYOK feasibility documented; **not required for CASA Tier 2**.

**Remaining [ACTION] (all evidence-capture, no code):**
1. **Turso SOC 2 Type II** report — request + download from <https://trust.turso.tech>.
2. **Signed DPA** — obtain from the trust center.
3. **Subprocessors** screenshot (AWS + region) — <https://trust.turso.tech/subprocessors>.
4. *(supplementary)* AWS ISO 27001 certificate showing `ap-south-1`.

**Recommended hardening (optional, not blockers):**
- Enable **Delete Protection** on `klav`.
- **Rotate** `TURSO_AUTH_TOKEN` (re-mint with expiry) post-review; document rotation cadence.

---

### Reference links
- Turso encryption (at-rest + BYOK): <https://docs.turso.tech/cloud/encryption>
- Turso Cloud native encryption: <https://turso.tech/blog/turso-cloud-native-encryption>
- DB auth token API: <https://docs.turso.tech/api-reference/databases/create-token>
- Turso SOC 2 Type II: <https://turso.tech/blog/turso-achieves-soc2-compliance>
- Trust Center: <https://trust.turso.tech> · Subprocessors: <https://trust.turso.tech/subprocessors>
- Privacy Policy: <https://turso.tech/privacy-policy>
