import { test, expect } from "bun:test"
import { decideFromVision, type VisionResult } from "./trails-vision"

const base = (o: Partial<VisionResult>): VisionResult => ({ found: true, selector: "#x", confidence: 0.95, classification: "moved", rationale: "moved down", ...o })

test("removed classification → regression, never a heal", () => {
  const d = decideFromVision(base({ classification: "removed", found: false, selector: null }))
  expect(d.outcome).toBe("regression")
  expect(d.selector).toBeNull()
  expect(d.diagnosis).toBe("regression")
})

test("found + high confidence + not removed → heal (locator_drift)", () => {
  const d = decideFromVision(base({ confidence: 0.95 }))
  expect(d.outcome).toBe("heal")
  expect(d.selector).toBe("#x")
  expect(d.diagnosis).toBe("locator_drift")
})

test("found but below gate → amber_low_conf (file for review, never pass)", () => {
  const d = decideFromVision(base({ confidence: 0.7 }))
  expect(d.outcome).toBe("amber_low_conf")
  expect(d.diagnosis).toBe("locator_drift")
})

test("custom gate is honored", () => {
  expect(decideFromVision(base({ confidence: 0.85 }), 0.8).outcome).toBe("heal")
  expect(decideFromVision(base({ confidence: 0.85 }), 0.9).outcome).toBe("amber_low_conf")
})

// ── Task 2: real OpenRouter adapter (exercised with a MOCKED fetch — no network) ──
import { mock } from "bun:test"

// db singleton must point at a local file BEFORE importing ./db (recordAiCall writes there)
import { tmpdir } from "node:os"; import { join } from "node:path"
const dbFile = join(tmpdir(), `klav-vision-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + dbFile
delete process.env.TURSO_AUTH_TOKEN
process.env.OPENROUTER_API_KEY = "test-key"

const { reconnectDb, applySchema, migrateV2 } = await import("./db")
const visiondb = reconnectDb("file:" + dbFile)
await applySchema(visiondb); await migrateV2(visiondb)
const { openRouterVisionResolver, buildVisionMessages, parseVisionJSON } = await import("./trails-vision")

test("buildVisionMessages embeds the screenshot as a data URL and asks for strict JSON", () => {
  const msgs = buildVisionMessages({ screenshotB64: "QUJD", mediaType: "image/png", domSnapshot: "<button/>", pageUrl: "https://app.test/x", intent: "click sign in", action: "click", target: { role: "button", accessibleName: "Sign in" }, candidateSelectors: ["#a"] })
  const userParts = msgs[msgs.length - 1].content
  const img = userParts.find((p: any) => p.type === "image_url")
  expect(img.image_url.url).toBe("data:image/png;base64,QUJD")
  expect(JSON.stringify(msgs)).toContain("Sign in")
})

test("parseVisionJSON tolerates code fences and clamps confidence + validates classification", () => {
  const r = parseVisionJSON("```json\n{\"found\":true,\"selector\":\"#go\",\"confidence\":1.7,\"classification\":\"teleported\",\"rationale\":\"x\"}\n```")
  expect(r.found).toBe(true); expect(r.selector).toBe("#go")
  expect(r.confidence).toBe(1) // clamped
  expect(r.classification).toBe("unknown") // invalid → unknown
})

test("openRouterVisionResolver parses the model reply and logs an ai_calls row (type=reheal)", async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = mock(async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ found: true, selector: "#auth-go", confidence: 0.93, classification: "moved", rationale: "button moved into the footer" }) } }],
    usage: { prompt_tokens: 1200, completion_tokens: 40, cost: 0.0011 },
  }), { status: 200 })) as any

  const out = await openRouterVisionResolver({ screenshotB64: "QUJD", mediaType: "image/png", domSnapshot: "<div/>", pageUrl: "https://app.test/x", intent: "click sign in", action: "click", target: { role: "button", accessibleName: "Sign in" }, candidateSelectors: [] }, { projectId: "proj_A" })
  expect(out.selector).toBe("#auth-go")
  expect(out.confidence).toBeCloseTo(0.93)
  expect(out.classification).toBe("moved")

  globalThis.fetch = realFetch
  // recordAiCall is fire-and-forget; allow the microtask to flush
  await new Promise((r) => setTimeout(r, 30))
  const rows = await visiondb.execute({ sql: "SELECT type, model, cost_usd FROM ai_calls WHERE type='reheal'", args: [] })
  expect(rows.rows.length).toBe(1)
  expect(Number(rows.rows[0].cost_usd)).toBeCloseTo(0.0011)
})
