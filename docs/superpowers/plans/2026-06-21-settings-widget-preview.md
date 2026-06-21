# Settings Widget Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the embed code, a live (re-renders-on-change) widget preview, and a compact extension-install card to the admin Settings → Report widget appearance drawer.

**Architecture:** All changes are in one static file, `prototype/public/dashboard.html` — new markup inside `appearanceDrawer`, scoped preview CSS in the page `<style>`, and a small vanilla-JS block (`PREVIEW_THEMES` palette + `computePreviewVars()` + `renderWidgetPreview()`) wired into the existing `loadAppearance()` listeners. No server routes, no new dependencies. The theme palette is ported verbatim from `packages/core/src/modal-theme.ts` so the preview matches the production modal.

**Tech Stack:** Static HTML + vanilla JS (no framework, no build step for the dashboard page), Bun server serves the file as-is. Existing tests run via `pnpm -r test` from repo root.

## Global Constraints

- One file changed for the feature: `prototype/public/dashboard.html`. No server/route/schema changes.
- Reuse existing helpers/patterns: `embedSnippet(pid)`, the `embedCopy` clipboard pattern, `$()` id helper, `curProjId()`, `loadAppearance()`, the `_appearanceWired` one-time-wiring guard, and existing card/`.muted`/button CSS classes + `--kl-*`/dashboard CSS variables.
- The ported theme data MUST match `packages/core/src/modal-theme.ts` exactly (palette values, `luminance()` threshold `< 140`, custom-colour derivation). Add a comment marking it a mirror of that file.
- Thank-you / user-derived text into the preview is set via `textContent`, never `innerHTML`.
- Extension install links to `/onboarding` (canonical; Web Store listing still pending review).
- Version lockstep on completion per [[klavity-semver]]: bump `CHANGELOG.md`, `docs/PRD.md`, and all 5 manifests together (minor bump — new feature).
- Admin-only: the whole `appearanceDrawer` already renders only for admins; no extra gating needed.

---

### Task 1: Embed-code block in the appearance drawer

**Files:**
- Modify: `prototype/public/dashboard.html` (markup inside `#kl-appearance` card, top; JS inside `loadAppearance()`)

**Interfaces:**
- Consumes: existing `embedSnippet(pid)` (returns the one-line `<script ... data-project=...>` string), `curProjId()`, `$()`, the `_appearanceWired` guard, the existing `embedCopy` click handler as the clipboard pattern to mirror.
- Produces: DOM ids `appearanceSnippet` (the `<code>`) and `appearanceEmbedCopy` (the copy button), populated whenever `loadAppearance()` runs.

- [ ] **Step 1: Add the embed markup at the top of the `#kl-appearance` card**

In `prototype/public/dashboard.html`, immediately after `<h3>Report widget appearance</h3>` inside `<div class="card" id="kl-appearance">`, insert:

```html
        <div class="wp-embed">
          <div class="wp-embed-label">Embed code</div>
          <div class="cl-embed">
            <code id="appearanceSnippet">Loading…</code>
            <button class="btn btn-ghost btn-sm" id="appearanceEmbedCopy" type="button">Copy</button>
          </div>
          <p style="font-size:12px;opacity:.7;margin:6px 0 0">Paste this before <code>&lt;/body&gt;</code> on any page — no extension needed.</p>
        </div>
```

- [ ] **Step 2: Populate the snippet + wire copy inside `loadAppearance()`**

In `loadAppearance()`, inside the `if (!_appearanceWired) { ... }` block (so it wires once), add a copy handler mirroring the existing `embedCopy` one:

```javascript
      const ecBtn = $("appearanceEmbedCopy")
      if (ecBtn) ecBtn.onclick = async () => {
        const pid = curProjId(); if (!pid) return
        const text = embedSnippet(pid)
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text)
          else { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove() }
          const prev = ecBtn.textContent; ecBtn.textContent = "Copied ✓"; setTimeout(() => { ecBtn.textContent = prev }, 1600)
        } catch (e) { ecBtn.textContent = "Press ⌘C"; setTimeout(() => { ecBtn.textContent = "Copy" }, 1600) }
      }
```

