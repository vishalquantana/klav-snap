// Inbound two-way status sync (G4): map an EXTERNAL tracker status change back onto
// the linked Klavity ticket. This module is PURE — no DB, no network. It only:
//   1. verifies provider webhook signatures (GitHub HMAC),
//   2. extracts the external issue key the way our OUTBOUND copy stored it, and
//   3. maps the provider's state vocabulary → Klavity's feedback status enum.
//
// Klavity feedback status enum (see server.ts PATCH /api/feedback): open | in_progress | done.
//
// Capability matrix (kept here so the server + docs stay in sync):
//   github  ✅ inbound (issue webhook: opened/closed/reopened, HMAC-signed)
//   plane   ✅ inbound (issue webhook: state group, shared-secret header)
//   jira    ✅ inbound (jira:issue_updated: statusCategory, shared-secret token — query/header)
//   linear  ✅ inbound (Issue update: state.type, HMAC-signed Linear-Signature)
//   webhook ➖ N/A — generic outbound sink, no canonical inbound contract

export type KlavityStatus = "open" | "in_progress" | "done"

const INBOUND: Record<string, boolean> = {
  github: true,
  plane: true,
  jira: true,
  linear: true,
  webhook: false,
}

export function inboundSupported(type: string): boolean {
  return INBOUND[type] === true
}

// ── GitHub signature (X-Hub-Signature-256) ───────────────────────────────────
// header = "sha256=" + hex(HMAC_SHA256(secret, rawBody)). Compared in constant time
// so a wrong signature cannot be discovered byte-by-byte via response timing.
export async function verifyGithubSignature(
  secret: string,
  rawBody: string,
  header: string | null | undefined,
): Promise<boolean> {
  if (!secret) return false
  if (!header || typeof header !== "string") return false
  const prefix = "sha256="
  if (!header.startsWith(prefix)) return false
  const provided = header.slice(prefix.length).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(provided)) return false
  return timingSafeEqualHex(await hmacSha256Hex(secret, rawBody), provided)
}

// ── Linear signature (Linear-Signature) ──────────────────────────────────────
// header = hex(HMAC_SHA256(secret, rawBody)) — same algorithm as GitHub but with NO
// "sha256=" prefix (Linear sends the bare hex digest). Constant-time compared so a
// wrong signature can't be discovered byte-by-byte via response timing.
export async function verifyLinearSignature(
  secret: string,
  rawBody: string,
  header: string | null | undefined,
): Promise<boolean> {
  if (!secret) return false
  if (!header || typeof header !== "string") return false
  const provided = header.toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(provided)) return false
  return timingSafeEqualHex(await hmacSha256Hex(secret, rawBody), provided)
}

// hex(HMAC_SHA256(secret, body)) — shared by the github + linear verifiers.
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)))
  return [...sigBytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Constant-time hex comparison (both args are validated 64-char lowercase hex).
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── External key extraction (must equal the key OUTBOUND createIssue stored) ──
export function extractExternalKey(type: string, payload: any): string | null {
  if (type === "github") {
    const n = payload?.issue?.number
    return n != null ? `#${n}` : null // github.ts stores externalKey = `#${number}`
  }
  if (type === "plane") {
    const d = payload?.data ?? {}
    if (d.sequence_id != null) return String(d.sequence_id) // plane.ts prefers sequence_id
    if (d.id != null) return String(d.id)
    return null
  }
  if (type === "jira") {
    const k = payload?.issue?.key
    return k != null ? String(k) : null // jira.ts stores externalKey = issue.key (e.g. "PROJ-42")
  }
  if (type === "linear") {
    const id = payload?.data?.identifier
    return id != null ? String(id) : null // linear.ts stores externalKey = issue.identifier (e.g. "ENG-42")
  }
  return null
}

// ── Status mapping: provider vocabulary → Klavity status (null = no-op) ───────
export function mapExternalStatus(type: string, payload: any): KlavityStatus | null {
  if (type === "github") return mapGithub(payload)
  if (type === "plane") return mapPlane(payload)
  if (type === "jira") return mapJira(payload)
  if (type === "linear") return mapLinear(payload)
  return null // webhook N/A
}

function mapGithub(payload: any): KlavityStatus | null {
  // Only the lifecycle actions change status. Ignore edited/labeled/assigned/commented/etc.
  const action = String(payload?.action ?? "")
  if (action === "closed") return "done"
  if (action === "reopened" || action === "opened") return "open"
  return null
}

function mapPlane(payload: any): KlavityStatus | null {
  // Plane state "groups": backlog | unstarted | started | completed | cancelled.
  // Accept both flattened (state__group) and nested (state.group) shapes.
  const d = payload?.data ?? {}
  const group = String(d.state__group ?? d?.state?.group ?? "").toLowerCase()
  if (group === "completed" || group === "cancelled") return "done"
  if (group === "started") return "in_progress"
  if (group === "backlog" || group === "unstarted") return "open"
  return null
}

function mapJira(payload: any): KlavityStatus | null {
  // Map the STABLE status *category* (new/indeterminate/done) rather than per-workflow
  // status names, so this works across any Jira project's custom workflow.
  const key = String(payload?.issue?.fields?.status?.statusCategory?.key ?? "").toLowerCase()
  if (key === "done") return "done"
  if (key === "indeterminate") return "in_progress"
  if (key === "new") return "open"
  return null
}

function mapLinear(payload: any): KlavityStatus | null {
  // Linear workflow-state "type": backlog | unstarted | started | completed | canceled | triage.
  const t = String(payload?.data?.state?.type ?? "").toLowerCase()
  if (t === "completed" || t === "canceled") return "done"
  if (t === "started") return "in_progress"
  if (t === "backlog" || t === "unstarted" || t === "triage") return "open"
  return null
}
