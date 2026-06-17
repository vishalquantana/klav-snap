// Registry: maps each connector type to its adapter.
// Pure module — no DB, no secrets, only fetch.

import { webhookConnector } from "./webhook"
import { planeConnector } from "./plane"
import { githubConnector } from "./github"
import { jiraConnector } from "./jira"
import { linearConnector } from "./linear"

// ── Types ──────────────────────────────────────────────────────────────────────

export type TicketPayload = {
  title: string
  body: string
  severity: string | null
  url: string | null
  simName: string | null
  createdAt: number
  klavityUrl: string
}

export type ExportResult = {
  externalKey: string | null
  externalUrl: string | null
}

export type ConnectorField = {
  key: string
  label: string
  secret?: boolean
  required?: boolean
  placeholder?: string
}

export interface Connector {
  type: "webhook" | "plane" | "github" | "jira" | "linear"
  label: string
  fields: ConnectorField[]
  validate(cfg: Record<string, string>): { ok: boolean; error?: string }
  createIssue(ticket: TicketPayload, cfg: Record<string, string>): Promise<ExportResult>
}

// ── Registry ───────────────────────────────────────────────────────────────────

const registry: Record<string, Connector> = {
  webhook: webhookConnector,
  plane: planeConnector,
  github: githubConnector,
  jira: jiraConnector,
  linear: linearConnector,
}

export function getConnector(type: string): Connector | null {
  return registry[type] ?? null
}

export function listConnectorTypes(): { type: string; label: string; fields: ConnectorField[] }[] {
  return Object.values(registry).map(({ type, label, fields }) => ({ type, label, fields }))
}
