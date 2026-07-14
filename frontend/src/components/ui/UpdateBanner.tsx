'use client'

import { useEffect } from 'react'
import { useVersionStore } from '@/stores/versionStore'
import { ArrowUpCircle, X } from 'lucide-react'

// Aviso de "nueva versión disponible" (se comprueba contra GitHub Releases).
// Solo avisa; la descarga/instalación llegará con el empaquetado (Fase 5).
export default function UpdateBanner() {
  const { info, dismissed, load, dismiss } = useVersionStore()

  useEffect(() => { load() }, [load])

  if (!info?.updateAvailable || dismissed) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
      <ArrowUpCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
      <div className="flex-1 text-sm text-blue-900">
        Hay una nueva versión disponible: <strong>{info.latest}</strong>
        <span className="text-blue-500"> (tienes la {info.current})</span>.
      </div>
      {info.releaseUrl && (
        <a
          href={info.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-blue-700 hover:text-blue-900 underline whitespace-nowrap"
        >
          Ver novedades
        </a>
      )}
      <button onClick={dismiss} className="p-1 text-blue-400 hover:text-blue-600 rounded" title="Ocultar">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
