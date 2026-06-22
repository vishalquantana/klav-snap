# Leadgen Success Screen Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the success screen shown after a bug report in leadgen mode — add a check-circle icon to the headline, proper input focus ring, box-shadows on buttons, gradient CTA, and stagger-in animations.

**Architecture:** Two-file change. `widget-lib.ts` adds the missing `icon('check-circle')` to the leadgen success headline (mirroring what support mode already does). `modal.ts` CSS block gets targeted additions: focus ring for the email input, box-shadow on the lead button and CTA, gradient background on the CTA, hover treatment on the "Powered by Klavity" link, and `kl-rise` stagger animations for all success screen children. No backend, schema, or test logic changes.

**Tech Stack:** TypeScript, CSS-in-JS string in modal.ts (single long style string), Bun test runner

## Global Constraints

- Do NOT bump version, edit CHANGELOG.md, or touch master
- Work only on branch `feat/leadgen-form-polish` in worktree `klav-snap-wt-leadgen-form-polish`
- `bun test` in `prototype/` must stay green (591 tests)
- Button micro-animations for `.klavity-lead button` and `.klavity-cta` already exist in modal.ts lines 158/167-168 — do not duplicate them
- No new dependencies

---

### Task 1: Add check-circle icon to leadgen headline

**Files:**
- Modify: `packages/sdk/src/widget-lib.ts:49`

**Interfaces:**
- Consumes: `icon(name, opts)` from `@klavity/core/icons` (already imported at line 2)
- Produces: updated `headline` string for leadgen mode with inline SVG icon prefix

- [ ] **Step 1: Read the current leadgen headline line**

Read `packages/sdk/src/widget-lib.ts` lines 49-54 to confirm current value before editing.

- [ ] **Step 2: Update the leadgen headline to include the check-circle icon**

In `packages/sdk/src/widget-lib.ts`, change line 50 from:
```ts
    headline: "That's exactly how Klavity works",
```
to:
```ts
    headline: `${icon('check-circle', { label: 'done', size: 20 })} That's exactly how Klavity works`,
```

This mirrors what support mode already does on line 61:
```ts
headline: `Bug filed ${icon('check-circle', { label: 'filed', size: 16 })}`,
```

The icon renders as a `<svg>` string inside `h.innerHTML` in `renderSuccess()` — this is safe because `copy.headline` is static host-supplied copy, not user data (confirmed by the comment at modal.ts:711).

- [ ] **Step 3: Run tests to confirm no breakage**

```bash
cd prototype && bun test 2>&1 | tail -5
```

Expected output:
```
 591 pass
 0 fail
```

---

### Task 2: CSS polish — focus ring, button shadows, CTA gradient, stagger animations

**Files:**
- Modify: `packages/core/src/modal.ts` (CSS string in the `style.textContent` block, lines ~144-153 and ~100-102)

**Interfaces:**
- Consumes: CSS variables `--kl-accent`, `--kl-fg`, `--kl-muted`, `--kl-input-bg`, `--kl-border`, `--kl-on-accent` (all defined via `themeCss(cfg)`)
- Consumes: `kl-rise` keyframe animation (defined at modal.ts:100)
- Produces: updated CSS rules for success screen elements

- [ ] **Step 1: Read the current success screen CSS rules**

Read `packages/core/src/modal.ts` lines 144-153 to see exact current text before editing.

- [ ] **Step 2: Replace `.klavity-success h2` to add flex + larger font**

Find:
```css
    .klavity-success h2{margin:0 0 8px;font-size:18px;color:var(--kl-fg);}
```
Replace with:
```css
    .klavity-success h2{margin:0 0 8px;font-size:20px;color:var(--kl-fg);display:flex;align-items:center;gap:8px;line-height:1.2;}
```

- [ ] **Step 3: Add `.klavity-lead input:focus` rule after the existing `.klavity-lead input` rule**

Find the line:
```css
    .klavity-lead input{flex:1;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:8px;padding:9px 10px;font-size:14px;box-sizing:border-box;}
```
Replace with:
```css
    .klavity-lead input{flex:1;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:8px;padding:9px 10px;font-size:14px;box-sizing:border-box;}
    .klavity-lead input:focus{outline:none;border-color:var(--kl-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--kl-accent) 20%,transparent);}
```

- [ ] **Step 4: Update `.klavity-lead button` to add box-shadow and matching border-radius**

Find:
```css
    .klavity-lead button{min-height:40px;padding:9px 14px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;}
```
Replace with:
```css
    .klavity-lead button{min-height:40px;padding:9px 14px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px color-mix(in srgb,var(--kl-accent) 30%,transparent);}
```

- [ ] **Step 5: Update `.klavity-cta` to use gradient background and box-shadow**

Find:
```css
    .klavity-cta{display:inline-block;padding:10px 16px;background:var(--kl-accent);color:var(--kl-on-accent);border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:12px;}
```
Replace with:
```css
    .klavity-cta{display:inline-block;padding:10px 16px;background:linear-gradient(135deg,var(--kl-accent),color-mix(in srgb,var(--kl-accent) 70%,#8b5cf6));color:var(--kl-on-accent);border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:12px;box-shadow:0 4px 14px color-mix(in srgb,var(--kl-accent) 35%,transparent);}
```

- [ ] **Step 6: Add hover treatment to `.klavity-pb a`**

Find:
```css
    .klavity-pb a{color:var(--kl-muted);text-decoration:none;}
```
Replace with:
```css
    .klavity-pb a{color:var(--kl-muted);text-decoration:none;transition:color .15s ease;}
    .klavity-pb a:hover{color:var(--kl-accent);}
```

- [ ] **Step 7: Add stagger `kl-rise` animations for success screen children**

After the existing line:
```css
    .klavity-success p{margin:0 0 16px;font-size:14px;color:var(--kl-muted);line-height:1.4;}
```
Add (on the next line):
```css
    .klavity-success>h2{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .05s both;}.klavity-success>p{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .12s both;}.klavity-lead,.klavity-thanks{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .18s both;}.klavity-success>.klavity-cta{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .24s both;}
```

Note: `.klavity-pb` is a direct child of `.klavity-modal`, not `.klavity-success`, so it already gets the modal-level `kl-rise` animation. No additional rule needed for it.

- [ ] **Step 8: Run tests to confirm all 591 tests still pass**

```bash
cd prototype && bun test 2>&1 | tail -5
```

Expected:
```
 591 pass
 0 fail
```

- [ ] **Step 9: Commit both files together**

```bash
git add packages/sdk/src/widget-lib.ts packages/core/src/modal.ts docs/superpowers/specs/2026-06-23-leadgen-success-screen-polish-design.md docs/superpowers/plans/2026-06-23-leadgen-success-screen-polish.md
git commit -m "$(cat <<'EOF'
feat(widget): polish leadgen success screen to match Klavity brand

Add check-circle icon to leadgen headline (support mode already had it);
input focus ring with accent glow; box-shadow on lead button and CTA;
purple gradient CTA background; kl-rise stagger animations on success
children; accent hover on Powered-by-Klavity link. CSS-only except for
the one-line icon addition in widget-lib.ts. 591 tests pass.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

- [ ] **Step 10: Rebase on latest master and re-verify tests**

```bash
git fetch origin master && git rebase origin/master
cd prototype && bun test 2>&1 | tail -5
```

Expected: `591 pass, 0 fail`
