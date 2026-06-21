import { test, expect } from "bun:test"
import {
  verifyGithubSignature,
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

test("mapExternalStatus returns null for stubbed connectors", () => {
  expect(mapExternalStatus("jira", { foo: 1 })).toBeNull()
  expect(mapExternalStatus("linear", { foo: 1 })).toBeNull()
  expect(mapExternalStatus("webhook", { foo: 1 })).toBeNull()
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

// ── Capability matrix ─────────────────────────────────────────────────────────

test("inboundSupported reports github + plane only", () => {
  expect(inboundSupported("github")).toBe(true)
  expect(inboundSupported("plane")).toBe(true)
  expect(inboundSupported("jira")).toBe(false)
  expect(inboundSupported("linear")).toBe(false)
  expect(inboundSupported("webhook")).toBe(false)
  expect(inboundSupported("nope")).toBe(false)
})
