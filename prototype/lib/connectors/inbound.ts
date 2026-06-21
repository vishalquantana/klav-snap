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
//   jira    🚧 stubbed — Jira webhooks need per-workflow status mapping (TODO)
//   linear  🚧 stubbed — Linear webhooks need workflow-state mapping (TODO)
//   webhook ➖ N/A — generic outbound sink, no canonical inbound contract

export type KlavityStatus = "open" | "in_progress" | "done"

const INBOUND: Record<string, boolean> = {
  github: true,
  plane: true,
  jira: false,
  linear: false,
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

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)))
  const expected = [...sigBytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  return timingSafeEqualHex(expected, provided)
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
  return null
}

// ── Status mapping: provider vocabulary → Klavity status (null = no-op) ───────
export function mapExternalStatus(type: string, payload: any): KlavityStatus | null {
  if (type === "github") return mapGithub(payload)
  if (type === "plane") return mapPlane(payload)
  return null // jira / linear stubbed; webhook N/A
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
