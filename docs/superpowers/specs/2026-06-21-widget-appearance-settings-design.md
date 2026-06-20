# Widget Appearance & Post-Submit Settings — Design

Date: 2026-06-21
Status: Approved (auto-proceed per user workflow)

## Goal

Let a project admin configure the embeddable report popup's **appearance** (theme + optional
custom colors/font) and **post-submit message** from the dashboard. The widget fetches this
config at runtime and `buildModal()` renders accordingly. Ship the **Genie** open/close
animation by default (not admin-configurable for now).

This productizes the theme/animation work prototyped in `packages/core/demo/popup-themes.html`.

## Scope (in)

- **Theme** per project: `light` (default), `dark`, `glass`, `neon`, `custom`, `liquid`.
- **Custom colors (Pro)**: `primary`, `secondary`, `background`, `font` — applied via CSS vars.
  Editing custom values is gated to Pro accounts; non-Pro can still pick the built-in themes.
- **Custom thank-you message**: replaces the default `✓ Filed as <KEY>` success text.
- **Genie animation**: macOS expand-from-bottom on open, collapse-to-bottom on close,
  honoring `prefers-reduced-motion`.
- Admin settings UI section + `GET/POST /api/projects/:id/config` + storage.

## Scope (out, for now)

- Admin-selectable entry/exit animations (we ship Genie only).
- Post-submit redirect, ticket-link CTA, auto-close-delay config (deferred; message only).
- True Liquid refraction on arbitrary customer pages — see "Liquid" note below.

## Architecture

### Data model — `prototype/lib/db.ts`
- Add column `modal_config_json TEXT DEFAULT '{}'` to `projects` (idempotent `ALTER TABLE`
  guarded like existing migrations).
- Accessors:
  - `getProjectModalConfig(projectId): ModalConfig` — parses JSON, returns `{}` on empty/bad.
  - `setProjectModalConfig(projectId, config): void` — JSON-stringifies a validated object.

### Shared type — `packages/core/src/types.ts`
```ts
export type ModalTheme = 'light' | 'dark' | 'glass' | 'neon' | 'custom' | 'liquid'
export interface ModalConfig {
  theme?: ModalTheme            // default 'light'
  primary?: string              // hex; custom theme only
  secondary?: string            // hex; custom theme only
  background?: string           // hex; custom theme only
  font?: string                 // font-family stack; custom theme only
  thankYou?: string             // post-submit message; default '' → built-in
}
```

### Modal rendering — `packages/core/src/modal.ts`
- `buildModal(initialType, callbacks, config?: ModalConfig)` — new optional 3rd arg.
- Replace hardcoded palette with **CSS custom properties** on `.klavity-modal`/`.klavity-overlay`,
  driven by a `THEMES` map ported from the demo (`light/dark/glass/neon` var sets). `custom`
  starts from `light` then overrides `--accent/--accent2/--bg/--font` from config (with
  readable-text auto-contrast from background luminance). `liquid` → see note.
- **Genie animation**: inject `@keyframes` for `in-genie`/`out-genie` (from the demo, the
  smoothed 2-keyframe version) + overlay fade; play on open; play exit before `host.remove()`
  in `close()`. Guard with `@media (prefers-reduced-motion: reduce)`.
- **Thank-you**: success screen uses `config.thankYou` when set. Rendered with `textContent`
  (never `innerHTML`) to preserve the existing XSS posture; falls back to `✓ Filed as <KEY>`.
- All theme colors flow to the success screen via the same vars.

### Liquid note
On a customer's arbitrary page there is no clean element to clone, so the demo's clone-based
refraction does not apply. `liquid` therefore renders as **frosted glass + specular rim**
(`backdrop-filter: blur() saturate()`, which works over any page) — the displacement warp is a
demo-only flourish. The theme is labeled "experimental" in the UI to set expectations.

### Backend — `prototype/server.ts`
- `GET /api/projects/:id/config` — returns `{ modalConfig }`. **Public** (project-scoped):
  appearance config is non-sensitive and the widget must theme itself before any auth/connect.
  Returns only appearance fields (never anything sensitive). 404 for unknown project id.
- `POST /api/projects/:id/config` — admin-only (`projectAccess === 'admin'`). Validates:
  - `theme` ∈ allowed set (else 400).
  - color fields match `^#[0-9a-fA-F]{3,8}$`; `font` ≤ 120 chars from an allowlist-ish charset.
  - `thankYou` ≤ 140 chars (stored raw, rendered as text).
  - Custom color fields rejected (or ignored) unless the account is Pro.
  - Total blob ≤ 2 KB.
- Reuses existing auth/`projectAccess` helpers.

### Widget — `packages/sdk/src/widget.ts`
- After mount, fetch `GET /api/projects/:id/config` (best-effort; on failure use defaults).
- Cache the result; pass it as the 3rd arg to every `buildModal(...)` call (bug + feature).
- No change to capture/submit flow.

### Admin UI — dashboard (server-rendered in `prototype/server.ts`)
- New "Report widget" settings card on the project page (same CRUD pattern as connectors):
  - Theme selector (radio/select) with the 6 options; "Liquid (experimental)" + "Custom (Pro)"
    badges. Custom reveals color pickers + font field (disabled w/ upsell if not Pro).
  - Thank-you message text input (≤140).
  - Live preview is out of scope; link to the demo page instead.
  - Save → `POST /api/projects/:id/config`; success/error inline.

## Data flow
admin form → `POST /config` (validate, Pro-gate) → `modal_config_json` → widget `GET /config`
→ `buildModal(type, cb, config)` → themed modal + Genie + custom thank-you.

## Testing (TDD)
- `db`: get/set round-trip; bad JSON → `{}`; default `{}`.
- `modal`: applies theme vars per theme; custom overrides; `thankYou` shown via textContent;
  malicious `thankYou` not interpreted as HTML; reduced-motion disables animation.
- endpoint: GET shape; POST admin-only (403 for member); invalid theme/color/oversize → 400;
  non-Pro custom colors rejected.
- widget-lib/widget: config fetch failure falls back to defaults.

## Security
- POST admin-only; strict validation (enum theme, hex colors, length caps, 2 KB blob).
- `thankYou` rendered as text only (no innerHTML), consistent with current modal XSS guard.
- No secrets in config; GET is low-sensitivity (appearance only) and project-scoped.

## Backward compatibility
- No config → `theme: 'light'` (intended new default per branding). Existing projects with no
  row value get light. Genie animation applies to all unless reduced-motion.

## Versioning
- Bump CHANGELOG.md + docs/PRD.md + all 5 manifests in lockstep (project SemVer rule).
