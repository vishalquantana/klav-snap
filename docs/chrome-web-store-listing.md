# Chrome Web Store — Listing & Review Answers (Klavity Snap)

Paste these into the Chrome Web Store Developer Dashboard for the **Klavity Snap** item.
Privacy policy URL to use everywhere it's asked: **https://klavity.quantana.top/privacy**

---

## Store listing

**Name:** Klavity Snap

**Summary** (132-char max — matches `manifest.json` `description`):
> AI Sims review your pages and file bug & feature tickets to Jira, Linear, GitHub, or Plane — or report any page in one click.

**Category:** Developer Tools

**Detailed description:**
> Klavity Snap turns "this is broken / this is missing" into filed, actionable tickets.
>
> • **AI Sims review your pages.** Personas built from real customer calls look at the pages you choose and react in character — flagging bugs and friction — then file what they find as tickets, complete with a screenshot and the page context.
>
> • **Analyze any page in one click.** Open the popup, hit "Analyze this page", and your Sims review the current tab — no setup, no allowlist required.
>
> • **One-click bug & feature reports.** Capture the visible page, annotate it, and file an annotated ticket straight to Jira, Linear, GitHub Issues, or Plane — or to Klavity Cloud.
>
> • **You're in control.** Sims only review pages after you consent, and only on pages you allowlist or explicitly analyze. Pause anytime, or turn automatic reviews off entirely in Options.
>
> Built by Quantana. Open-core (FSL-1.1-ALv2).

**Screenshots:** at least one 1280×800 or 640×400. Suggested shots: the popup (sign-in + "Analyze this page"), an in-page Sim reaction bubble, and the dashboard ticket list.

---

## Single purpose (required field)

> Klavity Snap captures web pages the user consents to and turns them into AI-reviewed bug and feature tickets in the user's issue tracker.

---

## Permission justifications (Privacy practices tab)

| Permission | Justification to paste |
|---|---|
| `activeTab` | Capture a screenshot of the page the user is currently on when they file a report or run "Analyze this page". |
| `storage` | Store the user's settings, sign-in session, selected project, and per-domain consent locally in the browser. |
| `scripting` | Inject Klavity's in-page reporter and Sim review overlay into the page the user is actively working on. |
| `tabs` | Read the active tab's URL so reports and reviews are attributed to the correct page and routed to that tab. |
| `cookies` | Read the Klavity session cookie on klavity.quantana.top for silent sign-in, so a user already signed in to the website doesn't re-enter a code. |
| `host_permissions: <all_urls>` | Sims and the reporter must be able to run on any page the user explicitly chooses to review or report. Capture is consent-gated: it happens only after the user consents and only on allowlisted URLs or a page the user explicitly analyzes. |
| `https://*.atlassian.net/*`, `https://api.linear.app/*`, `https://api.github.com/*`, `https://api.plane.so/*` | File tickets directly from the browser to the issue tracker the user has connected (Jira, Linear, GitHub, Plane) when using direct-integration mode. |

---

## Data usage disclosures (certifications)

Declare that the extension **collects**:
- **Authentication information** — the user's email (for passwordless sign-in).
- **Website content** — screenshots of the visible area and structural context of pages the user consents to review/report.
- **User activity** — the specific pages the user chooses to report on or analyze.

Certify (all true for Klavity):
- ✅ Data is **not** sold or transferred to third parties outside the approved use cases (it is sent only to the LLM provider that generates the review, the user's chosen issue tracker, and Klavity's own storage — all to deliver the feature the user asked for).
- ✅ Data is **not** used or transferred for purposes unrelated to the item's single purpose.
- ✅ Data is **not** used or transferred to determine creditworthiness or for lending.

**Privacy policy URL:** https://klavity.quantana.top/privacy

---

## Reviewer notes (optional "notes to reviewer" field)

> Klavity Snap requires broad host access because users point AI "Sims" at arbitrary pages of
> their own products. All page capture is consent-gated (a per-website confirm before the first
> screenshot) and, for automatic review, restricted to URLs the user's workspace has allowlisted.
> Screenshots are stored privately and expire after 30 days. No capture occurs on pages the user
> has not consented to, and automatic review can be disabled entirely in the extension's Options.

---

## Packaging reminder

Upload artifact is built from `packages/extension/dist` (the zip's root must contain
`manifest.json`). Rebuild + re-zip after any change:

```bash
cd packages/extension && npm run build
cd dist && zip -rq ../../../klavity-snap-<version>.zip .
```

The Chrome Web Store rejects an upload whose `manifest.json` `version` is **not higher** than the
currently published version — bump the version (lockstep across all manifests + PRD + CHANGELOG)
before re-uploading an already-published item.
