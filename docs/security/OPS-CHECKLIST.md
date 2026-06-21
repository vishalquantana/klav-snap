# Ops / Infra Checklist — CASA Tier 2 (hand to DevOps)

These are the **infrastructure items the code can't set** (provider consoles, server config, repo settings). Work top to bottom; for each, run the check and **fill in the "Return" value**. Send the whole filled-in sheet back.

Context: prod = `klavity.quantana.top` on a Vultr instance running `klav.service` (Bun). Object storage = **Vultr Object Storage** (S3-compatible). DB = **Turso**. Secrets in `/etc/klav/klav.env`.

> For the `aws` CLI commands below, configure it once with the Vultr Object Storage keys and always pass `--endpoint-url=https://<region>.vultrobjects.com` (the region host shown for the bucket in the Vultr portal, e.g. `sjc1`, `ewr1`, `ams1`, `del1`, `blr1`). Or use `s3cmd` if you prefer.

---

## A. Vultr Object Storage (screenshots) — highest priority

**A1. Confirm the bucket is PRIVATE (not public).**
- Vultr portal → Object Storage → bucket → visibility. Also:
  ```
  aws --endpoint-url=https://<region>.vultrobjects.com s3api get-bucket-acl --bucket <BUCKET>
  ```
- ✅ Pass = no grant to `AllUsers`/`AuthenticatedUsers` (no public READ).
- **Return:** bucket visibility (Private/Public) + the get-bucket-acl output.

**A2. Verify objects are NOT publicly fetchable.**
- Pick any existing screenshot key under `uploads/` and try it with NO auth:
  ```
  curl -s -o /dev/null -w "%{http_code}\n" https://<region>.vultrobjects.com/<BUCKET>/uploads/<some-object-key>
  ```
- ✅ Pass = **403** (or 401). ❌ Fail = **200** (still public → do A3).
- **Return:** the HTTP code.

**A3. Backfill legacy objects to private** (objects uploaded before this release may still be public-read).
- Dry-run list first, then re-apply private ACL across the prefix:
  ```
  aws --endpoint-url=https://<region>.vultrobjects.com s3 cp \
    s3://<BUCKET>/uploads/ s3://<BUCKET>/uploads/ \
    --recursive --acl private --metadata-directive REPLACE
  ```
  (If the bucket-level setting in A1 already forces private, re-run A2 to confirm and you may not need this.)
- **Return:** confirmation it ran + re-run A2's HTTP code afterward (must be 403).

**A4. At-rest encryption (SSE) status.**
- Vultr likely does NOT support customer SSE; confirm:
  ```
  aws --endpoint-url=https://<region>.vultrobjects.com s3api get-bucket-encryption --bucket <BUCKET>
  ```
- Then **open a Vultr support ticket** asking: *"Is data in Vultr Object Storage encrypted at rest, and can customers enable SSE-S3/SSE-KMS?"*
- **Return:** the get-bucket-encryption output (likely an error/"not supported") **and** Vultr support's written answer (paste it — it's assessor evidence).

**A5. (Optional) Lifecycle expiry** as defense-in-depth backing the app's retention sweep.
- **Return:** whether a lifecycle rule on `uploads/` is wanted (yes/no). If yes, we'll provide the JSON.

---

## B. Database (Turso)

**B1. Confirm at-rest encryption.**
- Turso dashboard → the database → security/encryption details, or Turso docs/support.
- **Return:** statement (with screenshot/link) that the DB is encrypted at rest. If self-hosted libSQL on a volume instead of Turso cloud, confirm the **volume is encrypted** and how.

**B2. Confirm the auth token is scoped & rotatable.**
- **Return:** confirm `TURSO_AUTH_TOKEN` in use is not an org-admin token (least privilege) and can be rotated.

---

## C. Prod host & secrets (`klav.service` box)

**C1. Secrets file permissions.**
  ```
  ls -l /etc/klav/klav.env && stat -c '%a %U:%G' /etc/klav/klav.env
  ```
