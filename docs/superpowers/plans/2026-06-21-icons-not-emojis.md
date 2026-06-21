# Icons, not emojis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every emoji in user-facing UI with inline Lucide outline SVG icons drawn from one centralized, dependency-free icon module, and add a CI guard that keeps emoji out of the UI going forward.

**Architecture:** A generator (`scripts/gen-icons.mjs`) reads the icons we use from the dev-only `lucide-static` package and emits two artifacts: a TypeScript map for app/widget/extension code (`packages/core/src/icons.generated.ts`) and a browser map for the static marketing site (`site/icons.generated.js`). Hand-written wrappers (`packages/core/src/icons.ts` `icon()` and `site/kit.js` `Klav.icon()`) turn a name into an `<svg>` string with a consistent wrapper. A guard script (`scripts/check-no-emoji.mjs`) fails CI on any emoji in in-scope source.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Vite (sdk/extension build), Bun (prototype server), `lucide-static` (devDependency only), GitHub Actions (`ci.yml`).

## Global Constraints

- **Icon source of truth:** all icons come from `lucide-static`; never hand-author SVG path data. `lucide-static` is a **devDependency only** — the shipped bundles must contain only the generated string literals (no runtime import of any icon library). [spec: Approach A; widget zero-dep]
- **Wrapper attrs (exact):** `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"`. Default size 18px. [spec §1]
- **Accessibility:** decorative icon → `aria-hidden="true"`; semantic icon (mood/status/icon-only button) → `role="img"` + nested `<title>`. [spec §Accessibility]
- **In scope:** `site/**`, `prototype/public/**`, `packages/{core,sdk,extension}/src/**`. **Out of scope (emoji allowed):** `CHANGELOG.md`, `README.md`, `docs/**`, commit messages, `dna-logo-*.html`, `prototype/**` except `prototype/public/**`. [spec §Standard]
- **SemVer lockstep:** on the version bump, update `CHANGELOG.md` + `docs/PRD.md` + all manifests together. [memory: Klavity SemVer]
- **Git hygiene:** never `git add -A`; stage explicit paths only. [memory: concurrent session collisions]
- **Canonical mapping table** (extend as new emoji are found during a phase; this table is the record):

  | Emoji | Meaning | Lucide name | Semantic? |
  |---|---|---|---|
  | 📝 | extract / notes | `file-text` | no |
  | 📋 | view submissions | `clipboard-list` | no |
  | 🧬 | review / analyze | `dna` | no |
  | 🐛 | file bug | `bug` | no |
  | 🔎 | inspect | `search` | no |
  | ⚡ | report a bug | `zap` | no |
  | 💡 | request a feature | `lightbulb` | no |
  | 🌙 | dark theme | `moon` | yes (button) |
  | ☀️ | light theme | `sun` | yes (button) |
  | 👆 | pointer/hand | `mouse-pointer-2` | no |
  | 👀 | watching/review | `eye` | no |
  | 😍 | mood: love | `heart` | yes |
  | 🤔 | mood: neutral | `meh` | yes |
  | 😤 | mood: frustrated | `angry` | yes |
  | 😕 | mood: confused | `frown` | yes |
  | ✓ ✅ | status ok | `check-circle` | yes |
  | ❌ | status fail | `x-circle` | yes |

---

## Phase 1 — Foundation

### Task 1: Icon generator + generated maps

**Files:**
- Modify: `packages/core/package.json` (add `lucide-static` devDep + `gen:icons` script + `./icons` export)
- Create: `scripts/icon-names.mjs`
- Create: `scripts/gen-icons.mjs`
- Create (generated, committed): `packages/core/src/icons.generated.ts`, `site/icons.generated.js`
- Test: `scripts/gen-icons.test.mjs` (run with vitest from core, or node)

**Interfaces:**
- Produces: `ICONS: Record<string,string>` (name → inner SVG markup) in `icons.generated.ts`; `window.KLAV_ICONS` (same map) in `icons.generated.js`. `ICON_NAMES` array exported from `scripts/icon-names.mjs`.

- [ ] **Step 1: Add the icon-name list**

```js
// scripts/icon-names.mjs
// The complete set of Lucide icons the UI uses. Add a name here, then `pnpm gen:icons`.
export const ICON_NAMES = [
  'file-text', 'clipboard-list', 'dna', 'bug', 'search', 'zap', 'lightbulb',
  'moon', 'sun', 'mouse-pointer-2', 'eye',
  'heart', 'meh', 'angry', 'frown',
  'check', 'check-circle', 'x', 'x-circle',
];
```

