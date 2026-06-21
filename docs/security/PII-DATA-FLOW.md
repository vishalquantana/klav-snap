# PII Data Flow Map — Klavity Snap

> Prepared for Google CASA Tier 2. Every claim below is grounded in the production codebase
> (`prototype/` backend, libSQL/Turso). Citations are `file:line`. Items the code cannot
> establish are marked `[GAP — needs owner input]` and collected in the final section.
>
> **Scope reviewed:** DB schema (`prototype/lib/db.ts`), HTTP route handlers and external calls
> (`prototype/server.ts`), connectors (`prototype/lib/connectors/`), object storage
> (`prototype/lib/s3.ts`), email/OTP (`prototype/lib/mail.ts`), feedback ingestion + context
> sanitization (`prototype/lib/feedback.ts`), at-rest crypto (`prototype/lib/crypto.ts`),
> reverse proxy (`deploy/Caddyfile`).
> **Last updated:** 2026-06-21 (IST).

---

## 1. PII Categories Collected

Mapped table-by-table from the schema in `prototype/lib/db.ts` (CREATE TABLE block starts at
`prototype/lib/db.ts:37`). Sensitivity is rated for a bug-reporting product where free-text and
captured browser context may incidentally contain anything.

| Category | Data Fields (column → table) | Source | Sensitivity |
|----------|------------------------------|--------|-------------|
| Identity — account | `users.email`, `users.name` (`db.ts:38`) | Email OTP login | High |
| Identity — auth secret | `login_otps.code` + `login_otps.email` (`db.ts:39`) | Generated server-side, emailed to user | High (auth credential) |
| Identity — session | `sessions.id`, `sessions.email` (`db.ts:40`) | Created on OTP verify | High (session token = bearer) |
| Identity — extension/widget token | `extension_tokens.token`, `extension_tokens.email`, `extension_tokens.project_id` (`db.ts:200-202`) | Issued to extension/widget | High (bearer credential) |
| Identity — org membership | `accounts.owner_email`, `accounts.domain` (`db.ts:132`); `account_members.email` (`db.ts:134`); `project_members.email`, `project_members.invited_by` (`db.ts:149-151`); legacy `memberships.email` (`db.ts:42`) | User input / invites | High |
| Professional / org | `accounts.name`, `accounts.domain` (company domain), `projects.name` (`db.ts:139-146`) | User input | Medium |
| Communication — bug reports (free text) | `feedback.observation` (`db.ts:96`), `feedback.source_quote` (`db.ts:102`), `feedback.notes` (`db.ts:403`), `feedback.suggested_bug_json` (`db.ts:100`) | Reporter via extension/widget/SDK; AI Sim reviews | High (unbounded free text, may contain PII) |
| Communication — reporter identity | `feedback.actor_email` (`db.ts:93`), `feedback.assignee` (`db.ts:402`), `feedback.contact_email` (widget lead, `db.ts:426`) | Authed actor / widget lead capture | High |
| Communication — lead capture | `feedback.contact_email` (`db.ts:426`) set via `setFeedbackContactEmail` (`db.ts:768-771`) | Anonymous widget visitor (leadgen mode) | High |
| Behavioral / technical context | `feedback.client_context_json` (`db.ts:411`) — holds **userAgent, screenSize, viewportSize, console errors (incl. stack traces), network failure URLs+status, and arbitrary `identity`/`metadata` key-value maps** (shape in `feedback.ts:21-61`) | Widget/SDK/extension capture | High (UA + free-form identity map; effectively device + user fingerprint) |
| Location-ish (derived) | `feedback.url_host`, `feedback.url_path` (`db.ts:94-95`); same on `activity_events` (`db.ts:117-118`) | Page where report was filed (query string + fragment stripped, `server.ts:1235`) | Medium |
| Behavioral — activity feed | `activity_events.actor_email`, `url_host`, `url_path`, `meta_json` (`db.ts:111-122`) | Server-generated on each action | Medium |
| Visual — screenshots | `screenshots.s3_key` + `screenshots.owner_email` (`db.ts:77-88`); image bytes live in S3, not the DB | User Snap reports (public-read) / Sim live-review (private) | High (screenshots can contain anything on screen) |
| Session replay (DOM recording) | `feedback_replays.events_gz` (`db.ts:347-356`), `walk_replays.segments_gz` (`db.ts:335-343`) — gzipped rrweb DOM event streams | Widget/SDK rrweb capture (opt-in/rolling buffer) | High (replays the user's screen/DOM, incl. typed input unless masked) |
| Voice-of-customer transcripts | `transcripts.raw_text`, `transcripts.title`, `transcripts.speakers_json`, `transcripts.added_by` (`db.ts:157-159`) | Pasted by team (Sim Studio) | High (third-party customer conversation content) |
| Persona / trait provenance | `sim_traits.src_quote`, `src_speaker` (`db.ts:167-168`); `trait_events.quote`, `speaker`, `actor` (`db.ts:171-175`, `db.ts:388`); `persona_edits.actor` (`db.ts:237-239`) | Derived from transcripts + human edits | Medium-High (quotes attributed to named speakers) |
| Connector / integration secrets | `connectors.config` (`db.ts:225`), `integrations.config_json` (`db.ts:47`) — external tracker API tokens, **stored encrypted** (see §3) | Admin input | High (credentials) |
| Connector audit | `ticket_exports.created_by` (`db.ts:232`); `connectors.created_by` (`db.ts:226`) | Server | Medium |
| AI cost ledger | `ai_calls.actor_email` (`db.ts:208`) | Server, per OpenRouter call | Medium |
| Monitoring consent | `monitoring_consent.email` + status (`db.ts:190-193`) | User consent action | Medium |

Note: `feedback.observation`/`source_quote`, `transcripts.raw_text`, screenshots, and session
replays are all **free-form / capture** surfaces — they can contain any PII the user has on screen
or types. They must be treated as High regardless of intent.

---

## 2. Data Entry Points

### Entry Point 1: OTP login — request code
- **Method:** `POST /api/auth/request` (`server.ts:1060`)
- **Data collected:** `email` (body JSON, `server.ts:1063`)
- **Validation:** lowercased/trimmed, must contain `@` (`server.ts:1064-1065`); per-email and per-IP
  issuance throttle (`server.ts:1069`); access-list / invite gate (`server.ts:1071-1072`).
- **Storage:** `login_otps` (email, code, 10-min expiry) via `createOtp` (`db.ts:583-588`, called
  `server.ts:1074`). Prior unused codes for the email are retired but **rows are not deleted**
  (`db.ts:586`). Code is emailed via SendGrid (`server.ts:1077`).

### Entry Point 2: OTP login — verify code
- **Method:** `POST /api/auth/verify` (`server.ts:1083`)
- **Data collected:** `email`, `code` (`server.ts:1086`)
- **Validation:** brute-force lockout per (email,IP) and per-email (`server.ts:1089-1097`);
  single-use + expiry checked in `verifyOtp` (`db.ts:589-594`).
- **Storage:** `users` upsert (`db.ts:597-599`), `accounts`/`account_members`/`projects`/
  `project_members` bootstrap via `ensureAccount` (`db.ts:669-684`), `sessions` row via
  `createSession` (`db.ts:600-602`); session id set as `klav_session` cookie (`server.ts:1115`).

### Entry Point 3: Bug report intake (extension / widget / SDK)
- **Method:** `POST /api/feedback` (`server.ts:1125`) — `multipart/form-data`
- **Data collected:** `description` (≤5000 chars, `server.ts:1145-1148`), `page_url`,
  `observation`, `sentiment`, `severity`, `suggested_bug` (JSON), `sim_id`, `cited_trait_ids`,
  `context` (the client-context JSON, ≤200 KB, `server.ts:1153-1156`), `replay_events` (rrweb,
  ≤6 MB raw, `server.ts:1162-1167`), up to 5 `screenshots` (≤8 MB each, image-type checked,
  `server.ts:1200-1210`), and optionally forwarded Plane creds in legacy direct mode
  (`server.ts:1189-1194`).
- **Validation / scoping:** anonymous browser calls must match first-party Origin and are IP
  rate-limited (`server.ts:1134-1142`); `sim_id` is IDOR-checked against the project
  (`server.ts:1249-1250`); URL query/fragment stripped before storage (`server.ts:1235`); client
  context sanitized + capped by `sanitizeClientContext` (`feedback.ts:21-61`).
- **Storage:** `screenshots` (S3 + ledger row, `server.ts:1238-1244`), `feedback` via
  `insertFeedback` incl. `client_context_json` (`db.ts:917-935`), `feedback_replays`
  (`server.ts:1309-1312`), `activity_events` (`server.ts:1298-1303`); optional downstream push to
  Plane/connectors (see §4).

### Entry Point 4: Widget lead capture (leadgen mode)
- **Method:** `POST /api/widget/lead` (`server.ts:959`)
- **Data collected:** `project_id`, `feedback_id`, `email` (`server.ts:966`)
- **Validation:** first-party Origin required (`server.ts:961-963`); IP rate-limited
  (`server.ts:964`); email regex + ≤200 chars (`server.ts:967`).
- **Storage:** `feedback.contact_email` via `setFeedbackContactEmail` (`db.ts:768-771`). Fires a
  SendGrid lead-alert email to the project's notify address (`server.ts:971-985`).

### Entry Point 5: Sim auto-review / ad-hoc review (live screenshot capture)
- **Method:** `POST /api/sim/review` (`server.ts:1615`)
- **Data collected:** `url`, `screenshotDataUrl` (base64 image), `domSig`, `simIds`
  (`server.ts:1619-1623`).
- **Validation / gates:** auth + project access (`server.ts:1627-1642`), review mode, **per-member
  monitoring consent**, URL allowlist, dedupe, and atomic daily budget — all enforced in order
  before any capture (`server.ts:1644-1686`).
- **Storage:** screenshot uploaded **private** with 30-day expiry hint
  (`server.ts:1691-1696`), `feedback` rows per Sim reaction (`server.ts:1768-1775`). Screenshot
  bytes + the page are sent to OpenRouter for vision review (`reactToPage`, `server.ts:1745`).

### Entry Point 6: Transcript ingest (Sim Studio)
- **Method:** persisted via `insertTranscript` (`db.ts:1273+`); raw third-party conversation text
  stored in `transcripts.raw_text`.
- **Validation:** `[GAP — needs owner input]` — no consent record from the transcript subjects is
  captured; only `added_by` (the internal user) is recorded.

### Entry Point 7: Connector configuration (external tracker credentials)
- **Method:** `POST/PATCH /api/projects/:id/connectors[...]` (`server.ts:2767`, `server.ts:2797`),
  admin-only (`projectAccess('admin')`).
- **Data collected:** tracker host/email/project key + secret API tokens (per-connector fields,
  e.g. `jira.ts:21-31`, `github.ts:6-15`).
- **Storage:** `connectors.config` with secret fields **AES-GCM encrypted** before insert
  (callers encrypt; decrypt at use via `decryptSecret`, `server.ts:1343-1347`).

### Entry Point 8: Inbound connector webhooks (two-way sync)
- **Method:** `POST /api/connectors/:type/webhook` (`server.ts:995`) — **unauthenticated by
  design**, trust established by verifying the provider's signature against the stored
  `inbound_secret` (`server.ts:1021-1054`). Size-capped (128 KB, `server.ts:1008`) and IP
  rate-limited (`server.ts:1002`). Receives external issue status; maps to local `feedback` rows.

### Entry Point 9: Extension config sync / widget token / consent
- `GET /api/extension/config` (`server.ts:1521`) — issues a narrow-scope `extension_tokens` row.
- `POST /api/widget/token` (`server.ts:1555`) — session-cookie gated, origin-allowlisted, mints a
  project-scoped widget token.
- `POST /api/consent` (`server.ts:1540`) — writes `monitoring_consent` (granted/paused/revoked).

---

## 3. Data Storage Map

**At-rest reality:** The datastore is libSQL/Turso (SQLite) (`db.ts:1-7`). There is **no
application-level encryption of PII columns** — emails, names, free-text feedback, transcripts,
client-context blobs, and session/extension tokens are stored in **plaintext**. The only
application-level encryption is AES-GCM-256 for **connector/integration secret tokens**
(`crypto.ts:1-31`), keyed by `KLAV_SECRET`. Any at-rest protection for everything else depends on
the underlying Turso/disk volume encryption, which is **not evidenced in this repo**
(`[GAP — needs owner input]`). In transit, the public endpoint is behind Caddy with automatic
HTTPS (`deploy/Caddyfile:1-13`); the reverse proxy talks to the app over loopback
(`127.0.0.1:4317`).

| Table | PII Columns | Encryption (at rest) | Access Control (cite) |
|-------|-------------|----------------------|------------------------|
| `users` | email, name | Plaintext | Keyed by email PK; reads via session/bearer resolution |
| `login_otps` | email, code | Plaintext | Single-live-code per email (`db.ts:586`); verify by exact email+code+unexpired (`db.ts:590`) |
| `sessions` | id, email | Plaintext (token is the row id) | Lookup by id, expiry-checked (`db.ts:603-609`) |
| `extension_tokens` | token, email, project_id | Plaintext | Bearer resolution; optional project binding (`db.ts:200-202`) |
| `accounts` / `account_members` / `project_members` / `memberships` | emails, owner_email, domain | Plaintext | Role-scoped: `accountRole` (`db.ts:686-689`), `projectAccess` = max(account, project) role (`db.ts:773-783`) |
| `projects` | names, `widget_notify_email`, `widget_cta_url` | Plaintext | `listProjects` filtered by membership (`db.ts:698-707`) |
| `feedback` | observation, source_quote, notes, actor_email, assignee, contact_email, suggested_bug_json, client_context_json, url_host/path | Plaintext | All reads scoped `WHERE project_id=?` (`db.ts:1026-1031`, `db.ts:1034-1041`); writes resolve project via `resolveProject`/`projectById` and IDOR-check sim_id (`server.ts:1226-1250`). Widget-token scoping enforced by project-bound `extension_tokens` |
| `screenshots` | s3_key, owner_email | Plaintext (metadata); image bytes in S3 | Signed-GET endpoint membership-checks `projectAccess` before presign (`server.ts:1593-1607`) |
| `feedback_replays` / `walk_replays` | gzipped DOM recordings | Plaintext (base64 gzip, not encrypted) | Project-scoped read `WHERE project_id=? AND ...` (`db.ts:357`, replay route `server.ts:2545-2554`) |
| `activity_events` | actor_email, url_host/path, meta_json | Plaintext | Project-scoped; non-admins see only own rows via `actor_email` filter (`db.ts:982-993`) |
| `transcripts` / `sim_traits` / `trait_events` / `persona_edits` | quotes, speakers, added_by, actor | Plaintext | Project-scoped queries (`db.ts:160`, `db.ts:169`, `db.ts:240`); persona PUT/edits verify persona∈project (`server.ts:1472-1513`) |
| `monitoring_consent` | email + status | Plaintext | `UNIQUE(project_id,email)` (`db.ts:190-193`) |
| `connectors` / `integrations` | secret tokens + host/email | **Secret fields AES-GCM-256 encrypted** (`crypto.ts:20-31`); non-secret fields plaintext | Project-scoped (`db.ts:227`); admin-only mutate (`server.ts:2767-2830`); redacted on list |
| `ai_calls` | actor_email | Plaintext | Global ops read, gated by `OPS_ADMIN_EMAILS` (per MEMORY) |

S3 objects: **all screenshots are now uploaded `private`** (default changed 2026-06-21, `s3.ts:35`).
The dashboard serves them via the membership-checked `/api/screenshots/:id` endpoint (10-min presigned
GET, `server.ts:1598-1615`); external tracker tickets embed a 7-day presigned URL (`server.ts:1216-1217`).
No screenshot is world-readable. (Legacy rows uploaded before this change may still be `public-read`;
see ENCRYPTION-AT-REST.md for the SSE/backfill note.)

---

## 4. External Data Sharing

| Recipient | Data Shared | Purpose | Legal Basis |
|-----------|-------------|---------|-------------|
| **OpenRouter** (`server.ts:42`, `ENDPOINT`) | For Sim review: the **screenshot image bytes** (base64) + page path + persona/trait context (`reactToPage`, `server.ts:1745`). For persona/insight generation: transcript-derived text. Token usage + cost returned. | LLM vision/text analysis to generate bug reactions & personas | Legitimate interest / contractual (service function). **Sub-processor disclosure + DPA status: `[GAP — needs owner input]`** |
| **SendGrid** (`mail.ts:6`, `mail.ts:27`) | Recipient email + 6-digit OTP code (`mail.ts:9-17`); lead-alert: lead email, report description, page URL, project name (`mail.ts:30-41`) | Transactional email (login codes, lead alerts) | Contractual / legitimate interest. **Sub-processor disclosure: `[GAP]`** |
| **S3 / object storage** (`s3.ts`) | Screenshot image bytes (**all `private`** as of 2026-06-21; served via presigned GET) | Durable screenshot storage | Legitimate interest. SSE-at-rest: confirm/enable (see ENCRYPTION-AT-REST.md) |
| **Plane** (connector + legacy direct, `plane.ts`, `server.ts:1403`) | Ticket title/body incl. **report description, page URL, screenshot URLs, client-context (UA/console/network/identity), Sim citation** (`buildIssueHtml`+`clientContextHtml`, `feedback.ts:111-127`) | Copy bug to customer's tracker | Customer-configured; data controller = customer |
| **Jira** (`jira.ts`) | Title + body (ADF) with same report content | Ticket export | Customer-configured |
| **GitHub Issues** (`github.ts`) | Title + body (report content) | Ticket export | Customer-configured |
| **Linear** (`linear.ts`) | Title + description (report content) | Ticket export | Customer-configured |
| **Generic webhook** (`webhook.ts`) | Full ticket payload JSON incl. report content (`webhook.ts:27`) | Customer-defined sink | Customer-configured |

Outbound connector/Plane/SendGrid/OpenRouter calls to user-supplied hosts go through `safeFetch`
(SSRF-guarded, per-hop validated) — e.g. `jira.ts:50`, `plane.ts:32`, `webhook.ts:25`,
`server.ts:1392-1407`. The connector body **includes the captured `client_context_json`** (UA,
console stacks, network URLs, identity/metadata) — so all of that PII propagates to whichever
external tracker the customer connects.

---

## 5. Data Retention

| Data Category | Retention Period | Deletion Trigger | Deletion Method | Evidence |
|---------------|------------------|------------------|------------------|----------|
| OTP codes (`login_otps`) | 10-min validity; **rows never deleted** | Expiry only marks unusable | None — `createOtp` sets prior `used=1`; `verifyOtp` sets `used=1`; no `DELETE` exists | `db.ts:583-594` |
| Sessions (`sessions`) | `SESSION_DAYS` TTL on `expires_at` | Logout deletes the row; expired rows are read-rejected but **not purged** | `deleteSession` on logout (`db.ts:610-612`, `server.ts:1118-1121`); expiry check (`db.ts:607`) but no sweep | `db.ts:600-612` |
| Extension/widget tokens | Optional `expires_at`; `revoked` flag | None automatic | No deletion/sweep job found | `db.ts:200-202` |
| Feedback / observations / client-context | **Indefinite** | None | No DELETE endpoint for `feedback` exists | `db.ts` (no `DELETE FROM feedback`) |
| Screenshots — Sim/private | `expires_at` = now+30 days **set as a hint** (`server.ts:1691`) but **no deletion job** reads it; S3 lifecycle rule not evidenced | None in code | No purge of `screenshots` rows or S3 objects | `server.ts:1691-1696`, `s3.ts` |
| Screenshots — Snap | **Indefinite** (now **private**, served via presigned GET) | None | None — same no-purge gap as Sim screenshots | `s3.ts:35`, `server.ts:1216-1217` |
| Session replays (`feedback_replays`, `walk_replays`) | Indefinite (size-trimmed oldest-first within a single capture only) | None | None | `db.ts:347-356` |
| Transcripts / traits / trait events | Indefinite | None | No DELETE endpoint | `db.ts:157-176` |
| Personas | Until manual delete | User action | `deletePersona` (`db.ts:867-869`), `DELETE /api/personas/:id` (`server.ts:1502`) | scoped by project |
| Connectors / integrations (secrets) | Until manual delete | Admin action | `deleteConnector`/`deleteIntegration` (`db.ts:827-828`, `db.ts:1903`) | project-scoped |
| `ai_calls` ledger (actor_email) | Indefinite | None | None | `db.ts:206-211` |
| Account / org data (`users`, `accounts`, members) | Indefinite | None | **No account-deletion path; no cascading delete defined** | `db.ts` |

**Summary:** There is no scheduled retention/rotation/cleanup job anywhere in the backend (no cron,
no `setInterval` purge, no TTL sweep). The only deletions are: session-on-logout, and manual
delete of personas/connectors/integrations/trail steps. OTP rows, sessions (post-expiry),
feedback, screenshots (incl. the 30-day "expiresAt" hint), replays, transcripts, and account data
**accumulate indefinitely**.

---

## 6. User Rights (GDPR / CCPA)

| Right | Implementation in code | Status |
|-------|------------------------|--------|
| Access (Art. 15) | A logged-in user can see their own project's feedback/activity via dashboard reads (project-scoped). There is **no self-service "export all my personal data" endpoint**, and no path for a data **subject** (e.g. a person whose email/quote appears in a transcript or a widget lead) to access their data. | `[GAP]` |
| Erasure (Art. 17) | **No account-deletion or per-subject erasure endpoint exists.** No `DELETE /api/account`, no cascading delete across `users`/`feedback`/`screenshots`/`transcripts`/replays. Logout deletes only the session. | `[GAP]` |
| Portability (Art. 20) | **No export/portability endpoint** (no machine-readable per-user dump). | `[GAP]` |
| Rectification (Art. 16) | Partial: a user can edit persona identity fields (`PUT /api/personas/:id`, `server.ts:1469`, audited in `persona_edits`) and feedback status/assignee/notes (`PATCH /api/feedback/:id`, `server.ts:2554`). No way to correct one's own `users.name`/email or a captured `contact_email`/transcript quote. | Partial / `[GAP]` |
| Consent (review capture) | Implemented for live monitoring: per-member-per-project consent (`monitoring_consent`, `db.ts:190-193`) enforced before `/api/sim/review` capture (`server.ts:1646-1662`). Does **not** cover transcript subjects or widget-lead emails. | Partial |

---

## Gaps & Recommendations

1. **At-rest encryption of PII columns** — Only connector secrets are app-encrypted
   (`crypto.ts`); all emails, names, feedback free-text, transcripts, client-context, and
   session/extension tokens are plaintext in SQLite/Turso. *Fix:* confirm and document Turso/disk
   volume encryption, or app-encrypt high-sensitivity columns; record the answer (currently
   `[GAP — needs owner input]`).
2. ✅ **FIXED (2026-06-21) — Snap screenshots were S3 `public-read`** → now uploaded `private`
   (`s3.ts:35`), served via the membership-checked presigned GET (`server.ts:1598-1615`) and a 7-day
   presigned URL in external tickets. Remaining: enable/confirm S3 SSE and backfill ACL on any legacy
   `public-read` rows (see ENCRYPTION-AT-REST.md §3).
3. **No data-retention / TTL job for any category** — OTPs, expired sessions, feedback,
   screenshots (the 30-day `expiresAt` is set but never enforced), replays, transcripts, and
   `ai_calls` accumulate forever. *Fix:* add a scheduled sweep that deletes expired
   `login_otps`/`sessions`/`extension_tokens` and enforces the screenshot `expires_at` + an S3
   lifecycle rule; define a documented retention period for feedback/replays/transcripts.
4. **No account-deletion / right-to-erasure endpoint** (GDPR Art. 17 / CCPA) — *Fix:* add an
   authenticated `DELETE /api/account` that cascades across `users`, `feedback`, `screenshots`
   (+ S3), `feedback_replays`, `activity_events`, `transcripts`, `sim_traits`, `persona_edits`,
   `sessions`, `extension_tokens`, and membership rows.
5. **No data-export / portability endpoint** (Art. 15/20) — *Fix:* add an authenticated
   "export my data" endpoint returning a JSON bundle of the user's account + their project data.
6. **Data-subject rights for non-account subjects unaddressed** — widget-lead emails
   (`feedback.contact_email`), transcript quotes/speakers, and `actor_email` of third parties have
   no access/erasure path. *Fix:* provide an ops/DSAR workflow + endpoint to locate and erase by
   email across `feedback`, `transcripts`, `sim_traits`, `trait_events`.
7. **Transcript subject consent not captured** (`db.ts:157-159`) — raw third-party conversation
   text is stored with only `added_by`. *Fix:* record a lawful-basis/consent attestation at
   transcript upload and document the controller/processor relationship.
8. **Sub-processor disclosure & DPAs** — OpenRouter, SendGrid, and the S3 provider receive PII but
   are not documented as sub-processors in-repo. *Fix:* maintain a sub-processor list + signed DPAs
   (`[GAP — needs owner input]`).
9. **client_context_json propagates broadly** — UA, console stack traces, network URLs, and
   arbitrary `identity`/`metadata` maps are stored and forwarded into every connected external
   tracker (`feedback.ts:111-127`). *Fix:* add field-level redaction/opt-out for the
   identity/metadata map and document what is shared downstream.
10. **Caddy basic_auth left commented out** (`deploy/Caddyfile:8-10`) — the demo note about
    protecting the OpenRouter-spending endpoint is not active. *Fix:* confirm production access
    controls beyond app-level auth, or document why open access is acceptable.

### Open `[GAP — needs owner input]` items requiring non-code answers
- Turso/disk volume encryption status for data at rest (Gap 1).
- OpenRouter / SendGrid / S3 DPA + sub-processor documentation (Gap 8).
- Defined retention periods for feedback, replays, screenshots, transcripts (Gap 3).
- Lawful basis for storing third-party transcript content (Gap 7).
