// Regression guard for the stuck-skeleton fix (v0.39.114, commit cfbfa1c).
//
// The Manager repeatedly reported dashboard stat numbers "never loading" — a section left
// shimmering on its loading skeleton forever when its data didn't arrive. It regressed once.
// The fix centralized the fallback so NO section can hang on a skeleton:
//   • swrSection(...).finally — for independent-fetch sections, always replaces a leftover `.sk`
//     in the section host with a terminal "Couldn't load" state (success/throw/empty/cold-miss).
//   • SKELETON_HOSTS + clearStuckSkeletons — the central safety net listing every skeleton host,
//     invoked on the cold-error path in load() (the exact "stats never load" scenario).
//
// This test pins the REAL shipped helpers (extracted from dashboard.html, not re-implemented) and
// proves: every failure path reaches a terminal state, and no markup skeleton host bypasses the
// central list. Deterministic — no DOM, no network.

import { test, expect } from "bun:test"

const HTML = await Bun.file(import.meta.dir + "/public/dashboard.html").text()

// ── Extract the actual shipped source units (anchored, brace-matched) ─────────
function extractFn(src: string, startSig: string): string {
  const i = src.indexOf(startSig)
  if (i < 0) throw new Error("source not found: " + startSig)
  let j = i
  while (src[j] !== "{") j++
  let depth = 0
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(i, j + 1) }
  }
  throw new Error("unbalanced braces from: " + startSig)
}
const skeletonHostsSrc = (HTML.match(/const SKELETON_HOSTS = \[[^\]]*\]/) || [])[0]
const swrSectionSrc = extractFn(HTML, "async function swrSection(")
const clearStuckSrc = extractFn(HTML, "function clearStuckSkeletons(")

expect(skeletonHostsSrc).toBeTruthy()

// ── Build a sandbox with the helpers' collaborators stubbed ───────────────────
const EMPTY_PREFIX = "EMPTY:" // emptyState() stub marker — a non-skeleton terminal state
function buildSandbox(getEl: (id: string) => any) {
  const stubEmptyState = (_i: string, msg: string) => EMPTY_PREFIX + msg
  const stubKbar = { start() {}, done() {} }
  const factory = new Function(
    "$", "emptyState", "swrRead", "swrWrite", "kbar",
    `${skeletonHostsSrc}\n${swrSectionSrc}\n${clearStuckSrc}\n` +
      "return { swrSection, clearStuckSkeletons, SKELETON_HOSTS };",
  )
  return factory(getEl, stubEmptyState, () => null /*swrRead: no cache*/, () => {} /*swrWrite*/, stubKbar)
}

// Minimal fake section host: models whether a `.sk` skeleton is still present.
function fakeHost(opts: { sk: boolean; num?: boolean }) {
  return {
    innerHTML: "",
    textContent: "",
    _sk: opts.sk,
    querySelector(sel: string) {
      if (sel === ".sk") return this._sk ? {} : null
      if (sel === ".sk-num") return this._sk && opts.num ? {} : null
      return null
    },
  }
}

// =============================================================================
// 1 · swrSection ALWAYS reaches a terminal state — never leaves a skeleton
// =============================================================================
test("swrSection: a throwing fetch resolves the skeleton to a terminal state", async () => {
  const { swrSection } = buildSandbox(() => null)
  const host = fakeHost({ sk: true })
  await swrSection("k", async () => { throw new Error("network down") }, () => {}, host)
  // The leftover skeleton must be replaced by a terminal "couldn't load" state.
  expect(host.innerHTML.startsWith(EMPTY_PREFIX)).toBe(true)
  expect(host.innerHTML.toLowerCase()).toContain("couldn't load")
})

test("swrSection: an empty (null) payload resolves the skeleton to a terminal state", async () => {
  const { swrSection } = buildSandbox(() => null)
  const host = fakeHost({ sk: true })
  await swrSection("k", async () => null, () => {}, host)
  expect(host.innerHTML.startsWith(EMPTY_PREFIX)).toBe(true)
})

test("swrSection: an apply that throws still resolves the skeleton (never hangs)", async () => {
  const { swrSection } = buildSandbox(() => null)
  const host = fakeHost({ sk: true })
  await swrSection("k", async () => ({ ok: 1 }), () => { throw new Error("render bug") }, host)
  expect(host.innerHTML.startsWith(EMPTY_PREFIX)).toBe(true)
})

