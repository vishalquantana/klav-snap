import type { KlavitySettings, SubmitReportPayload, SubmitResult, IntegrationConfig } from './types'

type Handler = (config: IntegrationConfig) => Promise<SubmitResult>

interface Handlers {
  jira?: Handler
  linear?: Handler
  github?: Handler
  plane?: Handler
  backend?: Handler
}

export async function dispatchSubmit(
  payload: SubmitReportPayload,
  settings: KlavitySettings,
  handlers: Handlers,
): Promise<SubmitResult> {
  const config: IntegrationConfig = {
    type: payload.type,
    description: payload.description,
    context: payload.context,
    screenshots: payload.screenshots,
    settings,
    ...(payload.projectId ? { projectId: payload.projectId } : {}),
    replayEvents: payload.replayEvents,
  }

  if (settings.backendUrl) {
    if (!handlers.backend) throw new Error('No handler for backend mode')
    return handlers.backend(config)
  }

  const handler = handlers[settings.integration]
  if (!handler) throw new Error(`No handler for integration: ${settings.integration}`)
  return handler(config)
}
