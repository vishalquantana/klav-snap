// packages/sdk/src/widget.ts
import { createSim, injectSimStyles, emotionFromSentiment } from "@klavity/core/sim"
import { safeToPng } from "./capture"
import { buildModal, installRegionDrag, type ModalController } from "@klavity/core/modal"
import { cropDataUrl, type Rect } from "@klavity/core/crop"
import { planScrollStitch, clampCaptureHeight } from "./sharp-capture"
import { installCapture, buildReportContext, type CaptureBuffers } from "@klavity/core/capture"
import type { ReportContext, ReportIdentity } from "@klavity/core"
import { parseScriptConfig, gateMessage, isFirstParty, buildFeedbackForm, successCopy, compressScreenshot } from "./widget-lib"
import { icon } from "@klavity/core/icons"
import { startReplayRecording, type ReplayController } from "./replay-recorder"
import { injectRecorderScript } from "./load-recorder"
import "./sims-live"  // side-effecting: auto-installs window.KlavitySims on load
import { startSimsWatch, type SimsWatchController } from "./sims-watch"

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

// ── Sharp capture (getDisplayMedia real-pixel scroll-stitch) ─────────────────────────────────────────
// The widget's equivalent of the extension's captureVisibleTab / GoFullPage: getDisplayMedia grabs the
// ACTUAL tab pixels, so every image — including cross-origin ones html-to-image can't fetch under CORS/CSP
// — is captured, with ONE permission prompt. We then scroll the page a viewport at a time, grab a frame
// from the live stream at each stop, and stitch the frames onto one tall canvas (devicePixelRatio-aware,
// last frame bottom-aligned/overdrawn, fixed/sticky elements hidden after the top frame so they don't
// repeat, scroll restored). Feature-detected — absent on iOS Safari, where the modal hides the Sharp
// button and users fall back to the html-to-image "Full Page".
function sharpCaptureSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function"
}
const _raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const _sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const STREAM_SETTLE_MS = 180 // let the live stream catch up to a new scroll position before grabbing a frame

// Hide every position:fixed / position:sticky element (except our own host) via visibility:hidden — keeps
// layout so the stitched frames stay aligned. Records prior values for restore.
function hideFixedSticky(out: Array<{ el: HTMLElement; v: string }>) {
  if (!document.body) return
  const all = document.body.getElementsByTagName("*")
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as HTMLElement
    if (!el || el.id === HOST_ID) continue
    let pos = ""
    try { pos = getComputedStyle(el).position } catch { continue }
    if (pos === "fixed" || pos === "sticky") {
      out.push({ el, v: el.style.visibility })
      el.style.visibility = "hidden"
    }
  }
}

