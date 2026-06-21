# Design — Harmonize the extension & widget modals (feature parity)

**Date:** 2026-06-21 · **Status:** approved, pre-implementation

## Context & goal

Klavity has **two report-composer modals** that have drifted apart:
- **`buildModal`** (`packages/core/src/modal.ts`, ~421 lines) — used by the embeddable **widget** (`packages/sdk/src/widget.ts`). Has: per-project **theming** (`themeCss` from `modal-theme.ts`), **Genie** open/close animation, custom **thank-you**, the **lead-gen success screen** (`successCopy` + `onLead`), **Powered-by**, the **annotator** (markup), Bug/Feature toggle, full-page capture + upload. Lacks: drag-to-select region capture UI, paste-image, auto-capture-on-open.
- **Extension composer** (`packages/extension/src/content.ts`, `openModal()`, ~1400 lines) — bespoke. Has: **drag-to-select region/snippet capture** (`startRegion` → `captureVisibleTab` crop), **paste-image**, **auto-capture-on-open**, the **annotator** (markup), Bug/Feature, upload. Lacks: theming, Genie, custom thank-you (hardcoded cream/sand + "✓ Filed as KEY").

The recent app work (appearance themes, custom thank-you — v0.31; the unified config endpoint — v0.31/0.33) landed only in `buildModal`. The extension is behind. The user wants the two **harmonized into one shared composer with feature parity**, so future modal work lands in both at once. The user explicitly values **click-to-markup** and **snippet/region screenshots** — both must be first-class in the harmonized modal.

Audit detail: `.git/sdd/extension-gap-report.md`.

## Decisions locked (from brainstorming)

1. **Harmonize on `buildModal` as the single superset composer.** Port the extension-only capture features into `buildModal`; migrate the extension to use `buildModal`. (Not a theme-CSS overlay on two separate composers.)
2. **Klavity-only submission** (Gap 1): the extension always posts to `POST /api/feedback` (via the `ext_` Cloud token). Remove direct Jira/Linear/GitHub/Plane routing; tracker forwarding is server-side via **Klavity connectors** (dashboard). No auto-migration of stored creds — a one-time deprecation prompt points users to connect + add a connector.
3. **Send `project_id` on submit** (D1): so multi-project users' reports land in the active project, not project #1.
4. Markup (annotator) and snippet/region capture are **required** in the harmonized modal for both clients.

## The harmonized modal — `buildModal` feature superset

Both clients call one `buildModal`. The capture *mechanism* is host-provided via callbacks (widget = `html-to-image`; extension = `captureVisibleTab` via its service worker); the *UI/gesture* lives in `buildModal`.

**Capture toolkit (union of both):**
- **Full-page** capture (`onCaptureFull`) — existing.
- **Region/snippet** capture — NEW in `buildModal`: a drag-to-select rectangle overlay that resolves to `onRegionCapture(rect)` (the callback already exists; the gesture UI is added). Ported from the extension's `startRegion`.
- **Upload** from disk — existing.
- **Paste-image** — NEW in `buildModal`: a paste handler adds the image to the screenshot strip. Ported from the extension.
- **Auto-capture-on-open** — NEW optional flag: capture full page on mount (the extension does this today). Off by default; the host opts in.

**Markup (annotator):** rect / draw / text + color, on any captured/added screenshot — already in both via `@klavity/core/annotator`; preserved as a first-class feature in the harmonized modal.

**Compose & present:** Bug/Feature toggle, description, the per-project **theme** (`themeCss`), **Genie** animation, custom **thank-you**, and the **success screen** path (lead-gen mode + `onLead`) — the success/lead-gen + Powered-by remain *widget-only* simply because the extension does not pass those callbacks.

### `buildModal` interface (extended)

```ts
buildModal(initialType, callbacks, config?)
```
- `callbacks`: `onCaptureFull`, `onRegionCapture` (now invoked by the new gesture UI), `onSubmit`, optional `success?: { copy, onLead }` (widget-only).
- `config: ModalConfig` (theme/thankYou/colors/font) — already the 3rd arg.
- NEW field on the `callbacks` (`ModalCallbacks`) object: `autoCaptureOnOpen?: boolean` (default false). Keeps the `buildModal(type, callbacks, config)` signature stable.

No breaking change to the widget's existing call.

## Extension migration

