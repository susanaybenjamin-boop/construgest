'use client'

// PRES-3 — Anexo fotográfico del presupuesto.
//
// Las fotos ya están subidas al proyecto (pestaña Documentos). Aquí se elige
// cuáles salen en ESTE presupuesto, en qué zona y con qué pie. El fichero no se
// duplica: solo se referencia.
//
// Diálogo en su propio fichero (regla nº3), igual que el resto de diálogos del
// presupuesto.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Loader2, Images, Trash2, Plus, Check } from 'lucide-react'
import api from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import type { BudgetPhoto, ProjectFile } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
const FILES_URL = `${API_URL}/files/construgest-files`

/** URL pública de un fichero del proyecto (el backend local los sirve sin token). */
export const photoUrl = (storagePath?: string | null) =>
  storagePath ? `${FILES_URL}/${storagePath}` : ''

interface Props {
  isOpen: boolean
  onClose: () => void
  budgetId: string
  projectId: string
  /** Zonas ya usadas en las mediciones, para sugerirlas también aquí. */
  zones?: string[]
}

export default function BudgetPhotosPanel({ isOpen, onClose, budgetId, projectId, zones = [] }: Props) {
  const { addToast } = useNotificationStore()
  const [photos, setPhotos] = useState<BudgetPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [picker, setPicker] = useState(false)
  const [projectPhotos, setProjectPhotos] = useState<ProjectFile[]>([])
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)

  const err = (e: unknown) => {
    const r = e as { response?: { data?: { error?: string } }; message?: string }
    return r?.response?.data?.error || r?.message || 'error desconocido'
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<BudgetPhoto[]>(`/budgets/${budgetId}/photos`)
      setPhotos(data)
    } catch (e) {
      addToast('error', `No se pudo cargar el anexo fotográfico: ${err(e)}`)
    } finally {
      setLoading(false)
    }
  }, [budgetId, addToast])

  useEffect(() => { if (isOpen) cargar() }, [isOpen, cargar])

  const abrirSelector = async () => {
    setPicker(true)
    setSeleccion(new Set())
    try {
      const { data } = await api.get<ProjectFile[]>(`/projects/${projectId}/files`)
      const yaPuestas = new Set(photos.map((p) => p.file_id))
      setProjectPhotos(
        (data || []).filter((f) => f.file_type === 'image' && !yaPuestas.has(f.id)),
      )
    } catch (e) {
      addToast('error', `No se pudieron listar las fotos del proyecto: ${err(e)}`)
    }
  }

  const anadir = async () => {
    if (seleccion.size === 0) return
    setGuardando(true)
    try {
      await api.post(`/budgets/${budgetId}/photos`, { file_ids: [...seleccion] })
      addToast('success', `${seleccion.size} foto(s) añadidas al anexo`)
      setPicker(false)
      cargar()
    } catch (e) {
      addToast('error', `No se pudieron añadir: ${err(e)}`)
    } finally {
      setGuardando(false)
    }
  }

  const guardarCampo = async (photo: BudgetPhoto, campo: 'zone' | 'caption', valor: string) => {
    if ((photo[campo] || '') === valor) return
    try {
      await api.put(`/budgets/photos/${photo.id}`, { [campo]: valor })
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, [campo]: valor } : p)))
    } catch (e) {
      addToast('error', `No se pudo guardar: ${err(e)}`)
    }
  }

  const quitar = async (photo: BudgetPhoto) => {
    try {
      await api.delete(`/budgets/photos/${photo.id}`)
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
      addToast('success', 'Foto quitada del anexo (sigue en el proyecto)')
    } catch (e) {
      addToast('error', `No se pudo quitar: ${err(e)}`)
    }
  }

  const zonasSugeridas = useMemo(() => {
    const set = new Set<string>(zones.filter(Boolean))
    photos.forEach((p) => { if (p.zone) set.add(p.zone) })
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [zones, photos])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Anexo fotográfico</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Fotos del proyecto que saldrán al final del presupuesto, agrupadas por zona
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Images className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700">El anexo está vacío</p>
              <p className="text-sm text-gray-500 mt-1">
                Añade fotos ya subidas al proyecto desde la pestaña Documentos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {photos.map((p) => (
                <div key={p.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl(p.file?.storage_path)}
                    alt={p.caption || p.file?.original_name || 'Foto'}
                    className="w-full h-40 object-cover bg-gray-100"
                  />
                  <div className="p-3 space-y-2">
                    <input
                      defaultValue={p.zone || ''}
                      placeholder="Zona (planta 5ª, portal…)"
                      list={`zonas-foto-${budgetId}`}
                      className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                      onBlur={(e) => guardarCampo(p, 'zone', e.target.value)}
                    />
                    <input
                      defaultValue={p.caption || ''}
                      placeholder="Pie de foto"
                      className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                      onBlur={(e) => guardarCampo(p, 'caption', e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400 truncate max-w-[70%]">
                        {p.file?.original_name}
                      </span>
                      <button
                        onClick={() => quitar(p)}
                        className="flex items-center gap-1 text-[11px] text-red-600 hover:bg-red-50 px-2 py-1 rounded transition"
                      >
                        <Trash2 className="w-3 h-3" /> Quitar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <datalist id={`zonas-foto-${budgetId}`}>
            {zonasSugeridas.map((z) => <option key={z} value={z} />)}
          </datalist>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <span className="text-sm text-gray-500">
            {photos.length} foto{photos.length === 1 ? '' : 's'} en el anexo
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
            >
              Cerrar
            </button>
            <button
              onClick={abrirSelector}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm"
            >
              <Plus className="w-4 h-4" /> Añadir fotos
            </button>
          </div>
        </div>
      </div>

      {/* Selector de fotos del proyecto */}
      {picker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Fotos del proyecto</h3>
              <button onClick={() => setPicker(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {projectPhotos.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">
                  No hay más imágenes en este proyecto. Súbelas en la pestaña Documentos.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {projectPhotos.map((f) => {
                    const marcada = seleccion.has(f.id)
                    return (
                      <button
                        key={f.id}
                        onClick={() => setSeleccion((prev) => {
                          const n = new Set(prev)
                          if (n.has(f.id)) n.delete(f.id); else n.add(f.id)
                          return n
                        })}
                        className={`relative rounded-lg overflow-hidden border-2 transition ${marcada ? 'border-blue-600' : 'border-transparent hover:border-gray-300'}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoUrl(f.storage_path)}
                          alt={f.original_name}
                          className="w-full h-24 object-cover bg-gray-100"
                        />
                        {marcada && (
                          <span className="absolute top-1 right-1 bg-blue-600 text-white rounded-full p-1">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                        <span className="block text-[10px] text-gray-500 truncate px-1 py-0.5">
                          {f.original_name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setPicker(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={anadir}
                disabled={seleccion.size === 0 || guardando}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm disabled:opacity-50"
              >
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Añadir {seleccion.size > 0 ? `(${seleccion.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
