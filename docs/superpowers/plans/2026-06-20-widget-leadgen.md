# Widget Modes + Lead-Gen Funnel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed Klavity's right-click widget on its own marketing site as a lead-gen demo — zero-friction file-a-bug → admin-configurable success screen (support/leadgen/off) → email lead capture → dedicated Plane project + instant email alert.

**Architecture:** Add three nullable columns to `projects` (widget config) and one to `feedback` (`contact_email`). A public `GET /api/widget/config` serves the per-project mode+CTA. `POST /api/feedback` gains a first-party anonymous-intake path. A new `POST /api/widget/lead` attaches the email and fires an email alert. The widget (`packages/sdk`) fetches the config, renders a mode-aware success screen, and posts the lead; the composer modal gains a "Powered by Klavity" footer. The bundle is rebuilt and committed (deploy is pull-based).

**Tech Stack:** Bun + TypeScript server (`prototype/server.ts`), libsql/Turso (`prototype/lib/db.ts`), Vite-built IIFE widget (`packages/sdk`, `packages/core`), SendGrid email (`prototype/lib/mail.ts`), Plane connector (existing). Tests: `bun:test`, subprocess-against-temp-SQLite pattern.

## Global Constraints

- SemVer lockstep on release: bump `package.json` (`/`, `packages/core`, `packages/extension`, `packages/sdk`) + `packages/extension/manifest.json` + `docs/PRD.md` + top `CHANGELOG.md` entry together. Current version at planning time: `0.30.5` (re-check at release time — other sessions ship concurrently) → release this feature as `0.31.0` (new feature → minor; verify it's still the next free minor when you cut it).
- Dedicated lead Plane project: `f2982ce0-6bb5-410f-9c77-b84a7b90441c`, workspace `qbuilder`, host `https://plane.quantana.top`.
- Widget modes: `support` (default) | `leadgen` | `off`. Default CTA URL: `https://klavity.quantana.top/onboarding`.
- Anonymous intake is **first-party only** (request `Origin` must equal `KLAV_BASE_URL` origin). Cross-origin customer intake is out of scope.
- `widget_notify_email` is server-side only — never returned by any public endpoint.
- Deploy: commit → push master → ssh `root@66.135.20.62`, `cd /opt/klav`, `sudo -u klav git fetch origin master && sudo -u klav git reset --hard origin/master`, `systemctl restart klav`, poll health (~10–15s boot, expect a brief 502 then 200). Print an IST timestamp (`date "+%Y-%m-%d %H:%M IST"`) on deploy.
- The marketing home page is served from `site/index.html` (NOT `local.html`, which no longer exists). All marketing pages live in `site/`.

---

### Task 1: DB — widget-config columns, `contact_email`, and helpers

**Files:**
- Modify: `prototype/lib/db.ts` (migration block ~line 347; `ProjectRow` type ~577; `rowToProject` ~582; add new exported functions near `projectById` ~646)
- Test: `prototype/lib/db.widget-config.test.ts` (create)

**Interfaces:**
- Produces:
  - `ProjectRow` gains `widgetMode: string` (default `"support"`), `widgetCtaUrl: string | null`, `widgetNotifyEmail: string | null`.
  - `getWidgetConfig(projectId: string): Promise<{ mode: string; ctaUrl: string } | null>` — public-safe (NO notify email). `null` if project missing.
  - `getWidgetNotifyEmail(projectId: string): Promise<string | null>` — server-side only.
  - `setWidgetConfig(projectId: string, cfg: { mode?: string; ctaUrl?: string | null; notifyEmail?: string | null }): Promise<void>`
  - `setFeedbackContactEmail(feedbackId: string, projectId: string, email: string): Promise<boolean>` — returns false if the row doesn't belong to the project.

- [ ] **Step 1: Write the failing test**

Create `prototype/lib/db.widget-config.test.ts`:

```ts
import { test, expect, beforeAll } from "bun:test"
import { createClient } from "@libsql/client"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { initDbWith, getWidgetConfig, getWidgetNotifyEmail, setWidgetConfig, setFeedbackContactEmail } from "./db"

const dbFile = join(tmpdir(), `klav-wcfg-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)

beforeAll(async () => {
  const c = createClient({ url: "file:" + dbFile })
  await initDbWith(c) // applies schema + migrations to this explicit client
  const now = Date.now()
  await c.execute({ sql: "INSERT INTO accounts (id,name,owner_email,created_at) VALUES (?,?,?,?)", args: ["acc1", "A", "o@x.com", now] })
  await c.execute({ sql: "INSERT INTO projects (id,account_id,name,created_at,updated_at) VALUES (?,?,?,?,?)", args: ["p1", "acc1", "Web", now, now] })
  await c.execute({ sql: "INSERT INTO feedback (id,project_id,observation,created_at) VALUES (?,?,?,?)", args: ["fb1", "p1", "x", now] })
})

test("defaults: mode=support, ctaUrl falls back to onboarding", async () => {
  const cfg = await getWidgetConfig("p1")
  expect(cfg).toEqual({ mode: "support", ctaUrl: "https://klavity.quantana.top/onboarding" })
})

test("unknown project → null", async () => {
  expect(await getWidgetConfig("nope")).toBeNull()
})

