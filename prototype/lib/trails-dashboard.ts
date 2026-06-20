// Layer E — Trails dashboard aggregator. One project-scoped read used by GET /api/trails/dashboard
// and unit-testable without HTTP. Surfaces: the project's Trails, its recent Walks (verdict pills),
// the review queue (queued findings), and the published precision metric (legit-bug rate).

import type { Trail, Walk, Finding } from "./trails-types"
import { listTrails, listRecentWalks, listFindings } from "./trails"
import { projectPrecision } from "./trails-findings-gate"

export interface TrailsDashboard {
  trails: Trail[]
  recentWalks: Walk[]
  queue: Finding[]
  precision: { filed: number; dismissed: number; precision: number | null }
}

export async function trailsDashboardData(projectId: string): Promise<TrailsDashboard> {
  const [trails, recentWalks, queue, precision] = await Promise.all([
    listTrails(projectId),
    listRecentWalks(projectId, 20),
    listFindings(projectId, { status: "queued" }),
    projectPrecision(projectId),
  ])
  return { trails, recentWalks, queue, precision }
}
