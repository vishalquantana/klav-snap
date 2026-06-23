// ext-match.ts — pure helper for parsing /api/extension/match responses.
// No Chrome APIs, no DOM, no module-level side effects — fully unit-testable.

/**
 * Parse the raw JSON body from GET /api/extension/match.
 * Returns the first matched project { id, name } or null.
 * Never throws — malformed data produces null.
 */
export function parseMatchResponse(data: unknown): { id: string; name: string } | null {
  if (!data || typeof data !== 'object') return null
  const list = (data as any).projects
  if (!Array.isArray(list) || list.length === 0) return null
  const first = list[0]
  if (!first || typeof first !== 'object') return null
  const id = String(first.projectId ?? '')
  const name = String(first.name ?? '')
  if (!id) return null
  return { id, name }
}
