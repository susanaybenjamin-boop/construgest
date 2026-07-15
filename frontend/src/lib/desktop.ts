// Puente tipado con el shell de Electron (expuesto por preload como `window.construgest`).
// En el navegador / dev es `undefined`, así que todo uso debe comprobar isDesktop.

export interface UpdateProgress { pct: number; recv?: number; total?: number; blocked?: boolean }

export interface PinStatus { available: boolean; hasPin: boolean }
export interface PinSetResult { ok: boolean; reason?: string }
export interface PinUnlockResult {
  ok: boolean
  email?: string
  password?: string
  reason?: 'no-pin' | 'bad-pin' | 'wiped'
  remaining?: number
}

export interface DesktopApi {
  isDesktop?: boolean
  installUpdate?: (url: string) => Promise<unknown>
  onUpdateProgress?: (cb: (p: UpdateProgress) => void) => () => void
  onUpdateError?: (cb: (msg: string) => void) => () => void
  pin?: {
    status: () => Promise<PinStatus>
    set: (pin: string, email: string, password: string) => Promise<PinSetResult>
    unlock: (pin: string) => Promise<PinUnlockResult>
    clear: () => Promise<{ ok: boolean }>
  }
}

export function desktop(): DesktopApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { construgest?: DesktopApi }).construgest
}

export function isDesktop(): boolean {
  return !!desktop()?.isDesktop
}