Then, after the `try { ... }` config-load block at the end of `loadAppearance()` (where `curProjId()` is known), set the snippet text:

```javascript
  const snipEl = $("appearanceSnippet"); if (snipEl) snipEl.textContent = embedSnippet(curProjId())
```

- [ ] **Step 3: Verify the page still parses and the snippet renders**

Run: `cd prototype && bun -e "const h=await Bun.file('public/dashboard.html').text(); if(!h.includes('appearanceSnippet')) throw new Error('missing'); console.log('ok, len', h.length)"`
Expected: prints `ok, len <number>` with no error.

- [ ] **Step 4: Commit**

```bash
git add prototype/public/dashboard.html
git commit -m "feat(settings): show widget embed code in appearance drawer"
```

---

### Task 2: Ported theme palette + live preview pane

**Files:**
- Modify: `prototype/public/dashboard.html` (preview markup in `#kl-appearance`, scoped CSS in page `<style>`, JS in the dashboard `<script>` + `loadAppearance()` wiring)

**Interfaces:**
- Consumes: `$()`, `loadAppearance()`, the `_appearanceWired` guard, the form ids `kl-theme`, `kl-primary`, `kl-secondary`, `kl-bg`, `kl-font`, `kl-thankyou`, `kl-mode`, `kl-cta`.
- Produces: `PREVIEW_THEMES` (palette map), `previewLuminance(hex)`, `computePreviewVars(cfg)` → `{ '--kl-*': string }`, and `renderWidgetPreview()` (reads form values, applies vars to `#wp-root`, updates preview text/mode); preview DOM ids `wp-root`, `wp-thanks-toggle`, `wp-body`, `wp-thanks`.

- [ ] **Step 1: Add the preview markup after the config controls**

In `prototype/public/dashboard.html`, immediately before `<button id="kl-save-appearance">Save settings</button>`, insert:

