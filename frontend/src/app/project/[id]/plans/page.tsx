'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import type { ProjectFile, PlanAnnotation, PlanCalibration } from '@/types'
import { useNotificationStore } from '@/stores/notificationStore'
import { DecimalInput } from '@/components/ui/DecimalInput'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  Map, Upload, Loader2, FileText, ArrowLeft, ZoomIn, ZoomOut,
  Maximize2, MousePointer2, Ruler, PencilRuler, Type, ArrowUpRight,
  Trash2, X, Scale, Image as ImageIcon, ChevronLeft, ChevronRight,
  Minimize2, SquareDashedBottom, Minus, CornerDownRight, Crosshair, Printer, GripVertical
} from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// ─── Types ──────────────────────────────────────────────────────────
type ToolType = 'select' | 'distance' | 'area' | 'text' | 'arrow' | 'calibrate' | 'dimension' | 'line'

interface Point {
  x: number
  y: number
}

interface AnnotationDraft {
  type: ToolType
  points: Point[]
  text?: string
}

// ─── Helpers ────────────────────────────────────────────────────────
function pixelDistance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function polygonArea(pts: Point[]): number {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i].x * pts[j].y
    area -= pts[j].x * pts[i].y
  }
  return Math.abs(area / 2)
}

function applyOrtho(p1: Point, p2: Point): Point {
  const dx = Math.abs(p2.x - p1.x)
  const dy = Math.abs(p2.y - p1.y)
  return dx > dy ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y }
}

function getLineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 0.0001) return null
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a1.x + t * d1x, y: a1.y + t * d1y }
}

function findSnapPoint(pos: Point, annotations: PlanAnnotation[], zoom: number): Point | null {
  const threshold = 15 / zoom
  let closest: Point | null = null
  let minDist = threshold

  const candidates: Point[] = []

  // Collect endpoints and midpoints
  for (const ann of annotations) {
    const pts = (ann.data as Record<string, unknown>).points as Point[] | undefined
    if (!pts) continue
    candidates.push(...pts)
    if (pts.length === 2) {
      candidates.push({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 })
    }
  }

  // Line-line intersections
  const segments: [Point, Point][] = []
  for (const ann of annotations) {
    const pts = (ann.data as Record<string, unknown>).points as Point[] | undefined
    if (!pts || pts.length < 2) continue
    if (['distance', 'dimension', 'arrow', 'line'].includes(ann.annotation_type)) {
      segments.push([pts[0], pts[1]])
    }
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const inter = getLineIntersection(segments[i][0], segments[i][1], segments[j][0], segments[j][1])
      if (inter) candidates.push(inter)
    }
  }

  for (const c of candidates) {
    const d = pixelDistance(pos, c)
    if (d < minDist) { minDist = d; closest = c }
  }
  return closest
}

// ─── Tool definitions ───────────────────────────────────────────────
const TOOLS: { id: ToolType; icon: React.ElementType; label: string; description: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', description: 'Clic para seleccionar anotaciones' },
  { id: 'distance', icon: Ruler, label: 'Distancia', description: 'Clic en 2 puntos para medir' },
  { id: 'dimension', icon: PencilRuler, label: 'Acotar', description: 'Clic 2 puntos, mueve arriba/abajo → X, izq/dcha → Y' },
  { id: 'area', icon: SquareDashedBottom, label: 'Area', description: 'Clic en puntos para crear poligono, doble-clic para cerrar' },
  { id: 'line', icon: Minus, label: 'Linea', description: 'Clic en 2 puntos para dibujar linea' },
  { id: 'text', icon: Type, label: 'Texto', description: 'Clic para anadir texto' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Flecha', description: 'Clic en 2 puntos para dibujar flecha' },
  { id: 'calibrate', icon: Scale, label: 'Calibrar', description: 'Clic en 2 puntos, introducir distancia real' },
]

// ─── Annotation default colors ──────────────────────────────────────
const DEFAULT_ANNOTATION_COLORS: Record<string, string> = {
  distance: '#ef4444',
  area: '#3b82f6',
  text: '#22c55e',
  arrow: '#f59e0b',
  dimension: '#a855f7',
  line: '#8b5cf6',
  calibrate: '#06b6d4',
}

const DEFAULT_ANNOTATION_STYLE = {
  strokeWidth: 2,
  lineStyle: 'solid',
  arrowStyle: 'filled',
  pointSize: 4,
  fontSize: 11,
}

const STORAGE_KEY_COLORS = 'construgest-annotation-colors'
const STORAGE_KEY_STYLE = 'construgest-annotation-style'

function loadStoredColors(): Record<string, string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_COLORS)
    if (stored) return { ...DEFAULT_ANNOTATION_COLORS, ...JSON.parse(stored) }
  } catch {}
  return { ...DEFAULT_ANNOTATION_COLORS }
}

function loadStoredStyle(): typeof DEFAULT_ANNOTATION_STYLE {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_STYLE)
    if (stored) return { ...DEFAULT_ANNOTATION_STYLE, ...JSON.parse(stored) }
  } catch {}
  return { ...DEFAULT_ANNOTATION_STYLE }
}

