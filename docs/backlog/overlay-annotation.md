# On-Page Overlay & Visual Annotation Layer

> **Status:** Backlog / future-work (not scheduled). **Date:** 2026-06-19. **Origin:** competitive research vs Marker.io (+ BugHerd / Userback / Usersnap).
> **Likely target version when picked up:** MINOR (new user-facing capture surface).

**One-line summary:** Give Klavity an interactive on-page overlay where a user points at a live DOM element, draws/highlights/blurs on it, pins the comment to that element, and the captured annotation + auto-collected technical metadata flows straight into Klavity's existing AI-vision review and connector (Jira/Linear/GitHub/Plane/webhook) pipeline.

---

## 1. Problem / why

Klavity's capture surface today is a **browser extension** that grabs a screenshot + free-text feedback and uses an AI vision model to synthesise a structured, reproducible ticket. We also have a (separate) **embeddable widget** that drops Sims onto a customer page to react live (`docs/superpowers/specs/2026-06-19-klavity-embed-widget-design.md`). What we do **not** have is an **interactive on-page annotation overlay** — the thing where the reporter actually marks up the *live* page: clicks a specific element, draws an arrow at it, blurs sensitive data, and pins a comment to that exact element.

This is the core capture experience of the category leaders:

- **Marker.io** ([features](https://marker.io/features), [widget](https://marker.io/features/website-feedback-widget), [web-app integration docs](https://help.marker.io/en/articles/5546520-how-to-integrate-marker-io-into-your-web-app)): reporter clicks the widget, gets a high-fidelity screen capture they annotate **directly on the site**, and the report auto-bundles browser, OS, page URL, screen size, **console logs and network requests** (and session-replay video on higher tiers). Installed **two ways** — a JS snippet (`window.markerConfig = { project: '…' }` above `</body>`, or `npm i @marker.io/browser` → `markerSDK.loadWidget({ project })`) **and** a no-code browser extension. AI features (beta): Magic Rewrite to clean up the description, AI Title generation, AI Translation. *(All confirmed from official Marker.io docs.)*
- **BugHerd** ([comparison pages](https://bugherd.com/cp/seo-competitor-userback)): the signature "**pin on page**" — point, click, comment, and the feedback sticks like a pixel-perfect sticky note to the **specific element**, with screenshot + browser/OS/screen-size metadata auto-attached. *(Secondary sources — vendor comparison pages, not independent.)*
- **Userback / Usersnap**: same family — in-app widget annotation; Userback adds video + session replay, Usersnap is more product-dev oriented. Across all of them the auto-captured set is consistently: browser type, OS, screen resolution, URL, console errors, and **element selectors**. *(Secondary sources.)*

**Gap for Klavity:** without on-page annotation we ask users to describe *where* the bug is; competitors let them just point at it. Closing this turns the live page itself into our richest capture surface and is a natural differentiator: unlike Marker, the annotated element + metadata feeds our **AI-vision + multi-Sim** pipeline, so the overlay isn't just "attach a marked-up PNG" — it's structured input the model reasons over and that auto-copies to the user's tracker.

---

## 2. Proposed solution

An **overlay/annotation layer** for Klavity that activates over the live page, lets the user select and mark up a region/element, captures rich context, and hands a structured payload to the **existing** review + feedback + connector pipeline (no new ticket model).

Two viable delivery vehicles — we should ship **one first**, designed so the annotation engine is shared between them:

### Option A — Extension-based overlay (recommended to ship first)
Add an "annotate this page" mode to the existing Chrome extension. The content script injects a full-page overlay canvas; the user picks an element / draws on it; we already have host permissions and screenshot capability, so we get console/network/DOM access with the fewest new moving parts and **no customer-side install**. Best fit for our current internal/dev-team users and the fastest path to parity.

### Option B — Embeddable JS widget/snippet on the customer's site
The same annotation engine shipped as a `<script>` snippet the customer drops into their own app (mirrors Marker's `window.markerConfig` / `@marker.io/browser` model and reuses the auth/token/CORS scaffolding already designed for our embed widget). This unlocks **end-user / client feedback on production sites** without asking them to install anything — the bigger long-term market, but it carries the cross-origin, security, and "capture metadata without extension privileges" complexity.

**Recommendation:** Build the **shared annotation engine** first and land it via **Option A (extension)** for v1 — lowest risk, reuses existing permissions, validates the UX. Then graft the same engine onto **Option B (snippet)** as a fast-follow, reusing the embed-widget's connect-popup / Bearer-token / CORS machinery. Keep the annotation/serialization layer transport-agnostic so neither path forks it.

---

## 3. Key capabilities

1. **Point-and-click element targeting** — hover-highlights the DOM element under the cursor; click to select. Capture a robust **element selector** (CSS path / nth-child fallback) + bounding-box coordinates + the element's tag/role/text so the pin survives minor layout changes.
2. **Annotation tools** — arrow, rectangle/highlight, freehand pen, text label, and **blur** (for redacting sensitive data before capture — important for the snippet/production path).
3. **Pin-to-element comments** — attach the comment to the selected element (not just to pixel x/y), so the report says "this button," not "somewhere near the top-right."
4. **Auto-capture technical metadata** alongside the annotation, matching/exceeding Marker's set:
   - Page URL, browser + version, OS, viewport / screen size, device-pixel-ratio.
   - **Console logs** and **JS errors**, **network requests** (extension path can subscribe directly; snippet path needs an injected console/fetch/XHR shim — see risks).
   - Selected element selector + coordinates; optionally a trimmed DOM snippet of the target.
   - Best-effort **repro steps** (recent clicks/route changes) — stretch.
5. **Feed into the existing pipeline** — the annotated screenshot + structured metadata becomes the input to the current **AI-vision review** (the model already turns screenshot+feedback into a structured ticket) and then the existing **connector auto-copy** (Jira / Linear / GitHub / Plane / webhook). The annotation makes the vision model's job easier (it knows exactly which element the user means) and the metadata enriches the resulting ticket. **No new ticket schema** — extend the existing feedback payload.
6. **Optional AI assist on the description** — Marker-style "rewrite / title" using the model we already call, so a terse note becomes a clean report.

---

## 4. Open questions / risks

- **Selector robustness:** how to generate a stable element selector that survives re-renders (SPA / virtual DOM). Pin to selector + fallback coordinates + element fingerprint?
- **Snippet metadata gap:** a JS snippet (Option B) **cannot** read console/network with extension-level privileges. Marker solves this by injecting console/`fetch`/`XHR` shims at load — we'd need the same, plus `window.onerror`/`unhandledrejection` hooks. Confirm what's feasible and document the gap vs the extension path.
- **Privacy / PII:** annotating production pages can capture sensitive data and network bodies. Need redaction defaults, the **blur** tool, and per-project capture toggles (esp. network bodies). Ties into our existing allowlist/consent gating.
- **Capture fidelity:** screenshot of the live page (extension `captureVisibleTab` vs `html-to-image` for the snippet, which we already use) — cross-origin images / iframes / canvas are known pain points.
- **Overlay/CSS isolation:** the overlay must not be styled by or interfere with the host page. Shadow DOM host (the embed widget already does this).
- **Scope creep vs session replay:** Userback/Usersnap lean on video + session replay. Explicitly **out of scope** for v1 — flag as a later question, don't build it in.
- **Pipeline fit:** confirm the existing `/api/sim/review` / feedback-creation payload can carry annotation + metadata without a schema fork (it already takes `url` + `screenshotDataUrl`).

---

## 5. Rough effort / phasing (high-level — not a commitment)

- **Phase 0 — Spike:** element-targeting + selector generation + overlay isolation on a couple of real SPAs. De-risks the hardest unknowns.
- **Phase 1 — Extension overlay (Option A):** annotation toolset (arrow/highlight/blur/pin), metadata capture via existing extension privileges, wire annotated payload into the current review + connector pipeline.
- **Phase 2 — Snippet/widget (Option B):** port the shared engine onto the embed-widget's snippet + token/CORS scaffolding; add console/network shims; redaction defaults for production capture.
- **Phase 3 (optional):** AI description assist, repro-step capture, richer metadata.

Phases 1 and 2 reuse the shared engine; only the transport + privilege model differ. Keep that boundary clean.

---

## 6. Provenance

This ticket was written from **competitive research vs Marker.io** (its on-page annotation widget, dual JS-snippet + browser-extension delivery, and auto-captured console/network/browser/OS/screen-size/URL/element metadata — confirmed from Marker.io official docs), with brief secondary comparison to **BugHerd** ("pin on page"), **Userback**, and **Usersnap** (vendor/comparison sources, treat as indicative).
