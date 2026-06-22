# Leadgen Success Screen Polish

**Date:** 2026-06-23  
**Scope:** Success screen only (`.klavity-success` + `.klavity-lead`) — not the report form modal  
**Files:** `packages/core/src/modal.ts`, `packages/sdk/src/widget-lib.ts`

## Problem

The success screen shown after a bug report in leadgen mode is visually plain:
- No celebration icon — the headline is bare text (support mode has `check-circle`; leadgen doesn't)
- Email input has no visible focus ring
- Lead button and CTA are flat — no box-shadow, no gradient
- Success children have no entrance animation stagger
- "Powered by Klavity" link has no hover treatment

## Design

### 1. Add check-circle icon to leadgen headline (`widget-lib.ts`)

Change:
```ts
headline: "That's exactly how Klavity works"
```
To:
```ts
headline: `${icon('check-circle', { label: 'done', size: 20 })} That's exactly how Klavity works`
```
Matches the pattern already used in support mode. The icon renders as an inline SVG inside `h.innerHTML` (safe — static host copy, not user data).

### 2. CSS changes (`modal.ts` style block)

**`.klavity-success h2`** — bump font-size 18px → 20px, tighter margin, flex layout for icon alignment:
```css
.klavity-success h2{margin:0 0 8px;font-size:20px;color:var(--kl-fg);display:flex;align-items:center;gap:8px;line-height:1.2;}
```

**`.klavity-lead input` focus ring** — accent border + soft glow:
```css
.klavity-lead input:focus{outline:none;border-color:var(--kl-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--kl-accent) 20%,transparent);}
```

**`.klavity-lead button`** — box-shadow at rest, border-radius matches submit (10px):
```css
.klavity-lead button{…border-radius:10px;box-shadow:0 2px 8px color-mix(in srgb,var(--kl-accent) 30%,transparent);}
```

**`.klavity-cta`** — gradient bg + box-shadow at rest:
```css
.klavity-cta{…background:linear-gradient(135deg,var(--kl-accent),color-mix(in srgb,var(--kl-accent) 70%,#8b5cf6));box-shadow:0 4px 14px color-mix(in srgb,var(--kl-accent) 35%,transparent);}
```

**`.klavity-pb a:hover`** — accent color on hover:
```css
.klavity-pb a:hover{color:var(--kl-accent);}
```

**Stagger `kl-rise` on success children** — headline, body, lead row, cta, pb fade in sequentially:
```css
.klavity-success>h2{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .05s both;}
.klavity-success>p{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .12s both;}
.klavity-lead,.klavity-thanks{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .18s both;}
.klavity-cta{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .24s both;}
.klavity-pb{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .28s both;}
```

### 3. No changes needed

- Button micro-animations for `.klavity-lead button` and `.klavity-cta` already exist (lines 158, 167–168)
- Backend, tests, schema — untouched

## Testing

- `bun test` in `prototype/` must stay green (no backend/logic changes)
- Visual check: open `packages/core/demo/popup-themes.html` or the live site in leadgen mode
