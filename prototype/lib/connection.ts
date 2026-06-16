// Plane connection config helpers. Stored config shape: { token_enc, workspace, projectId, host }.
export type PlaneStored = { token_enc: string; workspace: string; projectId: string; host: string }

export function planeConfigFromForm(form: FormData): { workspace: string; projectId: string; host: string } {
  return {
    workspace: String(form.get('workspace') || ''),
    projectId: String(form.get('project_id') || ''),
    host: String(form.get('host') || 'https://api.plane.so').replace(/\/+$/, ''),
  }
}

export function redactPlane(c: Partial<PlaneStored>) {
  return { workspace: c.workspace || '', projectId: c.projectId || '', host: c.host || '', hasToken: !!c.token_enc }
}
