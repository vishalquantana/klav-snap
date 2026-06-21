# rrweb session replay for Walk visualization — PROMOTED to Plan E2 (active)

**Status:** ACTIVE — promoted to **Plan E2** on 2026-06-20 (flipped ahead of the Playwright-video option after weighing storage ~20-100× smaller + scrubbing/DOM-inspection + reuse for the extension's real-session→persona capture). See `docs/superpowers/plans/2026-06-20-klavity-os-trails-plan-e2-rrweb-replay.md`. The Playwright-video walkthrough is now the backlog alternative (`2026-06-20-playwright-video-replay.md`). The notes below remain the design basis.

## What
A Microsoft-Clarity-style **session replay** of a Trail Walk: record the DOM + pointer/scroll/input events during the walk and replay them in-browser with a synthetic cursor via `rrweb` + `rrweb-player` — a smooth, pixel-faithful, fully scrubable "video-like" reconstruction (not a real video file).

## Why (vs the shipped Playwright video)
- **Tiny storage** — JSON event stream, not webm frames; viable at Clarity scale (every walk, retained long-term).
- **Perfect scrubbing + DOM inspection** — jump to any moment, inspect the live DOM at that instant, overlay heal/failure markers precisely on elements.
- **Deterministic & headless-friendly** — no dependence on rendered cursor/video pipeline.
- Complements the Playwright walkthrough video; could eventually replace it as the default replay if storage/scale favors it.

## Scope / approach
- Inject the rrweb recorder into the page (Playwright `addInitScript` / `page.evaluate`), collect events during the Walk, store them (S3 or a `walk_replays` table; gzip the event stream).
- **Multi-page navigation is the hard part:** rrweb records per-document, and our journeys do full page navigations. Record one rrweb segment per page (re-inject on each navigation), tag each segment with its `run_step` idx + URL, and stitch them in the player as chapters.
- Dashboard: embed `rrweb-player`; overlay verdict markers, the heal `from→to`, and the grounded finding at the failing step; auto-seek to the RED/AMBER moment.
- Synthetic cursor: drive Playwright `page.mouse.move(...)` along a path to each target so the recorded pointer events show a traveling cursor (same technique as the Playwright-video cursor).

## Considerations
- `rrweb` is MIT, JS — fits the stack. Our research already flagged rrweb as a recording-layer candidate (gives fidelity, not determinism).
- Privacy: rrweb captures full DOM; add masking for sensitive inputs before any real-customer use (Clarity masks by default).
- Build only after the Playwright-video walkthrough (Plan E2) is in and we know the multi-page UX we want.

## Relation
- Alternative to **Plan E2 — Walk Replay (Playwright video + visible cursor)** (shipping first).
- Engine: Playwright remains the actuator either way; rrweb is purely the capture/replay layer.
