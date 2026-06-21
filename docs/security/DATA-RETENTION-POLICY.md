# Data Retention Policy — Klavity Snap

**Status:** Proposed policy (target state). Several rows below are **not yet enforced
in code** — a scheduled retention sweep is being added as `lib/retention.ts`. Each
unenforced item is marked accordingly and references that module as the enforcement
point.

**Scope:** All personal data and operational data processed by the Klavity Snap
backend (`prototype/server.ts`, Turso DB, S3 storage). Evidence of current behaviour
is drawn from `docs/security/PII-DATA-FLOW.md` §5.

## GDPR Art. 5(1)(e) — Storage Limitation

Personal data must be "kept in a form which permits identification of data subjects
for no longer than is necessary for the purposes for which the personal data are
processed." This policy defines the maximum retention period per data category,
the deletion trigger, and the deletion method, so that data does not accumulate
indefinitely. It directly addresses the gap recorded in PII-DATA-FLOW.md §5
("There is no scheduled retention/rotation/cleanup job anywhere in the backend …
data accumulate indefinitely").

## Retention schedule

| # | Data Category | Store | Proposed Retention | Deletion Trigger | Deletion Method | Current State (evidence) |
|---|---------------|-------|--------------------|------------------|-----------------|--------------------------|
| 1 | OTP login codes | `login_otps` (Turso) | 24h max; effectively 10-min validity | Age > 24h OR `used=1` | Hard `DELETE` by `lib/retention.ts` sweep | **NOT enforced** — 10-min expiry marks unusable but rows are never deleted (`db.ts:583-594`, PII §5) |
| 2 | Sessions | `sessions` (Turso) | `SESSION_DAYS` TTL (token validity) | Logout, OR `expires_at` past | Logout `DELETE` exists; expired-row purge by `lib/retention.ts` | **Partial** — logout deletes row (`db.ts:610-612`); expired rows read-rejected but not purged (`db.ts:600-607`) |
| 3 | Extension / widget tokens | `extension_tokens` (Turso) | Until `expires_at`; revoked rows purge after 30d | `revoked=1` OR `expires_at` past | Revoke sets flag; purge of revoked/expired by `lib/retention.ts` | **Partial** — revoke flag + optional expiry (`db.ts:200-202`, `db.ts:1729-1736`); no purge sweep |
| 4 | Feedback + `client_context` (reports, observations, page URLs, quotes) | `feedback` (Turso) | 24 months from creation (configurable per project) | Age > retention OR project deletion | `DELETE` by `lib/retention.ts`; cascade on project/account erasure | **NOT enforced** — indefinite; no `DELETE FROM feedback` exists (PII §5) |
| 5 | Screenshots — Sim / private | `screenshots` (Turso) + S3 objects | 30 days (matches the `expires_at` hint already set) | `expires_at` past | `lib/retention.ts` deletes the S3 object + row; S3 bucket lifecycle rule as backstop | **NOT enforced** — `expires_at = now+30d` set as a hint at `server.ts:1691`, but no job reads it; no S3 lifecycle rule evidenced |
| 6 | Screenshots — Snap | `screenshots` (Turso) + S3 objects | 24 months (align with feedback) | Age > retention OR parent feedback deleted | `lib/retention.ts` deletes S3 object + row | **NOT enforced** — currently indefinite, served private via presigned GET (`s3.ts:35`, `server.ts:1216-1217`) |
| 7 | Session replays | `feedback_replays`, `walk_replays` (Turso) | Same as parent feedback (24 months) | Parent feedback deletion OR age | Cascade `DELETE` in `lib/retention.ts` | **NOT enforced** — indefinite; only size-trimmed within a single capture (`db.ts:347-356`) |
| 8 | Transcripts / traits / trait events | transcript tables (Turso) | 24 months | Age OR project deletion | `DELETE` by `lib/retention.ts` | **NOT enforced** — indefinite; no DELETE endpoint (`db.ts:157-176`) |
| 9 | `ai_calls` ledger (incl. `actor_email`) | `ai_calls` (Turso) | 13 months (billing/audit window) | Age > 13 months | Row `DELETE` by `lib/retention.ts`; optionally anonymise `actor_email` first | **NOT enforced** — indefinite (`db.ts:206-211`) |
| 10 | Connectors / integrations (encrypted secrets) | `connectors`, `integrations` (Turso) | Until manual delete or project deletion | Admin delete action | `deleteConnector` / `deleteIntegration` | **Enforced (manual)** — admin-triggered delete (`db.ts:827-828`, `db.ts:1903`); AES-GCM encrypted at rest (`crypto.ts:20-31`) |
| 11 | Personas | persona tables (Turso) | Until manual delete or project deletion | User delete action | `deletePersona` / `DELETE /api/personas/:id` | **Enforced (manual)** — `db.ts:867-869`, `server.ts:1502` |
| 12 | Monitoring consent | `monitoring_consent` (Turso) | Life of project (proof of consent) | Project deletion | Cascade on project erasure via `lib/retention.ts` | Retained as consent evidence (`db.ts:190-193`) |
| 13 | Account / org data (`users`, `accounts`, members) | Turso | Life of account + 30 days after closure | Account closure request | Cascading erasure path (TBD) wired into `lib/retention.ts` | **NOT enforced** — no account-deletion / cascading-delete path exists (PII §5, §6 Art.17 GAP) |

Notes:
- "24 months" / "13 months" are proposed defaults; final periods need business +
  legal sign-off `[GAP — needs owner input]`.
- Items marked **NOT enforced** depend on the scheduled retention sweep
  (`lib/retention.ts`, being added by another workstream). Until it ships, this
  policy is aspirational for those rows.

## Enforcement model

1. **Scheduled sweep** — `lib/retention.ts` runs on a fixed interval (cron or
   in-process timer) and performs hard deletes per the table above. It is the
   single enforcement point for categories 1–9 and 13.
2. **S3 lifecycle backstop** — a bucket lifecycle rule should expire objects
   independently of the DB sweep, so an orphaned S3 object is still removed.
3. **Cascade on erasure** — account/project deletion (GDPR Art. 17) must cascade
   to feedback, screenshots, replays, transcripts, and consent rows.
4. **OTP/session hygiene** — short-lived auth artifacts (categories 1–3) are
   deleted aggressively to minimise the bearer-token blast radius.

## Subject-rights interaction

Erasure (Art. 17) and the retention sweep share the same deletion routines in
`lib/retention.ts`. The absence of a subject-erasure endpoint is tracked as a GAP
in PII-DATA-FLOW.md §6 and must be closed alongside this policy.

## Review

This policy is reviewed at least annually and whenever a new data category is
introduced. Owner: `[GAP — assign DPO / security owner]`.
