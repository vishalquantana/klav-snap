# Klavity OS — Slice 1: **Trails** (design)

**Date:** 2026-06-20
**Status:** Approved (brainstorming complete) → ready for implementation plan
**Research basis:** `docs/superpowers/research/2026-06-20-klavity-os-research-synthesis.md` (35 slices, 147 products) and `…-findings.json`.

---

## 1. Context & motivation

Klavity's third pillar ("Klavity OS") is a fully-automated, persona-driven, self-healing browser-testing suite. Research across 147 products produced an unambiguous mandate:

- **A wrong heal is worse than a red test.** The industry-wide failure mode is the *silent false green* — a self-healer re-resolves a broken target to a similar-but-wrong element, the assertion passes, and a real regression ships. Selector healing addresses only ~28% of real failures; ~60% of teams disable AI healing within 3 months.
- **Agents are ~55–65% reliable single-pass** (benchmarks inflate 2–3×) and **lie about success**; a VLM filing bugs in the wild measured **85% false positives**. This is the "AI slop" category Klavity must not become.
- **The field converged on one cost/reliability pattern — "intent-cache-heal":** cache the resolved action, replay deterministically with zero LLM on green, invoke the model only on drift.
- **Better self-healing is not a moat** — Octomind (agent explores → generates+maintains Playwright) was discontinued May 2026 once Playwright shipped free native agents. **Klavity's defensible wedge is the two assets nobody else pairs:** a cheap **vision-LLM perceptual oracle** (catches visually-wrong-but-DOM-valid bugs on run #1, zero ML cold-start) and **provenance-grounded personas** (the *intent/correctness oracle* every locator-healer structurally lacks).

Slice 1 builds the trustworthy deterministic substrate that the persona-autonomy slice later sits on, while already attacking the loudest commercial complaints (lock-in, opaque pricing, unaffordable continuous testing).

## 2. The loop (LLM-first → crystallize → replay → AI-on-break)

A **Trail** is an authored user flow. A **Walk** is one execution of a Trail. The authoring front door is **LLM-first with a human-demo fallback**; everything downstream is identical regardless of how the Trail was authored.

1. **Author (LLM-first).** User supplies a natural-language intent ("log in, add the $20 plan, check out"). An LLM agent drives the real browser via CDP and accomplishes it **once**. Expensive (~5–15k tokens, ~55–65% single-pass), but incurred **once per Trail at authoring time**, not per run. **Human-demo fallback:** when the agent stalls (auth walls, novel flows), the user demonstrates the flow once via the extension; it crystallizes identically.
2. **Crystallize.** On success, capture each resolved step (concrete locator + action + multi-signal fingerprint) and emit (a) a canonical **Trail spec** in SQLite/Turso, (b) **exportable Playwright/Bun code** (ownable, no lock-in, "static tests too"), and (c) seed the **locator cache** keyed by `SHA256(method, normalized-URL, DOM-hash, project-scope)`. The flaky LLM run is never the artifact — the crystal is.
3. **Replay (zero-LLM hot path).** Subsequent Walks replay the Playwright deterministically. Unchanged UI on a green build → **no LLM calls**. Fast, free, repeatable — the cost & determinism moat.
4. **Break → AI steps back in.** On step failure, **diagnose first** (drift / timing / test-data / runtime-error / visual / interaction-change / genuine-regression):
   - *Locator drift* → vision-LLM re-resolves by intent, **patches the step back into the Playwright artifact + cache as a reviewable diff** (heal). Next Walk is deterministic again.
   - *Genuine regression / goal cannot complete* → **never silently heals green** → emits a grounded finding (AMBER/RED). The break becomes Klavity's output.

The philosophical inversion vs the field: everyone else's AI-on-break tries to *make the test pass*; Klavity's decides **"drift to heal, or bug to report?"** using intent as the oracle.

## 3. Architecture — three layers

| Layer | Responsibility | Choice |
|---|---|---|
| **1 · Infra** | headless-Chrome sessions, persistence, extension loading, proxy/stealth | **Steel Browser** (Apache-2.0, self-hostable; serves hybrid-auth via session persistence + extension loading; open-core posture) |
| **2 · Actuation** | click/type/navigate/wait against the page | **Playwright/CDP** — deliberately keep Playwright's test-grade auto-wait/actionability (the "test DNA" Stagehand *shed* for automation speed). Playwright-under-Node fallback if Bun-CDP friction. |
| **3 · Intelligence** | cache · diagnose · heal · judge · ground findings | **ours** — borrows Stagehand's cache *design* but not its silent-heal, because the trust layer (AMBER, diagnosis-first, never-override-assertion, grounded findings) **is the product**. |

