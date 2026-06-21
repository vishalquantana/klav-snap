# Recurring-Issue / Regression Memory + Cited "Virtual Customer"

> **Status:** Backlog / future-work (not scheduled). **Date:** 2026-06-20. **Origin:** competitive + market research (Insights-tier differentiation vs Jam.dev; VoC/synthetic-twin landscape).
> **Likely target version when picked up:** MINOR (new user-facing insight surface), with a possible pricing-tier (Insights) rider.

**One-line summary:** Turn Klavity's accumulated, deduped, time-stamped corpus of real bug/feedback reports into an institutional memory that, on every new report, says "you already reported this — it's report #X from <date>, and it's back," and exposes that same memory through a conversational, **citation-grounded** "have users hit this before?" interface that answers only from real prior reports — never from a synthetic oracle.

---

## 1. Problem / why

Klavity's capture flow today — right-click → annotated screenshot → AI-vision review → connector auto-copy (`docs/PRD.md` §2) — is the **commoditized** part of the product. Jam.dev sells essentially that capture experience at **$14/seat**, and the overlay/annotation work (`docs/backlog/overlay-annotation.md`) only deepens parity. Capture is table stakes. The defensible value has to live in the **insight / synthesis layer** that sits on top of the corpus we already accumulate, not in the act of filing.

The job-to-be-done this ticket addresses:

> **"Never hear 'I told you last time' again."**

Who feels this acutely: the **founder or PM at a small / early team**, where institutional memory of "users have complained about this before" lives in **one person's head**. When that person is in a meeting, on holiday, or simply forgets, the team re-files a known issue, ships a regression of something already fixed, or argues about whether a complaint is new or recurring — with no shared, dated record to settle it. Bigger orgs paper over this with a VoC analyst or a heavyweight tool; small teams have neither.

Klavity is uniquely positioned because it already **captures a proprietary corpus of real user reports at the source** (extension + connectors), and already has a Sims + persona-insight layer (`docs/superpowers/specs/2026-06-18-persona-quality-design.md`) and a Sim Studio attribution UI (`docs/superpowers/specs/2026-06-19-sim-studio-design.md`). What we don't yet have is a **memory that persists across reports and warns on recurrence/regression**, nor a way to **interrogate** that memory in plain language. The PRD already flags that today's regression signal is **prospective only** and excludes legacy-import traits (`docs/PRD.md` §5, "regression detection is prospective") — this ticket is the retrospective, corpus-wide complement.

---

## 2. Proposed solution

Two parts, shipped in a deliberate order. **Part 1 (memory) is the headline and must be built first**; Part 2 is the conversational *interface* over Part 1, not a separate engine.

### Part 1 — Recurring-issue & regression memory (HEADLINE / build first)

When a new report arrives, match it against the existing corpus and surface, inline on the new report:

- **"You already reported this"** — a link to the matching prior report(s) with their dates ("this matches report #X from 2026-04-02").
- A **recurrence flag** — the same issue has been reported N times across M dates.
- A **regression flag** — the issue was previously marked resolved and has now resurfaced (the retrospective, corpus-grounded version of the prospective `reopen` signal in `docs/PRD.md` §5).

This is the **defensible** part: it *compounds* with the accumulated, deduped, time-stamped corpus — the longer a customer runs Klavity, the harder it is to replicate. The hard engineering is not the UI; it is **robust dedup + stable issue-identity clustering + linkage to prior reports with dates**. "Issue identity" must be stable enough that paraphrased, differently-screenshotted reports of the same underlying problem cluster together, without over-merging genuinely distinct issues.

### Part 2 — Cited virtual-customer query (INTERFACE / second)

A conversational surface — "have users hit X before?", "what's been complained about most on the checkout flow?", "has this regression been reported before?" — that answers **strictly from real prior reports, with citations and dates**. Every claim links to the specific report(s) that back it. This is a **memory-recall** interface, deliberately **not** a synthetic/generative oracle that invents a plausible-sounding customer. Grounding every answer in cited, dated, real reports is what lets us sidestep the synthetic-data credibility problem that dogs the generative-persona category (see §5). It is the UX skin over Part 1's memory — same clustering, same linkage, conversational presentation.

---

## 3. Key capabilities

