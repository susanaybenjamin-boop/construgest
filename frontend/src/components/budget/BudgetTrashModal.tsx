'use client'

import { useEffect, useState } from 'react'
import { X, Trash2, Undo2, Loader2, AlertTriangle } from 'lucide-react'
import { useBudgetStore } from '@/stores/budgetStore'
import { useNotificationStore } from '@/stores/notificationStore'

interface Props {
  projectId: string
  onClose: () => void
  onRestored?: () => void
}

export default function BudgetTrashModal({ projectId, onClose, onRestored }: Props) {
  const { trashedBudgets, loadTrash, restoreBudget, permanentDeleteBudget } = useBudgetStore()
  const { addToast } = useNotificationStore()
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  useEffect(() => {
    loadTrash(projectId).catch(() => { /* ignore */ }).finally(() => setLoading(false))
  }, [projectId])

  const handleRestore = async (id: string) => {
    setActingId(id)
    try {
      await restoreBudget(id)
      addToast('success', 'Presupuesto restaurado')
      onRestored?.()
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
      await permanentDeleteBudget(id)
      addToast('success', 'Presupuesto eliminado definitivamente')
    } catch {
      addToast('error', 'No se pudo eliminar')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">Papelera de presupuestos</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : trashedBudgets.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">La papelera está vacía</p>
          ) : (
            <div className="space-y-2">
              {trashedBudgets.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {b.name} <span className="text-xs text-gray-400">v{b.version}</span>
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Eliminado {b.deleted_at ? new Date(b.deleted_at).toLocaleString() : 'recientemente'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRestore(b.id)}
                      disabled={actingId === b.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition disabled:opacity-50"
                    >
                      {actingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                      Restaurar
                    </button>
                    <button
                      onClick={() => handlePermanent(b.id, b.name)}
                      disabled={actingId === b.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Borrar definitivo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