test("setWidgetConfig persists; notify stays server-side", async () => {
  await setWidgetConfig("p1", { mode: "leadgen", ctaUrl: "https://klavity.quantana.top/onboarding", notifyEmail: "lead@x.com" })
  expect(await getWidgetConfig("p1")).toEqual({ mode: "leadgen", ctaUrl: "https://klavity.quantana.top/onboarding" })
  expect(await getWidgetNotifyEmail("p1")).toBe("lead@x.com")
})

test("setFeedbackContactEmail attaches; rejects cross-project", async () => {
  expect(await setFeedbackContactEmail("fb1", "p1", "v@x.com")).toBe(true)
  expect(await setFeedbackContactEmail("fb1", "other", "v@x.com")).toBe(false)
})
```

NOTE: if `initDbWith` does not already exist as an exported wrapper applying schema+migrations to an explicit client, expose one that calls the existing internal `applySchema`/`migrateV2`/boot-ALTER logic against the passed client (the codebase already separates these so they can run against a local libsql — see db.ts comment near line 32). Reuse it; do not duplicate schema.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test lib/db.widget-config.test.ts`
Expected: FAIL (functions not exported / columns missing).

- [ ] **Step 3: Add columns in the boot-ALTER block**

In `prototype/lib/db.ts`, in the every-boot ALTER section (~line 347, where columns are `ALTER`ed in with `.catch`), add:

```ts
await db.execute("ALTER TABLE projects ADD COLUMN widget_mode TEXT NOT NULL DEFAULT 'support'").catch((e) => console.warn("projects.widget_mode ALTER skipped:", e?.message || e))
await db.execute("ALTER TABLE projects ADD COLUMN widget_cta_url TEXT").catch((e) => console.warn("projects.widget_cta_url ALTER skipped:", e?.message || e))
await db.execute("ALTER TABLE projects ADD COLUMN widget_notify_email TEXT").catch((e) => console.warn("projects.widget_notify_email ALTER skipped:", e?.message || e))
await db.execute("ALTER TABLE feedback ADD COLUMN contact_email TEXT").catch((e) => console.warn("feedback.contact_email ALTER skipped:", e?.message || e))
```

- [ ] **Step 4: Extend `ProjectRow` + `rowToProject`**

Add to the `ProjectRow` type (~577): `widgetMode: string; widgetCtaUrl: string | null; widgetNotifyEmail: string | null`.
Add to `rowToProject` return object:

```ts
widgetMode: String(x.widget_mode || "support"),
widgetCtaUrl: x.widget_cta_url != null ? String(x.widget_cta_url) : null,
widgetNotifyEmail: x.widget_notify_email != null ? String(x.widget_notify_email) : null,
```

- [ ] **Step 5: Add the helper functions (near `projectById`, ~646)**

```ts
const DEFAULT_WIDGET_CTA = "https://klavity.quantana.top/onboarding"

export async function getWidgetConfig(projectId: string): Promise<{ mode: string; ctaUrl: string } | null> {
  const p = await projectById(projectId)
  if (!p) return null
  const mode = ["support", "leadgen", "off"].includes(p.widgetMode) ? p.widgetMode : "support"
  return { mode, ctaUrl: p.widgetCtaUrl || DEFAULT_WIDGET_CTA }
}

export async function getWidgetNotifyEmail(projectId: string): Promise<string | null> {
  const p = await projectById(projectId)
  return p?.widgetNotifyEmail || null
}

export async function setWidgetConfig(projectId: string, cfg: { mode?: string; ctaUrl?: string | null; notifyEmail?: string | null }): Promise<void> {
  const sets: string[] = [], args: any[] = []
  if (cfg.mode !== undefined) { sets.push("widget_mode=?"); args.push(["support","leadgen","off"].includes(cfg.mode) ? cfg.mode : "support") }
  if (cfg.ctaUrl !== undefined) { sets.push("widget_cta_url=?"); args.push(cfg.ctaUrl || null) }
  if (cfg.notifyEmail !== undefined) { sets.push("widget_notify_email=?"); args.push(cfg.notifyEmail || null) }
  if (!sets.length) return
  sets.push("updated_at=?"); args.push(Date.now()); args.push(projectId)
  await db!.execute({ sql: `UPDATE projects SET ${sets.join(", ")} WHERE id=?`, args })
}

export async function setFeedbackContactEmail(feedbackId: string, projectId: string, email: string): Promise<boolean> {
  const r = await db!.execute({ sql: "UPDATE feedback SET contact_email=? WHERE id=? AND project_id=?", args: [email, feedbackId, projectId] })
  return (r.rowsAffected ?? 0) > 0
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd prototype && bun test lib/db.widget-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add prototype/lib/db.ts prototype/lib/db.widget-config.test.ts
git commit -m "feat(db): widget-config columns + contact_email + helpers"
```

---

### Task 2: Public `GET /api/widget/config`

**Files:**
- Modify: `prototype/server.ts` (add route near the other widget routes, ~line 879 `/widget.js`)
- Test: `prototype/server.widget-config.test.ts` (create — subprocess pattern)

**Interfaces:**
- Consumes: `getWidgetConfig` (Task 1).
- Produces: `GET /api/widget/config?project=<id>` → `200 {mode, ctaUrl}`; unknown/missing project → `200 {mode:"support", ctaUrl:"https://klavity.quantana.top/onboarding"}` (safe default, never 404, never `notify_email`).

- [ ] **Step 1: Write the failing test**

