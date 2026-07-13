'use client'

import { useEffect, useState } from 'react'
import type { PriceBreakdownLine } from '@/types'
import api from '@/lib/api'
import { formatCurrency, parseLocaleNumber } from '@/lib/utils'
import {
  Plus, Trash2, X, Loader2,
  Users, Package, Wrench, Briefcase, MoreHorizontal, ChevronDown,
} from 'lucide-react'

interface Props {
  itemId: string
  itemName: string
  isOpen: boolean
  onClose: () => void
}

const RESOURCE_TYPES = [
  { value: 'labor', label: 'Mano de obra', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  { value: 'material', label: 'Material', icon: Package, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
  { value: 'equipment', label: 'Maquinaria', icon: Wrench, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  { value: 'subcontract', label: 'Subcontrata', icon: Briefcase, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  { value: 'other', label: 'Otros', icon: MoreHorizontal, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
] as const

type ResourceType = typeof RESOURCE_TYPES[number]['value']

// Shared props for numeric text inputs (handles numpad comma)
const numInputProps = {
  type: 'text' as const,
  inputMode: 'decimal' as const,
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowed = ['Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End', '-', '.', ',']
    if (!allowed.includes(e.key) && !/\d/.test(e.key)) {
      e.preventDefault()
    }
  },
}

function getResourceConfig(type: string) {
  return RESOURCE_TYPES.find((r) => r.value === type) || RESOURCE_TYPES[4]
}

export default function PriceBreakdownPanel({ itemId, itemName, isOpen, onClose }: Props) {
  const [lines, setLines] = useState<PriceBreakdownLine[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newLine, setNewLine] = useState({
    resource_type: 'material' as ResourceType,
    description: '',
    unit: 'ud',
    quantity: 1,
    unit_cost: 0,
  })

  useEffect(() => {
    if (isOpen) {
      loadBreakdown()
    }
  }, [isOpen, itemId])

  const loadBreakdown = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/budgets/items/${itemId}/breakdown`)
      setLines(res.data)
    } catch (err) {
      console.error('Error loading breakdown:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    setSaving(true)
    try {
      const res = await api.post(`/budgets/items/${itemId}/breakdown`, {
        ...newLine,
        sort_order: lines.length,
      })
      setLines([...lines, res.data])
      setNewLine({ resource_type: 'material', description: '', unit: 'ud', quantity: 1, unit_cost: 0 })
      setAdding(false)
    } catch (err) {
      console.error('Error adding breakdown line:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleStartAdd = (type: ResourceType) => {
    setNewLine({ ...newLine, resource_type: type, description: '', unit: 'ud', quantity: 1, unit_cost: 0 })
    setAdding(true)
    setShowAddMenu(false)
  }

  const handleUpdate = async (id: string, field: string, value: string | number) => {
    const numFields = ['quantity', 'unit_cost', 'sort_order']
    const val = numFields.includes(field) ? parseLocaleNumber(value) : value

    // Optimistic update
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: val } : l)))

    try {
      await api.put(`/budgets/breakdown/${id}`, { [field]: val })
    } catch (err) {
      console.error('Error updating breakdown line:', err)
      loadBreakdown() // Revert on error
    }
  }

  const handleDelete = async (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
    try {
      await api.delete(`/budgets/breakdown/${id}`)
    } catch (err) {
      console.error('Error deleting breakdown line:', err)
      loadBreakdown()
    }
  }

  // Totals by type
  const totalsByType = RESOURCE_TYPES.reduce((acc, rt) => {
    acc[rt.value] = lines
      .filter((l) => l.resource_type === rt.value)
      .reduce((sum, l) => sum + l.quantity * l.unit_cost, 0)
    return acc
  }, {} as Record<string, number>)

  const grandTotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_cost, 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Descomposición de Precio</h2>
            <p className="text-sm text-gray-500">{itemName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* Table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b">
                    <th className="text-left py-2 pr-2 w-32">Tipo</th>
                    <th className="text-left py-2 pr-2">Descripcion</th>
                    <th className="text-center py-2 px-2 w-16">Ud.</th>
                    <th className="text-right py-2 px-2 w-24">Cantidad</th>
                    <th className="text-right py-2 px-2 w-24">P.Unitario</th>
                    <th className="text-right py-2 px-2 w-28">Importe</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const config = getResourceConfig(line.resource_type)
                    const Icon = config.icon
                    const importe = line.quantity * line.unit_cost

                    return (
                      <tr key={line.id} className="border-b border-gray-50 group hover:bg-gray-50/50 transition">
                        {/* Type Badge */}
                        <td className="py-2 pr-2">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </span>
                        </td>

                        {/* Description */}
                        <td className="py-2 pr-2">
                          <input
                            className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-sm"
                            defaultValue={line.description}
                            onBlur={(e) => handleUpdate(line.id, 'description', e.target.value)}
                          />
                        </td>

                        {/* Unit */}
                        <td className="py-2 px-2">
                          <input
                            className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-center text-sm text-gray-500"
                            defaultValue={line.unit}
                            onBlur={(e) => handleUpdate(line.id, 'unit', e.target.value)}
                          />
                        </td>

                        {/* Quantity */}
                        <td className="py-2 px-2">
                          <input
                            {...numInputProps}
                            className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-right text-sm"
                            defaultValue={line.quantity}
                            onBlur={(e) => handleUpdate(line.id, 'quantity', e.target.value)}
                          />
                        </td>

                        {/* Unit Cost */}
                        <td className="py-2 px-2">
                          <input
                            {...numInputProps}
                            className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-right text-sm"
                            defaultValue={line.unit_cost}
                            onBlur={(e) => handleUpdate(line.id, 'unit_cost', e.target.value)}
                          />
                        </td>

                        {/* Amount */}
                        <td className="py-2 px-2 text-right font-medium text-gray-900">
                          {formatCurrency(importe)}
                        </td>

                        {/* Delete */}
                        <td className="py-2">
                          <button
                            onClick={() => handleDelete(line.id)}
                            className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {/* Add Row */}
                  {adding && (
                    <tr className="border-b border-blue-100 bg-blue-50/30">
                      <td className="py-2 pr-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${getResourceConfig(newLine.resource_type).bg} ${getResourceConfig(newLine.resource_type).color}`}>
                          {(() => { const Icon = getResourceConfig(newLine.resource_type).icon; return <Icon className="w-3 h-3" /> })()}
                          {getResourceConfig(newLine.resource_type).label}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-full px-2 py-1 rounded border border-gray-300 focus:border-blue-500 outline-none text-sm"
                          placeholder="Descripcion"
                          value={newLine.description}
                          onChange={(e) => setNewLine({ ...newLine, description: e.target.value })}
                          autoFocus
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          className="w-full px-2 py-1 rounded border border-gray-300 focus:border-blue-500 outline-none text-center text-sm"
                          value={newLine.unit}
                          onChange={(e) => setNewLine({ ...newLine, unit: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          {...numInputProps}
                          className="w-full px-2 py-1 rounded border border-gray-300 focus:border-blue-500 outline-none text-right text-sm"
                          value={newLine.quantity}
                          onChange={(e) => setNewLine({ ...newLine, quantity: parseLocaleNumber(e.target.value) })}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          {...numInputProps}
                          className="w-full px-2 py-1 rounded border border-gray-300 focus:border-blue-500 outline-none text-right text-sm"
                          value={newLine.unit_cost}
                          onChange={(e) => setNewLine({ ...newLine, unit_cost: parseLocaleNumber(e.target.value) })}
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-medium text-gray-900">
                        {formatCurrency(newLine.quantity * newLine.unit_cost)}
                      </td>
                      <td></td>
                    </tr>
                  )}

                  {/* Empty State */}
                  {lines.length === 0 && !adding && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">
                        Sin descomposicion de precio. Usa el boton para anadir lineas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Summary by Type */}
              {lines.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* By-type breakdown */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Resumen por tipo</p>
                      {RESOURCE_TYPES.map((rt) => {
                        const total = totalsByType[rt.value]
                        if (total === 0) return null
                        const Icon = rt.icon
                        const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0
                        return (
                          <div key={rt.value} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 ${rt.color}`} />
                              <span className="text-gray-700">{rt.label}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-24 bg-gray-100 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${rt.value === 'labor' ? 'bg-blue-500' : rt.value === 'material' ? 'bg-green-500' : rt.value === 'equipment' ? 'bg-orange-500' : rt.value === 'subcontract' ? 'bg-purple-500' : 'bg-gray-400'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-gray-500 text-xs w-10 text-right">{pct.toFixed(0)}%</span>
                              <span className="font-medium text-gray-900 w-24 text-right">{formatCurrency(total)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Grand total */}
                    <div className="flex items-end justify-end">
                      <div className="bg-gray-50 rounded-xl px-6 py-4 text-right">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Coste Total Unitario</p>
                        <p className="text-2xl font-bold text-blue-700">{formatCurrency(grandTotal)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <div>
            {adding ? (
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!newLine.description || saving}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="px-3 py-1.5 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-4 h-4" /> Anadir linea
                  <ChevronDown className="w-3 h-3" />
                </button>

                {/* Dropdown menu */}
                {showAddMenu && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 py-1 w-48 z-10">
                    {RESOURCE_TYPES.map((rt) => {
                      const Icon = rt.icon
                      return (
                        <button
                          key={rt.value}
                          onClick={() => handleStartAdd(rt.value)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                        >
                          <Icon className={`w-4 h-4 ${rt.color}`} />
                          {rt.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
