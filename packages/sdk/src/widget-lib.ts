export function parseScriptConfig(scriptEl: { dataset: { project?: string }, src: string }): { projectId: string, backendUrl: string } {
  const projectId = scriptEl.dataset.project || ""
  let backendUrl = ""
  try { backendUrl = new URL(scriptEl.src).origin } catch { backendUrl = "" }
  return { projectId, backendUrl }
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

export function buildFeedbackForm(input: { description: string; pageUrl: string; projectId: string; screenshots: string[] }): FormData {
  const fd = new FormData()
  fd.set("description", input.description)
  fd.set("page_url", input.pageUrl)
  fd.set("project_id", input.projectId)
  for (const s of input.screenshots) fd.append("screenshots", dataUrlToBlob(s), "screenshot.png")
  return fd
}
