/**
 * budgetPdfExport.ts — Professional budget PDF export using pdfmake
 * Generates: Cover page, Chapter index, Detailed chapters, Final summary
 * Ported from the desktop (Tauri) app styling
 */
import type { FullBudget, ChapterWithItems } from '@/types'
import { AFM_DATA } from './afmData'

// Dynamic import for pdfmake (browser-only) — shared singleton used by all PDF modules
let pdfMake: any = null
// Promise cache prevents concurrent callers from initialising pdfmake more than once
let _loadPromise: Promise<any> | null = null

export async function loadPdfMake() {
  if (pdfMake) return pdfMake
  if (!_loadPromise) {
    _loadPromise = (async () => {
      const mod = await import('pdfmake/build/pdfmake')
      const fonts = await import('pdfmake/build/vfs_fonts')
      const pm = mod.default || mod
      const pf = fonts.default || fonts
      // vfs_fonts v0.2+ exports the VFS object directly (TTF keys at top level).
      // Older versions wrapped it as { pdfMake: { vfs: {...} } } or { vfs: {...} }.
      pm.vfs = pf?.pdfMake?.vfs ?? pf?.vfs ?? pf ?? {}
      // Embed AFM font metrics for standard fonts (Courier, Helvetica, Times)
      Object.assign(pm.vfs, AFM_DATA)
      pdfMake = pm
      return pm
    })()
  }
  return _loadPromise
}

