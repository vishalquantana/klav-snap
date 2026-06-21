# Incident Response Plan — Klavity Snap

**Scope:** Security incidents affecting the Klavity Snap backend
(`prototype/server.ts`, Bun) at https://klavity.quantana.top, its Turso database,
S3 screenshot/replay storage, OpenRouter (AI), SendGrid (email/OTP), and the
Plane/Jira/GitHub/Linear connectors. Hosted on Vultr (66.135.20.62) behind Caddy;
secrets load from `/etc/klav/klav.env` via systemd.

## 1. Roles

| Role | Responsibility | Owner |
|------|----------------|-------|
| Incident Commander (IC) | Declares the incident, owns the timeline, makes containment calls | `[GAP — assign]` |
| Technical Lead | Investigates, contains, eradicates, recovers | `[GAP — assign]` |
| Comms / DPO | Breach-notification decisions, regulator + customer comms | `[GAP — assign]` |
| Scribe | Records actions + timestamps for the post-mortem | (rotating) |

For a solo-operator deployment the same person may hold all roles; the plan
still requires the timeline and post-mortem to be recorded.

## 2. Severity levels

| Sev | Definition | Examples | Target response |
|-----|------------|----------|-----------------|
| SEV-1 | Confirmed breach of personal data, or full service compromise | DB exfiltration, `KLAV_SECRET` leak, RCE | Immediate, all-hands |
| SEV-2 | Likely compromise or major availability loss | Leaked session/connector token, S3 bucket exposure, auth bypass | < 1h |
| SEV-3 | Suspicious but unconfirmed, or limited impact | Anomalous AI spend, repeated auth failures, single-tenant data quirk | < 4h |
| SEV-4 | Low-risk / informational | Dependency CVE not yet exploitable, scanner noise | Next business day |

## 3. Detection sources

- **Application logs** — server stdout/stderr captured by systemd
  (`journalctl -u klav`).
- **Correlation IDs** — `oops(err, label)` logs a server-side error with an
  8-char id and returns only `{error, id}` to the client
  (`prototype/server.ts:498-501`). The same id appears in user reports and in
  logs, enabling fast pivoting. Search `journalctl -u klav | grep <id>`.
- **Caddy access/error logs** — reverse-proxy layer: unusual request volume,
  status-code spikes, suspicious paths, source IPs.
- **`ai_calls` ledger anomalies** — sudden cost/volume spikes vs the
  `OPS_DAILY_CAP_USD` baseline indicate key abuse or a runaway loop
  (`db.ts:206-211`, `/opsadmin` dashboard).
- **Rate-limit + SSRF guard rejections** — bursts logged by `lib/ratelimit.ts`
  and `lib/safe-fetch.ts` / `lib/url-guard.ts` / `lib/connectors/guard.ts`.
- **External** — SendGrid bounce/abuse notices, OpenRouter usage alerts,
  Turso/S3 provider alerts, customer/security-researcher reports.

## 4. Response procedure

### 4.1 Identify
- Open an incident record; assign IC + Sev.
- Capture the correlation id(s), affected endpoints, timeframe, and tenants.
- Preserve evidence: snapshot `journalctl -u klav` output, Caddy logs, relevant
  Turso rows, `ai_calls` slice. Do **not** mutate data before snapshotting.

### 4.2 Contain
- If a credential is suspected leaked, rotate it immediately per
  `SECRET-ROTATION.md` (see §6). Highest priority: `KLAV_SECRET`,
  `TURSO_AUTH_TOKEN`, session/connector tokens.
- Revoke compromised auth: delete sessions (`deleteSession`, `db.ts:610-612`),
  set `revoked=1` on extension/widget tokens (`db.ts:1736`).
- If service-level compromise: take the app offline at Caddy (return 503) or
  `systemctl stop klav` to halt processing.
- For AI-key abuse: rotate `OPENROUTER_API_KEY` and lower the OpenRouter cap.

### 4.3 Eradicate
- Remove the root cause: patch the vulnerable code path, close the exposed
  bucket/ACL, remove malicious data, invalidate all affected tokens.
- Confirm the SSRF / input-validation guard that should have blocked the vector
  (`lib/safe-fetch.ts`, `lib/url-guard.ts`, `lib/prompt-safety.ts`).

### 4.4 Recover
- Rotate any secret touched during the incident even if leak is unconfirmed.
- Restore service (`systemctl restart klav`); verify health and that guards/rate
  limits are active.
- Monitor `ai_calls`, auth-failure rate, and Caddy for recurrence for 24–72h.

### 4.5 Post-mortem
- Within 5 business days: blameless write-up — timeline, root cause, impact,
  data categories affected, detection gap, and concrete remediation actions with
  owners + dates. File remediation tickets in Plane.

## 5. Breach notification

- **Assessment:** Comms/DPO determines whether personal data was affected
  (see data categories in PII-DATA-FLOW.md).
- **GDPR Art. 33 — supervisory authority:** if a personal-data breach is likely
  to result in risk to individuals, notify the competent authority **without
  undue delay and within 72 hours** of becoming aware. If later than 72h, include
  reasons for the delay.
- **GDPR Art. 34 — data subjects:** where the breach is likely to result in a
  **high** risk, notify affected individuals without undue delay, in clear
  language (what happened, likely consequences, mitigations, contact point).
- **Contractual:** notify affected customers/processors per their DPA timelines.
- Keep a record of all breaches (incl. those not notified) and the reasoning —
  Art. 33(5) accountability.

## 6. Secret / token rotation runbook

Detailed per-secret procedures, blast radius, and the **`KLAV_SECRET`
re-encrypt-on-rotate migration** are documented in
[`SECRET-ROTATION.md`](./SECRET-ROTATION.md). During an incident, rotate in this
order of blast radius: `KLAV_SECRET` → `TURSO_AUTH_TOKEN` → connector secrets →
`OPENROUTER_API_KEY` / `SENDGRID_API_KEY` / S3 keys → user sessions & tokens.

## 7. Contacts

| Purpose | Contact |
|---------|---------|
| Incident Commander | `[GAP — assign]` |
| DPO / privacy | `[GAP — assign]` |
| Hosting (Vultr) support | `[GAP]` |
| Turso / SendGrid / OpenRouter / S3 provider support | `[GAP]` |
| Supervisory authority (GDPR) | `[GAP — confirm lead authority]` |

## 8. Maintenance

Reviewed annually and after every SEV-1/SEV-2 incident. A tabletop exercise
should be run at least once per year to validate detection + escalation.
