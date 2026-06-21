# Marker.io — Competitor Profile + Klavity PLG Strategy

**URL**: https://marker.io · **Generated**: 2026-06-21 · **Depth**: deep profile (single competitor)
**Purpose**: Take everything marker.io paywalls and give it away free in Klavity Snap, so the free tier becomes the acquisition wedge that funnels teams into our differentiated AI layer (Sims + AutoSim).

---

## 1. At a Glance

| Metric | Value |
|--------|-------|
| Tagline | "The website feedback tool for bug reporting, QA, and UAT" |
| Sub | "Capture website feedback, bug reports, and visual feedback faster – without endless emails, PDFs, or screenshots." |
| Active teams | 3,000+ |
| Issues reported (lifetime) | ~3.85M |
| Ratings | G2 4.7 (22) · Capterra 4.8 (52) · Chrome Web Store 4.3 (185) |
| Notable customers | L'Oréal, Fujitsu, Patreon, Amgen |
| Pricing | $39–$149/mo (annual); Business custom; Agency $99/mo |
| Free tier | **None** — 15-day trial only, no credit card |

**One-line read:** Marker.io is a polished, manual, human-in-the-loop visual bug reporter. A person clicks → annotates → it attaches console/network/env metadata → it syncs to Jira/GitHub/etc. That's the whole product. There is **no autonomous testing, no AI personas, no auto-discovery of bugs.** Their "AI" is cosmetic (translate / rewrite / title-gen).

---

## 2. Pricing & exactly what they paywall

| Tier | Annual | Seats | Projects | Guests | Page views/mo |
|------|--------|-------|----------|--------|---------------|
| Starter | $39/mo | 3 | 1 | 10 | 5k |
| Team | $149/mo | 15 | 3 | 50 | 25k |
| Agency | $99/mo | 15 | 50 | 50 | — |
| Business | custom | custom | custom | custom | custom |

**Gated behind Starter ($39) at minimum:** the widget, screenshots, annotations, environment/browser metadata, issue tracking, status/comments, basic integrations.

**Gated behind Team ($149):** ← *this is the juicy list to weaponize*
- Jira integration + two-way issue **sync**
- **Session replay**
- **Developer tools** (console logs + network logs attached to reports)
- Custom metadata (JS SDK)
- Custom issue types
- **Custom branding** on the widget
- CSV export, webhooks, analytics

**Gated behind Business (custom):** SSO/SAML, audit logs, data masking, admin roles/user groups, Zendesk/Intercom, account manager.

**Friction points reviewers complain about:**
- "Expensive" — esp. for solo devs / small agencies (jump from $39 → $149 is steep)
- No real-time **dedup** of issues → duplicate tickets on the same page
- Wants video feedback (only partially addressed)
- Hard paywall: no free tier at all, only a 15-day trial

