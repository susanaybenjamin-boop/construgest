'use client'

import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import PdfPreviewModal from '@/components/shared/PdfPreviewModal'
import api from '@/lib/api'
import type { CertificationSummary, ProjectInfo, FullBudget } from '@/types'
import { Loader2 } from 'lucide-react'
import { DecimalInput } from '@/components/ui/DecimalInput'

interface Props {
  isOpen: boolean
  onClose: () => void
  certId: string
  projectId: string
  fullBudget: FullBudget
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val)
}

export default function CertificationPdfPreviewModal({ isOpen, onClose, certId, projectId, fullBudget }: Props) {
  const { print: printSettings, company, pdf_styles } = useSettingsStore()

  // Data fetching
  const [certSummary, setCertSummary] = useState<CertificationSummary | null>(null)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [dataLoading, setDataLoading] = useState(false)

  // Certification-specific options
  const [includeIva, setIncludeIva] = useState(false)
  const [ivaRate, setIvaRate] = useState(fullBudget.budget.tax_rate || 21)
  const [ivaIncludedInTotal, setIvaIncludedInTotal] = useState(false)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    (printSettings.default_orientation as 'portrait' | 'landscape') || 'portrait'
  )

  // Blob management
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [blobLoading, setBlobLoading] = useState(false)

  // Fetch cert summary and project when modal opens
  useEffect(() => {
    if (!isOpen || !certId) return
    setDataLoading(true)
    Promise.all([
      api.get(`/certifications/${certId}/summary`),
      api.get(`/projects/${projectId}`),
    ]).then(([summRes, projRes]) => {
      setCertSummary(summRes.data)
      setProject(projRes.data)
    }).catch(err => {
      console.error('Error loading certification data:', err)
    }).finally(() => setDataLoading(false))
  }, [isOpen, certId, projectId])

  // Generate blob when data or options change (debounced 400ms)
  useEffect(() => {
    if (!isOpen || !certSummary || !project) return

    setBlobLoading(true)
    const timer = setTimeout(async () => {
      try {
        const { generateCertificationPdfBlob } = await import('@/services/certificationPdfExport')
        const blob = await generateCertificationPdfBlob(certSummary, project, fullBudget, company, {
          orientation,
          includeIva,
          ivaRate,
          ivaIncludedInTotal,
          margins: {
            top: printSettings.default_margin_top,
            bottom: printSettings.default_margin_bottom,
            left: printSettings.default_margin_left,
            right: printSettings.default_margin_right,
          },
          pdfStyles: pdf_styles,
        })
        const url = URL.createObjectURL(blob)
        setBlobUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch (err) {
        console.error('Error generating certification PDF:', err)
      } finally {
        setBlobLoading(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [isOpen, certSummary, project, orientation, includeIva, ivaRate, ivaIncludedInTotal, fullBudget, company, printSettings])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setCertSummary(null)
      setProject(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const loading = dataLoading || blobLoading
  const filename = certSummary
    ? `Certificacion_${certSummary.certification.number}.pdf`
    : 'certificacion.pdf'

  // IVA calculations for sidebar display
  const ivaAmount = certSummary ? certSummary.total_certified * (ivaRate / 100) : 0

  const sidebarContent = (
    <>
      {/* Certification summary */}
      {dataLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando datos...
        </div>
      ) : certSummary ? (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="font-medium text-gray-800 text-sm mb-2">
            Cert. #{certSummary.certification.number}
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Actual:</span>
              <span className="font-medium text-gray-700">{formatCurrency(certSummary.total_current)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Acumulado:</span>
              <span className="font-medium text-blue-700">{formatCurrency(certSummary.total_certified)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-600">Pendiente:</span>
              <span className="font-medium text-amber-600">{formatCurrency(certSummary.total_pending)}</span>
            </div>
            {includeIva && (
              <>
                <div className="border-t border-gray-200 my-1 pt-1" />
                <div className="flex justify-between">
                  <span className="text-gray-500">IVA ({ivaRate}%):</span>
                  <span className="text-gray-600">{formatCurrency(ivaAmount)}</span>
                </div>
                {!ivaIncludedInTotal && (
                  <div className="flex justify-between">
                    <span className="font-medium text-blue-700">Total con IVA:</span>
                    <span className="font-medium text-blue-700">{formatCurrency(certSummary.total_certified + ivaAmount)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* IVA toggle */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={includeIva}
              onChange={(e) => setIncludeIva(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-blue-600 rounded-full transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <span className="text-sm font-medium text-gray-700">Incluir IVA</span>
        </label>
      </div>

      {/* IVA options (conditionally shown) */}
      {includeIva && (
        <div className="pl-2 space-y-3 border-l-2 border-blue-100 ml-1">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de IVA (%)</label>
            <DecimalInput
              value={ivaRate}
              onChange={(v) => setIvaRate(v || 21)}
              min={0}
              max={100}
              className="w-24 px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600">IVA en el total</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="ivaMode"
                checked={!ivaIncludedInTotal}
                onChange={() => setIvaIncludedInTotal(false)}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="text-sm text-gray-600">Añadir IVA al total</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="ivaMode"
                checked={ivaIncludedInTotal}
                onChange={() => setIvaIncludedInTotal(true)}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="text-sm text-gray-600">IVA ya incluido en total</span>
            </label>
          </div>
        </div>
      )}
    </>
  )

  return (
    <PdfPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      blobUrl={blobUrl}
      loading={loading}
      filename={filename}
      sidebarContent={sidebarContent}
      orientation={orientation}
      onOrientationChange={setOrientation}
    />
  )
}
