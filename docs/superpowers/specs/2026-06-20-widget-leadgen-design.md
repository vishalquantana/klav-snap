# Design — Widget modes + lead-gen funnel

**Date:** 2026-06-20 · **Status:** approved, pre-implementation
**Author:** brainstorming session (Claude + Vishal)

## Context & goal

Klavity Snap already ships an embeddable right-click bug-reporter widget
(`/widget.js`, served from `packages/sdk/dist/klavity-widget.iife.js`; source in
`packages/sdk/src/widget.ts`, composer in `packages/core/src/modal.ts`). It is
embedded on customers' products via `<script src=".../widget.js" data-project="<id>" defer>`.

We want to **put the widget on Klavity's own marketing site**, but the primary
purpose there is **lead generation**, not bug collection: a visitor experiences the
magic (right-click → auto-screenshot → file a bug with zero friction), and the
success screen converts that "whoa" into a captured lead. The bug reports
themselves are exhaust — kept in a dedicated Plane project for tracking, but the
**lead is the win**.

A key realization during design: the success-screen behavior should differ by
audience — real customer products want a *support* follow-up ("we'll tell you when
it's fixed"), while our own site wants a *lead-gen* pitch ("you just used it — get
it for your product"). So the post-submit behavior becomes a **per-project,
admin-configurable mode**, not a hardcoded choice.

## Decisions locked (from brainstorming)

1. **Lead capture point:** *after* submit — preserve the full zero-friction magic;
   the success screen is where the lead is captured.
2. **Lead destination:** a dedicated Plane project (`f2982ce0-6bb5-410f-9c77-b84a7b90441c`,
   workspace `qbuilder`, self-hosted `plane.quantana.top`) **+ instant alert**.
3. **Alert channel:** **email** (reuse `prototype/lib/mail.ts`; `KLAV_MAIL_FROM` is set in prod).
   Slack is out for now (no server webhook); design leaves room to add it later.
4. **Success-screen behavior is a per-project admin setting** with three modes.
5. **Config scope:** admin picks the mode **+ two fields** (CTA link, lead-notify email).
   No full template/copy editor (YAGNI).
6. Lead email lands on the **existing feedback row** (`contact_email`), not a new
   `leads` table. The "lead board" is the Plane project itself.
7. **PLG framing:** the widget *is* the free giveaway product ("Klavity Markup" —
   right-click → annotate → file). The paid **upsell is Sims / AutoSim**. The lead-gen
   success screen's CTA = "Start free" into the free product (`/onboarding`), and its
   copy may tease Sims as the next step. No architecture change — positioning only.
8. **Sequencing:** this lead-gen widget ships **first**. A markup.io-style **ticket
   visualiser** is a *separate, next* sub-project (its own brainstorm/spec), to be built
   as a **new dedicated surface** (not an evolution of `/dashboard`). Out of scope here.

## The funnel (per page)

1. Page embeds `<script src="https://klavity.quantana.top/widget.js" data-project="<id>" defer>`.
2. Visitor sees the floating "🐞 Report a bug" launcher; right-click anywhere (or the
   launcher) opens the composer. First-party (same origin as backend) → no "Connect" prompt.
3. Visitor describes the bug; full-page screenshot auto-captured. **Submit** files the
   report (works anonymously — see *Anonymous intake*).
4. The composer is replaced by the **success screen**, rendered per the project's mode.
5. If the visitor gives an email, the lead is captured + alerted.

## Modes

The widget fetches the project's display config and renders one of:

- **`support`** (default) — confirms + recaps the filed bug, then: *"Want to know when
  it's fixed? → email."* Bug is the point; email is a bonus follow-up touchpoint.
- **`leadgen`** — *"You just right-clicked → auto-screenshot → filed a real ticket. Your
  users could do this for you."* → email ("send me the 2-min setup") + a `Start free` CTA
  into the **free Markup product**, with a soft tease of **Sims** (AI users that find bugs
  automatically) as the upsell/next step. Lead is the point; the bug is exhaust.
- **`off`** — simple "thanks, filed" with no capture.

(A third "CTA-first" direction was considered and dropped.)

### Mode delivery

Public endpoint: `GET /api/widget/config?project=<id>` →
`{ mode: "support"|"leadgen"|"off", ctaUrl: string }`.

- Non-sensitive display config only. **`notify_email` is never returned** (stays server-side).
- The widget calls this on mount (after `parseScriptConfig`) and caches for the session.
- Unknown/missing project → default `{ mode: "support", ctaUrl: "https://klavity.quantana.top/onboarding" }`
  (the widget still works; it just can't be misconfigured into leaking anything).

## Admin config (per project)

Three fields, surfaced in the existing project-settings surface (alongside connectors):

| Field | Values | Default |
|---|---|---|
| `widget_mode` | `support` \| `leadgen` \| `off` | `support` |
| `widget_cta_url` | URL | `https://klavity.quantana.top/onboarding` |
| `widget_notify_email` | email (server-side only) | project owner email |

Persisted on the project (new columns on `projects`, or a small `project_settings`
key/value — implementation chooses; columns preferred for queryability). Admin-gated
write (project member/admin), mirroring connector settings auth.

## Lead capture & alert (two-step)

1. **Submit** (`POST /api/feedback`, anonymous) → persist feedback row + fire the
   project's auto-copy connector(s) → Plane card created. Returns `{ id: feedbackId, saved: true }`.
2. **Email entered** on the success screen → `POST /api/widget/lead` with
   `{ project_id, feedback_id, email }`:
   - validate the project exists and `feedback_id` belongs to it; validate email shape.
   - set `feedback.contact_email = email`.
   - **send the alert email** to `widget_notify_email` (or owner / `OPS_ADMIN_EMAILS`
     fallback) with: email, bug text, page path, screenshot link, Plane card link, mode.
   - best-effort add the lead email as a comment on the Plane card (if the connector
     supports comments; otherwise the alert email carries it — non-fatal either way).
   - per-IP + per-project rate limited; fire-and-forget alert never blocks the response.

If no email is given, the report still exists as an anonymous card; no lead, no alert.

## Backend: anonymous intake

Today `POST /api/feedback` only persists/routes when there is a logged-in actor
(`server.ts:1012` — `resolved = actor ? resolveProject(...) : null`), so anonymous
visitors' reports are silently dropped (`{saved:true}` with nothing stored). Change:

- When there is **no actor**, resolve the project directly from the form's `project_id`
  via `projectById(...)` (`prototype/lib/db.ts:646`); if it exists, run the existing
  persist + auto-copy path with `actor = null`.
- `actorEmail`/`ownerEmail` on `insertFeedback`/`insertScreenshot`/`insertActivity`
  accept null (verify/relax types as needed).

### Scope boundary: first-party only (for now)

Anonymous intake here is **first-party only** — the widget embedded on *our own*
marketing site (same origin as the backend). Customer products embed the widget
**cross-origin** and continue to use the existing **connect-token flow** (a team member
authorizes the widget; submissions carry a Bearer token → `actor` present → today's path).
Letting *anonymous, cross-origin* end-users file into a customer's project (the broader
PLG "free markup for your users" vision) widens the security surface materially and is a
**separate, later decision** — not in this spec.

### Anti-abuse (this opens a public unauthenticated write path)

- **First-party / origin guard:** anonymous resolution allowed only when the request
  `Origin` matches the backend origin (`KLAV_BASE_URL`) — i.e. our own embedded widget.
  (Defense-in-depth; the unguessable UUID `project_id` is the real gate.)
- **Per-IP rate limit** on anonymous `POST /api/feedback` and `POST /api/widget/lead`
  (reuse the existing `rlAllow`-style limiter used by the AI endpoints / auto-copy cap),
  returning `429 + Retry-After` over the cap.
- **Description size cap** (e.g. 5000 chars) and the existing screenshot caps (5 × 8MB).
- The existing **per-project auto-copy cap** already bounds Plane flooding.

## Our site's wiring

- Create a dedicated **"website" Klavity project**; add a **Plane connector** →
  `f2982ce0-6bb5-410f-9c77-b84a7b90441c` (qbuilder, host `plane.quantana.top`).
  (Separate from `proj_32948ecf…`, which routes to the dev tracker.)
- Set it: `widget_mode=leadgen`, `widget_cta_url=https://klavity.quantana.top/onboarding`,
  `widget_notify_email=<Vishal>`.
- Embed `<script src="/widget.js" data-project="<website-project-id>" defer>` on **all
  marketing pages** (home + `/snap` `/sims` `/autosim` + onboarding/privacy/terms).

## Powered by Klavity

Add a subtle "Powered by Klavity" footer at the bottom of the composer modal
(`buildModal` in `packages/core/src/modal.ts`), and on every success-screen mode.
Rebuild the widget bundle (`packages/sdk`: `vite build --config vite.widget.config.ts`)
and commit the regenerated `klavity-widget.iife.js` (it is git-tracked; deploy is pull-based).

## Data model changes

- `projects`: `+ widget_mode TEXT DEFAULT 'support'`, `+ widget_cta_url TEXT`,
  `+ widget_notify_email TEXT` (or equivalent settings rows).
- `feedback`: `+ contact_email TEXT NULL` (the captured lead email).
- Migrations are additive/idempotent (match existing migration style).

## New / changed API

- `GET /api/widget/config?project=<id>` — public; returns `{mode, ctaUrl}`.
- `POST /api/widget/lead` — public (rate-limited); `{project_id, feedback_id, email}` →
  attaches email, sends alert.
- `POST /api/feedback` — anonymous intake path added (above).
- Project settings write — set `widget_mode`/`widget_cta_url`/`widget_notify_email` (admin-gated).

## Widget changes (`packages/sdk/src/widget.ts` + `packages/core/src/modal.ts`)

- On mount, fetch `/api/widget/config` and store `mode` + `ctaUrl`.
- Replace the post-submit success with a mode-aware success screen (support / leadgen / off),
  including the email field and CTA, and the `POST /api/widget/lead` call.
- "Powered by Klavity" in the modal + success screen.

## Testing

Extend `prototype/server.feedback-widget.test.ts` (+ `server.widget.test.ts`):

- anonymous `/api/feedback` with a valid `project_id` persists + fires connector; `actor=null`.
- anonymous intake from a non-matching `Origin` is rejected; unknown `project_id` rejected.
- per-IP rate limit → 429 over the cap.
- `POST /api/widget/lead` attaches `contact_email`, validates ownership, triggers the
  (mocked) mail send; bad feedback_id / cross-project id rejected.
- `GET /api/widget/config` returns the configured mode/ctaUrl; defaults for unknown project;
  never returns `notify_email`.
- Admin config write is auth-gated.

## Out of scope (YAGNI)

- **Ticket visualiser** (markup.io-style visual review board) — explicitly the **next
  sub-project**, to be designed in its own brainstorm as a **new dedicated surface**
  (not an evolution of `/dashboard`). This spec just files tickets to Plane + persists
  them; the visual board comes after.
- Separate `leads` table / CRM sync (lead lives on the feedback row + Plane card).
- Slack/other alert channels (email only; leave a seam).
- Full custom copy editor (preset modes + CTA URL + notify email only).
- A/B testing of success-screen copy.

## Open follow-ups (post-MVP)

- Slack webhook channel when an env URL is present (channel-agnostic notifier).
- "Lead board" view inside Klavity (dashboard filter on `contact_email IS NOT NULL`).
- Honeypot field on the composer for bot suppression if spam appears.

## Reference

- Memory: [[klavity_rightclick_widget]], [[plane_ticket_source]], [[klavity_connectors]],
  [[klavity_home_served_file]], [[klavity_security_owasp]], [[deploy_klavity]].
