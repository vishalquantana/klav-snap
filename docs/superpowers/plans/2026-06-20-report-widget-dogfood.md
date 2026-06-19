# Report Widget (Dogfooded, Extension-Yielding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a report-submission mode to the embeddable Klavity widget, mount it on klavity.quantana.top so logged-in users report without the extension, and make the extension yield to the widget so they never both appear.

**Architecture:** Extend the existing Sims widget bundle (`packages/sdk/src/widget.ts`, already mounts Shadow host `#klavity-widget-host`) with a "Report a bug" launcher that opens the reusable `@klavity/core` `buildModal`, captures via `html-to-image`, and POSTs `/api/feedback` (cookie auth when first-party, Bearer when cross-origin). The extension's right-click report menu checks for `#klavity-widget-host` and stands down. Backend adds CORS to `/api/feedback` and makes the legacy Plane-host push non-fatal.

**Tech Stack:** TypeScript, Bun (server + tests), Vite (sdk IIFE build), Vitest (sdk/extension/core), `@klavity/core`, `html-to-image`.

## Global Constraints

- **SemVer lockstep:** every functional change bumps `CHANGELOG.md` + `docs/PRD.md` + all 5 manifests together. This feature is a MINOR bump.
- **No new ticket schema / no new submit endpoint:** reuse `POST /api/feedback`.
- **Reuse, don't rebuild:** report UI/capture/submit come from `@klavity/core` (`modal`, `annotator`, `crop`); only screen capture differs (`html-to-image`, not `captureVisibleTab`).
- **Coexistence is DOM-mediated:** content scripts run in an isolated world and cannot read page `window` vars — use the DOM node `#klavity-widget-host` and the `klavity:widget-ready` DOM event only.
- **Widget host id is exactly `klavity-widget-host`** (constant `HOST_ID` in `widget.ts`). The widget always wins precedence.
- **Logged-in only (v1):** no anonymous/publishable-key mode.

---

### Task 1: Pure widget helpers (first-party detection + feedback payload)

**Files:**
- Modify: `packages/sdk/src/widget-lib.ts`
- Test: `packages/sdk/tests/widget-lib.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `isFirstParty(scriptOrigin: string, backendUrl: string): boolean`
  - `buildFeedbackForm(input: { description: string; pageUrl: string; projectId: string; screenshots: string[] }): FormData` — converts data-URL screenshots to `Blob`s appended as `screenshots`, plus `description`, `page_url`, `project_id`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sdk/tests/widget-lib.test.ts (append)
import { describe, it, expect } from "vitest"
import { isFirstParty, buildFeedbackForm } from "../src/widget-lib"

describe("isFirstParty", () => {
  it("true when script origin equals backend origin", () => {
    expect(isFirstParty("https://klavity.quantana.top", "https://klavity.quantana.top")).toBe(true)
  })
  it("false for a customer origin", () => {
    expect(isFirstParty("https://app.acme.com", "https://klavity.quantana.top")).toBe(false)
  })
})

describe("buildFeedbackForm", () => {
  it("includes text fields and decodes a data-url screenshot to a Blob", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo=" // tiny valid base64
    const fd = buildFeedbackForm({ description: "bug", pageUrl: "https://x/y", projectId: "p1", screenshots: [png] })
    expect(fd.get("description")).toBe("bug")
    expect(fd.get("page_url")).toBe("https://x/y")
    expect(fd.get("project_id")).toBe("p1")
    const shot = fd.getAll("screenshots")[0] as File
    expect(shot).toBeInstanceOf(Blob)
    expect((shot as File).type).toBe("image/png")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run tests/widget-lib.test.ts`
Expected: FAIL — `isFirstParty`/`buildFeedbackForm` are not exported.

- [ ] **Step 3: Implement the helpers**

```ts
// packages/sdk/src/widget-lib.ts (append)
export function isFirstParty(scriptOrigin: string, backendUrl: string): boolean {
  try { return new URL(scriptOrigin).origin === new URL(backendUrl).origin } catch { return false }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",")
  const mime = (head.match(/data:([^;]+)/)?.[1]) || "image/png"
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function buildFeedbackForm(input: { description: string; pageUrl: string; projectId: string; screenshots: string[] }): FormData {
  const fd = new FormData()
  fd.set("description", input.description)
  fd.set("page_url", input.pageUrl)
  fd.set("project_id", input.projectId)
  for (const s of input.screenshots) fd.append("screenshots", dataUrlToBlob(s), "screenshot.png")
  return fd
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run tests/widget-lib.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/widget-lib.ts packages/sdk/tests/widget-lib.test.ts
git commit -m "feat(widget): first-party detection + feedback FormData builder"
```

