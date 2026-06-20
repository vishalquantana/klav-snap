// Plan G Task 2 — prod-safety knobs on the runner: a hard per-walk deadline finalizes RED + stops
// (instead of running every step / hanging), against REAL Chromium. A 1ms deadline on the multi-step
// journey must finish fast and RED. Mirrors the journey/runner e2e harness (hermetic local libsql).
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"; import { join, resolve } from "node:path"; import { pathToFileURL } from "node:url"
const file = join(tmpdir(), `klav-deadline-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN
const { reconnectDb, applySchema, migrateV2 } = await import("./db")
beforeAll(async () => { const db = reconnectDb("file:" + file); await applySchema(db); await migrateV2(db) })
const { crystallize } = await import("./trails-crystallize")
const { walkTrail } = await import("./trails-runner")
const T = await import("./trails")

const landing = (dir: string) => pathToFileURL(resolve(import.meta.dir, "..", "test-fixtures", dir, "landing.html")).href

test("deadlineMs finalizes the walk red instead of running every step", async () => {
  const base = landing("journey")
  const { trailId } = await crystallize("proj_dl", {
    name: "DL", baseUrl: base, authorKind: "llm",
    steps: [
      { action: "click", url: base, domHash: "landing", target: { role: "button", accessibleName: "Start", text: "Start", testId: "start-link", resolvedSelector: "#start" } },
      { action: "assert", checkpoint: { description: "order confirmation shown" }, url: base, domHash: "confirm", target: { role: "heading", accessibleName: "Order confirmed", text: "Order confirmed", testId: "order-confirmation", resolvedSelector: "#order-confirmation" } },
    ],
  })
  const summary = await walkTrail("proj_dl", trailId, { fixtureUrl: landing("journey"), deadlineMs: 1 })
  expect(summary.verdict).toBe("red")
  const walk = await T.getWalk("proj_dl", summary.runId)
  expect(walk?.status).toBe("red")
  expect((walk?.summary as any)?.error).toContain("deadline")
}, 30000)

// Plan G prod-safety — the deadline must be a REAL ceiling: the PRE-LOOP initial goto (the worst case,
// previously NEVER deadline-guarded) must be bounded by opTimeout, not Playwright's 30s default. Walk a
// trail whose fixtureUrl is a NON-ROUTABLE host that HANGS the TCP connect (10.255.255.1). With a small
// deadlineMs the initial goto must TIME OUT, finalize the walk RED, and return well under Playwright's
// 30s default — proving a hung live-network navigation can't pin the single walk-slot + browser.
test("a hung initial-goto times out (bounded by opTimeout), finalizes RED well under 30s", async () => {
  const base = landing("journey")
  const { trailId } = await crystallize("proj_dl_hang", {
    name: "Hang", baseUrl: base, authorKind: "llm",
    steps: [
      { action: "assert", checkpoint: { description: "anything" }, url: base, domHash: "x", target: { role: "heading", accessibleName: "X", text: "X", testId: "x", resolvedSelector: "#x" } },
    ],
  })
  const t0 = Date.now()
  // deadlineMs 4000 → opTimeout = max(3000, min(15000, 4000)) = 4000ms ceiling on the initial goto.
  const summary = await walkTrail("proj_dl_hang", trailId, { fixtureUrl: "http://10.255.255.1/", deadlineMs: 4000 })
  const elapsed = Date.now() - t0
  expect(summary.verdict).toBe("red")
  const walk = await T.getWalk("proj_dl_hang", summary.runId)
  expect(walk?.status).toBe("red")
  // Well under Playwright's 30s default — proving the initial goto was bounded by opTimeout, not 30s.
  expect(elapsed).toBeLessThan(20000)
}, 30000)