Create `prototype/server.widget-config.test.ts` modeled on `server.feedback-widget.test.ts` (copy its seed/spawn/afterAll boilerplate verbatim, adding `widget_mode`,`widget_cta_url`,`widget_notify_email` to the `projects` CREATE and `contact_email` to the `feedback` CREATE). Seed one project `p1` with `widget_mode='leadgen', widget_cta_url='https://klavity.quantana.top/onboarding', widget_notify_email='lead@x.com'`. Then:

```ts
test("returns configured mode + ctaUrl, never notify_email", async () => {
  const r = await fetch(`${BASE}/api/widget/config?project=p1`)
  expect(r.status).toBe(200)
  const j = await r.json()
  expect(j).toEqual({ mode: "leadgen", ctaUrl: "https://klavity.quantana.top/onboarding" })
  expect(JSON.stringify(j)).not.toContain("lead@x.com")
})

test("unknown project → safe default", async () => {
  const j = await (await fetch(`${BASE}/api/widget/config?project=nope`)).json()
  expect(j).toEqual({ mode: "support", ctaUrl: "https://klavity.quantana.top/onboarding" })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test server.widget-config.test.ts`
Expected: FAIL (404 / route missing).

- [ ] **Step 3: Add the route**

In `prototype/server.ts`, right after the `/widget.js` route (~line 884), add:

```ts
if (req.method === "GET" && path === "/api/widget/config") {
  const pid = url.searchParams.get("project") || ""
  const cfg = (pid && await getWidgetConfig(pid)) || { mode: "support", ctaUrl: "https://klavity.quantana.top/onboarding" }
  return wjson(cfg) // wjson = JSON + WIDGET_CORS (cross-origin GET is fine; config is public)
}
```

Add `getWidgetConfig` to the `./lib/db` import list at the top of `server.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test server.widget-config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/server.ts prototype/server.widget-config.test.ts
git commit -m "feat(api): public GET /api/widget/config"
```

---

### Task 3: First-party anonymous intake on `POST /api/feedback`

**Files:**
- Modify: `prototype/server.ts` (the `/api/feedback` handler, persist block ~line 1010–1012; add rate-limit + origin guard near the handler top ~line 952; add constants near `AUTOCOPY_*` ~line 739)
- Test: `prototype/server.feedback-anon.test.ts` (create — subprocess pattern, with a stub Plane receiver like `server.connectors.test.ts`)

**Interfaces:**
- Consumes: `projectById`, `clientIp(req, server)`, `rlAllow`, existing persist/auto-copy path.
- Produces: anonymous `POST /api/feedback` with form `project_id` → persists feedback (`actor_email` NULL) + fires connectors, when `Origin` is first-party. `429` over per-IP cap. `403` for non-first-party anonymous. Unknown project → no persist (still `200 {saved:true}`, unchanged).

- [ ] **Step 1: Write the failing test**

Create `prototype/server.feedback-anon.test.ts` (copy seed/spawn boilerplate from `server.feedback-widget.test.ts`; seed project `p1`). Spawn the server with env `KLAV_BASE_URL=${BASE}` so the origin guard recognizes first-party. Tests:

```ts
test("anonymous first-party submit persists with null actor", async () => {
  const fd = new FormData()
  fd.set("description", "anon bug"); fd.set("page_url", "https://klavity.quantana.top/snap"); fd.set("project_id", "p1")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd, headers: { origin: BASE } })
  expect(r.status).toBe(200)
  const j = await r.json(); expect(j.saved).toBe(true); expect(j.id).toBeTruthy()
  // row persisted to p1 with null actor
  const row = await rawClient.execute({ sql: "SELECT project_id, actor_email FROM feedback WHERE id=?", args: [j.id] })
  expect(row.rows[0].project_id).toBe("p1")
  expect(row.rows[0].actor_email).toBeNull()
})

test("anonymous from a foreign origin is rejected", async () => {
  const fd = new FormData()
  fd.set("description", "x"); fd.set("project_id", "p1")
  const r = await fetch(`${BASE}/api/feedback`, { method: "POST", body: fd, headers: { origin: "https://evil.example" } })
  expect(r.status).toBe(403)
})

test("over the per-IP cap → 429", async () => {
  const hammer = async () => { const fd = new FormData(); fd.set("description","x"); fd.set("project_id","p1"); return fetch(`${BASE}/api/feedback`, { method:"POST", body: fd, headers: { origin: BASE } }) }
  let got429 = false
  for (let i = 0; i < 25; i++) { const r = await hammer(); if (r.status === 429) { got429 = true; break } }
  expect(got429).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test server.feedback-anon.test.ts`
Expected: FAIL (anonymous row not persisted; no 403/429).

- [ ] **Step 3: Add constants**

Near `AUTOCOPY_WINDOW`/`AUTOCOPY_PER_PROJECT` (~739) in `server.ts`:

```ts
const FEEDBACK_ANON_WINDOW = 60 * 60 * 1000
const FEEDBACK_ANON_PER_IP = 20
```

- [ ] **Step 4: Add origin guard + rate limit at the top of the `/api/feedback` handler**

Immediately inside `if (req.method === "POST" && path === "/api/feedback") {` (after `try {`), before reading the form, determine anonymity and guard. Because the actor is resolved later, compute it up front here:

```ts
const anonActor = !(await bearerEmail(req)) && !(await sessionEmail(req))
if (anonActor) {
  // First-party only: Origin must equal our own base origin.
  const origin = req.headers.get("origin") || ""
  const baseOrigin = (() => { try { return new URL(BASE).origin } catch { return "" } })()
  if (!origin || origin !== baseOrigin) return wjson({ error: "forbidden" }, 403)
  const ip = clientIp(req, server)
  if (!rlAllow(`fbanon:ip:${ip}`, FEEDBACK_ANON_PER_IP, FEEDBACK_ANON_WINDOW)) return wjson({ error: "rate limited" }, 429)
}
```