async function captureSharpFullPage(): Promise<string> {
  // getDisplayMedia MUST run first (preserves the click's user gesture); it throws if the user cancels the
  // picker — the modal catches that and restores the composer.
  const stream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
    video: { frameRate: 30 },
    audio: false,
    preferCurrentTab: true, // Chrome: pre-select the current tab in the picker (ignored elsewhere)
  })

  const widgetHost = document.getElementById(HOST_ID)
  const prevHostDisplay = widgetHost ? widgetHost.style.display : ""
  const hiddenFixed: Array<{ el: HTMLElement; v: string }> = []
  const origX = window.scrollX, origY = window.scrollY

  try {
    const video = document.createElement("video")
    video.srcObject = stream
    video.muted = true
    ;(video as any).playsInline = true
    try { await video.play() } catch { /* play() may reject silently; frames still arrive */ }

    const deadline = Date.now() + 3000
    while ((video.videoWidth === 0 || video.videoHeight === 0) && Date.now() < deadline) await _sleep(50)
    if (!video.videoWidth || !video.videoHeight) throw new Error("sharp capture: no video frame")

    const vw = Math.max(1, window.innerWidth)
    const vh = Math.max(1, window.innerHeight)
    // Browsers may downscale a large tab capture, so derive the true scale from the stream, not just DPR.
    const scale = video.videoWidth / vw

    const docH = Math.max(
      document.documentElement.scrollHeight, document.documentElement.offsetHeight,
      document.body ? document.body.scrollHeight : 0, document.body ? document.body.offsetHeight : 0,
    )
    const fullH = clampCaptureHeight(docH, scale)

    const canvas = document.createElement("canvas")
    canvas.width = Math.round(vw * scale)
    canvas.height = Math.round(fullH * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("sharp capture: no 2d context")

    // Hide OUR floating launcher for every frame (the composer is already hidden by the modal).
    if (widgetHost) widgetHost.style.display = "none"

    const stops = planScrollStitch(fullH, vh)
    const drawW = Math.round(vw * scale), drawH = Math.round(vh * scale)
    for (let i = 0; i < stops.length; i++) {
      window.scrollTo(0, stops[i])
      await _raf(); await _raf(); await _sleep(STREAM_SETTLE_MS)
      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, Math.round(stops[i] * scale), drawW, drawH)
      // After the TOP frame, hide fixed/sticky so they don't repeat; the next stop's settle lets the
      // stream reflect the change before that frame is drawn.
      if (i === 0 && stops.length > 1) hideFixedSticky(hiddenFixed)
    }
    return canvas.toDataURL("image/png")
  } finally {
    for (const h of hiddenFixed) h.el.style.visibility = h.v
    if (widgetHost) widgetHost.style.display = prevHostDisplay
    window.scrollTo(origX, origY)
    try { stream.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
  }
}

