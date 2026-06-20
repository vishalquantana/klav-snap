# Widget Appearance & Post-Submit Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project admins configure the report popup's theme, optional custom colors/font (Pro), and a custom post-submit message; the widget fetches this and `buildModal()` renders it, with a Genie open/close animation.

**Architecture:** Pure, testable theme/validation logic lives in `packages/core/src/modal-theme.ts` (vitest-covered, no DOM). `modal.ts` consumes it to theme the modal + animate. A new `modal_config_json` column on `projects` stores config; `GET/POST /api/projects/:id/config` reads/writes it; the widget fetches it and passes a `ModalConfig` to `buildModal()`. Admin UI is a card in the server-rendered dashboard.

**Tech Stack:** TypeScript, vitest (packages), Bun server (prototype), libSQL/Turso, server-rendered HTML dashboard, Shadow DOM modal.

## Global Constraints

- Test runner: `vitest run` (run from `packages/core`); prototype has NO unit runner — verify server/db via `bun build`/typecheck + manual curl.
- `packages/core/src/modal-theme.ts` MUST be DOM-free (imported by both the browser modal and the Bun server).
- Modal user-text (`thankYou`, ticket key) MUST be rendered with `textContent`, never `innerHTML` (existing XSS posture).
- Config blob ≤ 2 KB; `theme` ∈ {light,dark,glass,neon,custom,liquid}; colors `^#[0-9a-fA-F]{3,8}$`; `font` ≤ 120 chars; `thankYou` ≤ 140 chars.
- Default theme is `light`.
- SemVer lockstep: bump `version` in all 5 manifests + CHANGELOG.md + docs/PRD.md (current root version 0.30.5 → 0.31.0).
- Frequent commits (one per task).

---

### Task 1: Core theme + config module (pure, TDD)

**Files:**
- Create: `packages/core/src/modal-theme.ts`
- Create: `packages/core/tests/modal-theme.test.ts`
- Modify: `packages/core/package.json` (add `"./modal-theme": "./src/modal-theme.ts"` to `exports`)

**Interfaces:**
- Produces:
  - `type ModalTheme = 'light'|'dark'|'glass'|'neon'|'custom'|'liquid'`
  - `interface ModalConfig { theme?: ModalTheme; primary?: string; secondary?: string; background?: string; font?: string; thankYou?: string }`
  - `const ALLOWED_THEMES: ModalTheme[]`
  - `resolveModalConfig(raw: unknown): Required<Pick<ModalConfig,'theme'>> & ModalConfig` — coerces/validates, defaults `theme:'light'`, drops bad fields.
  - `themeCss(config: ModalConfig): string` — returns a `:host{ --kl-*: … }` block for the resolved theme + custom overrides.
  - `validateModalConfigInput(body: unknown, opts: { isPro: boolean }): { ok: true; config: ModalConfig } | { ok: false; error: string }` — strict; strips custom color/font fields when `!isPro`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/modal-theme.test.ts
import { describe, it, expect } from "vitest"
import { resolveModalConfig, themeCss, validateModalConfigInput, ALLOWED_THEMES } from "../src/modal-theme"

describe("resolveModalConfig", () => {
  it("defaults to light when empty/garbage", () => {
    expect(resolveModalConfig(undefined).theme).toBe("light")
    expect(resolveModalConfig("nonsense").theme).toBe("light")
    expect(resolveModalConfig({ theme: "banana" }).theme).toBe("light")
  })
  it("keeps a valid theme and trims thankYou", () => {
    const c = resolveModalConfig({ theme: "neon", thankYou: "  Thanks!  " })
    expect(c.theme).toBe("neon")
    expect(c.thankYou).toBe("Thanks!")
  })
  it("keeps custom colors only when they are valid hex", () => {
    const c = resolveModalConfig({ theme: "custom", primary: "#5b5bf0", secondary: "nope" })
    expect(c.primary).toBe("#5b5bf0")
    expect(c.secondary).toBeUndefined()
  })
})

describe("themeCss", () => {
  it("emits CSS custom properties for the theme", () => {
    const css = themeCss({ theme: "dark" })
    expect(css).toContain("--kl-bg")
    expect(css).toContain(":host")
  })
  it("applies custom primary into --kl-accent", () => {
    const css = themeCss({ theme: "custom", primary: "#abcdef" })
    expect(css).toContain("#abcdef")
  })
})

