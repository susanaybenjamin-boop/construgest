'use client'

import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useBudgetStore } from '@/stores/budgetStore'
import { useNotificationStore } from '@/stores/notificationStore'
import PdfPreviewModal from '@/components/shared/PdfPreviewModal'
import type { Client, FullBudget } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  budget: FullBudget
  projectName: string
  /** PRES-1: ficha del cliente de la obra; sale en la portada del PDF. */
  client?: Client | null
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val)
}

export default function BudgetPdfPreviewModal({ isOpen, onClose, budget, projectName, client }: Props) {
  const { print: printSettings, company, pdf_styles, defaults } = useSettingsStore()
  const { updateBudget } = useBudgetStore()
  const { addToast } = useNotificationStore()

  // Document-specific options
  const [showPrices, setShowPrices] = useState(true)
  const [showCosts, setShowCosts] = useState(false)
  // PRES-4: las condiciones salen de lo guardado en el presupuesto; si todavía
  // no tiene, de la plantilla de Ajustes. Antes esto era un textarea suelto que
  // se perdía al cerrar el modal.
  const [generalConditions, setGeneralConditions] = useState(
    budget.budget.conditions ?? defaults.budget_conditions_default ?? ''
  )
  const [savingConditions, setSavingConditions] = useState(false)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    (printSettings.default_orientation as 'portrait' | 'landscape') || 'portrait'
  )
  const [pdfName, setPdfName] = useState(budget.budget.name)

  // Reset PDF name when budget changes
  useEffect(() => {
    setPdfName(budget.budget.name)
    setGeneralConditions(budget.budget.conditions ?? defaults.budget_conditions_default ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget.budget.id])

  // Guardar en el presupuesto al salir del campo (solo si ha cambiado).
  const guardarCondiciones = async () => {
    const actual = budget.budget.conditions ?? ''
    if (generalConditions === actual) return
    setSavingConditions(true)
    try {
      await updateBudget(budget.budget.id, { conditions: generalConditions })
      addToast('success', 'Condiciones guardadas en el presupuesto')
    } catch (e) {
      const r = e as { response?: { data?: { error?: string } }; message?: string }
      addToast('error', `No se pudieron guardar: ${r?.response?.data?.error || r?.message || 'error'}`)
    } finally {
      setSavingConditions(false)
    }
  }

  // Blob management
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Generate blob when modal opens or options change (debounced 400ms)
  useEffect(() => {
    if (!isOpen) return

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const { generateBudgetPdfBlob } = await import('@/services/budgetPdfExport')
        const blob = await generateBudgetPdfBlob(budget, projectName, company, {
          orientation,
          showPrices,
          showCosts,
          generalConditions: generalConditions || undefined,
          client,
          margins: {
            top: printSettings.default_margin_top,
            bottom: printSettings.default_margin_bottom,
            left: printSettings.default_margin_left,
            right: printSettings.default_margin_right,
          },
          pdfStyles: pdf_styles,
          documentName: pdfName,
        })
        const url = URL.createObjectURL(blob)
        setBlobUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch (err) {
        console.error('Error generating PDF:', err)
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [isOpen, orientation, showPrices, showCosts, generalConditions, client, budget, projectName, company, printSettings, pdfName, pdf_styles])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const totalPEM = budget.chapters.reduce((sum, ch) =>
    sum + ch.items.reduce((s, item) => s + item.quantity * item.unit_price, 0), 0)
  const ivaRate = budget.budget.tax_rate || 0
  const iva = totalPEM * (ivaRate / 100)
  const totalFinal = totalPEM + iva

  const filename = `${(pdfName || budget.budget.name).replace(/\s+/g, '_')}.pdf`

  const sidebarContent = (
    <>
      {/* Budget summary */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="space-y-0.5 text-xs text-gray-500">
          <p>{budget.chapters.length} capitulos</p>
          <p>PEM: {formatCurrency(totalPEM)}</p>
          <p className="font-medium text-blue-700">Total: {formatCurrency(totalFinal)}</p>
        </div>
      </div>

      {/* Show prices toggle */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={showPrices}
              onChange={(e) => setShowPrices(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-blue-600 rounded-full transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <span className="text-sm font-medium text-gray-700">Mostrar precios</span>
        </label>
        <p className="text-xs text-gray-400 mt-1 ml-12">
          Desactivar para version cliente (sin importes)
        </p>
      </div>

      {/* Internal version toggle (costs + margin) */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={showCosts}
              onChange={(e) => setShowCosts(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-amber-600 rounded-full transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <span className="text-sm font-medium text-amber-900">Version interna</span>
        </label>
        <p className="text-xs text-amber-700/80 mt-1 ml-12">
          Incluye coste estimado y margen bruto (uso interno, no compartir con cliente)
        </p>
      </div>

      {/* General conditions */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Condiciones de la oferta
        </label>
        <textarea
          value={generalConditions}
          onChange={(e) => setGeneralConditions(e.target.value)}
          onBlur={guardarCondiciones}
          placeholder="Validez de la oferta, forma de pago, plazo de ejecucion, garantia, exclusiones..."
          rows={5}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none transition"
        />
        <p className="text-xs text-gray-400 mt-1">
          {savingConditions
            ? 'Guardando...'
            : 'Se guardan en este presupuesto. La plantilla por defecto esta en Configuracion.'}
        </p>
      </div>
    </>
  )

  return (
    <PdfPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      blobUrl={blobUrl}
      loading={loading}
      filename={filename}
      onFilenameChange={(name) => setPdfName(name)}
      sidebarContent={sidebarContent}
      orientation={orientation}
      onOrientationChange={setOrientation}
    />
  )
}
