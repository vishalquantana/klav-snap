import { test, expect } from 'bun:test'
import { redactPlane, planeConfigFromForm } from './connection'

test('redactPlane hides the token but keeps non-secret fields', () => {
  const r = redactPlane({ token_enc: 'iv:ct', workspace: 'acme', projectId: 'p1', host: 'https://plane.x' })
  expect(r).toEqual({ workspace: 'acme', projectId: 'p1', host: 'https://plane.x', hasToken: true })
  expect(JSON.stringify(r)).not.toContain('iv:ct')
})

test('planeConfigFromForm trims host trailing slash and reads fields', () => {
  const f = new FormData()
  f.set('workspace', 'acme'); f.set('project_id', 'p1'); f.set('host', 'https://plane.x/')
  expect(planeConfigFromForm(f)).toEqual({ workspace: 'acme', projectId: 'p1', host: 'https://plane.x' })
})
