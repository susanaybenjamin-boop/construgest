'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, FileText, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { DecimalInput } from '@/components/ui/DecimalInput'
import { useCertificationStore } from '@/stores/certificationStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Budget, CertifiableWorkLog } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  budgets: Budget[]
  preselection: CertifiableWorkLog[]
  onCreated: (certId: string) => void
  title?: string
}

type QtyMap = Record<string, number>

const monthLabel = () => {
  const now = new Date()
  return now.toLocaleString('es', { month: 'long', year: 'numeric' })
}

export default function CertifyFromWorkLogsModal({
  isOpen,
  onClose,
  budgets,
  preselection,
  onCreated,
  title,
}: Props) {
  const { createFromWorkLogs } = useCertificationStore()
  const { addToast } = useNotificationStore()

  const [qtyByLink, setQtyByLink] = useState<QtyMap>({})
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('')
  const [certName, setCertName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const defaults: QtyMap = {}
    preselection.forEach(({ items }) => items.forEach(it => { defaults[it.work_log_budget_link_id] = it.residual }))
    setQtyByLink(defaults)
    setExpandedLogs(new Set(preselection.map(w => w.work_log.id)))
    setCertName(`Certificación ${monthLabel().charAt(0).toUpperCase() + monthLabel().slice(1)}`)

    const budgetIds = Array.from(new Set(preselection.flatMap(w => w.items.map(i => i.budget_id))))
    if (budgetIds.length === 1) {
      setSelectedBudgetId(budgetIds[0])
    } else if (budgets.length > 0) {
      setSelectedBudgetId(budgets[0].id)
    }
  }, [isOpen, preselection, budgets])

  const filteredWorkLogs = useMemo(() => {
    if (!selectedBudgetId) return preselection
    return preselection
      .map(w => ({
        ...w,
        items: w.items.filter(i => i.budget_id === selectedBudgetId),
      }))
      .filter(w => w.items.length > 0)
  }, [preselection, selectedBudgetId])

  const totals = useMemo(() => {
    let totalAmount = 0
    let validItems = 0
    let invalidCount = 0
    for (const w of filteredWorkLogs) {
      for (const it of w.items) {
        const q = qtyByLink[it.work_log_budget_link_id] ?? 0
        if (q > it.residual + 1e-6) invalidCount++
        if (q > 0) {
          totalAmount += q * it.unit_price
          validItems++
        }
      }
    }
    return { totalAmount, validItems, invalidCount }
  }, [filteredWorkLogs, qtyByLink])

  const toggleLog = (id: string) => {
    setExpandedLogs(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleConfirm = async () => {
    if (!selectedBudgetId || !certName.trim()) return
    if (totals.invalidCount > 0) return
    if (totals.validItems === 0) return

    const selections: Array<{ work_log_budget_link_id: string; budget_item_id: string; consumed_quantity: number }> = []
    for (const w of filteredWorkLogs) {
      for (const it of w.items) {
        const q = qtyByLink[it.work_log_budget_link_id] ?? 0
        if (q > 0) {
          selections.push({
            work_log_budget_link_id: it.work_log_budget_link_id,
            budget_item_id: it.budget_item_id,
            consumed_quantity: q,
          })
        }
      }
    }

    setSubmitting(true)
    try {
      const cert = await createFromWorkLogs({
        budget_id: selectedBudgetId,
        name: certName.trim(),
        selections,
      })
      addToast('success', `Certificación "${certName.trim()}" creada`)
      onCreated(cert.id)
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Error al crear la certificación'
      addToast('error', msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const budgetIdsInSelection = Array.from(new Set(preselection.flatMap(w => w.items.map(i => i.budget_id))))
  const budgetsToShow = budgets.filter(b => budgetIdsInSelection.includes(b.id))

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {title || 'Certificar partidas desde partes de obra'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Budget selector + name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {budgetsToShow.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Presupuesto</label>
                <select
                  value={selectedBudgetId}
                  onChange={(e) => setSelectedBudgetId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 outline-none"
                >
                  {budgetsToShow.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div className={budgetsToShow.length > 1 ? '' : 'md:col-span-2'}>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre de la certificación</label>
              <input
                value={certName}
                onChange={(e) => setCertName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Certificación mayo 2026"
              />
            </div>
          </div>

          {budgetIdsInSelection.length > 1 && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Hay partidas de {budgetIdsInSelection.length} presupuestos distintos. Selecciona el presupuesto para certificar sus partidas (el resto quedan fuera de esta certificación).
              </span>
            </div>
          )}

          {/* Work logs list */}
          {filteredWorkLogs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No hay partidas certificables en este presupuesto.
            </div>
          ) : (
            filteredWorkLogs.map(({ work_log, items }) => {
              const isExpanded = expandedLogs.has(work_log.id)
              const logTotal = items.reduce((s, it) => s + (qtyByLink[it.work_log_budget_link_id] ?? 0) * it.unit_price, 0)
              return (
                <div key={work_log.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
                    onClick={() => toggleLog(work_log.id)}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        {formatDate(work_log.date)}
                      </span>
                      {work_log.description && (
                        <span className="text-xs text-gray-500 truncate max-w-md">{work_log.description}</span>
                      )}
                      <span className="text-xs text-gray-400">({items.length})</span>
                    </div>
                    {logTotal > 0 && (
                      <span className="text-sm font-medium text-green-600">{formatCurrency(logTotal)}</span>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="divide-y divide-gray-100">
                      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50/50 text-xs font-medium text-gray-500 uppercase">
                        <div className="col-span-5">Partida</div>
                        <div className="col-span-1 text-center">Ud.</div>
                        <div className="col-span-1 text-right">Ejec.</div>
                        <div className="col-span-1 text-right">Certif.</div>
                        <div className="col-span-1 text-right">Rest.</div>
                        <div className="col-span-2 text-center">Certificar</div>
                        <div className="col-span-1 text-right">Importe</div>
                      </div>
                      {items.map(it => {
                        const q = qtyByLink[it.work_log_budget_link_id] ?? 0
                        const invalid = q > it.residual + 1e-6
                        const amount = q * it.unit_price
                        return (
                          <div key={it.work_log_budget_link_id} className="grid grid-cols-12 gap-2 px-4 py-2 items-center text-sm hover:bg-gray-50">
                            <div className="col-span-5 truncate">
                              <span className="text-gray-400 text-xs mr-1">{it.code}</span>
                              <span className="text-gray-700">{it.name}</span>
                            </div>
                            <div className="col-span-1 text-center text-gray-500 text-xs">{it.unit}</div>
                            <div className="col-span-1 text-right text-gray-600">{it.executed_quantity.toFixed(2)}</div>
                            <div className="col-span-1 text-right text-blue-600 text-xs">
                              {it.already_certified > 0 ? it.already_certified.toFixed(2) : '—'}
                            </div>
                            <div className="col-span-1 text-right text-gray-600 font-medium">{it.residual.toFixed(2)}</div>
                            <div className="col-span-2 text-center">
                              <DecimalInput
                                value={q}
                                onChange={(v) => setQtyByLink(prev => ({ ...prev, [it.work_log_budget_link_id]: v }))}
                                className={`w-full text-center px-2 py-1 text-sm rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                  invalid ? 'border-red-400 bg-red-50' : 'border-gray-300'
                                }`}
                                placeholder="0"
                              />
                            </div>
                            <div className="col-span-1 text-right font-medium text-gray-900">
                              {amount > 0 ? formatCurrency(amount) : '—'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-sm">
            <span className="text-gray-500">Total a certificar: </span>
            <span className="font-bold text-green-600 text-base">{formatCurrency(totals.totalAmount)}</span>
            <span className="ml-2 text-xs text-gray-400">({totals.validItems} partidas)</span>
            {totals.invalidCount > 0 && (
              <span className="ml-3 text-xs text-red-500">
                {totals.invalidCount} con cantidad superior al residual
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || totals.invalidCount > 0 || totals.validItems === 0 || !certName.trim() || !selectedBudgetId}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Crear certificación
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
