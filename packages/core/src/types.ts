export type IntegrationType = 'jira' | 'linear' | 'github' | 'plane'
export type ReportType = 'bug' | 'feature'

// How the extension authenticates to the Klavity backend:
//   'klavity' — signed-in user; backend resolves their personal→team connection (token stays server-side)
//   'direct'  — no account; the extension forwards its own tracker creds (Phase 1 behavior)
export type ConnectionMode = 'klavity' | 'direct'

export interface KlavitySettings {
  integration: IntegrationType
  backendUrl: string
  autoFileErrors: boolean
  connectionMode: ConnectionMode
  klavToken: string // Klavity session/Bearer token from email→OTP login (empty until signed in)
  jira: { baseUrl: string; email: string; token: string; projectKey: string }
  linear: { apiKey: string; teamId: string }
  github: { token: string; repo: string } // "owner/repo"
  plane: { token: string; host: string; workspace: string; projectId: string } // host: API base — https://api.plane.so or a self-hosted origin
}

export const DEFAULT_SETTINGS: KlavitySettings = {
  integration: 'jira',
  backendUrl: '',
  autoFileErrors: false,
  connectionMode: 'direct',
  klavToken: '',
  jira: { baseUrl: '', email: '', token: '', projectKey: '' },
  linear: { apiKey: '', teamId: '' },
  github: { token: '', repo: '' },
  plane: { token: '', host: 'https://api.plane.so', workspace: '', projectId: '' },
}

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error'

export interface ConsoleError {
  message: string
  stack?: string
  timestamp: number
  // Console level (G3). Optional + defaults to 'error' so pre-existing rows / consumers that only
  // ever saw errors stay valid. Errors from window.onerror / unhandledrejection keep 'error'.
  level?: ConsoleLevel
}

export interface NetworkFailure {
  url: string
  // status is the HTTP status code. 0 means the request never completed (network error / abort).
  // With full-fidelity capture (G3) this is recorded for ALL requests, not just status >= 400.
  status: number
  method: string
  timestamp: number
  // Round-trip duration in milliseconds (G3). Optional for backward compatibility.
  durationMs?: number
}

// Arbitrary site-owner-supplied identity + key/values (G5). Plumbed through the report context and
// surfaced on the ticket. Values are coerced to strings and length-capped server-/client-side.
export interface ReportIdentity {
  id?: string
  email?: string
  name?: string
  [key: string]: string | undefined
}

export interface ReportContext {
  pageUrl: string
  userAgent: string
  screenSize: string
  viewportSize: string
  consoleErrors: ConsoleError[]
  networkFailures: NetworkFailure[]
  // Custom metadata / identity (G5). Optional so existing payloads stay valid.
  identity?: ReportIdentity
  metadata?: Record<string, string>
}

export interface SubmitReportPayload {
  type: ReportType
  description: string
  context: ReportContext
  screenshots: string[] // data URLs (PNG or JPEG)
}

export interface SubmitResult {
  issueKey: string
  issueUrl: string
}

export interface IntegrationConfig {
  type: ReportType
  description: string
  context: ReportContext
  screenshots: string[]
  settings: KlavitySettings
}

// Extension message protocol
export type BackgroundMessage =
  | { kind: 'CAPTURE_TAB' }
  | { kind: 'SUBMIT_REPORT'; payload: SubmitReportPayload }
  | { kind: 'AUTO_FILE_ERROR'; message: string; stack?: string; pageUrl: string; timestamp: number }
  | { kind: 'OPEN_TRACKER_URL' }
  // ── Live activation (P3b) — content asks background to act (SW holds the token + does cross-origin fetch) ──
  | { kind: 'KLAV_GET_CONFIG' }                              // read cached config from storage (no fetch)
  | { kind: 'KLAV_SYNC_CONFIG' }                             // force a re-fetch of /api/extension/config
  | { kind: 'KLAV_CAPTURE_REVIEW' }                          // captureVisibleTab for a review (separate from bug CAPTURE_TAB)
  | { kind: 'KLAV_REVIEW'; projectId: string; url: string; domSig: string; screenshotDataUrl: string; adhoc?: boolean } // POST /api/sim/review
  | { kind: 'KLAV_CONSENT'; projectId: string; status: 'granted' | 'paused' | 'revoked' }               // POST /api/consent
  | { kind: 'KLAV_RECONCILE_SCRIPTS' }                       // re-register dynamic content scripts after a host-permission grant

export type KlavMonitoredProject = { id: string; name: string; reviewMode: string; monitoredUrls: string[] }
export interface KlavConfig {
  email: string
  token: string                      // dedicated narrow-scope extension token (NOT the raw session id)
  backendUrl: string
  projects: KlavMonitoredProject[]
  syncedAt: number
}

export type ContentMessage =
  | { kind: 'OPEN_MODAL'; reportType: ReportType }
  | { kind: 'CAPTURE_TAB_RESULT'; dataUrl: string; error?: string }
  | { kind: 'SUBMIT_SUCCESS'; issueKey: string; issueUrl: string }
  | { kind: 'SUBMIT_ERROR'; message: string }
  // ── Live activation (P3b) responses ──
  | { kind: 'KLAV_CAPTURE_REVIEW_RESULT'; dataUrl: string; error?: string }
  | { kind: 'KLAV_CONFIG_UPDATED'; config: KlavConfig | null }   // pushed after a sync so content refreshes its cache
  | { kind: 'KLAV_NUDGE_ROUTE' }                                 // tabs.onUpdated SPA backstop → re-evaluate URL
  // ── Ad-hoc "Analyze this page" (Task 4) ──
  | { kind: 'KLAV_ADHOC_REVIEW'; projectId: string }             // popup → content: run an explicit one-shot review

export type Shape =
  | { type: 'pen'; color: string; points: Array<{ x: number; y: number }> }
  | { type: 'rect'; color: string; x: number; y: number; w: number; h: number }
  | { type: 'arrow'; color: string; x1: number; y1: number; x2: number; y2: number }
  | { type: 'text'; color: string; x: number; y: number; text: string }
