export interface CaptureAwaiter {
  captureFull(): Promise<string>
  settle(dataUrl: string, error?: string): void
}

export function makeCaptureAwaiter(opts: { send: (m: { kind: 'CAPTURE_TAB' }) => void; timeoutMs?: number }): CaptureAwaiter {
  let resolve: ((v: string) => void) | null = null
  let reject: ((e: Error) => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => { if (timer) clearTimeout(timer); timer = null; resolve = null; reject = null }
  return {
    captureFull() {
      if (resolve) return Promise.reject(new Error('a capture is already in flight'))
      return new Promise<string>((res, rej) => {
        resolve = res; reject = rej
        timer = setTimeout(() => { const r = reject; clear(); r?.(new Error('capture timed out')) }, opts.timeoutMs ?? 2200)
        opts.send({ kind: 'CAPTURE_TAB' })
      })
    },
    settle(dataUrl, error) {
      const res = resolve, rej = reject; clear()
      if (error || !dataUrl) rej?.(new Error(error || 'capture failed')); else res?.(dataUrl)
    },
  }
}
