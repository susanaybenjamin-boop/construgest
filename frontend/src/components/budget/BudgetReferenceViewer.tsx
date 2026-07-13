'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Search, X, Library, Building2, MousePointerClick, CheckCircle2, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type {
  BudgetItem, FullBudget, PricePickMessage, PriceSource,
  ReferenceCatalog, ReferenceProjectSummary,
} from '@/types'

interface Props {
  /** Si true, el visor actua como pagina completa en ventana independiente. */
  standalone?: boolean
  onClose?: () => void
  /** Callback alternativo al BroadcastChannel (p.ej. cuando el visor se renderiza en la misma ventana). */
  onPickPrice?: (msg: PricePickMessage) => void
  /** IDs preseleccionados (para persistir la seleccion entre aperturas). */
  initialProjectId?: string
  initialBudgetId?: string
  /** Texto que identifica el destino del precio en el editor — p.ej. la partida activa. */
  targetPartidaLabel?: string
}

// BroadcastChannel dedicado para los clics de precio. Independiente del
// canal 'budget-sync' que usa el resto del store.
const pickChannel: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('budget-price-pick')
    : null

export default function BudgetReferenceViewer({
  standalone = false,
  onClose,
  onPickPrice,
  initialProjectId,
  initialBudgetId,
  targetPartidaLabel,
}: Props) {
  const [catalog, setCatalog] = useState<ReferenceCatalog | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(true)

  const [projectId, setProjectId] = useState<string>(initialProjectId || '')
  const [budgetId, setBudgetId] = useState<string>(initialBudgetId || '')
  const [isLibrary, setIsLibrary] = useState(false)

  const [full, setFull] = useState<FullBudget | null>(null)
  const [loadingBudget, setLoadingBudget] = useState(false)
  const [search, setSearch] = useState('')
  const [lastPicked, setLastPicked] = useState<{ itemId: string; at: number } | null>(null)
  // Fila expandida para ver el concepto completo (solo una a la vez).
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Flash "copiado" para el boton que se acaba de pulsar.
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1200)
    } catch {
      // Fallback para contextos sin permiso de clipboard.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1200)
    }
  }

  useEffect(() => {
    api.get<ReferenceCatalog>('/budgets/for-reference')
      .then(res => {
        setCatalog(res.data)
        // Auto-seleccionar primer proyecto/presupuesto si no hay seleccion
        if (!initialProjectId && res.data.projects.length > 0) {
          const p = res.data.projects[0]
          setProjectId(p.id)
          if (p.budgets.length > 0) setBudgetId(p.budgets[0].id)
        }
      })
      .catch(() => setCatalog({ projects: [], library: { partida_count: 0 } }))
      .finally(() => setLoadingCatalog(false))
  }, [initialProjectId])

  useEffect(() => {
    if (!budgetId && !isLibrary) { setFull(null); return }
    setLoadingBudget(true)
    const url = isLibrary ? '/budgets/library-as-budget' : `/budgets/${budgetId}/full`
    api.get<FullBudget>(url)
      .then(res => setFull(res.data))
      .catch(() => setFull(null))
      .finally(() => setLoadingBudget(false))
  }, [budgetId, isLibrary])

  const projects = catalog?.projects || []
  const activeProject = useMemo<ReferenceProjectSummary | null>(
    () => projects.find(p => p.id === projectId) || null,
    [projects, projectId],
  )

  // Agrupar proyectos por origen: propios primero, luego cada sucursal en su
  // propio bloque. Permite identificar de un vistazo qué presupuesto consultas.
  const projectGroups = useMemo(() => {
    const own: ReferenceProjectSummary[] = []
    const branchByOrg = new Map<string, ReferenceProjectSummary[]>()
    for (const p of projects) {
      if (p.source === 'branch') {
        const key = p.branch_org_name || 'Sucursal'
        if (!branchByOrg.has(key)) branchByOrg.set(key, [])
        branchByOrg.get(key)!.push(p)
      } else {
        own.push(p)
      }
    }
    const groups: Array<{ label: string; items: ReferenceProjectSummary[] }> = []
    if (own.length > 0) groups.push({ label: 'Mis proyectos', items: own })
    for (const [orgName, items] of branchByOrg) {
      groups.push({ label: `Sucursal · ${orgName}`, items })
    }
    return groups
  }, [projects])

  const filteredRows = useMemo(() => {
    if (!full) return []
    const q = search.trim().toLowerCase()
    const rows: Array<{ chapter: { id: string; code: string; name: string }; item: BudgetItem }> = []
    for (const ch of full.chapters) {
      if (ch.chapter.is_legal_text) continue
      for (const it of ch.items) {
        if (!q
          || it.name?.toLowerCase().includes(q)
          || it.code?.toLowerCase().includes(q)
          || (it.description || '').toLowerCase().includes(q)
          || ch.chapter.name?.toLowerCase().includes(q)
        ) {
          rows.push({ chapter: { id: ch.chapter.id, code: ch.chapter.code, name: ch.chapter.name }, item: it })
        }
      }
    }
    return rows
  }, [full, search])

  const handlePickPrice = (item: BudgetItem, chapterName: string) => {
    if (!full) return
    const source: PriceSource = isLibrary
      ? {
          kind: 'library',
          library_partida_id: item.id,
          item_code: item.code,
          item_name: item.name,
          unit_price: item.unit_price,
          copied_at: new Date().toISOString(),
        }
      : {
          kind: 'budget',
          budget_id: full.budget.id,
          item_id: item.id,
          project_id: activeProject?.id,
          project_name: activeProject?.name,
          budget_name: full.budget.name,
          item_code: item.code,
          item_name: item.name,
          unit_price: item.unit_price,
          copied_at: new Date().toISOString(),
        }

    const msg: PricePickMessage = {
      type: 'budget-price-pick',
      unit_price: item.unit_price,
      source,
    }

    // Enviar al editor padre por canal. Si estamos en la misma ventana, el
    // callback se invoca directamente.
    if (onPickPrice) onPickPrice(msg)
    if (pickChannel) { try { pickChannel.postMessage(msg) } catch { /* ignore */ } }

    setLastPicked({ itemId: item.id, at: Date.now() })
    // Ocultar el flash tras 1.2s
    setTimeout(() => setLastPicked(prev => (prev?.itemId === item.id && Date.now() - (prev?.at || 0) >= 1200 ? null : prev)), 1300)
    void chapterName // used only for typing; no-op
  }

  return (
    <div className={`flex flex-col bg-white dark:bg-slate-900 ${standalone ? 'fixed inset-0' : 'w-full h-full'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30">
        <div className="flex items-center gap-2">
          <Library className="w-4 h-4 text-purple-600 dark:text-purple-300" />
          <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-100">Consultar precios de referencia</h2>
          <span className="text-[10px] font-medium px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-200 rounded">
            Click en un precio → se aplica en el editor
          </span>
          {targetPartidaLabel && (
            <span className="ml-2 text-[11px] text-gray-600 dark:text-slate-300 max-w-[260px] truncate" title={targetPartidaLabel}>
              Destino: <span className="font-medium">{targetPartidaLabel}</span>
            </span>
          )}
        </div>
        {(standalone || onClose) && (
          <button
            onClick={() => { onClose?.(); if (standalone) window.close() }}
            className="p-1.5 hover:bg-white/60 dark:hover:bg-slate-800 rounded"
            title={standalone ? 'Cerrar ventana' : 'Cerrar'}
          >
            <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
          </button>
        )}
      </div>

      {/* Selector bar */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setIsLibrary(true); setProjectId(''); setBudgetId('') }}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition border ${
            isLibrary
              ? 'bg-purple-100 dark:bg-purple-900/60 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-200 font-medium'
              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <Library className="w-3.5 h-3.5" />
          Biblioteca
          {catalog && <span className="text-[10px] text-gray-500 dark:text-slate-400">({catalog.library.partida_count})</span>}
        </button>

        <span className="text-gray-300 dark:text-slate-600">|</span>

        <Building2 className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
        <select
          value={isLibrary ? '' : projectId}
          onChange={(e) => {
            const id = e.target.value
            setIsLibrary(false)
            setProjectId(id)
            const p = projects.find(x => x.id === id)
            setBudgetId(p?.budgets[0]?.id || '')
          }}
          className="px-2 py-1 text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none max-w-[280px]"
        >
          <option value="">— Proyecto —</option>
          {projectGroups.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.client_name ? ` · ${p.client_name}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {activeProject?.source === 'branch' && activeProject.branch_org_name && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-200 rounded inline-flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {activeProject.branch_org_name}
          </span>
        )}

        {!isLibrary && activeProject && (
          <select
            value={budgetId}
            onChange={(e) => setBudgetId(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none max-w-[220px]"
          >
            {activeProject.budgets.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} · v{b.version}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en partidas, capítulos, descripción…"
            className="px-2 py-1 text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none min-w-[220px]"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loadingCatalog ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-slate-400">
            Cargando catálogo…
          </div>
        ) : projects.length === 0 && !catalog?.library.partida_count ? (
          <div className="flex flex-col items-center justify-center h-40 text-sm text-gray-500 dark:text-slate-400 gap-1">
            <p>No hay presupuestos ni biblioteca disponibles.</p>
          </div>
        ) : loadingBudget ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-slate-400">
            Cargando…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-slate-400">
            {search ? 'Sin resultados para la búsqueda' : 'Selecciona un presupuesto o la biblioteca'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">
                <th className="text-left px-3 py-2 font-medium w-[28px]"></th>
                <th className="text-left px-3 py-2 font-medium w-[70px]">Código</th>
                <th className="text-left px-3 py-2 font-medium">Descripción</th>
                <th className="text-left px-3 py-2 font-medium w-[140px]">Capítulo</th>
                <th className="text-center px-3 py-2 font-medium w-[50px]">Ud.</th>
                <th className="text-right px-3 py-2 font-medium w-[120px]">P. Unitario</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ chapter, item }) => {
                const isJustPicked = lastPicked?.itemId === item.id
                const isExpanded = expandedId === item.id
                const conceptText = item.description
                  ? `${item.name}\n\n${item.description}`
                  : item.name
                return (
                  <Fragment key={`${chapter.id}-${item.id}`}>
                    <tr
                      className={`border-b border-gray-100 dark:border-slate-800 hover:bg-purple-50/40 dark:hover:bg-purple-950/30 transition ${
                        isJustPicked ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''
                      } ${isExpanded ? 'bg-purple-50/60 dark:bg-purple-950/40' : ''}`}
                    >
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => setExpandedId(prev => prev === item.id ? null : item.id)}
                          className="p-0.5 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50 text-gray-400 dark:text-slate-500"
                          title={isExpanded ? 'Colapsar' : 'Expandir para ver y copiar el concepto'}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 font-mono">{item.code}</td>
                      <td className="px-3 py-1.5 cursor-pointer" onClick={() => setExpandedId(prev => prev === item.id ? null : item.id)}>
                        <div className="text-gray-900 dark:text-slate-100 leading-snug">{item.name}</div>
                        {item.description && !isExpanded && (
                          <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate max-w-[560px]" title={item.description}>
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400">
                        <span className="font-medium text-gray-600 dark:text-slate-300">{chapter.code}</span> {chapter.name}
                      </td>
                      <td className="px-3 py-1.5 text-center text-xs text-gray-500 dark:text-slate-400">{item.unit}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => handlePickPrice(item, chapter.name)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded border transition font-medium ${
                            isJustPicked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100 hover:bg-purple-100 dark:hover:bg-purple-900/50 hover:border-purple-400 dark:hover:border-purple-500 hover:text-purple-800 dark:hover:text-purple-200'
                          }`}
                          title="Aplicar este precio a la partida activa en el editor"
                        >
                          {isJustPicked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <MousePointerClick className="w-3.5 h-3.5" />}
                          {formatCurrency(item.unit_price)}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-purple-50/40 dark:bg-purple-950/30 border-b border-gray-100 dark:border-slate-800">
                        <td></td>
                        <td colSpan={5} className="px-3 py-3">
                          <div className="space-y-3">
                            {/* Nombre */}
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] uppercase tracking-wide font-medium text-gray-500 dark:text-slate-400">Nombre</span>
                                <button
                                  onClick={() => copyToClipboard(item.name, `name-${item.id}`)}
                                  className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
                                  title="Copiar nombre al portapapeles (luego Ctrl+V en el editor)"
                                >
                                  {copiedKey === `name-${item.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                  {copiedKey === `name-${item.id}` ? 'Copiado' : 'Copiar'}
                                </button>
                              </div>
                              <div className="text-sm text-gray-900 dark:text-slate-100 select-text whitespace-pre-wrap bg-white dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 rounded px-2 py-1.5">
                                {item.name}
                              </div>
                            </div>
                            {/* Descripcion */}
                            {item.description && (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] uppercase tracking-wide font-medium text-gray-500 dark:text-slate-400">Descripción</span>
                                  <button
                                    onClick={() => copyToClipboard(item.description || '', `desc-${item.id}`)}
                                    className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
                                    title="Copiar descripción al portapapeles"
                                  >
                                    {copiedKey === `desc-${item.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                    {copiedKey === `desc-${item.id}` ? 'Copiado' : 'Copiar'}
                                  </button>
                                </div>
                                <div className="text-sm text-gray-700 dark:text-slate-200 select-text whitespace-pre-wrap bg-white dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 rounded px-2 py-1.5 leading-relaxed">
                                  {item.description}
                                </div>
                              </div>
                            )}
                            {/* Concepto completo */}
                            <div className="flex items-center gap-2 pt-1 border-t border-purple-200/60 dark:border-purple-800/60">
                              <span className="text-[11px] text-gray-500 dark:text-slate-400">Tip: selecciona texto arriba y usa Ctrl+C, luego Ctrl+V en el editor.</span>
                              <button
                                onClick={() => copyToClipboard(conceptText, `all-${item.id}`)}
                                className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium"
                                title="Copia nombre + descripción al portapapeles"
                              >
                                {copiedKey === `all-${item.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedKey === `all-${item.id}` ? 'Copiado todo' : 'Copiar concepto'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 px-4 py-1.5 text-[11px] text-gray-500 dark:text-slate-400 flex items-center justify-between gap-3">
        <span>
          {full ? `${filteredRows.length} partida${filteredRows.length === 1 ? '' : 's'}` : '—'}
        </span>
        <span className="flex items-center gap-3">
          <span>
            Expande <ChevronRight className="inline w-3 h-3" /> para copiar el concepto (<kbd className="px-1 py-0.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 font-mono">Ctrl+C</kbd> / <kbd className="px-1 py-0.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 font-mono">Ctrl+V</kbd>)
          </span>
          <span>
            · Deshaz precios con <kbd className="px-1 py-0.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 font-mono">Ctrl+Z</kbd>
          </span>
        </span>
      </div>
    </div>
  )
}
