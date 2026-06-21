import { toPng } from 'html-to-image'
import type { KlavitySettings, ReportType, SubmitReportPayload, IntegrationConfig, ReportIdentity } from '@klavity/core'
import { DEFAULT_SETTINGS } from '@klavity/core'
import { installCapture, buildReportContext, type CaptureBuffers } from '@klavity/core/capture'
import { dispatchSubmit } from '@klavity/core/submit'
import { buildModal } from '@klavity/core/modal'
import { submitReport as jiraSubmit } from '@klavity/core/integrations/jira'
import { submitReport as linearSubmit } from '@klavity/core/integrations/linear'
import { submitReport as githubSubmit } from '@klavity/core/integrations/github'
import { submitReport as planeSubmit } from '@klavity/core/integrations/plane'
import { submitReport as backendSubmit } from '@klavity/core/integrations/backend'
import { record as rrwebRecord } from 'rrweb'
import { startReplayRecording, type ReplayController } from './replay-recorder'

export type SdkConfig = Partial<KlavitySettings>

let _settings: KlavitySettings = DEFAULT_SETTINGS
// Shared full-fidelity capture buffers (G2/G3) — populated by @klavity/core/capture.
const _buffers: CaptureBuffers = { consoleErrors: [], networkFailures: [] }
// Site-owner identity + custom metadata (G5), set via identify()/setMetadata().
let _identity: ReportIdentity | undefined
let _metadata: Record<string, string> | undefined
// G1 session replay: rolling rrweb buffer, attached to reports filed via the Klavity backend.
let _replay: ReplayController | null = null

function coerceStrings(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    out[String(k).slice(0, 64)] = String(v).slice(0, 1000)
  }
  return out
}

async function capturePageDataUrl(): Promise<string> {
  return toPng(document.body, {
    cacheBust: true,
    pixelRatio: 1,
    skipFonts: true,
    filter: (node) => {
      if ((node as HTMLElement).id === 'klavity-sdk-host') return false
      if (node.nodeName === 'IMG') {
        const src = (node as HTMLImageElement).src ?? ''
        if (src && !src.startsWith(window.location.origin) && !src.startsWith('data:')) return false
      }
      return true
    },
  })
}

function buildContext(): SubmitReportPayload['context'] {
  return buildReportContext(_buffers, { identity: _identity, metadata: _metadata })
}

async function dispatchToIntegration(config: IntegrationConfig) {
  return dispatchSubmit(
    { type: config.type, description: config.description, context: config.context, screenshots: config.screenshots, replayEvents: config.replayEvents },
    _settings,
    { jira: jiraSubmit, linear: linearSubmit, github: githubSubmit, plane: planeSubmit, backend: backendSubmit },
  )
}

export function openModal(type: ReportType = 'bug') {
  const controller = buildModal(type, {
    onCaptureFull: capturePageDataUrl,
    onSubmit: async (payload) => dispatchToIntegration({
      type: payload.type,
      description: payload.description,
      context: buildContext(),
      screenshots: payload.screenshots,
      settings: _settings,
      replayEvents: _replay?.getEvents() ?? [],
    }),
  })

  // Auto-capture on open
  setTimeout(async () => {
    try {
      const dataUrl = await capturePageDataUrl()
      controller.addScreenshot(dataUrl)
    } catch { /* ignore */ }
  }, 200)
}

function setupErrorCapture() {
  // Full-fidelity capture (G3): all console levels + all fetch/XHR requests, bounded + redacted.
  installCapture(_buffers, { consoleLevels: true })
}

// ── Public custom-metadata API (G5) ──
// window.KlavitySnap.identify({...}) / setMetadata({...}). Values are coerced to strings + capped.
export function identify(user: ReportIdentity | null) {
  _identity = user ? (coerceStrings(user as Record<string, unknown>) as ReportIdentity) : undefined
}
export function setMetadata(meta: Record<string, unknown> | null) {
  _metadata = meta ? coerceStrings(meta) : undefined
}

function addContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const menu = document.createElement('div')
    menu.style.cssText = `position:fixed;left:${Math.min(e.clientX, window.innerWidth - 200)}px;top:${Math.min(e.clientY, window.innerHeight - 80)}px;background:#1e1e2e;border:1px solid #45475a;border-radius:8px;padding:4px;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:system-ui;`
    menu.innerHTML = `
      <div data-action="bug" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">🐛 Report a Bug</div>
      <div data-action="feature" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">💡 Request a Feature</div>
    `
    document.body.appendChild(menu)

    const dismiss = (ev?: Event) => {
      if (!ev || !menu.contains(ev.target as Node)) {
        menu.remove()
        document.removeEventListener('click', dismiss)
      }
    }

    menu.addEventListener('click', (ev) => {
      const action = (ev.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action') as ReportType | null
      menu.remove()
      document.removeEventListener('click', dismiss)
      if (action) openModal(action)
    })

    setTimeout(() => document.addEventListener('click', dismiss), 0)
  })
}

export function init(config: SdkConfig = {}) {
  _settings = {
    ...DEFAULT_SETTINGS,
    ...config,
    jira: { ...DEFAULT_SETTINGS.jira, ...config.jira },
    linear: { ...DEFAULT_SETTINGS.linear, ...config.linear },
    github: { ...DEFAULT_SETTINGS.github, ...config.github },
    plane: { ...DEFAULT_SETTINGS.plane, ...config.plane },
  }
  setupErrorCapture()
  addContextMenu()
  // G1 session replay: start a rolling rrweb buffer (masked by default). Best-effort — a recorder
  // failure must never break host-app init. Only meaningful when reporting via the Klavity backend.
  if (!_replay) { try { _replay = startReplayRecording(rrwebRecord as any) } catch { _replay = null } }
}

// Expose on window for script-tag usage
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).KlavitySnap = { init, openModal, identify, setMetadata }
}

export default { init, openModal, identify, setMetadata }
