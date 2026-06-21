import { test, expect } from "bun:test"
import {
  verifyGithubSignature,
  verifyLinearSignature,
  mapExternalStatus,
  extractExternalKey,
  inboundSupported,
} from "./inbound"

// ── GitHub HMAC signature verification (X-Hub-Signature-256) ──────────────────
// GitHub signs the raw request body as: "sha256=" + HMAC_SHA256(secret, body).
// We must reject any payload whose signature does not match the connector secret,
// using a constant-time compare so the handler isn't a timing oracle.

const GH_SECRET = "It's a Secret to Everybody"
const GH_BODY = "Hello, World!"
// Reference digest from GitHub's own docs for the secret+body above.
const GH_SIG = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17"

test("verifyGithubSignature accepts a correct signature", async () => {
  expect(await verifyGithubSignature(GH_SECRET, GH_BODY, GH_SIG)).toBe(true)
})

test("verifyGithubSignature rejects a wrong signature", async () => {
  expect(await verifyGithubSignature(GH_SECRET, GH_BODY, "sha256=deadbeef")).toBe(false)
})

test("verifyGithubSignature rejects a tampered body", async () => {
  expect(await verifyGithubSignature(GH_SECRET, GH_BODY + "x", GH_SIG)).toBe(false)
})

test("verifyGithubSignature rejects a missing / malformed header", async () => {
  expect(await verifyGithubSignature(GH_SECRET, GH_BODY, "")).toBe(false)
  expect(await verifyGithubSignature(GH_SECRET, GH_BODY, "md5=abc")).toBe(false)
  expect(await verifyGithubSignature(GH_SECRET, GH_BODY, null)).toBe(false)
})

test("verifyGithubSignature rejects when no secret is configured", async () => {
  expect(await verifyGithubSignature("", GH_BODY, GH_SIG)).toBe(false)
})

// ── GitHub status mapping (issue webhook: opened / closed / reopened) ──────────
// GitHub fires action=closed/reopened with issue.state=open|closed.

test("mapExternalStatus github closed → done", () => {
  expect(mapExternalStatus("github", { action: "closed", issue: { state: "closed" } })).toBe("done")
})

test("mapExternalStatus github reopened → open", () => {
  expect(mapExternalStatus("github", { action: "reopened", issue: { state: "open" } })).toBe("open")
})

test("mapExternalStatus github opened → open", () => {
  expect(mapExternalStatus("github", { action: "opened", issue: { state: "open" } })).toBe("open")
})

test("mapExternalStatus github ignores non-status actions", () => {
  // edited/labeled/commented etc. don't change status → null (no-op)
  expect(mapExternalStatus("github", { action: "labeled", issue: { state: "open" } })).toBeNull()
  expect(mapExternalStatus("github", { action: "edited", issue: { state: "closed" } })).toBeNull()
})

// ── Plane status mapping (issue webhook) ──────────────────────────────────────
// Plane sends activity-style webhooks with a state group. We map the canonical
// Plane state "group" (backlog/unstarted/started/completed/cancelled) → Klavity.

test("mapExternalStatus plane completed → done", () => {
  expect(mapExternalStatus("plane", { event: "issue", data: { state__group: "completed" } })).toBe("done")
  expect(mapExternalStatus("plane", { event: "issue", data: { state: { group: "completed" } } })).toBe("done")
})

test("mapExternalStatus plane cancelled → done", () => {
  expect(mapExternalStatus("plane", { event: "issue", data: { state__group: "cancelled" } })).toBe("done")
})

test("mapExternalStatus plane started → in_progress", () => {
  expect(mapExternalStatus("plane", { event: "issue", data: { state__group: "started" } })).toBe("in_progress")
})

test("mapExternalStatus plane backlog/unstarted → open", () => {
  expect(mapExternalStatus("plane", { event: "issue", data: { state__group: "backlog" } })).toBe("open")
  expect(mapExternalStatus("plane", { event: "issue", data: { state__group: "unstarted" } })).toBe("open")
})

test("mapExternalStatus plane ignores unknown group", () => {
  expect(mapExternalStatus("plane", { event: "issue", data: { state__group: "wat" } })).toBeNull()
  expect(mapExternalStatus("plane", { event: "issue", data: {} })).toBeNull()
})

test("mapExternalStatus returns null for unknown / N/A connectors", () => {
  expect(mapExternalStatus("webhook", { foo: 1 })).toBeNull()
  expect(mapExternalStatus("nope", { foo: 1 })).toBeNull()
})

// ── Jira status mapping (jira:issue_updated, statusCategory) ───────────────────
// Jira Cloud sends statusCategory.key ∈ new | indeterminate | done. We map the
// stable category (NOT the per-workflow status name) → Klavity.

test("mapExternalStatus jira done category → done", () => {
  expect(mapExternalStatus("jira", { webhookEvent: "jira:issue_updated", issue: { key: "PROJ-42", fields: { status: { statusCategory: { key: "done" } } } } })).toBe("done")
})

test("mapExternalStatus jira indeterminate category → in_progress", () => {
  expect(mapExternalStatus("jira", { webhookEvent: "jira:issue_updated", issue: { key: "PROJ-42", fields: { status: { statusCategory: { key: "indeterminate" } } } } })).toBe("in_progress")
})

test("mapExternalStatus jira new category → open", () => {
  expect(mapExternalStatus("jira", { webhookEvent: "jira:issue_updated", issue: { key: "PROJ-42", fields: { status: { statusCategory: { key: "new" } } } } })).toBe("open")
})

test("mapExternalStatus jira ignores unknown / missing category", () => {
  expect(mapExternalStatus("jira", { issue: { fields: { status: { statusCategory: { key: "wat" } } } } })).toBeNull()
  expect(mapExternalStatus("jira", { issue: { fields: {} } })).toBeNull()
  expect(mapExternalStatus("jira", {})).toBeNull()
})

