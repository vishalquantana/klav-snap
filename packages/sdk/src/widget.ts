// packages/sdk/src/widget.ts
import { createSim, injectSimStyles, emotionFromSentiment } from "@klavity/core/sim"
import { toPng } from "html-to-image"
import { buildModal } from "@klavity/core/modal"
import { cropDataUrl } from "@klavity/core/crop"
import { installCapture, buildReportContext, type CaptureBuffers } from "@klavity/core/capture"
import type { ReportContext, ReportIdentity } from "@klavity/core"
import { parseScriptConfig, gateMessage, isFirstParty, buildFeedbackForm, successCopy } from "./widget-lib"
import { record as rrwebRecord } from "rrweb"
import { startReplayRecording, type ReplayController } from "./replay-recorder"

const HOST_ID = "klavity-widget-host"
const TOKEN_KEY = "klavity_widget_token"

type Persona = { id: string; name: string; initials?: string; accent?: string }

function currentScript(): HTMLScriptElement {
  return (document.currentScript as HTMLScriptElement)
    || (document.querySelector('script[src*="widget.js"]') as HTMLScriptElement)
}

function getToken(): string { try { return localStorage.getItem(TOKEN_KEY) || "" } catch { return "" } }
function setToken(t: string) { try { localStorage.setItem(TOKEN_KEY, t) } catch {} }
function clearToken() { try { localStorage.removeItem(TOKEN_KEY) } catch {} }

// ── Dev-tools capture (G2) + custom metadata (G5) ──
// Shared full-fidelity capture buffers, plus site-owner identity/metadata that can be set either via
// the script-tag config (data-user-*/data-meta) or the public JS API (window.Klavity.identify/...).
const _buffers: CaptureBuffers = { consoleErrors: [], networkFailures: [] }
let _identity: ReportIdentity | undefined
let _metadata: Record<string, string> | undefined

function coerceStrings(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    out[String(k).slice(0, 64)] = String(v).slice(0, 1000)
  }
  return out
}

// Public JS SDK (G5): window.Klavity.identify({...}) / setMetadata({...}).
export function identify(user: ReportIdentity | null) {
  _identity = user ? (coerceStrings(user as Record<string, unknown>) as ReportIdentity) : undefined
}
export function setMetadata(meta: Record<string, unknown> | null) {
  _metadata = meta ? coerceStrings(meta) : undefined
}
function buildWidgetContext(): ReportContext {
  return buildReportContext(_buffers, { identity: _identity, metadata: _metadata })
}

// Expose the public API as early as possible so site code can call it before mount() resolves.
if (typeof window !== "undefined") {
  const w = window as any
  w.Klavity = { ...(w.Klavity || {}), identify, setMetadata, mount }
}