(`server` is the Bun server handle already in scope in the fetch handler — same value passed to `clientIp` at the OTP route ~line 895.)

- [ ] **Step 5: Resolve project for anonymous submitters in the persist block**

In the persist block (~line 1010–1012), change:

```ts
const actor = email || (await sessionEmail(req))
const reqProject = String(form.get("project_id") || "") || url.searchParams.get("project")
const resolved = actor ? await resolveProject(actor, reqProject) : null
```

to:

```ts
const actor = email || (await sessionEmail(req))
const reqProject = String(form.get("project_id") || "") || url.searchParams.get("project")
let resolved = actor ? await resolveProject(actor, reqProject) : null
// First-party anonymous widget intake: no actor, but a known project_id from our own site.
if (!resolved && !actor && reqProject) resolved = await projectById(reqProject)
```

`actor` is `null` for anonymous; the downstream `insertScreenshot/insertFeedback/insertActivity` already pass `actor` as `ownerEmail/actorEmail` — confirm those columns are nullable (they are: `actor_email TEXT`, no NOT NULL). The auto-copy hook uses `autoCopyActor = actor` (null) — `addTicketExport.createdBy` is nullable; fine.

Also add a description size cap right after `const description = ...trim()` (~line 955):

```ts
if (description.length > 5000) return wjson({ error: "Description too long." }, 400)
```

Ensure `projectById` is imported in `server.ts` (it already is — used elsewhere).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd prototype && bun test server.feedback-anon.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the existing feedback tests (no regression)**

Run: `cd prototype && bun test server.feedback-widget.test.ts server.dedup.test.ts server.connectors.test.ts`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add prototype/server.ts prototype/server.feedback-anon.test.ts
git commit -m "feat(api): first-party anonymous intake on /api/feedback (origin-guarded, rate-limited)"
```

---

### Task 4: `POST /api/widget/lead` + email alert

**Files:**
- Modify: `prototype/lib/mail.ts` (add `sendLeadAlert`)
- Modify: `prototype/server.ts` (add route; import `setFeedbackContactEmail`, `getWidgetNotifyEmail`, `feedbackById`, `sendLeadAlert`)
- Test: `prototype/server.widget-lead.test.ts` (create)

**Interfaces:**
- Consumes: `setFeedbackContactEmail`, `getWidgetNotifyEmail`, `feedbackById`, `projectById`, `clientIp`, `rlAllow`.
- Produces: `POST /api/widget/lead` form/json `{project_id, feedback_id, email}` → `200 {ok:true}`; attaches `contact_email`; fire-and-forget `sendLeadAlert`. `400` invalid email / missing fields; `404` if feedback not in project; `429` over per-IP cap; `403` non-first-party.
- `sendLeadAlert(to: string, lead: { email: string; description: string; pageUrl: string; projectName: string; feedbackUrl: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `prototype/server.widget-lead.test.ts` (subprocess boilerplate; seed project `p1` with `widget_notify_email='lead@x.com'` and a feedback row `fb1` in `p1`). Spawn with `KLAV_BASE_URL=${BASE}` and **no `SENDGRID_API_KEY`** (so `sendLeadAlert` throws internally but is swallowed fire-and-forget — the endpoint must still return 200). Tests:

```ts
test("attaches contact_email and returns ok", async () => {
  const r = await fetch(`${BASE}/api/widget/lead`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ project_id: "p1", feedback_id: "fb1", email: "buyer@co.com" }),
  })
  expect(r.status).toBe(200)
  expect((await r.json()).ok).toBe(true)
  const row = await rawClient.execute({ sql: "SELECT contact_email FROM feedback WHERE id=?", args: ["fb1"] })
  expect(row.rows[0].contact_email).toBe("buyer@co.com")
})

test("rejects bad email", async () => {
  const r = await fetch(`${BASE}/api/widget/lead`, { method:"POST", headers:{ "content-type":"application/json", origin: BASE }, body: JSON.stringify({ project_id:"p1", feedback_id:"fb1", email:"nope" }) })
  expect(r.status).toBe(400)
})

test("rejects feedback from another project", async () => {
  const r = await fetch(`${BASE}/api/widget/lead`, { method:"POST", headers:{ "content-type":"application/json", origin: BASE }, body: JSON.stringify({ project_id:"other", feedback_id:"fb1", email:"a@b.com" }) })
  expect(r.status).toBe(404)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test server.widget-lead.test.ts`
Expected: FAIL (route missing).

- [ ] **Step 3: Add `sendLeadAlert` to `mail.ts`**

```ts
export async function sendLeadAlert(to: string, lead: { email: string; description: string; pageUrl: string; projectName: string; feedbackUrl: string }) {
  const key = process.env.SENDGRID_API_KEY
  const from = process.env.KLAV_MAIL_FROM || "klav@quantana.com.au"
  if (!key) throw new Error("SENDGRID_API_KEY not set")
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: "Klavity Leads" },
      subject: `🌱 New Klavity lead: ${lead.email}`,
      content: [{ type: "text/html", value:
        `<div style="font-family:system-ui,sans-serif;color:#1d1d1f">
         <p><b>New lead</b> from the ${esc(lead.projectName)} widget.</p>
         <p>Email: <b>${esc(lead.email)}</b></p>
         <p>They reported: ${esc(lead.description)}</p>
         <p>Page: ${esc(lead.pageUrl)}</p>
         <p><a href="${esc(lead.feedbackUrl)}">Open in Klavity →</a></p></div>` }],
    }),
  })
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
```

- [ ] **Step 4: Add the route in `server.ts`** (after the `/api/widget/config` route)

```ts
if (req.method === "POST" && path === "/api/widget/lead") {
  // First-party + rate limit (mirror anonymous intake)
  const origin = req.headers.get("origin") || ""
  const baseOrigin = (() => { try { return new URL(BASE).origin } catch { return "" } })()
  if (origin !== baseOrigin) return wjson({ error: "forbidden" }, 403)
  if (!rlAllow(`lead:ip:${clientIp(req, server)}`, 20, 60 * 60 * 1000)) return wjson({ error: "rate limited" }, 429)
  const body: any = await req.json().catch(() => ({}))
  const projectId = String(body.project_id || ""), feedbackId = String(body.feedback_id || ""), email = String(body.email || "").trim()
  if (!projectId || !feedbackId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return wjson({ error: "invalid" }, 400)
  const ok = await setFeedbackContactEmail(feedbackId, projectId, email)
  if (!ok) return wjson({ error: "not found" }, 404)
  // fire-and-forget alert (never blocks / fails the response)
  void (async () => {
    try {
      const notify = await getWidgetNotifyEmail(projectId)
      if (!notify) return
      const fb = await feedbackById(projectId, feedbackId)
      const proj = await projectById(projectId)
      await sendLeadAlert(notify, {
        email,
        description: fb?.observation || "(no description)",
        pageUrl: (fb?.urlHost ? `https://${fb.urlHost}` : "") + (fb?.urlPath || ""),
        projectName: proj?.name || projectId,
        feedbackUrl: `${BASE}/dashboard?project=${projectId}`,
      })
    } catch (e: any) { console.error("lead alert (non-fatal):", e?.message || e) }
  })().catch(() => {})
  return wjson({ ok: true })
}
```

Add imports to `server.ts`: `setFeedbackContactEmail`, `getWidgetNotifyEmail` from `./lib/db`; `sendLeadAlert` from `./lib/mail`. (`feedbackById`, `projectById` already imported.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd prototype && bun test server.widget-lead.test.ts`
Expected: PASS (3 tests; alert throws internally on missing key but is swallowed → 200).

