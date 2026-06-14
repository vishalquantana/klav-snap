# Klav Snap ⚡

> Right-click to file annotated bug reports to Jira, Linear, GitHub Issues, or Plane — from any website.

Named after Ekalavya: the self-taught master. Klav Snap is the "eyes" of the Klav suite — the foundation that Klav Agent (AI personas) and Klav OS (autonomous testing) will build on.

---

## Features

- **Right-click anywhere** → Report a Bug / Request a Feature / View submissions
- **Auto screenshot** on modal open — captures the full rendered page (cross-origin images included)
- **Region capture** — drag to select any area of the page
- **Canvas annotation** — pen, rectangle, arrow, text with 4 colours, undo/clear
- **Upload + paste** — drag files, paste from clipboard, HEIC/HEIF auto-converted
- **Context capture** — page URL, browser, screen size, last 50 console errors, last 50 network failures
- **4 integrations** — Jira, Linear, GitHub Issues, Plane
- **Cloud switch** — set a backend URL to route all submissions through Klav Cloud or your self-hosted instance

---

## Install

### Chrome Extension

**Chrome Web Store:** _(coming soon)_

**Developer / self-hosted:**
1. `pnpm install && pnpm -r build`
2. Open `chrome://extensions` → Enable Developer mode → Load unpacked → select `packages/extension/dist`
3. Click the ⚡ Klav icon in your toolbar → Settings → configure your integration

### Embeddable SDK (`@klav/snap`)

For SaaS products that want Klav Snap built into their own app:

**Script tag:**
```html
<script src="https://cdn.klav.io/snap/klav-snap.umd.js"></script>
<script>
  KlavSnap.init({
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
npm install @klav/snap
```
```js
import KlavSnap from '@klav/snap'
KlavSnap.init({
  integration: 'linear',
  linear: { apiKey: 'lin_api_...', teamId: 'team_...' }
})
```

---

## Configuration

Open the extension settings (click the ⚡ icon → Settings) or pass config to `KlavSnap.init()`.

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
| Backend URL | Leave empty for direct mode. Set to self-hosted URL or `https://app.klav.io` for Klav Cloud. |
| Auto-file JS errors | Auto-file silent tickets for unhandled JS errors (opt-in) |

---

## Architecture

```
klav-snap/
├── packages/core/       # @klav/core — shared types, integrations, annotator, crop, modal
├── packages/extension/  # Chrome MV3 extension — background, content script, options, popup
└── packages/sdk/        # @klav/snap — embeddable script-tag / npm SDK
```

The **cloud switch** is a single `backendUrl` setting. Empty = direct mode (extension calls Jira/Linear/etc APIs directly). Non-empty = all submissions route through the Klav backend, which also powers Klav Agent and Klav OS.

---

## Roadmap

| Tier | Product | Status |
|---|---|---|
| 1 | **Klav Snap** — right-click bug reporter | ✅ This repo |
| 2 | **Klav Agent** — AI persona panel (virtual QA engineers) | 🔜 |
| 3 | **Klav OS** — autonomous UAT agent | 🔜 |

---

## Development

```bash
pnpm install          # install all workspace deps
pnpm -r test          # run all tests (22 tests)
pnpm -r build         # build extension + SDK

# Load extension in Chrome:
# chrome://extensions → Developer mode → Load unpacked → packages/extension/dist
```

---

## License

[FSL-1.1-ALv2](LICENSE) (Functional Source License) — free for any non-competing use; converts to Apache 2.0 on the second anniversary of each release.  
For commercial licensing, contact [hello@quantana.com.au](mailto:hello@quantana.com.au).

Built by [Quantana](https://quantana.com.au) — AI-first design and development agency.
