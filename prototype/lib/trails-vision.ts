// Layer D: Tier-2 vision-LLM re-resolution + grounded findings.
// A pure decision core (`decideFromVision`) plus an injectable VisionResolver (mockable in tests,
// real OpenRouter adapter in prod — the only file that does model I/O). Heals are AMBER, never
// green (spec §6.3); removed/low-confidence outcomes become grounded findings via recordFinding.
import type { Fingerprint, StepAction, FailureClass } from "./trails-types"

export interface VisionInput {
  screenshotB64: string; mediaType: string; domSnapshot: string; pageUrl: string
  intent: string; action: StepAction; target: Fingerprint; candidateSelectors: string[]
}
export interface VisionResult {
  found: boolean; selector: string | null; confidence: number
  classification: "moved" | "restyled" | "removed" | "unknown"; rationale: string
}
export type VisionResolver = (input: VisionInput, ctx?: { projectId?: string | null; email?: string | null }) => Promise<VisionResult>

export interface VisionDecision {
  outcome: "heal" | "regression" | "amber_low_conf"
  selector: string | null; confidence: number; diagnosis: FailureClass; rationale: string
}

/**
 * Pure decision core. Maps a VisionResult to a runner outcome under the confidence gate (spec §6.3).
 * - classification 'removed' → regression (never a heal), regardless of confidence.
 * - found + selector + confidence >= gate → heal (locator_drift).
 * - otherwise → amber_low_conf (file for review, never pass / never act on an unconfirmed target).
 */
export function decideFromVision(r: VisionResult, gate = 0.9): VisionDecision {
  if (r.classification === "removed") {
    return { outcome: "regression", selector: null, confidence: r.confidence, diagnosis: "regression", rationale: r.rationale }
  }
  if (r.found && r.selector && r.confidence >= gate) {
    return { outcome: "heal", selector: r.selector, confidence: r.confidence, diagnosis: "locator_drift", rationale: r.rationale }
  }
  return { outcome: "amber_low_conf", selector: r.found ? r.selector : null, confidence: r.confidence, diagnosis: "locator_drift", rationale: r.rationale }
}
