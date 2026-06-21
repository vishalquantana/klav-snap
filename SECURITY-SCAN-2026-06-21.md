# Klavity Snap — SAST + SCA Self-Scan

**Date:** 2026-06-21 · **Repo:** `klav-snap` v0.37.1 · **Scope:** `prototype/` (Cloud backend ~19k LOC), `packages/{core,extension,sdk}`, `site/`, `deploy/`
**Tools:** Semgrep 1.167.0 (SAST, 449 rules, public `semgrep-rules` run fully offline), `pnpm audit` (SCA — project uses pnpm, `npm audit` equivalent), `pip-audit` (N/A — no Python in repo).
**Standards:** OWASP Top 10:2025 + OWASP ASVS (output-encoding / dependency / integrity controls).

> Privacy note: `--config=auto` and the Semgrep registry packs require metrics-on or login (they upload finding metadata). To keep your source private, I cloned the **public** `semgrep/semgrep-rules` and ran everything locally — no code or finding data left this machine.

---

## Executive summary

| Severity | Count | Notes |
|----------|------:|-------|
| Critical | 1 | SCA only (dev-dependency: vitest UI RCE) |
| High | 1 | SCA only (dev-dependency: vite fs.deny bypass) |
| Medium | 1 | SAST: DOM-XSS via unescaped AI/server Sim fields in the extension |
| Low | 2 | SAST: missing SRI on `site/` scripts; dynamic RegExp (ReDoS-ish) |
| Info / false-positive | ~237 | Logging template-strings, demo-HTML noise, gitignored `.env` secrets |

**Headline:** the backend itself is in good shape — parameterized queries throughout (`{sql, args:[]}`), generic error responses with correlation IDs, SSRF/ratelimit/auth modules present. The **one real code finding** is inconsistent output-encoding in the browser-extension content script: AI-generated Sim-review fields are written to `innerHTML` raw in one renderer while the canonical renderer escapes them. All SCA findings are in the **dev/test toolchain**, not the shipped product.

---

## SCA — Dependency vulnerabilities (`pnpm audit`)

5 advisories, **all in devDependencies** (build/test toolchain: `esbuild`, `vite`, `vitest`). The deployed product is `bun run server.ts` + pre-bundled `dist/`, so these do **not** reach production runtime — but they expose the **developer machine / CI** when the dev or test server is running.

| Pkg | Installed | Sev | Advisory | Patched | OWASP |
|-----|-----------|-----|----------|---------|-------|
| vitest | <3.2.6 | **Critical** | UI server → arbitrary file read + execute ([GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp)) | ≥3.2.6 | A03 |
| vite | ≤6.4.2 | **High** | `server.fs.deny` bypass via Windows alternate paths ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)) | ≥6.4.3 | A03 |
| esbuild | ≤0.24.2 | Moderate | Dev server accepts any-origin requests & returns responses ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)) | ≥0.24.3 | A03/A02 |
| vite | ≤6.4.1 | Moderate | Path traversal in optimized-deps `.map` handling ([GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9)) | ≥6.4.2 | A03 |
| vite | ≤6.4.2 | Moderate | launch-editor NTLMv2 hash disclosure (Windows UNC) ([GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)) | ≥6.4.3 | A03 |

**OWASP Top 10:2025 → A03 Software Supply Chain Failures.**
**ASVS → Dependency Management** (4.0.3 V14.2.1/.4 "components up to date, no known vulns"; ASVS 5.0 configuration chapter). Level 1.

**Fix (single bump clears all 5):**
```bash
pnpm up -r vitest@latest vite@latest esbuild@latest
pnpm audit   # expect: 0 vulnerabilities
```

---

## SAST — Code findings (Semgrep)

### 🟠 MEDIUM — DOM XSS via unescaped AI/server Sim fields (extension content script)
**File:** `packages/extension/src/content.ts:578-597` (`klavRenderBubble`), reached from `:712` and `:857` with data from `POST /api/sim/review` (`body.reviews[].reactions[]`).

