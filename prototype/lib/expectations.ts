// prototype/lib/expectations.ts
// Pure (DB-free) corroboration + lifecycle for the expectations spine.
import { lexicalSim } from "./dedup"

export type SourceKind = "snap" | "sim" | "finding"
export type SourceRef = { kind: SourceKind; id: string }
export type Corroboration = { snap: boolean; sim: boolean; recurrence: number }
export type ExpStatus = "candidate" | "validated" | "enforced" | "retired"

export const RECURRENCE_VALIDATE_N = 3

export function mergeSource(c: Corroboration, kind: SourceKind): Corroboration {
  return {
    snap: c.snap || kind === "snap",
    sim: c.sim || kind === "sim",
    recurrence: (c.recurrence ?? 0) + 1,
  }
}

export function shouldValidate(c: Corroboration, n: number = RECURRENCE_VALIDATE_N): boolean {
  return (c.snap && c.sim) || c.recurrence >= n
}

export function nextStatus(current: ExpStatus, c: Corroboration, n: number = RECURRENCE_VALIDATE_N): ExpStatus {
  if (current === "candidate" && shouldValidate(c, n)) return "validated"
  return current
}

export function matchExpectation(
  cand: { title: string },
  existing: Array<{ id: string; title: string }>,
  threshold = 0.82,
): string | null {
  let best: { id: string | null; score: number } = { id: null, score: 0 }
  for (const e of existing) {
    const score = lexicalSim(cand.title, e.title)
    if (score > best.score) best = { id: e.id, score }
  }
  return best.score >= threshold ? best.id : null
}
