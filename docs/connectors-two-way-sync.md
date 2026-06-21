# Two-way status sync (external trackers → Klavity)

Klavity connectors are two-way. **Outbound** (Klavity ticket → tracker issue) happens
automatically when you copy/auto-copy a ticket. **Inbound** (tracker issue status →
Klavity ticket) is opt-in: add an **Inbound Webhook Secret** to the connector, then point
your tracker's webhook at Klavity. When the issue's status changes in the tracker, the
linked Klavity ticket moves to **Open / In Progress / Done** to match.

Leaving the Inbound Webhook Secret blank keeps the connector outbound-only.

## Webhook URL

```
https://klavity.quantana.top/api/connectors/<type>/webhook
```

`<type>` is one of `github`, `plane`, `jira`, `linear`. The dashboard connector editor
shows the exact URL with a Copy button. The endpoint is unauthenticated by design — it is
secured by the per-provider signature/secret below, rate-limited, and only ever changes the
status of a ticket already linked by a prior outbound copy.

## Per-connector setup

### GitHub
1. Repo → **Settings → Webhooks → Add webhook**.
2. **Payload URL** = the URL above. **Content type** = `application/json`.
3. **Secret** = your Inbound Webhook Secret.
4. **Which events** → *Let me select individual events* → enable **Issues**.

Auth: `X-Hub-Signature-256` (HMAC-SHA256 of the body). Mapping: `closed → Done`,
`reopened`/`opened → Open`.

### Plane
1. Plane → **Workspace or Project Settings → Webhooks → Create**.
2. **URL** = the URL above. **Secret** = your Inbound Webhook Secret.
3. Enable **Issue** events.

Auth: Plane sends the secret in the `X-Plane-Signature` header. Mapping (state group):
`completed`/`cancelled → Done`, `started → In Progress`, `backlog`/`unstarted → Open`.

### Linear
1. Linear → **Settings → API → Webhooks → New webhook**.
2. **URL** = the URL above. **Secret** = your Inbound Webhook Secret.
3. Subscribe to **Issues**.

Auth: `Linear-Signature` (HMAC-SHA256 of the body). Mapping (state type):
`completed`/`canceled → Done`, `started → In Progress`, `backlog`/`unstarted`/`triage → Open`.

### Jira
1. Jira → **Settings → System → Webhooks → Create a WebHook**.
2. **URL** = the URL above.
3. Add a header **`X-Klavity-Token`** (or `Authorization: Bearer <secret>`) set to your
   Inbound Webhook Secret.
4. **Events** → enable **Issue → updated**.

Auth: shared-secret header (the `?token=` query param is deprecated — it leaks the secret
into logs). Mapping (status category): `done → Done`, `indeterminate → In Progress`,
`new → Open`.

## Notes
- The generic **webhook** connector is outbound-only — there's no canonical inbound contract,
  so no inbound webhook is offered for it.
- Status is the only field synced inbound (not title/description/comments).
- Implementation: `prototype/lib/connectors/inbound.ts` (pure mapping + signature verify) and
  the `POST /api/connectors/:type/webhook` receiver in `prototype/server.ts`.
