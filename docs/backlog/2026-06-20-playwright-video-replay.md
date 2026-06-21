# Backlog — Playwright-native video walkthrough (deferred in favor of rrweb)

**Status:** Backlog (2026-06-20). We chose **rrweb session replay** (Plan E2) as the primary Walk replay because of storage efficiency (~20-100× smaller than video), perfect scrubbing/DOM-inspection, and reuse of the capture layer for the extension's real-session→persona pipeline. This ticket preserves the video option.

## What
A real `.webm` walkthrough video per Walk via Playwright `recordVideo`, with an **injected visible cursor** (animate `page.mouse.move(...)` to each target so the mouse visibly travels and clicks). One continuous video across the journey's page navigations, with step "chapters" to seek and the failing/heal step flagged.

## Why it might still be worth it
- Dead-simple capture (built into Playwright; handles multi-page as one file for free).
- A familiar, shareable artifact (download/embed a video).
- No multi-page stitching or player integration.

## Why deferred
- Storage is 20-100× heavier than rrweb event streams.
- Test-only — the capture is not reusable for real user-session replay / persona capture, whereas rrweb is.

## If revisited
- `chromium.launch()` → `browser.newContext({ recordVideo: { dir, size } })`; video finalizes on `context.close()`.
- Inject a cursor sprite via `addInitScript`; before each action `page.mouse.move(x, y, { steps: 15 })` then click, so the recording shows the cursor traveling.
- Map `run_step` timestamps → video offsets for chapter markers; highlight the RED/AMBER step.