async function mount() {
  const cfg = parseScriptConfig(currentScript())
  if (!cfg.projectId || !cfg.backendUrl) return

  // G2: start full-fidelity dev-tools capture for every widget report (console + network + env).
  installCapture(_buffers, { consoleLevels: true })
  // G5: seed identity/metadata declared on the script tag (a later identify()/setMetadata() wins).
  if (cfg.identity && !_identity) _identity = cfg.identity
  if (cfg.metadata && !_metadata) _metadata = cfg.metadata

  const host = document.createElement("div")
  host.id = HOST_ID
  host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646"
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: "open" })
  injectSimStyles(root)
  const dock = document.createElement("div")
  dock.style.cssText = "display:flex;align-items:flex-end;gap:10px;font-family:system-ui,sans-serif"
  root.appendChild(dock)

  // Report launcher lives in its own element so Sims rendering (dock.innerHTML = "") never clobbers it.
  const reportDock = document.createElement("div")
  reportDock.style.cssText = "display:flex;align-items:flex-end;gap:10px;font-family:system-ui,sans-serif;margin-bottom:8px"
  root.appendChild(reportDock)

  // Announce widget presence so the extension can yield (Task 3 handshake).
  document.dispatchEvent(new CustomEvent("klavity:widget-ready"))

  // ── G1 session replay: continuously record a rolling ~45s buffer of rrweb DOM events so that, on
  // bug submit, we can attach the seconds leading up to the bug (the free answer to Marker's $149
  // "Session replay"). Masked by default (maskAllInputs + masked text) for privacy. Best-effort: a
  // recorder failure must never break the widget. Disable per-page with data-replay="off".
  let replay: ReplayController | null = null
  const replayEnabled = (currentScript()?.dataset?.replay || "on") !== "off"
  if (replayEnabled) {
    try { replay = startReplayRecording(rrwebRecord as any) } catch { replay = null }
  }

  const firstParty = isFirstParty(location.origin, cfg.backendUrl)

  // ONE unified fetch: the project config endpoint returns BOTH the appearance theme (modalConfig,
  // → buildModal 3rd arg) AND the lead-gen widget settings (widget: {mode, ctaUrl}, → success copy).
  let modalConfig: any = {}
  let widget: { mode: string; ctaUrl: string } = { mode: "support", ctaUrl: "https://klavity.quantana.top/onboarding" }
  try {
    const r = await fetch(cfg.backendUrl + "/api/projects/" + encodeURIComponent(cfg.projectId) + "/config")
    if (r.ok) {
      const j = await r.json()
      modalConfig = j.modalConfig || {}
      if (j.widget) widget = { mode: j.widget.mode || "support", ctaUrl: j.widget.ctaUrl || widget.ctaUrl }
    }
  } catch { /* default theme + support mode */ }

  async function postLead(feedbackId: string, email: string) {
    await fetch(cfg.backendUrl + "/api/widget/lead", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: cfg.projectId, feedback_id: feedbackId, email }),
    })
  }

  const reportBtn = document.createElement("button")
  reportBtn.textContent = "🐞 Report a bug"
  reportBtn.style.cssText = "border:0;border-radius:999px;padding:10px 16px;background:#E94F37;color:#fff;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 8px 24px rgba(233,79,55,.35)"
  function openReport(type: "bug" | "feature" = "bug") {
    if (!firstParty && !getToken()) { openConnect(); return }
    buildModal(type, {
      onCaptureFull: async () => toPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }),
      onRegionCapture: async (rect) => cropDataUrl(await toPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }), rect),
      onSubmit: async (p) => submitFeedback(
        { backendUrl: cfg.backendUrl, projectId: cfg.projectId, firstParty, token: getToken() },
        { type: p.type as "bug" | "feature", description: p.description, pageUrl: location.href, screenshots: p.screenshots,
          context: buildWidgetContext(), replayEvents: replay?.getEvents() ?? [] },
      ),
      success: { copy: successCopy(widget.mode, widget.ctaUrl), onLead: postLead },
    }, modalConfig)
  }
  reportBtn.onclick = () => openReport("bug")
  reportDock.appendChild(reportBtn)

  // Right-click anywhere → open the bug reporter (the "right-click bug reporter"), with NO browser
  // extension required — the widget owns the gesture. Shift+right-click falls through to the native
  // menu; right-clicks on the widget launcher or inside an already-open composer/overlay are ignored
  // (so the modal can't stack and right-click-paste still works in the description box).
  let reportArmed = true
  document.addEventListener("contextmenu", (e) => {
    if (e.shiftKey) return
    const path = (e.composedPath?.() || []) as HTMLElement[]
    if (path.some((n) => n?.id === HOST_ID || (typeof n?.className === "string" && /klavity-(overlay|modal)/.test(n.className)))) return
    e.preventDefault()
    if (!reportArmed) return
    reportArmed = false
    setTimeout(() => { reportArmed = true }, 400)
    openReport("bug")
  })

  const banner = (text: string) => {
    let el = root.getElementById("kw-banner") as HTMLDivElement | null
    if (!el) { el = document.createElement("div"); el.id = "kw-banner"
      el.style.cssText = "max-width:240px;background:#15110d;color:#f5f3ee;border:1px solid #574f45;border-radius:10px;padding:9px 11px;font-size:12.5px;margin-bottom:8px"
      dock.appendChild(el) }
    el.textContent = text
    setTimeout(() => { if (el && el.textContent === text) el.remove() }, 6000)
  }

  async function api(pathName: string, opts: RequestInit = {}) {
    const r = await fetch(cfg.backendUrl + pathName, {
      ...opts,
      headers: { ...(opts.headers || {}), authorization: "Bearer " + getToken() },
    })
    return r
  }

  function renderConnectButton() {
    dock.innerHTML = ""
    const b = document.createElement("button")
    b.textContent = "⚡ Connect to Klavity"
    b.style.cssText = "border:0;border-radius:999px;padding:10px 16px;background:#6366f1;color:#fff;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 8px 24px rgba(99,102,241,.35)"
    b.onclick = openConnect
    dock.appendChild(b)
  }

  function openConnect() {
    const u = cfg.backendUrl + "/widget-connect?project=" + encodeURIComponent(cfg.projectId)
      + "&origin=" + encodeURIComponent(location.origin)
    const w = window.open(u, "klavity-connect", "width=380,height=460")
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== cfg.backendUrl) return
      if (ev.data && ev.data.type === "klavity-widget-token" && ev.data.token) {
        setToken(ev.data.token)
        window.removeEventListener("message", onMsg)
        try { w && w.close() } catch {}
        loadSims()
      }
    }
    window.addEventListener("message", onMsg)
  }

  async function loadSims() {
    const r = await api("/api/personas?project=" + encodeURIComponent(cfg.projectId))
    if (r.status === 401) { clearToken(); renderConnectButton(); return }
    if (!r.ok) { banner("Couldn't load your Sims."); return }
    const j = await r.json()
    renderDock((j.personas || []) as Persona[])
  }

  function renderDock(personas: Persona[]) {
    dock.innerHTML = ""
    const col = document.createElement("div")
    col.style.cssText = "display:flex;flex-direction:column;align-items:flex-end;gap:8px"
    const btn = document.createElement("button")
    btn.textContent = "Have your Sims review this page"
    btn.style.cssText = "border:0;border-radius:999px;padding:9px 14px;background:#d98324;color:#fff;font-weight:600;font-size:12.5px;cursor:pointer;box-shadow:0 8px 24px rgba(217,131,36,.3)"
    btn.onclick = () => runReview(btn)
    const avatars = document.createElement("div")
    avatars.style.cssText = "display:flex;gap:-6px"
    for (const p of personas.slice(0, 5)) {
      const s = createSim({ name: p.name, initials: p.initials, color: p.accent || "#6366f1", size: 34, legs: false, animate: false })
      s.style.marginLeft = "-6px"
      avatars.appendChild(s)
    }
    col.appendChild(avatars); col.appendChild(btn); dock.appendChild(col)
  }

  async function runReview(btn: HTMLButtonElement) {
    btn.disabled = true; const orig = btn.textContent; btn.textContent = "Capturing…"
    let shot = ""
    try {
      shot = await toPng(document.body, { cacheBust: true, pixelRatio: 1, skipFonts: true,
        filter: (node) => (node as HTMLElement).id !== HOST_ID })
    } catch { banner("Couldn't capture the page."); btn.disabled = false; btn.textContent = orig; return }
    btn.textContent = "Reviewing…"
    let r = await api("/api/sim/review", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: cfg.projectId, url: location.href, domSig: null, screenshotDataUrl: shot }) })
    let j = await r.json().catch(() => ({}))
    // Auto-grant consent once, then retry — the widget user is an authenticated team member.
    if (!j.ok && j.reason === "needsConsent") {
      await api("/api/consent", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: cfg.projectId, status: "granted" }) })
      r = await api("/api/sim/review", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: cfg.projectId, url: location.href, domSig: null, screenshotDataUrl: shot }) })
      j = await r.json().catch(() => ({}))
    }
    btn.disabled = false; btn.textContent = orig
    if (r.status === 401) { clearToken(); renderConnectButton(); return }
    if (!j.ok) { banner(gateMessage(j.reason || "")); return }
    for (const rev of (j.reviews || [])) for (const re of (rev.reactions || [])) {
      renderBubble(rev.simName, rev.accent || "#6366f1", re.observation, re.sentiment)
    }
    if (!(j.reviews || []).some((x: any) => (x.reactions || []).length)) banner("Your Sims had nothing to flag here.")
  }

  function renderBubble(name: string, accent: string, observation: string, sentiment: string) {
    const b = document.createElement("div")
    b.style.cssText = "max-width:260px;background:#15110d;color:#f5f3ee;border:1px solid #574f45;border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:8px"
    b.style.borderLeftWidth = "3px"
    b.style.borderLeftStyle = "solid"
    b.style.borderLeftColor = accent
    const em = emotionFromSentiment(sentiment)
    // Build with DOM nodes — no innerHTML on server/LLM-sourced text (XSS guard).
    const nameEl = document.createElement("b")
    nameEl.textContent = name
    const sep = document.createTextNode(" · ")
    const emEl = document.createElement("span")
    emEl.style.color = "#8a8076"
    emEl.textContent = em
    const br = document.createElement("br")
    const obs = document.createTextNode(observation || "")
    b.appendChild(nameEl)
    b.appendChild(sep)
    b.appendChild(emEl)
    b.appendChild(br)
    b.appendChild(obs)
    dock.insertBefore(b, dock.firstChild)
    setTimeout(() => b.remove(), 16000)
  }

  // Boot — the Sims-review dock is for embedded customer sites. On first-party (the klavity.quantana.top
  // dogfood) we show only the report launcher, so users don't see a confusing second "Connect" dock.
  if (!firstParty) { if (getToken()) loadSims(); else renderConnectButton() }
  ;(window as any).KlavityWidget = { mount, identify, setMetadata }
}

export async function submitFeedback(
  cfg: { backendUrl: string; projectId: string; firstParty: boolean; token: string },
  payload: { type: "bug" | "feature"; description: string; pageUrl: string; screenshots: string[]; context?: ReportContext; replayEvents?: unknown[] },
): Promise<{ issueKey: string; issueUrl: string }> {
  const fd = buildFeedbackForm({
    description: `[${payload.type}] ${payload.description}`,
    pageUrl: payload.pageUrl,
    projectId: cfg.projectId,
    screenshots: payload.screenshots,
    context: payload.context,
    replayEvents: payload.replayEvents,
  })
  const init: RequestInit = { method: "POST", body: fd }
  if (cfg.firstParty) init.credentials = "include"
  else init.headers = { authorization: "Bearer " + cfg.token }
  const r = await fetch(cfg.backendUrl + "/api/feedback", init)
  if (!r.ok) throw new Error("submit failed: " + r.status)
  const j = await r.json()
  return { issueKey: String(j.id || ""), issueUrl: cfg.backendUrl + "/dashboard" }
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mount())
  else mount()
}

export { mount }
