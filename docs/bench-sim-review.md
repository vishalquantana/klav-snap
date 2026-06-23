# Sim Review Benchmark: bigidea.quantana.top

Date: 2026-06-23

Target: `https://bigidea.quantana.top/`

Method: instrumented local `prototype/server.ts` on `localhost:4329`, seeded with one benchmark Sim (`Maya Chen`) and a real OpenRouter vision call through `/api/sim/review`. Chromium loaded the live BigIdea page at `1440x900`, captured the viewport, posted the screenshot to the local review handler, then rendered returned observations into a hidden page node.

Note: the page could not be serialized by the direct `html-to-image` harness path, so the benchmark used Chromium viewport PNG capture as the capture fallback. The SDK's `safeToPng` has its own fetch-free fallback for the same failure class.

## Summary

| Stage | p50 / typical |
| --- | ---: |
| Client viewport capture | 66 ms |
| Server receive -> review done | 6,910 ms |
| Server LLM/review loop only | 6,905 ms |
| Client render observations | 0 ms |
| Total capture -> observations rendered | 6,982 ms |

Typical end-to-end latency is about 7.0s for one Sim. The server stage is effectively the whole cost: screenshot decoding/storage bookkeeping was 3-27ms, while the LLM/review loop was 5.5-40.3s. One of five runs was a 40.4s provider outlier.

## Raw Runs

| Run | Capture | Server receive -> review | Server review loop | Render | Total | Observations |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 74 ms | 6,967 ms | 6,939 ms | 0 ms | 7,051 ms | 3 |
| 2 | 62 ms | 6,379 ms | 6,373 ms | 0 ms | 6,443 ms | 3 |
| 3 | 62 ms | 40,348 ms | 40,343 ms | 0 ms | 40,411 ms | 3 |
| 4 | 66 ms | 5,511 ms | 5,507 ms | 0 ms | 5,578 ms | 2 |
| 5 | 71 ms | 6,910 ms | 6,905 ms | 0 ms | 6,982 ms | 3 |

Instrumentation added:

- Client console log in `packages/sdk/src/widget.ts` for boot review timing.
- Client console log in `packages/sdk/src/sims-watch.ts` for watch-triggered review timing.
- Server log line and JSON response timing in `prototype/server.ts` for `/api/sim/review`.