---

### Task 2: Backend — CORS on /api/feedback + non-fatal Plane host

**Files:**
- Modify: `prototype/server.ts` (the `POST /api/feedback` handler, ~736–916; helpers `wjson`/`WIDGET_CORS` ~388–408)
- Test: `prototype/server.feedback-widget.test.ts` (new)

**Interfaces:**
- Consumes: existing `wjson(body, status)` (adds `WIDGET_CORS` headers), existing `assertSafeUrl`.
- Produces: `/api/feedback` responses carry CORS headers; a link-local `plane_host` no longer fails the submission.

**Context:** The OPTIONS preflight for `/api/*` already exists (server.ts ~669). This task makes the actual `POST /api/feedback` responses CORS-readable and removes the 400 on a bad tracker host (observed in prod as `blocked tracker host: blocked host: link-local address`).

- [ ] **Step 1: Write the failing tests**

```ts
// prototype/server.feedback-widget.test.ts
import { test, expect } from "bun:test"

const BASE = process.env.TEST_BASE_URL || "http://localhost:4317"

test("OPTIONS /api/feedback returns CORS preflight headers", async () => {
  const r = await fetch(`${BASE}/api/feedback`, { method: "OPTIONS" })
  expect(r.status).toBeLessThan(400)
  expect(r.headers.get("access-control-allow-origin")).toBe("*")
  expect((r.headers.get("access-control-allow-methods") || "").toUpperCase()).toContain("POST")
})

test("POST /api/feedback with a link-local plane_host still saves (non-fatal tracker)", async () => {
  const fd = new FormData()
  fd.set("description", "regression: link-local plane host must not 400")
  fd.set("page_url", "https://klavity.quantana.top/dashboard")
  fd.set("plane_host", "http://169.254.169.254")
  fd.set("plane_workspace", "w"); fd.set("plane_project_id", "p"); fd.set("plane_token", "t")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd })
  expect(r.status).toBe(200)
  const j = await r.json()
  expect(j.saved).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd prototype && bun test server.feedback-widget.test.ts` (server running on :4317, or point `TEST_BASE_URL` at a test instance)
Expected: FAIL — preflight lacks CORS on this route / link-local returns 400.

- [ ] **Step 3: Implement — CORS headers + non-fatal Plane**

In `POST /api/feedback`, change every `return json(...)` that the widget can receive to `return wjson(...)` so CORS headers are attached (success and validation paths). Then replace the Plane-host guard block (server.ts ~909–910):

```ts
// BEFORE:
// try { await assertSafeUrl(planeHost) }
// catch (e: any) { console.warn("blocked tracker host:", e?.message || e); return json({ error: "Invalid tracker host." }, 400) }

// AFTER — downstream tracker failure must never fail the user's submission:
try {
  await assertSafeUrl(planeHost)
} catch (e: any) {
  console.warn("tracker host rejected (non-fatal):", e?.message || e)
  return wjson({ id: feedbackId ?? "", saved: true })   // feedback already persisted above
}
```

Also wrap the subsequent direct Plane `fetch`/`res.ok` failures (server.ts ~911–916) to return `wjson({ id: feedbackId ?? "", saved: true })` instead of `json({ error... }, 502)` — the submission succeeds regardless of the legacy sink. Confirm the success return at ~898 uses `wjson`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd prototype && bun test server.feedback-widget.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing SSRF regression to confirm it still holds for direct-mode intent**

Run: `cd prototype && bun test server.traits.test.ts`
Expected: PASS — update the H2 test if it asserted a 400 body; the new contract is "tracker rejected → still saved, no outbound fetch to the unsafe host." Verify no fetch to the link-local host occurs (the `assertSafeUrl` still runs before any fetch).

- [ ] **Step 6: Commit**

```bash
git add prototype/server.ts prototype/server.feedback-widget.test.ts prototype/server.traits.test.ts
git commit -m "fix(feedback): CORS for widget + non-fatal tracker host (no 400 on bad plane_host)"
```

---

### Task 3: Extension yields to the widget

**Files:**
- Modify: `packages/extension/src/content.ts` (`handleContextMenu` ~810–824; add a ready-event listener near the bottom module scope)
- Test: `packages/extension/src/content.coexist.test.ts` (new)

