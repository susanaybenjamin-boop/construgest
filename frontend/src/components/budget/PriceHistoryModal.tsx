'use client'

import { useEffect, useState } from 'react'
import { X, Plus, Loader2, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import api from '@/lib/api'
import { useSuppliersStore } from '@/stores/suppliersStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DecimalInput } from '@/components/ui/DecimalInput'
import type { MaterialPriceHistory, Supplier } from '@/types'

interface Props {
  materialId: string
  materialName: string
  onClose: () => void
}

export default function PriceHistoryModal({ materialId, materialName, onClose }: Props) {
  const { addToast } = useNotificationStore()
  const { suppliers, loadSuppliers } = useSuppliersStore()
  const [history, setHistory] = useState<MaterialPriceHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    unit_price: 0,
    effective_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    source: '',
    notes: '',
  })

  useEffect(() => {
    loadHistory()
    loadSuppliers()
  }, [materialId])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<MaterialPriceHistory[]>(`/materials/${materialId}/price-history`)
      setHistory(data)
    } catch {
      addToast('error', 'Error al cargar historial de precios')
    } finally {
      setLoading(false)
    }
  }

  const handleAddEntry = async () => {
    if (form.unit_price !== 0 && !form.unit_price) return
    setSaving(true)
    try {
      await api.post(`/materials/${materialId}/price-history`, {
        ...form,
        supplier_id: form.supplier_id || null,
      })
      addToast('success', 'Registro de precio añadido')
      setShowAddForm(false)
      setForm({
        unit_price: 0,
        effective_date: new Date().toISOString().split('T')[0],
        supplier_id: '',
        source: '',
        notes: '',
      })
      loadHistory()
    } catch {
      addToast('error', 'Error al añadir registro')
    } finally {
      setSaving(false)
    }
  }

  // Build a supplier name lookup
  const supplierMap = new Map<string, string>()
  suppliers.forEach((s) => supplierMap.set(s.id, s.name))

  // Prepare chart data (reversed so oldest is first)
  const chartData = [...history]
    .reverse()
    .map((h) => ({
      date: new Date(h.effective_date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
      precio: Number(h.unit_price),
    }))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Historial de Precios</h2>
            <p className="text-sm text-gray-500 truncate max-w-md">{materialName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* Chart */}
              {chartData.length >= 2 ? (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    Tendencia de precios
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                        <Tooltip
                          formatter={(value: number) => [formatCurrency(value), 'Precio']}
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            fontSize: '13px',
                          }}
                        />
                        <Bar dataKey="precio" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : chartData.length === 1 ? (
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-blue-700">Solo hay 1 registro de precio. Se necesitan al menos 2 para mostrar la tendencia.</p>
                </div>
              ) : null}

              {/* History Table */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Registros de precios</h3>
                {history.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-xl">
                    <p className="text-gray-500 text-sm">No hay historial de precios registrado</p>
                    <p className="text-gray-400 text-xs mt-1">Los cambios de precio se registran automaticamente</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <th className="px-4 py-2.5 text-left">Fecha</th>
                          <th className="px-4 py-2.5 text-right">Precio</th>
                          <th className="px-4 py-2.5 text-left">Proveedor</th>
                          <th className="px-4 py-2.5 text-left">Origen</th>
                          <th className="px-4 py-2.5 text-left">Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h) => (
                          <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                            <td className="px-4 py-2.5 text-sm text-gray-700">
                              {formatDate(h.effective_date)}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right font-medium text-gray-900">
                              {formatCurrency(Number(h.unit_price))}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">
                              {h.supplier_id ? (
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                                  {supplierMap.get(h.supplier_id) || 'Proveedor'}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-500">
                              {h.source || '-'}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-400 truncate max-w-[150px]">
                              {h.notes || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Add Entry Form */}
              {showAddForm ? (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-medium text-gray-700">Nuevo registro de precio</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Precio *</label>
                      <DecimalInput
                        value={form.unit_price}
                        onChange={(v) => setForm({ ...form, unit_price: v })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fecha</label>
                      <input
                        type="date"
                        value={form.effective_date}
                        onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Proveedor</label>
                      <select
                        value={form.supplier_id}
                        onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Sin proveedor</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Origen</label>
                      <input
                        value={form.source}
                        onChange={(e) => setForm({ ...form, source: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Presupuesto, web..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Notas</label>
                      <input
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Observaciones..."
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleAddEntry}
                      disabled={(form.unit_price !== 0 && !form.unit_price) || saving}
                      className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition"
                >
                  <Plus className="w-4 h-4" /> Añadir registro
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