- ✅ Pass = `600 root:root` (or owned by the service user, not world/group-readable).
- **Return:** the `ls -l` + `stat` output. If not 600, run `chmod 600 /etc/klav/klav.env`.

**C2. Required secrets are present** (do NOT paste the values — just presence):
  ```
  for k in KLAV_SECRET TURSO_DATABASE_URL TURSO_AUTH_TOKEN SENDGRID_API_KEY OPENROUTER_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_ENDPOINT S3_BUCKET; do
    grep -q "^$k=" /etc/klav/klav.env && echo "$k: set" || echo "$k: MISSING"; done
  ```
- `KLAV_SECRET` is critical (signs the new permanent ticket-image links + encrypts connector secrets) and must be a **base64-encoded 32-byte** value.
- **Return:** the set/MISSING list.

**C3. Host disk encryption.**
- **Return:** is the Vultr instance's volume encrypted at rest? (Vultr block storage / instance disk — confirm via portal or support.)

**C4. Service health.**
  ```
  systemctl status klav --no-pager | head -5
  ```
- **Return:** active (running) + current version note if visible.

---

## D. TLS & security headers (verify on live prod — run from anywhere)

**D1. Security headers present.**
  ```
  curl -sI https://klavity.quantana.top | grep -iE "strict-transport-security|content-security-policy|x-frame-options|x-content-type-options|referrer-policy|x-powered-by"
  ```
- ✅ Pass = HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` all present; **`X-Powered-By` absent**.
- **Return:** the full output.

**D2. HTTPS enforced (HTTP→HTTPS redirect).**
  ```
  curl -sI http://klavity.quantana.top | grep -iE "^HTTP|location"
  ```
- ✅ Pass = 301/308 to `https://`.
- **Return:** the output.

**D3. CORS not wildcard on app routes.**
  ```
  curl -sI -H "Origin: https://evil.example" https://klavity.quantana.top/ | grep -i access-control
  ```
- ✅ Pass = no `Access-Control-Allow-Origin: *` reflected for the page/app routes. (The 3 public widget API endpoints are intentionally `*` with Bearer auth and no credentials — that's expected; everything else should not be.)
- **Return:** the output.

**D4. Confirm the Caddy site host.**
  ```
  grep -iE "klav(ity)?\.quantana\.top" /etc/caddy/Caddyfile   # or wherever the Caddyfile lives
  ```
- The repo `deploy/Caddyfile` references `klav.quantana.top`; prod serves `klavity.quantana.top`. Confirm the **deployed** Caddyfile matches the live host.
- **Return:** the matching Caddyfile site line(s).

---

## E. Repo / CI / access

**E1. Lockfile committed & CI green.**
- Confirm `pnpm-lock.yaml` is committed and the new `.github/workflows/ci.yml` runs (frozen-lockfile install + build + test + audit).
- **Return:** link to a passing CI run.

**E2. Branch protection on the default branch.**
- GitHub → repo → Settings → Branches: require PR review + require CI to pass before merge.
- **Return:** confirm enabled (screenshot) or note if not.

**E3. Extension Web Store re-upload.**
- The extension manifest dropped 4 host-permissions and is now **v0.38.0**; this only takes effect after a **manual Chrome Web Store upload**.
- **Return:** confirm whether 0.38.0 has been uploaded/submitted.

---

## What to send back (summary the assessor will want)

1. **A1–A3:** bucket = Private, unauth object fetch = 403, legacy backfill done.
2. **A4 + B1 + C3:** the three at-rest answers — Vultr Object Storage, Turso DB, and host disk — each with a written provider statement or screenshot.
3. **C1–C2:** secrets file = 600, all required keys present (incl. `KLAV_SECRET`).
4. **D1–D4:** header/HTTPS/CORS curl outputs + confirmed Caddy host.
5. **E1–E3:** CI passing, branch protection on, extension 0.38.0 upload status.

Anything that comes back ❌ or "not supported" (especially A4 / B1) — send the exact text; we fold it into `ENCRYPTION-AT-REST.md` as the documented posture + compensating control for the assessor.