// Active watch-engine controller — torn down when Sims are undeployed.
let _simsWatchCtrl: SimsWatchController | null = null

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
  reportBtn.title = "Klavity is active on this page — right-click anywhere or click here to report"
  reportBtn.style.cssText = "position:relative;border:0;border-radius:999px;padding:10px 16px;background:#5b5bf0;color:#fff;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 8px 24px rgba(91,91,240,.32);display:inline-flex;align-items:center;gap:7px"
  // ── Active/monitoring indicator: a small live green dot on the launcher so it's obvious Klavity is on. ──
  if (!root.getElementById("klavity-launcher-anim")) {
    const a = document.createElement("style"); a.id = "klavity-launcher-anim"
    a.textContent =
      "@keyframes kl-active-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 7px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}" +
      ".kl-active-dot{position:absolute;top:-3px;right:-3px;width:11px;height:11px;border-radius:50%;background:#22c55e;border:2px solid #fff;animation:kl-active-pulse 2.2s ease-out infinite;}" +
      "@media (prefers-reduced-motion: reduce){.kl-active-dot{animation:none}}"
    root.appendChild(a)
  }
  const activeDot = document.createElement("span")
  activeDot.className = "kl-active-dot"
  activeDot.setAttribute("aria-hidden", "true")
  reportBtn.appendChild(activeDot)
  // Re-entrancy guard: double-clicking the launcher / a menu card must not stack two composers. We keep a
  // reference to the open one and treat it as "open" only while its shadow host is still in the DOM (the
  // modal removes its host on close), so a normal re-open after closing still works.
  let composer: ModalController | null = null
  function openReport(type: "bug" | "feature" = "bug", opts?: { initialShot?: string }) {
    if (composer && (composer.shadowRoot.host as HTMLElement | null)?.isConnected) return
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
    const ctrl = buildModal(type, {
      // Auto-grab a Full Page shot the moment the modal opens — parity with the extension
      // (content.ts autoCaptureOnOpen). Captures the current page state without an extra click.
      // EXCEPT when we already have a right-click-drag region shot: that one is the default first image,
      // so we skip the full-page auto-capture and let the zoomed-in region lead.
      autoCaptureOnOpen: !opts?.initialShot,
      onCaptureFull: async () => safeToPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }),
      onRegionCapture: async (rect) => cropDataUrl(await safeToPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }), rect),
      // Sharp capture: real tab pixels via getDisplayMedia (no CORS issues, captures cross-origin images) +
      // scroll-stitch to a full-page image. Feature-detected — undefined on iOS Safari (no getDisplayMedia),
      // where the modal hides the Sharp button and users fall back to the html-to-image "Full Page" above.
      onCaptureSharp: sharpCaptureSupported() ? () => captureSharpFullPage() : undefined,
      requireEmail,
      // Pre-compress each screenshot as soon as it's captured (runs while the user types their
      // description). By submit time the Promise is settled → zero compression delay before upload.
      compressImage: compressScreenshot,
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
    composer = ctrl // track the open composer so a second open is ignored until this one closes
    // Right-click-drag region: load the cropped selection as the default (first) screenshot, zoomed to fit.
    if (opts?.initialShot) ctrl.addScreenshot(opts.initialShot)
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
    // Magical exit: drop the entrance animation, then transition out (scale + fade down toward launcher).
    m.style.animation = "none"
    m.style.transition = "opacity .13s ease, transform .13s ease"
    requestAnimationFrame(() => { m.style.opacity = "0"; m.style.transform = "scale(.95) translateY(4px)" })
    setTimeout(() => m.remove(), 150)
  }
  // Instant dismissal (no fade) — used when a region drag-select begins so the menu can't linger over the
  // selection. Removes any live OR mid-fade menu, regardless of whether closeMenu already nulled menuEl.
  const dismissMenuNow = () => { menuEl = null; root.querySelectorAll(".klm-menu").forEach((m) => (m as HTMLElement).remove()) }
  // Scoped keyframes for the magical context menu (entrance spring, item stagger, shimmer
  // sweep, icon hover wiggle). Injected once into the widget's shadow root.
  function ensureMenuStyle() {
    if (root.getElementById("klavity-menu-anim")) return
    const s = document.createElement("style")
    s.id = "klavity-menu-anim"
    s.textContent =
      // entrance keyframes (kept): spring scale-in for the tray, staggered rise for each card, shimmer sweep
      "@keyframes klm-in{0%{opacity:0;transform:scale(.9) translateY(8px)}100%{opacity:1;transform:scale(1) translateY(0)}}" +
      "@keyframes klm-row-in{0%{opacity:0;transform:translateY(10px) scale(.97)}100%{opacity:1;transform:translateY(0) scale(1)}}" +
      "@keyframes klm-shine{0%{transform:translateX(-130%)}100%{transform:translateX(240%)}}" +
      "@keyframes klm-spin{to{transform:rotate(360deg)}}" +
      ".klm-menu{animation:klm-in .34s cubic-bezier(.34,1.56,.64,1) both}" +
      // ── Large touch cards (L6): icon chip + label + one-line description + arrow ──
      ".klm-card{position:relative;display:flex;align-items:center;gap:12px;width:100%;border:0;cursor:pointer;text-align:left;padding:11px 12px;border-radius:12px;color:#2a2342;font-family:inherit;background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(252,250,246,.55));box-shadow:0 1px 2px rgba(40,25,70,.06),inset 0 0 0 1px rgba(99,102,241,.08);transition:scale .14s cubic-bezier(.2,0,0,1),box-shadow .2s ease,background .2s ease;animation:klm-row-in .42s cubic-bezier(.16,1,.3,1) both}" +
      ".klm-card:hover{scale:1.015;box-shadow:0 5px 14px -3px rgba(99,102,241,.3),inset 0 0 0 1px rgba(99,102,241,.16)}" +
      ".klm-card:active{scale:.96}" +
      ".klm-card:focus-visible{outline:2px solid #6366f1;outline-offset:2px}" +
      ".klm-chip{flex:none;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:#5b51c9;background:rgba(99,102,241,.12);transition:transform .2s cubic-bezier(.34,1.56,.64,1)}" +
      ".klm-chip svg{width:20px;height:20px;display:block}" +
      ".klm-card:hover .klm-chip{transform:scale(1.1) rotate(-5deg)}" +
      ".klm-body{display:flex;flex-direction:column;gap:2px;min-width:0}" +
      ".klm-t{font-size:14px;font-weight:650;letter-spacing:-.01em;line-height:1.2}" +
      ".klm-d{font-size:11.5px;line-height:1.35;color:#7c7793;text-wrap:pretty}" +
      ".klm-go{margin-left:auto;flex:none;color:#b6afce;display:inline-flex;transition:transform .2s cubic-bezier(.2,0,0,1)}" +
      ".klm-go svg{width:16px;height:16px;display:block}" +
      ".klm-card:hover .klm-go{transform:translateX(3px)}" +
      ".klm-hint{margin-left:auto;flex:none;font-family:ui-monospace,monospace;font-size:10px;color:#9a93a6;background:rgba(40,30,60,.06);padding:3px 8px;border-radius:20px;white-space:nowrap}" +
      // primary = Report a Bug (brand purple)
      ".klm-card.primary{background:linear-gradient(160deg,#6d6bf3,#5b51d8);color:#fff;box-shadow:0 6px 16px -4px rgba(79,70,229,.45),inset 0 1px 0 rgba(255,255,255,.3)}" +
      ".klm-card.primary:hover{box-shadow:0 9px 22px -4px rgba(79,70,229,.55),inset 0 1px 0 rgba(255,255,255,.35)}" +
      ".klm-card.primary .klm-chip{background:rgba(255,255,255,.22);color:#fff}" +
      ".klm-card.primary .klm-d{color:rgba(255,255,255,.85)}" +
      ".klm-card.primary .klm-go{color:rgba(255,255,255,.72)}" +
      // muted = Show browser menu (warm beige)
      ".klm-card.muted{background:linear-gradient(180deg,rgba(250,248,244,.62),rgba(243,236,225,.5))}" +
      ".klm-card.muted .klm-chip{background:rgba(40,30,60,.06);color:#8a8390}" +
      ".klm-card.muted .klm-t{color:#5d5870}.klm-card.muted .klm-d{color:#9a93a6}" +
      // footer wordmark
      ".klm-foot{text-align:center;font-size:11px;color:#8a8076;padding:7px 0 4px;border:0;background:transparent;width:100%;cursor:pointer;font-family:inherit;border-radius:8px;transition:color .18s ease;animation:klm-row-in .42s cubic-bezier(.16,1,.3,1) both}" +
      ".klm-foot:hover{color:#5b51c9}.klm-foot:focus-visible{outline:2px solid #6366f1;outline-offset:2px}" +
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
    menu.style.cssText = "position:fixed;z-index:2147483647;width:240px;max-width:calc(100vw - 16px);border-radius:20px;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;transform-origin:bottom right;padding:8px;display:flex;flex-direction:column;gap:7px;box-sizing:border-box;" +
      "background:radial-gradient(135% 90% at 50% -12%, rgba(139,92,246,.18), rgba(139,92,246,0) 55%), linear-gradient(180deg, rgba(250,247,240,.95), rgba(243,236,225,.96));" +
      "border:1px solid rgba(255,255,255,.55);" +
      "box-shadow:0 24px 60px -12px rgba(76,40,130,.32), 0 8px 22px rgba(99,102,241,.16), 0 1.5px 4px rgba(25,20,15,.10), inset 0 1px 0 rgba(255,255,255,.75);" +
      "-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);" +
      "right:18px;bottom:74px"
    // Lucide arrow-right (no such icon in our set → inline) for each card's affordance.
    const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'
    let idx = 0
    // Each action is a large touch CARD: icon chip + label + one-line description + arrow (or the ⇧ hint).
    const card = (iconName: string, label: string, desc: string, opts: { primary?: boolean; muted?: boolean; hint?: string; onClick: () => void }) => {
      const b = document.createElement("button")
      b.className = "klm-card" + (opts.primary ? " primary" : "") + (opts.muted ? " muted" : "")
      b.style.animationDelay = (70 + idx * 64) + "ms"
      idx++
      const right = opts.hint
        ? '<span class="klm-hint">' + opts.hint + '</span>'
        : '<span class="klm-go">' + ARROW + '</span>'
      b.innerHTML =
        '<span class="klm-chip">' + icon(iconName) + '</span>' +
        '<span class="klm-body"><span class="klm-t">' + label + '</span><span class="klm-d">' + desc + '</span></span>' +
        right
      b.addEventListener("click", () => { closeMenu(); opts.onClick() })
      return b
    }
    // ── Inline Sim picker — replaces menu content in-place, async fetch of /api/personas ──
    const showSimPicker = async () => {
      // Reveal overflow so a long Sim list scrolls rather than clips
      menu.style.overflow = "visible"
      Array.from(menu.children).forEach((c) => { if (!(c as HTMLElement).classList.contains("klm-shine")) c.remove() })
      // Loading state
      const status = document.createElement("div")
      status.style.cssText = "display:flex;align-items:center;gap:8px;padding:14px 12px;font-size:12.5px;color:#7c7793"
      const spinSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:klm-spin .7s linear infinite;flex-shrink:0"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`
      status.innerHTML = spinSvg + " Loading Sims…"
      menu.appendChild(status)
      let personas: Array<{ id: string; name: string; role?: string }> = []
      try {
        const r = await api("/api/personas?project=" + encodeURIComponent(cfg.projectId))
        if (!r.ok) throw new Error()
        personas = ((await r.json()).personas || []) as typeof personas
      } catch {
        status.innerHTML = "Couldn't load Sims."
        return
      }
      if (!personas.length) { status.innerHTML = "No Sims in this project yet."; return }
      status.remove()
      // Header row: × close + title
      const hdr = document.createElement("div")
      hdr.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 4px 8px"
      const closeBtn = document.createElement("button")
      closeBtn.innerHTML = icon("x", { size: 14 })
      closeBtn.style.cssText = "display:grid;place-items:center;width:26px;height:26px;border:0;background:rgba(99,102,241,.1);border-radius:8px;cursor:pointer;color:#5b51c9;flex-shrink:0"
      closeBtn.addEventListener("click", () => closeMenu())
      const hdrTitle = document.createElement("span")
      hdrTitle.textContent = "Choose Sims"
      hdrTitle.style.cssText = "font-size:13px;font-weight:650;color:#2a2342"
      hdr.append(closeBtn, hdrTitle); menu.appendChild(hdr)
      const sel = new Set<string>()
      // Confirm button (built early so sync() can update it)
      const confirmBtn = document.createElement("button")
      confirmBtn.disabled = true
      confirmBtn.style.cssText = "width:100%;padding:11px;border:0;border-radius:12px;font-family:inherit;font-size:13.5px;font-weight:650;cursor:pointer;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;margin-top:6px;opacity:.45;transition:opacity .15s"
      confirmBtn.textContent = "Select a Sim first"
      const syncConfirm = () => {
        const n = sel.size
        confirmBtn.disabled = n === 0
        confirmBtn.textContent = n > 0 ? `Deploy ${n} Sim${n > 1 ? "s" : ""} →` : "Select a Sim first"
        confirmBtn.style.opacity = n > 0 ? "1" : ".45"
      }
      confirmBtn.addEventListener("click", () => { if (!sel.size) return; closeMenu(); void deployAndWatch([...sel]) })
      // Sim rows — scrollable list
      const list = document.createElement("div")
      list.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto"
      for (const p of personas) {
        const row = document.createElement("button")
        row.style.cssText = "display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;background:transparent;border:1.5px solid transparent;border-radius:10px;cursor:pointer;text-align:left;font-family:inherit;transition:background .14s,border-color .14s"
        const chk = document.createElement("span")
        chk.style.cssText = "width:17px;height:17px;border-radius:5px;border:1.5px solid rgba(99,102,241,.35);display:grid;place-items:center;flex-shrink:0;transition:background .14s,border-color .14s"
        const nm = document.createElement("span")
        nm.textContent = p.name
        nm.style.cssText = "font-size:13px;font-weight:550;color:#2a2342;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        row.append(chk, nm)
        if (p.role) { const rl = document.createElement("span"); rl.textContent = p.role; rl.style.cssText = "font-size:10.5px;color:#9a93a6;white-space:nowrap"; row.appendChild(rl) }
        const setOn = (on: boolean) => {
          chk.style.background = on ? "#6366f1" : ""; chk.style.borderColor = on ? "#6366f1" : "rgba(99,102,241,.35)"
          chk.innerHTML = on ? icon("check", { size: 11 }) : ""
          row.style.background = on ? "rgba(99,102,241,.09)" : ""; row.style.borderColor = on ? "rgba(99,102,241,.22)" : "transparent"
        }
        row.addEventListener("click", () => { sel.has(p.id) ? sel.delete(p.id) : sel.add(p.id); setOn(sel.has(p.id)); syncConfirm() })
        row.addEventListener("mouseenter", () => { if (!sel.has(p.id)) row.style.background = "rgba(99,102,241,.05)" })
        row.addEventListener("mouseleave", () => { if (!sel.has(p.id)) row.style.background = "" })
        list.appendChild(row)
      }
      menu.append(list, confirmBtn)
    }
    menu.appendChild(card("zap", "Report a Bug", "Snap the page and tell us what broke.", { primary: true, onClick: () => openReport("bug") }))
    menu.appendChild(card("lightbulb", "Request a Feature", "Suggest something you'd love to see.", { onClick: () => openReport("feature") }))
    // Sims live review — only shown to authenticated team members (token present).
    if (getToken()) {
      menu.appendChild(card("dna", "Ask Sims to review this", "Get instant in-character reactions from your AI personas.", { onClick: () => void runReview() }))
    }
    menu.appendChild(card("users", "Deploy all Sims", "Have every Sim jump in and analyze this page.", { onClick: () => { closeMenu(); void deployAndWatch("all") } }))
    menu.appendChild(card("sparkles", "Select Sims…", "Choose which Sims jump into action.", { onClick: () => { void showSimPicker() } }))
    menu.appendChild(card("monitor", "Show browser menu", "Open your browser's own menu instead.", { muted: true, hint: "⇧ right-click", onClick: () => { nativePending = true; showNativeHint(x, y) } }))
    // "Powered by Klavity" footer — gradient wordmark, opens the marketing site in a new tab
    const footer = document.createElement("button")
    footer.className = "klm-foot"
    footer.style.animationDelay = (70 + idx * 64) + "ms"
    footer.innerHTML = "Powered by <strong style=\"background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-weight:700\">Klavity</strong>"
    footer.addEventListener("click", () => { closeMenu(); window.open("https://klavity.quantana.top", "_blank", "noopener,noreferrer") })
    menu.appendChild(footer)
    // One-pass shimmer sweep — appended LAST so it sweeps OVER the opaque cards (pointer-events:none).
    const shine = document.createElement("div"); shine.className = "klm-shine"; menu.appendChild(shine)
    root.appendChild(menu)
    // Fixed bottom-right anchor — aligns with the launcher button (right:18px, bottom:18px + ~48px button).
    // CSS right/bottom keep the menu in viewport on all screen sizes; no JS clamping needed.
    const onOutside = (ev: MouseEvent) => { const p = (ev.composedPath?.() || []) as HTMLElement[]; if (!p.includes(menu)) { closeMenu(); document.removeEventListener("mousedown", onOutside) } }
    const onEsc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { closeMenu(); document.removeEventListener("keydown", onEsc, true) } }
    setTimeout(() => { document.addEventListener("mousedown", onOutside); document.addEventListener("keydown", onEsc, true) }, 0)
  }

  // Right-clicks on the widget's own UI (launcher / menu / open composer / overlay) are ignored so the
  // context menu and region-drag never hijack them (right-click-paste in the description box keeps working).
  const onOwnUi = (e: MouseEvent) => {
    const path = (e.composedPath?.() || []) as HTMLElement[]
    return path.some((n) => n?.id === HOST_ID || (typeof n?.className === "string" && /klavity-(overlay|modal)/.test(n.className)))
  }

  // ── Right-click + DRAG to select a region → capture JUST that area → open the composer with it as the
  // default (first), zoomed-in screenshot. A plain right-click (no drag) still shows the menu below. ──
  async function captureRegionAndOpen(rect: Rect) {
    let shot = ""
    try {
      // Full-page capture (CSP/CORS-resilient), then crop to the selected VIEWPORT rect (cropDataUrl adds
      // the scroll offset). Best-effort: if capture fails, still open the composer so the user can retry.
      shot = await cropDataUrl(await safeToPng(document.body, { filter: (n) => (n as HTMLElement).id !== HOST_ID }), rect)
    } catch { /* fall back to an empty composer */ }
    openReport("bug", shot ? { initialShot: shot } : undefined)
  }
  let reportArmed = true
  const regionDrag = installRegionDrag({
    isOwnTarget: onOwnUi,
    mount: root,                        // draw the selection rectangle inside the widget's shadow root
    shouldIgnore: () => nativePending,  // skip pressing when next click is for the native menu
    onRightDown: dismissMenuNow,        // close any open menu immediately at mousedown
    onDragStart: dismissMenuNow,        // safety: also dismiss if menu reappeared before threshold
    onPlainRightClick: (x, y) => {
      // suppressNextMenu() is true while pressing, so contextmenu is suppressed; show menu here on mouseup.
      if (!reportArmed) return
      reportArmed = false
      setTimeout(() => { reportArmed = true }, 400)
      showMenu(x, y)
    },
    onRegion: (rect) => { void captureRegionAndOpen(rect) },
  })

  document.addEventListener("contextmenu", (e) => {
    if (e.shiftKey || nativePending) { nativePending = false; return }  // pass through to native menu
    if (regionDrag.suppressNextMenu()) { e.preventDefault(); return }   // pressing or drag — suppress
    if (onOwnUi(e)) return
    // Keyboard contextmenu (no preceding mousedown) — pressing is false, show menu immediately.
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

  // Deploy the named Sims (or "all") + boot the watch engine for continuous page monitoring.
  // Fetches the project's personas so deploy() receives a non-empty sims descriptor array.
  async function deployAndWatch(simIds: string[] | 'all') {
    _simsWatchCtrl?.stop()
    _simsWatchCtrl = null
    let sims: Array<{ id: string; name: string; initials?: string; accent?: string }> = []
    try {
      const r = await api("/api/personas?project=" + encodeURIComponent(cfg.projectId))
      if (r.ok) {
        const data = await r.json().catch(() => ({}))
        sims = Array.isArray(data.personas) ? data.personas : []
      }
    } catch { /* non-fatal: empty dock is guarded in sims-live.ts */ }
    ;(window as any).KlavitySims?.deploy?.(simIds, sims)
    // Boot the watch engine to monitor scroll / navigation / DOM mutations.
    _simsWatchCtrl = startSimsWatch({
      backendUrl: cfg.backendUrl,
      projectId: cfg.projectId,
      simIds: simIds === 'all' ? undefined : simIds,
      captureViewport: () => safeToPng(document.body, { skipFonts: true }),
      bearerToken: getToken() || undefined,
    })
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
    for (const rev of (j.reviews || [])) for (const re of (rev.observations || [])) {
      renderBubble(rev.simName, rev.accent || "#6366f1", re.text, re.sentiment)
    }
    if (!(j.reviews || []).some((x: any) => (x.observations || []).length)) banner("Your Sims had nothing to flag here.")
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
  // Compress screenshots (PNG → JPEG, downscale very wide ones) so the upload is fast. Best-effort,
  // parallel; each falls back to its original on failure.
  const screenshots = await Promise.all(payload.screenshots.map((s) => compressScreenshot(s)))
  const fd = buildFeedbackForm({
    description: `[${payload.type}] ${payload.description}`,
    pageUrl: payload.pageUrl,
    referrer: payload.referrer,
    projectId: cfg.projectId,
    screenshots,
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
