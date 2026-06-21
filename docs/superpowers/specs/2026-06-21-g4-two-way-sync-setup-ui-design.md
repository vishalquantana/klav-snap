# G4 Two-Way Sync — Setup UI + Docs (KLAVITYKLA-7)

## Context
Two-way status sync (external tracker → Klavity ticket) is **already built, tested,
and deployed**: pure mapping module `prototype/lib/connectors/inbound.ts`, the webhook
receiver `POST /api/connectors/:type/webhook` in `server.ts`, the `findExportByExternalKey`
lookup, and an `inbound_secret` field on every connector adapter (github/plane/jira/linear).
63 connector/inbound tests pass.

The gap vs the ticket's acceptance ("documented per connector") is **discoverability**:
the connector setup UI never tells the user the webhook URL, that the secret must match,
or the per-connector steps. There is no user-facing doc.

## Scope (this change)
Pure additive UI + docs. No backend/protocol change.

1. **Connector setup panel.** In `renderConnectorFields(type, editConfig)`
   (`prototype/public/dashboard.html`), after the adapter fields, append a
   "Two-way status sync" panel for inbound-supported types only (github/plane/jira/linear;
   hidden for `webhook`). The panel shows:
   - the webhook URL `${location.origin}/api/connectors/<type>/webhook` in a copyable
     code box with a Copy button;
   - the per-connector auth instruction (which header/secret carries the inbound secret);
   - 2–3 concrete steps (where in the tracker to add it, which events to subscribe);
   - a "Full guide →" link to `/docs/connectors-two-way-sync` (the new doc);
   - a subtle reminder to fill the *Inbound Webhook Secret* field above if blank.
   Static per-connector copy lives in a client-side `INBOUND_GUIDE` const mirroring the
   `inbound.ts` capability matrix (the 4 types are static — no server round-trip needed).

2. **Docs.** New `docs/connectors-two-way-sync.md`: per-connector setup (URL, secret/header,
   events) + the provider-state → Klavity-status mapping table, sourced from `inbound.ts`.
   Served at `/docs/connectors-two-way-sync` if a static docs route exists; otherwise linked
   as a repo doc and the panel links to the relevant tracker's docs section.

## Per-connector facts (authoritative, from server.ts + inbound.ts)
| Tracker | Secret carried via | Subscribe to | Maps to done/in_progress/open |
|---|---|---|---|
| GitHub | `X-Hub-Signature-256` (HMAC of body; set "Secret" on the webhook) | Issues | closed→done · reopened/opened→open |
| Plane  | `X-Plane-Signature` header = the secret | Issue events | state group completed/cancelled→done · started→in_progress · backlog/unstarted→open |
| Linear | `Linear-Signature` (HMAC of body; set webhook secret) | Issues | state.type completed/canceled→done · started→in_progress · backlog/unstarted/triage→open |
| Jira   | `X-Klavity-Token:` or `Authorization: Bearer <secret>` header (?token= deprecated) | Issue updated | statusCategory done→done · indeterminate→in_progress · new→open |

Webhook URL (all): `https://klavity.quantana.top/api/connectors/<type>/webhook`

## Out of scope
Polling fallback, two-way *content* sync (only status), per-instance webhook URLs
(URL is type-level), changing the verification protocol.

## Testing
- Headless DOM check (deno+linkedom): `renderConnectorFields` shows the panel + correct
  webhook URL for an inbound type, hides it for `webhook`.
- `node --check` on the inline JS.
- Existing 63 connector/inbound tests still pass.
- Visual: not available (Chrome not connected) — DOM-assert instead.
