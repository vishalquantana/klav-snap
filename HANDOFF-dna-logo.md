# Handoff — Klavity DNA logo animation

**Written:** 2026-06-20 14:34 IST · **Dir:** `/Users/vishalkumar/Downloads/qbug/klav-snap/` (NOT a git repo — all work is local HTML files)

## Goal
A beautiful, looping animation of the Klavity DNA-helix logo for use as a loader / launch splash / animated app icon. All self-contained single-file HTML (canvas + rAF), no build, no deps. Brand palette: monochrome white + periwinkle (`#9aa0ff` / `150,156,255`) on dark; fonts Fraunces / Hanken Grotesk / JetBrains Mono. The mark is the "Beaded Helix" (#17 in `local-logos.html`) — two strands of dots + faint horizontal rungs.

## Current canonical files (open in a browser; for ones with a freeze hook, append `#<ms>` to inspect a frame; some need a localhost server: `cd klav-snap && python3 -m http.server 8731`)
- **`dna-logo-studio.html`** ⭐ THE MAIN DELIVERABLE — live parameter editor for the ONE animation. Sliders for every aspect + scrub bar + **copy-pastable JSON** (the lock-in artifact). Default rest = `( )` with lines. This is a *superset engine*: its JSON reproduces the baseline and all variations. **Going forward, its JSON is the source of truth.**
- **`dna-logo-ospin.html`** — the agreed baseline single animation (the studio with default-ish params). Sequence + all decisions baked in. Has a `#<ms>` freeze hook.
- `dna-logo-rungs-variations.html` — 5 variations of how the rungs connect (Meet-in-Middle / Stagger / Sweep / Snap / Zipper). Has freeze hook.
- `dna-logo-ospin-variations.html` — 20 variations (spin/openness/order/flavor). NOTE: on OLD logic (flat-ladder rest + grow-taller helix) — superseded.
- `dna-logo-untwist.html`, `dna-logo-variations.html`, `dna-logo-animation.html` — earlier explorations, superseded.
- `local-logos.html` — the original 20 static logo concepts (reference; #17 Beaded Helix is the chosen mark).

## The agreed animation (what's locked by user feedback)
Loop: **`( )` rest → spins → winds up into the double helix → unwinds back to `( )`**. Key locked decisions, in the order the user gave them:
1. Sequence builds dots → curves → connect → spin → extend (original ask).
2. Rest/loop point must look like the **logo mark**, then later refined to: the **base logo IS the `( )` shape** (open O / two curved parens) — **NOT** the flat `| |` ladder. Do not dwell on the flat ladder.
3. The **`( )` is OPEN** — strands must **not** pinch to touching points at top & bottom (a gap/cut). Achieved with O-coil ≈ 0.40 (0.5 is where they touch).
4. **Height must stay constant** — the helix used to grow taller than the logo; fixed by **zoom-fit**: pin on-screen height, zoom OUT so the full (naturally taller) helix fits, zoom back IN for `( )`. (`zoomFit` on.)
5. Helix reads sparse with only 6 beads → **densify**: keep 6 primary "logo" beads, fade in 5 in-between beads ONLY during the helix (`densify` on). Logo stays clean, helix gets rich.
6. **Rungs animate**: lines grow from the two dots and **join in the middle**. 5 join styles exist.
7. The `( )` **rest should show its lines** (default state = `( )` WITH connecting rungs).
8. Rung split should be **slower** and happen **in parallel with the flattening** (not stop-split-resume) — there's a `linesFollowHelix` mode that ties rung connect/split to the helix coil for exactly this; or use the independent line in/out keyframes.

## Engine model (how it works, all params live in the studio)
The logo, the `( )`, and the helix are ONE model at different **coil** amounts: `coils 0` = flat ladder (avoid), `~0.40` = open `( )`, `~1.4` = helix. `phase` = spin (raised-cosine velocity → starts/ends at rest, lands on whole turns ⇒ seamless loop). Geometry: `R` (bow) interpolates O→helix; height pinned via zoom. Beads depth-sorted (z from cos) so strands cross convincingly. Studio JSON keys: `N, restHeight, helixHeight, oBow, helixBow, beadRadius, beadGlow, rungWidth, backboneOpacity, oCoil, helixCoil, restEnd, windEnd, helixEnd, unwindEnd, cycleMs, spinTurns, spinStart, spinEnd, spinDir, linesFollowHelix, lineJoinPoint, lineStagger, lineInStart, lineInEnd, lineOutStart, lineOutEnd, lineStyle, zoomFit, densify, colA, colB, colRung, bg`.

## NEXT STEPS (pick up here)
1. **Wait for the user's locked JSON** from the studio (they'll tune sliders + copy JSON). Then bake those exact values into `dna-logo-ospin.html` as the production baseline. — STILL PENDING USER INPUT.
2. ✅ DONE (2026-06-20 14:40 IST): **Presets** now built into the studio — a "Presets" button row with 6 one-click starting points: Classic, Lines follow helix, Tight helix, Calm & slow, Zipper rungs, Open & airy. Defined as partial overrides merged onto DEFAULTS (`PRESETS` object near top of the script).
3. ✅ PARTIALLY DONE (2026-06-20 14:40 IST): **Export** built into the studio (new "Export" group):
   - **⏺ record loop (WebM)** — `cv.captureStream(60)` + `MediaRecorder`, restarts at frame 0 and records exactly one `cycleMs` cycle → downloads `klavity-dna-loop.webm`. Convert to GIF/MP4 with ffmpeg as needed.
   - **⤓ PNG — current frame** — `cv.toDataURL` of the scrubbed frame.
   - **Preview on dark squircle (app icon)** checkbox — renders the mark clipped into a dark rounded-squircle so you can eyeball the live app icon; PNG export then saves the icon composite.
   - Verified live: captureStream + MediaRecorder supported, presets apply, squircle toggles, canvas paints (screenshot). **Still TODO:** transparent-bg variant + **Lottie JSON** (Lottie can't come straight from canvas — would need an SVG/JS re-author of the engine, or convert the WebM).
4. Optionally propagate the `( )`-rest + zoom-fit changes to the 20-variations gallery so it's apples-to-apples.

## Verification notes / gotchas
- The Chrome automation tab is **background-throttled** → live rAF doesn't advance for screenshots. Use the **`#<ms>` freeze hook** (studio uses a scrub bar instead) and full page loads with ~1.3s waits to capture exact frames reliably.
- Files needing fonts/relative paths render best via the localhost server, not `file://` (the browser extension mangles `file://` URLs).

## User preferences relevant here (also in auto-memory)
- **Print an IST timestamp on every merge/deploy** (laptop is already IST/UTC+0530, plain `date` works) — needed because multiple agents run in parallel and the user must tell which session acted when.
- Multiple sessions share one working dir → avoid `git add -A`, verify commits before merge/push.
- Proactively surface & fix UX gaps, not just the literal ask.
