'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Trash2, Undo2, Loader2, AlertTriangle } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useNotificationStore } from '@/stores/notificationStore'

export default function TrashPage() {
  const { trashedProjects, loadTrash, restoreProject, permanentDeleteProject } = useProjectStore()
  const { addToast } = useNotificationStore()
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  useEffect(() => {
    loadTrash().catch(() => { /* ignore */ }).finally(() => setLoading(false))
  }, [])

  const handleRestore = async (id: string) => {
    setActingId(id)
    try {
      await restoreProject(id)
      addToast('success', 'Proyecto restaurado')
    } catch {
      addToast('error', 'No se pudo restaurar')
    } finally {
      setActingId(null)
    }
  }

  const handlePermanent = async (id: string, name: string) => {
    if (!confirm(`Eliminar definitivamente "${name}"? Esta acción NO se puede deshacer.`)) return
    setActingId(id)
    try {
      await permanentDeleteProject(id)
      addToast('success', 'Proyecto eliminado definitivamente')
    } catch {
      addToast('error', 'No se pudo eliminar')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg" title="Volver">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            Papelera de proyectos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Proyectos eliminados. Puedes restaurarlos o borrarlos definitivamente.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : trashedProjects.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-200">
          <Trash2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">La papelera está vacía</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {trashedProjects.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between hover:shadow-sm transition"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.client_name && <span>{p.client_name} · </span>}
                  Eliminado {p.deleted_at ? new Date(p.deleted_at).toLocaleString() : 'recientemente'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRestore(p.id)}
                  disabled={actingId === p.id}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition disabled:opacity-50"
                  title="Restaurar"
                >
                  {actingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                  Restaurar
                </button>
                <button
                  onClick={() => handlePermanent(p.id, p.name)}
                  disabled={actingId === p.id}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                  title="Eliminar definitivamente"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Borrar definitivo
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
