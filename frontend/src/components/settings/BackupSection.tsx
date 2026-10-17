'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, UploadCloud } from 'lucide-react'
import localApi from '@/lib/localApi'
import { useNotificationStore } from '@/stores/notificationStore'
import { useProjectStore } from '@/stores/projectStore'

// Copias de seguridad de los proyectos en su carpeta local (<carpeta>/_backup).
// Backup: de todos los proyectos con carpeta. Restaurar: de los que se marquen.
// Restaurar SUSTITUYE los datos actuales del proyecto (antes el backend guarda una
// copia del estado actual en <carpeta>/_backup_antes_de_restaurar_<fecha>).

interface BackupInfo {
  backup_date: string | null
  format: number
  project_id: string | null
}

interface ProjectBackupRow {
  id: string
  name: string
  folder_path: string | null
  backup: BackupInfo | null
}

// Un backup/restauración puede tardar más que el timeout por defecto de localApi (5 s).
const LONG_TIMEOUT = 120000

const errorMessage = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error || e?.message || fallback
}

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

export function BackupSection() {
  const { addToast } = useNotificationStore()
  const loadProjects = useProjectStore((s) => s.loadProjects)

  const [rows, setRows] = useState<ProjectBackupRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [progress, setProgress] = useState('')

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const { data } = await localApi.get('/projects/backups', { timeout: LONG_TIMEOUT })
      const list = (data as ProjectBackupRow[]) || []
      setRows(list)
      // Quitar de la selección lo que ya no tenga backup o haya desaparecido.
      setSelected((prev) => new Set([...prev].filter((id) => list.some((r) => r.id === id && r.backup))))
    } catch (err) {
      addToast('error', errorMessage(err, 'No se pudo leer el estado de las copias de seguridad'))
    } finally {
      setLoadingList(false)
    }
  }, [addToast])

  useEffect(() => { loadList() }, [loadList])

  const withFolder = useMemo(() => rows.filter((r) => r.folder_path), [rows])
  const restorable = useMemo(() => rows.filter((r) => r.backup), [rows])
  const allSelected = restorable.length > 0 && restorable.every((r) => selected.has(r.id))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(restorable.map((r) => r.id)))
  }

  const handleBackupAll = async () => {
    setBackingUp(true)
    const failed: string[] = []
    let ok = 0
    try {
      for (const [i, p] of withFolder.entries()) {
        setProgress(`Backup ${i + 1} de ${withFolder.length}: ${p.name}`)
        try {
          await localApi.post(`/projects/${p.id}/backup`, undefined, { timeout: LONG_TIMEOUT })
          ok++
        } catch (err) {
          failed.push(`${p.name}: ${errorMessage(err, 'error')}`)
        }
      }
      if (failed.length === 0) {
        addToast('success', `Backup completado: ${ok} proyectos exportados`)
      } else {
        addToast('error', `Backup: ${ok} correctos, ${failed.length} con error. ${failed.join(' | ')}`)
      }
    } finally {
      setProgress('')
      setBackingUp(false)
      loadList()
    }
  }

  const handleRestoreSelected = async () => {
    const targets = restorable.filter((r) => selected.has(r.id))
    if (targets.length === 0) return
    const lines = targets.map((r) => `- ${r.name} (backup del ${formatDate(r.backup?.backup_date ?? null)})`).join('\n')
    const ok = confirm(
      `Se van a restaurar ${targets.length} proyecto(s):\n\n${lines}\n\n` +
      'Los datos ACTUALES de cada proyecto se sustituirán por los del backup. ' +
      'Antes se guardará una copia del estado actual en su carpeta (_backup_antes_de_restaurar_...).\n\n¿Continuar?'
    )
    if (!ok) return

    setRestoring(true)
    const failed: string[] = []
    let done = 0
    try {
      for (const [i, p] of targets.entries()) {
        setProgress(`Restaurando ${i + 1} de ${targets.length}: ${p.name}`)
        try {
          await localApi.post(`/projects/${p.id}/restore-backup`, undefined, { timeout: LONG_TIMEOUT })
          done++
        } catch (err) {
          failed.push(`${p.name}: ${errorMessage(err, 'error')}`)
        }
      }
      if (failed.length === 0) {
        addToast('success', `Restauración completada: ${done} proyecto(s)`)
      } else {
        addToast('error', `Restauración: ${done} correctos, ${failed.length} con error. ${failed.join(' | ')}`)
      }
      setSelected(new Set())
    } finally {
      setProgress('')
      setRestoring(false)
      // Los datos de los proyectos han cambiado: refrescar la lista de proyectos y este panel.
      loadProjects().catch(() => { /* tolerar */ })
      loadList()
    }
  }

  const busy = backingUp || restoring

  return (
    <div className="mt-5 pt-5 border-t border-gray-200">
      <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <Download className="w-4 h-4 text-green-600" /> Copias de seguridad
      </h4>
      <p className="text-sm text-gray-500 mb-3">Exporta todos los datos de los proyectos a sus carpetas locales como backup.</p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleBackupAll}
          disabled={busy || withFolder.length === 0}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
        >
          {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Backup de todos los proyectos
        </button>
        <button
          type="button"
          onClick={handleRestoreSelected}
          disabled={busy || selected.size === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
        >
          {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          Restaurar seleccionados ({selected.size})
        </button>
      </div>
      {progress && <p className="text-xs text-gray-500 mt-2">{progress}</p>}

      <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
        <label className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={busy || restorable.length === 0}
          />
          <span className="flex-1">Seleccionar todos ({restorable.length} con backup)</span>
          <span className="w-32 text-right">Último backup</span>
          {loadingList && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        </label>
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
          {rows.length === 0 && !loadingList && (
            <p className="px-3 py-3 text-xs text-gray-400">No hay proyectos.</p>
          )}
          {rows.map((r) => (
            <label
              key={r.id}
              className={`flex items-center gap-3 px-3 py-2 text-sm ${r.backup ? 'cursor-pointer hover:bg-gray-50' : 'opacity-60'}`}
            >
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                disabled={busy || !r.backup}
              />
              <span className="flex-1 truncate text-gray-800">{r.name}</span>
              <span className="w-32 text-right text-xs text-gray-500">
                {!r.folder_path ? 'Sin carpeta' : r.backup ? formatDate(r.backup.backup_date) : 'Sin backup'}
                {r.backup && r.backup.format < 2 && (
                  <span className="block text-[10px] text-amber-600">copia antigua (nube)</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Los backups se guardan en una subcarpeta _backup dentro de cada proyecto. Restaurar sustituye los datos
        actuales del proyecto por los del backup; antes se guarda una copia del estado actual en su carpeta.
      </p>
    </div>
  )
}
