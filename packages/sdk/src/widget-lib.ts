import type { ReportContext, ReportIdentity } from "@klavity/core"
import { icon } from '@klavity/core/icons'

export function parseScriptConfig(scriptEl: { dataset: Record<string, string | undefined>, src: string }): { projectId: string, backendUrl: string, identity?: ReportIdentity, metadata?: Record<string, string> } {
  const projectId = scriptEl.dataset.project || ""
  let backendUrl = ""
  try { backendUrl = new URL(scriptEl.src).origin } catch { backendUrl = "" }
  // G5: custom identity/metadata can be declared on the script tag, e.g.
  //   <script src=".../widget.js" data-project="p1"
  //           data-user-id="u_42" data-user-email="a@b.com" data-user-name="Ada"
  //           data-meta='{"plan":"pro","tenant":"acme"}'></script>
  const identity: ReportIdentity = {}
  if (scriptEl.dataset.userId) identity.id = String(scriptEl.dataset.userId)
  if (scriptEl.dataset.userEmail) identity.email = String(scriptEl.dataset.userEmail)
  if (scriptEl.dataset.userName) identity.name = String(scriptEl.dataset.userName)
  let metadata: Record<string, string> | undefined
  if (scriptEl.dataset.meta) {
    try {
      const parsed = JSON.parse(scriptEl.dataset.meta)
      if (parsed && typeof parsed === "object") {
        metadata = {}
        for (const [k, v] of Object.entries(parsed)) {
          if (v === undefined || v === null) continue
          metadata[String(k).slice(0, 64)] = String(v).slice(0, 1000)
        }
      }
    } catch { /* ignore malformed data-meta */ }
  }
  return {
    projectId, backendUrl,
    identity: Object.keys(identity).length ? identity : undefined,
    metadata,
  }
}

export interface SuccessCopy {
  headline: string
  body: string
  emailLabel: string
  ctaText: string
  ctaUrl: string
  showEmail: boolean
  showCta: boolean
}

// suppressEmail: hide the post-submit email capture when the reporter is already identified (logged-in
// / first-party non-leadgen) or we already took their email via the report gate — no point asking twice.
export function successCopy(mode: string, ctaUrl: string, suppressEmail = false): SuccessCopy {
  if (mode === "leadgen") return {
    headline: "That's exactly how Klavity works",
    body: "You just right-clicked → auto-screenshot → filed a real ticket. Your users could do this for you.",
    emailLabel: "Send me the 2-min setup", ctaText: "Start free →", ctaUrl,
    showEmail: !suppressEmail, showCta: true,
  }
  if (mode === "off") return {
    headline: "Thanks — your report is filed", body: "", emailLabel: "", ctaText: "", ctaUrl,
    showEmail: false, showCta: false,
  }
  return { // support (default)
    headline: `Bug filed ${icon('check-circle', { label: 'filed', size: 16 })}`,
    body: suppressEmail ? "Thanks — we'll keep you posted." : "Want to know when it's fixed? Drop your email and we'll ping you.",
    emailLabel: "Notify me", ctaText: "", ctaUrl,
    showEmail: !suppressEmail, showCta: false,
  }
}

export function gateMessage(reason: string): string {
  switch (reason) {
    case "paused": return "Sims are paused for this project."
    case "userPaused": return "Live reviews are paused for your account."
    case "needsConsent": return "Turning on live reviews for your account…"
    case "offAllowlist": return "This page isn't on your project's watch list — add it in Klavity."
    case "alreadyReviewed": return "Your Sims already reviewed this view."
    case "budgetExhausted": return "Today's review budget is used up."
    case "unauthorized": return "Your session expired — reconnect to Klavity."
    default: return "Couldn't run the review. Try again."
  }
}

export function isFirstParty(scriptOrigin: string, backendUrl: string): boolean {
  try { return new URL(scriptOrigin).origin === new URL(backendUrl).origin } catch { return false }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",")
  const mime = (head.match(/data:([^;]+)/)?.[1]) || "image/png"
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// Shrink a screenshot before upload so submits aren't slow: re-encode PNG → JPEG (typically 5–10× smaller)
// and downscale anything wider than maxWidth (retina/Sharp captures) — height is preserved so tall full-page
// captures stay readable. Best-effort: on any failure, or if the result isn't actually smaller, the
// original data URL is returned unchanged. The clean image is what's uploaded; annotations travel as a
// separate structured overlay, so re-encoding never affects the markup.
export async function compressScreenshot(dataUrl: string, opts: { maxWidth?: number; quality?: number } = {}): Promise<string> {
  const maxWidth = opts.maxWidth ?? 2000
  const quality = opts.quality ?? 0.82
  // Already a JPEG (e.g. pre-compressed by the modal on capture) — skip re-encoding entirely.
  if (dataUrl.startsWith("data:image/jpeg")) return dataUrl
  if (typeof document === "undefined" || !dataUrl.startsWith("data:image/")) return dataUrl
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = dataUrl
    })
    const nw = img.naturalWidth, nh = img.naturalHeight
    if (!nw || !nh) return dataUrl
    const scale = nw > maxWidth ? maxWidth / nw : 1
    const w = Math.round(nw * scale), h = Math.round(nh * scale)
    const canvas = document.createElement("canvas")
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return dataUrl
    ctx.fillStyle = "#fff" // opaque matte (screenshots are opaque; JPEG has no alpha)
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const out = canvas.toDataURL("image/jpeg", quality)
    return out.length < dataUrl.length ? out : dataUrl
  } catch {
    return dataUrl
  }
}

export function buildFeedbackForm(input: { description: string; pageUrl: string; referrer?: string; projectId: string; screenshots: string[]; context?: ReportContext; replayEvents?: unknown[]; annotations?: any }): FormData {
  const fd = new FormData()
  fd.set("description", input.description)
  fd.set("page_url", input.pageUrl)
  // Source attribution: where the visitor came from (document.referrer of the embed page), when present.
  if (input.referrer) fd.set("referrer", input.referrer)
  fd.set("project_id", input.projectId)
  // G2/G5: attach the captured dev-tools context (console + network + env + identity/metadata) so the
  // no-install widget report carries the SAME technical context as the extension/SDK paths.
  if (input.context) fd.set("context", JSON.stringify(input.context))
  for (const s of input.screenshots) fd.append("screenshots", dataUrlToBlob(s), "screenshot.png")
  // G1 session replay: attach the rolling rrweb buffer as a JSON array. Only when there are events to
  // send (an empty/unplayable buffer is omitted so the server stores nothing).
  if (input.replayEvents && input.replayEvents.length) fd.set("replay_events", JSON.stringify(input.replayEvents))
  // Annotation overlay (KLAVITYKLA-1): structured markup { w, h, shapes } for the clean screenshot, so the
  // ticket re-renders a toggleable/zoomable highlight instead of baking the drawing into the image.
  if (input.annotations && Array.isArray(input.annotations.shapes) && input.annotations.shapes.length) fd.set("annotations_json", JSON.stringify(input.annotations))
  return fd
}