The Sim-reaction object (`r`) is **LLM-generated** server output. Most fields are concatenated into `innerHTML` with **no escaping**:
- `:585` `r.citation.sourceQuote`, `r.citation.speaker` — raw
- `:586` `r.severity` — raw
- `:594-595` `r.accent` → injected into `style="background:${r.accent}"` (attribute-injection vector), `r.initials`, `r.simName` — raw
- `:597` `r.observation` — **only** `<` escaped (incomplete: `&`, `"`, `>` not handled)

The canonical renderer `prototype/public/klavity-sim.js` (`renderSimHTML`/`y()`) **does** escape every field via `b()`. So the project already has the correct pattern — `content.ts` just doesn't use it. Because `citation.sourceQuote` is a verbatim quote lifted from page content, **attacker-controlled page text → LLM output → `innerHTML`** is a realistic indirect-injection-to-XSS chain. `klavNotice` (`:745`) is the same class (server `text` → `innerHTML`).

- **OWASP Top 10:2025 → A05 Injection** (DOM XSS); **LLM05 Improper Output Handling** (LLM output reaches a DOM sink unsanitized), chained from **LLM01 Prompt Injection**.
- **ASVS → Output Encoding & Injection Prevention** (4.0.3 V5.3.3 context-aware output encoding; 5.0 V1 Encoding & Sanitization). Level 1.
- **Fix:** route every field through an HTML-escape helper (reuse `b()` from `klavity-sim.js`, or set `.textContent` for text nodes). Validate `r.accent` against a color allowlist/regex before placing it in `style`.

### 🟡 LOW — Missing Subresource Integrity (SRI) on `site/` scripts
**12 instances:** `site/index.html:9,928`, `snap.html:10,317`, `sims.html:12,326`, `autosim.html:10,328`, `privacy.html:118`, `terms.html:93`, `blog/index.html:5`, `blog/*.html:5`.
`<script>`/`<link>` tags without an `integrity`/`crossorigin` attribute. Risk is meaningful only for **third-party/CDN** origins (a compromised CDN can serve malicious JS); first-party same-origin assets are low-risk.
- **OWASP Top 10:2025 → A08 Software & Data Integrity Failures.** **ASVS → V14.2.6 / 5.0 frontend SRI.** Level 1 (for external resources).
- **Fix:** add `integrity="sha384-…" crossorigin="anonymous"` to any externally-hosted script/style; for first-party, prefer same-origin serving (already done for `kit.js`/`kit.css`).

### 🟡 LOW — Dynamic `RegExp` from URL glob pattern (potential ReDoS)
**File:** `prototype/lib/db.ts:1622` (`globToRegExp`). Builds `new RegExp("^" + esc)` from a project-owner-configured URL pattern. Metacharacters **are** escaped and only `*`→`.*`; input is admin-scoped, not arbitrary attacker input → low practical risk.
- **OWASP Top 10:2025 → A05 (ReDoS).** **Fix (optional):** cap pattern length and collapse consecutive `*`; or match with a glob library instead of regex.

### Operational note — Secrets present in `prototype/.env` (not a leak)
Semgrep flagged a JWT, a SendGrid key, and 2 generic keys in `prototype/.env:10,12,28,31`. Verified: `.env` is **gitignored**, **not tracked** in git, and **not** present in `dist/` or `klavity-snap-0.21.1.zip`. This is expected local/server config (matches your "prod secrets at `/etc/klav/klav.env`" setup), **not** a source-code leak.
- **Top 10:2025 → A04/A02.** Housekeeping only: ensure `chmod 600`, keep `*.env.example` placeholder-only, and rotate any key that has ever been shared in a transcript/PR.

---

## False positives (triaged, no action)

