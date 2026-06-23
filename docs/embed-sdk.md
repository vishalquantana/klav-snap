# Klavity Embed SDK

Add Klavity to any web page with a single `<script>` tag. Users can right-click anywhere on your site to file a bug report — with an automatic screenshot, session replay, and full console/network context already attached.

---

## Quick start

```html
<script
  src="https://klavity.quantana.top/widget.js"
  data-project="YOUR_PROJECT_ID"
  defer
></script>
```

That's it. The widget mounts a floating launcher in the bottom-right corner and intercepts right-clicks to show the Klavity menu. No npm install, no build step.

Get your **Project ID** from the Klavity dashboard → Settings → Project.

---

## Embed options (data-* attributes)

All options are set as `data-*` attributes on the `<script>` tag.

| Attribute | Type | Default | Description |
|---|---|---|---|
| `data-project` | string | — | **Required.** Your Klavity project ID. |
| `data-replay` | `"on"` \| `"off"` | `"on"` | Enable/disable session replay capture. Set `"off"` if your privacy policy prohibits it. |
| `data-user-id` | string | — | Attach a user ID to every report filed from this page load. |
| `data-user-email` | string | — | Attach a user email to every report. |
| `data-user-name` | string | — | Attach a display name to every report. |
| `data-meta` | JSON string | — | Arbitrary key/value metadata attached to every report (see [Custom metadata](#custom-metadata)). |

### Example: pre-identified user with metadata

```html
<script
  src="https://klavity.quantana.top/widget.js"
  data-project="proj_abc123"
  data-user-id="u_42"
  data-user-email="ada@example.com"
  data-user-name="Ada Lovelace"
  data-meta='{"plan":"pro","build":"v2.1.0","tenant":"acme"}'
  defer
></script>
```

---

## Public JS API — `window.Klavity`

The widget exposes a `window.Klavity` object. All methods are safe to call **before the widget finishes mounting** — `identify()` and `setMetadata()` queue their values; `on()` registers listeners immediately; `open()` is silently ignored pre-mount.

### `window.Klavity.identify(user)`

Attach user identity to every subsequent report. Call this as soon as your app resolves the current user (e.g. after auth).

```js
window.Klavity.identify({
  id:    'u_42',            // your internal user ID
  email: 'ada@example.com',
  name:  'Ada Lovelace',
})
```

Pass `null` to clear the identity:

```js
window.Klavity.identify(null)
```

**Fields:** `id`, `email`, `name` are the well-known fields. You may add any additional `string` keys. All values are coerced to strings (max 1 000 chars per value, max 64-char key).

---

### `window.Klavity.setMetadata(obj)`

Attach arbitrary key/value pairs to every report. Useful for plan tier, app version, feature flags, A/B test groups, etc.

```js
window.Klavity.setMetadata({
  plan:    'pro',
  build:   'v2.1.0',
  tenant:  'acme-corp',
  locale:  navigator.language,
})
```

Pass `null` to clear:

```js
window.Klavity.setMetadata(null)
```

**Limits:** 50 keys max, 64-char key, 1 000-char value. Values are always coerced to strings. The server rejects anything beyond these caps.

---

### `window.Klavity.open(type?)`

Open the report composer programmatically — useful for "Report a bug" buttons in your own UI.

```js
// Open as a bug report (default):
window.Klavity.open()
window.Klavity.open('bug')

// Open as a feature request:
window.Klavity.open('feature')
```

This is a no-op if the widget has not yet mounted.

---

### `window.Klavity.on(event, callback)` → `unsubscribe`

Subscribe to widget lifecycle events. Returns an **unsubscribe function** — call it to remove the listener.

```js
const off = window.Klavity.on('submit', ({ issueKey, issueUrl, type }) => {
  console.log(`[Klavity] ${type} filed: ${issueKey}`)
  if (issueUrl) window.open(issueUrl, '_blank')
  myAnalytics.track('Bug filed', { issueKey, type })
})

// Later, to stop listening:
off()
```

#### Events

| Event | When | Payload |
|---|---|---|
| `'open'` | User opens the report composer | `{ type: 'bug' \| 'feature' }` |
| `'close'` | Composer is dismissed (Esc, overlay click, X button, or programmatic close) | `{}` |
| `'submit'` | Report is stored successfully | `{ issueKey: string, issueUrl: string \| null, type: 'bug' \| 'feature' }` |

**Multiple listeners are fine:**

```js
window.Klavity.on('open',  ({ type }) => console.log('opened, type:', type))
window.Klavity.on('close', ()         => console.log('closed'))
```

**Listener errors are swallowed** — a throwing callback never breaks the widget.

---

## Custom metadata

Identity and metadata are bundled into every report as part of the captured context. On the Klavity dashboard (and in any connected tracker like Plane, Jira, or GitHub), you'll see:

```
User: ada@example.com (u_42, Ada Lovelace)
plan: pro
build: v2.1.0
tenant: acme-corp
```

You can set this via `data-*` attributes (static, known at page load) **or** via the JS API (dynamic, set after auth resolves). **The JS API always wins** — a later `identify()` call overrides what was in the script tag.

### Recommended pattern for logged-in apps

```html
<!-- Script tag: no data-user-* (user not known yet at load time) -->
<script src="https://klavity.quantana.top/widget.js"
        data-project="proj_abc123"
        data-replay="on"
        defer></script>

<script>
// After your auth resolves:
authPromise.then(user => {
  window.Klavity?.identify({
    id:    user.id,
    email: user.email,
    name:  user.displayName,
  })
  window.Klavity?.setMetadata({
    plan:    user.subscriptionTier,
    orgId:   user.organizationId,
    build:   window.__APP_VERSION__ ?? 'unknown',
  })
})
</script>
```

---

## What gets captured

Every report automatically includes:

| Signal | What | How it's collected |
|---|---|---|
| **Screenshot** | Full-page pixel-perfect capture | `html-to-image` (CORS-safe) or screen-share (Screen button) |
| **Console logs** | Last ~50 `log/info/warn/error` entries | `console.*` wrapper (ring buffer) |
| **Network requests** | Last ~50 `fetch` + `XHR` calls: method, URL, status, duration | `fetch`/`XHR` wrapper |
| **Performance** | Long tasks (>50 ms), paint timing, resource loads | `PerformanceObserver` |
| **Session replay** | Rolling ~30s of DOM mutations + interactions | `rrweb` (lazy-loaded, opt-out via `data-replay="off"`) |
| **Environment** | Browser, screen size, viewport size, page URL | `navigator` + `window` |
| **Identity / metadata** | Your `identify()` + `setMetadata()` values | Attached to every report |

### Privacy protections

- **Inputs are always masked.** `rrweb` runs with `maskAllInputs: true` — password fields, email fields, and all other inputs are replaced with blank values before any events leave the browser. This is the default and cannot be changed via the public API.
- **Text is masked by default.** All visible text is replaced with same-length asterisks in the session replay (`maskText: true`). This means replays show layout and interaction patterns, not readable content.
- **`<canvas>` is excluded.** Canvas pixel data is never captured.
- **URLs are redacted.** Query-string parameters with names that look like secrets — `token`, `api_key`, `password`, `auth`, `jwt`, `session`, `code`, `otp`, etc. — are replaced with `REDACTED` before being stored. This applies to both network-request URLs and resource-timing URLs.
- **Ring buffers are bounded.** Console and network buffers each hold at most 50 entries. Session replay is capped at 30 seconds / 2 000 events. Older entries are evicted automatically — the widget never accumulates an unbounded history.
- **Session replay is opt-out.** Add `data-replay="off"` to the script tag to disable replay capture entirely.
- **No sensitive elements.** Add the CSS class `klavity-no-record` to any element whose content should be excluded from the session replay — it will appear as a blank rectangle.

```html
<!-- This element will be a blank box in the session replay -->
<div class="klavity-no-record">
  Patient notes: ...
</div>
```

### Data storage

Reports are stored in your Klavity project. Session replays are compressed with gzip (~20–100× reduction) and stored separately. Replay payloads exceeding 600 KB compressed are trimmed oldest-first so the most recent events — closest to the bug — are always preserved.

---

## Advanced: late-loading for performance

To keep the widget out of the critical path on high-traffic pages, load it after the page is interactive:

```js
window.addEventListener('load', () => {
  const s = document.createElement('script')
  s.src = 'https://klavity.quantana.top/widget.js'
  s.setAttribute('data-project', 'proj_abc123')
  s.defer = true
  document.body.appendChild(s)
})
```

`identify()` and `setMetadata()` can be called on `window.Klavity` before the script tag has been added — the widget reads these values when it mounts.

---

## TypeScript types

If you use TypeScript, you can declare the `window.Klavity` surface:

```ts
interface KlavityUser {
  id?:    string
  email?: string
  name?:  string
  [key: string]: string | undefined
}

interface KlavityOpenEvent   { type: 'bug' | 'feature' }
interface KlavityCloseEvent  {}
interface KlavitySubmitEvent { issueKey: string; issueUrl: string | null; type: 'bug' | 'feature' }

interface KlavityEventMap {
  open:   KlavityOpenEvent
  close:  KlavityCloseEvent
  submit: KlavitySubmitEvent
}

interface KlavitySDK {
  identify(user: KlavityUser | null): void
  setMetadata(meta: Record<string, unknown> | null): void
  open(type?: 'bug' | 'feature'): void
  on<K extends keyof KlavityEventMap>(
    event: K,
    callback: (data: KlavityEventMap[K]) => void,
  ): () => void
}

declare global {
  interface Window { Klavity?: KlavitySDK }
}
```

---

## Browser support

Chrome 80+, Firefox 75+, Edge 80+, Safari 14+. The widget degrades gracefully on older browsers: `PerformanceObserver` longtask entries are skipped on Firefox stable (not yet supported); session replay is skipped on iOS Safari (no `getDisplayMedia`).
