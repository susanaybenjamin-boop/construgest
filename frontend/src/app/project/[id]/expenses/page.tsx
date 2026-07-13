'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import type { ProjectExpense, Supplier, WorkLog } from '@/types'
import { Wallet, Plus, Loader2, Trash2, Search, Edit, Receipt, TrendingUp, Building2, Image, X, Camera, HardHat } from 'lucide-react'
import { useNotificationStore } from '@/stores/notificationStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DecimalInput } from '@/components/ui/DecimalInput'

export default function ExpensesPage() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = params.id as string

  const { addToast } = useNotificationStore()
  const [expenses, setExpenses] = useState<ProjectExpense[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null)
  const [loadingReceipt, setLoadingReceipt] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    concept: '',
    amount: '',
    tax_amount: '',
    supplier_name: '',
    supplier_id: '',
    work_log_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  useEffect(() => {
    loadExpenses()
    // Load suppliers and work logs for selectors
    api.get<Supplier[]>('/suppliers').then(r => setSuppliers(r.data)).catch(() => {})
    api.get<WorkLog[]>(`/work-logs/project/${projectId}`).then(r => setWorkLogs(r.data)).catch(() => {})
  }, [projectId])

  const loadExpenses = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<ProjectExpense[]>(`/expenses/project/${projectId}`)
      setExpenses(data)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      if (receiptFile) {
        // Use FormData for multipart upload
        const formData = new FormData()
        formData.append('project_id', projectId)
        formData.append('concept', form.concept)
        formData.append('amount', form.amount)
        formData.append('tax_amount', form.tax_amount || '0')
        formData.append('supplier_name', form.supplier_name || '')
        if (form.supplier_id) formData.append('supplier_id', form.supplier_id)
        if (form.work_log_id) formData.append('work_log_id', form.work_log_id)
        formData.append('date', form.date)
        formData.append('notes', form.notes || '')
        formData.append('receipt', receiptFile)

        if (editingId) {
          await api.put(`/expenses/${editingId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          addToast('success', 'Gasto actualizado correctamente')
        } else {
          await api.post('/expenses', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          addToast('success', 'Gasto creado correctamente')
        }
      } else {
        const payload = {
          project_id: projectId,
          concept: form.concept,
          amount: parseFloat(form.amount),
          tax_amount: parseFloat(form.tax_amount || '0'),
          supplier_name: form.supplier_name || null,
          supplier_id: form.supplier_id || null,
          work_log_id: form.work_log_id || null,
          date: form.date,
          notes: form.notes || null,
        }

        if (editingId) {
          await api.put(`/expenses/${editingId}`, payload)
          addToast('success', 'Gasto actualizado correctamente')
        } else {
          await api.post('/expenses', payload)
          addToast('success', 'Gasto creado correctamente')
        }
      }

      closeForm()
      loadExpenses()
    } catch {
      addToast('error', 'Error al guardar el gasto')
    } finally {
      setSubmitting(false)
    }
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setReceiptFile(null)
    setReceiptPreview(null)
    setForm({ concept: '', amount: '', tax_amount: '', supplier_name: '', supplier_id: '', work_log_id: '', date: new Date().toISOString().split('T')[0], notes: '' })
  }

  const startEdit = (expense: ProjectExpense) => {
    setForm({
      concept: expense.concept,
      amount: String(expense.amount),
      tax_amount: String(expense.tax_amount),
      supplier_name: expense.supplier_name || '',
      supplier_id: expense.supplier_id || '',
      work_log_id: expense.work_log_id || '',
      date: expense.date.split('T')[0],
      notes: expense.notes || '',
    })
    setEditingId(expense.id)
    setShowForm(true)
  }

  const deleteExpense = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    try {
      await api.delete(`/expenses/${id}`)
      addToast('success', 'Gasto eliminado')
      loadExpenses()
    } catch {
      addToast('error', 'Error al eliminar el gasto')
    }
  }

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      addToast('error', 'Solo se permiten imágenes (JPG, PNG, WebP)')
      return
    }
    setReceiptFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setReceiptPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const removeReceipt = () => {
    setReceiptFile(null)
    setReceiptPreview(null)
  }

  const viewReceipt = async (expenseId: string) => {
    setLoadingReceipt(true)
    try {
      const { data } = await api.get<{ url: string }>(`/expenses/${expenseId}/receipt-url`)
      setViewingReceiptUrl(data.url)
    } catch {
      addToast('error', 'Error al cargar la imagen del recibo')
    } finally {
      setLoadingReceipt(false)
    }
  }

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalTax = expenses.reduce((sum, e) => sum + e.tax_amount, 0)

  // Unique suppliers count
  const uniqueSuppliers = new Set(expenses.filter(e => e.supplier_name).map(e => e.supplier_name)).size

  // Filtered expenses
  const filtered = expenses.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      e.concept.toLowerCase().includes(q) ||
      (e.supplier_name && e.supplier_name.toLowerCase().includes(q)) ||
      (e.notes && e.notes.toLowerCase().includes(q))
    )
  })

  if (loading) {
    return (
      <div className="pb-16">
        <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
          <div className="flex items-center justify-between">
            <div className="h-7 w-32 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-36 bg-blue-100 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="flex-1" />
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('nav.economic')}</h1>
            <p className="text-gray-500 text-sm mt-1">
              Control de gastos del proyecto
            </p>
          </div>
          <button
            onClick={() => { closeForm(); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo Gasto
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Gastos</p>
              <p className="text-lg font-bold text-gray-900">{expenses.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Base Imponible</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Total (IVA incl.)</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(totalAmount + totalTax)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Proveedores</p>
              <p className="text-lg font-bold text-gray-900">{uniqueSuppliers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {expenses.length > 0 && (
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por concepto, proveedor o notas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {editingId ? 'Editar Gasto' : 'Nuevo Gasto'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto *</label>
                <input
                  type="text"
                  value={form.concept}
                  onChange={(e) => setForm({ ...form, concept: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Importe *</label>
                  <DecimalInput
                    value={parseFloat(form.amount) || 0}
                    onChange={(v) => setForm({ ...form, amount: String(v) })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IVA</label>
                  <DecimalInput
                    value={parseFloat(form.tax_amount) || 0}
                    onChange={(v) => setForm({ ...form, tax_amount: String(v) })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                  {suppliers.length > 0 ? (
                    <select
                      value={form.supplier_id}
                      onChange={(e) => {
                        const sup = suppliers.find(s => s.id === e.target.value)
                        setForm({ ...form, supplier_id: e.target.value, supplier_name: sup?.name || '' })
                      }}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">Sin proveedor</option>
                      {suppliers.filter(s => s.is_active).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.supplier_name}
                      onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                      placeholder="Nombre del proveedor"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parte de Obra (opcional)</label>
                <select
                  value={form.work_log_id}
                  onChange={(e) => setForm({ ...form, work_log_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Sin vincular a parte</option>
                  {workLogs.map(wl => (
                    <option key={wl.id} value={wl.id}>
                      {formatDate(wl.date)} — {wl.description || 'Sin descripción'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                  placeholder="Notas adicionales..."
                />
              </div>
              {/* Receipt Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justificante / Factura</label>
                {receiptPreview ? (
                  <div className="relative inline-block">
                    <img
                      src={receiptPreview}
                      alt="Previsualización del recibo"
                      className="h-28 rounded-lg border border-gray-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeReceipt}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition">
                    <Camera className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-500">Subir imagen del recibo (JPG, PNG, WebP)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleReceiptSelect}
                    />
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-700 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={submitting} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition shadow-sm disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {editingId ? 'Guardar Cambios' : t('actions.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      {expenses.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay gastos registrados</p>
          <p className="text-gray-400 text-sm mt-1">Haz clic en &quot;Nuevo Gasto&quot; para comenzar</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No se encontraron gastos para &quot;{search}&quot;</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Concepto</th>
                <th className="px-4 py-3 text-left">Proveedor</th>
                <th className="px-4 py-3 text-left">Parte</th>
                <th className="px-4 py-3 text-right">Base</th>
                <th className="px-4 py-3 text-right">IVA</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 w-10 text-center">Rec.</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense) => (
                <tr key={expense.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition group">
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(expense.date)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="text-gray-900 font-medium">{expense.concept}</span>
                    {expense.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{expense.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{expense.supplier_name || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {expense.work_log_id ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">
                        <HardHat className="w-3 h-3" />
                        {(() => { const wl = workLogs.find(w => w.id === expense.work_log_id); return wl ? formatDate(wl.date) : 'Vinculado' })()}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(expense.amount)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">{formatCurrency(expense.tax_amount)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(expense.amount + expense.tax_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    {expense.image_path && (
                      <button
                        onClick={() => viewReceipt(expense.id)}
                        className="p-1 text-green-500 hover:text-green-700 rounded transition"
                        title="Ver justificante"
                      >
                        <Image className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => startEdit(expense)}
                        className="p-1 text-gray-300 hover:text-blue-500 rounded transition"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteExpense(expense.id)}
                        className="p-1 text-gray-300 hover:text-red-500 rounded transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3" colSpan={4}>
                  TOTAL {search && `(${filtered.length} de ${expenses.length})`}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(filtered.reduce((s, e) => s + e.amount, 0))}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(filtered.reduce((s, e) => s + e.tax_amount, 0))}
                </td>
                <td className="px-4 py-3 text-right text-blue-700">
                  {formatCurrency(filtered.reduce((s, e) => s + e.amount + e.tax_amount, 0))}
                </td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Receipt Image Viewer Modal */}
      {viewingReceiptUrl && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => setViewingReceiptUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setViewingReceiptUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white text-gray-700 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 transition z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={viewingReceiptUrl}
              alt="Justificante"
              className="max-h-[85vh] rounded-xl shadow-2xl object-contain"
            />
          </div>
        </div>
      )}

      {/* Loading receipt overlay */}
      {loadingReceipt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-sm text-gray-700">Cargando justificante...</span>
          </div>
        </div>
      )}
    </div>
  )
}
