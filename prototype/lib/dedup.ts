// Pure, DB-free issue-identity + similarity helpers for suggested-bug dedup.
import { createHash } from "node:crypto"

export function normalizeUrlPath(p: string): string {
  const noFragQuery = (p || "").split("#")[0].split("?")[0]
  const trimmed = noFragQuery.replace(/\/+$/, "")
  return trimmed || "/"
}

// Deterministic exact issue identity: same screen + same issue type + same cited traits.
export function issueKeyFor(parts: {
  projectId: string
  urlPath: string
  issueType: string | null
  citedTraitIds: string[]
}): string {
  const key = [
    parts.projectId,
    normalizeUrlPath(parts.urlPath),
    parts.issueType ?? "",
    [...parts.citedTraitIds].sort().join(","),
  ].join("|")
  return createHash("sha256").update(key).digest("hex").slice(0, 32)
}

function trigrams(s: string): Set<string> {
  const norm = (s || "").toLowerCase().replace(/\s+/g, " ").trim()
  const out = new Set<string>()
  if (!norm) return out
  const padded = `  ${norm} `
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

// Cosine-like similarity over character-trigram sets. 0..1.
export function lexicalSim(a: string, b: string): number {
  const A = trigrams(a)
  const B = trigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / Math.sqrt(A.size * B.size)
}

// Decide which existing feedback id (if any) this candidate duplicates.
// Exact key match (looked up by the caller) wins; else best semantic match ≥ threshold.
export function chooseDedup(
  cand: { title: string; observation: string },
  exactMatch: { id: string } | null,
  recent: Array<{ id: string; title: string; observation: string }>,
  threshold = 0.82,
): string | null {
  if (exactMatch) return exactMatch.id
  let best: { id: string | null; score: number } = { id: null, score: 0 }
  for (const r of recent) {
    const score = Math.max(lexicalSim(cand.title, r.title), lexicalSim(cand.observation, r.observation))
    if (score > best.score) best = { id: r.id, score }
  }
  return best.score >= threshold ? best.id : null
}
