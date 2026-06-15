# Klav Sims — Live Prototype

The core loop, running for real against Claude: **transcript → Sim → live reaction on a page → filed bug.**
This is the seed of the real `services/api` (Bun + Hono later); right now it's a single Bun server + one HTML page.

## Run

The OpenRouter key lives in `prototype/.env` (gitignored) — Bun auto-loads it.

```bash
cd prototype
bun run server.ts
# open http://localhost:4317
```

Model defaults to `anthropic/claude-sonnet-4.6` (fast, via OpenRouter).
For the strongest results: `KLAV_MODEL=anthropic/claude-opus-4.8 bun run server.ts`.

## What to do

1. The transcript box is pre-filled with a sample finance call. Click **Extract Sims**.
   → Claude returns named personas (Sarah/James/Anika) with typed pain/want/love insights anchored to quotes.
2. A demo **Acme Finance dashboard** is shown as the page under review (or upload a screenshot of *your* product).
3. Click **"Have <Sim> review this page →"**.
   → The page is screenshotted (`html-to-image`), sent to Claude vision with that persona, and the Sim:
   walks to the element it has an opinion about (using the bounding box Claude returns), points, and shows
   its in-character reaction + a suggested bug. Click **→ File to Jira** to simulate filing.

## How it works (the 2 real AI calls)

Claude is reached through OpenRouter's OpenAI-compatible API (because the key is an OpenRouter key).

- `POST /api/extract` — transcript text → Claude → `{ personas:[{ name, role, type, insights:[{kind,text,quote}] }] }`.
- `POST /api/react` — persona + base64 screenshot → Claude vision → `{ reactions:[{ observation, sentiment, emoji, box, suggestedBug }] }`.
  The `box` is a normalised 0..1 bounding box the front-end uses to walk the Sim to the right spot — this is the
  element-targeting contract the real `@klav/character` package will consume.

## Notes / known limits

- Uses OpenRouter (OpenAI-compatible), not the native Anthropic SDK — so structured output is instructed-and-parsed
  rather than schema-enforced. The real `services/api` will use the native Anthropic SDK with strict structured outputs.
- Bug filing is mocked (no real Jira call yet) — the real one reuses `@klav/core`'s integration modules.
- Vision element-pointing accuracy is the riskiest assumption in the design; this prototype is exactly where to test it.
- Sonnet is snappy; switch to `anthropic/claude-opus-4.8` for the highest-quality reactions.
