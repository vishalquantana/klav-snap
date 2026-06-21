# Klavity — Product Requirements (PRD)

> **Version:** `0.40.0` &nbsp;·&nbsp; **Status:** Phase 1 (Klavity Snap) shipping &nbsp;·&nbsp; **Updated:** 2026-06-21
>
> This is the single source of truth for the product version. It moves in lockstep
> with [`CHANGELOG.md`](../CHANGELOG.md) and every `package.json` + the extension
> `manifest.json`. See [Versioning](#versioning) for the rules.

---

## 1. Vision

Klavity turns the messy reality of "this is broken / this is missing" into
filed, actionable tickets — first by hand, then by AI persona, then autonomously.
Named after **Ekalavya**, the self-taught master.

Three phases, each building on the last through one shared backend (the **cloud
switch**: a single `backendUrl`):

| Phase | Product | One-liner | Status |
|---|---|---|---|
| 1 | **Klavity Snap** — the *eyes* | Right-click to file annotated bug/feature reports to Jira, Linear, GitHub, or Plane from any site. | ✅ Shipping (this repo) |
| 2 | **Klavity Sims** — the *judgment* | AI personas (virtual QA engineers) that look at a page and react in character, then file what they find. | ✅ Live |
| 3 | **Klavity AutoSim** — the *autonomy* | Self-healing end-to-end testing: author once, replay with zero AI, heal-or-file when the UI changes (formerly "Klavity OS"). | ✅ Shipped |

Open-core, FSL-1.1-ALv2; Turso/SQLite backend. Built by
[Quantana](https://quantana.com.au).

## 2. Phase 1 — Klavity Snap (current scope)

**Goal:** the lowest-friction way to file a high-context bug or feature request
from anywhere on the web.

**Shipped capabilities** (see [`CHANGELOG.md`](../CHANGELOG.md) for the per-version
breakdown):

- Right-click reporter (Chrome MV3) with custom context-menu overlay.
- Auto + region screenshot capture (cross-origin images, full-page render).
- Canvas annotation (pen, rect, arrow, text, 4 colours, undo/clear).
- Upload & paste attachments with HEIC/HEIF conversion.
- Context capture: URL, browser, screen size, last 50 console + network errors.
- Four integrations: Jira, Linear, GitHub Issues, Plane.
- Cloud switch (`backendUrl`) → direct mode or Klavity Cloud / self-hosted.
- Embeddable SDK `@klavity/snap` (script tag + npm).
- Embeddable report widget: dogfooded on klavity.quantana.top for logged-in users; Bearer-token support for cross-origin submission.
- Account login + per-user/admin Plane connection, AES-GCM secret encryption.
- **Widget appearance settings (v0.31.0):** per-project theme (light [default], dark, glass, neon, liquid [experimental]) with custom colors/font (Pro-gated), custom post-submit thank-you message, and Genie open/close animation. Theme config served via `GET /api/projects/:id/config`; `custom` theme requires Pro account.

**Architecture:** `packages/core` (shared types, integrations, annotator, modal),
`packages/extension` (MV3), `packages/sdk` (embeddable). The Bun `prototype/` is
the seed of Phase 2's `services/api`.

## 3. Phase 2 — Klavity Sims (next)

Live prototype today (`prototype/`): transcript → named personas → on-page vision
reaction → suggested bug → filed. Sims Studio lets users extract, edit, and now
**save Sims to a library** (persistence API). Productionising this into the real
backend is the Phase 2 critical path.

## 4. Versioning

Klavity Snap follows [Semantic Versioning 2.0.0](https://semver.org/). Because
this is pre-1.0, the practical rules are:

- **MAJOR (`0.x` → `1.0`)** — first stable, publicly committed API surface.
- **MINOR (`0.1` → `0.2`)** — new user-facing capability, additive.
- **PATCH (`0.2.0` → `0.2.1`)** — bug fixes / internal changes, no new surface.

**The version lives in exactly these places and they always change together:**

1. The `**Version:**` line at the top of this PRD.
2. The top dated entry in [`CHANGELOG.md`](../CHANGELOG.md).
3. `package.json` in `/`, `packages/core`, `packages/extension`, `packages/sdk`.
4. `packages/extension/manifest.json`.

**Release flow:** add changes under `## [Unreleased]` in the changelog as you go;
on release, rename that heading to the new version + today's date, bump the four
manifests + this PRD header, then commit and tag `vX.Y.Z`.

## 5. Roadmap / open items

- Phase 2: productionise Sims into `services/api` (Bun + Hono).
- Sign in with GitHub (OAuth) in extension + web app — reduce sign-up friction.
- Wire the reusable Sim component (`@klavity/core/sim`) into live surfaces.
- Phase 3: Klavity AutoSim — self-healing end-to-end testing (shipped; formerly "Klavity OS").

### Note — regression detection is prospective

The `reopen` trait op (v0.13.0) enables recurrence/regression detection: when a
previously resolved trait resurfaces, the Sim reacts with the implied disappointment
("raised before ... and it's back"). This is **prospective only** — it requires a
clean `resolve` event followed by a `reopen` on a connected trait lineage.

**Legacy-import traits are excluded.** Traits created via `legacy_import` have no
resolving events in their timeline, so the regression signal cannot fire for them.
Severity in extracted insights guides (but does not auto-file) bug severity.

### Note — grounded Sim feedback & suggested-bug dedup

Sim feedback trait quotes (v0.24.0) are now grounded in the transcript via a three-pass match strategy: exact string, char-normalized, or fuzzy line-snap. Citations carry a `verified` tri-state (anchored, unverified, not-attempted) plus character offsets; unmatched quotes are retained but flagged. Suggested-bug dedup (v0.24.0) is **prospective only** — it collapses NEW duplicates within an unchanged build and bumps the recurrence counter, but does not retroactively backfill `src_verified` on existing traits or consolidate pre-existing feedback rows.
