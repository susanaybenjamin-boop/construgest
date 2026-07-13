'use client'

import { useState } from 'react'
import type { SavedPartida, BudgetItem } from '@/types'
import { AlertTriangle, RefreshCw, Plus, X, Check } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentItem: BudgetItem
  duplicates: SavedPartida[]
  onAction: (action: 'update' | 'create_new' | 'skip', targetId?: string) => void
  loading?: boolean
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val)
}

export default function DuplicatePartidaDialog({
  isOpen,
  onClose,
  currentItem,
  duplicates,
  onAction,
  loading = false,
}: Props) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border-b border-amber-200">
          <div className="p-2 bg-amber-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Partida existente en biblioteca</h3>
            <p className="text-sm text-gray-500">Se encontraron coincidencias. Elige que hacer.</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current item info */}
        <div className="px-5 pt-4 pb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Partida actual</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                {currentItem.code}
              </span>
              <span className="text-sm font-medium text-gray-800 truncate">{currentItem.name}</span>
            </div>
            <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
              <span>Ud: {currentItem.unit}</span>
              <span>Precio: {formatCurrency(currentItem.unit_price)}</span>
              <span>Cantidad: {currentItem.quantity}</span>
            </div>
          </div>
        </div>

        {/* Duplicates found */}
        <div className="px-5 pb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Coincidencias encontradas ({duplicates.length})
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {duplicates.map((dup) => {
              const isExactCode = dup.code === currentItem.code
              const priceDiff = currentItem.unit_price - dup.unit_price
              const hasPriceDiff = Math.abs(priceDiff) > 0.01

              return (
                <div
                  key={dup.id}
                  className={`border rounded-lg p-3 transition cursor-pointer ${
                    selectedAction === dup.id
                      ? 'border-blue-400 bg-blue-50/50 ring-1 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedAction(dup.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      isExactCode ? 'text-red-600 bg-red-100' : 'text-gray-500 bg-gray-100'
                    }`}>
                      {dup.code}
                    </span>
                    <span className="text-sm text-gray-800 truncate">{dup.name}</span>
                    {isExactCode && (
                      <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                        Mismo codigo
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                    <span>Ud: {dup.unit}</span>
                    <span className={hasPriceDiff ? 'text-amber-600 font-medium' : ''}>
                      Precio: {formatCurrency(dup.unit_price)}
                      {hasPriceDiff && (
                        <span className="ml-1">
                          ({priceDiff > 0 ? '+' : ''}{formatCurrency(priceDiff)})
                        </span>
                      )}
                    </span>
                    <span className="text-gray-400">Usos: {dup.usage_count}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 space-y-2">
          {/* Update selected */}
          <button
            onClick={() => {
              if (selectedAction) onAction('update', selectedAction)
            }}
            disabled={!selectedAction || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg
              hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition text-sm font-medium"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Actualizar la seleccionada con datos nuevos
          </button>

          {/* Create new */}
          <button
            onClick={() => onAction('create_new')}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700
              rounded-lg hover:bg-gray-100 disabled:opacity-50 transition text-sm"
          >
            <Plus className="w-4 h-4" />
            Guardar como nueva partida (duplicar)
          </button>

          {/* Skip */}
          <button
            onClick={() => onAction('skip')}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-500
              rounded-lg hover:bg-gray-100 disabled:opacity-50 transition text-sm"
          >
            <Check className="w-4 h-4" />
            No guardar, ya existe
          </button>
        </div>
      </div>
    </div>
  )
}
