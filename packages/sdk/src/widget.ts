// packages/sdk/src/widget.ts
import { createSim, injectSimStyles, emotionFromSentiment } from "@klavity/core/sim"
import { safeToPng } from "./capture"
import { buildModal } from "@klavity/core/modal"
import { cropDataUrl } from "@klavity/core/crop"
import { installCapture, buildReportContext, type CaptureBuffers } from "@klavity/core/capture"
import type { ReportContext, ReportIdentity } from "@klavity/core"
import { parseScriptConfig, gateMessage, isFirstParty, buildFeedbackForm, successCopy } from "./widget-lib"
import { icon } from "@klavity/core/icons"
import { startReplayRecording, type ReplayController } from "./replay-recorder"
import { injectRecorderScript } from "./load-recorder"

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
  //
  // PERF: rrweb (~260 KB) is NOT bundled into the widget IIFE — it's lazy-loaded as a vendored script
  // from the Klavity backend AFTER mount (non-blocking). Until it resolves, replay stays null and
  // replay?.getEvents() returns []. A few hundred ms of "not recording yet" at page load is fine.
  let replay: ReplayController | null = null
  const replayEnabled = (currentScript()?.dataset?.replay || "on") !== "off"
  if (replayEnabled) {
    injectRecorderScript(cfg.backendUrl)
      .then((rrweb) => {
        if (rrweb?.record) { try { replay = startReplayRecording(rrweb.record as any) } catch { replay = null } }
      })
      .catch(() => { /* never let recorder loading break the widget */ })
  }

  const firstParty = isFirstParty(location.origin, cfg.backendUrl)

  // ONE unified fetch: the project config endpoint returns BOTH the appearance theme (modalConfig,
  // → buildModal 3rd arg) AND the lead-gen widget settings (widget: {mode, ctaUrl}, → success copy).
  let modalConfig: any = {}
  let widget: { mode: string; ctaUrl: string; reportGate: string } = { mode: "support", ctaUrl: "https://klavity.quantana.top/onboarding", reportGate: "email" }
  try {
    const r = await fetch(cfg.backendUrl + "/api/projects/" + encodeURIComponent(cfg.projectId) + "/config")
    if (r.ok) {
      const j = await r.json()
      modalConfig = j.modalConfig || {}
      if (j.widget) widget = { mode: j.widget.mode || "support", ctaUrl: j.widget.ctaUrl || widget.ctaUrl, reportGate: j.widget.reportGate || "email" }
    }
  } catch { /* default theme + support mode + email gate */ }

  // ── Heartbeat (TASK #5): tell the backend this widget is live on this page so the dashboard can show
  // "Widget: active — last seen … on <host>". Fire-and-forget, non-blocking, and never throws — a failed
  // ping must never affect the page. keepalive lets it complete even if the user navigates immediately. ──
  try {
    fetch(cfg.backendUrl + "/api/widget/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      // Source site: the page this widget is embedded on (+ where the visitor came from). The server
      // derives the trusted host from Origin/Referer; url/referrer are extra attribution signals.
      body: JSON.stringify({ project_id: cfg.projectId, host: location.host, url: location.href, referrer: document.referrer || "" }),
    }).catch(() => {})
  } catch { /* best-effort */ }

  async function postLead(feedbackId: string, email: string) {
    await fetch(cfg.backendUrl + "/api/widget/lead", {
      method: "POST", headers: { "content-type": "application/json" },
      // Carry the source site so a lead alert says where the lead came from (fallback to the feedback
      // row's captured values server-side).
      body: JSON.stringify({ project_id: cfg.projectId, feedback_id: feedbackId, email, source_url: location.href, source_host: location.host, referrer: document.referrer || "" }),
    })
  }

  const reportBtn = document.createElement("button")
  reportBtn.innerHTML = `${icon('bug')} Report a bug`
  reportBtn.style.cssText = "border:0;border-radius:999px;padding:10px 16px;background:#5b5bf0;color:#fff;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 8px 24px rgba(91,91,240,.32);display:inline-flex;align-items:center;gap:7px"
  function openReport(type: "bug" | "feature" = "bug") {
    const identified = firstParty || !!getToken()  // already known to Klavity (own page session, or signed-in widget)
    // Only the "login" gate forces the connect flow on third-party sites. "email"/"anonymous" let an
    // end-user file WITHOUT a Klavity account; "email" requires a typed email when not already identified.
    if (widget.reportGate === "login" && !identified) { openConnect(); return }
    const requireEmail = widget.reportGate === "email" && !identified
    // Don't beg for an email on the success screen when it's redundant: we already collected it via the
    // gate (requireEmail), the user is a signed-in widget user (token), or it's our own non-leadgen page
    // (e.g. the logged-in dashboard). Leadgen pages still capture the lead — that's the whole funnel.
    const suppressSuccessEmail = requireEmail || !!getToken() || (firstParty && widget.mode !== "leadgen")
    // Resilience: opening the composer must NEVER be blocked or killed by an enhancement. Session-replay
    // load + the auto-screenshot are already best-effort (injectRecorderScript resolves null on
    // adblock/error; autoCaptureOnOpen is deferred + caught inside buildModal). This try/catch is the
    // final belt-and-suspenders so an unexpected throw can't leave the button silently doing nothing.
    try {
    buildModal(type, {
      // Auto-grab a Full Page shot the moment the modal opens — parity with the extension
      // (content.ts autoCaptureOnOpen). Captures the current page state without an extra click.
      autoCaptureOnOpen: true,
      onCaptureFull: async () => safeToPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }),
      onRegionCapture: async (rect) => cropDataUrl(await safeToPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }), rect),
      requireEmail,
      onSubmit: async (p) => submitFeedback(
        { backendUrl: cfg.backendUrl, projectId: cfg.projectId, firstParty, token: getToken() },
        { type: p.type as "bug" | "feature", description: p.description, pageUrl: location.href, referrer: document.referrer || "", screenshots: p.screenshots,
          context: buildWidgetContext(), replayEvents: replay?.getEvents() ?? [], annotations: p.annotations,
          // Forward the gate's required email → server reporter_email. Without this, an "email"-gated
          // project (the default for cross-origin support widgets) rejects every submit with 400.
          reporterEmail: p.reporterEmail },
      ),
      success: { copy: successCopy(widget.mode, widget.ctaUrl, suppressSuccessEmail), onLead: postLead },
    }, modalConfig)
    } catch (e) { console.warn("[Klavity] failed to open the report composer:", e) }
  }
  reportBtn.onclick = () => openReport("bug")
  reportDock.appendChild(reportBtn)

  // Right-click anywhere → a small Klavity menu (mirrors the extension's context menu and the
  // mock-up on the marketing home page): Report a Bug / Request a Feature, then the native
  // browser menu. NO extension required — the widget owns the gesture. Shift+right-click (or
  // "Show browser menu") falls through to the native menu; right-clicks on the widget host
  // (launcher, this menu, or an open composer/overlay) are ignored so nothing stacks and
  // right-click-paste still works in the description box. The menu lives in the widget's
  // shadow root, so the host-path guard below also ignores right-clicks on the menu itself.
  let menuEl: HTMLDivElement | null = null
  let nativePending = false
  const closeMenu = () => {
    const m = menuEl; menuEl = null
    if (!m) return
    // Magical exit: drop the entrance animation, then transition out (scale + fade up).
    m.style.animation = "none"
    m.style.transition = "opacity .13s ease, transform .13s ease"
    requestAnimationFrame(() => { m.style.opacity = "0"; m.style.transform = "scale(.95) translateY(-4px)" })
    setTimeout(() => m.remove(), 150)
  }
  // Scoped keyframes for the magical context menu (entrance spring, item stagger, shimmer
  // sweep, icon hover wiggle). Injected once into the widget's shadow root.
  function ensureMenuStyle() {
    if (root.getElementById("klavity-menu-anim")) return
    const s = document.createElement("style")
    s.id = "klavity-menu-anim"
    s.textContent =
      "@keyframes klm-in{0%{opacity:0;transform:scale(.9) translateY(-8px)}100%{opacity:1;transform:scale(1) translateY(0)}}" +
      "@keyframes klm-row-in{0%{opacity:0;transform:translateY(7px)}100%{opacity:1;transform:translateY(0)}}" +
      "@keyframes klm-shine{0%{transform:translateX(-130%)}100%{transform:translateX(240%)}}" +
      ".klm-menu{animation:klm-in .34s cubic-bezier(.34,1.56,.64,1) both}" +
      ".klm-row{animation:klm-row-in .34s cubic-bezier(.16,1,.3,1) both}" +
      ".klm-ic{display:inline-flex;align-items:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}" +
      ".klm-ic svg{width:17px;height:17px;display:block}" +
      ".klm-row:hover .klm-ic{transform:scale(1.18) rotate(-7deg)}" +
      ".klm-shine{position:absolute;top:0;left:0;width:42%;height:100%;pointer-events:none;background:linear-gradient(105deg,transparent,rgba(255,255,255,.6),transparent);transform:translateX(-130%);animation:klm-shine 1s ease-out .15s both}"
    root.appendChild(s)
  }
  // Scripts can't open the browser's native context menu programmatically — it only
  // appears on a real right-click. So "Show browser menu" arms the next right-click to
  // pass through, and we show a brief hint telling the user to right-click again.
  function showNativeHint(x: number, y: number) {
    const t = document.createElement("div")
    t.textContent = "↗ Right-click again to open the browser menu"
    t.style.cssText = "position:fixed;z-index:2147483647;left:" + x + "px;top:" + (y + 6) + "px;background:#1a1a1a;color:#fff;font:500 12.5px system-ui,-apple-system,sans-serif;padding:8px 13px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.32);pointer-events:none;opacity:0;transition:opacity .2s;max-width:260px"
    root.appendChild(t)
    requestAnimationFrame(() => { t.style.opacity = "1" })
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 250) }, 2400)
  }
  function showMenu(x: number, y: number) {
    closeMenu()
    ensureMenuStyle()
    const menu = document.createElement("div")
    menuEl = menu
    menu.className = "klm-menu"
    // Warm cream "glass" surface with a soft Klavity-purple glow at the top, a layered
    // purple-tinted shadow, and a frosted backdrop. (Plain backdrop blur — not liquid-glass
    // refraction, which doesn't compose in Chrome.)
    menu.style.cssText = "position:fixed;z-index:2147483647;min-width:248px;border-radius:14px;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;transform-origin:top left;" +
      "background:radial-gradient(135% 90% at 50% -12%, rgba(139,92,246,.18), rgba(139,92,246,0) 55%), linear-gradient(180deg, rgba(250,247,240,.95), rgba(243,236,225,.96));" +
      "border:1px solid rgba(255,255,255,.55);" +
      "box-shadow:0 24px 60px -12px rgba(76,40,130,.32), 0 8px 22px rgba(99,102,241,.16), 0 1.5px 4px rgba(25,20,15,.10), inset 0 1px 0 rgba(255,255,255,.75);" +
      "-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);" +
      "left:" + x + "px;top:" + y + "px"
    // One-pass shimmer sweep across the surface as the menu appears.
    const shine = document.createElement("div"); shine.className = "klm-shine"; menu.appendChild(shine)
    let idx = 0
    const row = (iconName: string, text: string, opts: { primary?: boolean; muted?: boolean; hint?: string; last?: boolean; onClick: () => void }) => {
      const b = document.createElement("button")
      b.className = "klm-row"
      const baseBg = opts.primary ? "rgba(99,102,241,.10)" : "transparent"
      const baseColor = opts.muted ? "#8a8076" : "#19140f"
      const icColor = opts.primary ? "#6366f1" : (opts.muted ? "#9a9088" : "#6b5fd6")
      b.style.cssText = "position:relative;display:flex;align-items:center;gap:11px;width:100%;padding:11px 15px;border:0;" +
        (opts.last ? "" : "border-bottom:1px solid rgba(99,102,241,.09);") +
        "background:" + baseBg + ";color:" + baseColor + ";font-size:13.5px;font-weight:" + (opts.primary ? "600" : "450") + ";cursor:pointer;text-align:left;line-height:1.15;transition:background .18s ease,color .18s ease;" +
        (opts.primary ? "box-shadow:inset 3px 0 0 #6366f1;" : "") +
        "animation-delay:" + (70 + idx * 45) + "ms"
      idx++
      b.innerHTML = "<span class=\"klm-ic\" style=\"color:" + icColor + "\">" + icon(iconName) + "</span><span>" + text + "</span>"
      if (opts.hint) { const h = document.createElement("span"); h.textContent = opts.hint; h.style.cssText = "margin-left:auto;font-family:ui-monospace,monospace;font-size:10.5px;color:#a59a8c"; b.appendChild(h) }
      b.addEventListener("mouseenter", () => { b.style.background = opts.primary ? "rgba(99,102,241,.18)" : "rgba(139,92,246,.12)"; b.style.color = "#4f46e5" })
      b.addEventListener("mouseleave", () => { b.style.background = baseBg; b.style.color = baseColor })
      b.addEventListener("click", () => { closeMenu(); opts.onClick() })
      return b
    }
    menu.appendChild(row("zap", "Report a Bug", { primary: true, onClick: () => openReport("bug") }))
    menu.appendChild(row("lightbulb", "Request a Feature", { onClick: () => openReport("feature") }))
    menu.appendChild(row("monitor", "Show browser menu", { muted: true, hint: "⇧ right-click", onClick: () => { nativePending = true; showNativeHint(x, y) } }))
    // "Powered by Klavity" footer — gradient wordmark, opens the marketing site in a new tab
    const footer = document.createElement("button")
    footer.className = "klm-row"
    footer.style.cssText = "position:relative;display:block;width:100%;padding:9px 15px;border:0;background:rgba(231,225,214,.55);color:#776c5d;font-family:system-ui,-apple-system,sans-serif;font-size:11.5px;font-weight:450;cursor:pointer;text-align:center;line-height:1.15;border-top:1px solid rgba(99,102,241,.10);transition:background .18s ease,color .18s ease;animation-delay:" + (70 + idx * 45) + "ms"
    footer.innerHTML = "Powered by <strong style=\"background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-weight:700\">Klavity</strong>"
    footer.addEventListener("mouseenter", () => { footer.style.background = "rgba(139,92,246,.14)"; footer.style.color = "#4f46e5" })
    footer.addEventListener("mouseleave", () => { footer.style.background = "rgba(231,225,214,.55)"; footer.style.color = "#776c5d" })
    footer.addEventListener("click", () => { closeMenu(); window.open("https://klavity.quantana.top", "_blank", "noopener,noreferrer") })
    menu.appendChild(footer)
    root.appendChild(menu)
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect()
      let ox = "left", oy = "top"
      if (r.right > innerWidth - 8) { menu.style.left = (x - r.width) + "px"; ox = "right" }
      if (r.bottom > innerHeight - 8) { menu.style.top = (y - r.height) + "px"; oy = "bottom" }
      menu.style.transformOrigin = oy + " " + ox   // grow from the corner nearest the cursor
    })
    const onOutside = (ev: MouseEvent) => { const p = (ev.composedPath?.() || []) as HTMLElement[]; if (!p.includes(menu)) { closeMenu(); document.removeEventListener("mousedown", onOutside) } }
    const onEsc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { closeMenu(); document.removeEventListener("keydown", onEsc, true) } }
    setTimeout(() => { document.addEventListener("mousedown", onOutside); document.addEventListener("keydown", onEsc, true) }, 0)
  }

  let reportArmed = true
  document.addEventListener("contextmenu", (e) => {
    if (e.shiftKey || nativePending) { nativePending = false; return }  // pass through to native menu
    const path = (e.composedPath?.() || []) as HTMLElement[]
    if (path.some((n) => n?.id === HOST_ID || (typeof n?.className === "string" && /klavity-(overlay|modal)/.test(n.className)))) return
    e.preventDefault()
    if (!reportArmed) return
    reportArmed = false
    setTimeout(() => { reportArmed = true }, 400)
    showMenu(e.clientX, e.clientY)
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
    if (r.status === 401) { clearToken(); dock.innerHTML = ""; return }  // token expired → drop the Sims dock; never show a bare Connect CTA
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
      shot = await safeToPng(document.body, { filter: (node) => (node as HTMLElement).id !== HOST_ID })
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
    if (r.status === 401) { clearToken(); dock.innerHTML = ""; return }  // token expired → drop the Sims dock; never show a bare Connect CTA
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

  // Boot — SINGLE primary CTA. The floating launcher always shows "Report a bug". The Sims-review dock
  // is an authenticated team tool, so it loads ONLY when the widget is already connected (token present).
  // We never render a bare "Connect to Klavity" prompt to anonymous visitors: it's a PLG/prospect CTA
  // that co-rendered with "Report a bug" and confused users on configured support projects (e.g. bigidea).
  // Connecting happens deliberately from the Klavity dashboard (or the report "login" gate), not by
  // prompting every visitor of a customer's site.
  if (!firstParty && getToken()) loadSims()
  ;(window as any).KlavityWidget = { mount, identify, setMetadata }
}

export async function submitFeedback(
  cfg: { backendUrl: string; projectId: string; firstParty: boolean; token: string },
  payload: { type: "bug" | "feature"; description: string; pageUrl: string; referrer?: string; screenshots: string[]; context?: ReportContext; replayEvents?: unknown[]; annotations?: any; reporterEmail?: string },
): Promise<{ issueKey: string; issueUrl: string }> {
  const fd = buildFeedbackForm({
    description: `[${payload.type}] ${payload.description}`,
    pageUrl: payload.pageUrl,
    referrer: payload.referrer,
    projectId: cfg.projectId,
    screenshots: payload.screenshots,
    context: payload.context,
    replayEvents: payload.replayEvents,
  })
  // Reporter identity for the "email" gate: an end-user with no Klavity account types an email so the
  // server accepts the anonymous cross-origin report and can notify them on fix.
  if (payload.reporterEmail) fd.set("reporter_email", payload.reporterEmail)
  const init: RequestInit = { method: "POST", body: fd }
  if (cfg.firstParty) init.credentials = "include"
  else if (cfg.token) init.headers = { authorization: "Bearer " + cfg.token }
  // else: anonymous cross-origin report (email/anonymous gate) — no auth header; the server applies
  // the project's report gate (valid project + email when required + rate limits) and CORS.
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
