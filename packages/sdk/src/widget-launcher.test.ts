// @vitest-environment jsdom
//
// Focused tests for the per-project WIDGET LAUNCHER DISPLAY setting
// (feature: widget-launcher-modes).
//
// Covers the widget render path in widget.ts: each `launcherMode` produces the
// correct launcher DOM/markup, and `launcherIconColor` is applied to the icon.
//
// Harness: mount() is the real export from widget.ts. We mock only the orthogonal
// side-effecting modules (capture-context patches fetch/XHR; session-replay lazy-
// loads rrweb over the network) and parseScriptConfig so we can drive mount()
// explicitly per test with a controlled /api/projects/:id/config response. The
// launcher render code itself (button build + style + append) runs UNMODIFIED —
// these tests assert against the real DOM it produces.
//
// Field names + render branches verified against packages/sdk/src/widget.ts:
//   • launcherMode ∈ {hidden, icon, full, custom}
//   • launcherText  (used only in 'custom')
//   • launcherIconColor  (hex applied to the button background)

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock the orthogonal side effects so mount() stays focused on rendering ──
// capture-context installs fetch/XHR wrappers + PerformanceObserver; mock it out
// so our fetch stub stays clean and no perf observers fire under jsdom.
vi.mock("./capture-context", () => ({
  installCaptureContext: vi.fn(),
  buildCaptureContext: vi.fn(() => ({} as any)),
}))
// session-replay lazy-loads rrweb from <backendUrl>/vendor/klv-buffer.min.js;
// mock it so no extra network calls happen during mount().
vi.mock("./session-replay", () => ({
  createSessionReplay: vi.fn(() => ({
    snapshot: () => [],
    hasRecording: () => false,
    stop: () => {},
  })),
}))

// parseScriptConfig must be a controllable stub so the module-level auto-mount
// (widget.ts fires mount() on load) returns early by default, and each test can
// arm it with a valid projectId/backendUrl before calling mount() explicitly.
vi.mock("./widget-lib", async () => {
  const actual = await vi.importActual<typeof import("./widget-lib")>("./widget-lib")
  return {
    ...actual,
    parseScriptConfig: vi.fn(() => ({ projectId: "", backendUrl: "" })),
  }
})

import { mount } from "./widget"
import { parseScriptConfig } from "./widget-lib"
import { SimsLive } from "./sims-live"

const HOST_ID = "klavity-widget-host"

// The modalConfig the mocked /config endpoint will return. Tests mutate this
// before calling mountWith().
let nextModalConfig: Record<string, unknown> = {}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

// mount() issues two fetches: GET /api/projects/:id/config (what we test) and a
// fire-and-forget POST /api/widget/ping. This stub serves the configured
// modalConfig for the config call and a blank 200 for everything else.
function installFetchStub() {
  const fn = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("/api/projects/") && url.includes("/config")) {
      return jsonResponse({
        modalConfig: nextModalConfig,
        widget: { mode: "support", ctaUrl: "https://cta.test", reportGate: "anonymous" },
      })
    }
    // heartbeat ping + any stray call → blank ok
    return jsonResponse({ ok: true })
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

async function mountWith(modalConfig: Record<string, unknown>) {
  nextModalConfig = modalConfig
  vi.mocked(parseScriptConfig).mockReturnValue({
    projectId: "proj_launcher_test",
    backendUrl: "https://srv.test",
  })
  installFetchStub()
  await mount()
}

function host(): HTMLElement & { shadowRoot: ShadowRoot } {
  const h = document.getElementById(HOST_ID) as HTMLElement & { shadowRoot: ShadowRoot }
  if (!h || !h.shadowRoot) throw new Error("widget host not mounted")
  return h
}

function launcherButton(): HTMLButtonElement {
  const btn = host().shadowRoot.querySelector("button") as HTMLButtonElement
  if (!btn) throw new Error("launcher button not found in shadow root")
  return btn
}

beforeEach(() => {
  // Wipe any host created by a previous mount() so each test starts clean.
  document.body.innerHTML = ""
  const storage = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
  })
  nextModalConfig = {}
  SimsLive.onTriage = null
  vi.mocked(parseScriptConfig).mockReturnValue({ projectId: "", backendUrl: "" })
})

function activeComposerShadow(): ShadowRoot {
  for (const el of Array.from(document.body.querySelectorAll("div")) as HTMLElement[]) {
    const shadow = el.shadowRoot
    if (shadow?.getElementById("klavity-desc")) return shadow
  }
  throw new Error("composer shadow root not found")
}

// ── 1. launcherMode === 'hidden' → no visible launcher ────────────────────────

describe("launcherMode: hidden", () => {
  it("hides the launcher container (display:none) so nothing is visible", async () => {
    await mountWith({ launcherMode: "hidden" })
    const btn = launcherButton()
    // The button still exists in the DOM, but its container (reportDock) is hidden.
    const container = btn.parentElement as HTMLElement
    expect(container).toBeTruthy()
    expect(container.style.display).toBe("none")
  })
})

describe("Sim observation tracking", () => {
  it("opens a prefilled bug composer when Track as Bug is clicked from a Sim observation", async () => {
    await mountWith({ launcherMode: "full" })

    expect(SimsLive.onTriage).toBeTypeOf("function")
    SimsLive.onTriage?.({
      text: "The checkout button feels broken and blocks progress.",
      sentiment: "frustrated",
      severity: "high",
      suggestedBug: { title: "Checkout button blocks progress" },
    }, "Vishal Kumar")

    const shadow = activeComposerShadow()
    const desc = shadow.getElementById("klavity-desc") as HTMLTextAreaElement
    const submit = shadow.getElementById("klavity-submit") as HTMLButtonElement
    expect(desc.value).toContain("Sim observation from Vishal Kumar")
    expect(desc.value).toContain("The checkout button feels broken")
    expect(desc.value).toContain("Severity: high")
    expect(desc.value).toContain("Suggested title: Checkout button blocks progress")
    expect(submit.disabled).toBe(false)
  })
})