| Finding | Where | Why it's safe |
|---------|-------|---------------|
| `unsafe-formatstring` ×4 | `db.ts:395,416`, `server.ts:194,498` | All are `console.warn/error` log templates — not a sink. `server.ts:498` (`oops()`) is a **good** generic-error + correlation-id pattern (A10 done right). |
| SQL string-build | `db.ts:394,415` (`ALTER TABLE ${table} ${col}`) | Identifiers come from **hardcoded** arrays; SQLite can't parameterize identifiers. No user input. |
| `raw-html-join` | `server.ts:919` (sitemap XML) | `slug` constrained to `[a-z0-9-]+` at the route; `index.json` is server-authored. |
| `unsafe-dynamic-method` | `core/submit.ts:33` | Fixed handler map keyed by local user config; not remote input. |
| `missing-template-string-indicator` ×76, `html-in-template-string` ×68 | demos / `site/` HTML, logo studio files | Static marketing/demo template literals — non-exploitable noise. |

---

## Defensive controls observed (positives)

- **No SQL injection** — backend uses parameterized `{ sql, args: [...] }` consistently (`db.ts`).
- **Safe error handling** — `oops()` returns a generic message + UUID correlation id, logs internals server-side (A10 / fail-closed).
- **SSRF / rate-limit / auth** modules present (`lib/url-guard.ts`, `lib/ratelimit.ts`, `lib/auth.ts`) — consistent with the prior OWASP remediation sweep (v0.22.0→v0.29.1).
- **Canonical Sim renderer escapes output** (`klavity-sim.js` `b()`), so the Medium fix is "use the pattern you already have."

---

## Remediation status (2026-06-21)

| Finding | Status | Change |
|---------|--------|--------|
| SCA Critical/High/3×Moderate (vitest/vite/esbuild) | ✅ Fixed | Bumped to `vitest@3.2.6`, `vite@6.4.3`, `@vitest/coverage-v8@3.2.6` + `esbuild` pinned to `0.25.12` via `pnpm-workspace.yaml` `overrides`. `pnpm audit` → **No known vulnerabilities found**. (Stayed in-major; `@latest` pulled vitest 4 / vite 8 which broke the jsdom test env.) |
| Medium DOM-XSS (`content.ts`) | ✅ Fixed | Added `klavEsc()` (full HTML-entity escape) + `klavSafeColor()` allowlist; every Sim field in `klavRenderBubble` + `klavNotice` now escaped before `innerHTML`. |
| Low ReDoS (`globToRegExp`) | ✅ Fixed | Bounded pattern to 512 chars + collapse `*{2,}`→`*` before regex build. |
| Low missing-SRI (`site/`) | ✅ Fixed | **Google Fonts self-hosted** under `site/fonts/` (12 woff2, latin+latin-ext) with local `site/fonts/fonts.css`; all `site/*.html` now link `/fonts/fonts.css`; server serves `/fonts/*` with immutable caching + path-traversal guard; CSP tightened to drop `fonts.googleapis.com`/`fonts.gstatic.com` (`style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`). Third-party font origin eliminated. `widget.js` remains first-party under `script-src 'self'` (no SRI needed). |

**Verification:** `pnpm -r build` ✓ · workspace tests 84+49+28 ✓ · prototype `bun test` 481 pass / 0 fail ✓ (glob tests 40/40 deterministic).

**Outstanding hardening (not done — needs browser-tested pass):** the CSP still has `script-src 'unsafe-inline' 'unsafe-eval'` (server.ts:841), which weakens XSS defense-in-depth. Move to nonce-based `script-src` when you can test it in-browser.

## Recommended priority

1. **Now (Medium):** escape all fields in `content.ts klavRenderBubble`/`klavNotice` (reuse `b()`); allowlist `r.accent`.
2. **Now (Critical/High SCA):** `pnpm up -r vitest vite esbuild` → re-run `pnpm audit` to 0.
3. **Soon (Low):** add SRI to any external scripts in `site/`; bound `globToRegExp` input.
4. **Housekeeping:** confirm `.env` perms; keep secrets out of `*.env.example`.