**Interfaces:**
- Consumes: DOM `#klavity-widget-host`, event `klavity:widget-ready`.
- Produces: `widgetPresent(): boolean` (exported for test); `handleContextMenu` early-returns when the widget is present.

- [ ] **Step 1: Write the failing test**

```ts
// packages/extension/src/content.coexist.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { widgetPresent } from "./content"

describe("extension yields to widget", () => {
  beforeEach(() => { document.body.innerHTML = "" })
  it("widgetPresent() false when no host node", () => {
    expect(widgetPresent()).toBe(false)
  })
  it("widgetPresent() true when #klavity-widget-host exists", () => {
    const h = document.createElement("div"); h.id = "klavity-widget-host"; document.body.appendChild(h)
    expect(widgetPresent()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && npx vitest run src/content.coexist.test.ts`
Expected: FAIL — `widgetPresent` not exported.

- [ ] **Step 3: Implement the guard + teardown**

Add near the top of `content.ts` module scope:

```ts
// Coexistence: the embeddable widget mounts a Shadow host #klavity-widget-host.
// Content scripts can't see page window vars (isolated world), so we detect the
// widget purely via the DOM and YIELD our report UI to it. The widget always wins.
export function widgetPresent(): boolean {
  return !!document.getElementById('klavity-widget-host')
}
```

In `handleContextMenu` (after the `isContextValid()` check, before `e.preventDefault()`), add:

```ts
  if (widgetPresent()) return // widget present → pass through to native menu; widget owns reporting
```

At module scope (where other `document.addEventListener` calls live, e.g. near line 824), add a teardown for the race where the widget loads after the extension:

```ts
// If the widget announces itself after we've initialised, close any open report UI.
document.addEventListener('klavity:widget-ready', () => {
  document.querySelectorAll('#klavity-ctxmenu').forEach((n) => n.remove())
  // close an open modal host if present (buildModal hosts have the .klavity-overlay child)
  document.querySelectorAll('div').forEach((d) => { if (d.shadowRoot?.querySelector('.klavity-overlay')) d.remove() })
})
```

