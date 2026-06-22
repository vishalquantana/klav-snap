// Central screenshot capture/storage config (Screenshots Phase 2 §a).
//
// One source of truth for screenshot behaviour, replacing constants previously scattered across
// server.ts (per-file size cap, per-report file cap, MIME allowlist), s3.ts (presign TTL, default ACL)
// and the retention sweep. Server-wide defaults come from env; a project may *tighten* them via its
// settings blob (modal_config_json.screenshots) — a project can disable capture, lower the size cap, or
// pin the ACL, but can never RAISE the server-wide ceiling.

function posInt(name: string, def: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def
}

export const SCREENSHOTS = {
  maxBytes: posInt("SCREENSHOT_MAX_BYTES", 8 * 1024 * 1024),       // per-file upload cap (8MB)
  maxFiles: posInt("SCREENSHOT_MAX_FILES", 5),                     // per-report file cap
  presignTtlSec: posInt("SCREENSHOT_PRESIGN_TTL_SEC", 600),        // signed-GET lifetime (10 min)
  retentionDays: posInt("SCREENSHOT_RETENTION_DAYS", 0),           // 0 = keep forever (prior behaviour)
  defaultAcl: (process.env.SCREENSHOT_DEFAULT_ACL === "public-read" ? "public-read" : "private") as "private" | "public-read",
  allowedTypePrefix: "image/",
}

export function mbLabel(bytes: number): string {
  return Math.round(bytes / (1024 * 1024)) + "MB"
}

export type ResolvedScreenshotConfig = {
  enabled: boolean
  maxBytes: number
  acl: "private" | "public-read"
  presignTtlSec: number
  retentionDays: number
}

// Merge a project's settings over the server-wide defaults. `projectSettings` is the parsed
// modal_config_json (or any object); the screenshot override lives under `.screenshots`:
//   { enabled?: boolean, maxSizeMb?: number, acl?: "private"|"public-read" }
// A project may only narrow the limits — maxBytes is min(server, project).
export function resolveScreenshotConfig(projectSettings: any): ResolvedScreenshotConfig {
  const o = (projectSettings && typeof projectSettings === "object" && projectSettings.screenshots) || {}
  const projMax = Number(o.maxSizeMb) > 0 ? Math.floor(Number(o.maxSizeMb) * 1024 * 1024) : Infinity
  return {
    enabled: o.enabled !== false,
    maxBytes: Math.min(SCREENSHOTS.maxBytes, projMax),
    acl: (o.acl === "public-read" || o.acl === "private") ? o.acl : SCREENSHOTS.defaultAcl,
    presignTtlSec: SCREENSHOTS.presignTtlSec,
    retentionDays: SCREENSHOTS.retentionDays,
  }
}
