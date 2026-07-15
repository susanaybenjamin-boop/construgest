'use client'

import { useState } from 'react'
import { desktop } from '@/lib/desktop'
import { Loader2, Lock, ArrowLeft, KeyRound } from 'lucide-react'

interface PinGateProps {
  mode: 'enter' | 'create'
  // Modo "enter": credenciales liberadas por el PIN → el padre hace login.
  onUnlock?: (email: string, password: string) => Promise<void>
  onUsePassword?: () => void
  // Modo "create": el padre pasa las credenciales recién usadas al loguearse.
  email?: string
  password?: string
  onCreated?: () => void
  onSkip?: () => void
}

const PIN_RE = /^[0-9]{4,8}$/

// Login rápido con PIN en la app de escritorio. Las credenciales viven cifradas
// (DPAPI) en el proceso principal; aquí solo se maneja el PIN.
export default function PinGate({
  mode, onUnlock, onUsePassword, email, password, onCreated, onSkip,
}: PinGateProps) {
  const pinApi = desktop()?.pin
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinApi || busy) return
    setBusy(true)
    setError('')
    try {
      const r = await pinApi.unlock(pin)
      if (!r.ok) {
        if (r.reason === 'wiped') {
          setError('Demasiados intentos. El PIN se ha borrado; entra con tu contraseña.')
          setTimeout(() => onUsePassword?.(), 1800)
        } else {
          setError(`PIN incorrecto${r.remaining != null ? ` (${r.remaining} intentos restantes)` : ''}.`)
        }
        setPin('')
        setBusy(false)
        return
      }
      // PIN correcto → el padre hace el login con las credenciales liberadas.
      await onUnlock?.(r.email!, r.password!)
    } catch {
      setError('No se pudo iniciar sesión. Prueba con tu contraseña.')
      setBusy(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinApi || busy) return
    if (!PIN_RE.test(pin)) { setError('El PIN debe tener entre 4 y 8 dígitos.'); return }
    if (pin !== confirm) { setError('Los PIN no coinciden.'); return }
    setBusy(true)
    setError('')
    try {
      const r = await pinApi.set(pin, email || '', password || '')
      if (!r.ok) {
        setError(r.reason === 'no-encryption'
          ? 'Este equipo no admite almacenamiento cifrado; no se puede crear PIN.'
          : 'No se pudo crear el PIN.')
        setBusy(false)
        return
      }
      onCreated?.()
    } catch {
      setError('No se pudo crear el PIN.')
      setBusy(false)
    }
  }

  const pinInput = (value: string, onChange: (v: string) => void, placeholder: string, autoFocus = false) => (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
      className="w-full px-4 py-3 rounded-lg border border-gray-300 text-center text-2xl tracking-[0.5em] focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
      placeholder={placeholder}
    />
  )

  if (mode === 'enter') {
    return (
      <>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <KeyRound className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Introduce tu PIN</h2>
          <p className="mt-1 text-sm text-gray-500">Entra rápido sin escribir tu contraseña.</p>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleEnter} className="space-y-4">
          {pinInput(pin, setPin, '••••', true)}
          <button
            type="submit"
            disabled={busy || pin.length < 4}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Entrar
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button onClick={onUsePassword} className="text-blue-600 hover:underline">
            Usar contraseña
          </button>
          <span className="text-gray-300">·</span>
          <button
            onClick={async () => { await pinApi?.clear(); onUsePassword?.() }}
            className="text-gray-500 hover:text-gray-700"
          >
            Olvidé el PIN
          </button>
        </div>
      </>
    )
  }

  // mode === 'create'
  return (
    <>
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <KeyRound className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Crea un PIN de acceso</h2>
        <p className="mt-1 text-sm text-gray-500">
          La próxima vez entrarás con el PIN, sin escribir usuario y contraseña.
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleCreate} className="space-y-3">
        {pinInput(pin, setPin, 'PIN (4-8 dígitos)', true)}
        {pinInput(confirm, setConfirm, 'Repite el PIN')}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Guardar PIN
        </button>
      </form>

      <div className="mt-6 flex items-center justify-center">
        <button onClick={onSkip} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Ahora no
        </button>
      </div>
    </>
  )
}
