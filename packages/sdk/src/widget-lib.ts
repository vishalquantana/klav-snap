import type { ReportContext, ReportIdentity } from "@klavity/core"

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

export function successCopy(mode: string, ctaUrl: string): SuccessCopy {
  if (mode === "leadgen") return {
    headline: "That's exactly how Klavity works",
    body: "You just right-clicked → auto-screenshot → filed a real ticket. Your users could do this for you.",
    emailLabel: "Send me the 2-min setup", ctaText: "Start free →", ctaUrl,
    showEmail: true, showCta: true,
  }
  if (mode === "off") return {
    headline: "Thanks — your report is filed", body: "", emailLabel: "", ctaText: "", ctaUrl,
    showEmail: false, showCta: false,
  }
  return { // support (default)
    headline: "Bug filed ✓",
    body: "Want to know when it's fixed? Drop your email and we'll ping you.",
    emailLabel: "Notify me", ctaText: "", ctaUrl,
    showEmail: true, showCta: false,
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

export function buildFeedbackForm(input: { description: string; pageUrl: string; projectId: string; screenshots: string[]; context?: ReportContext; replayEvents?: unknown[] }): FormData {
  const fd = new FormData()
  fd.set("description", input.description)
  fd.set("page_url", input.pageUrl)
  fd.set("project_id", input.projectId)
  // G2/G5: attach the captured dev-tools context (console + network + env + identity/metadata) so the
  // no-install widget report carries the SAME technical context as the extension/SDK paths.
  if (input.context) fd.set("context", JSON.stringify(input.context))
  for (const s of input.screenshots) fd.append("screenshots", dataUrlToBlob(s), "screenshot.png")
  // G1 session replay: attach the rolling rrweb buffer as a JSON array. Only when there are events to
  // send (an empty/unplayable buffer is omitted so the server stores nothing).
  if (input.replayEvents && input.replayEvents.length) fd.set("replay_events", JSON.stringify(input.replayEvents))
  return fd
}