- [ ] **Step 2: Add `lucide-static` devDep + scripts + export**

In `packages/core/package.json`: add to `devDependencies` `"lucide-static": "^0.544.0"`; add to `scripts` `"gen:icons": "node ../../scripts/gen-icons.mjs"`; add to `exports` `"./icons": "./src/icons.ts"`. Then from repo root: `pnpm install`.

- [ ] **Step 3: Write the generator**

```js
// scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ICON_NAMES } from './icon-names.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lucideDir = join(root, 'node_modules', 'lucide-static', 'icons');

// Pull the inner markup (everything between <svg ...> and </svg>) verbatim from lucide-static.
function inner(name) {
  const svg = readFileSync(join(lucideDir, `${name}.svg`), 'utf8');
  const m = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  if (!m) throw new Error(`Cannot parse lucide icon: ${name}`);
  return m[1].replace(/\s+/g, ' ').trim();
}

const entries = ICON_NAMES.map((n) => [n, inner(n)]);
const map = Object.fromEntries(entries);

const banner = '// AUTO-GENERATED by scripts/gen-icons.mjs — do not edit. Run `pnpm gen:icons`.\n';
writeFileSync(
  join(root, 'packages', 'core', 'src', 'icons.generated.ts'),
  banner + 'export const ICONS = ' + JSON.stringify(map, null, 2) + ' as const;\n',
);
writeFileSync(
  join(root, 'site', 'icons.generated.js'),
  banner + 'window.KLAV_ICONS = ' + JSON.stringify(map, null, 2) + ';\n',
);
console.log(`Generated ${ICON_NAMES.length} icons.`);
```

- [ ] **Step 4: Generate**

Run: `pnpm --filter @klavity/core gen:icons`
Expected: `Generated 19 icons.` and both generated files exist.

- [ ] **Step 5: Write the generator test**

```js
// scripts/gen-icons.test.mjs
import { test, expect } from 'vitest';
import { ICONS } from '../packages/core/src/icons.generated.ts';

test('every requested icon is generated and non-empty', () => {
  for (const name of ['search', 'bug', 'dna', 'heart', 'x-circle']) {
    expect(ICONS[name]).toBeTruthy();
  }
});

test('search icon contains a circle (sanity vs lucide source)', () => {
  expect(ICONS['search']).toContain('<circle');
});
```

- [ ] **Step 6: Run test**

Run: `cd packages/core && pnpm vitest run ../../scripts/gen-icons.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add scripts/icon-names.mjs scripts/gen-icons.mjs scripts/gen-icons.test.mjs packages/core/package.json packages/core/src/icons.generated.ts site/icons.generated.js pnpm-lock.yaml
git commit -m "feat(icons): generate Lucide icon maps from lucide-static"
```

### Task 2: Core `icon()` helper

**Files:**
- Create: `packages/core/src/icons.ts`
- Test: `packages/core/src/icons.test.ts`

**Interfaces:**
- Consumes: `ICONS` from `./icons.generated`.
- Produces: `export type IconName`; `export function icon(name: IconName, opts?: { size?: number; label?: string; class?: string }): string`; re-exports `ICONS`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/icons.test.ts
import { describe, it, expect } from 'vitest';
import { icon } from './icons';