Rejected: **browser-use / page-agent / OpenCLI** (Python or in-page autonomous-agent loops, no caching, every-step-LLM cost/non-determinism — right category for the *persona-explorer* slice, wrong for deterministic replay). Adopting Stagehand wholesale rejected (automation-DNA, silent heal can't express our guardrails). Browserbase rejected for Layer 1 (hosted, cuts against self-hostable posture).

## 4. Components

- **Authoring agent (server, Bun + CDP via Steel).** Planner/Executor split: NL intent = Planner goal; cheap vision/grounding model (Qwen3-VL) = Executor doing per-step grounding. Reactive "what's next from the current screen" loop, not a rigid upfront plan.
- **Recorder (MV3 extension — local, real authed browser).** The human-demo fallback + the auth capture path. Captures semantic actions + per-target multi-signal fingerprint (ARIA role + accessible-name (faithful accname spec) → visible text → `data-testid` → DOM path → bbox → screenshot crop) + network + console + per-step screenshot. Exports `storageState` for server replay (**hybrid auth**: thorny OAuth/MFA happens once, locally).
- **Crystallizer (server).** Trajectory → Trail spec + exportable Playwright/Bun code + seeded locator cache.
- **Runner (server, Bun + CDP via Steel).** Executes steps with condition-based / vision "wait-until-X" waits (**never sleeps** — Microsoft: bumping sleeps does nothing). Captures a Playwright-style trace per Walk as the canonical evidence object.
- **Heal ladder.** Tier 0 cached replay (zero LLM) → Tier 1 multi-candidate semantic fallback (role+name → text → testid → structural, no LLM) → Tier 2 vision-LLM re-resolution on miss, persisted back to cache.
- **Oracle (vision-judged).** Each step's screenshot diffs against the Trail baseline; a new **"judge" AI workload** classifies each diff benign vs meaningful **on run #1**. Explicit checkpoints are hard assertions, **immutable to healing**.
- **Diagnosis → Verdict.** Classify failure class before any remediation; assign **GREEN / AMBER (healed-but-unconfirmed — never green) / RED**.
- **Findings gate.** Reuses shipped `groundQuote` + dedup/recurrence. See §6.
- **Dashboard.** Trails list, Walk history, trace viewer, heal diffs (approve/reject → learning signal), review queue, **published precision metric** (legit-bug rate).

## 5. Data model (new tables, all project-scoped)

`trails`, `trail_steps`, `locator_cache`, `trail_runs` (Walks), `run_steps`, `findings`. Reuses existing `personas` (for the next slice), connectors (Plane/GitHub/Jira/Linear), and the `ai_calls` ledger. New AI workloads — **author-drive**, **judge**, **reheal** — are cost-logged exactly like extract/react/reconcile, under the model-mix and daily cap.

## 6. Trust guardrails (the whole-corpus mandate — non-negotiable)

1. **Diagnosis-first.** Only true locator-drift is safe to heal; classify before remediating.
2. **Intent/goal verification, not "element found."** Confirm the goal completed via network/DOM ground truth — never the agent's self-report (agents lie).
3. **Confidence-gated, fail-loud.** Threshold **≥0.9** (not Healenium's 0.5). Below threshold → don't pass, don't silently heal → **AMBER + file for review**.
4. **Heal-as-reviewable-diff**, never silent runtime mutation. Old→new locator + confidence + screenshot diff + verbatim rationale; approve/reject is a learning signal.
5. **Healing never overrides a checkpoint/assertion** (Functionize's hard rule).

**Findings gate (honors "auto-file high-confidence, queue the rest", made slop-safe):**
- **Auto-file** only **hard, evidence-typed** findings — element genuinely gone after heal exhausted, network 5xx, or a failed *explicit checkpoint* — AND dedup-clean AND confidence ≥ high threshold.
- **Queue everything subjective** — all visual-diff "meaningful" findings and all AMBER heals → human-gated review queue with one-click file.
- **Publish a precision metric** per project; per-project toggle can widen auto-file once precision is proven.

**Layer E auto-file eligibility convention (by `FindingKind`):**
- `regression` → **hard / auto-file-eligible** (element genuinely gone after heal exhausted, network 5xx, or a failed explicit checkpoint) — subject to dedup-clean + confidence ≥ high threshold.
- `visual` → **queue-only** (subjective "meaningful" visual-diff finding; needs human review).
- `amber_heal` → **queue-only** (a healed-but-unconfirmed step per §6.3; the heal succeeded but is never auto-trusted).

## 7. Run modes & triggering (slice 1)

**On-demand only.** Manual Walks from the dashboard. Two conceptual modes designed-for: deterministic regression (cached replay) and statistical exploratory (average over N runs) — exploratory is realized in the persona slice. Scheduling, CI/webhook gating deferred.

## 8. Determinism strategy (slice 1)

Real backend + **condition-based / vision "wait-until-X" waits**, per-run data isolation, statistical handling for any probabilistic runs. The Meticulous-style virtual-clock + network-record/replay shim is **designed-for but deferred**.

## 9. Self-reliability harness

A small **WAREX-style fault-injection harness** (cookie banners, network blips, popups) runs against Klavity OS's *own* suite — off-the-shelf agents demonstrably don't recover (and click malicious popups 86–98% of the time, a security guardrail requirement). We must prove we do.

## 10. Success criteria

- A crystallized Trail re-walks **GREEN on an unchanged app with zero LLM calls.**
- Survives a **cosmetic DOM rename** via Tier 1 (zero/low LLM).
- Survives a **structural rewrite** via Tier 2 with a reviewable heal diff; next Walk is deterministic again.
- A **real regression produces RED/AMBER with grounded evidence — never a silent green.**
- Auto-filed findings meet a stated precision bar with **zero duplicate tickets**.
- Exportable Playwright artifact runs standalone (no-lock-in proof).

## 11. Non-goals (explicitly deferred)

Autonomous persona planner (next slice) · scheduled/CI triggering · virtual-clock/network-replay determinism shim · full a11y-tree-primary observation auto-router · mobile/native via WebDriver-BiDi.

## 12. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM-first authoring reliability (~55–65%) | Domain-narrowing (user's own app + context); human-demo fallback; human review before a Trail can gate. |
| AI-slop bug filing (85% FP in the wild) | Grounded network/DOM evidence + dedup + confidence gate + narrow auto-file types + published precision metric. |
| Silent false-green | Diagnosis-first + intent verification + AMBER state + never-override-assertion. |
| Bun ↔ Playwright/CDP friction | Steel + CDP-first; Playwright-under-Node fallback for the runner; validate early. |
| Cost (vision on every step) | Zero-LLM cached replay hot path; model-mix cheap→escalate only on ambiguity; cost-logged in `ai_calls`. |