/**
 * Fetch an image URL and convert to base64 data URI for pdfmake
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)

const chTotal = (ch: ChapterWithItems) =>
  ch.chapter.is_legal_text ? 0 : ch.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)

const numberToWords = (n: number): string => {
  const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const tens = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

  if (n === 0) return 'CERO'
  const integer = Math.floor(n)
  const decimal = Math.round((n - integer) * 100)

  const convertGroup = (num: number): string => {
    if (num === 0) return ''
    if (num === 100) return 'CIEN'
    let result = ''
    let r = num
    if (r >= 100) { result += hundreds[Math.floor(r / 100)] + ' '; r %= 100 }
    if (r >= 20) {
      result += tens[Math.floor(r / 10)]
      if (r % 10 !== 0) result += ' Y ' + units[r % 10]
    } else if (r >= 10) {
      result += teens[r - 10]
    } else if (r > 0) {
      result += units[r]
    }
    return result.trim()
  }

  let text = ''
  if (integer >= 1000000) {
    const millions = Math.floor(integer / 1000000)
    text += (millions === 1 ? 'UN MILLÓN' : convertGroup(millions) + ' MILLONES') + ' '
  }
  const remainder = integer % 1000000
  if (remainder >= 1000) {
    const thousands = Math.floor(remainder / 1000)
    text += (thousands === 1 ? 'MIL' : convertGroup(thousands) + ' MIL') + ' '
  }
  const lastThree = remainder % 1000
  if (lastThree > 0) text += convertGroup(lastThree)

  text = text.trim() + ' EUROS'
  if (decimal > 0) text += ' CON ' + convertGroup(decimal) + ' CÉNTIMOS'
  return text
}

// ─── HTML → pdfmake converter (for rich text chapters) ─────────────────
function htmlToPdfmake(html: string): any[] {
  if (!html || html === '<p></p>') return []

  // Parse HTML using a temporary DOM element
  const div = document.createElement('div')
  div.innerHTML = html

  const result: any[] = []

  function processNode(node: Node): any {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      if (!text) return null
      return { text }
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    // Collect children content
    const children: any[] = []
    el.childNodes.forEach((child) => {
      const r = processNode(child)
      if (r) children.push(r)
    })

    // Extract text-align from style
    const align = el.style?.textAlign as 'left' | 'center' | 'right' | 'justify' | undefined

    switch (tag) {
      case 'p': {
        const para: any = { text: children.length ? children : '', margin: [0, 2, 0, 2] as [number, number, number, number], fontSize: 9.5, color: '#1e293b' }
        if (align) para.alignment = align
        return para
      }
      case 'h1': return { text: children, fontSize: 14, bold: true, color: '#111827', margin: [0, 8, 0, 4] as [number, number, number, number], alignment: align }
      case 'h2': return { text: children, fontSize: 12, bold: true, color: '#1f2937', margin: [0, 6, 0, 3] as [number, number, number, number], alignment: align }
      case 'h3': return { text: children, fontSize: 10.5, bold: true, color: '#374151', margin: [0, 4, 0, 2] as [number, number, number, number], alignment: align }
      case 'strong':
      case 'b': return { text: children, bold: true }
      case 'em':
      case 'i': return { text: children, italics: true }
      case 'u': return { text: children, decoration: 'underline' }
      case 's':
      case 'del': return { text: children, decoration: 'lineThrough' }
      case 'mark': {
        const bg = el.getAttribute('data-color') || el.style?.backgroundColor || '#fef08a'
        return { text: children, background: bg }
      }
      case 'span': {
        const style: any = { text: children }
        if (el.style?.color) style.color = el.style.color
        return style
      }
      case 'ul': return { ul: children.filter(Boolean).map((c: any) => c._liContent || c), margin: [0, 2, 0, 2] as [number, number, number, number], fontSize: 9.5 }
      case 'ol': return { ol: children.filter(Boolean).map((c: any) => c._liContent || c), margin: [0, 2, 0, 2] as [number, number, number, number], fontSize: 9.5 }
      case 'li': {
        const content = children.length === 1 ? children[0] : { text: children }
        return { _liContent: content, ...content }
      }
      case 'br': return { text: '\n' }
      default: return children.length === 1 ? children[0] : children.length > 0 ? { text: children } : null
    }
  }

  div.childNodes.forEach((child) => {
    const r = processNode(child)
    if (r) {
      if (Array.isArray(r)) result.push(...r)
      else result.push(r)
    }
  })

  return result
}

// ─── Color palette (defaults) ───────────────────────────────────────────
const DEFAULT_COLORS = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  accent: '#059669',
  dark: '#0f172a',
  text: '#1e293b',
  muted: '#64748b',
  light: '#f1f5f9',
  border: '#cbd5e1',
  white: '#ffffff',
}

// ─── PDF Style Options ───────────────────────────────────────────────────
export interface PdfStyleOptions {
  pdf_color_primary?: string
  pdf_color_accent?: string
  pdf_color_dark?: string
  pdf_color_text?: string
  pdf_color_muted?: string
  pdf_color_row_alt?: string
  pdf_header_shadow?: boolean
  pdf_row_striping?: boolean
  pdf_logo_width?: number
  pdf_logo_align?: string
  pdf_font_family?: string
  pdf_title_size?: number
  pdf_subtitle_size?: number
  pdf_table_header_size?: number
  pdf_body_size?: number
  pdf_top_bar_height?: number
}

function buildStyleColors(pdfStyles?: PdfStyleOptions) {
  return {
    primary:      pdfStyles?.pdf_color_primary ?? DEFAULT_COLORS.primary,
    primaryLight: pdfStyles?.pdf_color_accent  ?? DEFAULT_COLORS.primaryLight,
    accent:       pdfStyles?.pdf_color_accent  ?? DEFAULT_COLORS.accent,
    dark:         pdfStyles?.pdf_color_dark    ?? DEFAULT_COLORS.dark,
    text:         pdfStyles?.pdf_color_text    ?? DEFAULT_COLORS.text,
    muted:        pdfStyles?.pdf_color_muted   ?? DEFAULT_COLORS.muted,
    light:        pdfStyles?.pdf_color_row_alt ?? DEFAULT_COLORS.light,
    border:       DEFAULT_COLORS.border,
    white:        DEFAULT_COLORS.white,
  }
}

/** Returns a pdfmake `fonts` dict for a given font family, to set on pdfMake.fonts. */
export function buildStandardFonts(fontFamily: string): Record<string, any> | undefined {
  if (!fontFamily || fontFamily === 'Roboto') return undefined
  const map: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }> = {
    Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
    Times:     { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' },
    Courier:   { normal: 'Courier', bold: 'Courier-Bold', italics: 'Courier-Oblique', bolditalics: 'Courier-BoldOblique' },
  }
  const def = map[fontFamily]
  return def ? { [fontFamily]: def } : undefined
}

/** Returns the fonts dict for a given family — does NOT mutate global pdfMake.fonts.
 *  Returns null for Roboto so pdfmake uses its built-in defaultClientFonts fallback. */
export function getFonts(fontFamily: string): Record<string, any> | null {
  return buildStandardFonts(fontFamily) ?? null
}

// ─── Options Interface ──────────────────────────────────────────────────
export interface CompanyInfo {
  company_name: string
  company_cif: string
  company_address: string
  company_city: string
  company_province: string
  company_postal_code: string
  company_phone: string
  company_email: string
  company_web: string
  company_professional_number: string
  company_logo_url: string
}

export interface BudgetPdfOptions {
  orientation?: 'portrait' | 'landscape'
  showPrices?: boolean
  /**
   * Versión INTERNA: añade desglose de coste y margen bruto al resumen.
   * No muestra coste/margen al cliente — usar solo para uso interno.
   */
  showCosts?: boolean
  generalConditions?: string
  margins?: { top: number; bottom: number; left: number; right: number } // mm
  pdfStyles?: PdfStyleOptions
  /** Nombre a mostrar en pie de página (si se omite, usa budget.budget.name) */
  documentName?: string
}

