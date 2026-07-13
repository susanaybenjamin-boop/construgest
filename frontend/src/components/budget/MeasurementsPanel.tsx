'use client'

import { useState } from 'react'
import type { Measurement } from '@/types'
import { useBudgetStore } from '@/stores/budgetStore'
import { Plus, Trash2, X } from 'lucide-react'
import { DecimalInput } from '@/components/ui/DecimalInput'
import { handleDecimalKeyDown } from '@/lib/utils'

interface Props {
  itemId: string
  itemName: string
  measurements: Measurement[]
  onClose: () => void
}

export default function MeasurementsPanel({ itemId, itemName, measurements, onClose }: Props) {
  const { addMeasurement, updateMeasurement, deleteMeasurement } = useBudgetStore()
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState({
    description: '', units: 1, length: 0, width: 0, height: 0,
  })

  const calcPartial = (m: { units: number; length: number; width: number; height: number }) => {
    const l = m.length || 1
    const w = m.width || 1
    const h = m.height || 1
    return m.units * l * (w !== 1 ? w : 1) * (h !== 1 ? h : 1)
  }

  const total = measurements.reduce((sum, m) => sum + (m.partial || calcPartial(m)), 0)

  const handleAdd = async () => {
    const partial = calcPartial(newRow)
    await addMeasurement(itemId, { ...newRow, partial, sort_order: measurements.length + 1 })
    setNewRow({ description: '', units: 1, length: 0, width: 0, height: 0 })
    setAdding(false)
  }

  const handleUpdate = async (id: string, field: string, value: number | string) => {
    await updateMeasurement(id, { [field]: value })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Mediciones</h2>
            <p className="text-sm text-gray-500">{itemName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b">
                <th className="text-left py-2 pr-2">Descripción</th>
                <th className="text-right py-2 px-2 w-20">Uds.</th>
                <th className="text-right py-2 px-2 w-20">Largo</th>
                <th className="text-right py-2 px-2 w-20">Ancho</th>
                <th className="text-right py-2 px-2 w-20">Alto</th>
                <th className="text-right py-2 px-2 w-24">Parcial</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {measurements.map((m) => (
                <tr key={m.id} className="border-b border-gray-50 group">
                  <td className="py-2 pr-2">
                    <input
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-sm"
                      defaultValue={m.description || ''}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
                      onBlur={(e) => handleUpdate(m.id, 'description', e.target.value)}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-right text-sm"
                      defaultValue={m.units || ''}
                      onKeyDown={handleDecimalKeyDown}
                      onBlur={(e) => handleUpdate(m.id, 'units', parseFloat(e.target.value.replace(',', '.')) || 0)}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-right text-sm"
                      defaultValue={m.length || ''}
                      onKeyDown={handleDecimalKeyDown}
                      onBlur={(e) => handleUpdate(m.id, 'length', parseFloat(e.target.value.replace(',', '.')) || 0)}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-right text-sm"
                      defaultValue={m.width || ''}
                      onKeyDown={handleDecimalKeyDown}
                      onBlur={(e) => handleUpdate(m.id, 'width', parseFloat(e.target.value.replace(',', '.')) || 0)}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-right text-sm"
                      defaultValue={m.height || ''}
                      onKeyDown={handleDecimalKeyDown}
                      onBlur={(e) => handleUpdate(m.id, 'height', parseFloat(e.target.value.replace(',', '.')) || 0)}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                  <td className="py-2 px-2 text-right font-medium">{(m.partial || calcPartial(m)).toFixed(3)}</td>
                  <td className="py-2">
                    <button
                      onClick={() => deleteMeasurement(m.id)}
                      className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Add Row */}
              {adding && (
                <tr className="border-b border-blue-100 bg-blue-50/30">
                  <td className="py-2 pr-2">
                    <input
                      className="w-full px-2 py-1 rounded border border-gray-300 focus:border-blue-500 outline-none text-sm"
                      placeholder="Descripción"
                      value={newRow.description}
                      onChange={(e) => setNewRow({ ...newRow, description: e.target.value })}
                      autoFocus
                    />
                  </td>
                  <td className="py-2 px-2">
                    <DecimalInput className="w-full px-2 py-1 rounded border border-gray-300 text-right text-sm" value={newRow.units} onChange={(v) => setNewRow({ ...newRow, units: v })} />
                  </td>
                  <td className="py-2 px-2">
                    <DecimalInput className="w-full px-2 py-1 rounded border border-gray-300 text-right text-sm" value={newRow.length} onChange={(v) => setNewRow({ ...newRow, length: v })} />
                  </td>
                  <td className="py-2 px-2">
                    <DecimalInput className="w-full px-2 py-1 rounded border border-gray-300 text-right text-sm" value={newRow.width} onChange={(v) => setNewRow({ ...newRow, width: v })} />
                  </td>
                  <td className="py-2 px-2">
                    <DecimalInput className="w-full px-2 py-1 rounded border border-gray-300 text-right text-sm" value={newRow.height} onChange={(v) => setNewRow({ ...newRow, height: v })} />
                  </td>
                  <td className="py-2 px-2 text-right font-medium">{calcPartial(newRow).toFixed(3)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-3" colSpan={5}>TOTAL</td>
                <td className="py-3 text-right text-blue-700">{total.toFixed(3)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          {adding ? (
            <div className="flex gap-2">
              <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">Guardar</button>
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition">Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus className="w-4 h-4" /> Añadir medición
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