- [ ] **Step 6: Commit**

```bash
git add prototype/lib/mail.ts prototype/server.ts prototype/server.widget-lead.test.ts
git commit -m "feat(api): POST /api/widget/lead + email lead alert"
```

---

### Task 5: Admin config write + settings UI

**Files:**
- Modify: `prototype/server.ts` (add `POST /api/project/widget-config`, admin-gated)
- Modify: `prototype/public/dashboard.html` (add a "Widget" settings block in project settings)
- Test: `prototype/server.widget-admin.test.ts` (create)

**Interfaces:**
- Consumes: `setWidgetConfig`, `projectAccess`/`roleIn` (existing project-auth helper used by connector settings), `sessionEmail`.
- Produces: `POST /api/project/widget-config` json `{project_id, mode?, cta_url?, notify_email?}` → `200 {ok:true}` for an admin of the project; `401` no session; `403` non-admin.

- [ ] **Step 1: Write the failing test**

Create `prototype/server.widget-admin.test.ts` (subprocess; seed account `acc1` owner `o@x.com`, project `p1` in `acc1`, and a session cookie for `o@x.com` — copy the session-seeding helper from `server.connectors.test.ts`, which already tests an admin-gated project route). Tests:

```ts
test("admin can set widget config", async () => {
  const r = await fetch(`${BASE}/api/project/widget-config`, { method:"POST", headers:{ "content-type":"application/json", cookie: ownerCookie }, body: JSON.stringify({ project_id:"p1", mode:"leadgen", cta_url:"https://klavity.quantana.top/onboarding", notify_email:"lead@x.com" }) })
  expect(r.status).toBe(200)
  const row = await rawClient.execute({ sql:"SELECT widget_mode, widget_notify_email FROM projects WHERE id=?", args:["p1"] })
  expect(row.rows[0].widget_mode).toBe("leadgen")
  expect(row.rows[0].widget_notify_email).toBe("lead@x.com")
})

test("no session → 401", async () => {
  const r = await fetch(`${BASE}/api/project/widget-config`, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ project_id:"p1", mode:"off" }) })
  expect(r.status).toBe(401)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd prototype && bun test server.widget-admin.test.ts`
Expected: FAIL (route missing).

- [ ] **Step 3: Add the route** (mirror the connector-settings auth)

Find an existing admin-gated project route (search `server.ts` for `roleIn(` near the connectors CRUD) and copy its auth shape. Add:

```ts
if (req.method === "POST" && path === "/api/project/widget-config") {
  const me = await sessionEmail(req)
  if (!me) return wjson({ error: "auth required" }, 401)
  const body: any = await req.json().catch(() => ({}))
  const projectId = String(body.project_id || "")
  const role = projectId ? await roleIn(projectId, me) : null   // use the SAME helper the connector routes use
  if (!role || !["owner", "admin"].includes(role)) return wjson({ error: "forbidden" }, 403)
  await setWidgetConfig(projectId, {
    mode: body.mode, ctaUrl: body.cta_url, notifyEmail: body.notify_email,
  })
  return wjson({ ok: true })
}
```

