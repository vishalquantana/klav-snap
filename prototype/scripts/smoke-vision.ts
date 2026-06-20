// Opt-in, real-key smoke for the Tier-2 vision resolver. NOT part of `bun test`.
// This is the one honest exercise of the real OpenRouter model path; tests inject mocks instead.
//
//   cd prototype && bun run scripts/smoke-vision.ts                 # SKIPPED without a key
//   cd prototype && OPENROUTER_API_KEY=<key> OPENROUTER_BASE=https://klavity.quantana.top \
//                   bun run scripts/smoke-vision.ts                 # one real vision call
import { openRouterVisionResolver } from "../lib/trails-vision"

if (!process.env.OPENROUTER_API_KEY) {
  console.log("SKIPPED: set OPENROUTER_API_KEY to run the real vision smoke.")
  process.exit(0)
}
// 1x1 transparent PNG (base64) — just proves the call path; a real run would pass a page screenshot.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const out = await openRouterVisionResolver({
  screenshotB64: PNG, mediaType: "image/png", domSnapshot: "<button id='x'>Sign in</button>",
  pageUrl: "https://example.test/login", intent: "click the Sign in button", action: "click",
  target: { role: "button", accessibleName: "Sign in" }, candidateSelectors: ["#auth-submit"],
}, { projectId: "proj_smoke" })
console.log("VisionResult:", JSON.stringify(out, null, 2))
console.log("OK — check ai_calls for a type=reheal row.")
