# Klavity OS — Trails — Plan G: Server-side Walk-Trigger (design)

**Date:** 2026-06-20
**Status:** Approved (brainstorming complete) → ready for implementation plan
**Builds on:** v0.27.0 (Trails engine A–E + rrweb replay, shipped to prod). `walkTrail()` already exists and is proven; this slice makes it *triggerable on the server* and seeds demo data so `/trails` shows real Walks.

## 1. Goal

Turn `/trails` from a dormant shell into a live monitor: **trigger a Trail walk on-demand from the dashboard**, run it **safely on the prod 1GB box**, and surface real **Walks → verdicts → heal-diffs → rrweb replays**. Seed demo Trails so the dashboard has data immediately.

## 2. Decisions (from brainstorm, 2026-06-20)

- **Browser runs on the prod box**, strictly guarded (the load-bearing constraint — see §6).
- **On-demand trigger first** (`POST /api/trails/:id/walk`, async + dashboard polling). Scheduled/cron = fast-follow, out of scope here.
- **Seed demo Trails:** a fixture demo set (GREEN / AMBER-heal / RED) served by the app at `/trails-demo/*`, **plus** one dogfood Trail walking the real public `klavity.quantana.top` landing (GREEN + a real replay).
- **Tier-0/1 for demos** (zero-LLM); the regression demo Trail is allowed **one cheap Tier-2 vision call** (classify "removed"), logged in `ai_calls` under the daily cap. Vision is gated per-trigger, off by default.

## 3. Architecture & components

- **`lib/trails-browser.ts`** — prod-safe Chromium launcher + a **global concurrency mutex (max 1 walk)**. `withWalkSlot(fn)` acquires the single slot or throws `WalkBusyError`; `launchGuarded()` launches headless Chromium with low-memory flags (`--single-process --no-sandbox --disable-dev-shm-usage --disable-gpu --no-zygote`) and a hard per-walk timeout that aborts + closes the browser. Browser closed in `finally` always.
- **`lib/trails-trigger.ts`** — `runWalkNow(projectId, trailId, opts)`: acquire slot (else throw busy) → `startWalk` (status `running`) → run `walkTrail({ replay: true, vision? })` in the **background** (not awaited by the request) → `finishWalk` with the verdict / `saveReplay` → release slot. Wrapped so a walk crash **never** propagates to the server event loop. Returns `runId` synchronously.
- **`server.ts` routes** — `POST /api/trails/:id/walk` (authed `sessionEmail||bearerEmail` + `resolveProject`): kicks off `runWalkNow`, returns **`200 {runId}`**, or **`409 {error:"A walk is already running"}`** when the slot is held, `401` unauth, `404` unknown trail. Plus a static route serving `/trails-demo/*` from `public/trails-demo/` (the bundled fixture pages).
- **`lib/trails-demo-seed.ts`** — `seedDemoTrails()`: **idempotently** (keyed by a stable demo dedup id) seed a demo project's Trails on boot — `demo-baseline` (walks `/trails-demo/journey/…` → GREEN), `demo-drift` (walks `/trails-demo/journey-drift-t1/…` → Tier-1 heal → AMBER + heal-diff), `demo-regression` (walks `/trails-demo/journey-regression/…` → RED + grounded finding), and `dogfood-landing` (walks the public `klavity.quantana.top/` → GREEN + replay). Re-running never duplicates.
- **`public/trails.html`** (modify) — a **"▶ Run"** button per Trail → `POST /api/trails/:id/walk` → on `200`, poll `/api/trails/dashboard` until that Walk's status leaves `running`, then render the verdict pill, the heal-diff (for the drift Trail), and the existing **"▶ Replay"** rrweb scrubber. On `409`, show "a walk is already running."
- **Deploy delta** — install Chromium on the box: `bunx playwright install chromium` + system deps (`playwright install-deps` / apt). Copy the journey fixtures into `public/trails-demo/`.

## 4. Data flow

Click **Run** → `POST /api/trails/:id/walk` → trigger acquires the single walk-slot → creates `Walk(running)`, returns `runId` → **background:** `walkTrail` drives guarded Chromium against the Trail's `baseUrl` with rrweb capture on → heal ladder (Tier-0 cache → Tier-1 candidates → Tier-2 vision only if `opts.vision` passed) → `finishWalk(verdict)` + `saveReplay` → slot released. The page polls `/api/trails/dashboard` and flips the row `running → GREEN/AMBER/RED`, then shows the heal-diff + replay.

## 5. Prod safety (the load-bearing part)

The 1GB app box runs `klav.service`; a Walk launches Chromium beside it. Guards, all mandatory:
1. **Concurrency lock = 1** (module-level mutex). A 2nd trigger → `409`, never a 2nd browser.
2. **Low-memory Chromium flags** (above); headless; one page.
3. **Hard per-walk timeout** (default 120s) → abort the walk, kill the browser.
4. **Always close** the browser in `finally`; **crash isolation** — the background walk is wrapped so an exception finalizes the Walk as `red` and releases the slot but never crashes the server.
5. **Escape hatch (documented, not built):** if 1GB proves tight under real use, move walks to a separate worker box — `trails-browser.ts` is the single seam to repoint.

## 6. Vision / cost

Triggered walks pass `vision` only when the Trail is flagged to allow it. The `demo-regression` Trail allows it → one cheap `qwen3-vl` "removed?" classification per run, logged in `ai_calls` (`reheal`) under `OPS_DAILY_CAP_USD`. All other demos are Tier-0/1 (zero LLM). The real-site dogfood is GREEN/Tier-0.

## 7. Testing

- **Unit:** the concurrency mutex (2nd concurrent acquire → `WalkBusyError`); `seedDemoTrails` idempotency (run twice → exactly one demo set); `runWalkNow` creates the Walk, returns `runId`, finalizes the verdict, releases the slot (inject a stub walk fn).
- **Real-Chromium e2e:** trigger `demo-baseline` against the served fixtures → Walk completes GREEN with a saved replay (≥1 segment); `demo-drift` → AMBER + a `fromSelector→toSelector` heal-diff in evidence; `demo-regression` (mock vision resolver in test) → RED + a `regression` finding.
- **Route smokes (subprocess server):** `POST /api/trails/:id/walk` authed → `200 {runId}`; second call while the slot is held → `409`; unauth → `401`; `GET /trails-demo/journey/landing.html` → `200`.

## 8. Non-goals (deferred)

Scheduled/cron walks (fast-follow); authed-dashboard dogfood via server-minted session injection (fast-follow); separate worker box / Steel infra; LLM-first authoring + extension recorder (Plan F).

## 9. Success criteria

From `/trails`, click **Run** on a demo Trail → status flips `running → verdict`: the **baseline** shows a scrubbable rrweb replay; the **drift** shows an AMBER **heal-diff** (`#checkout → …`); the **regression** shows **RED + a grounded finding**; the dogfood walks the real public site GREEN with a replay. A concurrent trigger returns `409`. The app box stays healthy (no OOM, `klav.service` active) across runs.
