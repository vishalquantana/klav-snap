// G1 session replay — feedback_replays storage round-trip (gzip) + size capping + project scoping.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
const file = join(tmpdir(), `klav-fbreplay-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
let db: any
beforeAll(async () => {
  db = reconnectDb("file:" + file)
  await applySchema(db)
  await migrateV2(db)
})
const R = await import("./feedback-replay")

// ── pure helpers ────────────────────────────────────────────────────────────────────
test("encodeReplay/decodeReplay round-trips events and compresses", () => {
  const events = Array.from({ length: 200 }, (_, i) => ({ type: 3, timestamp: 1000 + i, data: { x: i, source: "incremental" } }))
  const gz = R.encodeReplay(events)
  // base64 gzip of repetitive JSON is much smaller than the raw JSON
  expect(gz.length).toBeLessThan(JSON.stringify(events).length)
  const back = R.decodeReplay(gz)
  expect(back).toHaveLength(200)
  expect((back[0] as any).timestamp).toBe(1000)
  expect((back[199] as any).data.x).toBe(199)
})

// Incompressible per-event payload so gzip can't shrink the buffer under the cap on its own —
// forces the oldest-first trim path to engage.
function fatEvent(seq: number) {
  let blob = ""
  for (let k = 0; k < 12; k++) blob += Math.random().toString(36).slice(2)
  return { type: 3, timestamp: seq, data: { blob, seq } }
}

test("capReplayEvents trims OLDEST events first when the encoded payload exceeds the cap", () => {
  // Each event is a chunky random string; 5000 of them blow well past a small cap.
  const events = Array.from({ length: 5000 }, (_, i) => fatEvent(i))
  const cap = 50_000 // bytes of base64 gzip
  const { events: trimmed, encoded, trimmed: didTrim } = R.capReplayEvents(events, cap)
  expect(didTrim).toBe(true)
  expect(encoded.length).toBeLessThanOrEqual(cap)
  expect(trimmed.length).toBeLessThan(events.length)
  // Newest events are kept: the last original event survives, the first does not.
  expect((trimmed[trimmed.length - 1] as any).data.seq).toBe(4999)
  expect((trimmed[0] as any).data.seq).toBeGreaterThan(0)
})

test("capReplayEvents leaves a small buffer untouched", () => {
  const events = Array.from({ length: 10 }, (_, i) => ({ type: 3, timestamp: i }))
  const { events: trimmed, trimmed: didTrim, encoded } = R.capReplayEvents(events, 1_000_000)
  expect(didTrim).toBe(false)
  expect(trimmed).toHaveLength(10)
  expect(encoded.length).toBeGreaterThan(0)
})

test("capReplayEvents returns empty + no encoding for an empty buffer", () => {
  const { events: trimmed, encoded, trimmed: didTrim } = R.capReplayEvents([], 1000)
  expect(trimmed).toHaveLength(0)
  expect(encoded).toBe("")
  expect(didTrim).toBe(false)
})

// ── storage round-trip ──────────────────────────────────────────────────────────────
test("saveFeedbackReplay/getFeedbackReplay round-trips; project-scoped", async () => {
  const events = Array.from({ length: 30 }, (_, i) => ({ type: 3, timestamp: i, data: { i } }))
  const res = await R.saveFeedbackReplay("proj_F", "fb_1", events)
  expect(res.saved).toBe(true)
  expect(res.nEvents).toBe(30)

  const got = await R.getFeedbackReplay("proj_F", "fb_1")
  expect(got).not.toBeNull()
  expect(got!.events).toHaveLength(30)
  expect((got!.events[5] as any).data.i).toBe(5)
  expect(got!.nEvents).toBe(30)

  // cross-project read returns null (no tenant leak)
  expect(await R.getFeedbackReplay("proj_OTHER", "fb_1")).toBeNull()
  // a feedbackId with no replay returns null
  expect(await R.getFeedbackReplay("proj_F", "fb_nope")).toBeNull()
})

test("saveFeedbackReplay rejects oversize payloads after trimming to the cap", async () => {
  // 8000 fat (incompressible) events vs a tiny cap → trimming kicks in but the most-recent slice saves.
  const events = Array.from({ length: 8000 }, (_, i) => fatEvent(i))
  const res = await R.saveFeedbackReplay("proj_F", "fb_big", events, 50_000)
  expect(res.saved).toBe(true)
  expect(res.trimmed).toBe(true)
  expect(res.nEvents).toBeLessThan(8000)
  const got = await R.getFeedbackReplay("proj_F", "fb_big")
  expect(got!.events.length).toBe(res.nEvents)
  // the newest event is preserved
  expect((got!.events[got!.events.length - 1] as any).data.seq).toBe(7999)
})

test("saveFeedbackReplay is a no-op for an empty buffer", async () => {
  const res = await R.saveFeedbackReplay("proj_F", "fb_empty", [])
  expect(res.saved).toBe(false)
  expect(await R.getFeedbackReplay("proj_F", "fb_empty")).toBeNull()
})

test("feedbackIdsWithReplay reports which feedback rows have a stored replay", async () => {
  await R.saveFeedbackReplay("proj_S", "fb_a", [{ type: 4, timestamp: 1 }, { type: 3, timestamp: 2 }])
  const set = await R.feedbackIdsWithReplay("proj_S", ["fb_a", "fb_missing"])
  expect(set.has("fb_a")).toBe(true)
  expect(set.has("fb_missing")).toBe(false)
  // cross-project does not leak
  const none = await R.feedbackIdsWithReplay("proj_OTHER", ["fb_a"])
  expect(none.has("fb_a")).toBe(false)
})