(If the context menu element has a different id/marker in this file, use that exact selector; confirm the menu node and give it `id="klavity-ctxmenu"` when created in `showCtxMenu` if it lacks a stable hook.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && npx vitest run src/content.coexist.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the extension test suite to confirm no regressions**

Run: `cd packages/extension && npx vitest run`
Expected: PASS (analyze/Sims paths untouched).

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/content.ts packages/extension/src/content.coexist.test.ts
git commit -m "feat(extension): yield report UI to the embedded widget (DOM handshake)"
```

---

### Task 4: Widget report mode (launcher + modal + capture + submit + ready event)

**Files:**
- Modify: `packages/sdk/src/widget.ts`
- Test: `packages/sdk/tests/widget-report.test.ts` (new, jsdom)

**Interfaces:**
- Consumes: `isFirstParty`, `buildFeedbackForm` (Task 1); `buildModal` from `@klavity/core`; `toPng` from `html-to-image`.
- Produces: a "Report a bug" launcher in `#klavity-widget-host`; `submitFeedback(cfg, payload)` (exported for test) that returns `{ issueKey: string; issueUrl: string }`.

**Context:** `widget.ts` already mounts `#klavity-widget-host` and has `parseScriptConfig`, token helpers, and an `api()` Bearer fetch. Add report mode alongside; for first-party use cookies instead of Bearer.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/tests/widget-report.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { submitFeedback } from "../src/widget"

describe("submitFeedback", () => {
  beforeEach(() => vi.restoreAllMocks())
  it("first-party posts with credentials:include and no Bearer, returns issue url", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "fb1", saved: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const res = await submitFeedback(
      { backendUrl: "https://klavity.quantana.top", projectId: "p1", firstParty: true, token: "" },
      { type: "bug", description: "x", pageUrl: "https://klavity.quantana.top/dashboard", screenshots: [] },
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(init.credentials).toBe("include")
    expect(init.headers?.authorization).toBeUndefined()
    expect(res.issueKey).toBe("fb1")
  })
  it("cross-origin posts Bearer token, no credentials", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "fb2", saved: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await submitFeedback(
      { backendUrl: "https://klavity.quantana.top", projectId: "p1", firstParty: false, token: "ext_abc" },
      { type: "bug", description: "x", pageUrl: "https://app.acme.com/p", screenshots: [] },
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.authorization).toBe("Bearer ext_abc")
    expect(init.credentials).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run tests/widget-report.test.ts`
Expected: FAIL — `submitFeedback` not exported.

- [ ] **Step 3: Implement `submitFeedback` + report launcher wiring**

```ts
// packages/sdk/src/widget.ts — add imports
import { buildModal } from "@klavity/core/modal"
import { cropDataUrl } from "@klavity/core/crop"
import { isFirstParty, buildFeedbackForm } from "./widget-lib"

export async function submitFeedback(
  cfg: { backendUrl: string; projectId: string; firstParty: boolean; token: string },
  payload: { type: "bug" | "feature"; description: string; pageUrl: string; screenshots: string[] },
): Promise<{ issueKey: string; issueUrl: string }> {
  const fd = buildFeedbackForm({
    description: `[${payload.type}] ${payload.description}`,
    pageUrl: payload.pageUrl, projectId: cfg.projectId, screenshots: payload.screenshots,
  })
  const init: RequestInit = { method: "POST", body: fd }
  if (cfg.firstParty) init.credentials = "include"
  else init.headers = { authorization: "Bearer " + cfg.token }
  const r = await fetch(cfg.backendUrl + "/api/feedback", init)
  if (!r.ok) throw new Error("submit failed: " + r.status)
  const j = await r.json()
  return { issueKey: String(j.id || ""), issueUrl: cfg.backendUrl + "/dashboard" }
}
```

In `mount()`, after creating the Shadow host, (a) dispatch the ready event, and (b) add a "Report a bug" launcher that opens `buildModal`:

```ts
  // announce presence so the extension yields (DOM-mediated handshake)
  document.dispatchEvent(new CustomEvent("klavity:widget-ready"))

  const firstParty = isFirstParty(cfg.backendUrl, cfg.backendUrl) // script origin is derived from src in parseScriptConfig
  const reportBtn = document.createElement("button")
  reportBtn.textContent = "🐞 Report a bug"
  reportBtn.style.cssText = "border:0;border-radius:999px;padding:10px 16px;background:#E94F37;color:#fff;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 8px 24px rgba(233,79,55,.35)"
  reportBtn.onclick = () => {
    if (!firstParty && !getToken()) { openConnect(); return }
    buildModal("bug", {
      onCaptureFull: async () => toPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }),
      onRegionCapture: async (rect) => cropDataUrl(await toPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }), rect),
      onSubmit: async (p) => submitFeedback(
        { backendUrl: cfg.backendUrl, projectId: cfg.projectId, firstParty, token: getToken() },
        { type: p.type as "bug" | "feature", description: p.description, pageUrl: location.href, screenshots: p.screenshots },
      ),
    })
  }
  dock.appendChild(reportBtn)
```

(Keep the existing Sims dock code; the report launcher is additive. If `cropDataUrl`'s signature differs from `(dataUrl, rect)`, adapt to its real signature in `@klavity/core/crop`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/sdk && npx vitest run tests/widget-report.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the IIFE bundle**

Run: `cd packages/sdk && npx vite build --config vite.widget.config.ts`
Expected: writes `packages/sdk/dist/klavity-widget.iife.js` with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/widget.ts packages/sdk/tests/widget-report.test.ts packages/sdk/dist/klavity-widget.iife.js
git commit -m "feat(widget): report-a-bug mode (core modal + html-to-image + /api/feedback)"
```

---

### Task 5: Serve the bundle + mount on the klavity app shell

**Files:**
- Verify: `prototype/server.ts` `GET /widget.js` (~706) serves the freshly built `klavity-widget.iife.js`.
- Modify: `prototype/public/dashboard.html` (and other logged-in app shell pages that should offer reporting)

**Interfaces:**
- Consumes: built `/widget.js`; the logged-in user's active project id.
- Produces: the widget mounted first-party on klavity.quantana.top.

- [ ] **Step 1: Confirm /widget.js serves the built bundle**

Run: `cd prototype && grep -n "widget.js" server.ts`
Confirm the route reads `packages/sdk/dist/klavity-widget.iife.js` (or the path it expects). If it points elsewhere, copy/serve the freshly built artifact there.

- [ ] **Step 2: Add the mount script to the dashboard**

