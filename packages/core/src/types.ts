export type IntegrationType = 'jira' | 'linear' | 'github' | 'plane'
export type ReportType = 'bug' | 'feature'

export interface KlavSettings {
  integration: IntegrationType
  backendUrl: string
  autoFileErrors: boolean
  jira: { baseUrl: string; email: string; token: string; projectKey: string }
  linear: { apiKey: string; teamId: string }
  github: { token: string; repo: string } // "owner/repo"
  plane: { token: string; workspace: string; projectId: string }
}

export const DEFAULT_SETTINGS: KlavSettings = {
  integration: 'jira',
  backendUrl: '',
  autoFileErrors: false,
  jira: { baseUrl: '', email: '', token: '', projectKey: '' },
  linear: { apiKey: '', teamId: '' },
  github: { token: '', repo: '' },
  plane: { token: '', workspace: '', projectId: '' },
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
  settings: KlavSettings
}

// Extension message protocol
export type BackgroundMessage =
  | { kind: 'CAPTURE_TAB' }
  | { kind: 'SUBMIT_REPORT'; payload: SubmitReportPayload }
  | { kind: 'AUTO_FILE_ERROR'; message: string; stack?: string; pageUrl: string; timestamp: number }

export type ContentMessage =
  | { kind: 'OPEN_MODAL'; reportType: ReportType }
  | { kind: 'CAPTURE_TAB_RESULT'; dataUrl: string }
  | { kind: 'SUBMIT_SUCCESS'; issueKey: string; issueUrl: string }
  | { kind: 'SUBMIT_ERROR'; message: string }

export type Shape =
  | { type: 'pen'; color: string; points: Array<{ x: number; y: number }> }
  | { type: 'rect'; color: string; x: number; y: number; w: number; h: number }
  | { type: 'arrow'; color: string; x1: number; y1: number; x2: number; y2: number }
  | { type: 'text'; color: string; x: number; y: number; text: string }
