'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight,
  X, Printer, Download, Loader2, FileText,
} from 'lucide-react'

// PDF.js worker setup for Next.js
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface PdfPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  blobUrl: string | null
  loading: boolean
  filename: string
  onFilenameChange?: (name: string) => void
  sidebarContent: ReactNode
  orientation: 'portrait' | 'landscape'
  onOrientationChange: (o: 'portrait' | 'landscape') => void
}

export default function PdfPreviewModal({
  isOpen,
  onClose,
  blobUrl,
  loading,
  filename,
  onFilenameChange,
  sidebarContent,
  orientation,
  onOrientationChange,
}: PdfPreviewModalProps) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset state when blob changes
  useEffect(() => {
    setCurrentPage(1)
  }, [blobUrl])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setCurrentPage(p => Math.max(1, p - 1))
      if (e.key === 'ArrowRight') setCurrentPage(p => Math.min(numPages, p + 1))
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setScale(s => Math.min(s + 0.25, 3.0)) }
      if (e.key === '-') { e.preventDefault(); setScale(s => Math.max(s - 0.25, 0.5)) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, numPages, onClose])

  // Prevent body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Mouse wheel page navigation
  const wheelCooldownRef = useRef(false)
  const pdfAreaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const el = pdfAreaRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (wheelCooldownRef.current) return
      wheelCooldownRef.current = true
      if (e.deltaY > 0) {
        setCurrentPage(p => Math.min(numPages, p + 1))
      } else if (e.deltaY < 0) {
        setCurrentPage(p => Math.max(1, p - 1))
      }
      setTimeout(() => { wheelCooldownRef.current = false }, 250)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [isOpen, numPages])

  const handlePrint = useCallback(() => {
    if (!blobUrl) return
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;top:-9999px;left:-9999px'
    document.body.appendChild(iframe)
    iframe.src = blobUrl
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch {
        // Fallback: open in new window
        window.open(blobUrl, '_blank')
      }
      setTimeout(() => {
        try { document.body.removeChild(iframe) } catch { /* already removed */ }
      }, 5000)
    }
  }, [blobUrl])

  const handleDownload = useCallback(() => {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.click()
  }, [blobUrl, filename])

  const zoomIn = () => setScale(s => Math.min(s + 0.25, 3.0))
  const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.5))
  const zoomFit = () => setScale(1.0)

  if (!isOpen || !mounted) return null

  const modal = (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal content */}
      <div className="relative flex w-full h-full">
        {/* LEFT: PDF Preview area */}
        <div className="flex-1 flex flex-col bg-gray-900 min-w-0">
          {/* Toolbar */}
          <div className="h-12 bg-gray-800 flex items-center px-4 gap-2 border-b border-gray-700 shrink-0">
            {/* Zoom controls */}
            <button
              onClick={zoomOut}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition"
              title="Reducir"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-300 font-medium w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition"
              title="Ampliar"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={zoomFit}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition"
              title="Ajustar"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-gray-600 mx-2" />

            {/* Page navigation */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-300 min-w-[80px] text-center">
              {numPages > 0 ? `${currentPage} / ${numPages}` : '—'}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Spacer + close */}
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
              title="Cerrar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* PDF display area */}
          <div ref={pdfAreaRef} className="flex-1 overflow-auto flex justify-center py-8 px-4">
            {loading && (
              <div className="flex flex-col items-center gap-3 mt-20">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-sm text-gray-400">Generando documento...</p>
              </div>
            )}
            {!loading && !blobUrl && (
              <div className="flex flex-col items-center gap-3 mt-20">
                <FileText className="w-10 h-10 text-gray-500" />
                <p className="text-sm text-gray-400">No hay documento para mostrar</p>
              </div>
            )}
            {blobUrl && (
              <div className="theme-light-locked">
                <Document
                  file={blobUrl}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                  loading={
                    <div className="flex items-center gap-2 mt-20">
                      <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                      <span className="text-sm text-gray-400">Cargando PDF...</span>
                    </div>
                  }
                  error={
                    <div className="text-red-400 text-sm mt-20">Error al cargar el documento</div>
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    className="shadow-2xl"
                  />
                </Document>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shrink-0">
          {/* Sidebar header */}
          <div className="p-4 border-b border-gray-100 shrink-0">
            <h2 className="font-semibold text-gray-900">Opciones del documento</h2>
          </div>

          {/* Scrollable options area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Document-specific options from wrapper */}
            {sidebarContent}

            {/* Orientation picker (always shown) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Orientacion
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onOrientationChange('portrait')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition ${
                    orientation === 'portrait'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-3 h-4 border-2 rounded-sm ${orientation === 'portrait' ? 'border-white' : 'border-gray-400'}`} />
                  Vertical
                </button>
                <button
                  onClick={() => onOrientationChange('landscape')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition ${
                    orientation === 'landscape'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-4 h-3 border-2 rounded-sm ${orientation === 'landscape' ? 'border-white' : 'border-gray-400'}`} />
                  Horizontal
                </button>
              </div>
            </div>
          </div>

          {/* Actions footer */}
          <div className="p-4 border-t border-gray-100 space-y-2 shrink-0">
            {onFilenameChange && (
              <div className="mb-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nombre del archivo
                </label>
                <input
                  autoFocus
                  value={filename.replace(/\.pdf$/i, '')}
                  onChange={(e) => onFilenameChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border-2 border-blue-300 bg-blue-50/50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition dark:border-blue-800 dark:bg-blue-950/40 dark:text-white dark:focus:bg-slate-900"
                  placeholder="Nombre del documento..."
                />
                <p className="text-[11px] text-blue-500 mt-1">Edita el nombre antes de descargar</p>
              </div>
            )}
            <button
              onClick={handlePrint}
              disabled={!blobUrl || loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button
              onClick={handleDownload}
              disabled={!blobUrl || loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Descargar PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
