'use client'

import { useEffect, useState } from 'react'
import { useVersionStore } from '@/stores/versionStore'
import { ArrowUpCircle, X, Loader2 } from 'lucide-react'

// API que expone el shell de Electron (preload). En navegador/dev es undefined.
interface DesktopApi { isDesktop?: boolean; installUpdate?: (url: string) => Promise<unknown> }
function desktop(): DesktopApi | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { construgest?: DesktopApi }).construgest : undefined
}

// Aviso de "nueva versión disponible" (se comprueba contra GitHub Releases).
// Dentro de la app de escritorio ofrece descargar e instalar la actualización;
// en el navegador enlaza a las novedades de la release.
export default function UpdateBanner() {
  const { info, dismissed, load, dismiss } = useVersionStore()
  const [installing, setInstalling] = useState(false)

  useEffect(() => { load() }, [load])

  if (!info?.updateAvailable || dismissed) return null

  const d = desktop()
  const canInstall = !!(d?.isDesktop && d.installUpdate && info.downloadUrl)

  const install = async () => {
    if (!info.downloadUrl || !d?.installUpdate) return
    setInstalling(true)
    try {
      await d.installUpdate(info.downloadUrl)
      // Si vuelve, es que arrancó el instalador y la app se va a cerrar.
    } catch {
      setInstalling(false)
    }
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
      <ArrowUpCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
      <div className="flex-1 text-sm text-blue-900">
        Hay una nueva versión disponible: <strong>{info.latest}</strong>
        <span className="text-blue-500"> (tienes la {info.current})</span>.
      </div>

      {canInstall ? (
        <button
          onClick={install}
          disabled={installing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
        >
          {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
          {installing ? 'Descargando…' : 'Descargar e instalar'}
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
