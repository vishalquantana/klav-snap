// Layer E — Klavity OS Trails findings gate.
//
// Spec §6: a wrong heal is worse than a red test. Auto-file ONLY hard, evidence-typed regressions
// (element genuinely gone after heal exhausted / network 5xx / failed explicit checkpoint), dedup-clean
// AND confidence ≥ high threshold. Everything subjective (visual diffs, AMBER heals) queues for the
// human review gate. We publish a per-project precision metric (legit-bug rate). A dismissed finding is
// excluded from precision and never re-filed.
//
// This module is split into:
//   • decideFindingAction / projectPrecision — pure / read-only.
//   • processWalkFindings / fileFindingById / dismissFinding — executor over an INJECTED Filer (mockable).
//   • buildTicketFromFinding (pure) / realFiler — the production connector adapter, mirroring the
//     auto-copy decrypt loop in server.ts (getConnector(type).createIssue + decryptSecret per secret field).

import type { Finding } from "./trails-types"
import { listFindings, setFindingStatus } from "./trails"
import { listAutoCopyConnectors } from "./db"
import { getConnector, type TicketPayload } from "./connectors/index"
import { decryptSecret } from "./crypto"

export const AUTO_FILE_THRESHOLD = 0.9

// ── Pure decision ────────────────────────────────────────────────────────────────
// auto_file iff it's a hard regression AND clears the high-confidence bar; everything else queues.
export function decideFindingAction(
  f: Pick<Finding, "kind" | "confidence">,
  threshold = AUTO_FILE_THRESHOLD,
): "auto_file" | "queue" {
  return f.kind === "regression" && f.confidence >= threshold ? "auto_file" : "queue"
}

// ── Precision (legit-bug rate) ───────────────────────────────────────────────────
// filed = settled-as-real (filed|auto_filed); dismissed = settled-as-noise. Still-queued items are
// undecided and excluded from both numerator and denominator. precision = filed/(filed+dismissed).
export async function projectPrecision(
  projectId: string,
): Promise<{ filed: number; dismissed: number; precision: number | null }> {
  const all = await listFindings(projectId)
  const filed = all.filter((f) => f.status === "filed" || f.status === "auto_filed").length
  const dismissed = all.filter((f) => f.status === "dismissed").length
  const total = filed + dismissed
  return { filed, dismissed, precision: total ? filed / total : null }
}

// ── Injectable filer ─────────────────────────────────────────────────────────────
// Files one finding to the project's external tracker; returns the external ref (e.g. "plane:PROJ-42")
// or null if there's no connector / the push failed.
export type Filer = (projectId: string, finding: Finding) => Promise<{ connectorRef: string } | null>

// Executor: walk-scoped gate. For each still-queued finding of this run, auto-file the hard
// high-confidence regressions (never double-file an already-filed item — we only consider 'queued'),
// queue the rest. A filer failure leaves the finding queued (fail-loud, never silent-green).
export async function processWalkFindings(
  projectId: string,
  runId: string,
  deps: { filer: Filer; threshold?: number },
): Promise<{ autoFiled: string[]; queued: string[] }> {
  const findings = (await listFindings(projectId)).filter((f) => f.runId === runId && f.status === "queued")
  const autoFiled: string[] = []
  const queued: string[] = []
  for (const f of findings) {
    if (decideFindingAction(f, deps.threshold) === "auto_file") {
      const r = await deps.filer(projectId, f).catch(() => null)
      if (r) {
        await setFindingStatus(projectId, f.id, "auto_filed", r.connectorRef)
        autoFiled.push(f.id)
        continue
      }
    }
    queued.push(f.id)
  }
  return { autoFiled, queued }
}

// Human "file from queue": load the finding, push it, mark 'filed' with the connector ref.
export async function fileFindingById(
  projectId: string,
  findingId: string,
  deps: { filer: Filer },
): Promise<{ ok: boolean; connectorRef?: string }> {
  const f = (await listFindings(projectId)).find((x) => x.id === findingId)
  if (!f) return { ok: false }
  const r = await deps.filer(projectId, f).catch(() => null)
  if (!r) return { ok: false }
  await setFindingStatus(projectId, findingId, "filed", r.connectorRef)
  return { ok: true, connectorRef: r.connectorRef }
}

// Human "dismiss from queue": excludes it from the queue + precision; never re-filed.
export async function dismissFinding(projectId: string, findingId: string): Promise<void> {
  await setFindingStatus(projectId, findingId, "dismissed")
}

// ── Real connector filer ─────────────────────────────────────────────────────────
// Pure: shape a grounded TicketPayload (matching lib/connectors/index.ts) from a Trail finding.
// Body carries the grounded evidence (rationale + verbatim groundQuote) and the heal from→to diff,
// plus run/step ids, so the external ticket is auditable. severity is derived from the kind.
function severityForKind(kind: Finding["kind"]): string {
  return kind === "regression" ? "high" : kind === "visual" ? "low" : "medium"
}

export function buildTicketFromFinding(finding: Finding, baseUrl: string): TicketPayload {
  const ev = (finding.evidence ?? {}) as Record<string, unknown>
  const rationale = (ev.rationale as string) || finding.groundQuote || ""
  const fromSel = ev.fromSelector as string | null | undefined
  const toSel = ev.toSelector as string | null | undefined

  const lines: string[] = []
  if (rationale) lines.push(rationale)
  if (finding.groundQuote) lines.push(`Grounded: "${finding.groundQuote}"`)
  if (fromSel || toSel) lines.push(`Heal diff: ${fromSel ?? "(none)"} → ${toSel ?? "(none)"}`)
  lines.push(`Kind: ${finding.kind} · confidence: ${finding.confidence}`)
  lines.push(`Walk: ${finding.runId}${finding.stepId ? ` · step: ${finding.stepId}` : ""} · trail: ${finding.trailId}`)
  lines.push("Filed by Klavity OS Trails")

  return {
    title: "[Klavity Trails] " + finding.title,
    body: lines.join("\n\n"),
    severity: severityForKind(finding.kind),
    url: null,
    simName: null,
    createdAt: finding.createdAt,
    klavityUrl: `${baseUrl}/trails?project=${finding.projectId}`,
  }
}

// Production filer: pick the project's first auto-copy connector, decrypt its secret fields exactly as
// the server's auto-copy hook does, call the adapter's createIssue, and return "<type>:<externalKey>".
// Returns null if the project has no auto-copy connector. NEVER called in CI against a real network.
export const realFiler: Filer = async (projectId, finding) => {
  const connectors = await listAutoCopyConnectors(projectId)
  if (!connectors.length) return null
  const baseUrl = process.env.KLAV_BASE_URL || "https://klavity.quantana.top"
  const ticket = buildTicketFromFinding(finding, baseUrl)
  for (const c of connectors) {
    const adapter = getConnector(c.type)
    if (!adapter) continue
    // Decrypt secret fields (mirror server.ts auto-copy loop).
    const cfg: Record<string, string> = { ...c.config }
    for (const f of adapter.fields) {
      if (f.secret && c.config[f.key]) {
        try { cfg[f.key] = await decryptSecret(c.config[f.key]) } catch { cfg[f.key] = "" }
      }
    }
    try {
      const result = await adapter.createIssue(ticket, cfg)
      return { connectorRef: `${c.type}:${result.externalKey ?? result.externalUrl ?? c.id}` }
    } catch {
      // Try the next connector; a total failure across all → null (finding stays queued/fail-loud).
    }
  }
  return null
}