(If the connector routes use a different gate, e.g. `projectAccess(projectId, me)` returning a role, match that exact call instead — do not invent a new auth path.)

Add `setWidgetConfig` to the `./lib/db` import list.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd prototype && bun test server.widget-admin.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the settings UI block in `dashboard.html`**

In the project-settings area (search `dashboard.html` for the connectors settings section), add a "Widget" card with: a `<select id="wMode">` (Support / Lead-gen / Off), `<input id="wCta">` (CTA URL), `<input id="wNotify">` (notify email), and a Save button calling:

```js
async function saveWidgetConfig(pid) {
  await fetch("/api/project/widget-config", { method:"POST", headers:{ "content-type":"application/json" }, credentials:"include",
    body: JSON.stringify({ project_id: pid, mode: document.getElementById("wMode").value, cta_url: document.getElementById("wCta").value.trim(), notify_email: document.getElementById("wNotify").value.trim() }) })
}
```

Populate the fields from the project object the dashboard already loads (extend its project fetch to include `widget_mode`/`widget_cta_url`/`widget_notify_email`, which now come through `rowToProject`).

- [ ] **Step 6: Commit**

```bash
git add prototype/server.ts prototype/public/dashboard.html prototype/server.widget-admin.test.ts
git commit -m "feat(admin): widget-config settings (API + dashboard UI)"
```

---

### Task 6: Widget — config fetch, mode-aware success screen, Powered-by, rebuild

**Files:**
- Modify: `packages/sdk/src/widget-lib.ts` (config parse already there; add a `successCopy(mode, ctaUrl)` pure helper for unit testing)
- Modify: `packages/sdk/src/widget.ts` (fetch `/api/widget/config` on mount; render mode-aware success; POST `/api/widget/lead`)
- Modify: `packages/core/src/modal.ts` ("Powered by Klavity" footer + a success-screen render hook)
- Test: `packages/sdk/src/widget-lib.test.ts` (add `successCopy` unit tests) — or create if absent
- Build artifact: `packages/sdk/dist/klavity-widget.iife.js` (regenerated)

**Interfaces:**
- Consumes: `GET /api/widget/config`, `POST /api/widget/lead`.
- Produces: `successCopy(mode: "support"|"leadgen"|"off", ctaUrl: string): { headline: string; body: string; emailLabel: string; ctaText: string; ctaUrl: string; showEmail: boolean; showCta: boolean }`

- [ ] **Step 1: Write the failing unit test**

In `packages/sdk/src/widget-lib.test.ts` (create if missing; `import { successCopy } from "./widget-lib"`):

```ts
import { test, expect } from "bun:test"
import { successCopy } from "./widget-lib"

test("support mode → status hook, email shown, no CTA", () => {
  const s = successCopy("support", "https://x/onboarding")
  expect(s.showEmail).toBe(true); expect(s.showCta).toBe(false)
  expect(s.headline.toLowerCase()).toContain("filed")
})
test("leadgen mode → email + CTA to ctaUrl", () => {
  const s = successCopy("leadgen", "https://klavity.quantana.top/onboarding")
  expect(s.showEmail).toBe(true); expect(s.showCta).toBe(true)
  expect(s.ctaUrl).toBe("https://klavity.quantana.top/onboarding")
})
test("off mode → no email, no CTA", () => {
  const s = successCopy("off", "https://x/onboarding")
  expect(s.showEmail).toBe(false); expect(s.showCta).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/sdk && bun test src/widget-lib.test.ts`
Expected: FAIL (`successCopy` not exported).

- [ ] **Step 3: Implement `successCopy` in `widget-lib.ts`**

