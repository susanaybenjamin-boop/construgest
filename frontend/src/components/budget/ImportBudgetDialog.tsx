'use client'

import { useState, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { useBudgetStore } from '@/stores/budgetStore'
import { useNotificationStore } from '@/stores/notificationStore'
import {
  X, Upload, FileText, Loader2, Sparkles, Check, ChevronDown, ChevronRight,
  AlertCircle, Ruler,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ParsedMeasurement {
  description: string
  units: number
  length: number
  width: number
  height: number
  partial: number
}

interface ParsedItem {
  code: string
  name: string
  description?: string
  unit: string
  quantity: number
  unit_price: number
  measurements?: ParsedMeasurement[]
}

interface ParsedChapter {
  code: string
  name: string
  items: ParsedItem[]
}

interface ParsedResult {
  chapters: ParsedChapter[]
}

interface ImportBudgetDialogProps {
  isOpen: boolean
  onClose: () => void
  budgetId: string
  projectId: string
  onImportComplete: () => void
}

export default function ImportBudgetDialog({
  isOpen,
  onClose,
  budgetId,
  projectId,
  onImportComplete,
}: ImportBudgetDialogProps) {
  const { addToast } = useNotificationStore()
  const { addChapter, addItem, loadFullBudget, autoRenumberChapters } = useBudgetStore()

  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload')
  const [pdfText, setPdfText] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState<'pdf' | 'bc3' | 'pzh'>('pdf')
  const [binaryFileData, setBinaryFileData] = useState<string | null>(null) // base64
  const [pdfBase64, setPdfBase64] = useState<string | null>(null) // PDF original en base64
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null)
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set())
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [expandedMeasurements, setExpandedMeasurements] = useState<Set<string>>(new Set())
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, phase: '' })
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetDialog = useCallback(() => {
    setStep('upload')
    setPdfText('')
    setFileName('')
    setFileType('pdf')
    setBinaryFileData(null)
    setPdfBase64(null)
    setParsing(false)
    setImporting(false)
    setParsedResult(null)
    setSelectedChapters(new Set())
    setSelectedItems(new Set())
    setExpandedChapters(new Set())
    setExpandedMeasurements(new Set())
    setImportProgress({ current: 0, total: 0, phase: '' })
    setDragOver(false)
  }, [])

  const handleClose = () => {
    resetDialog()
    onClose()
  }

  const SUPPORTED_EXTENSIONS = ['.pdf', '.bc3', '.pzh']

  const getFileExtension = (name: string) => {
    const dot = name.lastIndexOf('.')
    return dot >= 0 ? name.substring(dot).toLowerCase() : ''
  }

  const handleFileSelect = async (file: File) => {
    const ext = getFileExtension(file.name)

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      addToast('error', `Formato no soportado. Formatos admitidos: ${SUPPORTED_EXTENSIONS.join(', ')}`)
      return
    }

    setFileName(file.name)
    const arrayBuffer = await file.arrayBuffer()

    if (ext === '.bc3' || ext === '.pzh') {
      // Archivos binarios: enviar como base64 al backend
      const detectedType = ext === '.bc3' ? 'bc3' : 'pzh'
      setFileType(detectedType as 'bc3' | 'pzh')
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      setBinaryFileData(base64)
      setPdfText('') // no text for binary files
      addToast('success', `Archivo ${ext.toUpperCase()} cargado correctamente`)
    } else {
      // PDF: extraer texto
      setFileType('pdf')
      setBinaryFileData(null)
      // Guardar PDF original como base64 para OCR con Gemini Vision
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      setPdfBase64(btoa(binary))
      try {
        const text = await extractTextFromPdf(arrayBuffer)
        if (text.trim()) {
          setPdfText(text)
        } else {
          addToast('warning', 'No se pudo extraer texto del PDF. Puede pegar el texto manualmente.')
        }
      } catch {
        addToast('warning', 'Error al leer el PDF. Puede pegar el texto manualmente.')
      }
    }
  }

  const extractTextFromPdf = async (buffer: ArrayBuffer): Promise<string> => {
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
      const pageTexts: string[] = []

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()

        const LINE_TOLERANCE = 3
        const lines: { y: number; items: { x: number; str: string; width: number }[] }[] = []

        for (const item of content.items as any[]) {
          if (!('str' in item) || !item.str) continue
          const y = Math.round(item.transform[5])
          const x = item.transform[4]
          const width = item.width || 0

          let found = false
          for (const line of lines) {
            if (Math.abs(line.y - y) <= LINE_TOLERANCE) {
              line.items.push({ x, str: item.str, width })
              found = true
              break
            }
          }
          if (!found) {
            lines.push({ y, items: [{ x, str: item.str, width }] })
          }
        }

        lines.sort((a, b) => b.y - a.y)

        const lineTexts: string[] = []
        for (const line of lines) {
          line.items.sort((a, b) => a.x - b.x)

          const DEDUP_X_TOLERANCE = 3
          const dedupedItems: typeof line.items = []
          for (const item of line.items) {
            const last = dedupedItems[dedupedItems.length - 1]
            if (last && Math.abs(last.x - item.x) < DEDUP_X_TOLERANCE && last.str === item.str) {
              continue
            }
            dedupedItems.push(item)
          }

          let lineStr = ''
          for (let j = 0; j < dedupedItems.length; j++) {
            const item = dedupedItems[j]
            if (j > 0) {
              const prev = dedupedItems[j - 1]
              const gap = item.x - (prev.x + prev.width)
              if (gap > 15) {
                lineStr += '    '
              } else if (gap > 2) {
                lineStr += ' '
              }
            }
            lineStr += item.str
          }

          const trimmed = lineStr.trim()
          if (trimmed) lineTexts.push(trimmed)
        }

        pageTexts.push(lineTexts.join('\n'))
      }

      return pageTexts.join('\n\n')
    } catch {
      return ''
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleAnalyze = async () => {
    if (!pdfText.trim() && !binaryFileData) {
      addToast('error', 'Debe proporcionar un archivo o texto para analizar')
      return
    }

    setParsing(true)
    try {
      let data: ParsedResult

      if (binaryFileData && (fileType === 'bc3' || fileType === 'pzh')) {
        // Parseo nativo de archivos BC3/PZH
        const resp = await api.post<ParsedResult>('/ai/parse-budget-file', {
          fileData: binaryFileData,
          fileType,
        })
        data = resp.data
      } else {
        // Parseo de PDF: envía texto + PDF original para OCR dual
        const resp = await api.post<ParsedResult>('/ai/parse-budget-pdf', {
          text: pdfText,
          ...(pdfBase64 ? { pdfBase64 } : {}),
        })
        data = resp.data
      }

      if (data.chapters && data.chapters.length > 0) {
        setParsedResult(data)
        const chapterCodes = new Set(data.chapters.map(c => c.code))
        const itemCodes = new Set(
          data.chapters.flatMap(c => c.items.map(i => `${c.code}::${i.code}`))
        )
        setSelectedChapters(chapterCodes)
        setSelectedItems(itemCodes)
        setExpandedChapters(new Set(data.chapters.map(c => c.code)))
        // Auto-expand items that have measurements
        const withMeasurements = new Set<string>()
        data.chapters.forEach(c => c.items.forEach(i => {
          if (i.measurements && i.measurements.length > 0) {
            withMeasurements.add(`${c.code}::${i.code}`)
          }
        }))
        setExpandedMeasurements(withMeasurements)
        setStep('preview')
      } else {
        addToast('error', 'No se pudieron extraer capítulos del texto')
      }
    } catch {
      addToast('error', 'Error al analizar el texto con IA')
    } finally {
      setParsing(false)
    }
  }

  const toggleChapter = (code: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  const toggleMeasurements = (key: string) => {
    setExpandedMeasurements(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleSelectChapter = (chapter: ParsedChapter) => {
    const isSelected = selectedChapters.has(chapter.code)
    setSelectedChapters(prev => {
      const next = new Set(prev)
      if (isSelected) {
        next.delete(chapter.code)
      } else {
        next.add(chapter.code)
      }
      return next
    })
    setSelectedItems(prev => {
      const next = new Set(prev)
      chapter.items.forEach(item => {
        const key = `${chapter.code}::${item.code}`
        if (isSelected) {
          next.delete(key)
        } else {
          next.add(key)
        }
      })
      return next
    })
  }

  const toggleSelectItem = (chapterCode: string, itemCode: string) => {
    const key = `${chapterCode}::${itemCode}`
    setSelectedItems(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Count total measurements
  const totalMeasurements = parsedResult
    ? parsedResult.chapters.reduce((s, c) =>
      s + c.items.reduce((si, i) => si + (i.measurements?.length || 0), 0), 0)
    : 0

  const handleImport = async () => {
    if (!parsedResult) return

    setImporting(true)
    setStep('importing')

    const chaptersToImport = parsedResult.chapters.filter(c => selectedChapters.has(c.code))
    let totalItems = 0
    let totalMeas = 0
    chaptersToImport.forEach(c => {
      const selected = c.items.filter(i => selectedItems.has(`${c.code}::${i.code}`))
      totalItems += selected.length
      totalMeas += selected.reduce((s, i) => s + (i.measurements?.length || 0), 0)
    })
    const total = chaptersToImport.length + totalItems + (totalMeas > 0 ? totalItems : 0)
    setImportProgress({ current: 0, total, phase: 'Creando capítulos...' })

    try {
      let progress = 0

      for (let ci = 0; ci < chaptersToImport.length; ci++) {
        const chapter = chaptersToImport[ci]

        // Create chapter
        const { data: createdChapter } = await api.post(`/budgets/${budgetId}/chapters`, {
          code: chapter.code,
          name: chapter.name,
          sort_order: ci + 1,
        })

        progress++
        setImportProgress({ current: progress, total, phase: `Capítulo ${chapter.code}...` })

        // Create items for this chapter
        const itemsToImport = chapter.items.filter(i =>
          selectedItems.has(`${chapter.code}::${i.code}`)
        )

        for (let ii = 0; ii < itemsToImport.length; ii++) {
          const item = itemsToImport[ii]

          const { data: createdItem } = await api.post(`/budgets/chapters/${createdChapter.id}/items`, {
            code: item.code,
            name: item.name,
            description: item.description || null,
            unit: item.unit || 'ud',
            quantity: item.quantity || 0,
            unit_price: item.unit_price || 0,
            cost_price: 0,
            sort_order: ii + 1,
          })

          progress++
          setImportProgress({
            current: progress,
            total,
            phase: `${item.code} ${item.name.substring(0, 30)}...`
          })

          // Import measurements for this item (bulk)
          if (item.measurements && item.measurements.length > 0) {
            try {
              await api.post(`/budgets/items/${createdItem.id}/measurements/bulk`, {
                measurements: item.measurements.map((m, idx) => ({
                  description: m.description || '',
                  units: m.units ?? 1,
                  length: m.length ?? 0,
                  width: m.width ?? 0,
                  height: m.height ?? 0,
                  partial: m.partial ?? 0,
                  sort_order: idx + 1,
                }))
              })
            } catch {
              // Non-critical — log but continue
              console.warn(`Failed to import measurements for ${item.code}`)
            }
            progress++
            setImportProgress({
              current: progress,
              total,
              phase: `Mediciones de ${item.code}...`
            })
          }
        }
      }

      await loadFullBudget(budgetId)

      // Auto-renumber chapters sequentially (01, 02, 03...) and then renumber all item codes
      setImportProgress({ current: progress, total, phase: 'Renumerando capítulos...' })
      await autoRenumberChapters()

      const measMsg = totalMeas > 0 ? ` y ${totalMeas} mediciones` : ''
      addToast('success', `Importados ${chaptersToImport.length} capítulos, ${totalItems} partidas${measMsg}`)
      onImportComplete()
      handleClose()
    } catch {
      addToast('error', 'Error durante la importación')
      setStep('preview')
    } finally {
      setImporting(false)
    }
  }

  const selectedTotal = parsedResult
    ? parsedResult.chapters
        .filter(c => selectedChapters.has(c.code))
        .reduce((sum, ch) => {
          return sum + ch.items
            .filter(i => selectedItems.has(`${ch.code}::${i.code}`))
            .reduce((s, i) => s + (i.quantity * i.unit_price), 0)
        }, 0)
    : 0

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Importar Presupuesto</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === 'upload' && 'Sube un archivo PDF, BC3 o PZH, o pega el texto del presupuesto'}
              {step === 'preview' && 'Revisa y selecciona lo que deseas importar'}
              {step === 'importing' && 'Importando...'}
            </p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Upload / Text Input */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition
                  ${dragOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.bc3,.pzh"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                  }}
                />
                <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
                <p className="text-sm font-medium text-gray-700">
                  {fileName || 'Arrastra un archivo aquí o haz clic para seleccionar'}
                </p>
                {fileName && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-sm text-green-600">
                    <FileText className="w-4 h-4" />
                    {fileName}
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium uppercase">
                      {fileType}
                    </span>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">PDF, BC3 (FIEBDC-3) o PZH (Presto)</p>
              </div>

              {/* Textarea solo para PDF / texto manual — no para BC3/PZH */}
              {fileType === 'pdf' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Texto del presupuesto
                  </label>
                  <textarea
                    value={pdfText}
                    onChange={(e) => setPdfText(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-mono resize-none"
                    placeholder="Pegue aquí el texto extraído del PDF de presupuesto, o suba el archivo arriba..."
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {pdfText.length > 0 ? `${pdfText.length} caracteres` : 'Puede editar el texto antes de analizar'}
                  </p>
                </div>
              )}
              {(fileType === 'bc3' || fileType === 'pzh') && binaryFileData && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">
                    Archivo {fileType.toUpperCase()} cargado ({(binaryFileData.length * 0.75 / 1024).toFixed(0)} KB)
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    {fileType === 'bc3'
                      ? 'Formato FIEBDC-3 — se extraerán capítulos, partidas, precios y mediciones directamente'
                      : 'Formato Presto — se extraerán capítulos, partidas y precios del archivo binario'
                    }
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && parsedResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Se encontraron <strong>{parsedResult.chapters.length}</strong> capítulos,{' '}
                  <strong>{parsedResult.chapters.reduce((s, c) => s + c.items.length, 0)}</strong> partidas
                  {totalMeasurements > 0 && (
                    <> y <strong>{totalMeasurements}</strong> mediciones</>
                  )}.
                  Deseleccione lo que no desee importar.
                </span>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[28px_60px_1fr_50px_70px_80px_90px] gap-1 px-3 py-2 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span></span>
                  <span>Cod.</span>
                  <span>Descripcion</span>
                  <span className="text-center">Ud.</span>
                  <span className="text-right">Cant.</span>
                  <span className="text-right">P.Unit.</span>
                  <span className="text-right">Importe</span>
                </div>

                {parsedResult.chapters.map((chapter) => (
                  <div key={chapter.code}>
                    {/* Chapter Row */}
                    <div className="grid grid-cols-[28px_60px_1fr_50px_70px_80px_90px] gap-1 px-3 py-2.5 bg-blue-50/60 border-b border-blue-100 hover:bg-blue-50 transition group">
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedChapters.has(chapter.code)}
                          onChange={() => toggleSelectChapter(chapter)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                      <span
                        className="font-bold text-blue-700 text-sm cursor-pointer flex items-center gap-1"
                        onClick={() => toggleChapter(chapter.code)}
                      >
                        {expandedChapters.has(chapter.code)
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />
                        }
                        {chapter.code}
                      </span>
                      <span className="font-semibold text-gray-900 text-sm">{chapter.name}</span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span className="text-right font-bold text-gray-900 text-sm">
                        {formatCurrency(
                          chapter.items
                            .filter(i => selectedItems.has(`${chapter.code}::${i.code}`))
                            .reduce((s, i) => s + i.quantity * i.unit_price, 0)
                        )}
                      </span>
                    </div>

                    {/* Items */}
                    {expandedChapters.has(chapter.code) && chapter.items.map((item) => {
                      const itemKey = `${chapter.code}::${item.code}`
                      const hasMeas = item.measurements && item.measurements.length > 0
                      const measExpanded = expandedMeasurements.has(itemKey)

                      return (
                        <div key={itemKey}>
                          <div
                            className={`grid grid-cols-[28px_60px_1fr_50px_70px_80px_90px] gap-1 px-3 py-2 border-b border-gray-50 text-sm transition
                              ${selectedItems.has(itemKey) ? 'bg-white' : 'bg-gray-50 opacity-50'}`}
                          >
                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                checked={selectedItems.has(itemKey)}
                                onChange={() => toggleSelectItem(chapter.code, item.code)}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </div>
                            <span className="text-gray-500 pl-4">{item.code}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-gray-900 truncate">{item.name}</span>
                                {hasMeas && (
                                  <button
                                    onClick={() => toggleMeasurements(itemKey)}
                                    className="flex-shrink-0 flex items-center gap-0.5 text-blue-500 hover:text-blue-700 transition"
                                    title={`${item.measurements!.length} mediciones`}
                                  >
                                    <Ruler className="w-3 h-3" />
                                    <span className="text-[10px] font-medium">{item.measurements!.length}</span>
                                    {measExpanded
                                      ? <ChevronDown className="w-3 h-3" />
                                      : <ChevronRight className="w-3 h-3" />
                                    }
                                  </button>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
                              )}
                            </div>
                            <span className="text-center text-gray-500">{item.unit}</span>
                            <span className="text-right text-gray-700">{item.quantity}</span>
                            <span className="text-right text-gray-700">{formatCurrency(item.unit_price)}</span>
                            <span className="text-right font-medium">
                              {formatCurrency(item.quantity * item.unit_price)}
                            </span>
                          </div>

                          {/* Measurements detail */}
                          {hasMeas && measExpanded && selectedItems.has(itemKey) && (
                            <div className="bg-gray-50/80 border-b border-gray-100 pl-[88px] pr-3 py-1.5">
                              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider grid grid-cols-[1fr_50px_60px_60px_60px_70px] gap-1 px-2 mb-0.5">
                                <span>Descripción</span>
                                <span className="text-right">Uds</span>
                                <span className="text-right">Largo</span>
                                <span className="text-right">Ancho</span>
                                <span className="text-right">Alto</span>
                                <span className="text-right">Parcial</span>
                              </div>
                              {item.measurements!.map((m, mi) => (
                                <div
                                  key={mi}
                                  className={`grid grid-cols-[1fr_50px_60px_60px_60px_70px] gap-1 px-2 py-0.5 text-xs
                                    ${m.units < 0 ? 'text-red-600' : 'text-gray-600'}`}
                                >
                                  <span className="truncate">{m.description || '—'}</span>
                                  <span className="text-right font-mono">{m.units}</span>
                                  <span className="text-right font-mono">{m.length || ''}</span>
                                  <span className="text-right font-mono">{m.width || ''}</span>
                                  <span className="text-right font-mono">{m.height || ''}</span>
                                  <span className={`text-right font-mono font-medium ${m.partial < 0 ? 'text-red-600' : ''}`}>
                                    {m.partial.toFixed(2)}
                                  </span>
                                </div>
                              ))}
                              <div className="grid grid-cols-[1fr_50px_60px_60px_60px_70px] gap-1 px-2 py-1 text-xs border-t border-gray-200 mt-1">
                                <span className="font-medium text-gray-500">Suma parciales</span>
                                <span></span><span></span><span></span><span></span>
                                <span className="text-right font-mono font-bold text-gray-700">
                                  {item.measurements!.reduce((s, m) => s + m.partial, 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}

                {/* Total */}
                <div className="grid grid-cols-[28px_60px_1fr_50px_70px_80px_90px] gap-1 px-3 py-3 bg-gray-50 border-t-2 border-gray-200">
                  <span></span>
                  <span></span>
                  <span className="font-bold text-gray-900">TOTAL SELECCIONADO</span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span className="text-right font-bold text-blue-700">
                    {formatCurrency(selectedTotal)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">Importando presupuesto...</p>
              <p className="text-sm text-gray-500 mb-1">
                {importProgress.current} de {importProgress.total} elementos
              </p>
              <p className="text-xs text-gray-400">{importProgress.phase}</p>
              <div className="w-64 h-2 bg-gray-200 rounded-full mt-4 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{
                    width: importProgress.total > 0
                      ? `${(importProgress.current / importProgress.total) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <div className="text-sm text-gray-500">
            {step === 'preview' && parsedResult && (
              <span>
                {selectedChapters.size} capítulos, {selectedItems.size} partidas
                {totalMeasurements > 0 && `, ${totalMeasurements} mediciones`}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {step === 'upload' && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={(!pdfText.trim() && !binaryFileData) || parsing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm disabled:opacity-50"
                >
                  {parsing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {parsing ? 'Analizando...' : 'Analizar presupuesto'}
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
                >
                  Volver
                </button>
                <button
                  onClick={handleImport}
                  disabled={selectedChapters.size === 0 || importing}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Importar seleccionados
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