describe("widget Sims dock consolidation", () => {
  it("does not render the legacy mini Sims avatar dock when a team token is present", async () => {
    localStorage.setItem("klavity_widget_token", "team-token")
    await mountWith({ launcherMode: "full" })

    const shadow = host().shadowRoot
    expect(shadow.querySelector(".ksim")).toBeNull()
    expect(launcherButton().textContent).toContain("Report a bug")
  })

  it("lifts the report launcher while the live Sims dock is active", async () => {
    await mountWith({ launcherMode: "full" })
    const h = host()
    expect(h.style.bottom).toBe("18px")

    document.dispatchEvent(new CustomEvent("klavity:sims-live", { detail: { active: true } }))
    expect(h.style.bottom).toBe("86px")

    document.dispatchEvent(new CustomEvent("klavity:sims-live", { detail: { active: false } }))
    expect(h.style.bottom).toBe("18px")
  })
})

// ── 2. launcherMode === 'icon' → bug icon only, no text label ─────────────────

describe("launcherMode: icon", () => {
  it("renders only the bug icon with no text label", async () => {
    await mountWith({ launcherMode: "icon" })
    const btn = launcherButton()
    // No text label — textContent is empty (the svg + empty status spans).
    expect(btn.textContent?.trim()).toBe("")
    // An inline SVG icon is present.
    expect(btn.innerHTML).toContain("<svg")
  })

  it("renders a circular 44x44 icon button (not the text pill)", async () => {
    await mountWith({ launcherMode: "icon" })
    const btn = launcherButton()
    expect(btn.style.borderRadius).toBe("50%")
    expect(btn.style.width).toBe("44px")
    expect(btn.style.height).toBe("44px")
  })
})

// ── 3. launcherMode === 'full' → the "Report a bug" text pill ─────────────────

describe("launcherMode: full", () => {
  it("renders the icon + 'Report a bug' text in a pill", async () => {
    await mountWith({ launcherMode: "full" })
    const btn = launcherButton()
    expect(btn.textContent).toContain("Report a bug")
    expect(btn.innerHTML).toContain("<svg")
    // Pill shape, not the circular icon button.
    expect(btn.style.borderRadius).toBe("999px")
  })

  it("defaults to 'Report a bug' when launcherMode is omitted entirely", async () => {
    // No launcherMode in modalConfig → widget.ts defaults to 'full'.
    await mountWith({})
    const btn = launcherButton()
    expect(btn.textContent).toContain("Report a bug")
    expect(btn.style.borderRadius).toBe("999px")
  })
})

// ── 4. launcherMode === 'custom' → admin-provided launcherText ────────────────

describe("launcherMode: custom", () => {
  it("renders the admin-provided launcherText instead of 'Report a bug'", async () => {
    const customText = "Found a glitch?"
    await mountWith({ launcherMode: "custom", launcherText: customText })
    const btn = launcherButton()
    expect(btn.textContent).toContain(customText)
    // Must NOT show the default label.
    expect(btn.textContent).not.toContain("Report a bug")
    expect(btn.innerHTML).toContain("<svg")
    expect(btn.style.borderRadius).toBe("999px")
  })

  it("falls back to the default label when custom mode is set but launcherText is empty", async () => {
    // widget.ts: label = launcherMode === 'custom' ? launcherText : 'Report a bug'
    // An empty/whitespace launcherText is rejected by the config resolver, so the
    // widget never receives it — launcherText stays at its 'Report a bug' default.
    await mountWith({ launcherMode: "custom" })
    const btn = launcherButton()
    expect(btn.textContent).toContain("Report a bug")
  })
})

// ── 5. launcherIconColor applied to the icon button ───────────────────────────

describe("launcherIconColor", () => {
  it("applies the configured hex colour to the icon button background", async () => {
    await mountWith({ launcherMode: "icon", launcherIconColor: "#ff0000" })
    const btn = launcherButton()
    // jsdom normalises #ff0000 → rgb(255, 0, 0); assert the resolved value.
    expect(btn.style.backgroundColor).toBe("rgb(255, 0, 0)")
  })

  it("applies the configured colour to the full pill background too", async () => {
    await mountWith({ launcherMode: "full", launcherIconColor: "#00aa55" })
    const btn = launcherButton()
    expect(btn.style.backgroundColor).toBe("rgb(0, 170, 85)")
  })

  it("uses the default brand colour when launcherIconColor is omitted", async () => {
    // widget.ts default launcherIconColor = '#5b5bf0' → rgb(91, 91, 240).
    await mountWith({ launcherMode: "icon" })
    const btn = launcherButton()
    expect(btn.style.backgroundColor).toBe("rgb(91, 91, 240)")
  })

  it("ignores an invalid hex and falls back to the default colour", async () => {
    // The config resolver drops invalid hex; the widget then keeps its default.
    await mountWith({ launcherMode: "icon", launcherIconColor: "not-a-hex" })
    const btn = launcherButton()
    expect(btn.style.backgroundColor).toBe("rgb(91, 91, 240)")
  })
})