```ts
export function successCopy(mode: string, ctaUrl: string) {
  if (mode === "leadgen") return {
    headline: "That's exactly how Klavity works",
    body: "You just right-clicked → auto-screenshot → filed a real ticket. Your users could do this for you.",
    emailLabel: "Send me the 2-min setup", ctaText: "Start free →", ctaUrl,
    showEmail: true, showCta: true,
  }
  if (mode === "off") return {
    headline: "Thanks — your report is filed", body: "", emailLabel: "", ctaText: "", ctaUrl,
    showEmail: false, showCta: false,
  }
  return { // support (default)
    headline: "Bug filed ✓",
    body: "Want to know when it's fixed? Drop your email and we'll ping you.",
    emailLabel: "Notify me", ctaText: "", ctaUrl,
    showEmail: true, showCta: false,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/sdk && bun test src/widget-lib.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire config fetch + success screen into `widget.ts`**

In `mount()` (after `parseScriptConfig`), fetch the config and store it:

```ts
let widgetCfg = { mode: "support", ctaUrl: "https://klavity.quantana.top/onboarding" }
try {
  const r = await fetch(cfg.backendUrl + "/api/widget/config?project=" + encodeURIComponent(cfg.projectId))
  if (r.ok) widgetCfg = await r.json()
} catch {}
```

In the `onSubmit` callback of `buildModal` (~line 53), after `submitFeedback(...)` resolves with `{issueKey}` (the feedback id), call `buildModal`'s new `onSuccess` hook to render the success screen (see Step 6). The success screen (built in `modal.ts`) renders `successCopy(widgetCfg.mode, widgetCfg.ctaUrl)`, and on email submit calls:

```ts
async function postLead(feedbackId: string, email: string) {
  await fetch(cfg.backendUrl + "/api/widget/lead", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_id: cfg.projectId, feedback_id: feedbackId, email }),
  })
}
```

- [ ] **Step 6: Add the success screen + Powered-by to `modal.ts`**

Extend `buildModal`'s callbacks with `onSuccess?: (feedbackId: string) => void` and a `renderSuccess(copy, { onEmail, feedbackId })` that swaps the modal body for the success layout (headline/body, an email input + button when `copy.showEmail`, a CTA `<a href=copy.ctaUrl>` when `copy.showCta`). Always append a footer:

```ts
const pb = document.createElement("div")
pb.style.cssText = "text-align:center;font-size:10px;color:#585b70;margin-top:12px"
pb.innerHTML = `Powered by <a href="https://klavity.quantana.top" target="_blank" rel="noopener" style="color:#7f849c;text-decoration:none">Klavity</a>`
modal.appendChild(pb)
```

Wire the existing Submit handler (~line 156) so that on a successful `onSubmit` it captures the returned feedback id and calls `renderSuccess(...)` instead of just closing. (`onSubmit` returns `{issueKey}` — use that as the feedback id; thread it through.)

- [ ] **Step 7: Rebuild the widget bundle**

Run: `cd packages/sdk && bun run build`
Expected: `dist/klavity-widget.iife.js` regenerated (no errors). Confirm: `grep -c "Powered by" dist/klavity-widget.iife.js` → ≥ 1.

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/widget-lib.ts packages/sdk/src/widget-lib.test.ts packages/sdk/src/widget.ts packages/core/src/modal.ts packages/sdk/dist/klavity-widget.iife.js
git commit -m "feat(widget): mode-aware success screen + lead capture + Powered by Klavity"
```

---

### Task 7: Provision the website Klavity project + Plane connector (prod, one-time)

**Files:**
- Create: `prototype/scripts/provision-website-project.ts` (one-off, idempotent ops script)

**Interfaces:**
- Produces: a Klavity project named "Website" with a Plane auto-copy connector → `f2982ce0-6bb5-410f-9c77-b84a7b90441c`, and `widget_mode=leadgen`. Prints the new project id (the `data-project` value for Task 8).

- [ ] **Step 1: Write the idempotent ops script**

```ts
// prototype/scripts/provision-website-project.ts
// Run on the prod box with env loaded. Idempotent: re-running finds the existing project by name.
import { initDb, db, listProjects, createProject, createConnector, listConnectors, setWidgetConfig } from "../lib/db"
await initDb()
const ACCOUNT_OWNER = process.env.PROVISION_OWNER_EMAIL!  // pass the account owner email
const PLANE_PROJECT = "f2982ce0-6bb5-410f-9c77-b84a7b90441c"
const projects = await listProjects(ACCOUNT_OWNER)
let proj = projects.find(p => p.name === "Website")
if (!proj) proj = await createProject(/* match createProject's signature: account/owner, name "Website" */ ACCOUNT_OWNER, "Website")
const conns = await listConnectors(proj.id)
if (!conns.some(c => c.type === "plane")) {
  await createConnector({ // match createConnector's exact signature/field names in db.ts
    projectId: proj.id, type: "plane", name: "Website leads → Plane", autoCopy: 1, enabled: 1,
    config: { workspace: "qbuilder", projectId: PLANE_PROJECT, host: "https://plane.quantana.top",
      token_enc: process.env.PROVISION_PLANE_TOKEN_ENC! }, // reuse the encrypted-token approach the existing connector uses
    createdBy: ACCOUNT_OWNER,
  })
}
await setWidgetConfig(proj.id, { mode: "leadgen", ctaUrl: "https://klavity.quantana.top/onboarding", notifyEmail: process.env.PROVISION_NOTIFY_EMAIL! })
console.log("WEBSITE_PROJECT_ID=" + proj.id)
```

NOTE: before writing the create calls, open `prototype/lib/db.ts` and copy the EXACT signatures of `createProject`, `createConnector` (field names, how the Plane token is encrypted — reuse `encryptSecret` exactly as the connectors route does). Do not guess field names. The existing `proj_32948ecf` Plane connector is the reference row — match its `config` shape.

- [ ] **Step 2: Dry-run locally is not meaningful (needs prod Turso). Defer execution to deploy (Task 8). Commit the script.**

```bash
git add prototype/scripts/provision-website-project.ts
git commit -m "chore: idempotent provisioning script for the website lead-gen project"
```

---

### Task 8: Embed on all marketing pages + release + deploy + verify

**Files:**
- Modify: `site/index.html`, `site/snap.html`, `site/sims.html`, `site/autosim.html`, `site/onboarding.html`, `site/privacy.html`, `site/terms.html` (add the widget script before `</body>`)
- Modify: `package.json` (`/`, `packages/core`, `packages/extension`, `packages/sdk`), `packages/extension/manifest.json`, `docs/PRD.md`, `CHANGELOG.md` (release `0.31.0`)

**Interfaces:**
- Consumes: the website project id printed by Task 7's script (call it `<WEBSITE_PID>`).

- [ ] **Step 1: Run the provisioning script on prod to get the project id**

