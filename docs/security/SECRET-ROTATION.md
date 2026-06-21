# Secret Rotation Runbook — Klavity Snap

**Scope:** Every secret in `deploy/klav.env.example` (deployed to
`/etc/klav/klav.env`, loaded via systemd into `prototype/server.ts`). For each
secret: how to rotate, blast radius, and verification. The **`KLAV_SECRET`
re-encrypt-on-rotate** procedure is the critical one — see §1.

## General procedure

1. Generate the new value (provider console or `openssl`).
2. Edit `/etc/klav/klav.env` on the server (keep `chmod 600`, owned by `klav`).
3. `systemctl restart klav` (env is read at process start).
4. Poll health (~10s boot) and watch `journalctl -u klav` for startup errors.
5. Revoke/delete the OLD credential at the provider once the new one is verified.

> Note: env vars are read at boot only — a restart is **required** for any change
> to take effect.

---

## 1. `KLAV_SECRET` (CRITICAL — re-encrypt on rotate)

**What it protects:** AES-GCM-256 key (base64, must decode to exactly 32 bytes)
used to encrypt connector/integration secrets at rest
(`lib/crypto.ts:8-15`, `encryptSecret`/`decryptSecret` at `crypto.ts:20-31`).
Stored ciphertext format is `base64(iv):base64(ciphertext)` (`crypto.ts:21-23`).

**Blast radius:** Every encrypted secret in the `connectors` and `integrations`
tables (Plane/Jira/GitHub/Linear API tokens, webhook secrets — `db.ts:220-227`).

**THE TRAP:** ciphertext does not carry a key id. If you simply swap
`KLAV_SECRET` and restart, `decryptSecret` will fail on every existing row
(AES-GCM auth-tag mismatch) — all connectors silently break and auto-copy to
external trackers stops. **Naive rotation orphans all existing ciphertext.**

### Dual-key re-encrypt migration

Perform a read-with-old-key → re-encrypt-with-new-key pass before cutting over.

1. **Generate the new key:**
   ```
   openssl rand -base64 32   # decodes to 32 bytes; verify length
   ```
2. **Stage both keys.** Run a one-off migration script (outside the request path)
   that has the OLD key as `KLAV_SECRET` and the NEW key available separately
   (e.g. `KLAV_SECRET_NEW`). For every row in `connectors` / `integrations`:
   - `decryptSecret(blob)` with the OLD key (`crypto.ts:25-31`),
   - re-encrypt the plaintext with the NEW key,
   - `UPDATE` the row with the new `iv:ciphertext` blob — ideally in a
     transaction / batched so a failure is recoverable.
   Because AES-GCM uses a fresh random IV per `encryptSecret` call
   (`crypto.ts:21`), re-encryption naturally produces new IVs.
3. **Verify:** with only the NEW key set, `decryptSecret` succeeds for every
   migrated row (spot-check a connector send / `getAutoCopyConnectors`,
   `db.ts:1906-1909`).
4. **Cut over:** set `KLAV_SECRET = <new key>` in `/etc/klav/klav.env`, remove
   the staged old key, `systemctl restart klav`.
5. **Confirm** auto-copy works end-to-end (a test report copies to Plane), then
   discard the old key.

> If a dedicated migration script does not yet exist, it must be written before
> rotating this key. Treat `KLAV_SECRET` rotation as a planned maintenance, not
> an in-place edit. `[GAP — re-encrypt migration script not yet in repo]`

---

## 2. `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`

**What:** libSQL/Turso connection + auth token (`lib/db.ts:5-6`).
**Blast radius:** total — loss of DB access takes the whole app down.
**Rotate:** mint a new token in the Turso console, update env, restart, verify a
read succeeds; then revoke the old token. URL changes only on DB migration.

## 3. `OPENROUTER_API_KEY`

**What:** AI provider key (`server.ts:36`, `lib/trails-vision.ts:94`).
**Blast radius:** all AI features (reactions, vision, Trails) fail; a leaked key
allows third-party spend on your account.
**Rotate:** create a new key in OpenRouter, update env, restart, run a smoke
reaction (`scripts/smoke-vision.ts`), revoke the old key. On suspected abuse,
also lower the provider-side cap.

## 4. `SENDGRID_API_KEY`

**What:** transactional email — OTP login codes + lead alerts (`lib/mail.ts:3,23`).
**Blast radius:** OTP login and lead emails stop; a leaked key allows spoofed
mail from your domain.
**Rotate:** issue a new restricted (Mail Send) key in SendGrid, update env,
restart, trigger a test OTP, then delete the old key.

## 5. S3 credentials — `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`

**What:** screenshot/replay upload + presigned GET (`lib/s3.ts:7-8`).
**Blast radius:** screenshot upload + signed-URL serving fail; a leaked pair
exposes the bucket per the IAM policy.
**Rotate:** create a new key pair scoped to the bucket, update env, restart,
upload + fetch a test screenshot, then deactivate/delete the old pair.
`S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_FOLDER` are config, not secrets.

## 6. Connector secrets (Plane / Jira / GitHub / Linear)

**What:** per-project API tokens entered in the UI, stored AES-GCM-encrypted via
`KLAV_SECRET` (`db.ts:220-227`, `crypto.ts`). **Not** env vars.
**Blast radius:** scoped to one project's external-tracker copy.
**Rotate:** revoke the token at the external provider, enter the new token in the
project's connector settings (re-encrypted automatically on save). No restart
needed. Deleting a connector removes the row (`db.ts:1903`).

## 7. Auth artifacts — sessions & extension/widget tokens

**What:** bearer session ids (`sessions`, `db.ts:600-612`) and extension/widget
tokens (`extension_tokens`, `db.ts:200-202`).
**Blast radius:** a leaked token impersonates one user/extension until expiry.
**Rotate/revoke:** delete the session row (`deleteSession`, `db.ts:610-612`) or
set `revoked=1` on the token (`db.ts:1736`). For a mass invalidation event, purge
all `sessions` rows (forces every user to re-login via OTP).

## 8. Non-secret config

`PORT`, `KLAV_BASE_URL`, `KLAV_MODEL`, `OPENROUTER_BASE`, `KLAV_MAIL_FROM`,
`OPS_ADMIN_EMAILS`, `OPS_DAILY_CAP_USD`, `KLAV_ALLOWED_DOMAINS/EMAILS` are not
secrets; change + restart, no rotation/revocation required.

## Rotation cadence

| Secret | Routine cadence | Also rotate on |
|--------|-----------------|----------------|
| `KLAV_SECRET` | 12 months (planned, with re-encrypt) | suspected leak, staff offboarding |
| `TURSO_AUTH_TOKEN` | 6–12 months | leak, offboarding |
| `OPENROUTER_API_KEY` | 6 months | spend anomaly, leak |
| `SENDGRID_API_KEY` | 6–12 months | leak |
| S3 key pair | 6–12 months | leak, offboarding |
| Connector tokens | per external provider policy | leak, project owner change |