// ─── Build Document Definition ──────────────────────────────────────────
function buildBudgetDocDefinition(
  budget: FullBudget,
  projectName: string,
  company: CompanyInfo,
  options: BudgetPdfOptions = {},
  logoBase64?: string | null
) {
  const {
    orientation = 'portrait',
    showPrices = true,
    showCosts = false,
    generalConditions,
    pdfStyles,
    documentName,
  } = options

  // ─── Style overrides (shadows module-level defaults) ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const COLORS = buildStyleColors(pdfStyles)
  const headerShadow  = pdfStyles?.pdf_header_shadow  !== false
  const rowStriping   = pdfStyles?.pdf_row_striping   !== false
  const logoWidth     = pdfStyles?.pdf_logo_width     ?? 140
  const logoAlign     = (pdfStyles?.pdf_logo_align    ?? 'left') as 'left' | 'center' | 'right'
  const topBarH       = pdfStyles?.pdf_top_bar_height ?? 8
  const fontFamily    = pdfStyles?.pdf_font_family    ?? 'Roboto'
  // Header fill/text: when shadow off, use transparent bg + colored text
  const hdrFill       = (headerShadow ? COLORS.primary : COLORS.white)
  const hdrText       = (headerShadow ? COLORS.white   : COLORS.primary)
  // Row alternation helper
  const rowFill       = (i: number) => rowStriping ? (i % 2 === 0 ? COLORS.white : COLORS.light) : COLORS.white

  const { chapters } = budget
  const pem = chapters.reduce((sum, ch) => sum + chTotal(ch), 0)
  const ivaRate = budget.budget.tax_rate || 0
  const iva = pem * (ivaRate / 100)
  const grandTotal = pem + iva

  const companyName = company.company_name || 'Empresa Constructora'
  const companyCif = company.company_cif || ''
  const companyAddress = company.company_address || ''
  const companyCity = company.company_city || ''
  const companyProvince = company.company_province || ''
  const companyPostal = company.company_postal_code || ''
  const companyPhone = company.company_phone || ''
  const companyEmail = company.company_email || ''
  const companyWeb = company.company_web || ''
  const companyProfessional = company.company_professional_number || ''

  const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })

  // ─── Dynamic content width based on orientation ────────────────────
  const isLandscape = orientation === 'landscape'
  const contentWidth = isLandscape ? 762 : 515
  const coverGapLg = isLandscape ? 12 : 40
  const coverGapMd = isLandscape ? 8 : 30
  const coverGapSm = isLandscape ? 8 : 20

  // ─── Orientation-dependent font sizes ────────────────────────────────
  const fs = isLandscape
    ? { item: 9.5, name: 10.5, desc: 9, hdr: 8.5, code: 9 }
    : { item: 8.5, name: 9.5, desc: 8, hdr: 8, code: 8 }
  // Tighter cell padding in portrait so the Concepto column gets more usable width
  const cellPad = isLandscape ? 4 : 3

  // ─── Cover Page ─────────────────────────────────────────────────────
  const coverPage: any[] = [
    // Top decorative bar
    {
      canvas: [{ type: 'rect', x: 0, y: 0, w: contentWidth, h: topBarH, color: COLORS.primary }],
      margin: [0, 0, 0, coverGapSm],
    },
    // Company logo (if available)
    ...(logoBase64 ? [{
      image: logoBase64,
      width: logoWidth,
      alignment: logoAlign,
      margin: [0, 0, 0, 8] as [number, number, number, number],
    }] : []),
    // Company info
    {
      text: companyName.toUpperCase(),
      fontSize: 24,
      bold: true,
      color: COLORS.primary,
      margin: [0, 0, 0, 4],
    },
    {
      text: [
        companyCif ? `CIF: ${companyCif}` : '',
        companyProfessional ? `  |  N. Colegiado: ${companyProfessional}` : '',
      ].filter(Boolean).join(''),
      fontSize: 10,
      color: COLORS.muted,
      margin: [0, 0, 0, 2],
    },
    {
      text: [companyAddress, companyPostal, companyCity, companyProvince].filter(Boolean).join(', '),
      fontSize: 10,
      color: COLORS.muted,
      margin: [0, 0, 0, 2],
    },
    {
      text: [companyPhone, companyEmail, companyWeb].filter(Boolean).join('  |  '),
      fontSize: 10,
      color: COLORS.muted,
      margin: [0, 0, 0, coverGapLg],
    },
    // Decorative line
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 2, lineColor: COLORS.primary }],
      margin: [0, 0, 0, coverGapLg],
    },
    // Title
    {
      text: 'PRESUPUESTO',
      fontSize: isLandscape ? Math.round((pdfStyles?.pdf_title_size ?? 36) * 0.78) : (pdfStyles?.pdf_title_size ?? 36),
      bold: true,
      color: COLORS.dark,
      alignment: 'right',
      margin: [0, 0, 0, 4],
    },
    {
      text: 'DE EJECUCIÓN MATERIAL',
      fontSize: isLandscape ? Math.round((pdfStyles?.pdf_subtitle_size ?? 18) * 0.78) : (pdfStyles?.pdf_subtitle_size ?? 18),
      color: COLORS.primaryLight,
      alignment: 'right',
      margin: [0, 0, 0, coverGapMd],
    },
    // Project info box
    {
      table: {
        widths: [120, '*'],
        body: [
          [
            { text: 'Proyecto:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: projectName || budget.budget.name, bold: true, fontSize: 12, color: COLORS.text },
          ],
          [
            { text: 'Presupuesto:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: budget.budget.name, fontSize: 11, color: COLORS.text },
          ],
          [
            { text: 'Fecha:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: today, fontSize: 11, color: COLORS.text },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingTop: () => isLandscape ? 3 : 6,
        paddingBottom: () => isLandscape ? 3 : 6,
      },
      margin: [0, 0, 0, coverGapLg],
    },
    // Grand total box
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: [
                { text: 'IMPORTE TOTAL: ', fontSize: 14, color: COLORS.white },
                { text: fmtCurrency(showPrices ? grandTotal : pem), fontSize: 22, bold: true, color: COLORS.white },
              ],
              alignment: 'center',
              margin: [0, 12, 0, 12],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => COLORS.primary,
      },
    },
  ]

  // ─── Chapter Index Page ────────────────────────────────────────────
  const indexBody: any[][] = [
    [
      { text: 'N.', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [0, 6, 0, 6] },
      { text: 'CAPÍTULO', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, margin: [0, 6, 0, 6] },
      ...(showPrices ? [
        { text: 'IMPORTE', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [0, 6, 0, 6] },
        { text: '%', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [0, 6, 0, 6] },
      ] : []),
    ],
  ]

  chapters.forEach((ch, i) => {
    const isLegalText = ch.chapter.is_legal_text
    const total = isLegalText ? 0 : chTotal(ch)
    const pct = pem > 0 ? (total / pem * 100) : 0
    const fill = rowFill(i)
    indexBody.push([
      { text: ch.chapter.code, fontSize: 10, bold: true, color: COLORS.primary, alignment: 'center', fillColor: fill, margin: [0, 5, 0, 5] },
      { text: ch.chapter.name, fontSize: 10, color: COLORS.text, fillColor: fill, margin: [0, 5, 0, 5] },
      ...(showPrices ? [
        { text: isLegalText ? '' : fmtCurrency(total), fontSize: 10, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [0, 5, 0, 5] },
        { text: isLegalText ? '' : fmt(pct) + '%', fontSize: 10, color: COLORS.muted, alignment: 'center', fillColor: fill, margin: [0, 5, 0, 5] },
      ] : []),
    ])
  })

  // Total row
  if (showPrices) {
    indexBody.push([
      { text: '', fillColor: COLORS.primary },
      { text: 'TOTAL PRESUPUESTO', bold: true, fontSize: 11, color: COLORS.white, fillColor: COLORS.primary, margin: [0, 6, 0, 6] },
      { text: fmtCurrency(pem), bold: true, fontSize: 11, color: COLORS.white, fillColor: COLORS.primary, alignment: 'right', margin: [0, 6, 0, 6] },
      { text: '100%', bold: true, fontSize: 10, color: COLORS.white, fillColor: COLORS.primary, alignment: 'center', margin: [0, 6, 0, 6] },
    ])
  }

  const indexWidths = showPrices ? [40, '*', 100, 50] : [40, '*']
  const indexPage: any[] = [
    { text: 'ÍNDICE DE CAPÍTULOS', fontSize: 18, bold: true, color: COLORS.primary, margin: [0, 0, 0, 20], pageBreak: 'before' },
    {
      table: {
        headerRows: 1,
        widths: indexWidths,
        body: indexBody,
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1.5 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? COLORS.primary : COLORS.border,
      },
    },
  ]

  // ─── Detailed Chapter Pages ────────────────────────────────────────
  const chapterPages: any[] = []

  chapters.forEach((ch, chIdx) => {
    const isLegalText = ch.chapter.is_legal_text

    // Helper: standalone chapter banner (used for legal chapters and as fallback when
    // a non-legal chapter has zero items).
    const standaloneBanner = () => ({
      table: {
        widths: ['*'],
        body: [[{
          text: [
            { text: `CAPÍTULO ${ch.chapter.code}   `, bold: true, fontSize: 14, color: COLORS.white },
            { text: ch.chapter.name.toUpperCase(), fontSize: 13, color: COLORS.white },
          ],
          margin: [8, 8, 8, 8],
        }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => COLORS.primary,
      },
      ...(chIdx === 0 ? { pageBreak: 'before' as const } : {}),
      margin: [0, chIdx > 0 ? 10 : 0, 0, 8] as [number, number, number, number],
    })

    if (isLegalText) {
      chapterPages.push(standaloneBanner())
    }

    if (isLegalText && ch.chapter.description) {
      const richContent = htmlToPdfmake(ch.chapter.description)
      if (richContent.length > 0) {
        chapterPages.push(...richContent)
        if (ch.items.length > 0) {
          chapterPages.push({ text: '', margin: [0, 8, 0, 0] as [number, number, number, number] })
        }
      }
    }

    // Items table
    if (ch.items.length > 0) {
      if (isLegalText) {
        // Legal text items — bullet list
        const legalBody: any[][] = [
          [
            { text: '', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, margin: [4, 5, 4, 5] },
            { text: 'Concepto', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, margin: [4, 5, 4, 5] },
          ],
        ]

        ch.items.forEach((item, i) => {
          const fill = rowFill(i)
          legalBody.push([
            { text: '\u2022', fontSize: 11, bold: true, color: COLORS.muted, fillColor: fill, margin: [4, 2, 4, 2], alignment: 'center' },
            {
              stack: [
                { text: item.name, fontSize: 9.5, bold: true, color: COLORS.text, lineHeight: 1.15 },
                ...(item.description ? [{ text: item.description, fontSize: 8, color: COLORS.muted, italics: true, lineHeight: 1.15, margin: [0, 1, 0, 0] as [number, number, number, number] }] : []),
              ],
              fillColor: fill,
              margin: [4, 2, 4, 2],
            },
          ])
        })

        chapterPages.push({
          table: {
            headerRows: 1,
            widths: [20, '*'],
            body: legalBody,
            dontBreakRows: true,
            keepWithHeaderRows: 1,
          },
          layout: {
            // Compact spacing for legal bullets \u2014 minimal lines between rows so the chapter
            // doesn't push a single bullet to its own page when room is tight.
            hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0,
            vLineWidth: () => 0,
            hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? COLORS.primary : '#e2e8f0',
          },
        })
      } else {
        // ─── Non-legal chapter: banner + col headers + items + subtotal in ONE table ──
        // Single pdfmake table with `headerRows: 2` (banner + column headers) and
        // `keepWithHeaderRows: 1` guarantees that the banner ALWAYS travels with at least
        // one data row. If they don't all fit on the current page the whole chapter starts
        // on the next page — no more orphan banners.
        const tHdr = pdfStyles?.pdf_table_header_size ?? fs.hdr
        const bSz = pdfStyles?.pdf_body_size ?? fs.item
        const numCols = showPrices ? 6 : 4
        const tableWidths = showPrices
          ? (isLandscape ? [65, '*', 35, 65, 80, 90] : [40, '*', 24, 45, 55, 65])
          : (isLandscape ? [65, '*', 35, 65] : [40, '*', 24, 45])

        // Row 0: banner, spans all columns
        const bannerRow: any[] = [{
          text: [
            { text: `CAPÍTULO ${ch.chapter.code}   `, bold: true, fontSize: 14, color: COLORS.white },
            { text: ch.chapter.name.toUpperCase(), fontSize: 13, color: COLORS.white },
          ],
          colSpan: numCols,
          fillColor: COLORS.primary,
          margin: [8, 8, 8, 8],
        }]
        for (let c = 1; c < numCols; c++) bannerRow.push({})

        // Row 1: column headers
        const headerRow = showPrices
          ? [
              { text: 'Codigo', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, margin: [4, 5, 4, 5] },
              { text: 'Concepto', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, margin: [4, 5, 4, 5] },
              { text: 'Ud.', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [4, 5, 4, 5] },
              { text: 'Cantidad', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: 'Precio', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: 'Importe', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [4, 5, 4, 5] },
            ]
          : [
              { text: 'Codigo', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, margin: [4, 5, 4, 5] },
              { text: 'Concepto', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, margin: [4, 5, 4, 5] },
              { text: 'Ud.', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [4, 5, 4, 5] },
              { text: 'Cantidad', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [4, 5, 4, 5] },
            ]

        const itemsBody: any[][] = [bannerRow, headerRow]

        ch.items.forEach((item, i) => {
          const fill = rowFill(i)
          const importe = item.quantity * item.unit_price

          if (showPrices) {
            itemsBody.push([
              { text: item.code, fontSize: fs.code, color: COLORS.muted, fillColor: fill, margin: [cellPad, cellPad, cellPad, cellPad] },
              {
                stack: [
                  { text: item.name, fontSize: fs.name, bold: true, color: COLORS.text, lineHeight: isLandscape ? 1.15 : 1.1 },
                  ...(item.description ? [{ text: item.description, fontSize: fs.desc, color: COLORS.muted, italics: true, lineHeight: isLandscape ? 1.15 : 1.1, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
                ],
                fillColor: fill,
                margin: [cellPad, cellPad, cellPad, cellPad],
              },
              { text: item.unit, fontSize: bSz, color: COLORS.muted, alignment: 'center', fillColor: fill, margin: [cellPad, cellPad, cellPad, cellPad] },
              { text: fmt(item.quantity), fontSize: bSz, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [cellPad, cellPad, cellPad, cellPad] },
              { text: fmtCurrency(item.unit_price), fontSize: bSz, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [cellPad, cellPad, cellPad, cellPad] },
              { text: fmtCurrency(importe), fontSize: bSz, bold: true, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [cellPad, cellPad, cellPad, cellPad] },
            ])
          } else {
            itemsBody.push([
              { text: item.code, fontSize: fs.code, color: COLORS.muted, fillColor: fill, margin: [cellPad, cellPad, cellPad, cellPad] },
              {
                stack: [
                  { text: item.name, fontSize: fs.name, bold: true, color: COLORS.text, lineHeight: isLandscape ? 1.15 : 1.1 },
                  ...(item.description ? [{ text: item.description, fontSize: fs.desc, color: COLORS.muted, italics: true, lineHeight: isLandscape ? 1.15 : 1.1, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
                ],
                fillColor: fill,
                margin: [cellPad, cellPad, cellPad, cellPad],
              },
              { text: item.unit, fontSize: bSz, color: COLORS.muted, alignment: 'center', fillColor: fill, margin: [cellPad, cellPad, cellPad, cellPad] },
              { text: fmt(item.quantity), fontSize: bSz, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [cellPad, cellPad, cellPad, cellPad] },
            ])
          }
        })

        // Subtotal row (only when prices are shown — uses 6-column layout)
        if (showPrices) {
          const total = chTotal(ch)
          itemsBody.push([
            { text: '', colSpan: 4, fillColor: COLORS.light }, {}, {}, {},
            { text: 'SUBTOTAL:', bold: true, fontSize: bSz, color: COLORS.primary, alignment: 'right', fillColor: COLORS.light, margin: [4, 6, 4, 6] },
            { text: fmtCurrency(total), bold: true, fontSize: fs.name, color: COLORS.primary, alignment: 'right', fillColor: COLORS.light, margin: [4, 6, 4, 6] },
          ])
        }

        chapterPages.push({
          table: {
            // Banner (row 0) + column headers (row 1) repeat together when the table breaks.
            // keepWithHeaderRows: 1 forces banner+headers+first data row to stay together.
            headerRows: 2,
            widths: tableWidths,
            body: itemsBody,
            dontBreakRows: true,
            keepWithHeaderRows: 1,
          },
          layout: {
            hLineWidth: (i: number, node: any) => {
              // 0 = top, 1 = below banner, 2 = below col headers, body.length = bottom
              if (i === 0 || i === 1) return 0
              if (i === 2 || i === node.table.body.length) return 1
              return 0.3
            },
            vLineWidth: () => 0,
            hLineColor: (i: number, node: any) =>
              (i === 2 || i === node.table.body.length) ? COLORS.primary : '#e2e8f0',
          },
          ...(chIdx === 0 ? { pageBreak: 'before' as const } : {}),
          margin: [0, chIdx > 0 ? 20 : 0, 0, 12],
        })
      }
    } else if (!isLegalText) {
      // Edge case: non-legal chapter with zero items — render banner only.
      chapterPages.push(standaloneBanner())
    }

  })

  // ─── Final Summary Page ────────────────────────────────────────────
  // No `pageBreak: 'before'` here — handled by `pageBreakBefore` callback below.
  // Margins on summary elements have been tightened so that resumen + signatures fit
  // on a single landscape A4 page (content area is only 475pt tall in horizontal).
  const summaryPage: any[] = [
    { id: 'budget-summary', text: 'RESUMEN DE PRESUPUESTO', fontSize: 18, bold: true, color: COLORS.primary, margin: [0, 0, 0, 12] },
  ]

  // Chapter summary table
  const summaryBody: any[][] = showPrices
    ? [[
        { text: 'N.', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [0, 6, 0, 6] },
        { text: 'CAPÍTULO', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, margin: [0, 6, 0, 6] },
        { text: 'IMPORTE', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [0, 6, 0, 6] },
      ]]
    : [[
        { text: 'N.', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [0, 6, 0, 6] },
        { text: 'CAPÍTULO', bold: true, fontSize: 9, color: hdrText, fillColor: hdrFill, margin: [0, 6, 0, 6] },
      ]]

  chapters.forEach((ch, i) => {
    const isLegalText = ch.chapter.is_legal_text
    const fill = rowFill(i)
    const total = isLegalText ? 0 : chTotal(ch)

    if (showPrices) {
      summaryBody.push([
        { text: ch.chapter.code, fontSize: 10, bold: true, color: COLORS.primary, alignment: 'center', fillColor: fill, margin: [0, 5, 0, 5] },
        { text: ch.chapter.name, fontSize: 10, color: COLORS.text, fillColor: fill, margin: [0, 5, 0, 5] },
        { text: isLegalText ? '' : fmtCurrency(total), fontSize: 10, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [0, 5, 0, 5] },
      ])
    } else {
      summaryBody.push([
        { text: ch.chapter.code, fontSize: 10, bold: true, color: COLORS.primary, alignment: 'center', fillColor: fill, margin: [0, 5, 0, 5] },
        { text: ch.chapter.name, fontSize: 10, color: COLORS.text, fillColor: fill, margin: [0, 5, 0, 5] },
      ])
    }
  })

  const summaryWidths = showPrices ? [40, '*', 120] : [40, '*']

  summaryPage.push({
    table: {
      headerRows: 1,
      widths: summaryWidths,
      body: summaryBody,
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.3,
      vLineWidth: () => 0,
      hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? COLORS.primary : '#e2e8f0',
    },
    margin: [0, 0, 0, 15],
  })

  // Calculation breakdown (only with prices)
  if (showPrices) {
    const calcRows: any[][] = [
      [
        { text: 'Presupuesto de Ejecucion Material (PEM)', fontSize: 10, color: COLORS.text, margin: [8, 8, 8, 8] },
        { text: fmtCurrency(pem), fontSize: 10, color: COLORS.text, alignment: 'right', margin: [8, 8, 8, 8] },
      ],
    ]

    if (ivaRate > 0) {
      calcRows.push([
        { text: `IVA (${ivaRate}%)`, fontSize: 10, color: COLORS.muted, margin: [8, 6, 8, 6] },
        { text: fmtCurrency(iva), fontSize: 10, color: COLORS.muted, alignment: 'right', margin: [8, 6, 8, 6] },
      ])
    }

    // ── Bloque interno: coste real + margen bruto (solo versión interna) ──
    if (showCosts) {
      const pemCost = budget.chapters.reduce((sum, ch) =>
        sum + ch.items.reduce((s, it) => s + (it.quantity || 0) * ((it as any).cost_price || 0), 0), 0)
      const marginAbs = pem - pemCost
      const marginPct = pem > 0 ? (marginAbs / pem) * 100 : 0

      calcRows.push([
        { text: '— Versión interna —', fontSize: 8, italics: true, color: COLORS.muted, margin: [8, 10, 8, 2] },
        { text: '', margin: [0, 0, 0, 0] },
      ])
      calcRows.push([
        { text: 'Coste estimado (PEM coste)', fontSize: 10, color: COLORS.muted, margin: [8, 4, 8, 4] },
        { text: fmtCurrency(pemCost), fontSize: 10, color: COLORS.muted, alignment: 'right', margin: [8, 4, 8, 4] },
      ])
      calcRows.push([
        { text: `Margen bruto (${marginPct.toFixed(1)}%)`, fontSize: 10, bold: true, color: marginPct < 10 ? '#d97706' : '#059669', margin: [8, 4, 8, 4] },
        { text: fmtCurrency(marginAbs), fontSize: 10, bold: true, color: marginPct < 10 ? '#d97706' : '#059669', alignment: 'right', margin: [8, 4, 8, 4] },
      ])
    }

    calcRows.push([
      { text: 'TOTAL PRESUPUESTO', fontSize: 14, bold: true, color: COLORS.white, fillColor: COLORS.primary, margin: [8, 10, 8, 10] },
      { text: fmtCurrency(grandTotal), fontSize: 16, bold: true, color: COLORS.white, fillColor: COLORS.primary, alignment: 'right', margin: [8, 10, 8, 10] },
    ])

    summaryPage.push({
      table: {
        widths: ['*', 140],
        body: calcRows,
      },
      layout: {
        hLineWidth: (i: number) => (i === calcRows.length - 1 || i === calcRows.length) ? 1 : 0.3,
        vLineWidth: () => 0,
        hLineColor: (i: number) => (i === calcRows.length - 1 || i === calcRows.length) ? COLORS.primary : COLORS.border,
      },
      margin: [0, 0, 0, 10],
    })

    if (ivaRate === 0) {
      summaryPage.push({
        text: 'Los importes corresponden al Presupuesto de Ejecucion Material, sin IVA.',
        fontSize: 9,
        color: COLORS.muted,
        italics: true,
        margin: [0, 0, 0, 12],
      })
    }

    // Legal text
    summaryPage.push({
      text: [
        { text: 'Asciende el presente presupuesto a la expresada cantidad de ', fontSize: 10, color: COLORS.text },
        { text: numberToWords(grandTotal), bold: true, fontSize: 10, color: COLORS.primary },
        { text: '.', fontSize: 10, color: COLORS.text },
      ],
      margin: [0, 6, 0, 18],
    })
  }

  // Signature area — date line + signatures wrapped in ONE single-row table so they are
  // atomic. dontBreakRows prevents pdfmake from splitting the canvas (lines) from the text
  // labels (which used to land alone on a near-empty extra page in landscape).
  const fullAddress = [companyCity, companyProvince].filter(Boolean).join(', ')
  summaryPage.push({
    table: {
      widths: ['*'],
      body: [[
        {
          border: [false, false, false, false],
          stack: [
            {
              text: `En ${fullAddress || '_______________'}, a ${today}`,
              fontSize: 10,
              color: COLORS.text,
              margin: [0, 0, 0, 22],
            },
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }] },
                    { text: companyName, fontSize: 9, color: COLORS.muted, margin: [0, 4, 0, 0] },
                    { text: companyProfessional ? `Colegiado n. ${companyProfessional}` : '', fontSize: 8, color: COLORS.muted },
                  ],
                },
                {
                  width: '*',
                  stack: [
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }] },
                    { text: 'El Cliente', fontSize: 9, color: COLORS.muted, margin: [0, 4, 0, 0] },
                  ],
                },
              ],
            },
          ],
        },
      ]],
      dontBreakRows: true,
    },
    layout: 'noBorders',
  })

  // ─── General Conditions (New Page) ─────────────────────────────────
  if (generalConditions && generalConditions.trim()) {
    summaryPage.push({
      id: 'budget-conditions',
      text: 'CONDICIONES GENERALES',
      fontSize: 16,
      bold: true,
      color: COLORS.primary,
      margin: [0, 0, 0, 20],
    })
    summaryPage.push({
      text: generalConditions,
      fontSize: 10,
      color: COLORS.text,
      alignment: 'justify',
      lineHeight: 1.2,
    })
  }

  // ─── Build Document Definition ─────────────────────────────────────
  return {
    pageSize: 'A4' as const,
    pageOrientation: orientation,
    pageMargins: [40, 60, 40, 60] as [number, number, number, number],
    content: [
      ...coverPage,
      ...indexPage,
      ...chapterPages,
      ...summaryPage,
    ],
    // pageBreakBefore: ensure the budget summary and conditions section start on a fresh
    // page, but ONLY if the node would otherwise land mid-page. We check `startPosition.top`
    // directly (stable across pdfmake's layout passes) instead of `previousNodesOnPage.length`,
    // which produced phantom blank pages.
    // Note: orphan chapter banners are handled structurally — banner + column headers + at
    // least one data row are part of the same table with `keepWithHeaderRows: 1`.
    pageBreakBefore: (currentNode: any) => {
      if (currentNode.id === 'budget-summary' || currentNode.id === 'budget-conditions') {
        const top = currentNode?.startPosition?.top ?? 0
        // Top margin is 60pt; anything below ~100pt means the node is not at the page top.
        return top > 100
      }
      return false
    },
    styles: {
      header: { fontSize: 18, bold: true, color: COLORS.primary },
    },
    defaultStyle: {
      font: fontFamily,
      fontSize: 10,
      color: COLORS.text,
      lineHeight: 1.15,
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: companyName, fontSize: 7, color: COLORS.muted, alignment: 'left', margin: [40, 0, 0, 0] },
        { text: `${documentName || budget.budget.name} — ${today}`, fontSize: 7, color: COLORS.muted, alignment: 'center' },
        { text: `Pagina ${currentPage} de ${pageCount}`, fontSize: 7, color: COLORS.muted, alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 20, 0, 0],
    }),
    header: (currentPage: number) => {
      if (currentPage === 1) return {}
      return {
        columns: [
          {
            canvas: [{ type: 'rect', x: 0, y: 0, w: contentWidth, h: Math.max(2, Math.round(topBarH * 0.4)), color: COLORS.primary }],
            margin: [40, 15, 40, 0],
          },
        ],
      }
    },
  }
}

/**
 * Generate a PDF Blob for preview (does NOT trigger download)
 */
export async function generateBudgetPdfBlob(
  budget: FullBudget,
  projectName: string,
  company: CompanyInfo,
  options?: BudgetPdfOptions
): Promise<Blob> {
  const pdf = await loadPdfMake()
  const fontFamily = options?.pdfStyles?.pdf_font_family ?? 'Roboto'
  const fonts = getFonts(fontFamily)
  const logoBase64 = await fetchImageAsBase64(company.company_logo_url)
  const docDef = buildBudgetDocDefinition(budget, projectName, company, options, logoBase64)
  return new Promise<Blob>((resolve) => {
    pdf.createPdf(docDef, null, fonts, pdf.vfs).getBlob((blob: Blob) => resolve(blob))
  })
}

/**
 * Generate and directly download budget PDF
 */
export async function exportBudgetPdf(
  budget: FullBudget,
  projectName: string,
  company: CompanyInfo,
  options?: BudgetPdfOptions
) {
  const blob = await generateBudgetPdfBlob(budget, projectName, company, options)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Presupuesto_${budget.budget.name.replace(/\s+/g, '_')}_v${budget.budget.version}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
