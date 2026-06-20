export type AssertionDraft = {
  trailId: string; afterStepIdx: number; action: "assert"
  target: { role?: string; name?: string; text?: string; selector?: string }
  checkpoint: { kind: "visible"; description: string }
}

export function validateAssertionDraft(x: unknown): AssertionDraft | null {
  if (!x || typeof x !== "object") return null
  const o = x as any
  if (typeof o.trailId !== "string" || !o.trailId) return null
  if (typeof o.afterStepIdx !== "number" || !Number.isFinite(o.afterStepIdx) || o.afterStepIdx < 0) return null
  if (o.action !== "assert") return null
  const t = o.target
  if (!t || typeof t !== "object") return null
  const target: AssertionDraft["target"] = {}
  for (const k of ["role", "name", "text", "selector"] as const) if (typeof t[k] === "string" && t[k]) target[k] = t[k]
  if (Object.keys(target).length === 0) return null
  if (!o.checkpoint || o.checkpoint.kind !== "visible") return null
  const description = String(o.checkpoint.description ?? "").slice(0, 240)
  if (!description.trim()) return null
  return { trailId: o.trailId, afterStepIdx: o.afterStepIdx, action: "assert", target, checkpoint: { kind: "visible", description } }
}
