'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { X, Loader2, FolderOpen, FileText, ClipboardList, Paperclip, HardHat, Receipt, Check } from 'lucide-react'
import type { MailboxAttachmentRef, ProjectInfo } from '@/types'

type Tab = 'budget' | 'certification' | 'project_file' | 'work_log' | 'expense'

interface Props {
  onClose: () => void
  onConfirm: (refs: MailboxAttachmentRef[]) => void
}

const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'budget', label: 'Presupuestos', icon: FileText },
  { key: 'certification', label: 'Certificaciones', icon: ClipboardList },
  { key: 'project_file', label: 'Archivos', icon: Paperclip },
  { key: 'work_log', label: 'Partes', icon: HardHat },
  { key: 'expense', label: 'Gastos', icon: Receipt },
]

type Row = { id: string; label: string; sub?: string }

const formatDate = (s?: string | null) => {
  if (!s) return ''
  try { return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return '' }
}

export default function AttachFromProjectModal({ onClose, onConfirm }: Props) {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectId, setProjectId] = useState<string>('')
  const [tab, setTab] = useState<Tab>('budget')
  const [items, setItems] = useState<Row[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [selected, setSelected] = useState<Record<string, MailboxAttachmentRef>>({})

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<ProjectInfo[]>('/projects')
        const own = (data || []).filter(p => !(p as ProjectInfo & { source?: string }).source)
        setProjects(own)
        if (own.length > 0) setProjectId(own[0].id)
      } finally {
        setLoadingProjects(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!projectId) { setItems([]); return }
    setLoadingItems(true)
    ;(async () => {
      try {
        let rows: Row[] = []
        if (tab === 'budget') {
          const { data } = await api.get(`/budgets/project/${projectId}`)
          rows = (data || []).map((b: { id: string; name?: string; version?: number | null }) => ({
            id: b.id,
            label: b.name || `Presupuesto v${b.version ?? '?'}`,
            sub: b.version ? `Versión ${b.version}` : undefined,
          }))
        } else if (tab === 'certification') {
          const { data } = await api.get(`/certifications/project/${projectId}/overview`)
          rows = (data || []).map((c: { id: string; number?: number | null; name?: string; period_end?: string | null }) => ({
            id: c.id,
            label: c.name || `Certificación nº ${c.number ?? '?'}`,
            sub: c.period_end ? `Hasta ${formatDate(c.period_end)}` : undefined,
          }))
        } else if (tab === 'project_file') {
          const { data } = await api.get(`/projects/${projectId}/files`)
          rows = (data || []).map((f: { id: string; original_name?: string; file_type?: string; file_size?: number | null }) => ({
            id: f.id,
            label: f.original_name || 'Archivo',
            sub: [f.file_type, f.file_size ? `${Math.round(f.file_size / 1024)} KB` : null].filter(Boolean).join(' · '),
          }))
        } else if (tab === 'work_log') {
          const { data } = await api.get(`/work-logs/project/${projectId}`)
          rows = (data || []).map((w: { id: string; date?: string; description?: string | null }) => ({
            id: w.id,
            label: w.description || `Parte de ${formatDate(w.date)}`,
            sub: formatDate(w.date),
          }))
        } else if (tab === 'expense') {
          const { data } = await api.get(`/expenses/project/${projectId}`)
          rows = (data || []).map((e: { id: string; concept?: string | null; amount?: number | null; date?: string }) => ({
            id: e.id,
            label: e.concept || 'Gasto',
            sub: [formatDate(e.date), e.amount != null ? `${Number(e.amount).toFixed(2)} €` : null].filter(Boolean).join(' · '),
          }))
        }
        setItems(rows)
      } catch {
        setItems([])
      } finally {
        setLoadingItems(false)
      }
    })()
  }, [projectId, tab])

  const toggle = (row: Row) => {
    setSelected(prev => {
      const next = { ...prev }
      if (next[row.id]) delete next[row.id]
      else next[row.id] = { kind: tab, ref_id: row.id, label: row.label }
      return next
    })
  }

  const selectedList = useMemo(() => Object.values(selected), [selected])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Adjuntar del proyecto</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Proyecto</label>
            {loadingProjects ? (
              <div className="text-sm text-gray-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
              </div>
            ) : projects.length === 0 ? (
              <div className="text-sm text-gray-400 flex items-center gap-2">
                <FolderOpen className="w-4 h-4" /> No hay proyectos disponibles
              </div>
            ) : (
              <select
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setSelected({}) }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                  tab === key
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loadingItems ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin elementos</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map(row => {
                const isSel = !!selected[row.id]
                return (
                  <li key={row.id}>
                    <button
                      onClick={() => toggle(row)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg transition ${
                        isSel ? 'bg-purple-50' : ''
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                        isSel ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                      }`}>
                        {isSel && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{row.label}</p>
                        {row.sub && <p className="text-xs text-gray-500 truncate">{row.sub}</p>}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {selectedList.length > 0 ? `${selectedList.length} seleccionado(s)` : 'Ninguno seleccionado'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(selectedList)}
              disabled={selectedList.length === 0}
              className="px-5 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 transition disabled:opacity-50"
            >
              Adjuntar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
