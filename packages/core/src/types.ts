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

export interface ConsoleError {
  message: string
  stack?: string
  timestamp: number
}

export interface NetworkFailure {
  url: string
  status: number
  method: string
  timestamp: number
}

export interface ReportContext {
  pageUrl: string
  userAgent: string
  screenSize: string
  viewportSize: string
  consoleErrors: ConsoleError[]
  networkFailures: NetworkFailure[]
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

export type ContentMessage =
  | { kind: 'OPEN_MODAL'; reportType: ReportType }
  | { kind: 'CAPTURE_TAB_RESULT'; dataUrl: string; error?: string }
  | { kind: 'SUBMIT_SUCCESS'; issueKey: string; issueUrl: string }
  | { kind: 'SUBMIT_ERROR'; message: string }

export type Shape =
  | { type: 'pen'; color: string; points: Array<{ x: number; y: number }> }
  | { type: 'rect'; color: string; x: number; y: number; w: number; h: number }
  | { type: 'arrow'; color: string; x1: number; y1: number; x2: number; y2: number }
  | { type: 'text'; color: string; x: number; y: number; text: string }