describe("validateModalConfigInput", () => {
  it("rejects an unknown theme", () => {
    const r = validateModalConfigInput({ theme: "x" }, { isPro: true })
    expect(r.ok).toBe(false)
  })
  it("accepts a known theme and clamps thankYou length", () => {
    const r = validateModalConfigInput({ theme: "light", thankYou: "a".repeat(200) }, { isPro: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.thankYou!.length).toBe(140)
  })
  it("strips custom colors when not Pro", () => {
    const r = validateModalConfigInput({ theme: "custom", primary: "#5b5bf0" }, { isPro: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.primary).toBeUndefined()
  })
  it("keeps valid custom colors when Pro, rejects bad hex", () => {
    const r = validateModalConfigInput({ theme: "custom", primary: "#5b5bf0", secondary: "red" }, { isPro: true })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.config.primary).toBe("#5b5bf0"); expect(r.config.secondary).toBeUndefined() }
  })
  it("exposes the allowed theme set", () => {
    expect(ALLOWED_THEMES).toContain("liquid")
    expect(ALLOWED_THEMES).toContain("light")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/modal-theme.test.ts`
Expected: FAIL — cannot find module `../src/modal-theme`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/modal-theme.ts
export type ModalTheme = 'light' | 'dark' | 'glass' | 'neon' | 'custom' | 'liquid'
export const ALLOWED_THEMES: ModalTheme[] = ['light', 'dark', 'glass', 'neon', 'custom', 'liquid']

export interface ModalConfig {
  theme?: ModalTheme
  primary?: string
  secondary?: string
  background?: string
  font?: string
  thankYou?: string
}

const HEX = /^#[0-9a-fA-F]{3,8}$/
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const hex = (v: unknown): string | undefined => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : undefined)
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

// CSS-variable palettes per built-in theme (ported from packages/core/demo/popup-themes.html).
const THEMES: Record<Exclude<ModalTheme, 'custom'>, Record<string, string>> = {
  light: { '--kl-overlay': 'rgba(20,20,40,.28)', '--kl-bg': '#ffffff', '--kl-fg': '#1d1d24', '--kl-muted': '#8a8a96', '--kl-border': '#e6e6ec', '--kl-chip': '#f4f4f7', '--kl-input-bg': '#fafafb', '--kl-accent': '#5b5bf0', '--kl-on-accent': '#fff', '--kl-accent2': '#f59e0b', '--kl-radius': '16px', '--kl-shadow': '0 24px 60px rgba(20,20,40,.18)', '--kl-backdrop': 'none' },
  dark: { '--kl-overlay': 'rgba(0,0,0,.5)', '--kl-bg': '#1e1e2e', '--kl-fg': '#cdd6f4', '--kl-muted': '#a6adc8', '--kl-border': '#45475a', '--kl-chip': '#313244', '--kl-input-bg': '#181825', '--kl-accent': '#89b4fa', '--kl-on-accent': '#1e1e2e', '--kl-accent2': '#fab387', '--kl-radius': '12px', '--kl-shadow': '0 20px 60px rgba(0,0,0,.5)', '--kl-backdrop': 'none' },
  glass: { '--kl-overlay': 'rgba(10,10,18,.25)', '--kl-bg': 'rgba(255,255,255,.14)', '--kl-fg': '#fff', '--kl-muted': 'rgba(255,255,255,.7)', '--kl-border': 'rgba(255,255,255,.28)', '--kl-chip': 'rgba(255,255,255,.16)', '--kl-input-bg': 'rgba(255,255,255,.10)', '--kl-accent': 'rgba(255,255,255,.92)', '--kl-on-accent': '#15121d', '--kl-accent2': 'rgba(255,255,255,.55)', '--kl-radius': '22px', '--kl-shadow': '0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25)', '--kl-backdrop': 'blur(22px) saturate(180%)' },
  neon: { '--kl-overlay': 'rgba(8,4,20,.55)', '--kl-bg': '#0e0b1e', '--kl-fg': '#f4f0ff', '--kl-muted': '#a99fd6', '--kl-border': '#3a2d6b', '--kl-chip': '#1c1640', '--kl-input-bg': '#140f2c', '--kl-accent': '#ff2d95', '--kl-on-accent': '#fff', '--kl-accent2': '#15e0ff', '--kl-radius': '14px', '--kl-shadow': '0 0 0 1px rgba(255,45,149,.4), 0 24px 70px rgba(255,45,149,.25)', '--kl-backdrop': 'none' },
  // 'liquid' on a real page can't do clone-refraction; render as frosted glass.
  liquid: { '--kl-overlay': 'rgba(10,10,18,.25)', '--kl-bg': 'rgba(255,255,255,.10)', '--kl-fg': '#fff', '--kl-muted': 'rgba(255,255,255,.7)', '--kl-border': 'rgba(255,255,255,.4)', '--kl-chip': 'rgba(255,255,255,.16)', '--kl-input-bg': 'rgba(255,255,255,.08)', '--kl-accent': 'rgba(255,255,255,.92)', '--kl-on-accent': '#15121d', '--kl-accent2': 'rgba(255,255,255,.55)', '--kl-radius': '22px', '--kl-shadow': '0 30px 90px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.5)', '--kl-backdrop': 'blur(14px) saturate(170%)' },
}

function luminance(hexColor: string): number {
  let h = hexColor.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function resolveModalConfig(raw: unknown): ModalConfig & { theme: ModalTheme } {
  const r = isObj(raw) ? raw : {}
  const theme = (typeof r.theme === 'string' && (ALLOWED_THEMES as string[]).includes(r.theme)) ? (r.theme as ModalTheme) : 'light'
  const out: ModalConfig & { theme: ModalTheme } = { theme }
  const p = hex(r.primary), s = hex(r.secondary), bg = hex(r.background), ty = str(r.thankYou, 140), f = str(r.font, 120)
  if (p) out.primary = p
  if (s) out.secondary = s
  if (bg) out.background = bg
  if (f) out.font = f
  if (ty) out.thankYou = ty
  return out
}

export function themeCss(config: ModalConfig): string {
  const c = resolveModalConfig(config)
  const base = c.theme === 'custom' ? { ...THEMES.light } : { ...THEMES[c.theme] }
  if (c.theme === 'custom') {
    if (c.primary) base['--kl-accent'] = c.primary
    if (c.secondary) base['--kl-accent2'] = c.secondary
    if (c.background) {
      base['--kl-bg'] = c.background
      const dark = luminance(c.background) < 140
      base['--kl-fg'] = dark ? '#f4f4f7' : '#1d1d24'
      base['--kl-muted'] = dark ? 'rgba(255,255,255,.6)' : '#8a8a96'
      base['--kl-border'] = dark ? 'rgba(255,255,255,.16)' : '#e6e6ec'
      base['--kl-chip'] = dark ? 'rgba(255,255,255,.08)' : '#f4f4f7'
      base['--kl-input-bg'] = dark ? 'rgba(255,255,255,.05)' : '#fafafb'
    }
  }
  if (c.font) base['--kl-font'] = c.font
  const vars = Object.entries(base).map(([k, v]) => `${k}:${v};`).join('')
  return `:host{${vars}}`
}

export function validateModalConfigInput(body: unknown, opts: { isPro: boolean }): { ok: true; config: ModalConfig } | { ok: false; error: string } {
  if (!isObj(body)) return { ok: false, error: 'Invalid body.' }
  if (typeof body.theme !== 'string' || !(ALLOWED_THEMES as string[]).includes(body.theme)) {
    return { ok: false, error: 'Unknown theme.' }
  }
  const config: ModalConfig = { theme: body.theme as ModalTheme }
  const ty = str(body.thankYou, 140)
  if (ty) config.thankYou = ty
  if (opts.isPro) {
    const p = hex(body.primary), s = hex(body.secondary), bg = hex(body.background), f = str(body.font, 120)
    if (p) config.primary = p
    if (s) config.secondary = s
    if (bg) config.background = bg
    if (f) config.font = f
  }
  if (JSON.stringify(config).length > 2048) return { ok: false, error: 'Config too large.' }
  return { ok: true, config }
}
```

- [ ] **Step 4: Add the package export**

In `packages/core/package.json`, add to the `"exports"` object (after the `"./modal"` line):
```json
    "./modal-theme": "./src/modal-theme.ts",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/modal-theme.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/modal-theme.ts packages/core/tests/modal-theme.test.ts packages/core/package.json
git commit -m "feat(core): modal theme + config module with validation"
```

---

### Task 2: Apply theme + Genie + thank-you in modal.ts

**Files:**
- Modify: `packages/core/src/modal.ts` (style block 33-55; `buildModal` signature line 20; success screen 157-160; `close()` 119-122)

**Interfaces:**
- Consumes: `themeCss`, `resolveModalConfig`, `ModalConfig` from `./modal-theme`.
- Produces: `buildModal(initialType, callbacks, config?: ModalConfig)` (3rd arg optional, backward compatible).

- [ ] **Step 1: Import the theme module**

At the top of `packages/core/src/modal.ts`, after the existing imports add:
```ts
import { themeCss, resolveModalConfig, type ModalConfig } from './modal-theme'
```

- [ ] **Step 2: Accept config in the signature**

Change `buildModal(initialType: ReportType, callbacks: ModalCallbacks,)` to:
```ts
export function buildModal(
  initialType: ReportType,
  callbacks: ModalCallbacks,
  config: ModalConfig = {},
): ModalController {
  const cfg = resolveModalConfig(config)
```

- [ ] **Step 3: Replace the hardcoded palette with var-driven CSS + genie keyframes**

Replace the body of the `style.textContent = \`…\`` block (lines 34-55) so every color references a var and the theme block + animation are injected. Set `style.textContent` to:
```ts
  style.textContent = `
    ${themeCss(cfg)}
    @keyframes kl-genie-in{from{opacity:0;transform:translateY(180px) scaleX(.04) scaleY(.06)}to{opacity:1;transform:translateY(0) scaleX(1) scaleY(1)}}
    @keyframes kl-genie-out{from{opacity:1;transform:translateY(0) scaleX(1) scaleY(1)}to{opacity:0;transform:translateY(180px) scaleX(.04) scaleY(.06)}}
    @keyframes kl-ov{from{opacity:0}to{opacity:1}}
    .klavity-overlay{position:fixed;inset:0;background:var(--kl-overlay);display:flex;align-items:center;justify-content:center;pointer-events:all;animation:kl-ov .3s ease both;}
    .klavity-modal{background:var(--kl-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:var(--kl-radius);padding:24px;width:100%;max-width:480px;box-shadow:var(--kl-shadow);font-family:var(--kl-font,system-ui,sans-serif);-webkit-backdrop-filter:var(--kl-backdrop);backdrop-filter:var(--kl-backdrop);transform-origin:bottom center;animation:kl-genie-in .6s cubic-bezier(.16,1,.3,1) both;}
    .klavity-modal.kl-closing{animation:kl-genie-out .5s cubic-bezier(.55,0,.85,.25) both;}
    .klavity-toggle{display:flex;gap:8px;margin-bottom:16px;}
    .klavity-toggle button{flex:1;padding:8px;border-radius:6px;border:none;cursor:pointer;font-size:14px;font-weight:600;background:var(--kl-chip);color:var(--kl-fg);}
    .klavity-toggle .bug.active{background:var(--kl-accent2);color:var(--kl-on-accent);}
    .klavity-toggle .feat.active{background:var(--kl-accent2);color:var(--kl-on-accent);}
    .klavity-page{font-size:12px;color:var(--kl-muted);margin-bottom:12px;}
    .klavity-strip{display:flex;gap:8px;overflow-x:auto;margin-bottom:12px;min-height:64px;}
    .klavity-thumb{position:relative;flex-shrink:0;}
    .klavity-thumb img{height:60px;border-radius:4px;border:1px solid var(--kl-border);}
    .klavity-rm{position:absolute;top:-4px;right:-4px;background:var(--kl-accent2);color:var(--kl-on-accent);border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;}
    .klavity-mk{position:absolute;bottom:-4px;right:-4px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;}
    .klavity-actions{display:flex;gap:8px;margin-bottom:12px;}
    .klavity-actions button{flex:1;padding:8px;background:var(--kl-chip);color:var(--kl-fg);border:none;border-radius:6px;cursor:pointer;font-size:12px;}
    .klavity-counter{font-size:11px;color:var(--kl-muted);margin-bottom:8px;}
    textarea.klavity-desc{width:100%;min-height:100px;resize:vertical;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:6px;padding:10px;font-size:14px;margin-bottom:16px;box-sizing:border-box;}
    .klavity-submit{width:100%;padding:12px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;}
    .klavity-submit:disabled{opacity:.5;cursor:not-allowed;}
    .klavity-error{color:#f38ba8;font-size:13px;margin-bottom:8px;display:none;}
    @media (prefers-reduced-motion: reduce){.klavity-overlay,.klavity-modal,.klavity-modal.kl-closing{animation-duration:.01ms;}}
  `
```

- [ ] **Step 4: Genie-close — animate before removing**

Replace `close()` (lines 119-122) with:
```ts
  function close() {
    document.removeEventListener('keydown', escHandler, { capture: true })
    const m = shadowRoot.querySelector('.klavity-modal') as HTMLElement | null
    if (!m) { host.remove(); return }
    m.classList.add('kl-closing')
    const done = () => host.remove()
    m.addEventListener('animationend', done, { once: true })
    setTimeout(done, 700) // safety if animationend doesn't fire
  }
```

- [ ] **Step 5: Custom thank-you on success (textContent, themed)**

Replace the success `shadowRoot.innerHTML = …` block (lines 157-160) with DOM construction:
```ts
      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;'
      const card = document.createElement('div')
      card.style.cssText = 'background:var(--kl-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:var(--kl-radius);padding:32px;font-family:var(--kl-font,system-ui),sans-serif;font-size:16px;text-align:center;box-shadow:var(--kl-shadow);'
      card.textContent = cfg.thankYou ? cfg.thankYou : `✓ Filed as ${result.issueKey}`
      wrap.appendChild(card)
      // keep the themed style element; swap only the body
      overlay.remove()
      shadowRoot.appendChild(wrap)
      setTimeout(close, cfg.thankYou ? 2600 : 1500)
```
(Leave the existing `style` element in the shadow root so vars still resolve; only the overlay is replaced.)

- [ ] **Step 6: Build/typecheck**

Run: `cd packages/core && npx tsc --noEmit -p .` (or `pnpm -C packages/core build` if a build script exists)
Expected: no type errors.

- [ ] **Step 7: Verify visually in the demo harness (smoke)**

Run: `open packages/core/demo/popup-themes.html` is unrelated; instead confirm modal still compiles and that `buildModal('bug', cb)` (no config) defaults to light. No automated DOM test (no jsdom). Confirm via tsc + a manual import check:
Run: `cd packages/core && node -e "import('./src/modal-theme.ts')" 2>/dev/null; echo done` (sanity that module loads under a TS-aware runner is covered by Task 1 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/modal.ts
git commit -m "feat(core): theme-driven modal with genie animation + custom thank-you"
```

---

### Task 3: DB column, config accessors, and Pro flag

**Files:**
- Modify: `prototype/lib/db.ts` (migrations block near line 26/362; `ProjectRow`/`rowToProject`; add accessors; accounts table near schema; add `isAccountPro`)

**Interfaces:**
- Produces:
  - `getProjectModalConfig(projectId: string): Promise<object>` — parsed `modal_config_json` or `{}`.
  - `setProjectModalConfig(projectId: string, config: object): Promise<void>` — JSON-stringify into the column.
  - `isAccountPro(accountId: string): Promise<boolean>` — reads `accounts.plan === 'pro'`.
  - `accountIdForProject(projectId: string): Promise<string|null>` — via `projectById`.

- [ ] **Step 1: Add idempotent migrations**

In the migrations section of `db.ts` (alongside the existing `ALTER TABLE … .catch()` calls near line 26), add:
```ts
await db!.execute("ALTER TABLE projects ADD COLUMN modal_config_json TEXT DEFAULT '{}'").catch((e: any) => console.warn("projects.modal_config_json ALTER skipped:", e?.message || e))
await db!.execute("ALTER TABLE accounts ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'").catch((e: any) => console.warn("accounts.plan ALTER skipped:", e?.message || e))
```

- [ ] **Step 2: Add accessors (after `renameProject`)**

```ts
export async function getProjectModalConfig(projectId: string): Promise<Record<string, unknown>> {
  const r = await db!.execute({ sql: "SELECT modal_config_json FROM projects WHERE id=?", args: [projectId] })
  if (!r.rows.length) return {}
  try { return JSON.parse(String((r.rows[0] as any).modal_config_json || "{}")) || {} } catch { return {} }
}

export async function setProjectModalConfig(projectId: string, config: Record<string, unknown>): Promise<void> {
  await db!.execute({ sql: "UPDATE projects SET modal_config_json=?, updated_at=? WHERE id=?", args: [JSON.stringify(config || {}), Date.now(), projectId] })
}

export async function isAccountPro(accountId: string): Promise<boolean> {
  const r = await db!.execute({ sql: "SELECT plan FROM accounts WHERE id=?", args: [accountId] })
  return r.rows.length ? String((r.rows[0] as any).plan) === "pro" : false
}
```

- [ ] **Step 3: Verify the server still boots (migration runs once)**

Run: `cd prototype && timeout 6 bun run server.ts; echo "exit=$?"`
Expected: server starts, logs include no fatal error; the ALTER warnings (if column already exists) are benign. Ctrl-C/timeout is fine.

- [ ] **Step 4: Commit**

```bash
git add prototype/lib/db.ts
git commit -m "feat(db): modal_config_json column + accessors + accounts.plan/isAccountPro"
```

---

### Task 4: Config endpoints (GET public, POST admin)

**Files:**
- Modify: `prototype/server.ts` (import from db at line 2; `projMatch` regex at line 2308; add `/config` handler in the `projMatch` block; add a public GET before the session-gated block)

**Interfaces:**
- Consumes: `validateModalConfigInput`, `resolveModalConfig` (core); `getProjectModalConfig`, `setProjectModalConfig`, `isAccountPro`, `projectById`, `projectAccess`, `json` (existing).

- [ ] **Step 1: Import core validation + db accessors**

At top of `server.ts`, add a new import line (Bun resolves the relative TS path):
```ts
import { validateModalConfigInput, resolveModalConfig } from "../packages/core/src/modal-theme"
```
And add `getProjectModalConfig, setProjectModalConfig, isAccountPro` to the existing `from "./lib/db"` import list.

- [ ] **Step 2: Public GET (before auth) — add near other unauthenticated `/api/*` routes (e.g. just after the `/api/personas` public/bearer handler)**

```ts
// Public widget appearance config (non-sensitive; project-scoped). Lets the widget theme itself pre-auth.
{
  const m = path.match(/^\/api\/projects\/([^/]+)\/config$/)
  if (req.method === "GET" && m) {
    const proj = await projectById(m[1])
    if (!proj) return json({ error: "Not found." }, 404)
    return json({ modalConfig: resolveModalConfig(await getProjectModalConfig(m[1])) })
  }
}
```

- [ ] **Step 3: Extend the project route regex to include `/config`**

Change the `projMatch` regex (line 2308) to add `|\/config` inside the alternation group:
```ts
const projMatch = path.match(/^\/api\/projects\/([^/]+?)(\/members|\/invite|\/activity|\/rename|\/config|\/monitored-urls(?:\/[^/]+)?|\/connectors(?:\/[^/]+)?(?:\/test)?)?$/)
```

- [ ] **Step 4: Add the admin POST handler inside the `projMatch` block (after the monitored-urls block)**

```ts
        // Report widget appearance config — admin-only write.
        if (sub === "/config") {
          if (req.method === "POST") {
            if (access !== "admin") return json({ error: "Only project admins can change widget appearance." }, 403)
            const body = await req.json().catch(() => ({}))
            const pro = await isAccountPro(proj.accountId)
            const v = validateModalConfigInput(body, { isPro: pro })
            if (!v.ok) return json({ error: v.error }, 400)
            await setProjectModalConfig(pid, v.config as any)
            return json({ ok: true, modalConfig: v.config, pro })
          }
          // GET here (session-authed) returns current + pro flag for the admin UI
          return json({ modalConfig: resolveModalConfig(await getProjectModalConfig(pid)), pro: await isAccountPro(proj.accountId) })
        }
```

- [ ] **Step 5: Verify routing + auth manually**

Run (in one shell):
```bash
cd prototype && bun run server.ts &
sleep 3
curl -s localhost:3000/api/projects/proj_does_not_exist/config ; echo
curl -s -X POST localhost:3000/api/projects/anyid/config -H 'content-type: application/json' -d '{"theme":"neon"}' ; echo
kill %1
```
Expected: GET unknown → `{"error":"Not found."}` (404); POST without session → an auth/403 error (not a 500). (Port may differ; check the server's startup log for the actual port and adjust.)

- [ ] **Step 6: Commit**

```bash
git add prototype/server.ts
git commit -m "feat(server): GET (public) + POST (admin) /api/projects/:id/config"
```

---

### Task 5: Widget fetches config and themes the modal

**Files:**
- Modify: `packages/sdk/src/widget.ts` (mount: fetch config; pass to both `buildModal` calls in `openReport`)

**Interfaces:**
- Consumes: `GET /api/projects/:id/config` → `{ modalConfig }`; `buildModal(type, cb, modalConfig)`.

- [ ] **Step 1: Fetch config during mount (best-effort, cached)**

In `mount()`, after `const firstParty = isFirstParty(...)` (line 44), add:
```ts
  let modalConfig: any = {}
  try {
    const r = await fetch(cfg.backendUrl + "/api/projects/" + encodeURIComponent(cfg.projectId) + "/config")
    if (r.ok) modalConfig = (await r.json()).modalConfig || {}
  } catch { /* default theme */ }
```

- [ ] **Step 2: Pass config into buildModal**

In `openReport`, change `buildModal(type, { … })` to `buildModal(type, { … }, modalConfig)` (add `modalConfig` as the 3rd argument; the callbacks object is unchanged).

- [ ] **Step 3: Typecheck the SDK**

Run: `cd packages/sdk && npx tsc --noEmit -p .` (or the package's build script)
Expected: no type errors (config arg is optional and typed via core).

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/widget.ts
git commit -m "feat(sdk): widget fetches project appearance config and themes the modal"
```

---

### Task 6: Admin settings card in the dashboard

**Files:**
- Modify: `prototype/server.ts` (the server-rendered project settings HTML — locate the "Monitored URLs"/"Connectors" settings card markup and its inline `<script>`; add a sibling card + handlers)

**Interfaces:**
- Consumes: `GET /api/projects/:id/config` (session) → `{ modalConfig, pro }`; `POST` same.

- [ ] **Step 1: Locate the settings render**

Search `server.ts` for the connectors settings card markup (grep for the user-facing heading text used near the connectors/monitored-urls UI). Identify the surrounding template string and the project id variable in scope (e.g. `proj.id`).

- [ ] **Step 2: Add the appearance card markup**

Insert next to the connectors card (same container/class) this markup (interpolating the in-scope project id as the connectors card does):
```html
<div class="card" id="kl-appearance">
  <h3>Report widget appearance</h3>
  <label>Theme
    <select id="kl-theme">
      <option value="light">Light (default)</option>
      <option value="dark">Dark</option>
      <option value="glass">Glass</option>
      <option value="neon">Neon</option>
      <option value="custom">Custom (Pro)</option>
      <option value="liquid">Liquid (experimental)</option>
    </select>
  </label>
  <div id="kl-custom" style="display:none">
    <label>Primary <input type="color" id="kl-primary" value="#5b5bf0"></label>
    <label>Secondary <input type="color" id="kl-secondary" value="#f59e0b"></label>
    <label>Background <input type="color" id="kl-bg" value="#ffffff"></label>
    <label>Font <input type="text" id="kl-font" placeholder="system-ui, sans-serif" maxlength="120"></label>
    <p id="kl-pro-note" style="display:none;font-size:12px;opacity:.7">Custom colors require a Pro plan.</p>
  </div>
  <label>Thank-you message
    <input type="text" id="kl-thankyou" maxlength="140" placeholder="✓ Filed as KLAV-123 (default)">
  </label>
  <button id="kl-save-appearance">Save appearance</button>
  <span id="kl-appearance-msg"></span>
</div>
```

- [ ] **Step 3: Add the inline client script (load + save)**

In the dashboard's inline `<script>` (same place the connectors UI wires up), interpolating the project id `PID` the way existing scripts do:
```js
(function(){
  var PID = "__PROJECT_ID__"; // interpolate like the connectors script does
  var sel=document.getElementById('kl-theme'), cust=document.getElementById('kl-custom');
  var proNote=document.getElementById('kl-pro-note'), msg=document.getElementById('kl-appearance-msg');
  var isPro=false;
  function sync(){ cust.style.display = sel.value==='custom' ? 'block':'none'; }
  sel.addEventListener('change', sync);
  fetch('/api/projects/'+PID+'/config').then(r=>r.json()).then(function(d){
    var c=d.modalConfig||{}; isPro=!!d.pro;
    sel.value=c.theme||'light';
    if(c.primary)document.getElementById('kl-primary').value=c.primary;
    if(c.secondary)document.getElementById('kl-secondary').value=c.secondary;
    if(c.background)document.getElementById('kl-bg').value=c.background;
    if(c.font)document.getElementById('kl-font').value=c.font;
    if(c.thankYou)document.getElementById('kl-thankyou').value=c.thankYou;
    proNote.style.display=isPro?'none':'block';
    sync();
  });
  document.getElementById('kl-save-appearance').addEventListener('click', function(){
    var body={ theme:sel.value, thankYou:document.getElementById('kl-thankyou').value };
    if(sel.value==='custom' && isPro){
      body.primary=document.getElementById('kl-primary').value;
      body.secondary=document.getElementById('kl-secondary').value;
      body.background=document.getElementById('kl-bg').value;
      body.font=document.getElementById('kl-font').value;
    }
    msg.textContent='Saving…';
    fetch('/api/projects/'+PID+'/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      .then(r=>r.json()).then(function(d){ msg.textContent = d.ok ? 'Saved ✓' : ('Error: '+(d.error||'failed')); })
      .catch(function(){ msg.textContent='Network error'; });
  });
})();
```

- [ ] **Step 4: Manual verify**

Start the server, sign in, open a project's settings, change theme → Save → reload → value persists. Confirm a non-admin/non-session POST is rejected (covered by Task 4).

- [ ] **Step 5: Commit**

```bash
git add prototype/server.ts
git commit -m "feat(dashboard): report widget appearance settings card"
```

---

### Task 7: Version bump + changelog + docs

**Files:**
- Modify: `package.json`, `packages/core/package.json`, `packages/sdk/package.json`, and the other 2 manifests (the 5 tracked manifests per SemVer rule — find with `grep -rl '"version"' --include=package.json` plus any extension `manifest.json`), `CHANGELOG.md`, `docs/PRD.md`.

- [ ] **Step 1: Bump versions 0.30.5 → 0.31.0**

Update the `"version"` field in all 5 manifests to `0.31.0` (keep them in lockstep).

- [ ] **Step 2: CHANGELOG entry**

Prepend to `CHANGELOG.md`:
```md
## 0.31.0 — 2026-06-21
### Added
- Per-project report widget appearance settings: theme (light default, dark, glass, neon, custom [Pro], liquid [experimental]), optional custom colors/font, and a custom post-submit thank-you message. Genie open/close animation. Configured in the dashboard; served to the widget via `GET /api/projects/:id/config`.
```

- [ ] **Step 3: PRD note**

Add a short line under the relevant section of `docs/PRD.md` describing the widget appearance settings (theme + thank-you, Pro-gated custom colors).

- [ ] **Step 4: Run the full test suite**

Run: `pnpm -r test`
Expected: PASS (core modal-theme tests + existing sdk tests).

- [ ] **Step 5: Commit** (explicit paths only — never `git add -A`, per project rule)

```bash
git add package.json packages/core/package.json packages/sdk/package.json CHANGELOG.md docs/PRD.md
# plus the other two manifests you bumped (e.g. prototype/package.json and the extension manifest.json)
git commit -m "chore: release 0.31.0 — widget appearance settings"
```

---

## Self-Review notes
- Spec coverage: themes (T1/T2), custom colors + Pro gate (T1 validate, T3 isAccountPro, T4 enforce, T6 UI), thank-you (T1/T2/T6), Genie (T2), default light (T1), endpoints public GET + admin POST (T4), widget consumption (T5), storage (T3), versioning (T7). ✓
- DOM-free core module reused by Bun server (T1/T4). ✓
- `thankYou`/ticket rendered via `textContent` (T2). ✓
- Risk: Bun importing core TS via relative path (T4 Step 1). Fallback if it fails to resolve: copy `validateModalConfigInput`/`resolveModalConfig` into a small `prototype/lib/modal-config.ts` and import from there (keep core as source of truth/tests).
- Risk: exact dashboard HTML insertion point (T6) is located at execution time via grep; markup + script provided in full.
