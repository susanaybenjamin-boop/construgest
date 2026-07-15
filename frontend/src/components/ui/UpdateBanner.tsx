'use client'

import { useEffect, useState } from 'react'
import { useVersionStore } from '@/stores/versionStore'
import { ArrowUpCircle, X, Loader2, AlertTriangle } from 'lucide-react'

// API que expone el shell de Electron (preload). En navegador/dev es undefined.
interface UpdateProgress { pct: number; recv?: number; total?: number; blocked?: boolean }
interface DesktopApi {
  isDesktop?: boolean
  installUpdate?: (url: string) => Promise<unknown>
  onUpdateProgress?: (cb: (p: UpdateProgress) => void) => () => void
  onUpdateError?: (cb: (msg: string) => void) => () => void
}
function desktop(): DesktopApi | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { construgest?: DesktopApi }).construgest : undefined
}

// Aviso de "nueva versión disponible" (se comprueba contra GitHub Releases).
// Dentro de la app de escritorio ofrece descargar e instalar la actualización;
// en el navegador enlaza a las novedades de la release.
export default function UpdateBanner() {
  const { info, dismissed, load, dismiss } = useVersionStore()
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [load])

  if (!info?.updateAvailable || dismissed) return null

  const d = desktop()
  const canInstall = !!(d?.isDesktop && d.installUpdate && info.downloadUrl)

  const install = async () => {
    if (!info.downloadUrl || !d?.installUpdate) return
    setError(null)
    setTried(false)
    setProgress(0)
    setInstalling(true)
    const offP = d.onUpdateProgress?.((p) => {
      if (p.blocked) { setTried(true); return }
      if (p.pct >= 0) setProgress(p.pct)
    })
    const offE = d.onUpdateError?.((msg) => {
      setError(msg || 'No se pudo descargar la actualización.')
      setInstalling(false)
      offP?.(); offE?.()
    })
    try {
      await d.installUpdate(info.downloadUrl)
      // Si vuelve sin error, arrancó el instalador y la app se va a cerrar.
    } catch {
      setInstalling(false)
      offP?.(); offE?.()
    }
  }

  // Overlay a pantalla completa mientras se descarga: bloquea la app para que la
  // descarga (453 MB) no se interrumpa. NO cerrar la ventana hasta que termine.
  if (installing) {
    const pct = progress ?? 0
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center">
          <ArrowUpCircle className="mx-auto mb-4 h-12 w-12 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Instalando ConstruGest {info.latest}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {pct < 100 ? 'Descargando la actualización…' : 'Preparando el instalador…'}
          </p>

          <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-medium text-gray-700">{pct}%</p>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-amber-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            No cierres la aplicación hasta que termine.
          </div>
          {tried && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Descarga en curso: espera a que acabe, no cierres la ventana.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
      <ArrowUpCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
      <div className="flex-1 text-sm text-blue-900">
        Hay una nueva versión disponible: <strong>{info.latest}</strong>
        <span className="text-blue-500"> (tienes la {info.current})</span>.
        {error && (
          <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" /> {error} Puedes reintentar o descargarla manualmente.
          </span>
        )}
      </div>

      {canInstall ? (
        <button
          onClick={install}
          disabled={installing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
        >
          {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
          {installing ? 'Descargando…' : error ? 'Reintentar' : 'Descargar e instalar'}
        </button>
      ) : info.releaseUrl ? (
        <a
          href={info.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-blue-700 hover:text-blue-900 underline whitespace-nowrap"
        >
          Ver novedades
        </a>
      ) : null}

      {!installing && (
        <button onClick={dismiss} className="p-1 text-blue-400 hover:text-blue-600 rounded" title="Ocultar">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
