import type { KlavitySettings, KlavConfig, KlavMonitoredProject } from '@klavity/core'

const DEFAULT_BACKEND = 'https://klavity.quantana.top'

export function backendBase(s: Partial<KlavitySettings>): string {
  return (s.backendUrl || DEFAULT_BACKEND).replace(/\/+$/, '')
}

async function readSettings(): Promise<Partial<KlavitySettings>> {
  const r = await chrome.storage.sync.get('klavSettings')
  return (r.klavSettings as Partial<KlavitySettings>) ?? {}
}

async function persistToken(token: string, backendUrl: string): Promise<void> {
  const cur = await readSettings()
  await chrome.storage.sync.set({
    klavSettings: { ...cur, klavToken: token, backendUrl, connectionMode: 'klavity' },
  })
}

export function triggerConfigSync(): Promise<KlavConfig | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind: 'KLAV_SYNC_CONFIG' }, (resp: any) => {
      void chrome.runtime.lastError // SW may be asleep; reading clears the warning
      resolve(resp?.config ?? null)
    })
  })
}

export async function trySilentLogin(): Promise<boolean> {
  if (!chrome.cookies?.get) return false
  const base = backendBase(await readSettings())
  try {
    const cookie = await chrome.cookies.get({ url: base, name: 'klav_session' })
    if (!cookie?.value) return false
    await persistToken(cookie.value, base)
    await triggerConfigSync()
    return true
  } catch {
    return false
  }
}

export async function requestCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const base = backendBase(await readSettings())
  try {
    const res = await fetch(`${base}/api/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error || 'Could not send code.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error. Try again.' }
  }
}

export async function verifyCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const base = backendBase(await readSettings())
  try {
    const res = await fetch(`${base}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.token) return { ok: false, error: data.error || 'Invalid or expired code.' }
    await persistToken(data.token, base)
    await triggerConfigSync()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error. Try again.' }
  }
}

export async function getConfig(): Promise<KlavConfig | null> {
  const r = await chrome.storage.local.get('klavConfig')
  return (r.klavConfig as KlavConfig | undefined) ?? null
}

export async function isSignedIn(): Promise<boolean> {
  const c = await getConfig()
  return !!c?.email
}

export async function signOut(): Promise<void> {
  const cur = await readSettings()
  await chrome.storage.sync.set({ klavSettings: { ...cur, klavToken: '', connectionMode: 'direct' } })
  await chrome.storage.local.remove(['klavConfig', 'klavSims', 'klavSelectedProjectId'])
}

export async function getSelectedProjectId(): Promise<string | null> {
  const r = await chrome.storage.local.get('klavSelectedProjectId')
  return (r.klavSelectedProjectId as string | undefined) ?? null
}

export async function setSelectedProjectId(id: string): Promise<void> {
  await chrome.storage.local.set({ klavSelectedProjectId: id })
}

export function pickProject(projects: KlavMonitoredProject[], savedId: string | null): KlavMonitoredProject | null {
  if (!projects.length) return null
  if (savedId) {
    const found = projects.find((p) => p.id === savedId)
    if (found) return found
  }
  return projects[0]
}