```html
        <div class="wp-preview">
          <div class="wp-preview-head">
            <span class="wp-preview-label">Live preview</span>
            <label class="wp-toggle"><input type="checkbox" id="wp-thanks-toggle"> Show thank-you</label>
          </div>
          <div class="wp-stage">
            <div class="wp-launcher">💬 Report a bug</div>
            <div class="wp-modal" id="wp-root">
              <div id="wp-body">
                <div class="wp-row">
                  <button class="wp-tab wp-tab-on">🐛 Bug</button>
                  <button class="wp-tab">💡 Feature</button>
                </div>
                <div class="wp-page">📍 /your/page</div>
                <div class="wp-strip"><span>📷 screenshot</span></div>
                <div class="wp-desc">Describe the bug…</div>
                <button class="wp-submit">Submit</button>
              </div>
              <div id="wp-thanks" class="wp-thanks-screen" style="display:none">
                <div class="wp-thanks-msg" id="wp-thanks-msg">✓ Filed as KLAV-123</div>
                <a class="wp-cta" id="wp-cta" style="display:none">Get Klavity for your product →</a>
              </div>
              <div class="wp-pb">Powered by Klavity</div>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Add scoped preview CSS to the page `<style>`**

Add near the other dashboard styles (any block inside the page `<style>` in `dashboard.html`). The preview uses the same `--kl-*` variable names the production modal uses so the ported vars drive it:

```css
.wp-preview{flex:1;min-width:280px}
.wp-preview-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px}
.wp-preview-label{font-size:12px;font-weight:600;opacity:.7}
.wp-toggle{font-size:12px;opacity:.8;display:flex;align-items:center;gap:6px;cursor:pointer}
.wp-stage{position:relative;border-radius:14px;padding:22px;min-height:300px;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#ececf2,#ececf2 12px,#f6f6fa 12px,#f6f6fa 24px);overflow:hidden}
.wp-launcher{position:absolute;bottom:12px;right:12px;background:var(--kl-accent,#5b5bf0);color:var(--kl-on-accent,#fff);font-size:12px;font-weight:700;padding:7px 11px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.wp-modal{width:100%;max-width:300px;background:var(--kl-bg,#fff);color:var(--kl-fg,#1d1d24);border:1px solid var(--kl-border,#e6e6ec);border-radius:var(--kl-radius,16px);box-shadow:var(--kl-shadow,0 24px 60px rgba(20,20,40,.18));-webkit-backdrop-filter:var(--kl-backdrop,none);backdrop-filter:var(--kl-backdrop,none);font-family:var(--kl-font,system-ui,sans-serif);padding:16px}
.wp-row{display:flex;gap:6px;margin-bottom:10px}
.wp-tab{flex:1;border:none;border-radius:6px;padding:6px;font-size:12px;font-weight:600;background:var(--kl-chip,#f4f4f7);color:var(--kl-fg,#1d1d24);cursor:default}
.wp-tab-on{background:var(--kl-accent2,#f59e0b);color:var(--kl-on-accent,#fff)}
.wp-page{font-size:11px;color:var(--kl-muted,#8a8a96);margin-bottom:8px}
.wp-strip{min-height:44px;border:1px dashed var(--kl-border,#e6e6ec);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--kl-muted,#8a8a96);margin-bottom:10px}
.wp-desc{background:var(--kl-input-bg,#fafafb);border:1px solid var(--kl-border,#e6e6ec);border-radius:6px;padding:9px;font-size:12px;color:var(--kl-muted,#8a8a96);min-height:46px;margin-bottom:10px}
.wp-submit{width:100%;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:700;background:var(--kl-accent,#5b5bf0);color:var(--kl-on-accent,#fff);cursor:default}
.wp-thanks-screen{text-align:center;padding:18px 6px}
.wp-thanks-msg{font-size:14px;font-weight:600;margin-bottom:12px;color:var(--kl-fg,#1d1d24)}
.wp-cta{display:inline-block;text-decoration:none;background:var(--kl-accent,#5b5bf0);color:var(--kl-on-accent,#fff);border-radius:8px;padding:9px 14px;font-size:12px;font-weight:700}
.wp-pb{text-align:center;font-size:9px;color:var(--kl-muted,#8a8a96);margin-top:10px}
@media (min-width:760px){#kl-appearance .wp-config-preview{display:flex;gap:20px;flex-wrap:wrap}}
```

- [ ] **Step 3: Add the ported theme palette + var computation JS**

In the dashboard `<script>` (near `loadAppearance`), add — values copied verbatim from `packages/core/src/modal-theme.ts`:

```javascript
// ── Widget-preview theming. PREVIEW_THEMES / previewLuminance / custom derivation are a VERBATIM
//    mirror of packages/core/src/modal-theme.ts (THEMES + luminance + themeCss). Keep in sync. ──
const PREVIEW_THEMES = {
  light: { '--kl-overlay':'rgba(20,20,40,.28)','--kl-bg':'#ffffff','--kl-fg':'#1d1d24','--kl-muted':'#8a8a96','--kl-border':'#e6e6ec','--kl-chip':'#f4f4f7','--kl-input-bg':'#fafafb','--kl-accent':'#5b5bf0','--kl-on-accent':'#fff','--kl-accent2':'#f59e0b','--kl-radius':'16px','--kl-shadow':'0 24px 60px rgba(20,20,40,.18)','--kl-backdrop':'none' },
  dark: { '--kl-overlay':'rgba(0,0,0,.5)','--kl-bg':'#1e1e2e','--kl-fg':'#cdd6f4','--kl-muted':'#a6adc8','--kl-border':'#45475a','--kl-chip':'#313244','--kl-input-bg':'#181825','--kl-accent':'#89b4fa','--kl-on-accent':'#1e1e2e','--kl-accent2':'#fab387','--kl-radius':'12px','--kl-shadow':'0 20px 60px rgba(0,0,0,.5)','--kl-backdrop':'none' },
  glass: { '--kl-overlay':'rgba(10,10,18,.25)','--kl-bg':'rgba(255,255,255,.14)','--kl-fg':'#fff','--kl-muted':'rgba(255,255,255,.7)','--kl-border':'rgba(255,255,255,.28)','--kl-chip':'rgba(255,255,255,.16)','--kl-input-bg':'rgba(255,255,255,.10)','--kl-accent':'rgba(255,255,255,.92)','--kl-on-accent':'#15121d','--kl-accent2':'rgba(255,255,255,.55)','--kl-radius':'22px','--kl-shadow':'0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25)','--kl-backdrop':'blur(22px) saturate(180%)' },
  neon: { '--kl-overlay':'rgba(8,4,20,.55)','--kl-bg':'#0e0b1e','--kl-fg':'#f4f0ff','--kl-muted':'#a99fd6','--kl-border':'#3a2d6b','--kl-chip':'#1c1640','--kl-input-bg':'#140f2c','--kl-accent':'#ff2d95','--kl-on-accent':'#fff','--kl-accent2':'#15e0ff','--kl-radius':'14px','--kl-shadow':'0 0 0 1px rgba(255,45,149,.4), 0 24px 70px rgba(255,45,149,.25)','--kl-backdrop':'none' },
  liquid: { '--kl-overlay':'rgba(10,10,18,.25)','--kl-bg':'rgba(255,255,255,.10)','--kl-fg':'#fff','--kl-muted':'rgba(255,255,255,.7)','--kl-border':'rgba(255,255,255,.4)','--kl-chip':'rgba(255,255,255,.16)','--kl-input-bg':'rgba(255,255,255,.08)','--kl-accent':'rgba(255,255,255,.92)','--kl-on-accent':'#15121d','--kl-accent2':'rgba(255,255,255,.55)','--kl-radius':'22px','--kl-shadow':'0 30px 90px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.5)','--kl-backdrop':'blur(14px) saturate(170%)' }
}
function previewLuminance(hexColor) {
  let h = String(hexColor || '').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}
function computePreviewVars(cfg) {
  const theme = PREVIEW_THEMES[cfg.theme] ? cfg.theme : (cfg.theme === 'custom' ? 'custom' : 'light')
  const base = theme === 'custom' ? Object.assign({}, PREVIEW_THEMES.light) : Object.assign({}, PREVIEW_THEMES[theme])
  if (cfg.theme === 'custom') {
    if (cfg.primary) base['--kl-accent'] = cfg.primary
    if (cfg.secondary) base['--kl-accent2'] = cfg.secondary
    if (cfg.background) {
      base['--kl-bg'] = cfg.background
      const dark = previewLuminance(cfg.background) < 140
      base['--kl-fg'] = dark ? '#f4f4f7' : '#1d1d24'
      base['--kl-muted'] = dark ? 'rgba(255,255,255,.6)' : '#8a8a96'
      base['--kl-border'] = dark ? 'rgba(255,255,255,.16)' : '#e6e6ec'
      base['--kl-chip'] = dark ? 'rgba(255,255,255,.08)' : '#f4f4f7'
      base['--kl-input-bg'] = dark ? 'rgba(255,255,255,.05)' : '#fafafb'
    }
  }
  if (cfg.font) base['--kl-font'] = cfg.font
  return base
}
function renderWidgetPreview() {
  const root = $("wp-root"); if (!root) return
  const theme = $("kl-theme") ? $("kl-theme").value : "light"
  const cfg = { theme }
  if (theme === "custom") {
    cfg.primary = $("kl-primary") && $("kl-primary").value
    cfg.secondary = $("kl-secondary") && $("kl-secondary").value
    cfg.background = $("kl-bg") && $("kl-bg").value
    const f = $("kl-font") && $("kl-font").value.trim(); if (f) cfg.font = f
  }
  const vars = computePreviewVars(cfg)
  for (const k in vars) root.style.setProperty(k, vars[k])
  const ty = ($("kl-thankyou") && $("kl-thankyou").value.trim()) || "✓ Filed as KLAV-123"
  const msgEl = $("wp-thanks-msg"); if (msgEl) msgEl.textContent = ty
  const mode = $("kl-mode") ? $("kl-mode").value : "support"
  const cta = $("wp-cta")
  if (cta) {
    const showCta = mode === "leadgen"
    cta.style.display = showCta ? "inline-block" : "none"
    const url = ($("kl-cta") && $("kl-cta").value.trim()) || ""
    if (url) cta.setAttribute("href", url); else cta.removeAttribute("href")
  }
  const showThanks = $("wp-thanks-toggle") && $("wp-thanks-toggle").checked
  if ($("wp-body")) $("wp-body").style.display = showThanks ? "none" : "block"
  if ($("wp-thanks")) $("wp-thanks").style.display = showThanks ? "block" : "none"
}
```

- [ ] **Step 4: Wire live updates inside `loadAppearance()`**

Inside the `if (!_appearanceWired) { ... }` block, after the existing `sel.addEventListener("change", sync)` line, add live-preview wiring:

```javascript
      ;["kl-theme","kl-primary","kl-secondary","kl-bg","kl-font","kl-thankyou","kl-mode","kl-cta"].forEach(id => {
        const el = $(id); if (el) { el.addEventListener("input", renderWidgetPreview); el.addEventListener("change", renderWidgetPreview) }
      })
      const wpT = $("wp-thanks-toggle"); if (wpT) wpT.addEventListener("change", renderWidgetPreview)
```

And at the very end of `loadAppearance()` (after the config-load `try` block that sets the form values), call it once so the preview reflects the loaded config:

```javascript
  renderWidgetPreview()
```

- [ ] **Step 5: Wrap controls + preview in the side-by-side flex container**

To get the wide-screen side-by-side layout, wrap the existing config `<label>`/controls (from the Theme label through the CTA/notify fields, i.e. everything between the embed block and the preview block) plus the preview in a flex container. Add `<div class="wp-config-preview">` opening right after the `wp-embed` block's closing `</div>`, a `<div class="wp-config">` around just the existing form controls, and close both before `<button id="kl-save-appearance">`. Concretely: the structure becomes `wp-embed` → `<div class="wp-config-preview"><div class="wp-config"> …existing controls… </div> <div class="wp-preview">…</div></div>` → Save button. (The `.wp-config-preview` flex rule was added in Step 2.)

- [ ] **Step 6: Verify file parses and preview symbols are present**

Run: `cd prototype && bun -e "const h=await Bun.file('public/dashboard.html').text(); for(const s of ['PREVIEW_THEMES','computePreviewVars','renderWidgetPreview','wp-root','wp-thanks-toggle']) if(!h.includes(s)) throw new Error('missing '+s); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 7: Browser smoke check (manual)**

Start the server (`cd prototype && bun run server.ts`), log in as an admin (`vishal@quantana.com.au`), open Settings → Report widget appearance. Confirm: changing Theme (light→dark→glass→neon→liquid) recolours the preview live; selecting Custom + changing colours updates accent/background live; typing a thank-you message and toggling "Show thank-you" shows it; switching mode to Lead-gen shows the CTA button in the thank-you state. No console errors.

- [ ] **Step 8: Commit**

```bash
git add prototype/public/dashboard.html
git commit -m "feat(settings): live widget preview that re-renders on config change"
```

---

### Task 3: Compact install-the-extension card

**Files:**
- Modify: `prototype/public/dashboard.html` (markup at the bottom of `#kl-appearance`, after the Save button)

**Interfaces:**
- Consumes: existing dashboard card/button CSS classes. No JS.
- Produces: static markup only (no new ids needed).

- [ ] **Step 1: Add the extension card after the appearance save row**

In `prototype/public/dashboard.html`, immediately after `<span id="kl-appearance-msg"></span>` (the end of the save row inside `#kl-appearance`), insert:

```html
        <div class="wp-ext">
          <div class="wp-ext-t">🧩 Install the browser extension</div>
          <p style="font-size:13px;opacity:.8;margin:4px 0 10px">Best for internal QA — your Sims watch your real product through the Klavity browser extension and file what they find.</p>
          <a class="btn btn-indigo" href="/onboarding">Get the extension →</a>
          <p style="font-size:12px;opacity:.65;margin:8px 0 0">Already installed? Open a monitored URL while signed in and it connects automatically.</p>
        </div>
```

- [ ] **Step 2: Add a small separator style for the card**

In the page `<style>`, add:

```css
.wp-ext{margin-top:18px;padding-top:16px;border-top:1px solid var(--line,#e6e6ec)}
.wp-ext-t{font-weight:700;font-size:14px}
```

- [ ] **Step 3: Verify file parses and the card is present**

Run: `cd prototype && bun -e "const h=await Bun.file('public/dashboard.html').text(); if(!h.includes('Install the browser extension')||!h.includes('/onboarding')) throw new Error('missing'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add prototype/public/dashboard.html
git commit -m "feat(settings): compact install-the-extension card in appearance drawer"
```

---

### Task 4: Version lockstep + full test run

**Files:**
- Modify: `CHANGELOG.md`, `docs/PRD.md`, and the 5 manifests (per [[klavity-semver]] — find them: `git grep -l '"version"' -- '*package.json' '*manifest.json'` plus any version string in `docs/PRD.md`).

**Interfaces:**
- Consumes: the completed feature from Tasks 1–3.
- Produces: a single minor version bump applied consistently across all files.

- [ ] **Step 1: Determine current version and next minor**

Run: `grep -m1 '"version"' prototype/package.json; head -20 CHANGELOG.md`
Expected: shows the current version (e.g. `0.39.0`). Next = bump the minor (e.g. `0.40.0`).

- [ ] **Step 2: Bump all manifests + PRD to the next minor**

Edit each of the 5 manifests and `docs/PRD.md` to the new version. Confirm all are consistent:

Run: `git grep -n '0\.39\.0' -- '*.json' 'docs/PRD.md' || echo "none left on old version"`
Expected: after edits, no manifest/PRD still on the old version (only CHANGELOG history may mention it).

- [ ] **Step 3: Add a CHANGELOG entry**

Prepend a new version section to `CHANGELOG.md` describing: "Settings → Report widget appearance now shows the embed code (copy-paste snippet), a live widget preview that re-renders as you change theme/colours/thank-you/mode, and a compact install-the-extension card."

- [ ] **Step 4: Run the full test suite**

Run: `cd /Users/vishalkumar/Downloads/qbug/klav-snap-wt-widgetpreview && pnpm -r test`
Expected: all existing tests pass (this change touches only static dashboard markup/JS, so no test should regress).

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/PRD.md '**/package.json' '**/manifest.json'
git commit -m "chore: bump version for settings widget preview feature"
```

---

## Self-Review

**Spec coverage:**
- Embed code block → Task 1. ✓
- Live preview re-rendering on change (theme/custom colours/thank-you/mode, ported palette) → Task 2. ✓
- Compact install-the-extension card → Task 3. ✓
- Single file, no server changes → Tasks 1–3 all touch only `dashboard.html`. ✓
- Security (textContent for thank-you, color inputs, no echoed user input in snippet) → built into Task 1 (snippet from `embedSnippet`) and Task 2 (Step 3 uses `textContent` for the thank-you message). ✓
- Version lockstep → Task 4. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete; verification commands are concrete.

**Type consistency:** `computePreviewVars`/`renderWidgetPreview`/`PREVIEW_THEMES`/`previewLuminance` names are consistent across Task 2 steps; DOM ids (`wp-root`, `wp-thanks-toggle`, `wp-body`, `wp-thanks`, `wp-thanks-msg`, `wp-cta`, `appearanceSnippet`, `appearanceEmbedCopy`) match between markup and JS steps.