describe('icon()', () => {
  it('emits an svg with the standard wrapper attrs', () => {
    const s = icon('search');
    expect(s).toContain('stroke="currentColor"');
    expect(s).toContain('viewBox="0 0 24 24"');
    expect(s).toContain('class="icon"');
    expect(s).toContain('width="18"');
  });
  it('decorative by default (aria-hidden, no role)', () => {
    const s = icon('bug');
    expect(s).toContain('aria-hidden="true"');
    expect(s).not.toContain('role="img"');
  });
  it('semantic when given a label (role + title, no aria-hidden)', () => {
    const s = icon('heart', { label: 'Loved it' });
    expect(s).toContain('role="img"');
    expect(s).toContain('<title>Loved it</title>');
    expect(s).not.toContain('aria-hidden');
  });
  it('honors size and extra class', () => {
    const s = icon('zap', { size: 24, class: 'big' });
    expect(s).toContain('width="24"');
    expect(s).toContain('class="icon big"');
  });
  it('throws on unknown name', () => {
    // @ts-expect-error invalid name
    expect(() => icon('not-a-real-icon')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @klavity/core test`
Expected: FAIL ("Cannot find module './icons'").

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/icons.ts
import { ICONS } from './icons.generated';

export type IconName = keyof typeof ICONS;

export interface IconOpts {
  size?: number;
  /** When set, the icon is semantic: gets role="img" + <title>. Otherwise decorative (aria-hidden). */
  label?: string;
  class?: string;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function icon(name: IconName, opts: IconOpts = {}): string {
  const body = ICONS[name];
  if (!body) throw new Error(`Unknown icon: ${String(name)}`);
  const size = opts.size ?? 18;
  const cls = opts.class ? `icon ${opts.class}` : 'icon';
  const a11y = opts.label
    ? `role="img"`
    : `aria-hidden="true"`;
  const title = opts.label ? `<title>${escapeAttr(opts.label)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${title}${body}</svg>`;
}

export { ICONS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @klavity/core test`
Expected: PASS (all `icon()` cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/icons.ts packages/core/src/icons.test.ts
git commit -m "feat(icons): add icon() helper in @klavity/core"
```

### Task 3: Static-site `Klav.icon()` + CSS

**Files:**
- Modify: `site/kit.js` (add `Klav.icon`)
- Modify: `site/kit.css` (add `.icon` rules)
- Test: `site/kit.icon.test.mjs` (jsdom via vitest)

**Interfaces:**
- Consumes: `window.KLAV_ICONS` (loaded via `<script src="/icons.generated.js">`).
- Produces: `window.Klav.icon(name, opts)` with the same signature/output shape as core `icon()`.

- [ ] **Step 1: Write the failing test**

```js
// site/kit.icon.test.mjs
import { test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  // load generated map + kit.js into the jsdom global
  global.window = global;
  new Function(readFileSync(join(dir, 'icons.generated.js'), 'utf8'))();
  new Function(readFileSync(join(dir, 'kit.js'), 'utf8'))();
});

test('Klav.icon emits svg with currentColor', () => {
  const s = window.Klav.icon('search');
  expect(s).toContain('stroke="currentColor"');
  expect(s).toContain('class="icon"');
});
test('Klav.icon label makes it semantic', () => {
  const s = window.Klav.icon('heart', { label: 'Loved it' });
  expect(s).toContain('<title>Loved it</title>');
});
```

(If `kit.js` is not wrapped to expose `window.Klav`, adapt the loader to match its actual export shape — inspect `site/kit.js` first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npx vitest run kit.icon.test.mjs --environment jsdom`
Expected: FAIL (`Klav.icon is not a function`).

- [ ] **Step 3: Implement `Klav.icon` in `site/kit.js`**

Add (mirroring core `icon()` exactly, reading from `window.KLAV_ICONS`):

```js
// --- icons (mirror of @klavity/core icon()) ---
(function (K) {
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  K.icon = function (name, opts) {
    opts = opts || {};
    var body = (window.KLAV_ICONS || {})[name];
    if (!body) throw new Error('Unknown icon: ' + name);
    var size = opts.size || 18;
    var cls = opts.class ? 'icon ' + opts.class : 'icon';
    var a11y = opts.label ? 'role="img"' : 'aria-hidden="true"';
    var title = opts.label ? '<title>' + esc(opts.label) + '</title>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" class="' + cls + '" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      a11y + '>' + title + body + '</svg>';
  };
})(window.Klav = window.Klav || {});
```

- [ ] **Step 4: Add `.icon` CSS to `site/kit.css`**

```css
.icon { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; flex: none; stroke: currentColor; }
.icon[width] { width: auto; height: auto; } /* honor explicit px size from icon() */
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd site && npx vitest run kit.icon.test.mjs --environment jsdom`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add site/kit.js site/kit.css site/kit.icon.test.mjs
git commit -m "feat(icons): add Klav.icon helper + .icon styles for static site"
```

### Task 4: Emoji guard + CI wiring (report-only)

**Files:**
- Create: `scripts/check-no-emoji.mjs`
- Create: `scripts/fixtures/clean.txt`, `scripts/fixtures/dirty.txt`
- Create: `scripts/check-no-emoji.test.mjs`
- Modify: root `package.json` (add `check:emoji` script)
- Modify: `.github/workflows/ci.yml` (add guard step)

**Interfaces:**
- Produces: CLI `node scripts/check-no-emoji.mjs` — exits 0 if clean, 1 with `file:line` list otherwise. Accepts `--report` to always exit 0 (report-only mode for phased rollout).

- [ ] **Step 1: Write the guard**

```js
// scripts/check-no-emoji.mjs
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const GLOBS = ['site', 'prototype/public', 'packages/core/src', 'packages/sdk/src', 'packages/extension/src'];
const EXCLUDE = /(icons\.generated\.(ts|js)|\.test\.|\.snap$)/; // generated maps + tests excluded
// NOTE: deliberately excludes U+2190–21FF (basic arrows) — that range contains
// legitimate keycap glyphs like ⇧ (U+21E7) used in keyboard shortcuts (⌘⇧K).
// Emoji arrows (➡ U+27A1, ⬅⬆⬇ U+2B05–07) are covered by the ranges below.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const reportOnly = process.argv.includes('--report');

const files = execSync(`git ls-files ${GLOBS.join(' ')}`, { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !EXCLUDE.test(f));

const hits = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('emoji-ok')) return; // explicit allow
    if (EMOJI.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
  });
}

if (hits.length) {
  console.error(`Found ${hits.length} emoji in user-facing source:`);
  hits.forEach((h) => console.error('  ' + h));
  console.error('\nUse @klavity/core icon() / Klav.icon() instead. Add `emoji-ok` on the line to allow.');
  if (!reportOnly) process.exit(1);
} else {
  console.log('No emoji in user-facing source.');
}
```

- [ ] **Step 2: Add fixtures + test**

```
// scripts/fixtures/clean.txt
just plain text with a check icon reference
```
```
// scripts/fixtures/dirty.txt
this line has an emoji 🐛 in it
```
```js
// scripts/check-no-emoji.test.mjs
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
test('regex flags dirty fixture', () => {
  expect(EMOJI.test(readFileSync('scripts/fixtures/dirty.txt', 'utf8'))).toBe(true);
});
test('regex passes clean fixture', () => {
  expect(EMOJI.test(readFileSync('scripts/fixtures/clean.txt', 'utf8'))).toBe(false);
});
```

- [ ] **Step 3: Run test**

Run: `cd packages/core && pnpm vitest run ../../scripts/check-no-emoji.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 4: Add root script + run report-only**

In root `package.json` `scripts`: `"check:emoji": "node scripts/check-no-emoji.mjs"`. Run: `node scripts/check-no-emoji.mjs --report`
Expected: prints the current emoji inventory (many hits) but exits 0.

- [ ] **Step 5: Wire CI (report-only for now)**

In `.github/workflows/ci.yml`, in `build-test` job after "Install", add:

```yaml
      - name: Emoji guard (report-only until conversion completes)
        run: node scripts/check-no-emoji.mjs --report
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-no-emoji.mjs scripts/check-no-emoji.test.mjs scripts/fixtures/clean.txt scripts/fixtures/dirty.txt package.json .github/workflows/ci.yml
git commit -m "feat(icons): add emoji guard (report-only) + CI step"
```

---

## Phase 2 — Marketing site (`site/*.html`)

### Task 5: Convert all emoji in the marketing site

**Files:**
- Modify: every `site/*.html` containing emoji (per `git ls-files site/*.html`; known: `index.html`, `snap.html`, `sims.html`, `autosim.html`, `onboarding.html`, `intro-reel.html`, `blog/index.html`, and one blog post). Add `<script src="/icons.generated.js"></script>` before `kit.js` in each page that uses dynamic `Klav.icon`.
- Test: the emoji guard, scoped to `site`.

**Conversion recipe (apply uniformly):**
- **Static markup** (emoji baked in HTML, e.g. `index.html:673 <span class="ic">📝</span>`): replace the emoji character with the inline SVG. Get it once via `node -e "import('./packages/core/src/icons.ts').then(m=>console.log(m.icon('file-text')))"` or paste from `site/icons.generated.js`. Keep the surrounding `<span class="ic">` wrapper so existing CSS sizing still applies. Example:
  - Before: `<span class="ic">📝</span><span class="num">01 / EXTRACT</span>`
  - After: `<span class="ic">${icon file-text svg}</span><span class="num">01 / EXTRACT</span>`
- **Dynamic JS** (e.g. `index.html:823 MOODS = { love:'😍', ... }`, `:918 '👀 Let the Sims...'`): replace the emoji string with `Klav.icon(name, {label})` — moods are semantic so pass a label:
  - `const MOODS = { love: Klav.icon('heart',{label:'Love'}), neutral: Klav.icon('meh',{label:'Neutral'}), frustrated: Klav.icon('angry',{label:'Frustrated'}), confused: Klav.icon('frown',{label:'Confused'}) };`
  - tour toggle `👀 Let the Sims review this page` → `` `${Klav.icon('eye')} Let the Sims review this page` ``
  - theme toggle (`:434` button text `🌙`, `:792` `paint()` sets `☀️`/`🌙`): set `b.innerHTML = Klav.icon(dark()?'sun':'moon', {label: dark()?'Switch to light':'Switch to dark'})`.
- **Checklist ticks** (`index.html:732-737 <span class="ck">✓</span>`): the `✓` is U+2713 (in the arrow/dingbat range the guard catches). Replace with `<span class="ck">${icon check svg}</span>`.
- **`sm-item` menu rows** (`:745-749 🔎/⚡/💡/🧬/📋`): replace each leading emoji with the matching inline SVG; keep the `&nbsp;` spacing.

- [ ] **Step 1: Inventory the site**

Run: `git grep -nP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' -- 'site/*.html' 'site/blog/*.html'`
Expected: the working list of every line to convert.

- [ ] **Step 2: Add the generated-icons script tag**

In each page that calls `Klav.icon` at runtime, add `<script src="/icons.generated.js"></script>` immediately before the existing `kit.js` include. (For `prototype` serving, confirm `/icons.generated.js` is served — see Task 8 note; `site/` is static-root so it is served directly.)

- [ ] **Step 3: Apply the conversion recipe** to every line from Step 1, page by page, using the mapping table in Global Constraints.

- [ ] **Step 4: Verify guard clean for site**

Run: `git ls-files site | grep -v icons.generated | xargs node -e "/* quick scoped check */ const{readFileSync}=require('fs');const re=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;let bad=0;for(const f of process.argv.slice(1)){if(re.test(readFileSync(f,'utf8'))){console.log('EMOJI:',f);bad++}}process.exit(bad?1:0)"`
Expected: no `EMOJI:` lines, exit 0.

- [ ] **Step 5: Visual spot-check**

Run the site locally (`cd prototype && bun run server.ts`), open `/`, `/snap`, `/sims`, `/autosim`, `/onboarding`. Confirm: feature icons render, mood widget shows icons, theme toggle swaps sun/moon, no missing/oversized glyphs. (Use the `run` skill if available.)

- [ ] **Step 6: Commit**

```bash
git add site/*.html site/blog/*.html
git commit -m "feat(icons): convert marketing site emoji to Lucide icons"
```

---

## Phase 3 — Widget / SDK + shared modal

### Task 6: Convert `packages/sdk/src/**` and `packages/core/src/modal.ts`

**Files:**
- Modify: `packages/sdk/src/widget-lib.ts` (`:57 "Bug filed ✓"` and any others), `packages/sdk/src/widget.ts`, `packages/sdk/src/index.ts`
- Modify: `packages/core/src/modal.ts` (shared by widget + extension)
- Test: emoji guard scoped to these dirs; `pnpm --filter @klavity/sdk build`

**Interfaces:**
- Consumes: `icon` from `@klavity/core/icons` (added in Task 1 exports).

- [ ] **Step 1: Inventory**

Run: `git grep -nP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' -- packages/sdk/src packages/core/src/modal.ts`
Expected: the lines to convert (incl. `widget-lib.ts:57`).

- [ ] **Step 2: Import the helper** where needed: `import { icon } from '@klavity/core/icons';`

- [ ] **Step 3: Convert each occurrence** per the mapping table. For status text like `"Bug filed ✓"` → `` `Bug filed ${icon('check-circle', { label: 'filed' })}` `` (semantic). Decorative inline glyphs → `icon(name)`.

- [ ] **Step 4: Build the widget**

Run: `pnpm --filter @klavity/sdk build`
Expected: both vite builds succeed (`vite build` + `vite build --config vite.widget.config.ts`); no missing-export errors.

- [ ] **Step 5: Confirm zero runtime icon dep**

Run: `grep -R "lucide" packages/sdk/dist || echo "clean: no lucide in bundle"`
Expected: `clean: no lucide in bundle` (only inlined string literals shipped).

- [ ] **Step 6: Guard + commit**

```bash
node scripts/check-no-emoji.mjs --report   # sdk/core lines should now be gone from the report
git add packages/sdk/src packages/core/src/modal.ts
git commit -m "feat(icons): convert widget/SDK + shared modal emoji to icons"
```

---

## Phase 4 — Extension + dashboard, then enforce

### Task 7: Convert extension + `prototype/public/**`

**Files:**
- Modify: `packages/extension/src/**` emoji users (`popup.html`, `popup.ts`, `options.html`, `options.ts`, `content.ts`, etc.)
- Modify: `prototype/public/**` (`dashboard.html`, `login.html`, `snap-popup.html`, `sim-studio-*.html`, `index.html`, `widget-connect.html`)
- Test: emoji guard scoped to these dirs; extension build

**Interfaces:**
- Consumes: `icon` from `@klavity/core/icons` in extension TS; inline SVG (from `site/icons.generated.js` map, or a copied `prototype/public/icons.generated.js`) in `prototype/public` HTML.

- [ ] **Step 1: Inventory**

Run: `git grep -nP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' -- packages/extension/src prototype/public`

- [ ] **Step 2: Make the icon map available to `prototype/public`**

Add `gen-icons.mjs` a third output `prototype/public/icons.generated.js` (copy of the site map), or symlink/serve `site/icons.generated.js`. Update `scripts/gen-icons.mjs` to also write `prototype/public/icons.generated.js`, then `pnpm --filter @klavity/core gen:icons`. Include `<script src="/icons.generated.js">` + a `Klav.icon`-equivalent (reuse `kit.js` if loaded there; otherwise inline a minimal `icon()` in the page).

- [ ] **Step 3: Convert** extension TS via `icon()` and `prototype/public` HTML via inline SVG, per mapping table.

- [ ] **Step 4: Build extension**

Run: `pnpm --filter <extension package name> build` (confirm exact name from `packages/extension/package.json`)
Expected: build succeeds.

- [ ] **Step 5: Full guard (strict)**

Run: `node scripts/check-no-emoji.mjs`
Expected: `No emoji in user-facing source.` exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src prototype/public scripts/gen-icons.mjs
git commit -m "feat(icons): convert extension + dashboard emoji to icons"
```

### Task 8: Flip the guard to enforcing + version bump

**Files:**
- Modify: `.github/workflows/ci.yml` (drop `--report`)
- Modify: `CHANGELOG.md`, `docs/PRD.md`, all manifests (`packages/extension` manifest + the 5 manifests per SemVer memory)

- [ ] **Step 1: Enforce the guard**

In `ci.yml` change the guard step command to `node scripts/check-no-emoji.mjs` (no `--report`) and rename it `Emoji guard`.

- [ ] **Step 2: Full build + test**

Run: `pnpm install --frozen-lockfile && pnpm -r build && pnpm -r test && node scripts/check-no-emoji.mjs`
Expected: all green; guard exits 0.

- [ ] **Step 3: Version bump (lockstep)**

Bump version (e.g. `0.39.4` → `0.40.0`) in `package.json` files + all manifests; add a CHANGELOG entry ("Icons standard: replaced all UI emoji with inline Lucide SVG icons; added CI emoji guard"); note in `docs/PRD.md`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml CHANGELOG.md docs/PRD.md <manifest paths> <package.json paths>
git commit -m "feat(icons): enforce emoji guard + bump to v0.40.0"
```

---

## Self-Review

- **Spec coverage:** standard rule → Task 4/8 guard + this doc; centralized module → Task 1–2; static-site helper → Task 3; mapping table → Global Constraints; accessibility → Task 2 `label` path + recipe; CI guard report→enforce → Task 4 then Task 8; phases P1–P4 → Tasks 1–8; semantic emoji conversion → mapping table + Tasks 5/6/7; zero-dep widget → Global Constraint + Task 6 Step 5. No gaps.
- **Placeholder scan:** the only deferred specifics are per-line conversions in Tasks 5/7, which are covered by an explicit recipe + mapping table + inventory command (mechanical sweep, not a placeholder). Extension package name flagged to confirm at Task 7/8.
- **Type consistency:** `icon(name, opts)` signature identical in core (Task 2) and `Klav.icon` (Task 3); `ICONS`/`ICON_NAMES`/`window.KLAV_ICONS` names consistent across Tasks 1–3; guard `--report` flag consistent Task 4 → Task 8.