// ═════════════════════════════════════════════════════════════════════
// ─── Main Page Component ────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════
export default function PlansPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const addToast = useNotificationStore((s) => s.addToast)

  // ─── State ────────────────────────────────────────────────────────
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)

  // Viewer state
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null)
  const [lastViewedFileId, setLastViewedFileId] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string>('')
  const [dxfSvgUrl, setDxfSvgUrl] = useState<string>('')
  const [dxfSvgContent, setDxfSvgContent] = useState<string>('')  // Inline SVG for vector zoom
  const [dxfLayers, setDxfLayers] = useState<{ name: string; color: number; visible: boolean }[]>([])
  const [dxfHiddenLayers, setDxfHiddenLayers] = useState<Set<string>>(new Set())
  const [dxfPages, setDxfPages] = useState<any[]>([])
  const [dxfPageSvgs, setDxfPageSvgs] = useState<Record<string, string>>({})
  const [draggingPageIdx, setDraggingPageIdx] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pageDimensions, setPageDimensions] = useState({ width: 1000, height: 1414 })

  // Zoom & pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOffset = useRef({ x: 0, y: 0 })

  // Tools
  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [annotations, setAnnotations] = useState<PlanAnnotation[]>([])
  const [draft, setDraft] = useState<AnnotationDraft | null>(null)
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null)
  const [calibration, setCalibration] = useState<PlanCalibration | null>(null)

  // Snapping & mouse tracking
  const [mousePos, setMousePos] = useState<Point | null>(null)
  const [snapPoint, setSnapPoint] = useState<Point | null>(null)
  const [orthoMode, setOrthoMode] = useState(false)

  // Fullscreen
  const [isExpanded, setIsExpanded] = useState(false)

  // Dialogs
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false)
  const [calibrationInput, setCalibrationInput] = useState({ distance: '', unit: 'm' })
  const [calibrationPixels, setCalibrationPixels] = useState(0)
  const [showTextDialog, setShowTextDialog] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [textPosition, setTextPosition] = useState<Point>({ x: 0, y: 0 })

  // Annotation style & colors (persisted to localStorage)
  const [annotationColors, setAnnotationColors] = useState<Record<string, string>>(DEFAULT_ANNOTATION_COLORS)
  const [annotationStyle, setAnnotationStyle] = useState(DEFAULT_ANNOTATION_STYLE)
  const colorsInitialized = useRef(false)

  // Load from localStorage on mount (client only)
  useEffect(() => {
    if (!colorsInitialized.current) {
      colorsInitialized.current = true
      setAnnotationColors(loadStoredColors())
      setAnnotationStyle(loadStoredStyle())
    }
  }, [])

  // Persist colors
  const updateAnnotationColors = useCallback((updater: (prev: Record<string, string>) => Record<string, string>) => {
    setAnnotationColors(prev => {
      const next = updater(prev)
      localStorage.setItem(STORAGE_KEY_COLORS, JSON.stringify(next))
      return next
    })
  }, [])

  // Persist style
  const updateAnnotationStyle = useCallback((updater: (prev: typeof DEFAULT_ANNOTATION_STYLE) => typeof DEFAULT_ANNOTATION_STYLE) => {
    setAnnotationStyle(prev => {
      const next = updater(prev)
      localStorage.setItem(STORAGE_KEY_STYLE, JSON.stringify(next))
      return next
    })
  }, [])

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Print with annotations
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printPages, setPrintPages] = useState<Set<number>>(new Set())
  const [printing, setPrinting] = useState(false)

  // Print selection (AutoCAD-style crop)
  const [printSelectionMode, setPrintSelectionMode] = useState(false)
  const [printSelectionRect, setPrintSelectionRect] = useState<{ p1: Point; p2: Point } | null>(null)
  const [printSelectionDraft, setPrintSelectionDraft] = useState<Point | null>(null)
  const [printFitToPage, setPrintFitToPage] = useState(true)


  // Upload & delete
  const [uploading, setUploading] = useState(false)
  const [deletingPage, setDeletingPage] = useState(false)

  // Refs
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageObjRef = useRef<HTMLImageElement | null>(null)

  // ─── Load files ─────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get(`/projects/${projectId}/files`)
      const planFiles = (data as ProjectFile[]).filter(
        (f) => f.category === 'plan' || f.file_type === 'pdf' || f.file_type === 'image' || f.file_type === 'dwg' || f.file_type === 'dxf'
      )
      setFiles(planFiles)
    } catch {
      addToast('error', 'Error al cargar archivos')
    } finally {
      setLoading(false)
    }
  }, [projectId, addToast])

  useEffect(() => {
    if (projectId) loadFiles()
  }, [projectId, loadFiles])

  // ─── DXF multi-page: load SVG when currentPage changes ────────
  useEffect(() => {
    if (!selectedFile || !isDxfFile(selectedFile) || dxfPages.length === 0) return
    const page = dxfPages[currentPage - 1]
    if (!page) return

    // Check if we already have this SVG cached
    if (dxfPageSvgs[page.id]) {
      setDxfSvgUrl(dxfPageSvgs[page.id])
      return
    }

    // Load SVG for this page
    api.get(`/projects/${projectId}/files/${page.id}/dxf-data`)
      .then(({ data }: any) => {
        setDxfSvgUrl(data.svgUrl)
        setDxfPageSvgs(prev => ({ ...prev, [page.id]: data.svgUrl }))
        if (data.layers) setDxfLayers(data.layers)
      })
      .catch(() => setDxfSvgUrl(''))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, dxfPages, selectedFile])

  // ─── Fetch SVG content for inline rendering (vector zoom) ──────
  useEffect(() => {
    if (!dxfSvgUrl) { setDxfSvgContent(''); return }
    let cancelled = false
    fetch(dxfSvgUrl)
      .then(r => r.text())
      .then(svgText => {
        if (cancelled) return
        // Extract viewBox dimensions to set page dimensions
        const vbMatch = svgText.match(/viewBox="([^"]+)"/)
        if (vbMatch) {
          const [, , , w, h] = vbMatch[1].split(/\s+/).map(Number)
          if (w && h) {
            // Scale so the SVG fits nicely (base width ~1200px like PDF)
            const scale = 1200 / w
            setPageDimensions({ width: Math.round(w * scale), height: Math.round(h * scale) })
          }
        }
        // Inject width/height 100% so it fills the container div
        const sized = svgText.replace(
          /<svg([^>]*)>/,
          '<svg$1 width="100%" height="100%" style="display:block">'
        )
        setDxfSvgContent(sized)
      })
      .catch(() => { if (!cancelled) setDxfSvgContent('') })
    return () => { cancelled = true }
  }, [dxfSvgUrl])

  // ─── Image canvas: re-render at higher DPR when zoom changes ───
  useEffect(() => {
    const canvas = imageCanvasRef.current
    if (!canvas || !selectedFile || selectedFile.file_type !== 'image' || !fileUrl) return

    const renderImage = (img: HTMLImageElement) => {
      const baseWidth = 1200
      const scale = baseWidth / img.naturalWidth
      const displayW = Math.round(img.naturalWidth * scale)
      const displayH = Math.round(img.naturalHeight * scale)
      const dpr = Math.min(window.devicePixelRatio * Math.max(zoom, 1), 4)
      canvas.style.width = displayW + 'px'
      canvas.style.height = displayH + 'px'
      canvas.width = Math.round(displayW * dpr)
      canvas.height = Math.round(displayH * dpr)
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.scale(dpr, dpr)
      ctx.drawImage(img, 0, 0, displayW, displayH)
      setPageDimensions({ width: displayW, height: displayH })
    }

    if (imageObjRef.current && imageObjRef.current.complete) {
      renderImage(imageObjRef.current)
    } else {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        imageObjRef.current = img
        renderImage(img)
      }
      img.src = fileUrl
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, zoom, selectedFile?.id])

  // ─── File upload (supports multi-select for DWG/DXF) ───────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.dxf', '.dwg']
    const filesArr = Array.from(fileList)

    // Validate all files
    for (const file of filesArr) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!allowedExts.includes(ext)) {
        addToast('error', `Formato no soportado: ${file.name}`)
        return
      }
      if (file.size > 50 * 1024 * 1024) {
        addToast('error', `Archivo demasiado grande: ${file.name}`)
        return
      }
    }

    // Check if it's a multi-DWG/DXF upload
    const dwgDxfFiles = filesArr.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      return ext === 'dwg' || ext === 'dxf'
    })

    setUploading(true)
    try {
      if (dwgDxfFiles.length > 1) {
        // Multi-DWG upload: group as pages of a single plan
        const formData = new FormData()
        // Sort by name to preserve logical order
        const sorted = [...dwgDxfFiles].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        for (const file of sorted) {
          formData.append('files', file)
        }
        // Use the common prefix as plan name
        const names = sorted.map(f => f.name.replace(/\.[^.]+$/, ''))
        const commonPrefix = names.reduce((prefix, name) => {
          let i = 0
          while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++
          return prefix.substring(0, i)
        }).replace(/[-_ ]+$/, '')
        formData.append('planName', commonPrefix || 'Plano DWG')

        await api.post(`/projects/${projectId}/files/multi-dwg`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        addToast('success', `${sorted.length} archivos importados como plano multi-página`)
      } else {
        // Single file upload
        const formData = new FormData()
        formData.append('file', filesArr[0])
        formData.append('category', 'plan')
        await api.post(`/projects/${projectId}/files`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        addToast('success', 'Plano importado correctamente')
      }
      await loadFiles()
    } catch {
      addToast('error', 'Error al importar el plano')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ─── Open file ──────────────────────────────────────────────────
  const isDxfFile = (f: ProjectFile) => f.file_type === 'dwg' || f.file_type === 'dxf'

  const openFile = async (file: ProjectFile) => {
    try {
      setSelectedFile(file)
      setLastViewedFileId(file.id)
      setDxfSvgUrl('')
      setDxfSvgContent('')
      setDxfLayers([])
      imageObjRef.current = null
      setDxfHiddenLayers(new Set())
      setDxfPages([])
      setCurrentPage(1)
      setTotalPages(1)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setActiveTool('select')
      setFileUrl('')
      // Clear annotations/draft synchronously here (before any await)
      // so they don't race with the useEffect that reloads them
      setDraft(null)
      setAnnotations([])
      setCalibration(null)
      setSelectedAnnotation(null)
      setMousePos(null)
      setSnapPoint(null)

      if (isDxfFile(file)) {
        // DXF/DWG: load SVG viewer (no need for storage URL)
        try {
          // Check if this is a multi-page DWG (has child pages)
          const { data: pages } = await api.get(`/projects/${projectId}/files/${file.id}/pages`)
          const pagesArr = pages as any[]

          if (pagesArr && pagesArr.length > 0) {
            // Multi-page DWG
            setDxfPages(pagesArr)
            setTotalPages(pagesArr.length)
            setCurrentPage(1)

            // Load SVG for first page
            const firstPage = pagesArr[0]
            if (firstPage.dxf_svg_path) {
              const { data: dxfData } = await api.get(`/projects/${projectId}/files/${firstPage.id}/dxf-data`)
              setDxfSvgUrl(dxfData.svgUrl)
              setDxfLayers(dxfData.layers || [])
            }
          } else {
            // Single DXF file
            const { data: dxfData } = await api.get(`/projects/${projectId}/files/${file.id}/dxf-data`)
            setDxfSvgUrl(dxfData.svgUrl)
            setDxfLayers(dxfData.layers || [])
          }
        } catch (dxfErr) {
          console.warn('No DXF data available:', dxfErr)
          addToast('error', 'No se pudo cargar el plano DXF')
        }
      } else {
        // PDF/Image: get signed storage URL
        const { data } = await api.get(`/projects/${projectId}/files/${file.id}/url`)
        setFileUrl((data as { url: string }).url)
      }

    } catch {
      addToast('error', 'Error al abrir el archivo')
    }
  }

  // ─── Delete file ────────────────────────────────────────────────
  const handleDeleteFile = async (file: ProjectFile) => {
    if (!window.confirm(`¿Eliminar "${file.original_name}" y todas sus anotaciones?`)) return
    try {
      await api.delete(`/projects/${projectId}/files/${file.id}`)
      if (selectedFile?.id === file.id) {
        setSelectedFile(null)
        setFileUrl('')
      }
      addToast('success', 'Plano eliminado')
      await loadFiles()
    } catch {
      addToast('error', 'Error al eliminar el plano')
    }
  }

  // ─── Delete PDF page ────────────────────────────────────────────
  const handleDeletePage = async () => {
    if (!selectedFile || totalPages <= 1) return
    if (!window.confirm(`¿Eliminar la pagina ${currentPage} de ${totalPages}? Las anotaciones de esta pagina se perderan.`)) return

    setDeletingPage(true)
    try {
      // Download current PDF
      const response = await fetch(fileUrl)
      const pdfBytes = await response.arrayBuffer()

      // Remove page with pdf-lib
      const { PDFDocument } = await import('pdf-lib')
      const pdfDoc = await PDFDocument.load(pdfBytes)
      pdfDoc.removePage(currentPage - 1)
      const newPdfBytes = await pdfDoc.save()

      // Re-upload modified PDF
      const formData = new FormData()
      const pdfBlob = new Blob([newPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      formData.append('file', new File([pdfBlob], selectedFile.original_name, { type: 'application/pdf' }))
      await api.put(`/projects/${projectId}/files/${selectedFile.id}/replace`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      // Shift page numbers for annotations/calibrations
      await api.post(`/plans/file/${selectedFile.id}/shift-pages`, { deletedPage: currentPage })

      // Adjust current page
      const newTotal = totalPages - 1
      if (currentPage > newTotal) setCurrentPage(newTotal)
      setTotalPages(newTotal)

      // Refresh file URL
      const { data } = await api.get(`/projects/${projectId}/files/${selectedFile.id}/url`)
      setFileUrl((data as { url: string }).url)

      addToast('success', `Pagina ${currentPage} eliminada`)
    } catch (err) {
      console.error('Error deleting page:', err)
      addToast('error', 'Error al eliminar la pagina')
    } finally {
      setDeletingPage(false)
    }
  }

  // ─── Load annotations & calibration ─────────────────────────────
  useEffect(() => {
    if (!selectedFile) return
    const loadAnnotations = async () => {
      try {
        const { data } = await api.get(`/plans/file/${selectedFile.id}/annotations?page=${currentPage}`)
        setAnnotations(data as PlanAnnotation[])
      } catch { /* ignore */ }
    }
    const loadCalibration = async () => {
      try {
        const { data } = await api.get(`/plans/file/${selectedFile.id}/pages/${currentPage}/calibration`)
        setCalibration(data as PlanCalibration | null)
      } catch {
        setCalibration(null)
      }
    }
    loadAnnotations()
    loadCalibration()
    setDraft(null)
    setSelectedAnnotation(null)
  }, [selectedFile, currentPage])

  // ─── Measurement conversions ────────────────────────────────────
  const pixelsToReal = useCallback((pxDist: number): string => {
    if (!calibration) return `${pxDist.toFixed(0)} px`
    const ratio = calibration.real_distance / calibration.pixels_distance
    const real = pxDist * ratio
    if (real >= 1) return `${real.toFixed(2)} ${calibration.unit}`
    return `${(real * 100).toFixed(1)} c${calibration.unit}`
  }, [calibration])

  const pixelsToRealArea = useCallback((pxArea: number): string => {
    if (!calibration) return `${pxArea.toFixed(0)} px²`
    const ratio = calibration.real_distance / calibration.pixels_distance
    const real = pxArea * ratio * ratio
    return `${real.toFixed(2)} ${calibration.unit}²`
  }, [calibration])

  // ─── SVG coordinate helpers ─────────────────────────────────────
  const getSvgPoint = useCallback((e: React.MouseEvent): Point => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    }
  }, [zoom])

  // ─── Get effective point (with snap and ortho) ──────────────────
  const getEffectivePoint = useCallback((rawPoint: Point): Point => {
    let pt = snapPoint || rawPoint
    if (orthoMode && draft && draft.points.length > 0) {
      pt = applyOrtho(draft.points[draft.points.length - 1], pt)
    }
    return pt
  }, [snapPoint, orthoMode, draft])

  // ─── Canvas click handler ──────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Print selection mode: click two corners
    if (printSelectionMode) {
      const pt = getSvgPoint(e)
      if (!printSelectionDraft) {
        setPrintSelectionDraft(pt)
      } else {
        const w = Math.abs(pt.x - printSelectionDraft.x)
        const h = Math.abs(pt.y - printSelectionDraft.y)
        if (w < 20 || h < 20) { setPrintSelectionDraft(null); return } // too small
        const rect = {
          p1: { x: Math.min(printSelectionDraft.x, pt.x), y: Math.min(printSelectionDraft.y, pt.y) },
          p2: { x: Math.max(printSelectionDraft.x, pt.x), y: Math.max(printSelectionDraft.y, pt.y) },
        }
        setPrintSelectionRect(rect)
        setPrintSelectionDraft(null)
        setPrintSelectionMode(false)
        setPrintPages(new Set([currentPage]))
        setShowPrintModal(true)
      }
      return
    }

    if (activeTool === 'select') {
      setSelectedAnnotation(null)
      return
    }

    const rawPt = getSvgPoint(e)
    const pt = getEffectivePoint(rawPt)

    if (activeTool === 'text') {
      setTextPosition(pt)
      setTextInput('')
      setShowTextDialog(true)
      return
    }

    // Distance: 3-step flow (point1 → point2 → label placement)
    if (activeTool === 'distance') {
      if (!draft) {
        setDraft({ type: activeTool, points: [pt] })
      } else if (draft.points.length === 1) {
        if (pixelDistance(draft.points[0], pt) < 5) return // prevent double-click
        setDraft({ ...draft, points: [...draft.points, pt] })
      } else if (draft.points.length === 2) {
        const [p1, p2] = draft.points
        const midX = (p1.x + p2.x) / 2
        const midY = (p1.y + p2.y) / 2
        const labelOffset = { x: pt.x - midX, y: pt.y - midY }
        saveAnnotation(activeTool, draft.points, undefined, { labelOffset })
        setDraft(null)
      }
      return
    }

    // Dimension (Acotar): 3-step CAD flow (point1 → point2 → move to choose X/Y direction)
    if (activeTool === 'dimension') {
      if (!draft) {
        setDraft({ type: 'dimension', points: [pt] })
      } else if (draft.points.length === 1) {
        // Reject 2nd point if too close to 1st (prevents accidental double-click)
        if (pixelDistance(draft.points[0], pt) < 5) return
        setDraft({ ...draft, points: [...draft.points, pt] })
      } else if (draft.points.length === 2) {
        // 3rd click: determine X or Y direction from cursor position
        const [p1, p2] = draft.points
        const midX = (p1.x + p2.x) / 2
        const midY = (p1.y + p2.y) / 2
        const dx = Math.abs(pt.x - midX)
        const dy = Math.abs(pt.y - midY)
        // Cursor pulled more vertically → horizontal dimension (measure X)
        // Cursor pulled more horizontally → vertical dimension (measure Y)
        const dimDirection = dy >= dx ? 'x' : 'y'
        const dimOffset = dimDirection === 'x' ? (pt.y - midY) : (pt.x - midX)
        saveAnnotation('dimension', draft.points, undefined, { dimDirection, dimOffset })
        setDraft(null)
      }
      return
    }

    // Arrow, line, calibrate: 2-step flow (unchanged)
    if (activeTool === 'arrow' || activeTool === 'calibrate' || activeTool === 'line') {
      if (!draft) {
        setDraft({ type: activeTool, points: [pt] })
      } else {
        const finalPoints = [...draft.points, pt]
        if (activeTool === 'calibrate') {
          const pxDist = pixelDistance(finalPoints[0], finalPoints[1])
          setCalibrationPixels(pxDist)
          setCalibrationInput({ distance: '', unit: calibration?.unit || 'm' })
          setShowCalibrationDialog(true)
          setDraft(null)
        } else {
          saveAnnotation(activeTool, finalPoints)
          setDraft(null)
        }
      }
      return
    }

    if (activeTool === 'area') {
      if (!draft) {
        setDraft({ type: 'area', points: [pt] })
      } else {
        setDraft({ ...draft, points: [...draft.points, pt] })
      }
      return
    }
  }, [activeTool, draft, getSvgPoint, getEffectivePoint, calibration])

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'area' && draft && draft.points.length >= 3) {
      e.preventDefault()
      e.stopPropagation()
      saveAnnotation('area', draft.points)
      setDraft(null)
    }
  }, [activeTool, draft])

  // ─── Mouse move for snap + rubber-band ──────────────────────────
  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    const pt = getSvgPoint(e)
    setMousePos(pt)
    setSnapPoint(findSnapPoint(pt, annotations, zoom))
  }, [getSvgPoint, annotations, zoom])

  // ─── Save annotation to backend ────────────────────────────────
  const saveAnnotation = async (type: string, points: Point[], text?: string, extraData?: Record<string, unknown>) => {
    if (!selectedFile) return
    try {
      const data: Record<string, unknown> = { points, ...extraData }
      if (type === 'distance' || type === 'dimension') {
        // Always store the FULL point-to-point distance (never zero)
        // For dimension, direction (X/Y) only controls visual layout, not what's measured
        data.pixel_distance = pixelDistance(points[0], points[1])
      }
      if (type === 'area') {
        data.pixel_area = polygonArea(points)
      }
      if (text) data.text = text
      // Persist current annotation style + color
      data.strokeWidth = annotationStyle.strokeWidth
      data.lineStyle = annotationStyle.lineStyle
      data.arrowStyle = annotationStyle.arrowStyle
      data.pointSize = annotationStyle.pointSize
      data.fontSize = annotationStyle.fontSize
      data.color = annotationColors[type] || DEFAULT_ANNOTATION_COLORS[type] || '#666'

      await api.post('/plans/annotations', {
        file_id: selectedFile.id,
        page_number: currentPage,
        annotation_type: type,
        data,
      })
      // Reload annotations
      const { data: anns } = await api.get(`/plans/file/${selectedFile.id}/annotations?page=${currentPage}`)
      setAnnotations(anns as PlanAnnotation[])
    } catch {
      addToast('error', 'Error al guardar anotacion')
    }
  }

  // ─── Update annotation style ────────────────────────────────────
  const updateAnnotationData = async (id: string, updates: Record<string, unknown>) => {
    const ann = annotations.find(a => a.id === id)
    if (!ann) return
    const oldData = ann.data as Record<string, unknown>
    const newData = { ...oldData, ...updates }
    try {
      await api.patch(`/plans/annotations/${id}`, { data: newData })
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, data: newData } : a))
    } catch {
      addToast('error', 'Error al actualizar anotacion')
    }
  }

  // ─── Delete annotation ──────────────────────────────────────────
  const deleteAnnotation = async (id: string) => {
    try {
      await api.delete(`/plans/annotations/${id}`)
      setAnnotations((prev) => prev.filter((a) => a.id !== id))
      if (selectedAnnotation === id) setSelectedAnnotation(null)
    } catch {
      addToast('error', 'Error al eliminar anotacion')
    }
  }

  // ─── Calibration save ──────────────────────────────────────────
  const saveCalibration = async () => {
    if (!selectedFile || !calibrationInput.distance) return
    const realDist = parseFloat(calibrationInput.distance)
    if (isNaN(realDist) || realDist <= 0) return

    try {
      await api.post('/plans/calibrations', {
        file_id: selectedFile.id,
        page_number: currentPage,
        pixels_distance: calibrationPixels,
        real_distance: realDist,
        unit: calibrationInput.unit,
      })
      setCalibration({
        id: '',
        file_id: selectedFile.id,
        page_number: currentPage,
        pixels_distance: calibrationPixels,
        real_distance: realDist,
        unit: calibrationInput.unit,
      })
      setShowCalibrationDialog(false)
      addToast('success', 'Calibracion guardada')
    } catch {
      addToast('error', 'Error al guardar calibracion')
    }
  }

  // ─── Print with annotations ───────────────────────────────────────
  const openPrintModal = () => {
    // Default: select all pages
    const allPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1))
    setPrintPages(allPages)
    setShowPrintModal(true)
  }

  const handlePrintWithAnnotations = async () => {
    if (!selectedFile || (printPages.size === 0 && !printSelectionRect)) return
    setPrinting(true)
    try {
      // ── Helper: render a full page (PDF/image) + annotations to a canvas in pageDimensions space ──
      const renderPageToCanvas = async (pageNum: number): Promise<HTMLCanvasElement> => {
        // Load annotations & calibration for this page
        const { data: pageAnns } = await api.get(`/plans/file/${selectedFile.id}/annotations?page=${pageNum}`)
        let pageCal: PlanCalibration | null = null
        try {
          const { data: calData } = await api.get(`/plans/file/${selectedFile.id}/pages/${pageNum}/calibration`)
          pageCal = calData as PlanCalibration
        } catch { /* no calibration */ }

        // Use a high-res multiplier for print quality
        const printScale = 3
        const cw = pageDimensions.width * printScale
        const ch = pageDimensions.height * printScale

        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')!

        // Render base (PDF or image) scaled to fill the canvas
        if (selectedFile.file_type === 'image') {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = reject
            img.src = fileUrl
          })
          ctx.drawImage(img, 0, 0, cw, ch)
        } else {
          const loadingTask = pdfjs.getDocument(fileUrl)
          const pdfDoc = await loadingTask.promise
          const page = await pdfDoc.getPage(pageNum)
          const viewport = page.getViewport({ scale: 1 })
          // Scale so that PDF fills our canvas exactly
          const pdfScale = Math.min(cw / viewport.width, ch / viewport.height)
          const scaledVp = page.getViewport({ scale: pdfScale })
          // Temp canvas for PDF at exact size
          const pdfCanvas = document.createElement('canvas')
          pdfCanvas.width = scaledVp.width
          pdfCanvas.height = scaledVp.height
          const pdfCtx = pdfCanvas.getContext('2d')!
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (page.render as any)({ canvasContext: pdfCtx, viewport: scaledVp }).promise
          ctx.drawImage(pdfCanvas, 0, 0, cw, ch)
        }

        // Render annotations: clone the live SVG from the DOM so positions are exact
        const anns = pageAnns as PlanAnnotation[]
        if (anns.length > 0) {
          // Build pixel→real converters
          const pixToReal = (px: number) => {
            if (!pageCal || pageCal.pixels_distance <= 0) return `${px.toFixed(0)} px`
            return `${((px / pageCal.pixels_distance) * pageCal.real_distance).toFixed(2)} ${pageCal.unit}`
          }
          const pixToRealArea = (px: number) => {
            if (!pageCal || pageCal.pixels_distance <= 0) return `${px.toFixed(0)} px²`
            const factor = (pageCal.real_distance / pageCal.pixels_distance) ** 2
            return `${(px * factor).toFixed(2)} ${pageCal.unit}²`
          }

          // If this is the current page, clone the live SVG directly — coordinates already correct
          let svgEl: SVGSVGElement
          if (pageNum === currentPage && svgRef.current) {
            svgEl = svgRef.current.cloneNode(true) as SVGSVGElement
            // Remove interactive elements (selection rect, draft shapes, cursors)
            svgEl.querySelectorAll('[data-draft], [data-selection-rect], [data-cursor]').forEach(el => el.remove())
          } else {
            // For other pages, build SVG from annotation data
            const svgNs = 'http://www.w3.org/2000/svg'
            svgEl = document.createElementNS(svgNs, 'svg')
            svgEl.setAttribute('xmlns', svgNs)
            svgEl.setAttribute('width', String(pageDimensions.width))
            svgEl.setAttribute('height', String(pageDimensions.height))
            svgEl.setAttribute('viewBox', `0 0 ${pageDimensions.width} ${pageDimensions.height}`)

            for (const ann of anns) {
              const aData = ann.data as Record<string, unknown>
              const pts = (aData.points as Point[]) || []
              const aColor = (aData.color as string) || annotationColors[ann.annotation_type] || '#666'
              const aSw = (aData.strokeWidth as number) || 2
              const aLs = (aData.lineStyle as string) || 'solid'
              const aAs = (aData.arrowStyle as string) || 'filled'
              const aPs = (aData.pointSize as number) || annotationStyle.pointSize
              const aFs = (aData.fontSize as number) || annotationStyle.fontSize
              const aDash = aLs === 'dashed' ? '8 4' : aLs === 'dotted' ? '2 3' : ''
              const g = document.createElementNS(svgNs, 'g')

              if (ann.annotation_type === 'distance' && pts.length >= 2) {
                const [p1, p2] = pts
                const dist = (aData.pixel_distance as number) || pixelDistance(p1, p2)
                const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2
                const lOff = aData.labelOffset as Point | undefined
                const lx = lOff ? midX + lOff.x : midX, ly = lOff ? midY + lOff.y : midY
                const line = document.createElementNS(svgNs, 'line')
                line.setAttribute('x1', String(p1.x)); line.setAttribute('y1', String(p1.y))
                line.setAttribute('x2', String(p2.x)); line.setAttribute('y2', String(p2.y))
                line.setAttribute('stroke', aColor); line.setAttribute('stroke-width', String(aSw))
                if (aDash) line.setAttribute('stroke-dasharray', aDash)
                else line.setAttribute('stroke-dasharray', '6 3')
                g.appendChild(line)
                const lineAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
                for (const ep of [p1, p2]) {
                  const tickLen = aPs + 2
                  if (aAs === 'dot') {
                    const c = document.createElementNS(svgNs, 'circle')
                    c.setAttribute('cx', String(ep.x)); c.setAttribute('cy', String(ep.y))
                    c.setAttribute('r', String(aPs)); c.setAttribute('fill', aColor)
                    g.appendChild(c)
                  } else {
                    const perpAngle = lineAngle + (aAs === 'oblique' ? Math.PI / 2 : Math.PI / 4)
                    const tick = document.createElementNS(svgNs, 'line')
                    tick.setAttribute('x1', String(ep.x + tickLen * Math.cos(perpAngle)))
                    tick.setAttribute('y1', String(ep.y + tickLen * Math.sin(perpAngle)))
                    tick.setAttribute('x2', String(ep.x - tickLen * Math.cos(perpAngle)))
                    tick.setAttribute('y2', String(ep.y - tickLen * Math.sin(perpAngle)))
                    tick.setAttribute('stroke', aColor); tick.setAttribute('stroke-width', String(aSw))
                    g.appendChild(tick)
                  }
                }
                if (lOff) {
                  const ll = document.createElementNS(svgNs, 'line')
                  ll.setAttribute('x1', String(midX)); ll.setAttribute('y1', String(midY))
                  ll.setAttribute('x2', String(lx)); ll.setAttribute('y2', String(ly))
                  ll.setAttribute('stroke', aColor); ll.setAttribute('stroke-width', '0.8')
                  ll.setAttribute('stroke-dasharray', '3 2'); ll.setAttribute('opacity', '0.6')
                  g.appendChild(ll)
                }
                const rect = document.createElementNS(svgNs, 'rect')
                rect.setAttribute('x', String(lx - 40)); rect.setAttribute('y', String(ly - 12))
                rect.setAttribute('width', '80'); rect.setAttribute('height', '20'); rect.setAttribute('rx', '4')
                rect.setAttribute('fill', 'white'); rect.setAttribute('stroke', aColor); rect.setAttribute('opacity', '0.95')
                g.appendChild(rect)
                const text = document.createElementNS(svgNs, 'text')
                text.setAttribute('x', String(lx)); text.setAttribute('y', String(ly + 3))
                text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', String(aFs))
                text.setAttribute('font-weight', '600'); text.setAttribute('fill', aColor)
                text.textContent = pixToReal(dist)
                g.appendChild(text)
              }

              if (ann.annotation_type === 'dimension' && pts.length >= 2) {
                const [p1, p2] = pts
                const dist = (aData.pixel_distance as number) || pixelDistance(p1, p2)
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
                const perpAngle = angle + Math.PI / 2
                const lOff = aData.labelOffset as Point | undefined
                let offset: number
                if (lOff) { offset = lOff.x * Math.cos(perpAngle) + lOff.y * Math.sin(perpAngle) } else { offset = 25 }
                const d1 = { x: p1.x + offset * Math.cos(perpAngle), y: p1.y + offset * Math.sin(perpAngle) }
                const d2 = { x: p2.x + offset * Math.cos(perpAngle), y: p2.y + offset * Math.sin(perpAngle) }
                const extLen = Math.abs(offset) + 5, extDir = offset >= 0 ? 1 : -1
                const e1End = { x: p1.x + extLen * extDir * Math.cos(perpAngle), y: p1.y + extLen * extDir * Math.sin(perpAngle) }
                const e2End = { x: p2.x + extLen * extDir * Math.cos(perpAngle), y: p2.y + extLen * extDir * Math.sin(perpAngle) }
                const dmx = (d1.x + d2.x) / 2, dmy = (d1.y + d2.y) / 2
                const angleDeg = (angle * 180) / Math.PI
                for (const [start, end] of [[p1, e1End], [p2, e2End]]) {
                  const el = document.createElementNS(svgNs, 'line')
                  el.setAttribute('x1', String(start.x)); el.setAttribute('y1', String(start.y))
                  el.setAttribute('x2', String(end.x)); el.setAttribute('y2', String(end.y))
                  el.setAttribute('stroke', aColor); el.setAttribute('stroke-width', '1'); el.setAttribute('stroke-dasharray', '3 2')
                  g.appendChild(el)
                }
                const dimLine = document.createElementNS(svgNs, 'line')
                dimLine.setAttribute('x1', String(d1.x)); dimLine.setAttribute('y1', String(d1.y))
                dimLine.setAttribute('x2', String(d2.x)); dimLine.setAttribute('y2', String(d2.y))
                dimLine.setAttribute('stroke', aColor); dimLine.setAttribute('stroke-width', String(aSw))
                if (aDash) dimLine.setAttribute('stroke-dasharray', aDash)
                g.appendChild(dimLine)
                const headLen = 10
                for (const [tip, tipAngle] of [[d1, angle + Math.PI], [d2, angle]] as [Point, number][]) {
                  const a1 = { x: tip.x - headLen * Math.cos(tipAngle - Math.PI / 6), y: tip.y - headLen * Math.sin(tipAngle - Math.PI / 6) }
                  const a2 = { x: tip.x - headLen * Math.cos(tipAngle + Math.PI / 6), y: tip.y - headLen * Math.sin(tipAngle + Math.PI / 6) }
                  if (aAs === 'dot') {
                    const c = document.createElementNS(svgNs, 'circle')
                    c.setAttribute('cx', String(tip.x)); c.setAttribute('cy', String(tip.y))
                    c.setAttribute('r', String(aPs)); c.setAttribute('fill', aColor); g.appendChild(c)
                  } else if (aAs === 'oblique') {
                    const pA = tipAngle + Math.PI / 2; const tl = headLen * 0.7
                    const ol = document.createElementNS(svgNs, 'line')
                    ol.setAttribute('x1', String(tip.x + tl * Math.cos(pA))); ol.setAttribute('y1', String(tip.y + tl * Math.sin(pA)))
                    ol.setAttribute('x2', String(tip.x - tl * Math.cos(pA))); ol.setAttribute('y2', String(tip.y - tl * Math.sin(pA)))
                    ol.setAttribute('stroke', aColor); ol.setAttribute('stroke-width', '2'); g.appendChild(ol)
                  } else if (aAs === 'open') {
                    const pl = document.createElementNS(svgNs, 'polyline')
                    pl.setAttribute('points', `${a1.x},${a1.y} ${tip.x},${tip.y} ${a2.x},${a2.y}`)
                    pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', aColor); pl.setAttribute('stroke-width', '2'); g.appendChild(pl)
                  } else {
                    const pg = document.createElementNS(svgNs, 'polygon')
                    pg.setAttribute('points', `${tip.x},${tip.y} ${a1.x},${a1.y} ${a2.x},${a2.y}`)
                    pg.setAttribute('fill', aColor); g.appendChild(pg)
                  }
                }
                const gLabel = document.createElementNS(svgNs, 'g')
                gLabel.setAttribute('transform', `translate(${dmx}, ${dmy}) rotate(${angleDeg})`)
                const rect = document.createElementNS(svgNs, 'rect')
                rect.setAttribute('x', '-40'); rect.setAttribute('y', '-12')
                rect.setAttribute('width', '80'); rect.setAttribute('height', '20'); rect.setAttribute('rx', '4')
                rect.setAttribute('fill', 'white'); rect.setAttribute('stroke', aColor); rect.setAttribute('opacity', '0.95')
                gLabel.appendChild(rect)
                const text = document.createElementNS(svgNs, 'text')
                text.setAttribute('x', '0'); text.setAttribute('y', '4')
                text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', String(aFs))
                text.setAttribute('font-weight', '600'); text.setAttribute('fill', aColor)
                text.textContent = pixToReal(dist); gLabel.appendChild(text); g.appendChild(gLabel)
              }

              if (ann.annotation_type === 'area' && pts.length >= 3) {
                const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
                const area = (aData.pixel_area as number) || polygonArea(pts)
                const cxA = pts.reduce((s, p) => s + p.x, 0) / pts.length
                const cyA = pts.reduce((s, p) => s + p.y, 0) / pts.length
                const aLabelOff = aData.labelOffset as Point | undefined
                const aLx = aLabelOff ? cxA + aLabelOff.x : cxA, aLy = aLabelOff ? cyA + aLabelOff.y : cyA
                const path = document.createElementNS(svgNs, 'path')
                path.setAttribute('d', pathD); path.setAttribute('fill', aColor); path.setAttribute('fill-opacity', '0.1')
                path.setAttribute('stroke', aColor); path.setAttribute('stroke-width', String(aSw))
                if (aDash) path.setAttribute('stroke-dasharray', aDash)
                g.appendChild(path)
                if (aLabelOff) {
                  const ll = document.createElementNS(svgNs, 'line')
                  ll.setAttribute('x1', String(cxA)); ll.setAttribute('y1', String(cyA))
                  ll.setAttribute('x2', String(aLx)); ll.setAttribute('y2', String(aLy))
                  ll.setAttribute('stroke', aColor); ll.setAttribute('stroke-width', '0.8')
                  ll.setAttribute('stroke-dasharray', '3 2'); ll.setAttribute('opacity', '0.5')
                  g.appendChild(ll)
                }
                const rect = document.createElementNS(svgNs, 'rect')
                rect.setAttribute('x', String(aLx - 45)); rect.setAttribute('y', String(aLy - 12))
                rect.setAttribute('width', '90'); rect.setAttribute('height', '20'); rect.setAttribute('rx', '4')
                rect.setAttribute('fill', 'white'); rect.setAttribute('stroke', aColor); rect.setAttribute('opacity', '0.95')
                g.appendChild(rect)
                const text = document.createElementNS(svgNs, 'text')
                text.setAttribute('x', String(aLx)); text.setAttribute('y', String(aLy + 3))
                text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', String(aFs))
                text.setAttribute('font-weight', '600'); text.setAttribute('fill', aColor)
                text.textContent = pixToRealArea(area); g.appendChild(text)
              }

              if (ann.annotation_type === 'text' && pts.length >= 1) {
                const p = pts[0]; const txt = (aData.text as string) || ''
                const text = document.createElementNS(svgNs, 'text')
                text.setAttribute('x', String(p.x)); text.setAttribute('y', String(p.y))
                text.setAttribute('font-size', String(aFs + 2)); text.setAttribute('font-weight', '500')
                text.setAttribute('fill', aColor); text.textContent = txt; g.appendChild(text)
              }

              if (ann.annotation_type === 'arrow' && pts.length >= 2) {
                const [p1, p2] = pts; const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
                const line = document.createElementNS(svgNs, 'line')
                line.setAttribute('x1', String(p1.x)); line.setAttribute('y1', String(p1.y))
                line.setAttribute('x2', String(p2.x)); line.setAttribute('y2', String(p2.y))
                line.setAttribute('stroke', aColor); line.setAttribute('stroke-width', String(aSw))
                if (aDash) line.setAttribute('stroke-dasharray', aDash)
                g.appendChild(line)
                const hLen = 12
                const a1 = { x: p2.x - hLen * Math.cos(angle - Math.PI / 6), y: p2.y - hLen * Math.sin(angle - Math.PI / 6) }
                const a2 = { x: p2.x - hLen * Math.cos(angle + Math.PI / 6), y: p2.y - hLen * Math.sin(angle + Math.PI / 6) }
                const pg = document.createElementNS(svgNs, 'polygon')
                pg.setAttribute('points', `${p2.x},${p2.y} ${a1.x},${a1.y} ${a2.x},${a2.y}`)
                pg.setAttribute('fill', aColor); g.appendChild(pg)
              }

              if (ann.annotation_type === 'line' && pts.length >= 2) {
                const [p1, p2] = pts
                const line = document.createElementNS(svgNs, 'line')
                line.setAttribute('x1', String(p1.x)); line.setAttribute('y1', String(p1.y))
                line.setAttribute('x2', String(p2.x)); line.setAttribute('y2', String(p2.y))
                line.setAttribute('stroke', aColor); line.setAttribute('stroke-width', String(aSw))
                if (aDash) line.setAttribute('stroke-dasharray', aDash)
                g.appendChild(line)
                for (const ep of [p1, p2]) {
                  const c = document.createElementNS(svgNs, 'circle')
                  c.setAttribute('cx', String(ep.x)); c.setAttribute('cy', String(ep.y))
                  c.setAttribute('r', String(aPs)); c.setAttribute('fill', aColor); g.appendChild(c)
                }
              }

              svgEl.appendChild(g)
            }
          }

          // Draw SVG annotations on top of the base canvas
          // Set viewBox to pageDimensions so coordinates match exactly
          svgEl.setAttribute('width', String(pageDimensions.width))
          svgEl.setAttribute('height', String(pageDimensions.height))
          svgEl.setAttribute('viewBox', `0 0 ${pageDimensions.width} ${pageDimensions.height}`)

          const svgStr = new XMLSerializer().serializeToString(svgEl)
          const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
          const svgUrl = URL.createObjectURL(svgBlob)
          const svgImg = new Image()
          await new Promise<void>((resolve, reject) => {
            svgImg.onload = () => resolve()
            svgImg.onerror = reject
            svgImg.src = svgUrl
          })
          // Draw SVG stretched to fill canvas (same coordinate mapping as screen)
          ctx.drawImage(svgImg, 0, 0, cw, ch)
          URL.revokeObjectURL(svgUrl)
        }

        return canvas
      }

      const canvases: HTMLCanvasElement[] = []

      if (printSelectionRect) {
        // ── SELECTION MODE: crop the current page to the selected area ──
        const fullCanvas = await renderPageToCanvas(currentPage)
        const printScale = fullCanvas.width / pageDimensions.width

        // Crop coordinates in canvas pixel space
        const sx = printSelectionRect.p1.x * printScale
        const sy = printSelectionRect.p1.y * printScale
        const sw = (printSelectionRect.p2.x - printSelectionRect.p1.x) * printScale
        const sh = (printSelectionRect.p2.y - printSelectionRect.p1.y) * printScale

        const croppedCanvas = document.createElement('canvas')
        croppedCanvas.width = sw
        croppedCanvas.height = sh
        const croppedCtx = croppedCanvas.getContext('2d')!
        croppedCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
        canvases.push(croppedCanvas)
      } else {
        // ── PAGE MODE: render each selected page ──
        const pagesToPrint = Array.from(printPages).sort((a, b) => a - b)
        for (const pageNum of pagesToPrint) {
          canvases.push(await renderPageToCanvas(pageNum))
        }
      }

      // ── Open print window ──
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        addToast('error', 'No se pudo abrir la ventana de impresion. Permite las ventanas emergentes.')
        return
      }

      const fitCss = printFitToPage
        ? `
          @page { margin: 5mm; size: auto; }
          body { margin: 0; padding: 0; background: white; }
          .page {
            page-break-after: always;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100vw;
            height: 100vh;
            box-sizing: border-box;
          }
          .page:last-child { page-break-after: auto; }
          img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
        `
        : `
          @page { margin: 5mm; }
          body { margin: 0; padding: 0; background: white; }
          .page { page-break-after: always; }
          .page:last-child { page-break-after: auto; }
          img { max-width: 100%; }
        `
      // Build image data URLs
      const imageDataUrls = canvases.map(c => c.toDataURL('image/png'))
      const totalPrintPages = imageDataUrls.length

      printWindow.document.write(`
        <!DOCTYPE html>
        <html><head><title>Imprimir plano - ${selectedFile.original_name}</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            #toolbar { display: none !important; }
            #viewer { overflow: visible !important; height: auto !important; }
            .page {
              page-break-after: always;
              ${printFitToPage ? `
                display: flex; justify-content: center; align-items: center;
                width: 100vw; height: 100vh; box-sizing: border-box;
              ` : ''}
            }
            .page:last-child { page-break-after: auto; }
            .page img {
              max-width: 100%; ${printFitToPage ? 'max-height: 100%; object-fit: contain;' : ''}
            }
          }
          @media screen {
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #525659; overflow: hidden; font-family: -apple-system, system-ui, sans-serif; }
            #toolbar {
              position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 100;
              background: #323639; color: white; display: flex; align-items: center;
              justify-content: center; gap: 16px; padding: 0 16px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            #toolbar button {
              background: #4a8af4; color: white; border: none; padding: 8px 20px;
              border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
            }
            #toolbar button:hover { background: #3b7be0; }
            #toolbar .nav-btn {
              background: transparent; border: 1px solid #666; padding: 6px 12px;
              border-radius: 4px; font-size: 18px; min-width: 36px;
            }
            #toolbar .nav-btn:hover { background: #4a4d50; }
            #toolbar .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
            #toolbar .page-info { font-size: 14px; color: #ccc; min-width: 100px; text-align: center; }
            #viewer {
              position: fixed; top: 48px; left: 0; right: 0; bottom: 0;
              overflow-y: auto; display: flex; justify-content: center; align-items: start;
              background: #525659;
            }
            .page { display: none; justify-content: center; align-items: center; width: 100%; padding: 24px; box-sizing: border-box; }
            .page.active { display: flex; }
            .page img {
              max-width: 100%; object-fit: contain;
              box-shadow: 0 4px 24px rgba(0,0,0,0.4); background: white;
            }
            .fullscreen-btn {
              background: transparent !important; border: 1px solid #666 !important;
              padding: 6px 12px !important; border-radius: 4px !important;
              font-size: 18px !important; min-width: 36px !important;
            }
            .fullscreen-btn:hover { background: #4a4d50 !important; }
          }
        </style></head><body>
        <div id="toolbar">
          <button class="nav-btn" id="prevBtn" onclick="goPage(-1)">&#9664;</button>
          <span class="page-info" id="pageInfo">1 / ${totalPrintPages}</span>
          <button class="nav-btn" id="nextBtn" onclick="goPage(1)">&#9654;</button>
          <button class="fullscreen-btn" id="fsBtn" onclick="toggleFullscreen()" title="Pantalla completa">&#x26F6;</button>
          <button id="printBtn" onclick="window.print()">&#128424; Imprimir</button>
        </div>
        <div id="viewer">
      `)
      imageDataUrls.forEach((url, i) => {
        printWindow.document.write(
          `<div class="page${i === 0 ? ' active' : ''}" data-page="${i}"><img src="${url}" /></div>`
        )
      })
      printWindow.document.write(`
        </div>
        <script>
          var current = 0;
          var total = ${totalPrintPages};
          var pages = document.querySelectorAll('.page');
          var pageInfo = document.getElementById('pageInfo');
          var prevBtn = document.getElementById('prevBtn');
          var nextBtn = document.getElementById('nextBtn');
          var viewer = document.getElementById('viewer');
          var fsBtn = document.getElementById('fsBtn');

          function updateButtons() {
            prevBtn.disabled = current === 0;
            nextBtn.disabled = current === total - 1;
          }

          function goPage(delta, scrollTo) {
            var next = current + delta;
            if (next < 0 || next >= total) return;
            pages[current].classList.remove('active');
            current = next;
            pages[current].classList.add('active');
            pageInfo.textContent = (current + 1) + ' / ' + total;
            updateButtons();
            // Use setTimeout to let the browser render the new page before adjusting scroll
            setTimeout(function() {
              if (scrollTo === 'bottom') {
                viewer.scrollTop = viewer.scrollHeight;
              } else {
                viewer.scrollTop = 0;
              }
            }, 0);
          }

          function toggleFullscreen() {
            var el = document.documentElement;
            if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
              if (el.requestFullscreen) { el.requestFullscreen(); }
              else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
              else if (el.msRequestFullscreen) { el.msRequestFullscreen(); }
            } else {
              if (document.exitFullscreen) { document.exitFullscreen(); }
              else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
              else if (document.msExitFullscreen) { document.msExitFullscreen(); }
            }
          }

          // Update fullscreen button icon on change
          function onFsChange() {
            var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
            fsBtn.innerHTML = isFs ? '&#x2716;' : '&#x26F6;';
            fsBtn.title = isFs ? 'Salir de pantalla completa' : 'Pantalla completa';
          }
          document.addEventListener('fullscreenchange', onFsChange);
          document.addEventListener('webkitfullscreenchange', onFsChange);
          document.addEventListener('MSFullscreenChange', onFsChange);

          // Wheel navigation: change page on scroll, allow inner scroll only if image is truly larger than viewport
          var wheelCooldown = false;
          function handleWheel(e) {
            var scrollRange = viewer.scrollHeight - viewer.clientHeight;

            if (scrollRange <= 100) {
              // Image fits the viewport - always change page on wheel
              e.preventDefault();
              if (!wheelCooldown) {
                wheelCooldown = true;
                if (e.deltaY > 0) goPage(1, 'top');
                else if (e.deltaY < 0) goPage(-1, 'bottom');
                setTimeout(function() { wheelCooldown = false; }, 250);
              }
              return;
            }

            // Image is truly larger than viewport - use edge detection
            var atBottom = viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 10;
            var atTop = viewer.scrollTop <= 10;

            if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) {
              e.preventDefault();
              if (!wheelCooldown) {
                wheelCooldown = true;
                if (e.deltaY > 0) goPage(1, 'top');
                else goPage(-1, 'bottom');
                setTimeout(function() { wheelCooldown = false; }, 250);
              }
            }
          }

          viewer.addEventListener('wheel', handleWheel, { passive: false });

          // Keyboard navigation
          document.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goPage(1, 'top'); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPage(-1, 'bottom'); }
          });

          // Initial button state
          updateButtons();
        <\/script>
        </body></html>
      `)
      printWindow.document.close()

      setShowPrintModal(false)
      setPrintSelectionRect(null)
    } catch (err) {
      console.error('Print error:', err)
      addToast('error', 'Error al preparar la impresion')
    } finally {
      setPrinting(false)
    }
  }

  // ─── Zoom handlers ──────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const container = canvasContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top
    setZoom((prevZoom) => {
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const newZoom = Math.min(5, Math.max(0.25, prevZoom + delta))
      const worldX = (cursorX - pan.x) / prevZoom
      const worldY = (cursorY - pan.y) / prevZoom
      setPan({
        x: cursorX - worldX * newZoom,
        y: cursorY - worldY * newZoom,
      })
      return newZoom
    })
  }, [pan])

  // Attach wheel with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const zoomToCenter = useCallback((delta: number) => {
    const container = canvasContainerRef.current
    if (!container) { setZoom((z) => Math.min(5, Math.max(0.25, z + delta))); return }
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    setZoom((prevZoom) => {
      const newZoom = Math.min(5, Math.max(0.25, prevZoom + delta))
      const worldX = (cx - pan.x) / prevZoom
      const worldY = (cy - pan.y) / prevZoom
      setPan({ x: cx - worldX * newZoom, y: cy - worldY * newZoom })
      return newZoom
    })
  }, [pan])
  const zoomIn = () => zoomToCenter(0.25)
  const zoomOut = () => zoomToCenter(-0.25)
  const fitToPage = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // ─── Pan handlers ──────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle button or left button in select mode
    if (e.button === 1 || (e.button === 0 && activeTool === 'select')) {
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY }
      panOffset.current = { ...pan }
      e.preventDefault()
    }
  }, [activeTool, pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    setPan({
      x: panOffset.current.x + (e.clientX - panStart.current.x),
      y: panOffset.current.y + (e.clientY - panStart.current.y),
    })
  }, [isPanning])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // ─── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showCalibrationDialog || showTextDialog) return

      if (e.key === 'F8') {
        e.preventDefault()
        setOrthoMode((prev) => !prev)
        return
      }
      if (e.key === 'Escape') {
        if (printSelectionMode) {
          setPrintSelectionMode(false)
          setPrintSelectionDraft(null)
          return
        }
        if (draft) {
          setDraft(null)
        } else if (isExpanded) {
          if (document.fullscreenElement) document.exitFullscreen()
          setIsExpanded(false)
        } else {
          setActiveTool('select')
        }
        return
      }
      if (e.key === 'Delete' && selectedAnnotation) {
        deleteAnnotation(selectedAnnotation)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCalibrationDialog, showTextDialog, draft, selectedAnnotation, isExpanded])

  // ─── Fullscreen change listener ────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsExpanded(false)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsExpanded(true)
    } else {
      document.exitFullscreen()
      setIsExpanded(false)
    }
  }

  // ─── Cursor style ──────────────────────────────────────────────
  const cursorStyle = isPanning
    ? 'grabbing'
    : printSelectionMode
      ? 'crosshair'
      : activeTool === 'select'
        ? 'grab'
        : 'crosshair'

  // ─── Hidden file input ─────────────────────────────────────────
  const inputRef = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.dxf,.dwg"
      multiple
      className="hidden"
      onChange={handleFileUpload}
    />
  )

  // ═════════════════════════════════════════════════════════════════
  // ─── FILE BROWSER MODE ────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════
  if (!selectedFile) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileList: any[] = files as any[]
    return (
      <div className="p-6">
        {inputRef}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Map className="w-7 h-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">{t('plans.title', 'Planos')}</h1>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition font-medium shadow-sm"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importar plano
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : !fileList.length ? (
          <div className="text-center py-20">
            <Map className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No hay planos importados</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-600 hover:underline text-sm"
            >
              Importar primer plano
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {fileList.map((file) => {
              const thumb = file.thumbnail_url
              const active = lastViewedFileId === file.id
              const borderClass = active
                ? 'border-blue-500 ring-2 ring-blue-200 shadow-md'
                : 'border-gray-200 hover:border-blue-300'
              return (
                <div
                  key={file.id}
                  onClick={() => openFile(file)}
                  className={`group relative bg-white rounded-xl border-2 p-3 hover:shadow-lg cursor-pointer transition-all ${borderClass}`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFile(file) }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all z-10"
                    title="Eliminar plano"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-full aspect-[4/3] rounded-lg bg-gray-50 mb-2 overflow-hidden flex items-center justify-center">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={file.original_name}
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                    ) : file.file_type === 'pdf' ? (
                      <FileText className="w-10 h-10 text-red-300" />
                    ) : file.file_type === 'image' ? (
                      <ImageIcon className="w-10 h-10 text-blue-300" />
                    ) : (
                      <Map className="w-10 h-10 text-emerald-300" />
                    )}
                  </div>

                  <div className="w-full text-center">
                    <p className="font-medium text-gray-700 text-sm truncate">{file.original_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {file.file_type?.toUpperCase()} · {formatFileSize(file.file_size)}
                    </p>
                  </div>

                  {active && (
                    <div className="absolute top-2 left-2 w-2.5 h-2.5 bg-blue-500 rounded-full shadow-sm" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════
  // ─── VIEWER MODE ──────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════
  const isPdf = selectedFile.file_type === 'pdf'
  const isMultiDxf = isDxfFile(selectedFile) && dxfPages.length > 1
  const hasPages = isPdf || isMultiDxf

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {inputRef}

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="bg-gray-800 flex-shrink-0 border-b border-gray-700">
        <div className="h-12 flex items-center justify-between px-3">
        {/* Left: back + filename */}
        <div className="flex items-center gap-3">
          {!isExpanded && (
            <button
              onClick={() => { setSelectedFile(null); setFileUrl('') }}
              className="p-1.5 text-gray-400 hover:text-white transition rounded-lg hover:bg-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="text-gray-200 text-sm font-medium truncate max-w-[200px]">
            {selectedFile.original_name}
          </span>
        </div>

        {/* Center: zoom + page nav */}
        <div className="flex items-center gap-2">
          <button onClick={zoomOut} className="p-1.5 text-gray-400 hover:text-white transition rounded hover:bg-gray-700">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-gray-300 text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="p-1.5 text-gray-400 hover:text-white transition rounded hover:bg-gray-700">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={fitToPage} className="p-1.5 text-gray-400 hover:text-white transition rounded hover:bg-gray-700" title="Ajustar">
            <Maximize2 className="w-4 h-4" />
          </button>

          {isPdf && (
            <>
              <div className="w-px h-5 bg-gray-600 mx-1" />
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-1.5 py-1 text-gray-400 hover:text-white disabled:opacity-30 transition rounded hover:bg-gray-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1 text-xs">
                <input
                  type="number"
                  value={currentPage}
                  onChange={(e) => {
                    const p = parseInt(e.target.value)
                    if (p >= 1 && p <= totalPages) setCurrentPage(p)
                  }}
                  className="w-8 bg-gray-700 text-gray-200 text-center rounded border-none outline-none text-xs py-0.5"
                  min={1}
                  max={totalPages}
                />
                <span className="text-gray-500">/</span>
                <span className="text-gray-400">{totalPages}</span>
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-1.5 py-1 text-gray-400 hover:text-white disabled:opacity-30 transition rounded hover:bg-gray-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Delete page button */}
              {totalPages > 1 && (
                <button
                  onClick={handleDeletePage}
                  disabled={deletingPage}
                  className="p-1.5 text-gray-500 hover:text-red-400 transition rounded hover:bg-gray-700 ml-1"
                  title="Eliminar esta pagina"
                >
                  {deletingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </>
          )}
        </div>

        {/* Right: print + fullscreen + orto indicator */}
        <div className="flex items-center gap-2">
          {orthoMode && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded">ORTO</span>
          )}
          <button
            onClick={openPrintModal}
            className="p-1.5 text-gray-400 hover:text-white transition rounded hover:bg-gray-700"
            title="Imprimir con anotaciones"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setPrintSelectionMode(true)
              setPrintSelectionRect(null)
              setPrintSelectionDraft(null)
              setActiveTool('select')
              setDraft(null)
            }}
            className={`p-1.5 transition rounded hover:bg-gray-700 ${
              printSelectionMode ? 'text-blue-400 bg-gray-700' : 'text-gray-400 hover:text-white'
            }`}
            title="Imprimir seleccion"
          >
            <Crosshair className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-gray-400 hover:text-white transition rounded hover:bg-gray-700"
            title={isExpanded ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
        </div>

        {/* File tabs — switch between plans without going back */}
        {files.length > 1 && !isExpanded && (
          <div className="flex items-center gap-1 px-3 py-1 overflow-x-auto border-t border-gray-700/50">
            {(files as any[]).map((f: any) => {
              const isActive = f.id === selectedFile.id
              return (
                <button
                  key={f.id}
                  onClick={() => { if (!isActive) openFile(f) }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white font-medium shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
                  }`}
                  title={f.original_name}
                >
                  {f.thumbnail_url ? (
                    <img src={f.thumbnail_url} alt="" className="w-5 h-4 object-contain rounded-sm bg-white" />
                  ) : f.file_type === 'pdf' ? (
                    <FileText className="w-3 h-3 flex-shrink-0" />
                  ) : f.file_type === 'image' ? (
                    <ImageIcon className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <Map className="w-3 h-3 flex-shrink-0" />
                  )}
                  <span className="truncate max-w-[120px]">{f.original_name.replace(/\.[^.]+$/, '')}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left sidebar: page thumbnails (PDF or multi-DXF) ── */}
        {hasPages && !isExpanded && !sidebarCollapsed && (
          <div className="w-20 bg-gray-800 border-r border-gray-700 overflow-y-auto flex-shrink-0 p-2 space-y-2">
            {isPdf ? (
              <Document file={fileUrl}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-full rounded-lg overflow-hidden border-2 transition ${currentPage === i + 1
                        ? 'border-blue-400 ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/30'
                        : 'border-transparent hover:border-gray-500'
                      }`}
                  >
                    <Page
                      pageNumber={i + 1}
                      width={60}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    <div className={`text-[10px] py-0.5 text-center font-medium ${currentPage === i + 1 ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400'}`}>{i + 1}</div>
                  </button>
                ))}
              </Document>
            ) : (
              /* DXF multi-page thumbnails with drag-to-reorder */
              dxfPages.map((page, i) => (
                <button
                  key={page.id}
                  draggable
                  onDragStart={() => setDraggingPageIdx(i)}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-yellow-400') }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('border-yellow-400')}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove('border-yellow-400')
                    if (draggingPageIdx === null || draggingPageIdx === i) return
                    const newPages = [...dxfPages]
                    const [moved] = newPages.splice(draggingPageIdx, 1)
                    newPages.splice(i, 0, moved)
                    setDxfPages(newPages)
                    setDraggingPageIdx(null)
                    // Save new order to backend
                    api.put(`/projects/${projectId}/files/${selectedFile.id}/reorder`, {
                      pageOrder: newPages.map((p: any) => p.id)
                    }).catch(() => addToast('error', 'Error al reordenar'))
                    // Adjust current page if needed
                    if (currentPage === draggingPageIdx + 1) setCurrentPage(i + 1)
                  }}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-full rounded-lg overflow-hidden border-2 transition cursor-grab active:cursor-grabbing ${currentPage === i + 1
                      ? 'border-blue-400 ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/30'
                      : 'border-transparent hover:border-gray-500'
                    } ${draggingPageIdx === i ? 'opacity-50' : ''}`}
                >
                  <div className="bg-white aspect-[4/3] flex items-center justify-center">
                    <span className="text-gray-400 text-xs font-mono">{(page.original_name || '').replace(/\.[^.]+$/, '').slice(-8)}</span>
                  </div>
                  <div className={`text-[10px] py-0.5 text-center flex items-center justify-center gap-0.5 font-medium ${currentPage === i + 1 ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400'}`}>
                    <GripVertical className="w-2 h-2 opacity-50" />
                    {i + 1}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Sidebar toggle button */}
        {hasPages && !isExpanded && (
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-gray-700 text-gray-400 hover:text-white rounded-r-lg border border-l-0 border-gray-600 transition"
            style={{ left: sidebarCollapsed ? 0 : 80 }}
          >
            {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        )}

        {/* ── Center: canvas area ───────────────────────────────── */}
        <div
          ref={canvasContainerRef}
          className="flex-1 overflow-hidden relative bg-gray-200"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: cursorStyle }}
        >
          <div
            className="relative inline-block origin-top-left theme-light-locked"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* Render the PDF, Image, or DXF/DWG SVG */}
            {isDxfFile(selectedFile) ? (
              dxfSvgContent ? (
                <div
                  className="bg-white select-none"
                  style={{ width: pageDimensions.width, height: pageDimensions.height }}
                  dangerouslySetInnerHTML={{ __html: dxfSvgContent }}
                />
              ) : dxfSvgUrl ? (
                <div className="flex items-center justify-center bg-white" style={{ width: 800, height: 600 }}>
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center bg-white rounded-lg p-12 text-center" style={{ width: 800, height: 600 }}>
                  <FileText className="w-16 h-16 text-gray-300 mb-4" />
                  <p className="text-gray-500 font-medium mb-2">Archivo DWG/DXF sin vista previa</p>
                  <p className="text-gray-400 text-sm max-w-md">
                    Para ver el plano, exporta desde tu programa CAD en formato <strong>.dxf</strong> (en AutoCAD: Guardar como → DXF).
                    Los archivos .dwg binarios no se pueden visualizar directamente.
                  </p>
                </div>
              )
            ) : selectedFile.file_type === 'image' ? (
              <canvas
                ref={imageCanvasRef}
                className="max-w-none select-none"
              />
            ) : (
              <div className="relative" style={{ width: pageDimensions.width, height: pageDimensions.height }}>
                <Document file={fileUrl} onLoadSuccess={({ numPages }) => setTotalPages(numPages)}>
                  <Page
                    pageNumber={currentPage}
                    width={1200}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    devicePixelRatio={Math.min(window.devicePixelRatio * Math.max(zoom, 1), 4)}
                    onRenderSuccess={(page) => {
                      setPageDimensions({ width: page.width, height: page.height })
                    }}
                  />
                </Document>
              </div>
            )}

            {/* ── SVG Overlay for annotations ───────────────── */}
            <svg
              ref={svgRef}
              className="absolute inset-0"
              style={{
                width: pageDimensions.width,
                height: pageDimensions.height,
                pointerEvents: (activeTool === 'select' && !printSelectionMode) ? 'none' : 'auto',
              }}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              onMouseMove={handleSvgMouseMove}
            >
              {/* Render saved annotations */}
              {annotations.map((ann) => (
                <AnnotationRenderer
                  key={ann.id}
                  annotation={ann}
                  isSelected={selectedAnnotation === ann.id}
                  onClick={() => {
                    if (activeTool === 'select') {
                      setSelectedAnnotation(ann.id)
                    }
                  }}
                  onUpdateData={(updates) => updateAnnotationData(ann.id, updates)}
                  pixelsToReal={pixelsToReal}
                  pixelsToRealArea={pixelsToRealArea}
                  zoom={zoom}
                  colors={annotationColors}
                  defaultStyle={annotationStyle}
                />
              ))}

              {/* Render draft annotation with rubber-band */}
              {draft && (
                <DraftRenderer
                  draft={draft}
                  mousePos={mousePos}
                  snapPoint={snapPoint}
                  orthoMode={orthoMode}
                  zoom={zoom}
                  pixelsToReal={pixelsToReal}
                  colors={annotationColors}
                  style={annotationStyle}
                />
              )}

              {/* Print selection rubber-band */}
              {printSelectionMode && printSelectionDraft && mousePos && (
                <rect
                  x={Math.min(printSelectionDraft.x, mousePos.x)}
                  y={Math.min(printSelectionDraft.y, mousePos.y)}
                  width={Math.abs(mousePos.x - printSelectionDraft.x)}
                  height={Math.abs(mousePos.y - printSelectionDraft.y)}
                  fill="rgba(59, 130, 246, 0.08)"
                  stroke="#3b82f6"
                  strokeWidth={2 / zoom}
                  strokeDasharray={`${6 / zoom} ${3 / zoom}`}
                />
              )}

              {/* Confirmed print selection rect */}
              {printSelectionRect && (
                <rect
                  x={printSelectionRect.p1.x}
                  y={printSelectionRect.p1.y}
                  width={printSelectionRect.p2.x - printSelectionRect.p1.x}
                  height={printSelectionRect.p2.y - printSelectionRect.p1.y}
                  fill="rgba(59, 130, 246, 0.06)"
                  stroke="#3b82f6"
                  strokeWidth={2 / zoom}
                  strokeDasharray={`${8 / zoom} ${4 / zoom}`}
                />
              )}

              {/* Snap indicator */}
              {snapPoint && activeTool !== 'select' && (
                <g>
                  <rect
                    x={snapPoint.x - 6} y={snapPoint.y - 6}
                    width={12} height={12}
                    fill="none" stroke="#06b6d4" strokeWidth={2}
                    style={{ animation: 'pulse 1.5s infinite' }}
                  />
                  <circle cx={snapPoint.x} cy={snapPoint.y} r={3} fill="#06b6d4" />
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* ── Right toolbar ─────────────────────────────────────── */}
        {!isExpanded ? (
          <div className="w-52 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
            {/* Tools section */}
            <div className="p-3 border-b border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Herramientas</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {TOOLS.map((tool) => {
                  const Icon = tool.icon
                  const color = annotationColors[tool.id]
                  return (
                    <button
                      key={tool.id}
                      onClick={() => { setActiveTool(tool.id); setDraft(null) }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition ${activeTool === tool.id
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      <Icon className="w-3.5 h-3.5" style={color ? { color } : undefined} />
                      {tool.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Ortho toggle */}
            <div className="px-3 py-2 border-b border-gray-100">
              <button
                onClick={() => setOrthoMode(!orthoMode)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium transition ${orthoMode
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                    : 'text-gray-500 hover:bg-gray-50'
                  }`}
              >
                <CornerDownRight className="w-3.5 h-3.5" />
                Modo Orto
                <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">F8</span>
              </button>
            </div>

            {/* Annotation style panel */}
            <div className="px-3 py-2 border-b border-gray-100">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Estilo</h4>

              {/* Colors per tool */}
              <div className="mb-2">
                <span className="text-[10px] text-gray-400 block mb-1">Colores</span>
                <div className="grid grid-cols-4 gap-1">
                  {TOOLS.filter(t => t.id !== 'select').map((tool) => (
                    <label key={tool.id} className="flex flex-col items-center gap-0.5 cursor-pointer group" title={tool.label}>
                      <input
                        type="color"
                        value={annotationColors[tool.id] || '#666'}
                        onChange={(e) => updateAnnotationColors(prev => ({ ...prev, [tool.id]: e.target.value }))}
                        className="w-6 h-6 rounded cursor-pointer border border-gray-200 p-0"
                        style={{ WebkitAppearance: 'none', appearance: 'none' }}
                      />
                      <span className="text-[8px] text-gray-400 group-hover:text-gray-600 truncate w-full text-center">{tool.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => updateAnnotationColors(() => ({ ...DEFAULT_ANNOTATION_COLORS }))}
                  className="text-[9px] text-gray-400 hover:text-blue-500 mt-1 transition"
                >Reset colores</button>
              </div>

              {/* Stroke Width */}
              <div className="mb-2">
                <span className="text-[10px] text-gray-400 block mb-1">Grosor</span>
                <div className="flex gap-1">
                  {[
                    { value: 1, label: '─' },
                    { value: 2, label: '━' },
                    { value: 3, label: '▬' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateAnnotationStyle(s => ({ ...s, strokeWidth: opt.value }))}
                      className={`flex-1 py-1 rounded text-xs font-mono transition ${annotationStyle.strokeWidth === opt.value
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'text-gray-500 hover:bg-gray-50 bg-gray-50/50'
                        }`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Point Size */}
              <div className="mb-2">
                <span className="text-[10px] text-gray-400 block mb-1">Puntos ({annotationStyle.pointSize}px)</span>
                <input
                  type="range" min={1} max={8} step={1}
                  value={annotationStyle.pointSize}
                  onChange={(e) => updateAnnotationStyle(s => ({ ...s, pointSize: Number(e.target.value) }))}
                  className="w-full h-1.5 accent-blue-500"
                />
              </div>

              {/* Font Size */}
              <div className="mb-2">
                <span className="text-[10px] text-gray-400 block mb-1">Texto ({annotationStyle.fontSize}px)</span>
                <input
                  type="range" min={8} max={20} step={1}
                  value={annotationStyle.fontSize}
                  onChange={(e) => updateAnnotationStyle(s => ({ ...s, fontSize: Number(e.target.value) }))}
                  className="w-full h-1.5 accent-blue-500"
                />
              </div>

              {/* Line Style */}
              <div className="mb-2">
                <span className="text-[10px] text-gray-400 block mb-1">Linea</span>
                <div className="flex gap-1">
                  {[
                    { value: 'solid', label: '───' },
                    { value: 'dashed', label: '- - -' },
                    { value: 'dotted', label: '· · ·' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateAnnotationStyle(s => ({ ...s, lineStyle: opt.value }))}
                      className={`flex-1 py-1 rounded text-[10px] font-mono transition ${annotationStyle.lineStyle === opt.value
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'text-gray-500 hover:bg-gray-50 bg-gray-50/50'
                        }`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Arrow Style */}
              <div>
                <span className="text-[10px] text-gray-400 block mb-1">Flecha</span>
                <div className="flex gap-1">
                  {[
                    { value: 'filled', label: '▸' },
                    { value: 'open', label: '▹' },
                    { value: 'dot', label: '●' },
                    { value: 'oblique', label: '/' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateAnnotationStyle(s => ({ ...s, arrowStyle: opt.value }))}
                      className={`flex-1 py-1 rounded text-xs transition ${annotationStyle.arrowStyle === opt.value
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'text-gray-500 hover:bg-gray-50 bg-gray-50/50'
                        }`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Reset all */}
              <button
                onClick={() => {
                  updateAnnotationColors(() => ({ ...DEFAULT_ANNOTATION_COLORS }))
                  updateAnnotationStyle(() => ({ ...DEFAULT_ANNOTATION_STYLE }))
                }}
                className="text-[9px] text-gray-400 hover:text-red-500 mt-2 transition"
              >Reset todo</button>
            </div>

            {/* Current tool info */}
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500">
                {TOOLS.find((t) => t.id === activeTool)?.description}
              </p>
              {draft && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-blue-600">
                    {draft.points.length} punto{draft.points.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setDraft(null)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* Calibration status */}
            <div className="px-3 py-2 border-b border-gray-100">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Calibracion</h4>
              {calibration ? (
                <p className="text-xs text-green-600">
                  <Crosshair className="w-3 h-3 inline mr-1" />
                  {calibration.pixels_distance.toFixed(0)} px = {calibration.real_distance} {calibration.unit}
                </p>
              ) : (
                <p className="text-xs text-amber-500">Sin calibrar</p>
              )}
            </div>

            {/* Annotations list */}
            <div className="px-3 py-2 flex-1">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Anotaciones ({annotations.length})
              </h4>
              <div className="space-y-1">
                {annotations.map((ann) => {
                  const color = (ann.data as Record<string, unknown>).color as string || annotationColors[ann.annotation_type] || '#666'
                  const data = ann.data as Record<string, unknown>
                  let label: string = ann.annotation_type
                  if (ann.annotation_type === 'text') {
                    label = (data.text as string) || 'Texto'
                  } else if (ann.annotation_type === 'distance' || ann.annotation_type === 'dimension') {
                    label = pixelsToReal((data.pixel_distance as number) || 0)
                  } else if (ann.annotation_type === 'area') {
                    label = pixelsToRealArea((data.pixel_area as number) || 0)
                  } else if (ann.annotation_type === 'line') {
                    label = 'Linea'
                  }
                  return (
                    <div
                      key={ann.id}
                      className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs cursor-pointer transition ${selectedAnnotation === ann.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      onClick={() => setSelectedAnnotation(ann.id)}
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-gray-700 truncate flex-1">{label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteAnnotation(ann.id) }}
                        className="p-0.5 text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Selected annotation properties (AutoCAD-style) */}
              {(() => {
                const selAnn = annotations.find(a => a.id === selectedAnnotation)
                if (!selAnn) return null
                const d = selAnn.data as Record<string, unknown>
                const annColor = (d.color as string) || annotationColors[selAnn.annotation_type] || '#666'
                const annSw = (d.strokeWidth as number) || 2
                const annPs = (d.pointSize as number) || annotationStyle.pointSize
                const annFs = (d.fontSize as number) || annotationStyle.fontSize
                const annLs = (d.lineStyle as string) || 'solid'
                const annAs = (d.arrowStyle as string) || 'filled'
                const showEndpoints = ['distance', 'dimension', 'arrow'].includes(selAnn.annotation_type)
                return (
                  <div className="mt-2 p-2 bg-blue-50/50 rounded-lg border border-blue-100 space-y-1.5">
                    <h5 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Propiedades</h5>

                    {/* Color */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-10">Color</span>
                      <input type="color" value={annColor}
                        onChange={(e) => updateAnnotationData(selAnn.id, { color: e.target.value })}
                        className="w-6 h-5 rounded cursor-pointer border border-gray-200 p-0" />
                    </div>

                    {/* Stroke width */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-10">Grosor</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3].map(v => (
                          <button key={v} onClick={() => updateAnnotationData(selAnn.id, { strokeWidth: v })}
                            className={`w-6 h-5 rounded text-[10px] font-mono ${annSw === v ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-white text-gray-500'}`}>
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Point size */}
                    {(selAnn.annotation_type === 'area' || selAnn.annotation_type === 'distance' || selAnn.annotation_type === 'line') && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-10">Punto</span>
                        <input type="range" min={1} max={8} step={1} value={annPs}
                          onChange={(e) => updateAnnotationData(selAnn.id, { pointSize: Number(e.target.value) })}
                          className="flex-1 h-1 accent-blue-500" />
                        <span className="text-[9px] text-gray-400 w-4">{annPs}</span>
                      </div>
                    )}

                    {/* Font size */}
                    {['distance', 'dimension', 'area', 'text'].includes(selAnn.annotation_type) && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-10">Texto</span>
                        <input type="range" min={8} max={20} step={1} value={annFs}
                          onChange={(e) => updateAnnotationData(selAnn.id, { fontSize: Number(e.target.value) })}
                          className="flex-1 h-1 accent-blue-500" />
                        <span className="text-[9px] text-gray-400 w-4">{annFs}</span>
                      </div>
                    )}

                    {/* Line style */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-10">Linea</span>
                      <div className="flex gap-0.5">
                        {[
                          { value: 'solid', label: '──' },
                          { value: 'dashed', label: '- -' },
                          { value: 'dotted', label: '··' },
                        ].map(o => (
                          <button key={o.value} onClick={() => updateAnnotationData(selAnn.id, { lineStyle: o.value })}
                            className={`px-1.5 h-5 rounded text-[9px] font-mono ${annLs === o.value ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-white text-gray-500'}`}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Arrow style */}
                    {showEndpoints && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-10">Punta</span>
                        <div className="flex gap-0.5">
                          {[
                            { value: 'filled', label: '▸' },
                            { value: 'open', label: '▹' },
                            { value: 'dot', label: '●' },
                            { value: 'oblique', label: '/' },
                          ].map(o => (
                            <button key={o.value} onClick={() => updateAnnotationData(selAnn.id, { arrowStyle: o.value })}
                              className={`w-6 h-5 rounded text-[10px] ${annAs === o.value ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-white text-gray-500'}`}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        ) : (
          /* Floating toolbar in fullscreen mode */
          <div className="fixed top-14 right-3 z-[60] bg-white/95 backdrop-blur rounded-xl shadow-xl border border-gray-200 p-2 w-48">
            <div className="grid grid-cols-2 gap-1">
              {TOOLS.map((tool) => {
                const Icon = tool.icon
                const color = annotationColors[tool.id]
                return (
                  <button
                    key={tool.id}
                    onClick={() => { setActiveTool(tool.id); setDraft(null) }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition ${activeTool === tool.id
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                        : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <Icon className="w-3 h-3" style={color ? { color } : undefined} />
                    {tool.label}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setOrthoMode(!orthoMode)}
                className={`flex items-center gap-1 w-full px-2 py-1 rounded-lg text-[11px] font-medium transition ${orthoMode ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
                  }`}
              >
                <CornerDownRight className="w-3 h-3" />
                Orto
              </button>
            </div>
            {/* Compact style controls in fullscreen */}
            <div className="mt-2 pt-2 border-t border-gray-100 px-1 space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-400 w-8">Gr.</span>
                {[1, 2, 3].map(v => (
                  <button key={v} onClick={() => setAnnotationStyle(s => ({ ...s, strokeWidth: v }))}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${annotationStyle.strokeWidth === v ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-gray-500 hover:bg-gray-50'}`}
                  >{v === 1 ? '─' : v === 2 ? '━' : '▬'}</button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-400 w-8">Ln.</span>
                {[{ v: 'solid', l: '──' }, { v: 'dashed', l: '- -' }, { v: 'dotted', l: '··' }].map(o => (
                  <button key={o.v} onClick={() => setAnnotationStyle(s => ({ ...s, lineStyle: o.v }))}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${annotationStyle.lineStyle === o.v ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-gray-500 hover:bg-gray-50'}`}
                  >{o.l}</button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-400 w-8">Fl.</span>
                {[{ v: 'filled', l: '▸' }, { v: 'open', l: '▹' }, { v: 'dot', l: '●' }, { v: 'oblique', l: '/' }].map(o => (
                  <button key={o.v} onClick={() => setAnnotationStyle(s => ({ ...s, arrowStyle: o.v }))}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${annotationStyle.arrowStyle === o.v ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-gray-500 hover:bg-gray-50'}`}
                  >{o.l}</button>
                ))}
              </div>
            </div>
            {calibration ? (
              <p className="text-[10px] text-green-600 px-2 mt-1">
                Calibrado: {calibration.real_distance} {calibration.unit}
              </p>
            ) : (
              <p className="text-[10px] text-amber-500 px-2 mt-1">Sin calibrar</p>
            )}
          </div>
        )}
      </div>

      {/* ── Calibration Dialog ──────────────────────────────────── */}
      {showCalibrationDialog && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Calibrar escala</h3>
            <p className="text-sm text-gray-500 mb-4">
              Distancia medida: <strong>{calibrationPixels.toFixed(0)} px</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Distancia real</label>
                <DecimalInput
                  value={parseFloat(calibrationInput.distance) || 0}
                  onChange={(v) => setCalibrationInput({ ...calibrationInput, distance: String(v) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveCalibration() }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
                <select
                  value={calibrationInput.unit}
                  onChange={(e) => setCalibrationInput({ ...calibrationInput, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                  <option value="m">Metros (m)</option>
                  <option value="cm">Centimetros (cm)</option>
                  <option value="mm">Milimetros (mm)</option>
                  <option value="ft">Pies (ft)</option>
                  <option value="in">Pulgadas (in)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowCalibrationDialog(false)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={saveCalibration}
                className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Text Input Dialog ───────────────────────────────────── */}
      {showTextDialog && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Anadir texto</h3>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              placeholder="Escribe el texto..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && textInput.trim()) {
                  saveAnnotation('text', [textPosition], textInput.trim())
                  setShowTextDialog(false)
                }
              }}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowTextDialog(false)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (textInput.trim()) {
                    saveAnnotation('text', [textPosition], textInput.trim())
                    setShowTextDialog(false)
                  }
                }}
                className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print with Annotations Modal ────────────────────────── */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                <Printer className="w-5 h-5 inline mr-2 text-blue-600" />
                Imprimir con anotaciones
              </h3>
              <button onClick={() => { setShowPrintModal(false); setPrintSelectionRect(null) }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Selection mode indicator */}
            {printSelectionRect ? (
              <>
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-700 font-medium">
                      <Crosshair className="w-4 h-4 inline mr-1" />
                      Imprimir seleccion (pagina {currentPage})
                    </span>
                    <button
                      onClick={() => setPrintSelectionRect(null)}
                      className="text-xs text-blue-500 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                  <p className="text-xs text-blue-500 mt-1">
                    Solo se imprimira el area seleccionada con sus anotaciones
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">
                  Selecciona las paginas que quieres imprimir con sus anotaciones:
                </p>

                {/* Select all / none */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setPrintPages(new Set(Array.from({ length: totalPages }, (_, i) => i + 1)))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => setPrintPages(new Set())}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Ninguna
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => setPrintPages(new Set([currentPage]))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Solo actual ({currentPage})
                  </button>
                </div>

                {/* Page grid */}
                <div className="overflow-y-auto flex-1 mb-4">
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: totalPages }, (_, i) => {
                      const pageNum = i + 1
                      const isSelected = printPages.has(pageNum)
                      return (
                        <button
                          key={pageNum}
                          onClick={() => {
                            setPrintPages(prev => {
                              const next = new Set(prev)
                              if (next.has(pageNum)) next.delete(pageNum)
                              else next.add(pageNum)
                              return next
                            })
                          }}
                          className={`aspect-[3/4] rounded-lg border-2 flex items-center justify-center text-sm font-medium transition ${isSelected
                              ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                              : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="text-xs text-gray-400 mb-3">
              {printSelectionRect
                ? 'Area seleccionada de pagina ' + currentPage
                : `${printPages.size} pagina${printPages.size !== 1 ? 's' : ''} seleccionada${printPages.size !== 1 ? 's' : ''}`
              }
            </div>

            {/* Print options */}
            <div className="mb-3 flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={printFitToPage}
                  onChange={(e) => setPrintFitToPage(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Centrar y ajustar a hoja
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setShowPrintModal(false); setPrintSelectionRect(null) }}
                className="flex-1 px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handlePrintWithAnnotations}
                disabled={(printPages.size === 0 && !printSelectionRect) || printing}
                className="flex-1 px-4 py-2.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {printing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparando...
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    Imprimir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation keyframes */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// ─── Style helpers for annotation renderers ─────────────────────────
// ═════════════════════════════════════════════════════════════════════
function getDashArray(lineStyle: string): string | undefined {
  if (lineStyle === 'dashed') return '8 4'
  if (lineStyle === 'dotted') return '2 3'
  return undefined
}

function renderEndpoint(arrowStyle: string, pt: Point, angle: number, color: string, sw: number, ps: number = 4) {
  if (arrowStyle === 'dot') {
    return <circle cx={pt.x} cy={pt.y} r={ps} fill={color} />
  }
  if (arrowStyle === 'open' || arrowStyle === 'filled') {
    // AutoCAD-style: small perpendicular tick mark at endpoint
    const tickLen = ps + 2
    const perpAngle = angle + Math.PI / 4  // 45° tick
    const t1 = { x: pt.x + tickLen * Math.cos(perpAngle), y: pt.y + tickLen * Math.sin(perpAngle) }
    const t2 = { x: pt.x - tickLen * Math.cos(perpAngle), y: pt.y - tickLen * Math.sin(perpAngle) }
    return <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={color} strokeWidth={sw} />
  }
  if (arrowStyle === 'oblique') {
    const tickLen = ps + 2
    const perpAngle = angle + Math.PI / 2
    const t1 = { x: pt.x + tickLen * Math.cos(perpAngle), y: pt.y + tickLen * Math.sin(perpAngle) }
    const t2 = { x: pt.x - tickLen * Math.cos(perpAngle), y: pt.y - tickLen * Math.sin(perpAngle) }
    return <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={color} strokeWidth={sw} />
  }
  // Fallback: tiny dot
  return <circle cx={pt.x} cy={pt.y} r={Math.max(1, sw)} fill={color} />
}

function renderArrowhead(
  arrowStyle: string, tip: Point, angle: number, color: string, headLen: number = 10, ps: number = 4
) {
  if (arrowStyle === 'dot') {
    return <circle cx={tip.x} cy={tip.y} r={ps} fill={color} />
  }
  if (arrowStyle === 'oblique') {
    // Architectural tick marks — short perpendicular line
    const perpAngle = angle + Math.PI / 2
    const tickLen = headLen * 0.7
    const t1 = { x: tip.x + tickLen * Math.cos(perpAngle), y: tip.y + tickLen * Math.sin(perpAngle) }
    const t2 = { x: tip.x - tickLen * Math.cos(perpAngle), y: tip.y - tickLen * Math.sin(perpAngle) }
    return <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={color} strokeWidth={2} />
  }
  if (arrowStyle === 'open') {
    const a1 = { x: tip.x - headLen * Math.cos(angle - Math.PI / 6), y: tip.y - headLen * Math.sin(angle - Math.PI / 6) }
    const a2 = { x: tip.x - headLen * Math.cos(angle + Math.PI / 6), y: tip.y - headLen * Math.sin(angle + Math.PI / 6) }
    return <polyline points={`${a1.x},${a1.y} ${tip.x},${tip.y} ${a2.x},${a2.y}`} fill="none" stroke={color} strokeWidth={2} />
  }
  // Default: filled
  const a1 = { x: tip.x - headLen * Math.cos(angle - Math.PI / 6), y: tip.y - headLen * Math.sin(angle - Math.PI / 6) }
  const a2 = { x: tip.x - headLen * Math.cos(angle + Math.PI / 6), y: tip.y - headLen * Math.sin(angle + Math.PI / 6) }
  return <polygon points={`${tip.x},${tip.y} ${a1.x},${a1.y} ${a2.x},${a2.y}`} fill={color} />
}

// ═════════════════════════════════════════════════════════════════════
// ─── Annotation Renderer Component ──────────────────────────────────
// ═════════════════════════════════════════════════════════════════════
function AnnotationRenderer({
  annotation,
  isSelected,
  onClick,
  onUpdateData,
  pixelsToReal,
  pixelsToRealArea,
  zoom = 1,
  colors,
  defaultStyle,
}: {
  annotation: PlanAnnotation
  isSelected: boolean
  onClick: () => void
  onUpdateData: (updates: Record<string, unknown>) => void
  pixelsToReal: (px: number) => string
  pixelsToRealArea: (px: number) => string
  zoom?: number
  colors: Record<string, string>
  defaultStyle: typeof DEFAULT_ANNOTATION_STYLE
}) {
  const data = annotation.data as Record<string, unknown>
  const points = (data.points as Point[]) || []
  const color = (data.color as string) || colors[annotation.annotation_type] || '#666'
  const pointSize = (data.pointSize as number) || defaultStyle.pointSize
  const fontSize = (data.fontSize as number) || defaultStyle.fontSize

  switch (annotation.annotation_type) {
    case 'distance': {
      if (points.length < 2) return null
      const [p1, p2] = points
      const dist = (data.pixel_distance as number) || pixelDistance(p1, p2)
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      const labelOff = data.labelOffset as Point | undefined
      const labelX = labelOff ? midX + labelOff.x : midX
      const labelY = labelOff ? midY + labelOff.y : midY
      const sw = (data.strokeWidth as number) || 2
      const ls = (data.lineStyle as string) || 'solid'
      const as_ = (data.arrowStyle as string) || 'filled'
      const dashArray = ls === 'dashed' ? '8 4' : ls === 'dotted' ? '2 3' : undefined
      const effectiveSw = isSelected ? sw + 1 : sw
      return (
        <g onClick={onClick} style={{ cursor: 'pointer', pointerEvents: 'all' }}>
          <line
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={color} strokeWidth={effectiveSw} strokeDasharray={dashArray || (isSelected ? undefined : '6 3')}
          />
          {(() => { const a = Math.atan2(p2.y - p1.y, p2.x - p1.x); return <>{renderEndpoint(as_, p1, a, color, sw, pointSize)}{renderEndpoint(as_, p2, a, color, sw, pointSize)}</> })()}
          {/* Leader line if label offset exists */}
          {labelOff && (
            <line x1={midX} y1={midY} x2={labelX} y2={labelY}
              stroke={color} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.6} />
          )}
          {(() => {
            const labelText = pixelsToReal(dist)
            const s = 1 / zoom
            const cw = fontSize * 0.65
            const tw = labelText.length * cw + 12
            const th = fontSize + 8
            return (
              <g transform={`translate(${labelX}, ${labelY}) scale(${s})`}
                style={{ cursor: 'move' }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const gEl = e.currentTarget as SVGGElement
                  const startMX = e.clientX, startMY = e.clientY
                  const origOff = labelOff || { x: 0, y: 0 }
                  const onMove = (ev: MouseEvent) => {
                    ev.preventDefault()
                    const dx = (ev.clientX - startMX) / zoom
                    const dy = (ev.clientY - startMY) / zoom
                    if (gEl) {
                      gEl.setAttribute('transform',
                        `translate(${midX + origOff.x + dx}, ${midY + origOff.y + dy}) scale(${s})`)
                    }
                  }
                  const onUp = (ev: MouseEvent) => {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                    const dx = (ev.clientX - startMX) / zoom
                    const dy = (ev.clientY - startMY) / zoom
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                      onUpdateData({ labelOffset: { x: origOff.x + dx, y: origOff.y + dy } })
                    }
                  }
                  document.addEventListener('mousemove', onMove)
                  document.addEventListener('mouseup', onUp)
                }}
              >
                <rect x={-tw / 2} y={-th / 2} width={tw} height={th} rx={3}
                  fill="white" stroke={color} strokeWidth={1} opacity={0.95} />
                <text x={0} y={fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill={color}>
                  {labelText}
                </text>
              </g>
            )
          })()}
          {isSelected && (
            <rect
              x={p1.x - 6} y={p1.y - 6} width={12} height={12}
              fill="transparent" stroke={color} strokeWidth={1} strokeDasharray="3 2"
            />
          )}
        </g>
      )
    }

    case 'dimension': {
      if (points.length < 2) return null
      const [p1, p2] = points
      const sw = (data.strokeWidth as number) || 2
      const ls = (data.lineStyle as string) || 'solid'
      const as_ = (data.arrowStyle as string) || 'filled'
      const dashArray = getDashArray(ls)
      const effectiveSw = isSelected ? sw + 1 : sw
      const headLen = 10
      const dimDirection = data.dimDirection as string | undefined
      const dimOffset = data.dimOffset as number | undefined

      // ── New X/Y linear dimension mode ──
      if (dimDirection === 'x' || dimDirection === 'y') {
        // Always use full point-to-point distance
        const dist = (data.pixel_distance as number) || pixelDistance(p1, p2)
        let d1: Point, d2: Point

        if (dimDirection === 'x') {
          // HORIZONTAL dimension at offset Y
          const midY = (p1.y + p2.y) / 2
          const lineY = midY + (dimOffset || 30)
          d1 = { x: p1.x, y: lineY }
          d2 = { x: p2.x, y: lineY }
        } else {
          // VERTICAL dimension at offset X
          const midX = (p1.x + p2.x) / 2
          const lineX = midX + (dimOffset || 30)
          d1 = { x: lineX, y: p1.y }
          d2 = { x: lineX, y: p2.y }
        }

        const dMidX = (d1.x + d2.x) / 2
        const dMidY = (d1.y + d2.y) / 2
        const dimAngle = dimDirection === 'x' ? 0 : Math.PI / 2
        const dimAngleDeg = dimDirection === 'x' ? 0 : 90

        return (
          <g onClick={onClick} style={{ cursor: 'pointer', pointerEvents: 'all' }}>
            {/* Extension lines from original points to dimension line */}
            <line x1={p1.x} y1={p1.y} x2={d1.x} y2={d1.y}
              stroke={color} strokeWidth={1} strokeDasharray="3 2" />
            <line x1={p2.x} y1={p2.y} x2={d2.x} y2={d2.y}
              stroke={color} strokeWidth={1} strokeDasharray="3 2" />

            {/* Dimension line */}
            <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y}
              stroke={color} strokeWidth={effectiveSw} strokeDasharray={dashArray} />

            {/* Arrowheads */}
            {renderArrowhead(as_, d1, dimAngle + Math.PI, color, headLen, pointSize)}
            {renderArrowhead(as_, d2, dimAngle, color, headLen, pointSize)}

            {/* Label */}
            {(() => {
              const labelText = pixelsToReal(dist)
              const s = 1 / zoom
              const cw = fontSize * 0.65
              const tw = labelText.length * cw + 12
              const th = fontSize + 8
              return (
                <g transform={`translate(${dMidX}, ${dMidY}) rotate(${dimAngleDeg}) scale(${s})`}>
                  <rect x={-tw / 2} y={-th / 2} width={tw} height={th} rx={3}
                    fill="white" stroke={color} strokeWidth={1} opacity={0.95} />
                  <text x={0} y={fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill={color}>
                    {labelText}
                  </text>
                </g>
              )
            })()}

            {/* Small origin point markers */}
            {isSelected && (
              <>
                <circle cx={p1.x} cy={p1.y} r={5} fill="transparent" stroke={color} strokeWidth={1} />
                <circle cx={p2.x} cy={p2.y} r={5} fill="transparent" stroke={color} strokeWidth={1} />
              </>
            )}
          </g>
        )
      }

      // ── Legacy: old-style diagonal dimension (for backward compatibility) ──
      const dist = (data.pixel_distance as number) || pixelDistance(p1, p2)
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const perpAngle = angle + Math.PI / 2

      const labelOff = data.labelOffset as Point | undefined
      let offset: number
      if (labelOff) {
        offset = labelOff.x * Math.cos(perpAngle) + labelOff.y * Math.sin(perpAngle)
      } else {
        offset = 25
      }
      const extLen = Math.abs(offset) + 5
      const extDir = offset >= 0 ? 1 : -1

      const d1 = { x: p1.x + offset * Math.cos(perpAngle), y: p1.y + offset * Math.sin(perpAngle) }
      const d2 = { x: p2.x + offset * Math.cos(perpAngle), y: p2.y + offset * Math.sin(perpAngle) }
      const e1Start = { x: p1.x + 5 * extDir * Math.cos(perpAngle), y: p1.y + 5 * extDir * Math.sin(perpAngle) }
      const e1End = { x: p1.x + extLen * extDir * Math.cos(perpAngle), y: p1.y + extLen * extDir * Math.sin(perpAngle) }
      const e2Start = { x: p2.x + 5 * extDir * Math.cos(perpAngle), y: p2.y + 5 * extDir * Math.sin(perpAngle) }
      const e2End = { x: p2.x + extLen * extDir * Math.cos(perpAngle), y: p2.y + extLen * extDir * Math.sin(perpAngle) }
      const dimMidX = (d1.x + d2.x) / 2
      const dimMidY = (d1.y + d2.y) / 2
      const angleDeg = (angle * 180) / Math.PI
      const arrowAngle1 = angle
      const arrowAngle2 = angle + Math.PI

      return (
        <g onClick={onClick} style={{ cursor: 'pointer', pointerEvents: 'all' }}>
          <line x1={e1Start.x} y1={e1Start.y} x2={e1End.x} y2={e1End.y}
            stroke={color} strokeWidth={1} strokeDasharray="3 2" />
          <line x1={e2Start.x} y1={e2Start.y} x2={e2End.x} y2={e2End.y}
            stroke={color} strokeWidth={1} strokeDasharray="3 2" />
          <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y}
            stroke={color} strokeWidth={effectiveSw} strokeDasharray={dashArray} />
          {renderArrowhead(as_, d1, arrowAngle2, color, headLen, pointSize)}
          {renderArrowhead(as_, d2, arrowAngle1, color, headLen, pointSize)}
          {(() => {
            const labelText = pixelsToReal(dist)
            const s = 1 / zoom
            const cw = fontSize * 0.65
            const tw = labelText.length * cw + 12
            const th = fontSize + 8
            return (
              <g transform={`translate(${dimMidX}, ${dimMidY}) rotate(${angleDeg}) scale(${s})`}>
                <rect x={-tw / 2} y={-th / 2} width={tw} height={th} rx={3}
                  fill="white" stroke={color} strokeWidth={1} opacity={0.95} />
                <text x={0} y={fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill={color}>
                  {labelText}
                </text>
              </g>
            )
          })()}

          {isSelected && (
            <>
              <circle cx={p1.x} cy={p1.y} r={5} fill="transparent" stroke={color} strokeWidth={1} />
              <circle cx={p2.x} cy={p2.y} r={5} fill="transparent" stroke={color} strokeWidth={1} />
            </>
          )}
        </g>
      )
    }

    case 'area': {
      if (points.length < 3) return null
      const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
      const area = (data.pixel_area as number) || polygonArea(points)
      const centroidX = points.reduce((s, p) => s + p.x, 0) / points.length
      const centroidY = points.reduce((s, p) => s + p.y, 0) / points.length
      const areaLabelOff = data.labelOffset as Point | undefined
      const labelPosX = areaLabelOff ? centroidX + areaLabelOff.x : centroidX
      const labelPosY = areaLabelOff ? centroidY + areaLabelOff.y : centroidY
      const sw = (data.strokeWidth as number) || 2
      const ls = (data.lineStyle as string) || 'solid'
      const effectiveSw = isSelected ? sw + 1 : sw
      return (
        <g onClick={onClick} style={{ cursor: 'pointer', pointerEvents: 'all' }}>
          <path
            d={pathData}
            fill={color} fillOpacity={0.1}
            stroke={color} strokeWidth={effectiveSw} strokeDasharray={getDashArray(ls)}
          />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={pointSize} fill={color} />
          ))}
          {/* Leader line from centroid to label when offset */}
          {areaLabelOff && (
            <line x1={centroidX} y1={centroidY} x2={labelPosX} y2={labelPosY}
              stroke={color} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.5} />
          )}
          {(() => {
            const labelText = pixelsToRealArea(area)
            const s = 1 / zoom
            const cw = fontSize * 0.65
            const tw = labelText.length * cw + 12
            const th = fontSize + 8
            return (
              <g transform={`translate(${labelPosX}, ${labelPosY}) scale(${s})`}
                style={{ cursor: 'move' }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const gEl = e.currentTarget as SVGGElement
                  const startX = e.clientX
                  const startY = e.clientY
                  const origOff = areaLabelOff || { x: 0, y: 0 }

                  const onMove = (ev: MouseEvent) => {
                    ev.preventDefault()
                    const dx = (ev.clientX - startX) / zoom
                    const dy = (ev.clientY - startY) / zoom
                    if (gEl) {
                      gEl.setAttribute('transform',
                        `translate(${centroidX + origOff.x + dx}, ${centroidY + origOff.y + dy}) scale(${s})`)
                    }
                  }

                  const onUp = (ev: MouseEvent) => {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                    const dx = (ev.clientX - startX) / zoom
                    const dy = (ev.clientY - startY) / zoom
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                      onUpdateData({ labelOffset: { x: origOff.x + dx, y: origOff.y + dy } })
                    }
                  }

                  document.addEventListener('mousemove', onMove)
                  document.addEventListener('mouseup', onUp)
                }}
              >
                <rect x={-tw / 2} y={-th / 2} width={tw} height={th} rx={3}
                  fill="white" stroke={color} strokeWidth={1} opacity={0.95} />
                <text x={0} y={fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill={color}>
                  {labelText}
                </text>
              </g>
            )
          })()}
        </g>
      )
    }

    case 'text': {
      if (points.length < 1) return null
      const p = points[0]
      const text = (data.text as string) || ''
      const fs = fontSize + 2
      const cw = fs * 0.65
      const textWidth = Math.max(text.length * cw, 30)
      return (
        <g onClick={onClick} style={{ cursor: 'pointer', pointerEvents: 'all' }}>
          <rect
            x={p.x - 4} y={p.y - fs - 2}
            width={textWidth + 8} height={fs + 8} rx={4}
            fill={isSelected ? '#f0fdf4' : 'white'}
            stroke={color} strokeWidth={isSelected ? 2 : 1} opacity={0.95}
          />
          <text
            x={p.x} y={p.y}
            fontSize={fs} fontWeight={500} fill={color}
          >
            {text}
          </text>
        </g>
      )
    }

    case 'arrow': {
      if (points.length < 2) return null
      const [p1, p2] = points
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const sw = (data.strokeWidth as number) || 2
      const ls = (data.lineStyle as string) || 'solid'
      const as_ = (data.arrowStyle as string) || 'filled'
      const effectiveSw = isSelected ? sw + 1 : sw
      return (
        <g onClick={onClick} style={{ cursor: 'pointer', pointerEvents: 'all' }}>
          <line
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={color} strokeWidth={effectiveSw} strokeDasharray={getDashArray(ls)}
          />
          {renderArrowhead(as_, p2, angle, color, 12, pointSize)}
          {isSelected && (
            <>
              <circle cx={p1.x} cy={p1.y} r={5} fill="transparent" stroke={color} strokeWidth={1} />
              <circle cx={p2.x} cy={p2.y} r={5} fill="transparent" stroke={color} strokeWidth={1} />
            </>
          )}
        </g>
      )
    }

    case 'line': {
      if (points.length < 2) return null
      const [p1, p2] = points
      const sw = (data.strokeWidth as number) || 2
      const ls = (data.lineStyle as string) || 'solid'
      const effectiveSw = isSelected ? sw + 1 : sw
      return (
        <g onClick={onClick} style={{ cursor: 'pointer', pointerEvents: 'all' }}>
          <line
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={color} strokeWidth={effectiveSw} strokeDasharray={getDashArray(ls)}
          />
          {isSelected && (
            <>
              <rect x={p1.x - 5} y={p1.y - 5} width={10} height={10}
                fill="transparent" stroke={color} strokeWidth={1} />
              <rect x={p2.x - 5} y={p2.y - 5} width={10} height={10}
                fill="transparent" stroke={color} strokeWidth={1} />
            </>
          )}
        </g>
      )
    }

    default:
      return null
  }
}

// ═════════════════════════════════════════════════════════════════════
// ─── Draft Renderer Component ───────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════
function DraftRenderer({
  draft,
  mousePos,
  snapPoint,
  orthoMode,
  zoom = 1,
  pixelsToReal,
  colors,
  style,
}: {
  draft: AnnotationDraft
  mousePos: Point | null
  snapPoint: Point | null
  orthoMode: boolean
  zoom?: number
  pixelsToReal?: (px: number) => string
  colors: Record<string, string>
  style: typeof DEFAULT_ANNOTATION_STYLE
}) {
  const formatDist = (px: number) => pixelsToReal ? pixelsToReal(px) : `${px.toFixed(0)} px`
  const color = colors[draft.type] || '#666'

  // Calculate rubber-band target
  let rubberTarget: Point | null = null
  if (mousePos && draft.points.length > 0) {
    const lastPt = draft.points[draft.points.length - 1]
    let target = snapPoint || mousePos
    if (orthoMode) {
      target = applyOrtho(lastPt, target)
    }
    rubberTarget = target
  }

  // Distance & Dimension: 3-step with label placement preview
  if (draft.type === 'distance' || draft.type === 'dimension') {
    if (draft.points.length === 1) {
      return (
        <g>
          <circle cx={draft.points[0].x} cy={draft.points[0].y} r={style.pointSize + 1} fill={color} opacity={0.8} />
          <circle cx={draft.points[0].x} cy={draft.points[0].y} r={12} fill="none" stroke={color} strokeWidth={1} strokeDasharray="4 2" opacity={0.5} />
          {rubberTarget && (
            <line
              x1={draft.points[0].x} y1={draft.points[0].y}
              x2={rubberTarget.x} y2={rubberTarget.y}
              stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6}
            />
          )}
        </g>
      )
    }
    // Phase 3: label placement preview
    if (draft.points.length === 2 && mousePos) {
      const [p1, p2] = draft.points
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      const labelTarget = snapPoint || mousePos

      if (draft.type === 'dimension') {
        // CAD-style linear dimension: cursor direction determines X or Y measurement
        const cursorDx = Math.abs(labelTarget.x - midX)
        const cursorDy = Math.abs(labelTarget.y - midY)
        // Cursor pulled more vertically → horizontal (X) dimension; more horizontally → vertical (Y) dimension
        const dimDir = cursorDy >= cursorDx ? 'x' : 'y'

        // Full point-to-point distance (direction only affects visual layout)
        const measuredDist = pixelDistance(p1, p2)
        let d1: Point, d2: Point, e1End: Point, e2End: Point, angleDeg: number

        if (dimDir === 'x') {
          // HORIZONTAL layout: dimension line at cursor's Y
          const lineY = labelTarget.y
          d1 = { x: p1.x, y: lineY }
          d2 = { x: p2.x, y: lineY }
          e1End = { x: p1.x, y: lineY + (lineY > p1.y ? 5 : -5) }
          e2End = { x: p2.x, y: lineY + (lineY > p2.y ? 5 : -5) }
          angleDeg = 0
        } else {
          // VERTICAL layout: dimension line at cursor's X
          const lineX = labelTarget.x
          d1 = { x: lineX, y: p1.y }
          d2 = { x: lineX, y: p2.y }
          e1End = { x: lineX + (lineX > p1.x ? 5 : -5), y: p1.y }
          e2End = { x: lineX + (lineX > p2.x ? 5 : -5), y: p2.y }
          angleDeg = 90
        }

        const dMidX = (d1.x + d2.x) / 2
        const dMidY = (d1.y + d2.y) / 2
        const headLen = 10
        // Arrowheads along dimension line direction
        const dimAngle = dimDir === 'x' ? 0 : Math.PI / 2
        const arr1b = { x: d1.x + headLen * Math.cos(dimAngle + Math.PI * 0.8), y: d1.y + headLen * Math.sin(dimAngle + Math.PI * 0.8) }
        const arr1c = { x: d1.x + headLen * Math.cos(dimAngle - Math.PI * 0.8), y: d1.y + headLen * Math.sin(dimAngle - Math.PI * 0.8) }
        const arr2b = { x: d2.x + headLen * Math.cos(dimAngle + Math.PI + Math.PI * 0.8), y: d2.y + headLen * Math.sin(dimAngle + Math.PI + Math.PI * 0.8) }
        const arr2c = { x: d2.x + headLen * Math.cos(dimAngle + Math.PI - Math.PI * 0.8), y: d2.y + headLen * Math.sin(dimAngle + Math.PI - Math.PI * 0.8) }

        // Direction indicator
        const dirLabel = dimDir === 'x' ? '↔ X' : '↕ Y'

        return (
          <g opacity={0.7}>
            <circle cx={p1.x} cy={p1.y} r={style.pointSize} fill={color} />
            <circle cx={p2.x} cy={p2.y} r={style.pointSize} fill={color} />
            {/* Extension lines from points to dimension line */}
            <line x1={p1.x} y1={p1.y} x2={e1End.x} y2={e1End.y} stroke={color} strokeWidth={1} strokeDasharray="3 2" />
            <line x1={p2.x} y1={p2.y} x2={e2End.x} y2={e2End.y} stroke={color} strokeWidth={1} strokeDasharray="3 2" />
            {/* Dimension line */}
            <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} stroke={color} strokeWidth={2} />
            {/* Arrowheads */}
            <polygon points={`${d1.x},${d1.y} ${arr1b.x},${arr1b.y} ${arr1c.x},${arr1c.y}`} fill={color} />
            <polygon points={`${d2.x},${d2.y} ${arr2b.x},${arr2b.y} ${arr2c.x},${arr2c.y}`} fill={color} />
            {/* Label */}
            {(() => {
              const labelText = formatDist(measuredDist)
              const s = 1 / zoom
              const cw = style.fontSize * 0.65
              const tw = labelText.length * cw + 12
              const th = style.fontSize + 8
              return (
                <g transform={`translate(${dMidX}, ${dMidY}) scale(${s})`}>
                  <rect x={-tw / 2} y={-th / 2} width={tw} height={th} rx={3} fill="white" stroke={color} strokeWidth={1} opacity={0.95} />
                  <text x={0} y={style.fontSize * 0.35} textAnchor="middle" fontSize={style.fontSize} fontWeight={600} fill={color}>
                    {labelText}
                  </text>
                </g>
              )
            })()}
            {/* Direction indicator */}
            {(() => {
              const s = 1 / zoom
              return (
                <g transform={`translate(${labelTarget.x}, ${labelTarget.y}) scale(${s})`}>
                  <rect x={-16} y={-10} width={32} height={20} rx={4} fill={color} opacity={0.85} />
                  <text x={0} y={5} textAnchor="middle" fontSize={style.fontSize} fontWeight={700} fill="white">
                    {dirLabel}
                  </text>
                </g>
              )
            })()}
          </g>
        )
      }

      // Distance: label follows mouse with leader line
      return (
        <g opacity={0.7}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={2} strokeDasharray="6 3" />
          <circle cx={p1.x} cy={p1.y} r={style.pointSize} fill={color} />
          <circle cx={p2.x} cy={p2.y} r={style.pointSize} fill={color} />
          {/* Leader line from midpoint to label */}
          <line x1={midX} y1={midY} x2={labelTarget.x} y2={labelTarget.y} stroke={color} strokeWidth={0.8} strokeDasharray="3 2" />
          <circle cx={midX} cy={midY} r={3} fill={color} opacity={0.5} />
          {/* Label at cursor position */}
          {(() => {
            const labelText = formatDist(pixelDistance(p1, p2))
            const s = 1 / zoom
            const cw = style.fontSize * 0.65
            const tw = labelText.length * cw + 12
            const th = style.fontSize + 8
            return (
              <g transform={`translate(${labelTarget.x}, ${labelTarget.y}) scale(${s})`}>
                <rect x={-tw / 2} y={-th / 2} width={tw} height={th} rx={3} fill="white" stroke={color} strokeWidth={1} opacity={0.95} />
                <text x={0} y={style.fontSize * 0.35} textAnchor="middle" fontSize={style.fontSize} fontWeight={600} fill={color}>
                  {labelText}
                </text>
              </g>
            )
          })()}
        </g>
      )
    }
    return null
  }

  // Arrow, Line, Calibrate: 2-step (unchanged)
  if (draft.type === 'arrow' || draft.type === 'calibrate' || draft.type === 'line') {
    if (draft.points.length === 1) {
      return (
        <g>
          <circle cx={draft.points[0].x} cy={draft.points[0].y} r={style.pointSize + 1} fill={color} opacity={0.8} />
          <circle cx={draft.points[0].x} cy={draft.points[0].y} r={12} fill="none" stroke={color} strokeWidth={1} strokeDasharray="4 2" opacity={0.5} />
          {rubberTarget && (
            <line
              x1={draft.points[0].x} y1={draft.points[0].y}
              x2={rubberTarget.x} y2={rubberTarget.y}
              stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6}
            />
          )}
        </g>
      )
    }
    return null
  }

  if (draft.type === 'area') {
    if (draft.points.length < 1) return null

    if (draft.points.length === 1) {
      return (
        <g>
          <circle cx={draft.points[0].x} cy={draft.points[0].y} r={style.pointSize} fill={color} opacity={0.8} />
          {rubberTarget && (
            <line
              x1={draft.points[0].x} y1={draft.points[0].y}
              x2={rubberTarget.x} y2={rubberTarget.y}
              stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6}
            />
          )}
        </g>
      )
    }

    const pathData = draft.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    return (
      <g>
        <path
          d={pathData}
          fill={color} fillOpacity={0.05}
          stroke={color} strokeWidth={2} strokeDasharray="6 3"
        />
        {draft.points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={style.pointSize} fill={color} />
        ))}
        {/* Rubber-band line from last point */}
        {rubberTarget && (
          <line
            x1={draft.points[draft.points.length - 1].x}
            y1={draft.points[draft.points.length - 1].y}
            x2={rubberTarget.x} y2={rubberTarget.y}
            stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6}
          />
        )}
      </g>
    )
  }

  return null
}
