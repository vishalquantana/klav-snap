# Settings: widget embed code + live preview + extension install

**Date:** 2026-06-21
**Branch:** `feat/settings-widget-preview`
**Scope:** Dashboard Settings only (`prototype/public/dashboard.html`). No server changes.

## Problem

The admin Settings → **🎨 Report widget appearance** drawer lets an admin configure the
report widget (theme, custom colours, thank-you message, widget mode, CTA), but gives no way to:

1. **Get the embed code** — the copy-paste snippet only appears in the zero-state onboarding
   checklist, which disappears once the project has Sims. An established project has no way to
   re-grab it from Settings.
2. **See what the configuration looks like** — you pick "Neon" or a custom colour and save blind;
   the only way to verify is to load a page that has the widget installed.
3. **Install the browser extension** — the QA-focused path (Sims watching the real product) is
   only surfaced during onboarding.

## Goal

Make the appearance drawer the single place to configure, preview, embed, and connect the widget —
so an admin can self-serve all of it without leaving Settings.

## Design

All three additions live **inside the existing `appearanceDrawer`** (admin-only,
`prototype/public/dashboard.html`). One file touched. No new routes, no new dependencies.

### 1. Embed code block (top of the appearance card)

- Read-only `<code id="appearanceSnippet">` rendering the canonical one-line snippet for the
  **active** project via the existing `embedSnippet(pid)` helper.
- A **Copy** button reusing the exact clipboard pattern already wired for `embedCopy`
  (clipboard API with a `textarea`/`execCommand` fallback, "Copied ✓" confirmation).
- One muted helper line: *"Paste this before `</body>` on any page — no extension needed."*
- Rendered/refreshed inside `loadAppearance()` (which already has the active project id).

### 2. Live preview pane (re-renders on change)

A preview that mirrors the **production report modal** and updates live as the admin edits the
config — before saving.

- **Markup:** a mini "page" backdrop (`.wp-stage`) containing a scaled report-modal mock with the
  same structure the real modal uses: 🐛 Bug / 💡 Feature toggle, `📍 /your/page` line, a
  placeholder screenshot strip, a description textarea, and a **Submit** button. Plus a floating
  **💬 Report a bug** launcher chip in the stage corner. A small **"Show thank-you"** toggle swaps
  the body for the success state.
- **Styling:** the preview root carries CSS custom properties (`--kl-bg`, `--kl-accent`, …)
  computed in-browser. The preview CSS uses those variables exactly as `modal.ts` does, so the
  rendered look matches production.
- **Theme source of truth:** port the `THEMES` palette table, the `luminance()` helper, and the
  custom-colour derivation from `packages/core/src/modal-theme.ts` **verbatim** into a small JS
  block in `dashboard.html`. A comment marks it as a mirror of that file so a future palette change
  there flags this copy. `computePreviewVars(cfg)` returns the same `{ '--kl-*': value }` map that
  `themeCss()` builds (light base for `custom`, palette lookup otherwise, custom primary/secondary/
  background + luminance-derived fg/muted/border/chip/input, optional font).
- **Live updates:** `renderWidgetPreview()` reads the current form values
  (`kl-theme`, `kl-primary/secondary/bg/font`, `kl-thankyou`, `kl-mode`, `kl-cta`), computes the
  vars, applies them to the preview root, and sets the thank-you text. Wired to fire on
  `change`/`input` of all those controls (in addition to the existing theme→custom-panel `sync`),
  and once on load. Uses the existing one-time `_appearanceWired` guard so listeners attach once.
- **Mode awareness:** in the thank-you state, **lead-gen** mode shows the "get it for your product"
  CTA button (using the CTA URL field, falling back to a generic label); **support** mode shows the
  plain `✓ Filed as KLAV-123` style confirmation with the configured thank-you message.
- **Pro gating:** custom colours already only apply for Pro accounts in the save path. The preview
  reflects whatever is in the colour fields regardless (it is a visual preview, not a saved state),
  matching how the controls already behave; no extra gating logic needed in the preview.

### 3. Install-the-extension card (bottom of the drawer)

A compact card, mirroring the existing onboarding chooser tone:

- 🧩 heading + one line: *"Best for internal QA — your Sims watch your real product through the
  Klavity browser extension."*
- A **Get the extension →** button/link to `/onboarding` (canonical entry point; the Chrome Web
  Store listing is still pending review).
- A muted line: *"Already installed? Open a monitored URL while signed in and it connects
  automatically."*

## Layout

Within the appearance card, top-to-bottom: **embed code** → existing **config controls**
(theme/colours/thank-you/mode/CTA/notify) beside or above the **live preview** → **Save** button →
**install-extension** card. On wide screens the controls and preview sit side by side
(`display:flex; flex-wrap:wrap`); on narrow screens the preview stacks under the controls. Uses the
dashboard's existing card/`.muted`/button classes and CSS variables — no new design language.

## Security

- The snippet is built from `embedSnippet(pid)` (host + project id only) — no user input echoed.
- Preview CSS variables come from the same validated/derived values `modal-theme.ts` produces;
  colour inputs are `<input type="color">` (already constrained to `#rrggbb`) and the font goes
  into a CSS custom property, not into markup. The thank-you message is set via `textContent`
  (never `innerHTML`) so it cannot inject markup into the preview.

## Out of scope (YAGNI)

- No server route or stored "preview" state — preview is purely client-side from live form values.
- No iframe / real `/widget.js` instance in the preview (chosen against for weight + needing a save).
- No changes to the extension package or a Web Store upload (dashboard-only change).
- No new themes or config fields — preview reflects exactly the fields that already exist.

## Files

- `prototype/public/dashboard.html` — markup additions in `appearanceDrawer`, preview CSS, and the
  `computePreviewVars` / `renderWidgetPreview` JS wired into `loadAppearance`.
- Version lockstep per project convention: `CHANGELOG.md`, `docs/PRD.md`, and the 5 manifests.

## Success criteria

- Admin opens Settings → appearance drawer and sees the embed snippet with a working Copy button.
- Changing theme / custom colours / thank-you / mode updates the preview instantly, matching how
  the real widget renders that config.
- A clear, compact path to install the browser extension is present in the drawer.
- No regression to existing save/load behaviour; build + existing tests pass.