In `prototype/public/dashboard.html`, before `</body>`, add (the page is server-rendered for a logged-in user; inject the active project id — if the template lacks one, use the account's resolved active project):

```html
<!-- Klavity dogfood: the same embeddable report widget we ship to customers -->
<script src="/widget.js" data-project="{{ACTIVE_PROJECT_ID}}" defer></script>
```

If the app shell has no templating hook, set `data-project` from a small inline script reading the project the dashboard already knows (e.g. a `window.__KLAV_PROJECT__` the page sets), keeping `data-project` populated before `widget.js` runs.

- [ ] **Step 3: Manual smoke (local)**

Run the server, open the dashboard logged in, confirm the "🐞 Report a bug" launcher appears, opens the modal, captures, and a submit creates a dashboard feedback row.
Expected: feedback row appears; no console errors.

- [ ] **Step 4: Commit**

```bash
git add prototype/public/dashboard.html prototype/server.ts
git commit -m "feat(app): mount the report widget on klavity.quantana.top (dogfood)"
```

---

### Task 6: SemVer lockstep + changelog + PRD

**Files:**
- Modify: `CHANGELOG.md`, `docs/PRD.md`, and all 5 manifests (extension `manifest.json`, the package.json files tracked by the SemVer rule — confirm the exact 5 from a recent lockstep commit).

- [ ] **Step 1: Find the current version + the 5 manifests**

Run: `git log --oneline -- CHANGELOG.md | head -3 && grep -RnE '"version"' --include=package.json --include=manifest.json . | grep -v node_modules`
Note the current version; the next is a MINOR bump.

- [ ] **Step 2: Bump all 5 manifests + CHANGELOG + PRD**

Add a CHANGELOG entry: "Report widget: embeddable bug/feature submission, dogfooded on klavity.quantana.top, takes precedence over the extension; /api/feedback no longer 400s on an unsafe tracker host." Update `docs/PRD.md` to describe the report widget surface and the extension-yield behavior. Bump every manifest version in lockstep.

- [ ] **Step 3: Run the full suites**

Run: `cd prototype && bun test` and `cd packages/sdk && npx vitest run` and `cd packages/extension && npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/PRD.md **/manifest.json **/package.json
git commit -m "chore: release vX.Y.0 — dogfooded report widget"
```

---

### Task 7: Deploy + manual coexistence verification (prod)

**Files:** none (operational).

- [ ] **Step 1: Deploy**

Push `master`; on the server pull and **restart as root** then poll health (~10s boot):
```bash
ssh root@66.135.20.62 'cd /opt/klav && git pull && systemctl restart klav && sleep 10 && systemctl is-active klav'
```
Expected: `active`. Confirm `GET /widget.js` returns the new bundle and `GET /` is 200.

- [ ] **Step 2: Coexistence + submit verification**

On klavity.quantana.top **with the extension installed**, logged in:
- Confirm only the widget's "🐞 Report a bug" launcher appears; right-click does **not** show the extension's Klavity menu (passes through to native).
- Submit a Bug → confirm a dashboard feedback row appears AND a ticket lands in the qbuilder Plane project (`proj 05ea72ad…`).
- Temporarily test cross-origin is unaffected: the existing Sims dock still works.

Expected: exactly one report UI (the widget); feedback persisted; Plane ticket created.

- [ ] **Step 3: Flip onboarding copy if applicable**

If `site/onboarding.html` references the widget as "coming soon" for reporting, update it to reflect the live embed snippet. Commit.

---

## Self-Review

**Spec coverage:** §3.1 widget bundle → Task 4; §3.2 auth (first-party cookie + cross-origin Bearer) → Tasks 1 & 4; §3.3 submit → Tasks 1, 4; §3.4 CORS + Plane rider → Task 2; §4 coexistence handshake → Tasks 3 & 4 (ready event dispatched in 4, consumed in 3); §5 mount → Task 5; §9 testing → unit/backend/extension across Tasks 1–4, manual in Task 7; §10 rollout/version → Tasks 6 & 7. All covered.

**Placeholder scan:** `{{ACTIVE_PROJECT_ID}}` in Task 5 is an intentional template token with a written fallback; the "confirm the exact 5 manifests" / "if signature differs" notes are grounded verification steps, not deferred work. No TODO/TBD code.

**Type consistency:** `#klavity-widget-host` / `HOST_ID` used identically across Tasks 3–5; `klavity:widget-ready` dispatched (Task 4) and listened (Task 3); `submitFeedback`/`buildFeedbackForm`/`isFirstParty` signatures match between definition (Tasks 1, 4) and use (Task 4).
