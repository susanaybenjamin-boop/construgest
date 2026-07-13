'use client'

import React, { useState, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSuppliersStore } from '@/stores/suppliersStore'
import type { Material, Supplier } from '@/types'
import {
  X, Upload, FileText, Loader2, Sparkles, Check, AlertTriangle, Plus,
  Building2, ChevronDown, ChevronRight, Package, FileSpreadsheet, SkipForward, Hash,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedMaterial {
  name: string
  unit: string
  unit_price: number
  code?: string
}

type MatchStatus = 'create' | 'update' | 'possible' | 'skip'

interface ReviewMaterial extends ExtractedMaterial {
  action: MatchStatus
  existing_material_id?: string
  existing_name?: string
  similarity_score?: number
}

interface SupplierDescription {
  material_id: string
  supplier_id: string
  supplier_description: string
}

interface SheetGroup {
  sheetName: string
  materials: ReviewMaterial[]
  supplierId: string
  newSupplierName: string
  showNewSupplier: boolean
  expanded: boolean
  codePrefix: string       // editable prefix for new material codes
  prefixLoading: boolean   // loading state while fetching supplier prefix
}

interface ImportMaterialsModalProps {
  isOpen: boolean
  onClose: () => void
  existingMaterials: Material[]
  onImportComplete: () => void
}

// ─── Similarity helpers ───────────────────────────────────────────────────────

function normalizeTokens(s: string): Set<string> {
  const tokens = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
  return new Set(tokens)
}

function jaccardSimilarity(a: string, b: string): number {
  const tokA = normalizeTokens(a)
  const tokB = normalizeTokens(b)
  if (tokA.size === 0 || tokB.size === 0) return 0
  const intersection = [...tokA].filter(t => tokB.has(t)).length
  const union = new Set([...tokA, ...tokB]).size
  return intersection / union
}

function findBestMatch(
  name: string,
  existing: Material[],
  supplierDescs: SupplierDescription[],
): { material: Material; score: number } | null {
  const normalizedName = name.trim().toLowerCase()
  for (const desc of supplierDescs) {
    if (desc.supplier_description.trim().toLowerCase() === normalizedName) {
      const mat = existing.find(m => m.id === desc.material_id)
      if (mat) return { material: mat, score: 1.0 }
    }
  }
  let bestDescMatch: { material: Material; score: number } | null = null
  for (const desc of supplierDescs) {
    const score = jaccardSimilarity(name, desc.supplier_description)
    const mat = existing.find(m => m.id === desc.material_id)
    if (mat && (!bestDescMatch || score > bestDescMatch.score)) {
      bestDescMatch = { material: mat, score }
    }
  }
  let bestNameMatch: { material: Material; score: number } | null = null
  for (const m of existing) {
    const score = jaccardSimilarity(name, m.name)
    if (!bestNameMatch || score > bestNameMatch.score) bestNameMatch = { material: m, score }
  }
  const candidates = [bestDescMatch, bestNameMatch].filter(Boolean) as { material: Material; score: number }[]
  const best = candidates.sort((a, b) => b.score - a.score)[0] || null
  return best && best.score > 0.3 ? best : null
}

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const lines: { y: number; items: { x: number; str: string }[] }[] = []
    for (const item of content.items as any[]) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const x = item.transform[4]
      const found = lines.find(l => Math.abs(l.y - y) <= 3)
      if (found) found.items.push({ x, str: item.str })
      else lines.push({ y, items: [{ x, str: item.str }] })
    }
    lines.sort((a, b) => b.y - a.y)
    pages.push(lines.map(l => l.items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ')).join('\n'))
  }
  return pages.join('\n--- página ---\n')
}

// ─── Direct Excel parsing (NO AI needed — $0 cost) ───────────────────────────

interface SheetData {
  sheetName: string
  materials: ExtractedMaterial[]
}

const HEADER_PATTERNS = {
  name: /^(descripci[oó]n|material|concepto|nombre|producto|art[ií]culo|denominaci[oó]n|partida)/i,
  unit: /^(ud|unidad|u\.?\s*m\.?|medida|uni)/i,
  price: /^(precio|pvp|coste|importe|p\.?\s*u\.?|p\.?\s*unitario|tarifa|€|euro)/i,
  code: /^(c[oó]digo|ref\.?|referencia|cod\.?|art\.?|sku)/i,
}