Sources: [Capterra reviews](https://www.capterra.com/p/152269/Marker/reviews/) · [G2 pricing](https://www.g2.com/products/marker-io/pricing) · [marker.io/pricing](https://marker.io/pricing) · [marker.io/features](https://marker.io/features)

---

## 3. The core insight

Marker.io's **entire $149/mo Team tier is table-stakes feedback plumbing** — widget, dev-tools capture, session replay, branding, two-way sync. Klavity Snap already has most of this built (widget, screenshots, connectors to Plane/GitHub/Jira/Linear/webhook, appearance/branding config, grounded-quote + dedup which marker.io *lacks*).

So the move isn't to compete on the plumbing — it's to **commoditize it to $0**. Give away everything marker charges $149 for. That neutralizes their only reason-to-pay, removes their funnel, and pulls their exact ICP (agencies, QA, product teams) into Klavity. Then we monetize one tier up — on the AI layer they structurally cannot match:

```
  Marker.io's whole product  ─────►  Klavity FREE tier (the wedge)
                                          │
                                          ▼
              Klavity's moat ─────►  Sims (AI personas auto-find bugs)
                                          │
                                          ▼
                              AutoSim / OS Trails (autonomous regression)
```

We're not "a cheaper marker.io." We're "marker.io is free here, *and* the bugs report themselves."

---

## 4. Feature-by-feature: marker.io paid → Klavity free

Status legend: ✅ have it · 🟡 partial / needs polish · 🔨 build to close gap

| Marker.io feature (tier) | Klavity status | Notes / action |
|---|---|---|
| Feedback widget, click-to-report (Starter) | ✅ | Right-click → composer, no extension needed (v0.26.2). Lead-gen/support modes (v0.33.0). |
| Screenshots + annotation (Starter) | 🟡 | Have S3 screenshot capture. **Gap: on-image annotation/markup tools** — marker's signature UX. 🔨 |
| Environment/browser metadata (Starter) | ✅ | Captured in report payload. |
| Console + network logs ("Developer tools", **Team $149**) | 🟡 | Verify we attach console/network logs to every report. If not, 🔨 — this is a top reason teams pay marker. |
| **Session replay** (Team $149) | 🔨 | Highest-value gated feature. Either build lightweight rrweb-style replay or partner/integrate. Big "free vs their $149" headline. |
| Two-way issue sync — Jira/GitHub/Linear (Team $149) | ✅ | Connectors: webhook/Plane/GitHub/Jira/Linear, manual + auto-copy (v0.13.0). Confirm **two-way status sync**, not just push. 🟡 |
| Custom branding on widget (Team $149) | ✅ | Per-project theme/custom colors/thank-you/Genie anim (v0.31.0). |
| Custom metadata / JS SDK (Team $149) | 🟡 | Confirm public SDK to pass user/env metadata. 🔨 if missing. |
| Analytics / workspace dashboard (Team $149) | ✅ | Sims dashboard, multi-project, provenance (v0.7.0). |
| Issue dedup | ✅ **(we beat them)** | Suggested-bug dedup + recurrence bump (v0.24.0). Marker reviewers *complain* this is missing. Lead with it. |
| Grounded/verbatim quoting | ✅ **(we beat them)** | groundQuote verified tri-state — marker has nothing like it. |
| Guests/reporters with no account (Starter) | ✅ | First-party anon /api/feedback. |
| AI translate/rewrite/title (beta) | ✅ **(we lap them)** | Our AI *finds and writes* the bug; theirs only reformats what a human typed. |
| SSO/SAML, audit logs, data masking (Business) | 🔨 | Enterprise upsell layer — park for later, not needed for PLG wedge. |

**Net:** ~70% already shipped. The free-tier wedge needs realistically 2–3 builds to be a clean "everything marker paywalls, free": **session replay, on-image annotation, console/network log attach + verify two-way sync.**

---

## 5. The PLG funnel — free wedge → Sims → AutoSim

**Positioning line for the pricing/landing page:**
> "Everything Marker.io charges $149/mo for — the widget, dev-tools capture, session replay, two-way Jira/GitHub sync, custom branding — is **free** in Klavity. Then your bugs start reporting themselves."

### Stage 0 — Land (free, zero-friction)
- Free forever tier = all of marker's Team-tier plumbing. No seat caps that bite (their 3-seat Starter is a wall; make ours generous).
- Direct **"Marker.io alternative"** and **"Marker.io vs Klavity"** comparison pages (use the `competitors` skill) — capture their branded + high-intent search. They have only 22 G2 reviews; SEO surface is thin and beatable.
- Migration hook: "Import your Marker.io projects / point your widget at us in 1 line."

### Stage 1 — Activate (the aha that marker can't give)
- Team installs the free widget, wires a connector. Same-day value = parity with marker.
- **Then surface the wedge:** "You've collected 12 human reports this week. Want Klavity to find the ones nobody reported?" → one-click run a **Sim** persona on their site.
- Sim returns bugs *no human filed* (the expectations spine: discover → validate). This is the irreversible "whoa" moment. Marker has no equivalent — a human must witness every bug.

### Stage 2 — Convert (paid = the AI layer)
- Free: unlimited human/widget reports + plumbing (commodity).
- **Paid tier(s) meter the AI:** Sim runs / personas / AutoSim trail executions / AI credits. This is where the OpenRouter cost lives (ai_calls ledger, opsadmin) — so metering maps cleanly to real COGS.
- Pricing psychology: undercut marker's $149 on the *plumbing* (it's free) and charge for *outcomes* (bugs found automatically), not seats. Outcome-based pricing is defensible and aligns with value.

