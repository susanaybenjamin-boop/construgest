'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSettingsStore } from '@/stores/settingsStore'
import api from '@/lib/api'
import type { Budget, FullBudget, Certification, CertificationSummary, ProjectInfo, CertifiableWorkLog, CertificationItemWorkLogLink } from '@/types'
import {
  Award, Plus, Loader2, Clock, CheckCircle2, Lock,
  Send, ChevronDown, ChevronRight, Trash2, FileText, Eye,
  AlertTriangle, Receipt, X, ClipboardList, Check, Pencil, Link as LinkIcon, Save
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DecimalInput } from '@/components/ui/DecimalInput'
import CertificationPdfPreviewModal from '@/components/certifications/CertificationPdfPreviewModal'
import CertifyFromWorkLogsModal from '@/components/certifications/CertifyFromWorkLogsModal'

// Map of budget_item_id → { quantity: number, amount: number }
type CertifiedTotalsMap = Record<string, { quantity: number; amount: number }>

export default function CertificationsPage() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = params.id as string
  const { addToast } = useNotificationStore()
  const { company } = useSettingsStore()

  const [activeTab, setActiveTab] = useState<'workspace' | 'list' | 'from-work-logs'>('list')
  const [certifiableLogs, setCertifiableLogs] = useState<CertifiableWorkLog[]>([])
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set())
  const [showFromWorkLogsModal, setShowFromWorkLogsModal] = useState(false)
  const [modalPreselection, setModalPreselection] = useState<CertifiableWorkLog[]>([])
  const [pdfPreviewCertId, setPdfPreviewCertId] = useState<string | null>(null)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('')
  const [fullBudget, setFullBudget] = useState<FullBudget | null>(null)
  const [certifications, setCertifications] = useState<Certification[]>([])
  const [expandedCert, setExpandedCert] = useState<string | null>(null)
  const [certSummary, setCertSummary] = useState<CertificationSummary | null>(null)
  const [certDetailExpandedChapters, setCertDetailExpandedChapters] = useState<Set<string>>(new Set())
  const [certDetailSearch, setCertDetailSearch] = useState('')
  const [certDetailOnlyCurrent, setCertDetailOnlyCurrent] = useState(true)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemDraftQty, setEditItemDraftQty] = useState<number>(0)
  const [savingItem, setSavingItem] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Certified totals for workspace remaining quantities
  const [certifiedTotals, setCertifiedTotals] = useState<CertifiedTotalsMap>({})

  // Workspace state - quantities to certify per item
  const [workspaceQtys, setWorkspaceQtys] = useState<Record<string, number>>({})
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [certName, setCertName] = useState('')

  // Finalize modal
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [finalizeCertId, setFinalizeCertId] = useState<string | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)

  useEffect(() => { loadData() }, [projectId])

  // Reload certifiedTotals when switching budgets
  useEffect(() => {
    if (selectedBudgetId) loadCertifiedTotals(selectedBudgetId)
  }, [selectedBudgetId])

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: budgetsList } = await api.get<Budget[]>(`/budgets/project/${projectId}`)
      setBudgets(budgetsList)
      if (budgetsList.length > 0) {
        setSelectedBudgetId(budgetsList[0].id)
        const [certsRes, fullRes, totalsRes] = await Promise.allSettled([
          api.get<Certification[]>(`/certifications/budget/${budgetsList[0].id}`),
          api.get<FullBudget>(`/budgets/${budgetsList[0].id}/full`),
          api.get<CertifiedTotalsMap>(`/certifications/budget/${budgetsList[0].id}/certified-totals`),
        ])
        if (certsRes.status === 'fulfilled') setCertifications(certsRes.value.data)
        if (fullRes.status === 'fulfilled') {
          setFullBudget(fullRes.value.data)
          // Expand all chapters by default
          const ids = new Set(fullRes.value.data.chapters.map(c => c.chapter.id))
          setExpandedChapters(ids)
        }
        if (totalsRes.status === 'fulfilled') setCertifiedTotals(totalsRes.value.data)
      }
    } finally { setLoading(false) }
  }

  const loadCertifiableLogs = async () => {
    try {
      const { data } = await api.get<CertifiableWorkLog[]>(`/work-logs/project/${projectId}/certifiable`)
      setCertifiableLogs(data)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (activeTab === 'from-work-logs') loadCertifiableLogs()
  }, [activeTab, projectId])

  const toggleLinkSelection = (linkId: string) => {
    setSelectedLinkIds(prev => {
      const n = new Set(prev)
      n.has(linkId) ? n.delete(linkId) : n.add(linkId)
      return n
    })
  }

  const toggleLogSelection = (logId: string, allSelected: boolean) => {
    const log = certifiableLogs.find(l => l.work_log.id === logId)
    if (!log) return
    setSelectedLinkIds(prev => {
      const n = new Set(prev)
      for (const it of log.items) {
        if (allSelected) n.delete(it.work_log_budget_link_id)
        else n.add(it.work_log_budget_link_id)
      }
      return n
    })
  }

  const openFromWorkLogsModal = () => {
    const pre: CertifiableWorkLog[] = certifiableLogs
      .map(w => ({
        work_log: w.work_log,
        items: w.items.filter(it => selectedLinkIds.has(it.work_log_budget_link_id)),
      }))
      .filter(w => w.items.length > 0)
    if (pre.length === 0) return
    setModalPreselection(pre)
    setShowFromWorkLogsModal(true)
  }

  const fromWorkLogsTotals = useMemo(() => {
    let total = 0
    let partes = 0
    let partidas = 0
    for (const w of certifiableLogs) {
      let logHasSelection = false
      for (const it of w.items) {
        if (selectedLinkIds.has(it.work_log_budget_link_id)) {
          total += it.residual * it.unit_price
          partidas++
          logHasSelection = true
        }
      }
      if (logHasSelection) partes++
    }
    return { total, partes, partidas }
  }, [certifiableLogs, selectedLinkIds])

  const loadCertifiedTotals = async (budgetId: string) => {
    try {
      const { data } = await api.get<CertifiedTotalsMap>(`/certifications/budget/${budgetId}/certified-totals`)
      setCertifiedTotals(data)
    } catch { /* ignore */ }
  }

  const loadCertSummary = async (certId: string) => {
    if (expandedCert === certId) {
      setExpandedCert(null)
      setCertSummary(null)
      return
    }
    try {
      const { data } = await api.get<CertificationSummary>(`/certifications/${certId}/summary`)
      setCertSummary(data)
      setExpandedCert(certId)
      // Auto-expand chapters: all if ≤2, none if more (the user can open the ones they care about)
      const chapterIds = new Set<string>()
      const seen = new Set<string>()
      for (const it of data.items) {
        const chId = it.chapter_id || '__nochapter__'
        if (!seen.has(chId)) {
          seen.add(chId)
          chapterIds.add(chId)
        }
      }
      setCertDetailExpandedChapters(chapterIds.size <= 2 ? chapterIds : new Set())
      setCertDetailSearch('')
      setCertDetailOnlyCurrent(true)
    } catch { /* ignore */ }
  }

  const toggleCertDetailChapter = (id: string) => {
    setCertDetailExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const startEditItem = (item: { id: string; certified_quantity: number }) => {
    setEditingItemId(item.id)
    setEditItemDraftQty(item.certified_quantity)
  }

  const cancelEditItem = () => {
    setEditingItemId(null)
    setEditItemDraftQty(0)
  }

  const saveEditItem = async (cert: Certification, item: { id: string; certified_quantity: number; work_log_links?: CertificationItemWorkLogLink[] }) => {
    if (savingItem) return
    if (!Number.isFinite(editItemDraftQty) || editItemDraftQty < 0) return
    setSavingItem(true)
    try {
      await api.put(`/certifications/${cert.id}/items/${item.id}`, {
        certified_quantity: editItemDraftQty,
      })
      addToast('success', 'Partida actualizada')
      const { data } = await api.get<CertificationSummary>(`/certifications/${cert.id}/summary`)
      setCertSummary(data)
      if (selectedBudgetId) loadCertifiedTotals(selectedBudgetId)
      setEditingItemId(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string; max?: number; missing?: number } } }
      const data = e.response?.data
      if (data?.error === 'exceeds_budget_total') {
        addToast('error', data.message || `Excede el total presupuestado (máx. ${data.max?.toFixed(2)})`)
      } else if (data?.error === 'no_residual_in_linked_partes') {
        addToast('error', data.message || `Sin residuo en partes vinculados (faltan ${data.missing?.toFixed(2)})`)
      } else if (data?.error === 'only_draft_editable') {
        addToast('error', 'Solo se pueden editar partidas en certificaciones en borrador')
      } else {
        addToast('error', 'Error al actualizar la partida')
      }
    } finally {
      setSavingItem(false)
    }
  }

  const deleteCertItem = async (cert: Certification, itemId: string) => {
    if (!confirm('¿Quitar esta partida de la certificación? Si tenía partes vinculados, se liberarán los residuos.')) return
    setSavingItem(true)
    try {
      await api.put(`/certifications/${cert.id}/items/${itemId}`, { certified_quantity: 0 })
      addToast('success', 'Partida eliminada de la certificación')
      const { data } = await api.get<CertificationSummary>(`/certifications/${cert.id}/summary`)
      setCertSummary(data)
      if (selectedBudgetId) loadCertifiedTotals(selectedBudgetId)
      setEditingItemId(null)
    } catch {
      addToast('error', 'Error al eliminar la partida')
    } finally {
      setSavingItem(false)
    }
  }

  const createCertification = async () => {
    if (!selectedBudgetId || !certName.trim()) return
    setCreating(true)
    try {
      // Build items from workspace quantities
      const items = Object.entries(workspaceQtys)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ budget_item_id: itemId, certified_quantity: qty }))

      await api.post('/certifications', {
        budget_id: selectedBudgetId,
        name: certName.trim(),
        items,
      })
      addToast('success', `Certificación "${certName}" creada`)
      setCertName('')
      setWorkspaceQtys({})
      setShowCreateModal(false)
      loadData()
      setActiveTab('list')
    } catch {
      addToast('error', 'Error al crear la certificación')
    } finally { setCreating(false) }
  }

  const updateCertStatus = async (certId: string, status: string) => {
    if (statusChanging) return
    setStatusChanging(true)
    try {
      await api.put(`/certifications/${certId}/status`, { status })
      addToast('success', `Certificación actualizada a ${status}`)
      loadData()
    } catch {
      addToast('error', 'Error al actualizar el estado')
    } finally {
      setStatusChanging(false)
    }
  }

  const openFinalizeModal = (certId: string) => {
    setFinalizeCertId(certId)
    setInvoiceNumber('')
    setShowFinalizeModal(true)
  }

  const finalizeCert = async () => {
    if (!finalizeCertId || !invoiceNumber.trim()) return
    setFinalizing(true)
    try {
      await api.put(`/certifications/${finalizeCertId}/status`, {
        status: 'finalized',
        invoice_number: invoiceNumber.trim(),
      })
      addToast('success', 'Certificación finalizada correctamente')
      setShowFinalizeModal(false)
      setFinalizeCertId(null)
      setInvoiceNumber('')
      loadData()
    } catch {
      addToast('error', 'Error al finalizar la certificación')
    } finally { setFinalizing(false) }
  }

  const deleteCert = async (certId: string) => {
    if (!confirm('¿Eliminar esta certificación?')) return
    try {
      await api.delete(`/certifications/${certId}`)
      addToast('success', 'Certificación eliminada')
      loadData()
    } catch {
      addToast('error', 'Error al eliminar')
    }
  }

  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const certifyFullChapter = (chapterId: string) => {
    if (!fullBudget) return
    const ch = fullBudget.chapters.find(c => c.chapter.id === chapterId)
    if (!ch) return
    const newQtys = { ...workspaceQtys }
    ch.items.forEach(item => {
      // Las auxiliares no se autocertifican en masa (el usuario las mete a mano)
      if (item.is_auxiliary) return
      const alreadyCertified = certifiedTotals[item.id]?.quantity || 0
      const remaining = Math.max(0, item.quantity - alreadyCertified)
      newQtys[item.id] = remaining
    })
    setWorkspaceQtys(newQtys)
  }

  const totalToCertify = Object.entries(workspaceQtys).reduce((sum, [itemId, qty]) => {
    if (!fullBudget || qty <= 0) return sum
    for (const ch of fullBudget.chapters) {
      const item = ch.items.find(i => i.id === itemId)
      if (item) return sum + qty * item.unit_price
    }
    return sum
  }, 0)

  // Coste real estimado para lo que está a punto de certificarse (suma qty × cost_price)
  const totalCostToCertify = Object.entries(workspaceQtys).reduce((sum, [itemId, qty]) => {
    if (!fullBudget || qty <= 0) return sum
    for (const ch of fullBudget.chapters) {
      const item = ch.items.find(i => i.id === itemId)
      if (item) return sum + qty * (item.cost_price || 0)
    }
    return sum
  }, 0)
  const marginToCertify = totalToCertify - totalCostToCertify
  const marginPctToCertify = totalToCertify > 0 ? (marginToCertify / totalToCertify) * 100 : 0

  if (loading) return (
    <div className="pb-16">
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <div className="h-7 w-44 bg-gray-200 rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-40 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-32 bg-blue-100 dark:bg-blue-900/40 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-8 w-28 rounded-lg animate-pulse ${i === 0 ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100'}`} />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`px-3 py-3 border-b border-gray-100 ${i % 3 === 0 ? 'bg-blue-50/30 dark:bg-blue-950/40' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
              <div className={`h-4 rounded animate-pulse ${i % 3 === 0 ? 'w-48 bg-blue-100 dark:bg-blue-900/40' : 'w-56 bg-gray-100'}`} />
              <div className="flex-1" />
              <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string; label: string }> = {
    draft: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100', label: 'Borrador' },
    submitted: { icon: Send, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40', label: 'Enviada' },
    approved: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/40', label: 'Aprobada' },
    finalized: { icon: Lock, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40', label: 'Finalizada' },
  }

  return (
    <div>
      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t('nav.certifications')}</h1>
          {budgets.length > 0 && (
            <div className="flex gap-2">
              <select
                value={selectedBudgetId}
                onChange={(e) => setSelectedBudgetId(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 outline-none cursor-pointer"
              >
                {budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {budgets.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Necesitas crear un presupuesto primero</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
            <button onClick={() => setActiveTab('workspace')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'workspace' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 active:bg-gray-200'}`}>
              Espacio de trabajo
            </button>
            <button onClick={() => setActiveTab('from-work-logs')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'from-work-logs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 active:bg-gray-200'}`}>
              Desde partes
            </button>
            <button onClick={() => setActiveTab('list')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 active:bg-gray-200'}`}>
              Certificaciones ({certifications.length})
            </button>
          </div>

          {/* ─── Workspace Tab ─── */}
          {activeTab === 'workspace' && fullBudget && (
            <div className="space-y-3">
              {fullBudget.chapters.map(({ chapter, items }) => {
                const isExpanded = expandedChapters.has(chapter.id)
                const chapterCertTotal = items.reduce((s, item) => s + (workspaceQtys[item.id] || 0) * item.unit_price, 0)

                return (
                  <div key={chapter.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Chapter header */}
                    <div
                      className="flex items-center justify-between px-5 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
                      onClick={() => toggleChapter(chapter.id)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        <span className="text-sm font-semibold text-gray-700">{chapter.code} - {chapter.name}</span>
                        <span className="text-xs text-gray-400">({items.length} partidas)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {chapterCertTotal > 0 && (
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">{formatCurrency(chapterCertTotal)}</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); certifyFullChapter(chapter.id) }}
                          className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 active:bg-blue-200 transition"
                        >
                          Certificar todo
                        </button>
                      </div>
                    </div>

                    {/* Items table */}
                    {isExpanded && (
                      <div className="divide-y divide-gray-100">
                        <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-gray-50/50 text-xs font-medium text-gray-500 uppercase">
                          <div className="col-span-4">Partida</div>
                          <div className="col-span-1 text-center">Ud.</div>
                          <div className="col-span-1 text-right">Presup.</div>
                          <div className="col-span-1 text-right">Certif.</div>
                          <div className="col-span-2 text-right">Restante</div>
                          <div className="col-span-2 text-center">Certificar</div>
                          <div className="col-span-1 text-right">Importe</div>
                        </div>
                        {items.map((item) => {
                          const qty = workspaceQtys[item.id] || 0
                          const amount = qty * item.unit_price
                          const alreadyCertified = certifiedTotals[item.id]?.quantity || 0
                          const isAux = !!item.is_auxiliary
                          const remaining = isAux ? Infinity : Math.max(0, item.quantity - alreadyCertified)
                          const isFullyCertified = !isAux && remaining <= 0.001

                          return (
                            <div
                              key={item.id}
                              className={`grid grid-cols-12 gap-2 px-5 py-2.5 items-center text-sm transition ${
                                isFullyCertified ? 'bg-green-50/50 dark:bg-green-950/40 opacity-60' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="col-span-4 truncate">
                                <span className="text-gray-400 text-xs mr-1">{item.code}</span>
                                <span className={`${isFullyCertified ? 'text-green-700 dark:text-green-300' : 'text-gray-700'}`}>{item.name}</span>
                                {isAux && (
                                  <span className="ml-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full" title="Partida auxiliar · sin tope">
                                    AUX ∞
                                  </span>
                                )}
                                {isFullyCertified && (
                                  <span className="ml-2 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded-full">
                                    Certificado
                                  </span>
                                )}
                              </div>
                              <div className="col-span-1 text-center text-gray-500 text-xs">{item.unit}</div>
                              <div className="col-span-1 text-right text-gray-600">{item.quantity.toFixed(2)}</div>
                              <div className="col-span-1 text-right text-blue-600 dark:text-blue-400 text-xs font-medium">
                                {alreadyCertified > 0 ? alreadyCertified.toFixed(2) : '—'}
                              </div>
                              <div className={`col-span-2 text-right font-medium ${isAux ? 'text-amber-600 dark:text-amber-400' : isFullyCertified ? 'text-green-600 dark:text-green-400' : 'text-gray-600'}`}>
                                {isAux ? '∞' : remaining.toFixed(2)}
                              </div>
                              <div className="col-span-2 text-center">
                                <DecimalInput
                                  min="0"
                                  value={qty}
                                  onChange={(v) => setWorkspaceQtys({ ...workspaceQtys, [item.id]: v })}
                                  disabled={isFullyCertified}
                                  className={`w-full text-center px-2 py-1 text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                                    isFullyCertified ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-300'
                                  }`}
                                  placeholder={isFullyCertified ? '—' : (isAux ? 'horas reales' : '0')}
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
              })}

              {/* Floating summary bar */}
              {totalToCertify > 0 && (
                <div className="sticky bottom-0 bg-white rounded-2xl border border-gray-200 shadow-lg p-4 flex items-center justify-between">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <div>
                      <span className="text-sm text-gray-500">Total a certificar:</span>
                      <span className="ml-2 text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(totalToCertify)}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        ({Object.values(workspaceQtys).filter(q => q > 0).length} partidas)
                      </span>
                    </div>
                    {totalCostToCertify > 0 && (
                      <div className="text-xs text-gray-500" title="Coste real estimado (qty × coste unitario) y margen bruto proyectado">
                        Coste est. <b className="text-gray-700">{formatCurrency(totalCostToCertify)}</b>
                        <span className="mx-1">·</span>
                        Margen <b className={marginPctToCertify < 0 ? 'text-red-600 dark:text-red-400' : marginPctToCertify < 10 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                          {formatCurrency(marginToCertify)} ({marginPctToCertify.toFixed(1)}%)
                        </b>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setWorkspaceQtys({})}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition"
                    >
                      Limpiar
                    </button>
                    <button
                      onClick={() => {
                        const month = new Date().toLocaleString('es', { month: 'long', year: 'numeric' })
                        setCertName(`Certificación ${month}`)
                        setShowCreateModal(true)
                      }}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-xl transition shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Crear Certificación
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── From Work Logs Tab ─── */}
          {activeTab === 'from-work-logs' && (
            <div className="space-y-3 pb-24">
              {certifiableLogs.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
                  <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No hay partes de obra con partidas pendientes de certificar</p>
                </div>
              ) : (
                certifiableLogs.map(({ work_log, items }) => {
                  const allSelected = items.every(it => selectedLinkIds.has(it.work_log_budget_link_id))
                  const someSelected = items.some(it => selectedLinkIds.has(it.work_log_budget_link_id))
                  const logTotal = items.reduce((s, it) => s + it.residual * it.unit_price, 0)
                  return (
                    <div key={work_log.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                            onChange={() => toggleLogSelection(work_log.id, allSelected)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-semibold text-gray-700">{formatDate(work_log.date)}</span>
                          {work_log.description && (
                            <span className="text-xs text-gray-500 truncate max-w-md">{work_log.description}</span>
                          )}
                          <span className="text-xs text-gray-400">({items.length} partidas)</span>
                        </label>
                        <span className="text-sm font-medium text-gray-600">{formatCurrency(logTotal)}</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {items.map(it => {
                          const checked = selectedLinkIds.has(it.work_log_budget_link_id)
                          return (
                            <label key={it.work_log_budget_link_id} className="grid grid-cols-12 gap-2 px-5 py-2 items-center text-sm hover:bg-gray-50 cursor-pointer">
                              <div className="col-span-1 flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleLinkSelection(it.work_log_budget_link_id)}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </div>
                              <div className="col-span-5 truncate">
                                <span className="text-gray-400 text-xs mr-1">{it.code}</span>
                                <span className="text-gray-700">{it.name}</span>
                              </div>
                              <div className="col-span-1 text-center text-gray-500 text-xs">{it.unit}</div>
                              <div className="col-span-1 text-right text-gray-600">{it.executed_quantity.toFixed(2)}</div>
                              <div className="col-span-1 text-right text-blue-600 dark:text-blue-400 text-xs">
                                {it.already_certified > 0 ? it.already_certified.toFixed(2) : '—'}
                              </div>
                              <div className="col-span-1 text-right text-gray-700 font-medium">{it.residual.toFixed(2)}</div>
                              <div className="col-span-2 text-right font-medium text-gray-900">
                                {formatCurrency(it.residual * it.unit_price)}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}

              {selectedLinkIds.size > 0 && (
                <div className="fixed bottom-4 left-4 right-4 lg:left-72 z-30 bg-white rounded-2xl border border-gray-200 shadow-lg p-4 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-gray-500">Selección: </span>
                    <span className="font-medium text-gray-900">{fromWorkLogsTotals.partes} partes</span>
                    <span className="text-gray-400">, </span>
                    <span className="font-medium text-gray-900">{fromWorkLogsTotals.partidas} partidas</span>
                    <span className="ml-3 font-bold text-green-600 dark:text-green-400 text-base">{formatCurrency(fromWorkLogsTotals.total)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedLinkIds(new Set())}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition"
                    >
                      Limpiar
                    </button>
                    <button
                      onClick={openFromWorkLogsModal}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-xl transition shadow-sm"
                    >
                      <Check className="w-4 h-4" />
                      Revisar y certificar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── List Tab ─── */}
          {activeTab === 'list' && (
            <>
              {certifications.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
                  <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No hay certificaciones aún</p>
                  <button
                    onClick={() => setActiveTab('workspace')}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 active:bg-blue-800 transition shadow-sm"
                  >
                    Ir al espacio de trabajo
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {certifications.map((cert) => {
                    const cfg = statusConfig[cert.status] || statusConfig.draft
                    const StatusIcon = cfg.icon
                    const isExpanded = expandedCert === cert.id
                    const isFinalized = cert.status === 'finalized'

                    return (
                      <div key={cert.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                        isFinalized ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/40' : 'border-gray-200'
                      }`}>
                        <div
                          className={`flex items-center justify-between px-5 py-4 cursor-pointer transition ${
                            isFinalized ? 'hover:bg-blue-50/50 dark:hover:bg-blue-900/40' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => loadCertSummary(cert.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center`}>
                              <StatusIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-gray-900">#{cert.number} {cert.name}</h3>
                                {isFinalized && cert.invoice_number && (
                                  <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">
                                    <Receipt className="w-3 h-3" />
                                    {cert.invoice_number}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">
                                {formatDate(cert.created_at)}
                                {cert.period_start && cert.period_end && ` | ${formatDate(cert.period_start)} → ${formatDate(cert.period_end)}`}
                                {isFinalized && cert.finalized_at && (
                                  <span className="ml-2 text-blue-500 dark:text-blue-400">
                                    Finalizada: {formatDate(cert.finalized_at)}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {/* PDF button — only for finalized certifications */}
                            {isFinalized && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setPdfPreviewCertId(cert.id) }}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 hover:text-blue-600 active:bg-gray-200 transition shadow-sm"
                                title="Vista previa PDF"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                PDF
                              </button>
                            )}
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                              {cfg.label}
                            </span>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && certSummary && (
                          <div className="px-5 pb-5 border-t border-gray-100">
                            {/* Actions */}
                            <div className="flex gap-2 py-3">
                              {cert.status === 'draft' && (
                                <>
                                  <button onClick={() => updateCertStatus(cert.id, 'submitted')} disabled={statusChanging} className="px-3 py-1.5 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 active:bg-amber-200 transition shadow-sm disabled:opacity-50">Enviar</button>
                                  <button onClick={() => deleteCert(cert.id)} className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 active:bg-red-200 transition shadow-sm flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar</button>
                                </>
                              )}
                              {cert.status === 'submitted' && (
                                <>
                                  <button onClick={() => updateCertStatus(cert.id, 'approved')} disabled={statusChanging} className="px-3 py-1.5 text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 active:bg-green-200 transition shadow-sm disabled:opacity-50">Aprobar</button>
                                  <button onClick={() => updateCertStatus(cert.id, 'draft')} disabled={statusChanging} className="px-3 py-1.5 text-xs bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition shadow-sm disabled:opacity-50">Devolver</button>
                                </>
                              )}
                              {cert.status === 'approved' && (
                                <button
                                  onClick={() => openFinalizeModal(cert.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition shadow-sm"
                                >
                                  <Lock className="w-3 h-3" />
                                  Finalizar y generar PDF
                                </button>
                              )}
                              {isFinalized && (
                                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Certificación finalizada — bloqueada</span>
                                </div>
                              )}
                            </div>

                            {/* Summary */}
                            <div className="grid grid-cols-4 gap-4 mb-4">
                              <div className="bg-gray-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Anterior</p>
                                <p className="text-sm font-semibold text-gray-900">{formatCurrency(certSummary.total_previous)}</p>
                              </div>
                              <div className="bg-green-50 dark:bg-green-950/40 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Actual</p>
                                <p className="text-sm font-semibold text-green-700 dark:text-green-300">{formatCurrency(certSummary.total_current)}</p>
                              </div>
                              <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Total Cert.</p>
                                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{formatCurrency(certSummary.total_certified)}</p>
                              </div>
                              <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Pendiente</p>
                                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{formatCurrency(certSummary.total_pending)}</p>
                              </div>
                            </div>

                            {/* Items detail grouped by chapter */}
                            {certSummary.items.length > 0 && (() => {
                              const search = certDetailSearch.trim().toLowerCase()
                              const filtered = certSummary.items.filter(it => {
                                if (certDetailOnlyCurrent && it.certified_quantity <= 0.0001) return false
                                if (!search) return true
                                return (
                                  (it.item_code || '').toLowerCase().includes(search) ||
                                  (it.item_name || '').toLowerCase().includes(search)
                                )
                              })
                              // Group by chapter, preserving order from API
                              const groups: { id: string; code: string; name: string; items: typeof filtered }[] = []
                              const groupIdx: Record<string, number> = {}
                              for (const it of filtered) {
                                const chId = it.chapter_id || '__nochapter__'
                                if (!(chId in groupIdx)) {
                                  groupIdx[chId] = groups.length
                                  groups.push({
                                    id: chId,
                                    code: it.chapter_code || '',
                                    name: it.chapter_name || 'Sin capítulo',
                                    items: [],
                                  })
                                }
                                groups[groupIdx[chId]].items.push(it)
                              }
                              return (
                                <div className="space-y-3">
                                  {/* Filter bar */}
                                  <div className="flex flex-wrap items-center gap-3 text-xs">
                                    <input
                                      type="text"
                                      value={certDetailSearch}
                                      onChange={(e) => setCertDetailSearch(e.target.value)}
                                      placeholder="Buscar partida por código o nombre…"
                                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                    <label className="flex items-center gap-2 cursor-pointer text-gray-600 select-none">
                                      <input
                                        type="checkbox"
                                        checked={certDetailOnlyCurrent}
                                        onChange={(e) => setCertDetailOnlyCurrent(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      Solo partidas certificadas en esta certificación
                                    </label>
                                    <span className="text-gray-400">{filtered.length} de {certSummary.items.length}</span>
                                  </div>

                                  {filtered.length === 0 ? (
                                    <div className="text-center py-6 bg-gray-50 rounded-xl text-sm text-gray-500">
                                      No hay partidas que coincidan con el filtro
                                    </div>
                                  ) : (
                                    groups.map(group => {
                                      const isExpanded = certDetailExpandedChapters.has(group.id)
                                      const groupCurrent = group.items.reduce((s, it) => s + it.certified_amount, 0)
                                      return (
                                        <div key={group.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                                          <div
                                            className="flex items-center justify-between px-4 py-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
                                            onClick={() => toggleCertDetailChapter(group.id)}
                                          >
                                            <div className="flex items-center gap-2">
                                              {isExpanded
                                                ? <ChevronDown className="w-4 h-4 text-gray-400" />
                                                : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                              <span className="text-sm font-semibold text-gray-700">
                                                {group.code && <span className="text-gray-400 mr-1">{group.code}</span>}
                                                {group.name}
                                              </span>
                                              <span className="text-xs text-gray-400">({group.items.length} partidas)</span>
                                            </div>
                                            <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                              {formatCurrency(groupCurrent)}
                                            </span>
                                          </div>
                                          {isExpanded && (
                                            <div>
                                              <div className="grid gap-2 px-4 py-1.5 bg-gray-50/60 text-[10px] font-medium text-gray-500 uppercase border-t border-gray-100" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                                                <div className="col-span-4">Partida</div>
                                                <div className="col-span-1 text-center">Ud.</div>
                                                <div className="col-span-1 text-right">Total</div>
                                                <div className="col-span-2 text-right">Anterior</div>
                                                <div className="col-span-2 text-right">En esta cert.</div>
                                                <div className="col-span-1 text-right">% acum.</div>
                                                <div className="col-span-2 text-right">Importe</div>
                                                <div className="col-span-1"></div>
                                              </div>
                                              <div className="divide-y divide-gray-100">
                                                {group.items.map(it => {
                                                  const pct = Math.min(100, Math.max(0, it.certified_pct || 0))
                                                  const isFull = pct >= 99.9
                                                  const noCurrent = it.certified_quantity <= 0.0001
                                                  const isDraft = cert.status === 'draft'
                                                  const isEditing = editingItemId === it.id
                                                  const links = it.work_log_links || []
                                                  const linksCount = links.length
                                                  const isAux = !!it.is_auxiliary
                                                  return (
                                                    <div
                                                      key={it.id}
                                                      className={`grid gap-2 px-4 py-2 items-center text-sm ${
                                                        isFull ? 'bg-green-50/40 dark:bg-green-950/30' : ''
                                                      } ${noCurrent && !isEditing ? 'opacity-60' : ''}`}
                                                      style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}
                                                    >
                                                      <div className="col-span-4 truncate flex items-center gap-1.5">
                                                        <span className="text-gray-400 text-xs">{it.item_code}</span>
                                                        <span className="text-gray-700 truncate">{it.item_name}</span>
                                                        {linksCount > 0 && (
                                                          <span
                                                            className="flex items-center gap-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded-full"
                                                            title={links.map(l =>
                                                              `${l.work_log_date ? formatDate(l.work_log_date) : 'parte'} · ${l.consumed_quantity.toFixed(2)} ${it.item_unit || ''}`
                                                            ).join('\n')}
                                                          >
                                                            <LinkIcon className="w-2.5 h-2.5" />
                                                            {linksCount}
                                                          </span>
                                                        )}
                                                        {isAux && (
                                                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full" title="Partida auxiliar · sin tope">
                                                            AUX
                                                          </span>
                                                        )}
                                                      </div>
                                                      <div className="col-span-1 text-center text-gray-500 text-xs">{it.item_unit}</div>
                                                      <div className="col-span-1 text-right text-gray-500 tabular-nums">
                                                        {isAux ? '∞' : (it.item_quantity || 0).toFixed(2)}
                                                      </div>
                                                      <div className="col-span-2 text-right text-gray-500 tabular-nums">
                                                        {it.previous_quantity > 0.0001 ? it.previous_quantity.toFixed(2) : '—'}
                                                      </div>
                                                      <div className="col-span-2 text-right">
                                                        {isEditing ? (
                                                          <DecimalInput
                                                            min="0"
                                                            value={editItemDraftQty}
                                                            onChange={(v) => setEditItemDraftQty(v)}
                                                            autoFocus
                                                            className="w-full text-right px-2 py-1 text-sm rounded-lg border border-blue-300 focus:ring-2 focus:ring-blue-500 outline-none tabular-nums"
                                                          />
                                                        ) : (
                                                          <span className={`tabular-nums font-medium ${noCurrent ? 'text-gray-400' : 'text-green-700 dark:text-green-300'}`}>
                                                            {noCurrent ? '—' : it.certified_quantity.toFixed(2)}
                                                          </span>
                                                        )}
                                                      </div>
                                                      <div className="col-span-1 text-right">
                                                        <div className="flex items-center gap-1.5 justify-end">
                                                          <div className="w-10 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                                            <div
                                                              className={`h-full ${isFull ? 'bg-green-500' : 'bg-blue-500'}`}
                                                              style={{ width: `${pct}%` }}
                                                            />
                                                          </div>
                                                          <span className={`text-[11px] tabular-nums ${isFull ? 'text-green-700 dark:text-green-300 font-medium' : 'text-gray-500'}`}>
                                                            {pct.toFixed(0)}%
                                                          </span>
                                                        </div>
                                                      </div>
                                                      <div className="col-span-2 text-right font-medium text-gray-900 tabular-nums">
                                                        {it.certified_amount > 0 ? formatCurrency(it.certified_amount) : '—'}
                                                      </div>
                                                      <div className="col-span-1 flex items-center justify-end gap-1">
                                                        {isDraft && !isEditing && (
                                                          <>
                                                            <button
                                                              onClick={() => startEditItem(it)}
                                                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition"
                                                              title="Editar cantidad"
                                                            >
                                                              <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                              onClick={() => deleteCertItem(cert, it.id)}
                                                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition"
                                                              title="Quitar partida de la certificación"
                                                            >
                                                              <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                          </>
                                                        )}
                                                        {isDraft && isEditing && (
                                                          <>
                                                            <button
                                                              onClick={() => saveEditItem(cert, it)}
                                                              disabled={savingItem}
                                                              className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40 rounded transition disabled:opacity-50"
                                                              title="Guardar"
                                                            >
                                                              {savingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                            </button>
                                                            <button
                                                              onClick={cancelEditItem}
                                                              disabled={savingItem}
                                                              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition"
                                                              title="Cancelar"
                                                            >
                                                              <X className="w-3.5 h-3.5" />
                                                            </button>
                                                          </>
                                                        )}
                                                      </div>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── PDF Preview Modal ─── */}
      {pdfPreviewCertId && fullBudget && (
        <CertificationPdfPreviewModal
          isOpen={!!pdfPreviewCertId}
          onClose={() => setPdfPreviewCertId(null)}
          certId={pdfPreviewCertId}
          projectId={projectId}
          fullBudget={fullBudget}
        />
      )}

      {/* ─── Certify From Work Logs Modal ─── */}
      <CertifyFromWorkLogsModal
        isOpen={showFromWorkLogsModal}
        onClose={() => setShowFromWorkLogsModal(false)}
        budgets={budgets}
        preselection={modalPreselection}
        onCreated={() => {
          setShowFromWorkLogsModal(false)
          setSelectedLinkIds(new Set())
          loadData()
          loadCertifiableLogs()
          setActiveTab('list')
        }}
      />

      {/* ─── Create Certification Modal ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nueva Certificación</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                value={certName}
                onChange={(e) => setCertName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                autoFocus
              />
            </div>
            <div className="bg-green-50 dark:bg-green-950/40 rounded-xl p-3 mb-4">
              <p className="text-sm text-green-700 dark:text-green-300">
                <span className="font-medium">Total:</span> {formatCurrency(totalToCertify)} ({Object.values(workspaceQtys).filter(q => q > 0).length} partidas)
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition">Cancelar</button>
              <button
                onClick={createCertification}
                disabled={creating || !certName.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-xl shadow-sm disabled:opacity-50 transition"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Finalize Certification Modal ─── */}
      {showFinalizeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/60">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Finalizar Certificación</h3>
                <p className="text-sm text-gray-500">Se bloqueará y se podrá generar el PDF</p>
              </div>
              <button
                onClick={() => setShowFinalizeModal(false)}
                className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-200">
                  Esta acción es permanente. La certificación quedará bloqueada y no podrá modificarse.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Número de factura asociada <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ej: FACT-2026-001"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Se mostrará en el PDF y en el listado de certificaciones</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 justify-end px-5 py-4 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => setShowFinalizeModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={finalizeCert}
                disabled={finalizing || !invoiceNumber.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-xl shadow-sm disabled:opacity-50 transition"
              >
                {finalizing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                Finalizar y bloquear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