function getCellString(cell: any): string {
  const v = cell?.value ?? cell
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '')
  if (typeof v === 'object' && 'richText' in v) return (v.richText || []).map((r: any) => r.text).join('')
  if (typeof v === 'object' && 'text' in v) return String(v.text ?? '')
  return String(v).trim()
}

function getCellNumber(cell: any): number {
  const v = cell?.value ?? cell
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'result' in v) {
    const r = v.result
    if (typeof r === 'number') return r
    return parseSpanishNumber(String(r ?? ''))
  }
  return parseSpanishNumber(String(v ?? ''))
}

function parseSpanishNumber(str: string): number {
  str = str.trim()
  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // Spanish: 1.234,56
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      // English: 1,234.56
      str = str.replace(/,/g, '')
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.')
  }
  str = str.replace(/[^\d.\-]/g, '')
  return parseFloat(str) || 0
}

async function parseExcelDirectly(buffer: ArrayBuffer): Promise<SheetData[]> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const results: SheetData[] = []

  workbook.eachSheet((sheet) => {
    let headerRowIdx = -1
    let colMap = { name: -1, unit: -1, price: -1, code: -1 }

    // Scan first 25 rows for header
    for (let r = 1; r <= Math.min(25, sheet.rowCount); r++) {
      const row = sheet.getRow(r)
      const cells: { col: number; text: string }[] = []
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const str = getCellString(cell)
        if (str) cells.push({ col: colNumber, text: str })
      })

      let foundName = false, foundPrice = false
      const tempMap = { name: -1, unit: -1, price: -1, code: -1 }

      for (const { col, text } of cells) {
        if (HEADER_PATTERNS.name.test(text)) { tempMap.name = col; foundName = true }
        else if (HEADER_PATTERNS.price.test(text)) { tempMap.price = col; foundPrice = true }
        else if (HEADER_PATTERNS.unit.test(text)) { tempMap.unit = col }
        else if (HEADER_PATTERNS.code.test(text)) { tempMap.code = col }
      }

      if (foundName && foundPrice) {
        headerRowIdx = r
        colMap = tempMap
        break
      }
    }

    if (headerRowIdx === -1) return

    const materials: ExtractedMaterial[] = []

    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)

      const name = getCellString(row.getCell(colMap.name))
      const price = getCellNumber(row.getCell(colMap.price))

      if (!name || price < 0) continue
      if (/^(total|subtotal|suma|iva|impuesto|base\s+imponible)/i.test(name.trim())) continue

      const unit = colMap.unit > 0 ? getCellString(row.getCell(colMap.unit)) || 'ud' : 'ud'
      const code = colMap.code > 0 ? getCellString(row.getCell(colMap.code)) || undefined : undefined

      materials.push({ name, unit, unit_price: Math.round(price * 100) / 100, code: code || undefined })
    }

    if (materials.length > 0) {
      results.push({ sheetName: sheet.name, materials })
    }
  })

  return results
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportMaterialsModal({
  isOpen,
  onClose,
  existingMaterials,
  onImportComplete,
}: ImportMaterialsModalProps) {
  const { addToast } = useNotificationStore()
  const { suppliers, loadSuppliers } = useSuppliersStore()

  type Step = 'upload' | 'review' | 'importing'
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractMethod, setExtractMethod] = useState<'direct' | 'ai'>('direct')
  const [sheetGroups, setSheetGroups] = useState<SheetGroup[]>([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStep('upload')
    setFileName('')
    setDragOver(false)
    setExtracting(false)
    setExtractMethod('direct')
    setSheetGroups([])
    setImporting(false)
    setImportProgress('')
  }, [])

  const handleClose = () => { reset(); onClose() }

  // ── Match extracted materials against existing ──────────────────────────
  const applyMatching = (
    materials: ExtractedMaterial[],
    supplierDescs: SupplierDescription[],
  ): ReviewMaterial[] => {
    return materials.map(mat => {
      const best = findBestMatch(mat.name, existingMaterials, supplierDescs)
      let action: MatchStatus = 'create'
      let existing_material_id: string | undefined
      let existing_name: string | undefined
      let similarity_score: number | undefined

      if (best) {
        similarity_score = best.score
        existing_material_id = best.material.id
        existing_name = best.material.name
        if (best.score >= 0.65) action = 'update'
        else if (best.score >= 0.35) action = 'possible'
      }

      return { ...mat, action, existing_material_id, existing_name, similarity_score }
    })
  }

  // ── File processing ──────────────────────────────────────────────────────

  const processFile = async (file: File) => {
    const isExcel = /\.(xlsx|xls)$/i.test(file.name)
    const isPdf = /\.pdf$/i.test(file.name)
    if (!isExcel && !isPdf) {
      addToast('error', 'Solo se permiten archivos Excel (.xlsx, .xls) o PDF')
      return
    }

    setFileName(file.name)
    setExtracting(true)

    try {
      const buffer = await file.arrayBuffer()

      // Load supplier descriptions for duplicate detection
      let supplierDescs: SupplierDescription[] = []
      try {
        const descRes = await api.get<SupplierDescription[]>('/supplier-materials/descriptions')
        supplierDescs = descRes.data || []
      } catch { /* ignore */ }

      await loadSuppliers()

      if (isExcel) {
        // ── EXCEL: Direct parsing — NO AI, $0 cost ──
        setExtractMethod('direct')
        const sheets = await parseExcelDirectly(buffer)

        if (sheets.length === 0) {
          // Fallback: try AI extraction if direct parsing found nothing
          setExtractMethod('ai')
          const text = await extractExcelText(buffer)
          if (!text.trim()) {
            addToast('error', 'No se pudieron detectar materiales en el archivo')
            setExtracting(false)
            return
          }
          const { data } = await api.post<ExtractedMaterial[]>('/ai/extract-materials', {
            text,
            filename: file.name,
          })
          const extracted = Array.isArray(data) ? data : []
          if (extracted.length === 0) {
            addToast('warning', 'No se encontraron materiales con precios en el archivo')
            setExtracting(false)
            return
          }
          const reviewed = applyMatching(extracted, supplierDescs)
          setSheetGroups([{
            sheetName: file.name.replace(/\.[^.]+$/, ''),
            materials: reviewed,
            supplierId: '',
            newSupplierName: '',
            showNewSupplier: false,
            expanded: true,
            codePrefix: '',
            prefixLoading: false,
          }])
        } else {
          // Direct parsing succeeded — create groups per sheet
          const groups: SheetGroup[] = sheets.map((s, i) => ({
            sheetName: s.sheetName,
            materials: applyMatching(s.materials, supplierDescs),
            supplierId: '',
            newSupplierName: '',
            showNewSupplier: false,
            expanded: i === 0 || sheets.length <= 3,
            codePrefix: '',
            prefixLoading: false,
          }))
          setSheetGroups(groups)
        }
      } else {
        // ── PDF: Use AI (Haiku — cheap) ──
        setExtractMethod('ai')
        const text = await extractTextFromPdf(buffer)
        if (!text.trim()) {
          addToast('error', 'No se pudo extraer contenido del PDF')
          setExtracting(false)
          return
        }
        const { data } = await api.post<ExtractedMaterial[]>('/ai/extract-materials', {
          text,
          filename: file.name,
        })
        const extracted = Array.isArray(data) ? data : []
        if (extracted.length === 0) {
          addToast('warning', 'No se encontraron materiales con precios en el PDF')
          setExtracting(false)
          return
        }
        const reviewed = applyMatching(extracted, supplierDescs)
        setSheetGroups([{
          sheetName: file.name.replace(/\.[^.]+$/, ''),
          materials: reviewed,
          supplierId: '',
          newSupplierName: '',
          showNewSupplier: false,
          expanded: true,
          codePrefix: '',
          prefixLoading: false,
        }])
      }

      setStep('review')
    } catch (err: any) {
      addToast('error', err?.response?.data?.error || 'Error al procesar el archivo')
    } finally {
      setExtracting(false)
    }
  }

  // Fallback Excel text extraction for AI
  async function extractExcelText(buffer: ArrayBuffer): Promise<string> {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheetTexts: string[] = []
    workbook.eachSheet((sheet) => {
      const rows: string[] = []
      sheet.eachRow((row) => {
        const cells: string[] = []
        row.eachCell({ includeEmpty: false }, (cell) => {
          const str = getCellString(cell)
          if (str) cells.push(str)
        })
        if (cells.length > 0) rows.push(cells.join('\t'))
      })
      if (rows.length > 0) {
        sheetTexts.push(`=== HOJA: ${sheet.name} ===\n${rows.join('\n')}`)
      }
    })
    return sheetTexts.join('\n\n')
  }

  const handleFileSelect = (file: File) => processFile(file)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  // ── Group/material actions ─────────────────────────────────────────────

  const updateGroup = (groupIdx: number, patch: Partial<SheetGroup>) => {
    setSheetGroups(prev => prev.map((g, i) => i === groupIdx ? { ...g, ...patch } : g))
  }

  // When supplier is selected, fetch its existing prefix
  const handleSupplierChange = async (groupIdx: number, supplierId: string) => {
    updateGroup(groupIdx, { supplierId, prefixLoading: true, codePrefix: '' })
    if (!supplierId) {
      updateGroup(groupIdx, { supplierId: '', prefixLoading: false, codePrefix: '' })
      return
    }
    try {
      const { data } = await api.get<{ prefix: string; count: number }[]>(
        `/materials/prefixes?supplier_id=${supplierId}`,
      )
      const topPrefix = data?.[0]?.prefix || ''
      updateGroup(groupIdx, { supplierId, prefixLoading: false, codePrefix: topPrefix })
    } catch {
      updateGroup(groupIdx, { supplierId, prefixLoading: false, codePrefix: '' })
    }
  }

  const setMaterialAction = (groupIdx: number, matIdx: number, action: MatchStatus) => {
    setSheetGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g
      return { ...g, materials: g.materials.map((m, j) => j === matIdx ? { ...m, action } : m) }
    }))
  }

  const setMaterialCode = (groupIdx: number, matIdx: number, code: string) => {
    setSheetGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g
      return { ...g, materials: g.materials.map((m, j) => j === matIdx ? { ...m, code } : m) }
    }))
  }

  // ── Import ──────────────────────────────────────────────────────────────

  const handleImport = async () => {
    // Validate all groups have a supplier
    for (const group of sheetGroups) {
      const hasSupplier = group.supplierId || (group.showNewSupplier && group.newSupplierName.trim())
      if (!hasSupplier) {
        addToast('error', `Selecciona un proveedor para "${group.sheetName}"`)
        return
      }
    }

    const totalToImport = sheetGroups.reduce(
      (sum, g) => sum + g.materials.filter(m => m.action !== 'skip').length, 0,
    )
    if (totalToImport === 0) {
      addToast('warning', 'No hay materiales para importar')
      return
    }

    setImporting(true)
    setStep('importing')

    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0

    try {
      for (let gi = 0; gi < sheetGroups.length; gi++) {
        const group = sheetGroups[gi]
        const groupMaterials = group.materials.filter(m => m.action !== 'skip')
        if (groupMaterials.length === 0) continue

        setImportProgress(`Importando "${group.sheetName}" (${gi + 1}/${sheetGroups.length})…`)

        const payload: Record<string, any> = {
          materials: group.materials.map(m => ({
            name: m.name,
            unit: m.unit,
            unit_price: m.unit_price,
            code: m.code,
            action: m.action === 'possible' ? 'create' : m.action,
            existing_material_id: m.action === 'update' ? m.existing_material_id : undefined,
          })),
        }

        if (group.showNewSupplier && group.newSupplierName.trim()) {
          payload.supplier_data = { name: group.newSupplierName.trim(), category: null }
        } else {
          payload.supplier_id = group.supplierId
        }

        if (group.codePrefix.trim()) {
          payload.code_prefix = group.codePrefix.trim()
        }

        const { data } = await api.post<{
          created: number; updated: number; skipped: number; supplier_links: number; supplier_id: string
        }>('/materials/smart-import', payload)

        totalCreated += data.created
        totalUpdated += data.updated
        totalSkipped += data.skipped
      }

      addToast(
        'success',
        `Importación completada: ${totalCreated} nuevos, ${totalUpdated} actualizados, ${totalSkipped} omitidos`,
      )
      onImportComplete()
      handleClose()
    } catch (err: any) {
      addToast('error', err?.response?.data?.error || 'Error al importar materiales')
      setStep('review')
    } finally {
      setImporting(false)
    }
  }

  // ── Computed values ─────────────────────────────────────────────────────

  const allMaterials = sheetGroups.flatMap(g => g.materials)
  const counts = {
    create: allMaterials.filter(m => m.action === 'create').length,
    update: allMaterials.filter(m => m.action === 'update').length,
    possible: allMaterials.filter(m => m.action === 'possible').length,
    skip: allMaterials.filter(m => m.action === 'skip').length,
  }
  const allGroupsHaveSupplier = sheetGroups.every(g =>
    g.supplierId || (g.showNewSupplier && g.newSupplierName.trim()),
  )

  // ── Render ──────────────────────────────────────────────────────────────

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Importar materiales de proveedor</h2>
              <p className="text-sm text-gray-500">Excel (.xlsx) o PDF · detecta duplicados automáticamente</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 border-b text-sm">
          {(['upload', 'review'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-300" />}
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${
                step === s ? 'bg-blue-600 text-white' :
                (step === 'review' && s === 'upload') || step === 'importing'
                  ? 'bg-green-100 text-green-700'
                  : 'text-gray-400'
              }`}>
                {((step === 'review' && s === 'upload') || step === 'importing') && (
                  <Check className="w-3.5 h-3.5" />
                )}
                {s === 'upload' ? '1. Archivo' : '2. Revisar y asignar'}
              </span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition ${
                  dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
              >
                {extracting ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                    <p className="text-gray-600 font-medium">
                      {extractMethod === 'direct' ? 'Analizando archivo…' : 'Extrayendo materiales con IA…'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {extractMethod === 'direct' ? 'Lectura directa del Excel (sin coste)' : 'Esto puede tardar unos segundos'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex gap-3 justify-center">
                      <FileSpreadsheet className="w-10 h-10 text-green-500" />
                      <FileText className="w-10 h-10 text-red-400" />
                    </div>
                    <p className="text-gray-700 font-medium">Arrastra tu archivo aquí o haz clic para seleccionar</p>
                    <p className="text-sm text-gray-400">Excel (.xlsx, .xls) o PDF</p>
                    <div className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                      <Upload className="w-4 h-4 inline mr-1.5" />
                      Seleccionar archivo
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                />
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                <Sparkles className="w-4 h-4 inline mr-1.5" />
                <strong>Excel</strong>: lectura directa de columnas (sin coste).
                <strong className="ml-2">PDF</strong>: extracción con IA (coste mínimo).
                {' '}Si el Excel tiene varias hojas, cada una se importa por separado con su proveedor.
              </div>
            </div>
          )}

          {/* STEP 2: Review + Assign suppliers */}
          {step === 'review' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between">
                <div className="flex gap-3">
                  {[
                    { label: 'Nuevos', count: counts.create, color: 'green' },
                    { label: 'Actualizar', count: counts.update, color: 'blue' },
                    { label: 'Revisar', count: counts.possible, color: 'yellow' },
                    { label: 'Omitir', count: counts.skip, color: 'gray' },
                  ].map(({ label, count, color }) => (
                    <span key={label} className={`px-2.5 py-1 rounded-full text-xs font-medium bg-${color}-100 text-${color}-700`}>
                      {count} {label}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-gray-400">
                  {extractMethod === 'direct' ? 'Lectura directa (sin coste)' : 'Extraído con IA'}
                </span>
              </div>

              {/* Sheet groups */}
              {sheetGroups.map((group, gi) => (
                <div key={gi} className="border rounded-xl overflow-hidden">
                  {/* Group header */}
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => updateGroup(gi, { expanded: !group.expanded })}
                        className="flex items-center gap-2 text-sm font-semibold text-gray-800 hover:text-gray-600"
                      >
                        {group.expanded
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />
                        }
                        <FileSpreadsheet className="w-4 h-4 text-green-600" />
                        {group.sheetName}
                        <span className="text-xs font-normal text-gray-500">
                          ({group.materials.length} materiales)
                        </span>
                      </button>
                    </div>

                    {/* Inline supplier selector */}
                    <div className="mt-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      {!group.showNewSupplier ? (
                        <>
                          <select
                            value={group.supplierId}
                            onChange={e => handleSupplierChange(gi, e.target.value)}
                            className={`flex-1 px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${
                              !group.supplierId ? 'border-orange-300 bg-orange-50' : 'border-gray-300'
                            }`}
                          >
                            <option value="">— Seleccionar proveedor —</option>
                            {suppliers.map(s => (
                              <option key={s.id} value={s.id}>{s.name}{s.category ? ` · ${s.category}` : ''}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => updateGroup(gi, { supplierId: '', showNewSupplier: true })}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium border border-blue-200 rounded-lg hover:bg-blue-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Nuevo
                          </button>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={group.newSupplierName}
                            onChange={e => updateGroup(gi, { newSupplierName: e.target.value })}
                            placeholder="Nombre del nuevo proveedor"
                            className={`flex-1 px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${
                              !group.newSupplierName.trim() ? 'border-orange-300 bg-orange-50' : 'border-gray-300'
                            }`}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => updateGroup(gi, { showNewSupplier: false, newSupplierName: '' })}
                            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 border rounded-lg"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Code prefix — shown when supplier is selected and there are new materials */}
                    {(group.supplierId || (group.showNewSupplier && group.newSupplierName.trim())) &&
                      group.materials.some(m => m.action === 'create') && (
                      <div className="mt-2 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500 whitespace-nowrap">Prefijo código:</span>
                        {group.prefixLoading ? (
                          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                        ) : (
                          <input
                            type="text"
                            value={group.codePrefix}
                            onChange={e => updateGroup(gi, { codePrefix: e.target.value.toUpperCase() })}
                            placeholder="Ej: AZUCENA"
                            className="w-32 px-2 py-1 text-xs font-mono border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase"
                          />
                        )}
                        <span className="text-xs text-gray-400">
                          → {group.codePrefix || '???'}-001, {group.codePrefix || '???'}-002…
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Materials table */}
                  {group.expanded && (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50/50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-600 font-medium">Material</th>
                          <th className="text-left px-3 py-2 text-gray-600 font-medium w-28">Código</th>
                          <th className="text-left px-3 py-2 text-gray-600 font-medium w-14">Ud.</th>
                          <th className="text-right px-3 py-2 text-gray-600 font-medium w-20">Precio</th>
                          <th className="text-center px-3 py-2 text-gray-600 font-medium w-36">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.materials.map((item, mi) => (
                          <tr key={mi} className={item.action === 'skip' ? 'opacity-40' : ''}>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900 leading-snug text-xs">{item.name}</div>
                              {item.existing_name && item.action !== 'create' && (
                                <div className="text-xs text-gray-400 mt-0.5 truncate">
                                  ≈ {item.existing_name}
                                  {item.similarity_score !== undefined && (
                                    <span className="ml-1 text-gray-300">({Math.round(item.similarity_score * 100)}%)</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {item.action === 'create' ? (
                                <input
                                  type="text"
                                  value={item.code || ''}
                                  onChange={e => setMaterialCode(gi, mi, e.target.value)}
                                  placeholder="Auto"
                                  className="w-full px-2 py-1 text-xs font-mono border rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                              ) : (
                                <span className="text-xs text-gray-400 font-mono">{item.code || '—'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 text-xs">{item.unit}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900 text-xs">
                              {formatCurrency(item.unit_price)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-center">
                                <select
                                  value={item.action}
                                  onChange={e => setMaterialAction(gi, mi, e.target.value as MatchStatus)}
                                  className={`text-xs px-2 py-1 rounded-lg border font-medium ${
                                    item.action === 'create' ? 'bg-green-50 border-green-300 text-green-700' :
                                    item.action === 'update' ? 'bg-blue-50 border-blue-300 text-blue-700' :
                                    item.action === 'possible' ? 'bg-yellow-50 border-yellow-300 text-yellow-700' :
                                    'bg-gray-100 border-gray-200 text-gray-500'
                                  }`}
                                >
                                  <option value="create">+ Crear nuevo</option>
                                  {item.existing_material_id && <option value="update">↑ Actualizar</option>}
                                  {item.existing_material_id && <option value="possible">? Revisar</option>}
                                  <option value="skip">✕ Omitir</option>
                                </select>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* STEP: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <p className="text-gray-700 font-medium">Importando materiales…</p>
              <p className="text-sm text-gray-400">{importProgress || 'Creando materiales y vinculando a proveedores'}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div className="p-6 border-t flex items-center justify-between">
            <button
              onClick={() => { reset(); setStep('upload') }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border rounded-lg hover:bg-gray-50 transition"
            >
              ← Otro archivo
            </button>
            <button
              onClick={handleImport}
              disabled={importing || !allGroupsHaveSupplier || allMaterials.filter(m => m.action !== 'skip').length === 0}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              Importar {allMaterials.filter(m => m.action !== 'skip').length} materiales
              {sheetGroups.length > 1 && ` de ${sheetGroups.length} hojas`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