### Stage 3 — Expand (the moat compounds)
- AutoSim / OS Trails: crystallized Trails replay with zero-LLM, AI heals-or-files on break → continuous autonomous regression. This is a category marker.io is not even in.
- Land-and-expand: free widget on one site → Sims on the flagship flow → AutoSim guarding every release across all projects.

---

## 6. Why marker.io structurally can't follow

1. **No agent/sim infra.** Their product assumes a human is present. Building autonomous persona testing is a from-scratch rebuild, not a feature add.
2. **Seat-based pricing trap.** Their revenue = seats × plumbing. If plumbing goes free industry-wide, their model breaks; ours starts at outcomes.
3. **Thin moat.** Reviewers already ask for the things we have (dedup, video). Low review count = beatable SEO/social proof. We out-ship them on AI.
4. **Open-core leverage.** Klavity is open-core (Turso/SQLite) — self-host + free tier is on-brand; for them, free undercuts their only SKU.

---

## 7. Gap-closers (verified against the codebase 2026-06-21)

Code audit corrects section 4: **annotation is already built** (`core/src/annotator.ts` — pen/rect/arrow/text + undo/clear), and **console-error + network-failure capture already exists** in both the extension (`extension/src/content.ts`) and the npm SDK (`sdk/src/index.ts`). So those are NOT gaps. The real, narrower gaps:

| # | Gap-closer | Why it matters vs marker | Effort | Leverage | Evidence |
|---|---|---|---|---|---|
| **G1** | **Session replay** | Marker's top Team ($149) feature; we have nothing. Biggest "$149→free" headline. | L (build, e.g. rrweb) | ★★★ | no `rrweb`/replay anywhere in repo |
| **G2** | **Wire dev-tools capture into the no-install widget** | The PLG snippet path (`sdk/src/widget.ts`) sends only `{type,description,pageUrl,screenshots}` — it does **not** attach console/network/env context, even though the extension + npm SDK already do. The acquisition path is the one missing marker's "developer tools." | S (reuse existing ring-buffer code) | ★★★ | `widget.ts:74-77,227-244` payload has no `context` |
| **G3** | **Capture fidelity: full logs, not just failures** | We capture console *errors* + *failed* fetches only. Marker captures **all** console logs + **all** network requests incl. XHR. Wrap `console.log/warn/info` + `XMLHttpRequest`, record non-failed requests. | M | ★★ | `content.ts` / `sdk/index.ts` wrap `fetch` + error events only |
| **G4** | **Two-way status sync (external trackers)** | Connectors push out to Jira/GitHub/Linear/Plane; confirm status flows **back** from the tracker into Klavity (marker advertises two-way sync). Verify → build if push-only. | S–M (verify first) | ★★ | connectors in `core/src/integrations/*` are outbound |
| **G5** | **Custom metadata / public JS SDK** | npm SDK captures internally; the embed widget exposes no `identify(user)` / custom-keys API. Marker sells this (Team). Expose + document. | S–M | ★ | `widget.ts` has no metadata hook |
| **G6** | **Enterprise (park — not PLG-blocking)** | SSO/SAML, audit logs, data masking, admin roles/groups — marker gates to Business. Needed later for enterprise upsell, not for the free wedge. | L | ☆ (defer) | — |

**Recommended order:** G2 (cheap, unblocks the PLG claim today) → G1 (the headline build) → G3 → G4 (verify) → G5 → G6 (defer).

## 8. Go-to-market (parallel, cheap)
- `competitors` skill → "Marker.io alternative" + "Marker.io vs Klavity" pages (free-tier + AI-finds-bugs angle).
- Free-tier page that explicitly tables "Marker Team $149 vs Klavity Free."
- Activation nudge in-product: after N human reports → "let a Sim find the rest" CTA.

## 9. Pricing (decision needed)
- Lock the meter: per Sim-run? per persona? per AutoSim execution? AI-credit pool? (`ai_calls` ledger already gives real COGS to back this.)

---

## Raw data sources
- marker.io homepage, /pricing, /features — scraped 2026-06-21
- Capterra & G2 reviews/pricing — 2026-06-21 (links inline above)
