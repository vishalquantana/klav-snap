# Klavity 0.18.0 — Sims that review your product, on demand

*19 June 2026*

Klavity turns "this is broken / this is missing" into filed, actionable tickets — first
by hand, then by AI persona. This release is about making the **AI persona** part real,
fast, and trustworthy. Here's everything that landed.

## 🧬 Sims review your real pages
Klavity **Sims** are AI personas built from your real customer interview transcripts. They
look at your actual product pages, react in each customer's own voice, flag what's broken or
missing, and **file the bug or feature request for you** — with a screenshot and full page
context. Persona insights now carry provenance (the original customer quote) and recurrence
signals, so a regression a customer already complained about gets flagged as exactly that.

## ⚡ "Analyze this page" — one click, zero setup *(new in 0.18.0)*
Open the extension popup on any page, hit **Analyze this page**, and your Sims review the
current tab on the spot — no allowlist, no configuration. Built for solo devs: your project
resolves automatically. A one-time per-site confirm keeps capture consensual; reactions show
up in-page and land as tickets in your dashboard. Passive auto-review on allowlisted URLs
still works too — both modes, your call.

## 🧩 Embeddable live-Sims widget *(new in 0.17.0)*
Drop one script tag onto your web app and your Sims review the real page **with no Chrome
extension at all** — ideal for teammates who won't install anything:

```html
<script src="https://klavity.quantana.top/widget.js" data-project="…" defer></script>
```

## 🔌 Ship tickets where your team already works
Cloud ticket management (status / assignee / notes) plus a **pluggable connector system**:
export to **Jira, Linear, GitHub Issues, Plane, or a webhook** — manually per ticket or
auto-copy on file. Connectors are now **testable before you trust them** (send a test ticket)
and **editable**, and the auto-copy toggle is explicit about what it does.

## 🚀 A real first run
New signups now flow through a guided setup wizard instead of a cold dashboard, with a
**first-run checklist** that ticks off as you go (install extension → add your URL → add Sims
→ first review). The extension popup got the same care: cleaner sign-in, a readable connection
status, and reaction bubbles that tell you the outcome ("saved to your dashboard").

## 🔒 Privacy by default
Capture is **consent-gated** — a per-site confirm before the first screenshot, and automatic
review only on URLs you allowlist. Screenshots are stored privately and **expire after 30
days**; integration secrets are encrypted at rest. Full details:
[Privacy](https://klavity.quantana.top/privacy) · [Terms](https://klavity.quantana.top/terms).

---

**Try it:** [klavity.quantana.top](https://klavity.quantana.top) · Built by
[Quantana](https://quantana.com.au) · Open-core (FSL-1.1-ALv2)