`packages/extension/src/content.ts`:
- Replace the bespoke `openModal()` body with a `buildModal(...)` call. Keep all the extension's surrounding plumbing: contextmenu/right-click trigger, Sims activation stack (`klavBootstrap`/`maybeActivate`/`KLAV_REVIEW` — untouched), and the **capture callbacks** that bridge to the background service worker (`onCaptureFull` and `onRegionCapture` call `captureVisibleTab`/crop via `chrome.runtime` messages, as today).
- Fetch `GET /api/projects/:id/config` for the active project (the extension already knows it via `klavMatchProject`/`klavConfig`); pass the returned `modalConfig` as the 3rd arg so theme + thank-you apply.
- `onSubmit` posts to `/api/feedback` (see Klavity-only below) including `project_id`.
- Set `autoCaptureOnOpen: true` to preserve the extension's current behavior.

The annotator already lives in `@klavity/core`; both clients keep using it.

## Klavity-only submission (Gap 1)

- `packages/core/src/submit.ts` (`dispatchSubmit`): remove direct-tracker routing (Jira/Linear/GitHub/Plane handlers). All submissions go through the backend handler (`integrations/backend.ts` → `POST /api/feedback`).
- `packages/core/src/integrations/backend.ts`: include `project_id` in the FormData (from the payload/settings).
- `packages/core/src/types.ts`: deprecate/remove `connectionMode: 'direct'`; default to the Klavity Cloud path. Extend the submit payload/`IntegrationConfig` with the active `projectId`.
- `packages/extension/src/background.ts`: pass the active `projectId` (from `klavConfig`) into the submit payload; the `AUTO_FILE_ERROR` path uses the same backend route.
- `packages/extension/src/options.ts`: remove the direct Jira/Linear/GitHub/Plane config UI; if not connected to Klavity Cloud, the report flow triggers the existing connect handshake; show a one-time deprecation banner pointing to the dashboard connectors.

Existing direct-mode users: their tracker integration moves to a **Klavity connector** (set up once in the dashboard — the connector system already supports Jira/Linear/GitHub/Plane/webhook with dedup + auto-copy). Stored extension creds are NOT auto-sent to the server.

## Data flow (after)

1. User triggers the composer (right-click in the extension; right-click/launcher in the widget).
2. Client fetches `GET /api/projects/:id/config` → `{ modalConfig, widget }`. `buildModal` themes from `modalConfig`.
3. User captures (full-page / **region snippet** / upload / paste), **marks up** (annotator), describes, submits.
4. `onSubmit` → `POST /api/feedback` with `project_id` (+ Bearer `ext_` token for the extension; same-origin for the widget). Server: persist + connector auto-copy + (Sim paths) grounding/dedup/expectations.
5. Post-submit: widget shows the mode-aware success screen (lead-gen) or thank-you; extension shows the custom `thankYou` (or default), themed, with Genie close.

## Error handling

- Config fetch failure → default theme (`resolveModalConfig({})`), composer still works.
- Capture/region failure → banner, modal stays open (as today).
- Submit failure → surfaced; the response is never blocked by the fire-and-forget connector auto-copy.
- Not connected (extension, no `ext_` token) → trigger connect handshake instead of a silent failure.

## Testing

- `packages/core`: unit tests for the new `buildModal` capabilities — region-select gesture resolves to `onRegionCapture` with the right rect; paste adds to the strip; `autoCaptureOnOpen` calls `onCaptureFull` on mount; theme/thankYou applied from `config`. Keep the existing `modal-theme` tests green.
- `packages/core/src/submit.ts`: test that `dispatchSubmit` always routes to the backend handler (no direct routing) and that `project_id` is included.
- `packages/extension`: keep `auth.test`/`feedback-trigger.test`/`coexist.test` green; add a test that the submit payload carries `project_id` and targets `/api/feedback`. DOM-heavy composer behavior verified by reading + manual smoke.
- Build both `packages/core`, `packages/sdk` (widget bundle — confirm the widget still works after `buildModal` changes), and `packages/extension`.

## Out of scope (YAGNI)

- Lead-gen mode / anonymous intake / Powered-by in the extension (N/A — it just doesn't pass those callbacks).
- Auto-migrating stored Jira/Linear creds to a server connector (user sets up the connector in the dashboard).
- Manual-report dedup (needs server-side AI inference — deferred; see gap report Gap 5).

## Risks

- **Capture parity regression** — porting region-select + paste + auto-capture into `buildModal` and migrating the extension off its battle-tested `openModal` risks losing capture fidelity. Mitigate: port the exact gesture logic from `content.ts`; keep the extension's SW capture callbacks unchanged; manual smoke on both clients before ship.
- **Widget regression** — `buildModal` is live in the lead-gen widget; the new capabilities must be additive (no change to the widget's existing call). Re-run the widget's `successCopy` test + rebuild the bundle + verify.

## Reference
Memory: [[klavity_leadgen_widget]], [[klavity_widget_appearance]], [[klavity_rightclick_widget]], [[klavity_connectors]]. Gap report: `.git/sdd/extension-gap-report.md`.