test("swrSection: success paints data and does NOT overwrite with the fallback", async () => {
  const { swrSection } = buildSandbox(() => null)
  const host = fakeHost({ sk: true })
  await swrSection("k", async () => ({ ok: 1 }), (d) => { host._sk = false; host.innerHTML = "DATA:" + JSON.stringify(d) }, host)
  expect(host.innerHTML).toBe('DATA:{"ok":1}')
  expect(host.innerHTML.startsWith(EMPTY_PREFIX)).toBe(false)
})

test("swrSection: resolves the host even when passed by id (string)", async () => {
  const host = fakeHost({ sk: true })
  const { swrSection } = buildSandbox((id) => (id === "triageList" ? host : null))
  await swrSection("k", async () => { throw new Error("x") }, () => {}, "triageList")
  expect(host.innerHTML.startsWith(EMPTY_PREFIX)).toBe(true)
})

// =============================================================================
// 2 · clearStuckSkeletons (the central safety net) resolves EVERY leftover host
// =============================================================================
test("clearStuckSkeletons: stat tiles → dash, list feeds → empty state, never a skeleton", () => {
  const els: Record<string, any> = {}
  // Build a fake element for every host the code knows about, all still skeleton-stuck.
  const hosts = (HTML.match(/const SKELETON_HOSTS = \[([^\]]*)\]/)![1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ""))
  // stat tiles carry a .sk-num (resolve to "—"); the rest are list/feed hosts (resolve to empty state)
  const statTiles = new Set(["stFeedback", "stSims", "stTeam", "stTickets"])
  for (const id of hosts) els[id] = fakeHost({ sk: true, num: statTiles.has(id) })
  const { clearStuckSkeletons } = buildSandbox((id) => els[id] ?? null)
  clearStuckSkeletons()
  for (const id of hosts) {
    const el = els[id]
    if (statTiles.has(id)) expect(el.textContent).toBe("—")
    else expect(el.innerHTML.startsWith(EMPTY_PREFIX)).toBe(true)
  }
})

test("clearStuckSkeletons: leaves a host that already rendered (no .sk) untouched", () => {
  const painted = { ...fakeHost({ sk: false }), innerHTML: "REAL DATA", textContent: "123" }
  const { clearStuckSkeletons } = buildSandbox((id) => (id === "stFeedback" ? painted : null))
  clearStuckSkeletons()
  expect(painted.innerHTML).toBe("REAL DATA")
  expect(painted.textContent).toBe("123")
})

// =============================================================================
// 3 · No section bypasses the fallback: every markup skeleton host is centralized
// =============================================================================
test("every skeleton host in the markup is listed in SKELETON_HOSTS", () => {
  const listed = new Set((skeletonHostsSrc.match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, "")))
  // Find each element whose FIRST child is a loading skeleton (id="X"…><…class="sk…) in the markup.
  const found = new Set<string>()
  const re = /<[^>]*\bid="([A-Za-z0-9_-]+)"[^>]*>\s*<[^>]*\bclass="sk[ "]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(HTML))) found.add(m[1])
  expect(found.size).toBeGreaterThan(0) // sanity: we actually located skeleton hosts
  const missing = [...found].filter(id => !listed.has(id))
  expect(missing).toEqual([]) // a new skeleton section must be added to SKELETON_HOSTS
})

// =============================================================================
// 4 · The cold-error path actually invokes the safety net (the Manager's case)
// =============================================================================
test("load()'s failed-fetch / cold-miss branch calls clearStuckSkeletons", () => {
  // On (no cached state + failed dashboard fetch) render() never runs, so the safety net MUST fire.
  const loadSrc = extractFn(HTML, "async function load(")
  const errBranch = loadSrc.slice(loadSrc.indexOf("if (!data || data.error)"))
  expect(errBranch).toContain("clearStuckSkeletons(")
})

// swrSection's own guarantee must keep living in its finally block (don't let a refactor drop it).
test("swrSection keeps the skeleton-clearing guarantee in a finally block", () => {
  expect(swrSectionSrc).toContain("finally")
  expect(swrSectionSrc).toMatch(/querySelector\(["']\.sk["']\)/)
  expect(swrSectionSrc).toContain("emptyState(")
})
