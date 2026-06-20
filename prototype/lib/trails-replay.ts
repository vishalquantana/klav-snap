// Plan E2 — rrweb Walk replay: storage + opt-in capture.
//
// STORAGE HALF: a Walk's session replay is stored as an array of per-page ReplaySegments
// (one rrweb recording per document the Walk navigated through). The whole array is
// JSON.stringify'd, gzipped (Bun.gzipSync), and base64'd into walk_replays.segments_gz.
// Project-scoped on every read. Storage-efficient (gzip ~20-100x smaller than video).
//
// CAPTURE HALF: setupReplayCapture(context) injects the rrweb recorder into every page via
// context.addInitScript (re-runs on each fresh document) and collects events through an
// exposed binding. The runner flushes a segment at each navigation boundary (URL change) and
// once at the end. Capture is OPT-IN (WalkOptions.replay) and best-effort/try-caught: a
// recorder failure yields no replay but NEVER fails or slows a Walk.
import { db } from "./db"
import type { BrowserContext } from "playwright"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

export interface ReplaySegment {
  /** The run_step idx at which this page began (segment boundary tag). */
  idx: number
  url: string
  events: unknown[]
}

// ── storage ───────────────────────────────────────────────────────────────────────
export async function saveReplay(projectId: string, runId: string, segments: ReplaySegment[]): Promise<void> {
  const json = JSON.stringify(segments)
  const gz = Buffer.from(Bun.gzipSync(Buffer.from(json))).toString("base64")
  const nEvents = segments.reduce((n, s) => n + (s.events?.length || 0), 0)
  await db!.execute({
    sql: `INSERT INTO walk_replays (id, run_id, project_id, segments_gz, n_segments, n_events, created_at) VALUES (?,?,?,?,?,?,?)`,
    args: ["rep_" + crypto.randomUUID(), runId, projectId, gz, segments.length, nEvents, Date.now()],
  })
}

export async function getReplay(projectId: string, runId: string): Promise<ReplaySegment[] | null> {
  const r = await db!.execute({
    sql: `SELECT segments_gz FROM walk_replays WHERE project_id=? AND run_id=? ORDER BY created_at DESC LIMIT 1`,
    args: [projectId, runId],
  })
  if (!r.rows.length) return null
  const gz = Buffer.from(String((r.rows[0] as any).segments_gz), "base64")
  return JSON.parse(Buffer.from(Bun.gunzipSync(gz)).toString()) as ReplaySegment[]
}

// ── capture ───────────────────────────────────────────────────────────────────────
// The rrweb recorder bundle, resolved from node_modules and inlined into an init script so it
// runs in EVERY document (including the file:// fixtures, no network). Loaded lazily + cached.
let rrwebSource: string | null = null
function loadRrwebSource(): string {
  if (rrwebSource != null) return rrwebSource
  const require = createRequire(import.meta.url)
  // rrweb ships a UMD bundle that defines window.rrweb (record/Replayer). Resolve its dist file.
  let path: string
  try {
    path = require.resolve("rrweb/dist/rrweb.umd.cjs")
  } catch {
    try { path = require.resolve("rrweb/dist/rrweb.min.js") }
    catch { path = require.resolve("rrweb/dist/rrweb.js") }
  }
  rrwebSource = readFileSync(path, "utf8")
  return rrwebSource
}

export interface ReplayCapture {
  /** Snapshot the events accumulated for the page just left into a segment, then start fresh. */
  flush: (idx: number, url: string) => Promise<void>
  segments: ReplaySegment[]
}

/**
 * Wire rrweb capture into a BrowserContext. exposeBinding gives the page a function to push each
 * recorded event back to the runner; addInitScript injects the recorder + a call to rrweb.record
 * on every fresh document (so a full-page navigation transparently starts a new recording). The
 * runner calls flush(idx, url) at each navigation boundary to seal the previous page as a segment.
 */
export async function setupReplayCapture(context: BrowserContext): Promise<ReplayCapture> {
  let current: unknown[] = []
  const segments: ReplaySegment[] = []

  // The page calls this for every rrweb event. _src is the binding source (unused).
  await context.exposeBinding("__klavReplayPush", (_src, ev: unknown) => {
    current.push(ev)
  })

  const rrweb = loadRrwebSource()
  // Inject the recorder bundle, then start recording. Re-runs per document → per-page recording.
  // Best-effort: any error inside the page must not break navigation/interaction.
  await context.addInitScript({
    content:
      rrweb +
      `;(function(){try{
        if (window.__klavRrwebStarted) return; window.__klavRrwebStarted = true;
        var rec = (window.rrweb && window.rrweb.record) ? window.rrweb.record : (typeof rrwebRecord!=='undefined'?rrwebRecord:null);
        if (!rec) return;
        rec({ emit: function(ev){ try{ window.__klavReplayPush(ev); }catch(e){} } });
      }catch(e){}})();`,
  })

  return {
    segments,
    async flush(idx: number, url: string) {
      // Seal whatever this page recorded into a segment, then reset the buffer for the next page.
      // Skip empty flushes so a no-op navigation doesn't create a junk segment.
      if (current.length === 0) return
      segments.push({ idx, url, events: current })
      current = []
    },
  }
}
