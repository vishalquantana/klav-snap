# Klavity Snap ⚡

> **Right-click any page to file a grounded bug** — screenshot, console and network attached — straight into Jira, Linear, GitHub Issues, or Plane. No browser extension required, no tool to open.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-install-4285F4.svg?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/klavity-%E2%80%93-ai-bug-reporter/olahjdcgbdjajbfmgnakjlehgjdmaene)
[![License: FSL-1.1-ALv2](https://img.shields.io/badge/license-FSL--1.1--ALv2-0f9d6b.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-klavity.quantana.top-6366f1.svg)](https://klavity.quantana.top)
[![Open core](https://img.shields.io/badge/open-core-db2777.svg)](#license)

**Klavity** turns bug reporting, customer research, and end-to-end testing into one continuous loop — built around a recurring cast of AI **Sims** (personas grounded in real customer calls). Snap is **Phase 1**: the in-app reporter that catches a bug the moment a human sees it.

🌐 **Live:** [klavity.quantana.top](https://klavity.quantana.top) &nbsp;·&nbsp; [Snap](https://klavity.quantana.top/snap) · [Sims](https://klavity.quantana.top/sims) · [AutoSim](https://klavity.quantana.top/autosim)

> Named after **Ekalavya**, the self-taught master — Klavity learns your product and tests it the way your users would.

---

## The Klavity arc — Snap → Sims → AutoSim

Three phases, one set of AI Sims walking the same trail through your product:

| Phase | Product | What it does | Status |
|---|---|---|---|
| **1** | **[Klavity Snap](https://klavity.quantana.top/snap)** | Right-click → describe → a grounded bug (screenshot + console + network) lands in your tracker. **No extension needed.** | ✅ **Shipped** (this repo) |
| **2** | **[Klavity Sims](https://klavity.quantana.top/sims)** | Turn customer-call transcripts into AI personas that walk your real pages and react in their own voice — filing grounded bugs carrying the persona + a verbatim quote. | ✅ **Live** |
| **3** | **[Klavity AutoSim](https://klavity.quantana.top/autosim)** | Your Sims test every release: author a flow once, replay it with **zero AI**, and **self-heal** when the UI changes — never a silent false-green. | ✅ **Shipped** |

> AutoSim was formerly called "Klavity OS." Everywhere you see it now, it's **AutoSim**.

---

## Why Klavity Snap is different

- **No browser extension required.** The first-party widget owns right-click on your own site — your users report bugs without installing anything. (A Chrome extension exists too, for reporting on *any* site.)
- **Grounded, not AI-slop.** Every report carries real evidence — full-page screenshot, the page URL, and the last 50 console errors + network failures — so a ticket is reproducible, not a guess.
- **Deduplicated.** A repeat of a known issue bumps its recurrence count instead of spawning a duplicate ticket.
- **Files where you already work.** Jira, Linear, GitHub Issues, and Plane — directly, or routed through Klavity Cloud.
- **Open-core & self-hostable.** Run the whole thing on your own infra.

---

## Features

- **Right-click anywhere** → Report a Bug / Request a Feature / View submissions
- **Auto screenshot** on open — captures the full rendered page (cross-origin images included)
- **Region capture** — drag to select any area of the page
- **Canvas annotation** — pen, rectangle, arrow, text in 4 colours, with undo/clear
- **Upload + paste** — drag files, paste from clipboard, HEIC/HEIF auto-converted
- **Context capture** — page URL, browser, screen size, last 50 console errors, last 50 network failures
- **4 integrations** — Jira · Linear · GitHub Issues · Plane
- **Cloud switch** — set one backend URL to route submissions through Klavity Cloud or your self-hosted instance

---

## Install

### First-party widget (no extension)

Embed the report widget on your own site so logged-in users can right-click → report, with the full-page screenshot auto-attached:

```html
<script src="https://klavity.quantana.top/widget.js" defer></script>
```

### Chrome extension (report on any site)

**[➜ Install from the Chrome Web Store](https://chromewebstore.google.com/detail/klavity-%E2%80%93-ai-bug-reporter/olahjdcgbdjajbfmgnakjlehgjdmaene)** — Klavity – AI Bug Reporter

**Developer / self-hosted:**
1. `pnpm install && pnpm -r build`
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `packages/extension/dist`
3. Click the ⚡ Klavity icon → **Settings** → configure your integration

### Embeddable SDK (`@klavity/snap`)

For SaaS products that want Klavity Snap built into their own app.

**Script tag:**
```html
<script src="https://cdn.klav.io/snap/klavity-snap.umd.js"></script>
<script>
  KlavitySnap.init({
    integration: 'jira',
    jira: {
      baseUrl: 'https://yourorg.atlassian.net',
      email: 'dev@yourorg.com',
      token: 'your-api-token',
      projectKey: 'PROJ'
    }
  })
</script>
```

**npm:**
```bash
npm install @klavity/snap
```
```js
import KlavitySnap from '@klavity/snap'
KlavitySnap.init({
  integration: 'linear',
  linear: { apiKey: 'lin_api_...', teamId: 'team_...' }
})
```

---

## Configuration

Open the extension settings (click the ⚡ icon → **Settings**) or pass config to `KlavitySnap.init()`.

| Setting | Description |
|---|---|
| Active integration | `jira`, `linear`, `github`, or `plane` |
| Jira: Base URL | e.g. `https://yourorg.atlassian.net` |
| Jira: Email + API Token | From Atlassian account settings |
| Jira: Project Key | e.g. `PROJ` |
| Linear: API Key | Personal API key from Linear settings |
| Linear: Team ID | Your Linear team ID |
| GitHub: PAT | Personal access token with `repo` scope |
| GitHub: Repository | `owner/repo` format |
| Plane: API Token | From Plane account settings |
| Backend URL | Leave empty for direct mode. Set to your self-hosted URL or Klavity Cloud to route all submissions through the backend. |
| Auto-file JS errors | Auto-file silent tickets for unhandled JS errors (opt-in) |

---

## Architecture

```
klav-snap/
├── packages/core/       # @klavity/core — shared types, integrations, annotator, crop, modal
├── packages/extension/  # Chrome MV3 extension — background, content script, options, popup
├── packages/sdk/        # @klavity/snap — embeddable script-tag / npm SDK
└── prototype/           # Klavity Cloud — Bun backend, dashboards, Sims & AutoSim engine
```

The **cloud switch** is a single `backendUrl` setting. Empty = direct mode (the extension calls Jira/Linear/etc. APIs directly). Non-empty = submissions route through the Klavity backend, which also powers **Klavity Sims** and **Klavity AutoSim**.

---

## Development

```bash
# OSS packages (extension + SDK + core)
pnpm install          # install all workspace deps
pnpm -r test          # run package tests (vitest)
pnpm -r build         # build extension + SDK

# Load the extension in Chrome:
# chrome://extensions → Developer mode → Load unpacked → packages/extension/dist
```

The `prototype/` Cloud backend runs on **Bun** (`cd prototype && bun install && bun run server.ts`).

---

## License

[FSL-1.1-ALv2](LICENSE) (Functional Source License) — free for any non-competing use; converts to Apache 2.0 on the second anniversary of each release.
For commercial licensing, contact [hello@quantana.com.au](mailto:hello@quantana.com.au).

Built by [Quantana](https://quantana.com.au) — an AI-first design and development studio.