1. **Cross-report dedup + issue-identity clustering** — group new and historical reports into stable issue clusters that survive paraphrase, different screenshots, and different reporters; resist over-merging distinct issues. The corpus-wide, retrospective sibling of the extension's per-session dedup (`docs/superpowers/specs/2026-06-18-feedback-trigger-dedup-design.md`).
2. **"You already reported this" inline on intake** — on a new report, surface matching prior report(s) + their dates before the user (re-)files.
3. **Recurrence flag** — "reported N times across M dates," with the lineage of prior reports.
4. **Regression flag (retrospective)** — previously-resolved issue resurfaces; corpus-grounded, including issues whose lineage predates a clean `resolve`/`reopen` chain (the gap the PRD's prospective signal leaves open).
5. **Cited virtual-customer query** — conversational "have users hit X before?" answered only from real prior reports, every claim citing report id(s) + date(s); explicit "no prior reports found" when the corpus is silent (no fabrication).
6. **Date-anchored evidence everywhere** — every memory claim and every query answer is traceable to specific, dated reports (reuses Sim Studio's attribution model — see §4).

---

## 4. How it reuses existing Klavity assets

This feature should be built **on top of existing surfaces and schema where possible**, not as a parallel stack:

- **The corpus itself** — the deduped, time-stamped reports captured via the extension + connector pipeline (`docs/PRD.md` §2) are the substrate. No new capture surface.
- **Persona / insight layer** — the specificity + severity + recurrence/regression work in `docs/superpowers/specs/2026-06-18-persona-quality-design.md` already models "issue specificity" and a recurrence/regression concept at the trait level; this ticket lifts that from per-trait/prospective to corpus-wide/retrospective. Reuse the trait/insight identity rather than inventing a second clustering scheme.
- **Sim Studio attribution UI** — the 3-pane "why does this persona say X / on what day / from which transcript" trace-back (`docs/superpowers/specs/2026-06-19-sim-studio-design.md`) is already the right metaphor for "here is the dated evidence behind this memory claim." The cited-query interface (Part 2) should render citations using the same attribution model, not a new one.
- **Per-session dedup machinery** — `klavDomSig` / `klavReviewedRoutes` and the dedup design (`docs/superpowers/specs/2026-06-18-feedback-trigger-dedup-design.md`) solve the *intra-session* duplicate-flood problem; the *cross-report, cross-time* clustering here is the durable counterpart and should share heuristics where they generalize.
- **Connector pipeline** — recurrence/regression flags can ride the **existing** feedback/ticket payload into Jira / Linear / GitHub / Plane rather than forking a new ticket model (mirrors the no-new-schema principle in `docs/backlog/overlay-annotation.md` §2).

**Avoid new schema unless forced:** prefer extending the existing report/insight/trait records with cluster-id + lineage references over a parallel "memory" store.

---

## 5. Competitive whitespace / prior art / watchlist

**Whitespace:** nobody cleanly occupies *"an interrogable twin built from YOUR bug transcripts + a memory of prior complaints, for small / early teams."* The nearest neighbours each miss on one axis:

- **Enterpret** — enterprise VoC: ask-the-corpus + regression alerts. Strong on memory, but enterprise-priced, not conversational/early-team, and not built from a team's own at-source bug capture. *Closest on the memory axis — watch.*
- **DoppelIQ** — twin-from-real-data, but aimed at **marketers / retail**, not product bug/feedback memory. *Validates "twin from real data," wrong domain.*
- **Swarm** — bug-flagging twins, but **forward-looking simulation** ("what might break"), not memory of what was actually reported. *Adjacent, opposite time-direction.*
- **Synthetic Users** — generic personas, **no real grounding**. *The category whose credibility problem we deliberately avoid.*

Treat these as **prior art / watchlist**, not blockers. Klavity's wedge is the combination none of them has: *real, at-source, deduped, dated bug corpus → memory + cited conversational recall → priced and packaged for small teams.*

**Why lead with memory, not the conversational query:**

1. **More defensible** — memory compounds with the proprietary corpus; the conversational layer alone is a thin UX skin a competitor could clone.
2. **More trustable** — every memory claim cites a real, dated prior report, sidestepping the synthetic-credibility liability that undermines the generative-persona category (Synthetic Users et al.). The conversational query is valuable *because* it inherits this grounding — so it must remain recall-over-real-reports, never a generative oracle.

---

## 6. Pricing tie-in (Insights tier)

This feature is the concrete justification for an **"Insights" tier at ~$39–49**, distinct from a capture-only tier:

- **Capture is commoditized** — Jam.dev anchors screenshot→ticket at **$14/seat**. Competing there is a race to the bottom; Klavity's overlay/annotation work (`docs/backlog/overlay-annotation.md`) keeps us at *parity*, not ahead.
- **Memory + cited recall is where willingness-to-pay lives** — "never re-file a known bug / never re-ship a fixed regression / settle 'is this new?' with dated evidence" is an ongoing-value proposition that grows with corpus size, which justifies a recurring premium well above capture-only.
- Package Part 1 (memory/flags) and Part 2 (cited query) as the headline of the Insights tier; keep capture (Snap) in the lower tier.

---

## 7. Open questions / risks

- **Dedup / issue-identity hardness (the core risk).** Clustering paraphrased, differently-screenshotted, multi-reporter reports of the *same* underlying issue — without over-merging distinct issues — is genuinely hard and is the make-or-break of this feature. Embedding similarity + the existing trait/insight identity is a starting point; needs a real spike and a precision/recall target. A wrong "you already reported this" erodes trust fast.
- **Synthetic-credibility avoidance.** Part 2 must be **provably grounded**: every answer cites real report ids + dates, and "no prior reports found" is a first-class answer. Any drift toward generative/fabricated "what a customer would say" reintroduces exactly the credibility problem we're differentiating against — guard this in design and copy.
- **Corpus cold-start.** A brand-new customer has no corpus, so memory and cited recall are empty on day one — the feature's value back-loads. Need an honest empty-state, possibly a "memory is warming up" framing, and clarity that the Insights tier's value accrues over time. Decide whether legacy/imported reports (which, like legacy-import traits in `docs/PRD.md` §5, lack a clean resolve/reopen lineage) can seed memory and with what caveats.
- **Regression precision.** Distinguishing a true regression (resolved → resurfaced) from a never-fully-fixed long-running issue, especially without a clean resolve event in the lineage.
- **Schema discipline.** Confirm cluster-id + lineage can extend existing report/insight/trait records and ride the existing connector payload without a schema fork (cf. §4).
- **Privacy / corpus boundaries.** Memory and cited recall must respect per-project / per-customer isolation — never cite one customer's reports to another.

---

## 8. Rough effort / phasing (high-level — not a commitment)

- **Phase 0 — Spike:** issue-identity clustering on a real corpus; set a precision/recall bar for "same issue" matching. De-risks the single hardest unknown before any UI.
- **Phase 1 — Memory (headline):** cross-report dedup + clustering + dated lineage; "you already reported this" on intake; recurrence + retrospective regression flags; flags ride the existing connector payload.
- **Phase 2 — Cited virtual-customer query (interface):** conversational recall over the Phase 1 memory, every answer citing real dated reports (reusing Sim Studio's attribution rendering); explicit empty/no-match states.
- **Phase 3 (optional):** Insights-tier packaging/gating, cold-start "warming up" experience, richer corpus-wide analytics over the same memory.

Phase 2 is a skin over Phase 1; keep the memory/clustering layer interface-agnostic so the conversational surface never forks it.

---

## 9. Provenance

This ticket was written from **competitive + market research**: the differentiation case against **Jam.dev** ($14/seat capture commoditization) motivating an **Insights tier (~$39–49)** in the synthesis layer, and a scan of the VoC / synthetic-twin landscape — **Enterpret** (enterprise VoC, ask-the-corpus + regression alerts), **DoppelIQ** (twin-from-real-data, marketers/retail), **Swarm** (forward-looking bug-flagging twins), and **Synthetic Users** (generic, ungrounded personas) — establishing the whitespace for an *interrogable twin from a team's own at-source bug corpus + memory of prior complaints, for small/early teams*. The decision to **lead with memory and treat the conversational query as interface** (defensibility + trust via real, cited grounding) is the synthesized conclusion this ticket specifies, not re-litigates.