```bash
ssh root@66.135.20.62 'cd /opt/klav/prototype && set -a && . /etc/klav/klav.env && set +a && PROVISION_OWNER_EMAIL="<owner>" PROVISION_NOTIFY_EMAIL="<vishal>" PROVISION_PLANE_TOKEN_ENC="<reuse>" /home/klav/.bun/bin/bun run scripts/provision-website-project.ts'
```
Expected: prints `WEBSITE_PROJECT_ID=proj_…`. Record it as `<WEBSITE_PID>`. (Run AFTER the deploy in Step 4 if the script imports newly-added db helpers; otherwise it can run once the code is on the box.)

- [ ] **Step 2: Add the embed snippet to every marketing page**

Before `</body>` in each `site/*.html` listed above:

```html
<script src="https://klavity.quantana.top/widget.js" data-project="<WEBSITE_PID>" defer></script>
```

- [ ] **Step 3: SemVer lockstep bump to `0.31.0`**

Set `"version": "0.31.0"` in the four `package.json` files + `packages/extension/manifest.json`; update `docs/PRD.md` Version to `0.31.0`; add a `## [0.31.0] — <date>` CHANGELOG entry summarizing: widget modes (support/leadgen/off), first-party anonymous intake, `/api/widget/config`, `/api/widget/lead` + email alert, admin config UI, Powered-by-Klavity, embedded on all marketing pages → leads to Plane `f2982ce0…`.

- [ ] **Step 4: Run the full test suite**

Run: `cd prototype && bun test`
Expected: PASS (all, including the 4 new test files).

- [ ] **Step 5: Commit + push + deploy**

```bash
git add site/*.html package.json packages/core/package.json packages/extension/package.json packages/sdk/package.json packages/extension/manifest.json docs/PRD.md CHANGELOG.md
git commit -m "release(0.31.0): embed lead-gen widget on all marketing pages + modes/lead-capture"
git push origin master
ssh root@66.135.20.62 'cd /opt/klav && sudo -u klav git fetch origin master && sudo -u klav git reset --hard origin/master && systemctl restart klav'
```

- [ ] **Step 6: Verify live**

```bash
# health
curl -s -o /dev/null -w "%{http_code}\n" https://klavity.quantana.top/   # expect 200 after boot
# widget served
curl -s -o /dev/null -w "%{http_code}\n" https://klavity.quantana.top/widget.js   # 200
# config endpoint returns leadgen for our project
curl -s "https://klavity.quantana.top/api/widget/config?project=<WEBSITE_PID>"   # {"mode":"leadgen",...}
# embed present on home
curl -s https://klavity.quantana.top/ | grep -c 'data-project="<WEBSITE_PID>"'   # 1
```
Then a manual end-to-end: open the home page, right-click → file a test bug → confirm the success screen is leadgen → enter `vishal@quantana.com.au` → confirm a card appears in Plane project `f2982ce0…` and a lead-alert email arrives. Print an IST timestamp.

- [ ] **Step 7: Verify the Powered-by + modes**

Confirm "Powered by Klavity" shows in the composer, and that flipping a test project's mode via the dashboard changes its success screen (support vs leadgen vs off).

---

## Self-Review

**Spec coverage:**
- Funnel / zero-friction submit → Tasks 3, 6. ✓
- Modes support/leadgen/off + delivery via `/api/widget/config` → Tasks 2, 6. ✓
- Admin config (mode + cta_url + notify_email) → Task 5. ✓
- Lead capture + email alert (two-step) → Task 4. ✓
- Anonymous first-party intake + anti-abuse (origin guard, per-IP rate limit, size cap) → Task 3. ✓
- Plane wiring to `f2982ce0…` + leadgen on our project → Task 7. ✓
- Powered by Klavity → Task 6. ✓
- Embed on all marketing pages → Task 8. ✓
- Data model (`projects` widget cols, `feedback.contact_email`) → Task 1. ✓
- Testing across endpoints → Tasks 1–6 each ship tests. ✓
- Scope boundary (first-party only; cross-origin deferred) → enforced in Task 3 origin guard. ✓
- Ticket visualiser explicitly NOT here (separate sub-project). ✓

**Placeholder scan:** `<WEBSITE_PID>`, `<owner>`, `<vishal>`, `<reuse>` are deliberate runtime values produced/supplied during Tasks 7–8, not code placeholders — each is defined where it's introduced. Task 5/7 explicitly instruct copying exact existing signatures (`roleIn`/`projectAccess`, `createProject`, `createConnector`, `encryptSecret`) rather than guessing — these are real functions in `db.ts`/`server.ts` the implementer must read first.

**Type consistency:** `successCopy` shape is identical in Task 6 Steps 1/3. `getWidgetConfig` returns `{mode, ctaUrl}` everywhere (Tasks 1, 2, 6). `setWidgetConfig({mode?, ctaUrl?, notifyEmail?})` consistent in Tasks 1, 5, 7. `setFeedbackContactEmail(feedbackId, projectId, email)` consistent in Tasks 1, 4. `contact_email` column name consistent.

## Notes for the executor

- Read the referenced source BEFORE editing: `server.ts` `/api/feedback` handler is large — keep edits surgical and re-run `server.feedback-widget.test.ts` after Task 3.
- Several tasks copy the subprocess test boilerplate from `server.feedback-widget.test.ts` / `server.connectors.test.ts`. Match their exact seed schema, adding the new columns.
- Deploy (Task 8 Step 5) is the only prod-mutating, hard-to-reverse step — it opens a public endpoint and embeds on the live site. Treat it as a gated checkpoint; confirm tests green and (ideally) human sign-off before pushing.