// ── Linear status mapping (Issue update, state.type) ──────────────────────────
// Linear state.type ∈ backlog | unstarted | started | completed | canceled | triage.

test("mapExternalStatus linear completed → done", () => {
  expect(mapExternalStatus("linear", { type: "Issue", action: "update", data: { identifier: "ENG-42", state: { type: "completed" } } })).toBe("done")
})

test("mapExternalStatus linear canceled → done", () => {
  expect(mapExternalStatus("linear", { type: "Issue", action: "update", data: { identifier: "ENG-42", state: { type: "canceled" } } })).toBe("done")
})

test("mapExternalStatus linear started → in_progress", () => {
  expect(mapExternalStatus("linear", { type: "Issue", action: "update", data: { identifier: "ENG-42", state: { type: "started" } } })).toBe("in_progress")
})

test("mapExternalStatus linear backlog/unstarted/triage → open", () => {
  expect(mapExternalStatus("linear", { data: { state: { type: "backlog" } } })).toBe("open")
  expect(mapExternalStatus("linear", { data: { state: { type: "unstarted" } } })).toBe("open")
  expect(mapExternalStatus("linear", { data: { state: { type: "triage" } } })).toBe("open")
})

test("mapExternalStatus linear ignores unknown / missing state", () => {
  expect(mapExternalStatus("linear", { data: { state: { type: "wat" } } })).toBeNull()
  expect(mapExternalStatus("linear", { data: {} })).toBeNull()
  expect(mapExternalStatus("linear", {})).toBeNull()
})

// ── Linear HMAC signature verification (Linear-Signature) ─────────────────────
// Linear signs the raw body as hex(HMAC_SHA256(secret, body)) — NO "sha256=" prefix —
// in the Linear-Signature header. Constant-time compare; reject wrong/tampered/absent.

const LIN_SECRET = "lin_wh_secret"
const LIN_BODY = JSON.stringify({ type: "Issue", action: "update", data: { identifier: "ENG-7" } })

// Compute the reference signature the same way Linear does (so the test is self-checking).
async function linSign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)))
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("")
}

test("verifyLinearSignature accepts a correct signature", async () => {
  const sig = await linSign(LIN_SECRET, LIN_BODY)
  expect(await verifyLinearSignature(LIN_SECRET, LIN_BODY, sig)).toBe(true)
})

test("verifyLinearSignature rejects a wrong signature", async () => {
  expect(await verifyLinearSignature(LIN_SECRET, LIN_BODY, "0".repeat(64))).toBe(false)
})

test("verifyLinearSignature rejects a tampered body", async () => {
  const sig = await linSign(LIN_SECRET, LIN_BODY)
  expect(await verifyLinearSignature(LIN_SECRET, LIN_BODY + "x", sig)).toBe(false)
})

test("verifyLinearSignature rejects a missing / malformed header", async () => {
  expect(await verifyLinearSignature(LIN_SECRET, LIN_BODY, "")).toBe(false)
  expect(await verifyLinearSignature(LIN_SECRET, LIN_BODY, null)).toBe(false)
  expect(await verifyLinearSignature(LIN_SECRET, LIN_BODY, "sha256=abc")).toBe(false)
})

test("verifyLinearSignature rejects when no secret is configured", async () => {
  const sig = await linSign(LIN_SECRET, LIN_BODY)
  expect(await verifyLinearSignature("", LIN_BODY, sig)).toBe(false)
})

// ── External key extraction (must match the key we stored on outbound copy) ────
// GitHub: outbound stored externalKey = "#<number>" (see github.ts).

test("extractExternalKey github builds #<number> to match stored key", () => {
  expect(extractExternalKey("github", { issue: { number: 12 } })).toBe("#12")
})

test("extractExternalKey github returns null when number absent", () => {
  expect(extractExternalKey("github", { issue: {} })).toBeNull()
  expect(extractExternalKey("github", {})).toBeNull()
})

// Plane: outbound stored externalKey = sequence_id (preferred) else id (see plane.ts).
test("extractExternalKey plane prefers sequence_id then id", () => {
  expect(extractExternalKey("plane", { data: { sequence_id: 42, id: "uuid" } })).toBe("42")
  expect(extractExternalKey("plane", { data: { id: "uuid" } })).toBe("uuid")
  expect(extractExternalKey("plane", { data: {} })).toBeNull()
})

// Jira: outbound stored externalKey = issue.key e.g. "PROJ-42" (see jira.ts).
test("extractExternalKey jira reads issue.key to match stored key", () => {
  expect(extractExternalKey("jira", { issue: { key: "PROJ-42" } })).toBe("PROJ-42")
  expect(extractExternalKey("jira", { issue: {} })).toBeNull()
  expect(extractExternalKey("jira", {})).toBeNull()
})

// Linear: outbound stored externalKey = issue.identifier e.g. "ENG-42" (see linear.ts).
test("extractExternalKey linear reads data.identifier to match stored key", () => {
  expect(extractExternalKey("linear", { data: { identifier: "ENG-42" } })).toBe("ENG-42")
  expect(extractExternalKey("linear", { data: {} })).toBeNull()
  expect(extractExternalKey("linear", {})).toBeNull()
})

// ── Capability matrix ─────────────────────────────────────────────────────────

test("inboundSupported reports github + plane + jira + linear", () => {
  expect(inboundSupported("github")).toBe(true)
  expect(inboundSupported("plane")).toBe(true)
  expect(inboundSupported("jira")).toBe(true)
  expect(inboundSupported("linear")).toBe(true)
  expect(inboundSupported("webhook")).toBe(false)
  expect(inboundSupported("nope")).toBe(false)
})
