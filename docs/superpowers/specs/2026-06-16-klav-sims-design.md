# Klav Sims — Authoritative Design Spec

> **Status:** Approved design baseline · **Date:** 2026-06-16 · **Author:** Lead architect (synthesis of a 13-agent design + 3-lens adversarial review)
> **Phase:** Klav Phase 2 (builds on the shipped Klav Snap right-click bug reporter)
> **Repo:** `/Users/vishalkumar/Downloads/qbug/klav-snap` (existing pnpm monorepo)

This document is the single source of truth. Where the ten subsystem designs disagreed, this spec picks **one** shape and states it **once, canonically**. Every HIGH-severity review finding is resolved inline (see §15.3 for the cross-reference table). Read §6.2 (the canonical element-targeting contract) and §14 (the MVP cut-line) first if you are starting a build.

---

## Table of contents

1. [Overview & core loop](#1-overview--core-loop)
2. [Goals, non-goals & success criteria](#2-goals-non-goals--success-criteria)
3. [Product surfaces & UX](#3-product-surfaces--ux)
4. [Architecture & monorepo](#4-architecture--monorepo)
5. [Data model & multi-tenancy](#5-data-model--multi-tenancy)
6. [AI pipelines](#6-ai-pipelines)
7. [Backend API (route table)](#7-backend-api-route-table)
8. [Auth, roles & remote push](#8-auth-roles--remote-push)
9. [Sim character system (@klav/character)](#9-sim-character-system-klavcharacter)
10. [Web app (klav.io)](#10-web-app-klavio)
11. [Extension integration](#11-extension-integration)
12. [Widget SDK](#12-widget-sdk)
13. [Cross-cutting concerns](#13-cross-cutting-concerns)
14. [MVP cut-line & phased roadmap](#14-mvp-cut-line--phased-roadmap)
15. [Open questions, risks & finding resolutions](#15-open-questions-risks--finding-resolutions)

---

## 1. Overview & core loop

**Klav Sims** turns recorded customer/user interviews into *living personas* ("Sims") that watch your product alongside you, react in their own voice — grounded in verbatim things they actually said — and turn each reaction into a tracked bug via the bug-filing pipeline Klav Snap already ships.

### 1.1 The core loop (the one thing the product must prove)

```
①  PM uploads a transcript          → AI extracts a Sim (persona + insights, each anchored to a verbatim quote)
②  Sim is pushed to teammates       → appears in their dock (extension or widget)
③  A teammate browses the product   → the Sim walks to a UI element, points, and reacts in a speech bubble
④  Teammate clicks "→ File bug"     → reaction becomes a real Jira/Linear/GitHub/Plane issue, tagged source:'sim'
⑤  PM enriches the Sim over time    → more transcripts accumulate + dedupe insights with provenance
```

The MVP (§14) must prove **①→③→④ end to end on a real page**: upload a transcript → extract a Sim → the Sim gives a live, grounded reaction on a real page → file that reaction as a bug.

### 1.2 The signature feature, and its single riskiest assumption

The walk-to-and-point-at-an-element behavior depends on a **vision LLM reliably identifying which live DOM element a Sim should point at**. The approved mockup (`sims-resting.html`) *fakes* this with hardcoded `getElementById` targets — it is not evidence the AI can do it on a dense real page.

> **MANDATORY DE-RISK SPIKE (before any backend/infra work):** Take ~15 screenshots of 3 real SaaS apps, hand-build an element map (selector + bbox + text per element), and measure how often a vision LLM returns the correct element ref for a plausible persona reaction. **If accuracy < ~70% on dense pages, the precise "finger on the button" UX is not viable** and the product degrades to "Sim reacts to a region" (bubble near the area, no precise point). The canonical targeting contract (§6.2) is built **selector-primary with bbox fallback** precisely so this degradation is graceful.

### 1.3 How it builds on Klav Snap (what is reused, unchanged)

| Reused from Klav Snap | How Sims uses it |
|---|---|
| `@klav/core/integrations/{jira,linear,github,plane}` `submitReport` | A Sim reaction filed as a bug calls the **same four handlers, server-side**. Zero new integration code. |
| `@klav/core` types `KlavSettings`, `SubmitResult`, `ReportContext`, `ReportType`, `IntegrationConfig` | Sim-filed bugs are shaped identically to Snap bugs so they share one tracker list. |
| The `POST /api/feedback` multipart contract (`backend.ts`) | Preserved byte-for-byte so the deployed Snap SDK/extension keep working. |
| Shadow-DOM isolation pattern (`#klav-host`, `#klav-sdk-host`) | The Sim dock mounts in a third isolated host `#klav-sims-host`. |
| `chrome.tabs.captureVisibleTab` round-trip (`CAPTURE_TAB`) | Reused for Sim reaction screenshots, demuxed by `requestId`. |

---

## 2. Goals, non-goals & success criteria

### 2.1 Goals

- **G1 — Grounded reactions.** Every Sim reaction is anchored to a verbatim quote the real person said. No fabricated opinions. (This is the product's integrity guarantee; quote verification is non-negotiable even in MVP.)
- **G2 — One bug list.** Manual-Snap bugs and Sim-filed bugs land in one tracker, tagged by `source`, filed through the existing integrations.
- **G3 — Three surfaces, one product.** Merged extension, web app (klav.io), embeddable widget — all consuming one backend, one type contract, one character renderer.
- **G4 — Remote push.** PMs push selected Sims to specific members for specific projects in near-real-time; employees consume.
- **G5 — Enrichment.** A Sim deepens as multiple transcripts load; insights accumulate + dedupe with provenance.

### 2.2 Non-goals (explicitly out of scope)

- Real-time *collaborative* editing of Sims (no multiplayer cursors).
- Replacing the Snap right-click reporter (it stays, untouched).
- A general-purpose analytics/BI product (Sim Activity feed and a coverage matrix only).
- SSO/SAML in v1 (the token model must not preclude it later — §8.5).
- Two-way external-tracker sync (Jira webhook → Klav) in v1; Klav is the source of truth, one-way push out.

### 2.3 Success criteria

| ID | Criterion | Target |
|---|---|---|
| SC1 | Quote-verification integrity | 0 reactions reference a quote not present verbatim in the source transcript (enforced by code, not hope) |
| SC2 | Targeting accuracy (post-spike) | ≥70% correct-element on dense pages, else graceful region fallback with no mis-point |
| SC3 | Core-loop latency | p50 ≤ 3.0s from "click Sim" to "bubble shown" (vision path, incl. capture upload + cold tenant connection) |
| SC4 | Bug-filing parity | A Sim-filed bug and a Snap-filed bug are indistinguishable to Jira/Linear/GitHub/Plane except the `source` tag |
| SC5 | No host-page regression | Idle dock = 0 forced reflows on the host page; Snap flow unchanged with Sims enabled |
| SC6 | Tenant isolation | An unauthorized member can never read another member's Client Sim (enforced server-side at 3 chokepoints — §8.4) |

---

## 3. Product surfaces & UX

Faithful to the three approved mockups: `sims-resting.html` (dock + walk + point + bubble + file), `fab-flow.html` (FAB + toast), `webapp-mock.html` (the web app).

### 3.1 The dock & character (extension + widget, shared renderer)

The dock is a **corner "sofa"** of resting Sims, anchored bottom-right (`#klav-sims-host`, `position:fixed`, `z-index 2147483647`, pointer-events gated). Each resting Sim has:

- A round head with initials + persona gradient.
- **Idle bob** (CSS `@keyframes bob`, 2.5s, staggered per Sim) and **glancing eyes** (`@keyframes look`).
- Two legs (decorative) and a name label below.
- A **status dot**: `idle` (grey `#a6adc8`) · `active` (pulsing green `#a6e3a1`) · `thinking` (pulsing yellow `#f9e2af`).
- A dock label, e.g. "3 sims watching".

**Two entry points to a reaction** (both supported; mockups show both):

1. **FAB + toast flow** (`fab-flow.html`): a corner FAB with stacked persona initials and an unread badge ("2"). Tapping it surfaces **toasts** — one per Sim with feedback for this page — each showing name, role, emotion glyph, the verbatim reaction, and a primary `→ File bug` action plus `Dismiss`. A "View all" long-press opens a panel listing every Sim's mood + current-page reaction, with `Ask a sim…` and `File all →`.
2. **Walk-to-element flow** (`sims-resting.html`): on demand (click a docked Sim) or proactively (post-v1), the Sim **walks out** of the dock to the target element, **points** (up/left/right with a finger glyph), and shows a **speech bubble** with `emotion + reaction text + "→ File bug"`. After the bubble is dismissed it **walks back** to the dock.

> **Animation correctness vs the mockup:** the mockup animates `left`/`bottom` inside a `position:absolute` container it owns, which would thrash a real host page's layout. The real renderer animates **only via `transform: translate3d()`** inside one `position:fixed` shadow host, reading host element geometry **once** per target then re-reading only on throttled scroll/resize. See §9.

### 3.2 Reaction → bug toast (file flow)

Clicking `→ File bug` produces a confirmation toast (`fab-flow.html` step ③): `✅ Filed to Jira · UX-247 — "Approval list not sorted by urgency" · Reported by Sarah Chen (Sim) · /dashboard · View in Jira →`. The reaction's `suggestedBug` seeds the issue title/body; the persona attribution and page URL go in the body. The bug appears in the web-app tracker tagged `🧬 Sim-filed`.

### 3.3 Web app (klav.io) — faithful to `webapp-mock.html`

A single-page app with a left sidebar shell:

| Sidebar group | Items |
|---|---|
| **Bugs** | 🐛 Bug Tracker (badge: open count) · 📊 Analytics |
| **Klav Sims** | 🧬 Personas (badge: Sim count) · 📝 Transcripts |
| **Workspace** | 👥 Team · ⚙️ Settings |

Footer: a workspace pill (green dot, user name, role e.g. "Project Manager").

- **Bug Tracker** — a filterable table with chips `All (n)` · `🧬 Sim-filed (n)` · `📸 Snap (n)` · `Open` · `In Progress`, a search box, and `Export CSV` + `+ New Bug` actions. Columns: Title · Source (`🧬 <Sim name>` or `📸 Manual Snap`) · Priority (dot) · Status (pill) · Assignee (avatar pip) · Filed. Row click → detail drawer (screenshots, external issue link, inline status/priority/assignee edits).
- **Personas (Sim editor)** — three columns: (left) an **upload zone** ("Drop a transcript… Zoom, Meet, Loom, .txt, .docx, .pdf") + a Sim card list (avatar gradient, name, role, `Client`/`Internal` badge, trait chips with pos/neg sentiment; Internal Sims dimmed/"excluded from push"); (right) a detail card with the persona header ("Extracted from '…' · 2 transcripts loaded", `Edit` / `Enrich ↓`), **Insights** grouped `Pain` / `Want` / `Loves` each with the de-duped statement + an italic verbatim quote, a **Pushed to** pip row ("4 team members have this sim active" + `↑ Push update`), and a **source transcript excerpt** with the quote spans highlighted.
- **Transcripts** — cards with title, source kind + duration + speaker count, extracted-speaker chips, status ("✓ 6 insights extracted"), and a drop zone to enrich existing Sims.
- **Team** — member list (avatar, name, role, the Sim "pips" each has), a **Recent Sim Activity** feed ("Vishal pushed Sarah Chen sim update to all 4 members", "Sarah Chen sim filed 3 bugs across Tara's session on /approvals"), and a **Sim Coverage matrix** (Sim × member ✅/—). `↑ Push to Team` and `+ Invite` actions.
- **Settings** — pick the workspace/project integration (jira/linear/github/plane) and enter credentials (written server-side, never read back); only `configured` booleans return.

### 3.4 Empty / error / offline states (required for v1 — review gap)

| Surface | State | Behavior |
|---|---|---|
| Dock | offline / backend unreachable | show **cached roster read-only**, status dot shows `offline`; no reaction calls |
| Dock | `reaction:null` (LLM has nothing relevant) | Sim **does not walk out**; no empty bubble |
| Dock | pushed persona deleted/revoked mid-walk | graceful **auto-rest** back to dock |
| Web app | tracker empty | real "no bugs yet" empty state (not a spinner) |
| Web app | external tracker down on file | persist locally `filingStatus:'failed'`, show "filed locally, not synced to Jira" + retry |
| Transcripts | extraction `failed` (e.g. image-only PDF) | actionable error ("This PDF had no extractable text") + one-click re-run |
| Ask-a-Sim | no relevant insights | in-character "I don't have notes on that" — never a hallucinated answer |
| Widget | CSP blocks both screenshot and fetch | bail **silently**; never break the host page |

---

## 4. Architecture & monorepo

### 4.1 Target monorepo tree

> **MVP note (§14):** The full tree below is the **v1.1+ target**. For the MVP, defer Turbo/Changesets/TS-project-references and the per-org-DB split; keep `pnpm -r`. The `apps/web` framework is **React + Vite**, not Next.js (resolved finding — §15.3-F17). The cross-cutting types package is **`@klav/sims-core`** (single source of truth; there is no separate `@klav/shared` — resolved finding F17).

```
klav-snap/
├─ package.json                 # root scripts; (v1.1) packageManager + turbo + changesets
├─ pnpm-workspace.yaml          # globs: packages/*, apps/*, services/*, tooling/*
├─ pnpm-lock.yaml
├─ turbo.json                   # (v1.1) build/dev/test/lint/typecheck pipelines
├─ tsconfig.json                # (v1.1) solution file referencing composite packages
│
├─ packages/
│  ├─ core/                     # @klav/core  (UNCHANGED) Snap primitives, source-only TS
│  │  └─ src/{index,types,submit,modal,annotator,crop}.ts
│  │     src/integrations/{jira,linear,github,plane,backend}.ts
│  ├─ sims-core/               # @klav/sims-core  (NEW, tsup) — THE single source of truth for
│  │  │                          all Sims domain + AI + stream + auth-claim + bug DTO contracts
│  │  └─ src/{index,persona,insight,reaction,transcript,push,bug,stream,auth,ai-contracts,bug-bridge}.ts
│  ├─ character/               # @klav/character  (NEW, tsup) — animated dock; shadow-DOM, zero-dep
│  │  └─ src/{index,types,dock,sim,render,styles,geometry,a11y}.ts
│  ├─ sims-engine/             # @klav/sims-engine (NEW, tsup) — client capture + element-map +
│  │  │                          target resolution; shared by extension content + widget
│  │  └─ src/{capture,element-map,resolve,redact,trigger}.ts
│  ├─ sdk/                      # @klav/snap  (existing) — Snap reporter + new KlavSims widget entry
│  │  └─ src/{index,snap}.ts  src/sims/{index,client,stream,capture,dock,target,types}.ts
│  ├─ extension/               # @klav/extension (extended) — merged Snap + Sims MV3
│  │  └─ src/{background,content,options,popup}.ts
│  │     src/sims/{sims-controller,sims-bridge,sims-reaction}.ts
│  │     src/background/{sims-auth,sims-api,sims-sync}.ts
│  └─ db/                      # @klav/db (NEW) — Drizzle schema + migrations + routing
│     └─ src/{index,client,router,provision,encryption}.ts  src/schema/{control,tenant}.ts  migrations/
│
├─ apps/
│  └─ web/                     # klav.io React + Vite SPA (PRIVATE) — tracker + Sim/transcript/admin
│     └─ src/{router,lib,routes,components}/…
│
├─ services/
│  └─ api/                     # Bun + Hono backend (PRIVATE)
│     └─ src/{index,app}.ts  src/routes/{auth,workspaces,projects,members,personas,transcripts,
│        reactions,ask,bugs,integrations,push,stream,feedback,assets}.ts
│        src/{llm,storage,jobs,rag,middleware}/…  src/integrations/file.ts
│
└─ tooling/                    # (v1.1) @klav/tsconfig, @klav/eslint-config, @klav/vitest-config
```

### 4.2 Package dependency edges (the seams)

```
@klav/core  ──────────────────────────────────►  (UNCHANGED, Snap-only, ZERO Sims types)
      ▲
      │ (type re-export of ReportType, ReportContext, SubmitResult, IntegrationConfig, KlavSettings, IntegrationType)
      │
@klav/sims-core  ◄── owns Persona, Insight, SimQuote, ElementTarget, SimReaction, Bug DTO,
      ▲   ▲   ▲        KlavStreamEvent, KlavAccessClaims, PushedPersona, push DTOs, AI contracts
      │   │   │
      │   │   └────────────────────────────┐
      │   └──────────────┐                 │
@klav/character     @klav/sims-engine     services/api  ──►  @klav/db ──► @klav/core (type-only)
      ▲                   ▲   ▲                  ▲
      │                   │   │                  │
   apps/web ──────────────┘   │                  │ (consumes DTOs, never redefines)
      │                       │
 packages/extension ──────────┘   (also ──► @klav/character, @klav/core)
 packages/sdk (widget) ───────────┘   (also ──► @klav/character, @klav/core)
```

**Hard invariants (enforced by an eslint/dependency-cruiser rule):**

- **INV-1:** `@klav/core` gains **zero** Sims types. It stays the Snap-only source-only package. (Resolves the layering inversion — F8.) The AI/Backend/Extension designs' proposals to add `persona.ts`/`sims-types.ts` *into core* are **rejected**; those definitions live in `@klav/sims-core`.
- **INV-2:** `@klav/core` must **never** import `@klav/sims-core` (would create a cycle). The arrow is one-way: `sims-core → core`.
- **INV-3:** Every cross-subsystem shape (element target, reaction, persona, insight, bug DTO, stream event, auth claims) is **defined once in `@klav/sims-core`** and **imported, never redefined** by any other package. (Resolves F1, F3, F6, F7, F11.)
- **INV-4:** The existing `@klav/core` subpath specifiers (`@klav/core/annotator`, `/crop`, `/submit`, `/modal`, `/integrations/*`) stay byte-compatible. The extension and SDK Snap paths are not touched.

### 4.3 Additive-only changes to `@klav/core`

Three small **additive, optional** changes (each verified safe against the current source; the existing 22-test suite must stay green):

1. Add `'backend'`-free `IntegrationType` clarity: `IntegrationType` stays `'jira'|'linear'|'github'|'plane'`. **`'backend'` is NOT added** to it (resolves F2). "File to Klav only / no external tracker" is represented as `integration: null` on the bug row, never as an `IntegrationType` member.
2. `KlavSettings` gains an **optional nested `sims?` object** (UI prefs only — §11) and an optional `session?` reference. Both default-merged at every `{...DEFAULT_SETTINGS}` spread site (5 sites). A settings-shape migration handles existing stored objects.
3. **No `ReportContext.source` change.** `source` + sim provenance are **top-level fields of the bug-filing request**, server-authoritative; `ReportContext` stays unchanged (resolves F15, keeps INV-1 honest).

---

## 5. Data model & multi-tenancy

### 5.1 Multi-tenancy decision (canonical)

The full design specifies **one Turso/libSQL DB per organisation + a control-plane DB**. The feasibility review correctly flags this as premature for proving the loop.

**Canonical, phased decision:**

- **MVP (v1):** **ONE shared libSQL/SQLite DB** with an `org_id` column on every tenant table and a **single audited scoping helper** (`withOrg(orgId)`) that every query goes through. No Turso provisioning, no control/tenant split on the wire, no fan-out migrator. The schema is written **with `org_id` columns from day one** so the later split to DB-per-org is mechanical.
- **v1.1+:** Promote to **control-plane DB + per-org Turso DB** (physical isolation) when a real enterprise customer requires it. The two-tier schema and routing layer below are the **target** design; the MVP is the same schema collapsed to one file with `org_id` scoping.

Either way, the **table shapes and the `@klav/sims-core` DTOs are identical** — code does not change shape across the migration, only the connection router does.

### 5.2 Scoping unit (canonical — resolves F9)

| Entity | Scope | Rationale |
|---|---|---|
| personas (Sims), transcripts, insights, quotes | **workspace** | A Sim is a *person*, reusable across projects. |
| bugs, reactions, push_assignments, integration_configs, widget originAllowlist | **project** | A bug is filed to a specific tracker for a specific app. |
| `persona_assignment` | carries **both** `personaId` (workspace-level) + `projectId` (delivery scope) | bridges the two. |

All routes use this: `/workspaces/:wsId/personas`, `/workspaces/:wsId/transcripts`; `/projects/:pid/bugs`, `/projects/:pid/reactions`, `/projects/:pid/push`. (The Backend design's project-scoped `/projects/:pid/personas` is corrected to workspace-scoped.)

### 5.3 Identity key (canonical — resolves F5)

**`membershipId` (`mem_…`) is THE recipient/actor key for everything tenant-scoped** (assignments, pushes, reactions, bugs reporter/assignee). A user belongs to many orgs, so a tenant row must be unambiguous per-org. `userId` lives **only** in the control plane (`users`, `memberships` join). **Rule: never address tenant data by `userId`.** The web-app push composer resolves its UI "members" to `membershipId` before calling the push endpoint.

### 5.4 Control-plane schema (Drizzle, SQLite/libSQL)

> In MVP these live in the one shared DB alongside tenant tables; in v1.1 they live in the control-plane DB.

```ts
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                 // usr_<ulid>
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),         // null if OAuth-only
  emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey(),                 // org_<ulid>
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  plan: text('plan', { enum: ['free','team','enterprise'] }).notNull().default('free'),
  status: text('status', { enum: ['provisioning','active','suspended','deleting'] }).notNull().default('active'),
  // v1.1 (per-org Turso) only — null in MVP shared-DB mode:
  tursoDbUrl: text('turso_db_url'),
  tursoDbTokenEnc: text('turso_db_token_enc'), // envelope-encrypted, carries key-id for rotation
  storageBucket: text('storage_bucket').notNull(),
  schemaVersion: integer('schema_version').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(),                 // mem_<ulid> — THE downstream identity key
  userId: text('user_id').notNull().references(() => users.id),
  orgId: text('org_id').notNull().references(() => orgs.id),
  role: text('role', { enum: ['owner','admin','pm','member'] }).notNull(),
  status: text('status', { enum: ['invited','active','removed'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({ uq: uniqueIndex('uniq_user_org').on(t.userId, t.orgId) }))

export const deviceSessions = sqliteTable('device_sessions', {
  id: text('id').primaryKey(),                 // dev_<ulid> — addressable by push hub (v1.1)
  membershipId: text('membership_id').notNull().references(() => memberships.id),
  surface: text('surface', { enum: ['web','extension','widget'] }).notNull(),
  userAgent: text('user_agent'),
  webPushSub: text('web_push_sub'),            // v1.1 only
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => deviceSessions.id),
  familyId: text('family_id').notNull(),       // rotation family for reuse-detection (v1.1; MVP = single session token)
  tokenHash: text('token_hash').notNull(),     // sha256 of the opaque token
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const invites = sqliteTable('invites', {
  token: text('token').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  email: text('email').notNull(),
  role: text('role', { enum: ['admin','pm','member'] }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
})

// Control-plane index so an inbound integration webhook (knows only the issueKey) finds the owning org+bug
export const bugIndex = sqliteTable('bug_index', {
  id: text('id').primaryKey(),                 // mirrors tenant bugs.id
  orgId: text('org_id').notNull().references(() => orgs.id),
  integration: text('integration', { enum: ['jira','linear','github','plane'] }).notNull(),
  issueKey: text('issue_key'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({ lookup: index('bugidx_lookup').on(t.integration, t.issueKey) }))
```

### 5.5 Tenant schema (Drizzle, SQLite/libSQL)

All tenant tables carry `orgId` (used directly in MVP shared-DB; redundant-but-harmless in v1.1 per-org-DB). IDs are application-generated **ULIDs**; timestamps are integer epoch-ms; JSON via `text({mode:'json'})`.

```ts
// ---- members mirror (so tenant FKs don't cross-DB join in v1.1) ----
export const members = sqliteTable('members', {
  id: text('id').primaryKey(),               // == control memberships.id (mem_…)
  orgId: text('org_id').notNull(),
  userId: text('user_id').notNull(),         // == control users.id (no cross-DB FK)
  email: text('email').notNull(),
  name: text('name'),
  role: text('role', { enum: ['owner','admin','pm','member'] }).notNull(),
  createdAt: integer('created_at').notNull(),
})

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),               // wsp_…
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  createdBy: text('created_by').references(() => members.id),
  createdAt: integer('created_at').notNull(),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),               // prj_…
  orgId: text('org_id').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  baseUrl: text('base_url'),                 // product origin Sims live on
  originAllowlist: text('origin_allowlist', { mode: 'json' }).$type<string[]>(),
  integrationConfigId: text('integration_config_id'),
  createdAt: integer('created_at').notNull(),
})

// ---- personas (Sims) ----  WORKSPACE-scoped (§5.2)
export const personas = sqliteTable('personas', {
  id: text('id').primaryKey(),               // sim_…
  orgId: text('org_id').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  role: text('role'),
  kind: text('kind', { enum: ['client','internal'] }).notNull().default('client'),
  excludedFromPush: integer('excluded_from_push', { mode: 'boolean' }).notNull().default(false),
  avatarSeed: text('avatar_seed').notNull(), // deterministic sprite seed for @klav/character
  summary: text('summary'),                  // 2-4 sentence character brief sent to the vision LLM
  goals: text('goals', { mode: 'json' }).$type<string[]>().notNull().default('[]'),
  emotionBaseline: text('emotion_baseline'), // neutral|frustrated|enthusiastic|skeptical
  transcriptCount: integer('transcript_count').notNull().default(0),
  version: integer('version').notNull().default(1), // bumped on enrichment/edit; the pushed value
  status: text('status', { enum: ['draft','active','archived'] }).notNull().default('draft'),
  createdBy: text('created_by').references(() => members.id),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({ wsIdx: index('persona_ws_idx').on(t.workspaceId) }))

// ---- transcripts ----
export const transcripts = sqliteTable('transcripts', {
  id: text('id').primaryKey(),               // trn_…
  orgId: text('org_id').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  title: text('title').notNull(),
  source: text('source', { enum: ['upload','zoom','meet','loom','manual'] }).notNull().default('upload'),
  rawRef: text('raw_ref').notNull(),         // object-storage key of the raw file
  canonicalRef: text('canonical_ref'),       // object-storage key of the frozen canonical text
  canonicalLen: integer('canonical_len'),    // length of canonical text; client asserts before highlight
  durationMin: integer('duration_min'),
  language: text('language').default('en'),
  status: text('status', { enum: ['queued','parsing','diarising','review_pending','extracting','reducing','classifying','enriching','done','failed'] }).notNull().default('queued'),
  error: text('error'),
  uploadedBy: text('uploaded_by').references(() => members.id),
  createdAt: integer('created_at').notNull(),
}, (t) => ({ wsIdx: index('transcript_ws_idx').on(t.workspaceId) }))

export const transcriptSpeakers = sqliteTable('transcript_speakers', {
  id: text('id').primaryKey(),               // spk_…
  transcriptId: text('transcript_id').notNull().references(() => transcripts.id),
  displayName: text('display_name').notNull(),
  detectedRole: text('detected_role'),
  kind: text('kind', { enum: ['client','internal'] }).notNull().default('client'),
  personaId: text('persona_id').references(() => personas.id),
  utteranceCount: integer('utterance_count').notNull().default(0),
}, (t) => ({ trnIdx: index('speaker_trn_idx').on(t.transcriptId) }))

// ---- insights + quotes (canonical: normalized 1:N for multi-transcript provenance — resolves F16) ----
export const insights = sqliteTable('insights', {
  id: text('id').primaryKey(),               // ins_…
  personaId: text('persona_id').notNull().references(() => personas.id),
  kind: text('kind', { enum: ['pain','want','love'] }).notNull(),
  statement: text('statement').notNull(),    // <=140 chars, 3rd person, de-duped
  topic: text('topic').notNull(),            // lowercase cluster tag
  confidence: real('confidence').notNull().default(0.5),
  salience: real('salience').notNull().default(0.5),
  relatedUiHints: text('related_ui_hints', { mode: 'json' }).$type<string[]>().notNull().default('[]'),
  contentHash: text('content_hash').notNull(), // fast pre-filter only (NOT a unique constraint)
  createdFromTranscriptId: text('created_from_transcript_id').references(() => transcripts.id),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({ pIdx: index('insight_persona_idx').on(t.personaId) }))

export const insightQuotes = sqliteTable('insight_quotes', {
  id: text('id').primaryKey(),               // qot_…
  insightId: text('insight_id').notNull().references(() => insights.id),
  transcriptId: text('transcript_id').notNull().references(() => transcripts.id),
  speakerId: text('speaker_id').references(() => transcriptSpeakers.id),
  text: text('text').notNull(),              // verbatim; canonicalText.slice(start,end) === text
  charStart: integer('char_start').notNull(),// offset into FROZEN canonical text (resolves F12)
  charEnd: integer('char_end').notNull(),
  tStart: real('t_start'),                   // seconds, if source had timing
  recordedAt: text('recorded_at'),
}, (t) => ({ iIdx: index('quote_insight_idx').on(t.insightId) }))

export const insightEmbeddings = sqliteTable('insight_embeddings', {  // v1.1 (enrichment/Ask-a-Sim)
  insightId: text('insight_id').primaryKey().references(() => insights.id),
  personaId: text('persona_id').notNull(),
  model: text('model').notNull(),
  vector: blob('vector').notNull(),          // Float32Array bytes for cosine RAG
})

export const insightConflicts = sqliteTable('insight_conflicts', {   // v1.1 (enrichment)
  id: text('id').primaryKey(),
  personaId: text('persona_id').notNull(),
  topic: text('topic').notNull(),
  insightAId: text('insight_a_id').notNull(),
  insightBId: text('insight_b_id').notNull(),
  note: text('note').notNull(),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  resolution: text('resolution'),            // keep_a|keep_b|keep_both|merged
})

// ---- reactions ----  PROJECT-scoped (§5.2)
export const reactions = sqliteTable('reactions', {
  id: text('id').primaryKey(),               // rxn_…  == ReactionResponse.reactionId
  orgId: text('org_id').notNull(),
  personaId: text('persona_id').notNull().references(() => personas.id),
  projectId: text('project_id').references(() => projects.id),
  memberId: text('member_id').references(() => members.id), // WHO saw it (mem_, never usr_) — resolves F5
  pageUrl: text('page_url').notNull(),
  routeKey: text('route_key').notNull(),     // origin + pathname (+ significant hash) for dedup
  screenshotRef: text('screenshot_ref'),     // object-storage key (null in DOM-text mode)
  reaction: text('reaction').notNull(),      // the speech-bubble text
  emotion: text('emotion', { enum: ['love','happy','neutral','confused','frustrated','angry'] }).notNull(), // canonical SimEmotion (§6.2)
  elementTarget: text('element_target', { mode: 'json' }).$type<ElementTarget>().notNull(),
  suggestedBug: text('suggested_bug', { mode: 'json' }).$type<SuggestedBug | null>(),
  anchorQuote: text('anchor_quote'),         // verbatim line grounding the reaction
  groundedInsightId: text('grounded_insight_id').references(() => insights.id),
  trigger: text('trigger', { enum: ['on_demand','proactive'] }).notNull().default('on_demand'),
  dedupKey: text('dedup_key').notNull(),     // sha256(personaId+routeKey+elementSignature+insightHash)
  filedBugId: text('filed_bug_id'),
  costUsd: real('cost_usd').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  personaIdx: index('rxn_persona_idx').on(t.personaId),
  dedupUq: uniqueIndex('rxn_dedup_uq').on(t.personaId, t.memberId, t.dedupKey), // v1.1 (dedup); v1 may omit
}))

// ---- bugs (unifies Snap + Sim — canonical shape, resolves F6) ----  PROJECT-scoped
export const bugs = sqliteTable('bugs', {
  id: text('id').primaryKey(),               // bug_… (mirrored to control bug_index)
  orgId: text('org_id').notNull(),
  projectId: text('project_id').references(() => projects.id),
  source: text('source', { enum: ['snap','sim'] }).notNull(),
  reactionId: text('reaction_id').references(() => reactions.id),      // set when source='sim'
  personaId: text('persona_id').references(() => personas.id),          // set when source='sim'
  reporterMemberId: text('reporter_member_id').references(() => members.id),
  assigneeMemberId: text('assignee_member_id').references(() => members.id),
  type: text('type', { enum: ['bug','feature'] }).notNull().default('bug'), // == @klav/core ReportType
  title: text('title').notNull(),
  description: text('description').notNull(),
  context: text('context', { mode: 'json' }).$type<ReportContext>(),   // @klav/core ReportContext
  screenshotRefs: text('screenshot_refs', { mode: 'json' }).$type<string[]>().notNull().default('[]'), // object KEYS (web resolves to signed URLs on read)
  priority: text('priority', { enum: ['high','med','low'] }).notNull().default('med'),
  status: text('status', { enum: ['open','in_progress','done'] }).notNull().default('open'),
  integration: text('integration', { enum: ['jira','linear','github','plane'] }), // null = filed to Klav only (NO 'backend' — resolves F2)
  integrationRef: text('integration_ref', { mode: 'json' }).$type<{ issueKey: string; issueUrl: string } | null>(), // == SubmitResult
  filingStatus: text('filing_status', { enum: ['pending','filed','failed'] }).notNull().default('pending'),
  filingError: text('filing_error'),         // surfaced in the tracker drawer (no silent swallow)
  pageUrl: text('page_url'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({ projIdx: index('bug_proj_idx').on(t.projectId), srcIdx: index('bug_src_idx').on(t.source) }))

// ---- integration configs (verbatim KlavSettings, encrypted) ----  PROJECT-scoped
export const integrationConfigs = sqliteTable('integration_configs', {
  id: text('id').primaryKey(),               // icfg_…
  orgId: text('org_id').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id),
  type: text('type', { enum: ['jira','linear','github','plane'] }).notNull(), // == @klav/core IntegrationType
  label: text('label').notNull(),
  settingsEnc: text('settings_enc').notNull(), // encrypt(JSON of @klav/core KlavSettings shape), key-id prefixed
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by').references(() => members.id),
  createdAt: integer('created_at').notNull(),
}, (t) => ({ projIdx: index('icfg_proj_idx').on(t.projectId) }))

// ---- push assignments (the authorization grant) ----
export const pushAssignments = sqliteTable('push_assignments', {
  id: text('id').primaryKey(),               // asn_…
  orgId: text('org_id').notNull(),
  personaId: text('persona_id').notNull().references(() => personas.id),
  memberId: text('member_id').notNull().references(() => members.id),    // recipient (mem_)
  projectId: text('project_id').notNull().references(() => projects.id),
  pushedBy: text('pushed_by').notNull().references(() => members.id),
  pushedVersion: integer('pushed_version').notNull(), // persona.version at push time
  status: text('status', { enum: ['active','revoked'] }).notNull().default('active'),
  deliveredAt: integer('delivered_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({ uq: uniqueIndex('asn_uq').on(t.personaId, t.memberId, t.projectId), memIdx: index('asn_member_idx').on(t.memberId, t.status) }))

// ---- one stream event log (drives push + activity + bug + transcript events) — resolves F10 ----
export const streamEvents = sqliteTable('stream_events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }), // global monotonic within the DB; SSE id
  orgId: text('org_id').notNull(),
  memberId: text('member_id'),               // recipient for member-scoped events; null = workspace-broadcast
  workspaceId: text('workspace_id'),
  type: text('type').notNull(),              // KlavStreamEvent['type'] (§8.6)
  payload: text('payload', { mode: 'json' }).notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({ byMember: index('evt_member_seq').on(t.memberId, t.seq), byWs: index('evt_ws_seq').on(t.workspaceId, t.seq) }))

// ---- usage counters (cost guard — review gap) ----
export const usageCounters = sqliteTable('usage_counters', {
  orgId: text('org_id').notNull(),
  period: text('period').notNull(),          // 'YYYY-MM'
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  budgetUsd: real('budget_usd'),             // monthly ceiling; null = plan default
}, (t) => ({ pk: uniqueIndex('usage_pk').on(t.orgId, t.period) }))

// ---- async jobs (transcript processing) ----
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  kind: text('kind').notNull(),              // 'process_transcript' | 'enrich'
  payload: text('payload', { mode: 'json' }),
  status: text('status', { enum: ['queued','running','done','error'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  progress: integer('progress').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  droppedQuotes: integer('dropped_quotes').notNull().default(0),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})
```

### 5.6 Routing & secrets API (`@klav/db`)

```ts
getDb(): LibSQLDatabase<typeof schema>                  // MVP: the one shared DB
// v1.1 routing:
resolveOrgDb(orgId): Promise<{ db, org }>              // control lookup → decrypt token → LRU-cached client
resolveOrgDbForMember(membershipId, orgId): Promise<{ db, org, member: { id, role } }> // + membership guard
provisionOrg(input): Promise<Org>                       // v1.1: Turso Platform API create + migrate + seed
deprovisionOrg(orgId): Promise<void>                    // v1.1: delete Turso DB + purge storage prefix
migrateTenant(dbUrl, token?): Promise<{from,to}>        // v1.1: fan-out migrator, per-tenant failure isolation
encryptSecret(plaintext): string                        // AES-256-GCM, key-id prefixed (envelope rotation)
decryptSecret(ciphertext): string
buildIntegrationConfig(bug, cfgRow): IntegrationConfig  // decrypt settings → @klav/core IntegrationConfig
```

### 5.7 Migration strategy (review gap)

- **Additive-only releases** (expand → backfill → contract). No destructive migration in a single deploy.
- **v1.1 per-tenant fan-out:** `migrate:all` iterates orgs, **per-tenant failure isolation** with retry, maintains a `schemaVersion` per org and an operator "blocked orgs" view; writes to orgs below the required version are blocked.
- **Settings-shape migration** for existing extension users: deep-default the new `sims` object on read of any stored `klavSettings` that predates it.
- **Legacy `/api/feedback` tenant routing:** a deployed Snap SDK in backend mode sends no auth. Resolve by encoding the org in the `backendUrl` the SDK is configured with (per-org ingest URL) OR a publishable-key header during a migration window. A **contract test** asserts the exact `{ id, jira_key?, issue_url? }` response bytes against what `backend.ts` parses.

---

## 6. AI pipelines

Three AI tasks, all routed through the backend AI gateway (`services/api/src/llm`) — **clients never call a model provider directly** (keeps keys server-side, enables prompt caching, central cost accounting).

**Provider interface (one seam for all three tasks):**

```ts
export interface LlmDriver {
  complete(p: { system?: string; messages: LlmMessage[]; json?: boolean; maxTokens?: number; model?: string }): Promise<{ text: string; usage: Usage }>
  stream(p:   { system?: string; messages: LlmMessage[]; maxTokens?: number; model?: string }): AsyncIterable<{ delta: string }>
  vision(p:   { system?: string; imageDataUrl: string; prompt: string; json?: boolean; maxTokens?: number }): Promise<{ text: string; usage: Usage }>
  embed(texts: string[]): Promise<number[][]>
}
export interface Usage { inputTokens: number; outputTokens: number; cachedInputTokens?: number; costUsd: number }
```

**Default models:** Claude Sonnet for extraction/reduce + vision reaction; Claude Haiku for cheap classification/dedup-triage; a small embedding model (e.g. text-embedding-3-small / voyage-3-lite) for RAG. GPT-4o (and OpenAI-compatible local endpoints) are a per-org configurable drop-in fallback. Self-host BYO-model is supported via the `local` driver.

### 6.1 Task A — Transcript → Persona extraction

**MVP scope (feasibility-cut):** accept `.txt` / pasted text and `.vtt` only (these carry speaker labels, killing diarization risk). **Single-shot** LLM call (no map-reduce, no chunking) for transcripts within the model's context window. The **one non-negotiable control ships in MVP:** verify every returned quote is a verbatim substring of the source and **drop it if not**.

**v1.1+ scope:** docx/pdf parsers, magic-byte detection, OCR/empty guard, immutable canonicalization with frozen offsets, LLM diarization for unlabeled prose, a human speaker-review pause (`review_pending`), speaker-turn-aligned overlapping map-reduce chunking, salience normalization.

**Canonicalization (the integrity backbone):** the transcript is folded into one **immutable normalized string** (`canonicalText`, stored in object storage, length recorded as `transcripts.canonicalLen`). **All quote offsets index into `canonicalText` only** and it is **never re-normalized on read** (resolves F12). The web app's transcript viewer fetches the exact `canonicalText` as `transcript.body` and asserts `body.length === canonicalLen` before highlighting `[charStart, charEnd)`.

**Quote verification (mandatory, MVP):** for each returned quote, assert `canonicalText.slice(start,end) === quote`; if not exact, normalize whitespace/case and snap; if no ≥0.92 token-overlap match exists, **drop the insight** and increment `jobs.droppedQuotes`.

**Pipeline (state machine, `services/api/src/jobs`):** `queued → parsing → (v1.1: diarising → review_pending) → extracting → (v1.1: reducing) → classifying → (v1.1: enriching) → done | failed`. Idempotent per content-hash, resumable.

**Internal vs Client classification:** per speaker, `kind = client | internal` via role cues + org-domain heuristic + Haiku judgement. Internal Sims default `excludedFromPush = true`.

**Prompt — `transcript-to-persona` (text LLM, JSON mode):**

```
System: You extract real user personas from interview/call transcripts. Identify each distinct human
speaker; ignore the interviewer/host if clearly internal. For each speaker produce structured insights.
EVERY insight MUST be anchored to a verbatim quote copied EXACTLY from the transcript — never paraphrase
the quote. Classify each insight as exactly one of: pain (frustration/problem), want (a desired
capability), love (something they value). Be conservative: omit anything not supported by a direct quote.
Output strict JSON only.

User: TRANSCRIPT:
"""
{{transcript}}
"""
Return ONLY JSON: { "personas": [ { "name": string, "role": string, "kind": "client"|"internal",
  "summary": string, "insights": [ { "kind": "pain"|"want"|"love", "statement": string (<=140 chars,
  3rd person, no first-person pronouns), "topic": string (one lowercase tag), "confidence": 0..1,
  "quote": string (VERBATIM substring), "quoteCharStart": number, "relatedUiHints": string[] } ] } ] }
```

> v1.1 chunked map-reduce adds `PERSONA_EXTRACT_PROMPT` (MAP, per chunk) and `PERSONA_REDUCE_PROMPT` (REDUCE, per speaker, after embedding pre-clustering) and `SPEAKER_DIARIZE_PROMPT`/`SPEAKER_CLASSIFY_PROMPT`. Full templates are retained in `services/api/src/llm/prompts.ts`; the single-shot prompt above is the MVP path.

**Enrichment (v1.1):** load an existing persona, extract from a new transcript, **embed** each new insight, cluster near-duplicates (cosine), and run `ENRICH_MERGE_PROMPT` only on the ambiguous pairs the embeddings flag. A `duplicate` keeps the existing insight and **attaches the new quote** (multi-transcript provenance via `insight_quotes`); a `conflict` (same topic, opposite valence) records an `insight_conflicts` row for human review and keeps both; `distinct` keeps both. **Cross-transcript identity** is a **mandatory, explicit PM step** on upload (pick/confirm the target persona with name+role suggestions) — never auto-merge across personas (review gap).

### 6.2 Task B — Sim reaction + THE CANONICAL ELEMENT-TARGETING CONTRACT

This is the single most important seam in the product. Six subsystems defined it six incompatible ways. **This is the one canonical shape; every package imports it from `@klav/sims-core` and never redefines it.** (Resolves F1.)

#### 6.2.1 Canonical types (in `@klav/sims-core`)

```ts
// ── packages/sims-core/src/reaction.ts ────────────────────────────────────────

/** The closed set of elements the client extracts and ships; the model points by ref into THIS. */
export interface ElementMapEntry {
  ref: number            // 1-based, stable for THIS capture only
  selector: string       // robust client-resolvable: id > data-testid > stable nth-of-type path
  tag: string            // 'button' | 'div' | …
  role?: string          // ARIA/computed role
  text: string           // visible text, trimmed to 120 chars; PII/password values REDACTED (§13.4)
  rect: { x: number; y: number; w: number; h: number } // viewport CSS px at capture time
  signature: string      // sha256(tag + role + normText + selector) — used for dedup
}

/** Direction the finger points. ONE name everywhere: pointDirection. (pointHint is deleted.) */
export type PointDirection = 'up' | 'down' | 'left' | 'right'

/** THE canonical element-targeting contract. Reaction engine PRODUCES this; @klav/character CONSUMES it. */
export interface ElementTarget {
  ref: number | null                          // PRIMARY: index into the ElementMap the client sent
  selector: string | null                     // echoed from the chosen entry, for direct re-query at paint time
  rect: { x: number; y: number; w: number; h: number } | null  // raw viewport CSS px at capture time
  bboxNorm: { x: number; y: number; w: number; h: number } | null // 0..1 of viewport; FALLBACK only (ref null)
  pointDirection: PointDirection
  label?: string                              // human label of the element ('the Save button')
  confidence: number                          // 0..1
}

/** ONE emotion enum everywhere. (Reconciled from three divergent sets — resolves F-review-testing.) */
export type SimEmotion = 'love' | 'happy' | 'neutral' | 'confused' | 'frustrated' | 'angry'

export interface SuggestedBug {
  title: string
  body: string                                // markdown; includes the anchor quote + page url
  type: 'bug' | 'feature'                     // == @klav/core ReportType
  priority: 'low' | 'medium' | 'high'
}

/** THE reaction the bubble renders. */
export interface SimReaction {
  reactionId: string
  simId: string                               // == personaId
  emotion: SimEmotion
  reaction: string                            // <=240 chars, first-person, what the Sim "says"
  anchorQuote: string                         // verbatim line grounding the reaction
  insightId: string | null                    // which stored insight this draws on (dedup + provenance)
  target: ElementTarget
  suggestedBug: SuggestedBug | null           // null when emotion is positive / no actionable bug
  pointDirection: PointDirection              // convenience mirror of target.pointDirection for the renderer
  confidence: number                          // 0..1; client may suppress < 0.45
  isDuplicate: boolean                        // server-side dedup already saw this; client skips the walk
}
```

#### 6.2.2 How the union-loving Character package consumes it (adapter, NOT a seam)

`@klav/character`'s internal preference for a discriminated `SimTarget` union stays an **internal detail**. It ships a private adapter so the *seam* is the canonical `ElementTarget`, not the union (resolves F1, F13):

```ts
// internal to @klav/character — the host NEVER constructs a SimTarget
function toSimTarget(t: ElementTarget): SimTarget {
  if (t.ref != null || t.selector) return { kind: 'selector', selector: t.selector!, fallbackRect: t.rect ?? undefined }
  if (t.bboxNorm)                  return { kind: 'rect', rect: bboxNormToViewportPx(t.bboxNorm) } // multiply by live viewport
  if (t.rect)                      return { kind: 'rect', rect: t.rect }
  return { kind: 'point', x: innerWidth / 2, y: innerHeight / 2 } // last-resort region fallback
}
```

The `@klav/db`, `services/api`, widget, and extension `ElementTarget`/`ReactionTarget` definitions are **deleted**; all re-export from `@klav/sims-core`.

#### 6.2.3 The reaction flow (hybrid targeting — selector-primary)

```
client (extension or widget)
  1. capturePage(): build the ElementMap (≤40 entries, ranked by visibility × interactivity, PII-redacted),
     take a screenshot (chrome.tabs.captureVisibleTab in extension; html-to-image in widget),
     downscale to ≤1280px JPEG q0.7; if blank/blocked → mode:'dom-text' with a serialized outline.
  2. POST /api/sims/react  { simId, screenshot: <dataURL>|null, domMap?, elementMap, routeKey, viewport, pageUrl }
backend
  3. load persona (prompt-cached block), run reaction-vision (or reaction-dom-text) prompt.
  4. VALIDATE the model's targetRef ∈ elementMap; if out of range, set ref=null and use bboxNorm fallback.
  5. compute dedupKey; write reactions row (or return isDuplicate:true).
  6. return ElementTarget (ref + echoed selector + rect; bboxNorm only when ref null) + SimReaction.
client
  7. resolveTarget(elementMap, target) → live element rect + center + final pointDirection (re-query selector
     first; bboxNorm × live viewport → elementFromPoint fallback; scroll into view if needed).
  8. @klav/character.summon(simId, target, reaction) → walk, point, bubble.
```

> **Screenshot transport (resolves F14):** v1 sends the screenshot as a **base64 JPEG data URL in the react request body** (matches the existing `/api/feedback` multipart convention). The server persists it to object storage and returns a `screenshotRef`. Presigned-PUT (`/assets/sign`) and a separate `/capture-upload` endpoint are **deferred** to v1.1. There is exactly one field: `screenshot: string /* data URL */ | null` plus `domMap` for the blocked path.

**Prompt — `reaction-vision` (system + persona block is prompt-cached):**

```
SYSTEM (cacheable, per-sim, cache_control marked):
You are {{sim.name}}, a real {{sim.role}}. Type: {{sim.kind}}. You are reviewing a product screen AS
YOURSELF. You only have the opinions, frustrations, and delights below — each grounded in something you
ACTUALLY said in an interview. Never invent opinions you don't hold. Stay in character; speak first person.
YOUR INSIGHTS (kind | what you said | verbatim quote):
{{#each insights}}- [{{kind}}] {{statement}}  ||quote: "{{quote}}" (id:{{id}})
{{/each}}

USER (per-request):
Here is the current screen as an image, plus a numbered map of elements you may point at. Pick AT MOST ONE
element that triggers a genuine reaction grounded in one of your insights. If nothing relates, return
reaction:null.
Element map (ref | selector | role | text):
{{#each elementMap}}{{ref}} | {{selector}} | {{role}} | "{{text}}"
{{/each}}
Known console errors on this page: {{consoleErrorsSummary}}
Return STRICT JSON (no prose):
{ "reaction": string<=240|null, "emotion": one of [love,happy,neutral,confused,frustrated,angry],
  "targetRef": number|null, "pointDirection": one of [up,down,left,right], "anchorInsightId": string,
  "anchorQuote": string (verbatim from above), "suggestedBug": { "title": string, "body": string,
  "type": "bug"|"feature", "priority": "low"|"medium"|"high" } | null, "confidence": number 0..1 }
Rules: targetRef MUST be a ref from the map or null. anchorQuote MUST be copied verbatim.
suggestedBug only when emotion is confused/frustrated/angry AND it is actionable.
```

**Prompt — `reaction-dom-text` (fallback, no image):** identical persona block (cached); replaces the image with a `PAGE OUTLINE` + element map; instructs "you cannot see styling — focus on structure, labels, missing actions, flow, not aesthetics"; returns the same JSON schema.

**Dedup (v1.1):** `dedupKey = sha256(simId + routeKey + elementSignature + insightHash)`; `UNIQUE(personaId, memberId, dedupKey)` on `reactions`. `elementSignature` leans on stable attributes (id/data-testid) so it survives minor DOM churn. (v1 is on-demand only — dedup matters once proactive ships.)

### 6.3 Task C — Ask-a-Sim (streamed RAG) — DEFERRED to v1.1

A typed question → embed → top-k cosine retrieval over `insight_embeddings` for that Sim → grounded streamed answer over SSE with inline `[insight:id]` citations. Deferred because it pulls in the embedding pipeline (and a self-host embedding fallback — BM25 if no embedding endpoint) and has no mockup. The schema (`insight_embeddings`, quotes provenance) is built to allow it without a data-model change.

**Prompt — `ask-a-sim` (streaming, RAG-grounded), retained for v1.1:**

```
System: You ARE {{sim.name}} ({{sim.role}}). Answer the user's question in first person, grounded ONLY in
your retrieved insights below and the current page context. If the insights don't cover it, say so plainly
in character rather than inventing. Cite an insight id inline as [insight:{{id}}] when you rely on it.
RETRIEVED INSIGHTS (top-{{k}}):
{{#each retrieved}}- ({{id}}) [{{kind}}] {{statement}} ||"{{quote}}"
{{/each}}
CURRENT PAGE: {{routeKey}}   VISIBLE ELEMENTS: {{elementMapSummary}}
CONVERSATION SO FAR: {{#each history}}{{role}}: {{content}}\n{{/each}}
USER QUESTION: {{question}}
Respond first person, concise (2-4 sentences). Stream your answer.
```

---

## 7. Backend API (route table)

One Bun + Hono service (`services/api`), one route namespace `/api/*` (the parallel `/widget/v1/*` and `/v1/sims/*` namespaces are **deleted** — resolves F4). Single gateway: all surfaces call one fixed `apiBase`; the server resolves the tenant from the JWT `org` claim (resolves F18 — clients never see per-org hosts).

| Method & path | Auth | Role | Returns / notes |
|---|---|---|---|
| `POST /api/auth/signup` | — | — | `{ user, org, workspace, session }`; (v1.1) async-provisions org Turso DB, shows "warming up" |
| `POST /api/auth/login` | — | — | `{ session }` + sets refresh; `deviceInfo.surface` distinguishes web/extension/widget |
| `POST /api/auth/refresh` | refresh | — | rotates within family, reuse-detection (v1.1); `{ accessToken, expiresAt }` |
| `POST /api/auth/logout` | refresh | — | `204`; revokes device family + SSE registration |
| `GET /api/auth/session` | bearer | — | `{ membership, orgs[] }` (org switcher) |
| `POST /api/widget/session` | pk_ key + Origin | — | mints the **same** access JWT (Origin-scoped, viewer-anon) for the widget — resolves F4 |
| `GET /api/workspaces` | bearer | any | `{ workspaces[] }` |
| `POST /api/workspaces` | bearer | pm+ | `{ workspace }` |
| `GET /api/workspaces/:wsId/projects` | bearer | member | `{ projects[] }` |
| `POST /api/workspaces/:wsId/projects` | bearer | pm+ | `{ project }` (`originAllowlist?`) |
| `GET /api/workspaces/:wsId/members` | bearer | member | `{ members[], invites[] }` |
| `POST /api/workspaces/:wsId/invites` | bearer | admin+ | `{ inviteId, acceptUrl }` |
| `POST /api/invites/:token/accept` | bearer | — | creates the membership |
| `PATCH /api/workspaces/:wsId/members/:mid` | bearer | admin+ | change role |
| `GET /api/workspaces/:wsId/personas` | bearer | member | `{ personas[] }` (filter `kind`, `q`) — **workspace-scoped** (resolves F9) |
| `POST /api/workspaces/:wsId/personas` | bearer | pm+ | create a Sim manually |
| `GET /api/personas/:id` | bearer | member | full persona + insights (with `quotes[]`) + source transcript refs |
| `PATCH /api/personas/:id` | bearer | pm+ | edit fields, retype/delete insight, resolve conflict, toggle `excludedFromPush`; bumps `version` |
| `DELETE /api/personas/:id` | bearer | pm+ | `204` |
| `POST /api/workspaces/:wsId/transcripts` | bearer | pm+ | multipart upload; `202 { transcript, jobId }`; enqueues Task A |
| `GET /api/workspaces/:wsId/transcripts` / `:id` | bearer | member | list / detail (returns **frozen canonicalText as `body`** + `canonicalLen` — F12) |
| `POST /api/personas/:id/enrich` | bearer | pm+ | `202 { jobId }` (v1.1) — mandatory target-persona confirm |
| `GET /api/jobs/:id/stream` | bearer | member | SSE job progress (v1.1; v1 uses `GET /api/jobs/:id` poll) |
| `POST /api/sims/react` | bearer/widget | member | body `{ simId, screenshot:dataURL|null, domMap?, elementMap, routeKey, viewport, pageUrl }` → `SimReaction` |
| `POST /api/sims/react/batch` | bearer/widget | member | proactive (v1.1): several Sims, one capture |
| `POST /api/sims/reactions/:id/file` | bearer/widget | member | files `suggestedBug` server-side; server derives `SimReactionRef`, writes `bugs(source='sim')` — F6 |
| `POST /api/sims/reactions/:id/feedback` | bearer/widget | member | `{ verdict:'useful'|'dismiss'|'wrong-element' }` (v1.1 tuning) |
| `POST /api/sims/ask` | bearer/widget | member | SSE token/source/done (v1.1) |
| `GET /api/projects/:pid/bugs` | bearer | member | unified list (`source`, `status`, `priority`, `q`, `cursor`) + `counts{all,sim,snap}` |
| `POST /api/projects/:pid/bugs` | bearer | member | `+ New Bug` and proxied Sim-file; server runs the four handlers directly (§7.1) |
| `PATCH /api/projects/:pid/bugs/:bugId` | bearer | member | inline status/priority/assignee; mirrors to tracker when applicable; emits `bug.updated` |
| `POST /api/feedback` | optional bearer | — | **LEGACY, unchanged shape** `{id, jira_key?, issue_url?}`; maps to `bugs(source='snap')` |
| `GET /api/projects/:pid/integrations` | bearer | pm+ | `{ type, configured, redactedFields }` (never secrets) |
| `PUT /api/projects/:pid/integrations` | bearer | pm+ | sealed-box encrypt creds; verified by a dry test call |
| `POST /api/projects/:pid/integrations/test` | bearer | pm+ | `{ ok, error? }` |
| `POST /api/projects/:pid/push` | bearer | pm+ | `{ memberIds[], personaIds[], excludeInternal?, note? }` → assignments; internal excluded; emits `persona.assigned` |
| `DELETE /api/personas/:id/push/:memberId` | bearer | pm+ | revoke; emits `persona.revoked` |
| `GET /api/me/dock` | bearer/widget | member | `{ personas[], cursor }` — **MVP poll** for dock contents |
| `GET /api/stream` | bearer/widget | member | **ONE** SSE stream, `?cursor=<seq>`, `KlavStreamEvent` union (v1.1 — §8.6) |
| `GET /api/events` | bearer/widget | member | `?since=<seq>` JSON catch-up (shares the union) |
| `GET /api/workspaces/:wsId/team` | bearer | member | `{ members[], coverage[] }` (coverage matrix) |
| `GET /api/workspaces/:wsId/activity` | bearer | member | `{ items[], nextCursor }` (initial feed page) |
| `POST /api/assets/sign` | bearer | member | presigned PUT (v1.1) |
| `GET /api/assets/:id` | bearer | member | `302` to signed GET URL |
| `GET /healthz` | — | — | `{ ok, deploy, version }` |

### 7.1 Server-side bug-filing bridge (resolves F2 — the load-bearing reuse)

The server **must not** call `@klav/core`'s `dispatchSubmit` (which routes to `handlers.backend` whenever `backendUrl` is set, ignoring `settings.integration` — verified in `submit.ts`). Instead it imports the **four concrete handlers directly** and selects by the stored project integration type:

```ts
// services/api/src/integrations/file.ts
import type { IntegrationConfig, KlavSettings, ReportType, ReportContext } from '@klav/core'
import { submitReport as jira }   from '@klav/core/integrations/jira'
import { submitReport as linear } from '@klav/core/integrations/linear'
import { submitReport as github } from '@klav/core/integrations/github'
import { submitReport as plane }  from '@klav/core/integrations/plane'
const handlers = { jira, linear, github, plane } as const   // NO 'backend'

export async function fileBug(args: { type: ReportType; description: string; context: ReportContext;
  screenshots: string[]; settings: KlavSettings }): Promise<{ issueKey: string; issueUrl: string }> {
  const cfg: IntegrationConfig = { type: args.type, description: args.description,
    context: args.context, screenshots: args.screenshots, settings: args.settings }
  const h = handlers[args.settings.integration as keyof typeof handlers]
  if (!h) throw new Error(`unsupported integration: ${args.settings.integration}`)
  return h(cfg)   // → SubmitResult { issueKey, issueUrl }
}
```

Both `/api/feedback` (Snap) and `/api/sims/reactions/:id/file` (Sim) call `fileBug`, persist `SubmitResult` to `bugs.integrationRef` + control `bug_index`, and surface partial-success (`filingStatus:'failed'` + `filingError`) instead of swallowing errors. No external tracker configured → `integration: null`, `filingStatus:'pending'`.

### 7.2 Operational guards (review gap — owned, not a risk bullet)

- **Cost guard:** `usage_counters` per org+month; per-org monthly USD ceiling; on exceed → `402` + a user-visible **"Sims paused: monthly AI budget reached"** state. v1 ships at least a hard per-org request cap and the counter; full budget UI in v1.1.
- **Rate limiting:** per-publishable-key **token-bucket on `/api/sims/react|ask`** independent of Origin (Origin is defense-in-depth, not the limit); per-key daily caps; one-click key rotation in admin.
- **Request size limits**, WAL mode + retry-on-busy on libSQL, short worker transactions.

---

## 8. Auth, roles & remote push

### 8.1 One identity, three surfaces (resolves F4, review auth-coherence gap)

The **Auth subsystem is the single owner of identity.** One access-JWT shape is minted for **all three surfaces** and consumed identically downstream:

- **Web app:** httpOnly refresh cookie + in-memory access token (first-party on klav.io).
- **Extension:** access token in `chrome.storage.session`; refresh in `chrome.storage.local`.
- **Widget:** publishable `pk_…` key + Origin check → `POST /api/widget/session` mints the **same** access JWT (Origin-scoped, viewer-anonymous unless `identify()` is called), in-memory only.

**Bearer everywhere** for the API calls; the widget just *acquires* its token differently. All three resolve to the **same `membershipId`** so push targeting works. Backend base URL lives in exactly **one** field (`KlavSettings.backendUrl`, reused); org/workspace identity lives only in the session/JWT claims; `SimsSettings` carries **only UI prefs**.

### 8.2 Token model

```ts
export interface KlavAccessClaims {
  sub: string   // userId  usr_
  mid: string   // membershipId  mem_   (THE recipient/actor key)
  org: string   // orgId  org_
  role: 'owner' | 'admin' | 'pm' | 'member'
  did: string   // deviceId  dev_
  exp: number; iat: number
}
```

Access JWT ~15 min (stateless, carries `mid`/`org`/`role` so the stream filter + authz need no round-trip). Opaque rotating refresh token bound to `deviceId`, stored hashed. **v1.1** adds refresh-token rotation *families* with reuse-detection; **MVP** uses a simple long-lived session token (feasibility cut). The model must not preclude an OIDC exchange later (§8.5).

### 8.3 Roles & authz matrix

`owner | admin | pm | member` at org scope; project-scoped actions also require a `project_members` row.

```ts
export type AuthzAction =
  | 'org.manage' | 'member.invite' | 'member.setRole' | 'project.create'
  | 'transcript.upload' | 'persona.create' | 'persona.edit' | 'persona.delete'
  | 'persona.push' | 'persona.revoke' | 'persona.consume' | 'bug.file' | 'bug.view'

export const AUTHZ_MATRIX: Record<AuthzAction, Record<Role, boolean>> = {
  'org.manage':        { owner: true,  admin: true,  pm: false, member: false },
  'member.invite':     { owner: true,  admin: true,  pm: false, member: false },
  'member.setRole':    { owner: true,  admin: true,  pm: false, member: false },
  'project.create':    { owner: true,  admin: true,  pm: true,  member: false },
  'transcript.upload': { owner: true,  admin: true,  pm: true,  member: false },
  'persona.create':    { owner: true,  admin: true,  pm: true,  member: false },
  'persona.edit':      { owner: true,  admin: true,  pm: true,  member: false },
  'persona.delete':    { owner: true,  admin: true,  pm: true,  member: false },
  'persona.push':      { owner: true,  admin: true,  pm: true,  member: false },
  'persona.revoke':    { owner: true,  admin: true,  pm: true,  member: false },
  'persona.consume':   { owner: true,  admin: true,  pm: true,  member: true  },
  'bug.file':          { owner: true,  admin: true,  pm: true,  member: true  },
  'bug.view':          { owner: true,  admin: true,  pm: true,  member: true  },
}
```

### 8.4 The Client-persona security invariant (highest-severity)

> **A Client persona is deliverable to `membershipId` M only if an active `push_assignments` row exists for (personaId, M, projectId).** Internal personas may be excluded from a push by the PM (UI checkbox → simply no row written).

Enforced **server-side at three chokepoints**, never on the client:

1. **Assign-time** — the push write validates and creates the grant row.
2. **Live-filter** — the stream fan-out joins `push_assignments` for `(claims.mid, projectId)`.
3. **Fetch-time** — every `GET /api/me/dock`, persona read, and catch-up joins the same grant.

A regression test asserts an unauthorized member's dock + events both return **zero** Client-persona rows. **Never ship type-based client-side filtering.**

### 8.5 SSO/SAML readiness (non-goal now, not precluded)

The token model is OIDC-swappable: password login can later be replaced by an OIDC exchange that mints the same `KlavAccessClaims`. No data-model change required.

### 8.6 Remote push — ONE stream, ONE envelope, ONE cursor (resolves F10)

**MVP transport: plain polling.** `GET /api/me/dock?since=<cursor>` every 20-30s and on focus/route-change. "Near-real-time" at ≤30s is acceptable for "a PM assigned you a Sim". This deletes SSE, the event log, VAPID/Web Push, the `chrome.alarms` keep-alive, and the in-process bus from v1, and sidesteps the MV3 SW-eviction problem. The `cursor` field is kept so the SSE upgrade is a no-data-model-change.

**v1.1 transport: SSE.** One stream, one union, one cursor, addressed by `membershipId`, with monotonic `streamEvents.seq` as the SSE `id`:

```ts
// packages/sims-core/src/stream.ts — the ONE event union (push + activity + bug + transcript)
export type KlavStreamEvent =
  | { seq: number; type: 'persona.assigned'; persona: PushedPersona }
  | { seq: number; type: 'persona.updated';  persona: PushedPersona }       // enrichment/edit re-push
  | { seq: number; type: 'persona.revoked';  personaId: string; projectId: string }
  | { seq: number; type: 'bug.created';      bug: BugRow }
  | { seq: number; type: 'bug.updated';      bugId: string; patch: Partial<BugRow> }
  | { seq: number; type: 'transcript.status'; transcriptId: string; status: TranscriptStatus; insightCount?: number }
  | { seq: number; type: 'activity';         verb: string; actorMemberId: string; text: string; meta: Record<string, unknown> }

export interface PushedPersona {
  personaId: string; version: number; projectId: string
  name: string; role: string; kind: 'client' | 'internal'
  avatarSeed: string; insightSummary: string; sourceTranscriptCount: number
}
export interface PushCatchup { events: KlavStreamEvent[]; cursor: number }
```

`GET /api/stream?cursor=<seq>` (workspace/org resolved from JWT). The web app filters client-side for the events it cares about; the extension/widget filter for `persona.*`. **Standardized event names:** `persona.assigned/updated/revoked` (the `pushed`/`sim.pushed` vocabularies are deleted). For multi-instance cloud, a **libSQL-polled outbox** (the `streamEvents` table already exists) fans out across instances; single-instance is the self-host path.

---

## 9. Sim character system (`@klav/character`)

A framework-agnostic, **zero-dependency** TypeScript package rendering the animated Sims. Consumed **identically** by the extension content script and the widget SDK. It owns **only** presentation + animation + interaction; it consumes `ElementTarget` + `SimReaction` from `@klav/sims-core` and emits one `onFileBug` callback. **The Extension/Widget/Monorepo descriptions of this API are non-authoritative and deleted; this is the one ratified API (resolves F13).**

### 9.1 Public API (canonical)

```ts
// THE entry point. The CHARACTER package creates and owns the shadow host (#klav-sims-host).
export function mountDock(personas: Persona[], opts: MountDockOpts): DockHandle

export interface MountDockOpts {
  corner?: 'bottom-right' | 'bottom-left' | 'bottom-center'  // default bottom-right
  zIndex?: number                       // default 2147483647 (matches modal.ts)
  reducedMotion?: boolean               // explicit override of prefers-reduced-motion
  theme?: 'dark' | 'auto'               // mockup is dark
  label?: string                        // e.g. '3 sims watching'
  bubbleTimeoutMs?: number              // auto-rest after talking; default 0 = manual
  onFileBug: (p: FileBugPayload) => void | Promise<void>
  onSimClick?: (personaId: string) => void | Promise<void>   // host asks the engine for a reaction
  onAsk?: (personaId: string, question: string) => void | Promise<void>  // v1.1
  onStateChange?: (personaId: string, s: SimState) => void
}

export interface DockHandle {
  sim(personaId: string): SimHandle | undefined
  summon(personaId: string, target: ElementTarget, reaction: SimReaction): Promise<void> // THE drive call
  restAll(): Promise<void>
  update(personas: Persona[]): void     // reconcile when the push set changes
  unmount(): void
}

export interface SimHandle {
  walkTo(target: ElementTarget, opts?: { speedMs?: number }): Promise<void>
  point(dir: PointDirection): void
  say(reaction: SimReaction): Promise<void>
  rest(): Promise<void>
  setStatus(status: 'idle' | 'active' | 'thinking'): void
}
```

**Note:** target resolution (selector→rect, scroll re-anchor) lives **inside** `@klav/character` (`geometry.ts`), **not** the host. `onResolveTarget` is removed from the handler set (resolves F13). `Persona`, `ElementTarget`, `SimReaction` are **imported from `@klav/sims-core`** — the character package never redefines them.

```ts
// inputs the renderer needs (Persona is imported from sims-core; render-relevant subset)
export interface Persona {
  id: string; name: string; role: string; initials: string
  color: string; gradient?: [string, string]; legColor: string
  kind: 'client' | 'internal'           // display only here
}
export interface FileBugPayload {       // the seam back to @klav/core integrations
  type: ReportType                      // from reaction.suggestedBug.type
  description: string                   // reaction text + persona attribution
  source: 'sim'
  sim: { personaId: string; name: string; role: string }
  reactionId: string                    // so the host POSTs /api/sims/reactions/:id/file
}
```

### 9.2 Animation state machine

```ts
export type SimState =
  | 'RESTING'    // docked, idle bob + eye-glance (CSS only), status 'idle'
  | 'SUMMONED'   // walkTo received; character layer being created, status 'active'
  | 'WALKING'    // translate3d toward target; legs/arms swing (CSS)
  | 'ARRIVING'   // within ~1 step; legs stop; settling frame
  | 'POINTING'   // point-up|left|right shown; target gets a pulsing ring
  | 'TALKING'    // bubble shown; status 'thinking' → 'active'; File-bug armed
  | 'RETURNING'  // walking back; bubble hidden; highlight cleared

export const SIM_TRANSITIONS: Record<SimState, SimState[]> = {
  RESTING:   ['SUMMONED'],
  SUMMONED:  ['WALKING', 'RETURNING'],
  WALKING:   ['ARRIVING', 'RETURNING'],   // interruptible
  ARRIVING:  ['POINTING', 'RETURNING'],
  POINTING:  ['TALKING', 'RETURNING'],
  TALKING:   ['RETURNING', 'POINTING'],    // re-point on a new step
  RETURNING: ['RESTING', 'WALKING'],        // re-summon mid-return
}
```

### 9.3 Rendering & performance invariants

- **One `position:fixed` shadow host** (`mode:'closed'`), `:host{ all: initial; contain: layout style }` reset, all styles in one `adoptedStyleSheets` (or `<style>` fallback). Host `pointer-events:none`; only the FAB/dock/sims/bubbles opt back in.
- **Movement ONLY via `transform: translate3d()`** on the fixed character layer — never `left`/`top`/`bottom`, never read/write host layout in the rAF loop. Element geometry is read **once** per target via `getBoundingClientRect`, then only on throttled scroll/resize. (Replaces the mockup's layout-thrashing approach — this is the hard correctness constraint vs the mockups.)
- **One shared rAF loop** (`PositionTracker`) services all active sims; CSS handles legs/arms/bob/eyes; the loop **stops** (`cancelAnimationFrame`) when all sims rest. Cap concurrent on-page sims at 3 (matching the mockups). Lazy-create character layers (dock-only until summoned).
- **`prefers-reduced-motion`** (+ explicit override) collapses transitions to instant teleport + crossfade; the dock, bubble, point, and File-bug stay fully functional.
- **a11y:** each dock sim is `role=button`, focusable, with `aria-label`; the bubble is `aria-live=polite`; File-bug is a real `<button>`; full keyboard operation (Tab through dock, Enter/Space to summon, Esc to send a sim back); idle animation is `aria-hidden`-aware.
- **Double-mount guard:** a sentinel `data-attribute` on the shadow host + a window-level guard so an extension-injected dock and a site-embedded widget dock don't both mount on `#klav-sims-host` (the extension yields to an embedded widget).

### 9.4 Reduced-motion & region-fallback

If the targeting spike (§1.2) shows precise pointing isn't reliable, `point()` degrades to a region indicator (bubble near the area, no finger-on-element) — the canonical `ElementTarget` already supports this via the `bboxNorm`/`kind:'rect'` path, so no API change is needed.

---

## 10. Web app (klav.io)

**Stack (resolved — F17):** React 18 + Vite + TanStack Router (typed routes/search-params) + TanStack Query. **Not Next.js** (the Hono backend makes an SSR server redundant for a gated dashboard; Vite keeps one toolchain with the extension/SDK). Located at `apps/web` (deployable, private, never published). It holds **no integration secrets** and **never files issues directly** — all filing runs server-side reusing `@klav/core`. It reuses `@klav/core` types and imports all Sims DTOs from **`@klav/sims-core`** (there is no separate `@klav/shared`).

### 10.1 Routes / pages

| Route | Page | Key components |
|---|---|---|
| `/login` | Login | magic-link / OAuth (mechanism is an open question — §15.1) |
| `/bugs` | Bug Tracker | `FilterRow` (chips with counts), `BugTable`, `SourceTag`, `PriorityDot`, `StatusPill`, `Avatar` |
| `/bugs/$bugId` | Detail drawer | screenshots (signed URLs), external issue link, inline `PATCH` mutations, sync-error surface |
| `/analytics` | Analytics | counts by source/status/priority; ships after the tracker |
| `/personas` | Sim editor (3-col) | `SimList` + `SimCard`, `InsightList` (pain/want/love + quotes), `PushComposer` |
| `/personas/$simId` | Sim detail | header (transcript count, Edit/Enrich), insights, "Pushed to" pips, source-transcript excerpt |
| `/transcripts` | Transcript list | `UploadZone`, `TranscriptCard` (speakers + insight count + status) |
| `/transcripts/$id` | Transcript viewer | renders `body` (= frozen canonicalText), highlights `[charStart,charEnd)` spans |
| `/team` | Team | `MemberList`, `CoverageMatrix`, `ActivityFeed`, `+ Invite` |
| `/settings` | Settings | integration picker + creds (PUT server-side; read back only `configured`) |

### 10.2 Realtime in the web app

**MVP:** TanStack Query polling + manual refetch on mutation (matches the §8.6 poll-first decision). **v1.1:** one reconnecting `EventSource` to `GET /api/stream` (`useWorkspaceStream`) honoring `Last-Event-ID`, dispatching `KlavStreamEvent` to: prepend the activity feed, invalidate `['bugs', wsId]` + toast on `bug.created`, patch push-delivery state, update transcript status.

### 10.3 Bug row DTO (canonical, in `@klav/sims-core` — resolves F6)

```ts
export interface BugRow {
  id: string; orgId: string; projectId: string | null
  source: 'sim' | 'snap'
  reactionId: string | null            // set iff source==='sim'
  personaId: string | null             // set iff source==='sim'
  simRef: SimReactionRef | null        // SERVER-side projection of the reactions row (never a client input)
  reporterMemberId: string | null
  assigneeMemberId: string | null
  type: ReportType                     // @klav/core
  title: string; description: string
  priority: 'high' | 'med' | 'low'
  status: 'open' | 'in_progress' | 'done'
  integration: IntegrationType | null  // @klav/core; null = filed to Klav only (no 'backend')
  integrationRef: { issueKey: string; issueUrl: string } | null   // == SubmitResult
  filingStatus: 'pending' | 'filed' | 'failed'; filingError: string | null
  screenshotUrls: string[]             // server resolves screenshotRefs → signed URLs in the DTO
  pageUrl: string | null
  createdAt: number; updatedAt: number
}
export interface SimReactionRef { simId: string; simName: string; emotion: SimEmotion
  elementLabel: string; pageUrl: string; reactionText: string }
```

**Producer chain (pinned):** `@klav/character` emits `FileBugPayload` → host attaches `ReportContext` + screenshots → `POST /api/sims/reactions/:id/file` → server reads the `reactions` row, derives `SimReactionRef`, writes the `bugs` row + control `bug_index`. `SimReactionRef` is always a **server-side projection of the reactions log**, never a client input.

---

## 11. Extension integration

Strictly **additive and non-breaking**: the Snap right-click flow (context menus, `#klav-host` modal, `CAPTURE_TAB` round-trip, `dispatchSubmit`) is untouched. Sims live in a **second** isolated shadow host `#klav-sims-host`, mounted by a new content-script module that lazy-loads `@klav/character`.

### 11.1 File-level changes

| File | Change |
|---|---|
| `packages/core/src/types.ts` | add optional nested `sims?: SimsSettings` to `KlavSettings` + `DEFAULT_SIMS_SETTINGS`; deep-default at all 5 spread sites. **No `ReportContext.source` change** (F15). Add optional `requestId?` to `CAPTURE_TAB`/`CAPTURE_TAB_RESULT` to demux Snap vs Sims captures. **All Sim domain types import from `@klav/sims-core`** (not redefined here — F3). |
| `packages/extension/src/content.ts` (edit) | add `requestId` to the two `CAPTURE_TAB` sends (Snap leaves it undefined → only fires the legacy event when undefined); add `SIMS_*` message branches; after error-capture setup, `if (document.readyState!=='loading') requestIdleCallback(bootstrapSims)`. **Do not touch the modal paths.** |
| `packages/extension/src/sims/sims-controller.ts` (new) | `bootstrapSims()`: idle mount, gate on `authed && assignments-for-this-origin && settings.sims.enabled`, lazy `import('@klav/character')`, create `#klav-sims-host`, `mountDock(personas, { onFileBug, onSimClick, … })`; teardown on disable + SPA navigation. |
| `packages/extension/src/sims/sims-reaction.ts` (new) | `requestReaction(personaId)`: capture via `@klav/sims-engine` (which round-trips `CAPTURE_TAB`), build the element map, `POST /api/sims/react`, return `SimReaction`. |
| `packages/extension/src/sims/sims-bridge.ts` (new) | typed `requestId`-correlated `chrome.runtime.sendMessage` helper. |
| `packages/extension/src/background.ts` (edit) | wire `sims-auth`/`sims-api`; demux `CAPTURE_TAB` by `requestId`; handle `SIMS_*`; `SIMS_FILE_BUG` builds the report (`source='sim'` as a top-level field, not in `ReportContext`) and calls the **same** `dispatchSubmit` handler map already imported → reuses Jira/Linear/GitHub/Plane unchanged. |
| `packages/extension/src/background/sims-{auth,api}.ts` (new) | token store (`chrome.storage.session`) + refresh-on-401; typed klav.io REST client. **All token-bearing calls live in background; content never holds the bearer.** |
| `packages/extension/src/background/sims-sync.ts` (new, v1.1) | MVP: `chrome.alarms` poll of `GET /api/me/dock?since=cursor` every 20-30s. v1.1: SSE while SW alive + poll fallback. |
| `options.html`/`options.ts` (edit) | "Klav Sims" section: connect/disconnect, workspace+project selectors, toggles (`enabled`, `proactive`, `showInternal`, `maxConcurrentSims`). |
| `popup.html`/`popup.ts` (edit) | Sims status line + enable toggle. Snap status untouched. |
| `manifest.json` (edit) | add `https://klav.io/*` (configurable `apiBaseUrl` via `chrome.permissions.request`); add `alarms`; existing permissions unchanged. |

### 11.2 `SimsSettings` (UI prefs only — F4)

```ts
export interface SimsSettings {
  enabled: boolean            // master on/off for the dock
  proactive: boolean          // v1.1; default false (on-demand only in v1)
  showInternal: boolean       // local viewer pref (push already filters)
  maxConcurrentSims: number   // perf cap, default 3
}
export const DEFAULT_SIMS_SETTINGS: SimsSettings = { enabled: false, proactive: false, showInternal: false, maxConcurrentSims: 3 }
```

Backend base URL is **only** `KlavSettings.backendUrl`; org/workspace identity is **only** in the session — `SimsSettings` no longer carries `apiBaseUrl`/`activeWorkspaceId`/`activeProjectId` (resolves the config-source conflict in F4).

### 11.3 Capture filter (resolves F-host-ids)

Three distinct host ids: `klav-host` (extension Snap modal) · `klav-sdk-host` (SDK Snap modal) · `klav-sims-host` (the dock, both surfaces). The extension Sims capture must exclude **both** `klav-host` and `klav-sims-host`; the SDK capture must exclude **both** `klav-sdk-host` and `klav-sims-host`.

### 11.4 MV3 lifecycle note

A raw `EventSource` dies on SW eviction (~30s). **MVP sidesteps this entirely with polling** (§8.6). v1.1 SSE reconnect uses `chrome.alarms` + cursor catch-up so no event is ever missed; "near-real-time" degrades to ≤ poll-interval worst case.

---

## 12. Widget SDK

**DEFERRED past MVP** (it is the surface with the most net-new auth/CSP/tainted-canvas/key-abuse risk and overlaps the extension — prove the loop in the extension first). When built (v1.1), it extends the **existing `@klav/snap` package** (one script delivers both `KlavSnap` and `KlavSims`); it does **not** become a separate npm package.

### 12.1 Public API

```ts
window.KlavSims = {
  init(config: WidgetConfig): Promise<KlavSimsInstance>   // validates pk_, mints widget JWT, mounts dock, opens poll/stream
  // instance:
  identify(viewer: { id: string; email?: string; name?: string }): Promise<void>  // re-scope to a viewer
  summonSim(simId: string): Promise<void>
  askSim(simId: string, question: string): AsyncIterable<AskChunk>                 // v1.1
  on(event: 'ready'|'sim:reaction'|'bug:filed'|'sim:pushed'|'error', cb): () => void
  show(): void; hide(): void; destroy(): void
}
window.KlavSnap = { init, openModal }   // PRESERVED, unchanged

export interface WidgetConfig {
  apiKey: string                        // publishable pk_live_… (safe in page)
  project: string
  viewer?: { id: string; email?: string; name?: string }
  apiBase?: string                      // default the single gateway (NO per-org host — F18)
  capture?: 'client' | 'dom'            // default 'client'; server-side headless capture is OUT (feasibility cut)
  proactive?: boolean                   // v1.1; default false
  dock?: { position?: 'bottom-right' | 'bottom-left'; maxSims?: number }
  reducedMotion?: 'auto' | 'on' | 'off'
}
```

### 12.2 Capture (feasibility-cut)

`html-to-image` `toPng` on `document.documentElement` (filtering out `#klav-sims-host` and cross-origin `<img>`), downscale to ≤1280px JPEG. On tainted-canvas / blank detection → **DOM element-map text fallback** (the reaction engine already accepts `mode:'dom-text'`). **No server-side headless capture worker is built** — degrade to the DOM-map reaction instead of standing up a render farm.

### 12.3 Auth, filing, mounting

- Publishable `pk_` → `POST /api/widget/session` → the **same** access JWT (§8.1). Origin checked against the project allowlist; **per-key rate limit independent of Origin** (Origin is spoofable — §7.2).
- Filing goes **only** through the backend (`POST /api/sims/reactions/:id/file`), never direct-to-Jira from the page (no secrets in the page; CORS would block it anyway).
- Mounts the **shared `@klav/character`** renderer in a `mode:'closed'` `#klav-sims-host`; idempotent `init`, robust `destroy()` (remove host, close stream, drop window ref). Double-mount guard yields to the extension if both are present.

---

## 13. Cross-cutting concerns

### 13.1 Testing strategy (beyond unit tests — review gap)

1. **Cross-subsystem contract tests (the highest-leverage):** because `ElementTarget`, `SimReaction`, `SimEmotion`, `Persona`, `Insight`, `BugRow`, `KlavStreamEvent` live in **exactly one package** (`@klav/sims-core`), add a type-level + runtime test that the reaction engine's output validates against the canonical schema and the character renderer consumes it. The divergent emotion enums are **reconciled to one** (`love|happy|neutral|confused|frustrated|angry`) before any code.
2. **LLM eval harness:** fixtures for quote-verification drop/snap rate, targeting hit-rate against a known page, internal/client classification accuracy — run in CI against recorded responses, periodically live.
3. **Tenant-isolation integration test:** two orgs, assert zero cross-read, including the Client-persona invariant at all three chokepoints.
4. **Extension MV3 lifecycle test (v1.1):** SW eviction → reconnect → no missed events.
5. **Contract test pinning legacy `/api/feedback`** `{id, jira_key?, issue_url?}` bytes against what `backend.ts` parses.
6. **Filing bridge test:** mock the four integration `fetch`es; assert a `SimReaction` round-trips into a correct `IntegrationConfig`.
7. Keep the existing **22 Vitest tests green** at every step (`pnpm -r test`).

### 13.2 Observability & operations (review gap — owned)

- Structured request logging with `org`/`member` tags.
- LLM-call telemetry sink (the per-job/per-reaction token+cost fields exist — surface them in an ops view).
- Cross-tenant job/queue dashboard; (v1.1) fleet migration-status view.
- **Append-only audit log for `persona.push`/`persona.revoke` and integration-config changes** (also needed for the security invariant).
- Replace silent error-swallowing in the filing path (`background.ts`, `jira.ts` attachment upload) with a recorded `filingStatus:'failed'` + reason surfaced in the tracker drawer.
- Define the open-source self-host admin scope (functional self-host in v1; polished admin later).

### 13.3 Cost guards & latency

- Per-org `usage_counters` + hard budget cap → `402` + visible "Sims paused" state (§7.2).
- **Proactive is OFF by default** (the dominant cost driver); v1 is on-demand only. v1.1 adds concrete proactive caps (max N reactions per route per session, global debounce) + the reaction cache key (canonical route + DOM-structure hash) so repeat visits don't re-bill.
- Latency SLO **includes** screenshot upload + cold tenant connection; warm tenant connections on push-delivery/session start.
- Prompt-cache the persona block; cap insights in the reaction prompt (full set stays for Ask-a-Sim RAG).

### 13.4 Screenshot PII / privacy (review gap — owned v1 deliverable, not a risk bullet)

- **Default-ON redaction** in `@klav/sims-engine`: mask `input[type=password]`, common PII regex matches, and any element marked `data-klav-redact` — applied to **both** the element-map `text` and a **pixel mask on the screenshot** before it leaves the page. Ships default-on in v1 even if the consent UI is thin.
- An explicit org setting "send screenshots to AI provider" (default + self-host BYO-model / no-retention provider path actually wired).
- Screenshot retention policy + TTL/GC for orphaned object-storage keys; `deprovisionOrg` purges the org storage prefix.
- Consent copy + opt-out in the widget session bootstrap and extension options.

### 13.5 Error / empty / offline states

See the §3.4 matrix — required for v1 per surface (loading / empty / error / offline / degraded).

### 13.6 Onboarding / zero-to-first-sim (review gap)

- **Provisioning-aware signup:** show an org "warming up" state (v1.1 Turso path) while config entry is unblocked.
- **Guided checklist** in `apps/web`: connect integration → upload first transcript → review extracted speakers → push your first Sim.
- **Seed a bundled sample transcript + 1-2 demo Sims** into every new org so the dock and editor are non-empty on day one.
- **"Integration not yet configured" is a first-class state** in the bug-file path: queue the bug `filingStatus:'pending'` instead of throwing.
- **Self-host first-boot** documented as a runnable command (create admin, set `MASTER_KEY`/`KLAV_SECRET_KEY`, run migrations).

---

## 14. MVP cut-line & phased roadmap

The three reviewers' cut-lines converge: **extension-first, on-demand-before-proactive, poll-before-SSE, shared-DB-before-per-org-Turso, and a single `@klav/sims-core` types package built first.** Reconciled into one roadmap below.

### 14.0 Spike (before any build)

- **1-day vision-targeting accuracy spike** (§1.2). The result decides whether precise element-pointing is in v1 or degrades to region-reaction. **Nothing else starts until this is measured.**

### 14.1 MVP / v1 — prove the core loop end to end

**In v1:**

- **`@klav/sims-core` built FIRST** — the single source of truth for `Persona`, `Insight`, `SimQuote`, `ElementTarget`, `SimReaction`, `SimEmotion` (one reconciled enum), `BugRow`, `KlavStreamEvent`, `KlavAccessClaims`. Every package imports, never redefines. This unblocks every seam fix.
- **Task A (transcript → persona):** `.txt`/pasted/`.vtt` only, single-shot LLM, **mandatory verbatim-quote verification** (drop non-matching). One transcript per Sim.
- **Task B (reaction):** vision LLM, **screenshot-as-dataURL-in-request** (no presigned upload), client element-map + `ref` targeting → canonical `ElementTarget` + `SimReaction`; DOM-text fallback included (cheap insurance). **On-demand only** (click a Sim). Selector-primary targeting + rect fallback.
- **`@klav/character` dock:** walk/point/speech-bubble/File-bug, single `mountDock` API, reduced-motion, region-fallback baked in.
- **Bug filing:** Sim reaction → `/api/sims/reactions/:id/file` → reuse the four `@klav/core` handlers **directly**, server-side, `source`-tagged. Unified bug list in the web app.
- **One backend** (Bun + Hono) on a **single shared libSQL DB with `org_id` scoping** (no per-org Turso, no provisioning); **one auth token shape** minted for all surfaces; **dock delivery by 20-30s polling** (no SSE/Web Push/event log).
- **Web app (React + Vite):** unified bug tracker, persona editor (insight list + transcript-highlight viewer), transcript upload, push composer, team view. Auth via the shared token.
- **Extension:** merge the dock behind a `simsEnabled` flag, reuse `CAPTURE_TAB` with `requestId` demux, route File-bug through the existing `SUBMIT_REPORT` path. Snap untouched.
- **Cross-cuts shipped in v1:** default-ON screenshot/input redaction; per-org usage counter + hard budget cap + "paused" state; explicit loading/empty/error states (dock, tracker, extraction); seeded sample transcript + demo Sim; structured logging + an LLM cost/error telemetry view; the legacy `/api/feedback` contract test; `pnpm -r` (no Turbo/Changesets/project-references).

### 14.2 v1.1 — harden & expand

- **Embeddable widget** (pk_ flow, Origin allowlist, `html-to-image` client capture + DOM-map fallback; no headless capture worker).
- **SSE realtime** (one stream/envelope/cursor) replacing polling for the dock + the web-app activity feed; multi-instance libSQL-polled outbox.
- **Proactive auto-summon** with concrete caps + reaction caching/dedup (the seen-set) + `routeKey` normalization.
- **Enrichment across transcripts** (embedding dedupe + conflict detection + `ENRICH_MERGE_PROMPT`; mandatory PM target-confirm; conflict-resolution UI in the persona editor).
- **Ask-a-Sim** (RAG over insight embeddings, streamed citations; self-host BM25 fallback).
- **Cost/budget UI**, per-key rate-limit + rotation, observability/audit dashboards, the full team coverage matrix + activity feed + analytics.
- **Refresh-token rotation families** with reuse-detection.
- **docx/pdf parsers**, magic-byte detection, OCR/empty guard, LLM diarization + the human speaker-review step, map-reduce chunking.

### 14.3 Later

- **Per-org Turso physical isolation** + control-plane DB + provisioning + fan-out migrator (when an enterprise customer requires it; schema already `org_id`-ready).
- **Web Push (VAPID) wake fallback** for evicted extension SWs; multi-instance cross-instance bus beyond the libSQL outbox.
- **Presigned-PUT asset upload** (`/assets/sign`, `/capture-upload`); server-side headless screenshot capture.
- **Turborepo + Changesets + TS project references** (pure DX, introduced once the product exists).
- **SSO/SAML/OIDC** (token model already swappable).
- **Two-way external-tracker sync** (Jira webhook → Klav).
- **Self-host admin polish.**

### 14.4 What v1 deliberately defers (recorded, with the deferral reason)

| Deferred | Reason |
|---|---|
| Embeddable widget | Most net-new auth/CSP/tainted-canvas/key-abuse risk; overlaps the extension. |
| SSE + Web Push + event log for push | Polling at ≤30s is enough; sidesteps MV3 SW-eviction. |
| Proactive auto-walkout | Highest cost + annoyance risk; depends on unresolved `routeKey` normalization. |
| Ask-a-Sim | Pulls in the embedding pipeline + a self-host fallback; no mockup. |
| Enrichment across transcripts | Needs the unresolved cross-transcript identity + conflict-resolution UX. |
| Per-org Turso + control plane | Premature isolation before the loop is proven; `org_id` columns keep the split mechanical. |
| Turbo/Changesets/project references | Build-tooling gold-plating; can break the green baseline for no user benefit. |
| docx/pdf parse, LLM diarization, map-reduce | Risk-amortization for failure modes MVP users avoid by pasting clean text/`.vtt`. |
| Presigned upload, server headless capture | Optimizations; data-URL-in-request is simpler and matches `/api/feedback`. |

---

## 15. Open questions, risks & finding resolutions

### 15.1 Open questions a human must decide before the build

| # | Question | Why it blocks | Recommended default |
|---|---|---|---|
| Q1 | **Vision-targeting accuracy** — does the spike clear ≥70% on dense pages? | Decides whether precise element-pointing or region-reaction is the v1 UX. | Run the spike first; assume selector-primary + region fallback. |
| Q2 | **Trademark clearance for "Klav Sims"** — "SIMS SOFTWARE" is incontestable in IC 042; EA "The Sims" association. | Public-launch legal risk. | Name stands internally; **commission a formal clearance before public launch** (see §15.4). |
| Q3 | **Web-app login mechanism** — magic-link vs Google OAuth vs both. | Shapes `/login` + the control-plane auth contract. | Magic-link for v1; OAuth in v1.1. |
| Q4 | **`project` semantics** — does a Klav project map 1:1 to an external tracker project (Jira projectKey / Linear teamId) or is it a Klav abstraction over potentially multiple origins/environments? | Affects `PushComposer`'s project picker, `originAllowlist`, and how the widget resolves projectId from a pk_ key. | Klav-internal project that *references* one integration config; one project = one origin in v1. |
| Q5 | **Self-host secret management** — single env `MASTER_KEY` vs KMS/age rotation. | Key rotation requires re-wrapping all `settings_enc` rows. | Envelope-encrypt with a `key-id` alongside ciphertext so rotation is a re-wrap, not a re-encrypt; document the migration. |
| Q6 | **Org-domain source** for internal/client classification — workspace setting vs inferred from member email domains. | Task A classification needs it. | Workspace setting, defaulting to the owner's email domain. |
| Q7 | **Auto-re-push on enrichment** — when a persona `version` bumps, auto-`persona.updated` to current assignees or require explicit re-push? | Push volume + employee surprise. | Auto-update existing assignees; never auto-create new assignments. |
| Q8 | **Embedding provider for self-host** — cloud embedding vs local model vs BM25 fallback for Ask-a-Sim. | Self-host Ask-a-Sim parity. | Cloud embedding in cloud; BM25 fallback in self-host (v1.1). |

### 15.2 Top residual risks (after the reconciliations)

1. **Vision targeting unproven** (Q1) — mitigated by the mandatory spike + region fallback baked into the canonical contract.
2. **Quote hallucination** — mitigated by hard verbatim verification + drop + a `droppedQuotes` telemetry counter; a confidence floor in the UI.
3. **Targeting drift** (DOM re-render between capture and point) — selector-primary + `rect`/`bboxNorm` fallback + scroll re-anchor + graceful auto-rest on large layout change.
4. **PII leakage to the LLM** — default-ON redaction (§13.4) is an owned v1 deliverable, plus a no-retention/self-host provider path.
5. **Cost blow-up** — on-demand-only v1 + per-org budget cap + "paused" state; proactive deferred with caps.
6. **Client-persona leak** — the highest-severity security failure; three server-side chokepoints + a regression test; never client-side type filtering.

### 15.3 HIGH-severity finding resolutions (cross-reference)

| ID | Finding (review) | Canonical resolution in this spec |
|---|---|---|
| F1 | Element-targeting defined 6 incompatible ways; `pointDirection` vs `pointHint`; bbox in 3 coord systems | **§6.2.1** — ONE `ElementTarget` in `@klav/sims-core`: `{ ref, selector, rect(px), bboxNorm(0..1), pointDirection, label?, confidence }`. `pointHint` deleted; all others re-export. Character's union is internal via `toSimTarget` adapter (§6.2.2). |
| F2 | `IntegrationType` has no `'backend'`; `dispatchSubmit` always routes to `handlers.backend` when `backendUrl` set | **§7.1** — server imports the four handlers **directly**, selects by stored project type; `'backend'` dropped from every enum; "no tracker" = `integration: null`. |
| F3 | Persona/Insight/SimReaction defined in 3-4 packages | **INV-3, §4.2** — all in `@klav/sims-core`, imported never redefined. AI's richer `Insight` (`quotes[]` + offsets) is the adopted superset. |
| F4 | Auth token + config + route namespace diverge across surfaces | **§8.1, §7** — Auth owns identity; one JWT for all; widget `pk_` mints the **same** JWT; one `/api/*` namespace (`/widget/v1/*`, `/v1/sims/*` deleted); `backendUrl` is the one base-URL field; `SimsSettings` = UI prefs only. |
| F5 | `membershipId` vs `userId` identity key | **§5.3** — `membershipId` (`mem_`) is THE tenant key everywhere; `userId` only in control plane; AI `reaction_log` → `memberId`; web targets resolve to `membershipId`. |
| F6 | Four bug-record shapes don't line up; `SimReactionRef` unproduced | **§10.3** — ONE `BugRow` DTO in `@klav/sims-core`; explicit producer chain; `SimReactionRef` is a **server-side projection** of the reactions log. |
| F8 | AI/Backend/Extension add Sims types *into* `@klav/core` (layering inversion) | **INV-1/INV-2** — `@klav/core` gains zero Sims types; those `persona.ts`/`sims-types.ts` proposals relocated to `@klav/sims-core`; eslint rule forbids `core → sims-core`. |
| F9 | Project vs Workspace scoping ambiguous | **§5.2** — personas/transcripts/insights = workspace; bugs/reactions/pushes/integration_configs = project; `persona_assignment` carries both. |
| F10 | SSE specified 4 ways (URLs, event names, cursors) | **§8.6** — ONE `KlavStreamEvent` union + `GET /api/stream?cursor=<seq>` + `GET /api/events?since=<seq>`; `persona.assigned/updated/revoked` names; MVP uses polling. |
| F13 | `@klav/character` mount API specified 4 ways; target-resolution ownership disputed | **§9.1** — ONE `mountDock(personas, opts): DockHandle`; character owns the shadow host + target resolution; `onResolveTarget` removed; types imported from sims-core. |
| F17 | Web app stack: Next.js vs React+Vite; `@klav/shared` vs `@klav/sims-core` | **§10** — React + Vite at `apps/web`; no `@klav/shared`; all DTOs in `@klav/sims-core`. |
| F18 | Turso routing: single gateway vs per-org host | **§7** — single gateway; server resolves tenant from JWT `org` claim; clients never see per-org hosts. |
| F-onboarding | No zero-to-first-sim flow | **§13.6** — provisioning-aware signup, guided checklist, seeded sample Sim, "integration not configured" as a first-class state, self-host first-boot. |
| F-PII | Redaction/consent only a risk bullet | **§13.4** — default-ON redaction (text + pixel mask), org consent setting, retention/GC, no-retention provider path — owned v1 deliverable. |
| F-cost | No global budget enforcement; proactive uncapped | **§7.2, §13.3** — `usage_counters` + `402` + "paused" state; proactive OFF by default; reaction cache key. |
| F-observability | No logging/metrics/audit | **§13.2** — structured logging, LLM telemetry, audit log for push/revoke/integration changes, no silent error-swallow. |
| F-migrations | `/api/feedback` tenant-routing gap; no per-tenant migration strategy | **§5.7** — additive-only expand→backfill→contract, per-tenant failure isolation, settings-shape migration, legacy contract test. |
| F-testing | No cross-subsystem/eval/isolation tests; emotion enums diverge | **§13.1** — contract tests on the single sims-core shapes, reconciled emotion enum, LLM eval harness, tenant-isolation test, legacy contract test. |
| F-screenshot-transport (F14) | data-URL vs presigned vs capture-upload | **§6.2.3** — v1 sends screenshot as data-URL in the react body; server persists; presigned deferred. |
| F-insight-dedupe (F16) | DB hash-unique vs AI embedding-cluster | **§5.5** — adopt the AI normalized model (`insights` + `insight_quotes` + `insight_embeddings`); `contentHash` is a pre-filter only, not unique; dedup owned by the AI subsystem. |
| F-canonical-offsets (F12) | canonicalText blob vs inline `transcript.body` | **§6.1, §7** — `GET /transcripts/:id` returns the **frozen canonicalText as `body`** + `canonicalLen`; never re-normalized on read; offsets index into it only. |
| F-host-ids | Wrong/colliding shadow-host ids in capture filters | **§11.3** — three distinct ids; both surfaces exclude `klav-sims-host` plus their own Snap host; double-mount guard. |
| F-ReportContext (F15) | `source` threaded through `ReportContext` by only the extension | **§4.3, §11.1** — `source` is a top-level, server-authoritative bug-filing field; `@klav/core` `ReportContext` unchanged. |

### 15.4 Trademark (authoritative product note)

The name **Klav Sims** carries trademark risk: "SIMS SOFTWARE" is incontestable in IC 042 (computer software design/development services), and there is consumer association with EA's "The Sims." **Decision: the name stands for internal/design use.** **Action item (must precede public launch):** commission a formal trademark clearance/freedom-to-operate opinion, and prepare a fallback brand should clearance fail. This is recorded as Q2 above and is the single non-engineering gate before go-to-market.

---

*End of spec.*
