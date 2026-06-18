export function parseScriptConfig(scriptEl: { dataset: { project?: string }, src: string }): { projectId: string, backendUrl: string } {
  const projectId = scriptEl.dataset.project || ""
  let backendUrl = ""
  try { backendUrl = new URL(scriptEl.src).origin } catch { backendUrl = "" }
  return { projectId, backendUrl }
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
