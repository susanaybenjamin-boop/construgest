/**
 * certificationPdfExport.ts — Professional certification PDF export using pdfmake
 * Generates: Cover page, Detail by chapter, Summary with IVA, Signature block
 * Ported from the desktop (Tauri) app styling
 */
import type { CertificationSummary, CertificationItem, ProjectInfo, FullBudget } from '@/types'
import { getFonts, loadPdfMake } from './budgetPdfExport'

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

function formatDate(date: string | Date | null): string {
  if (!date) return '\u2014'
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

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
  amber: '#d97706',
}

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
    amber:        DEFAULT_COLORS.amber,
  }
}

// ─── Company info interface ─────────────────────────────────────────────
interface CompanyInfo {
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

// ─── Options ────────────────────────────────────────────────────────────
export interface CertificationPdfOptions {
  orientation?: 'portrait' | 'landscape'
  includeIva?: boolean
  ivaRate?: number
  ivaIncludedInTotal?: boolean
  margins?: { top: number; bottom: number; left: number; right: number }
  pdfStyles?: PdfStyleOptions
}

// ─── Group items by chapter ─────────────────────────────────────────────
interface ChapterGroup {
  chapterId: string
  chapterCode: string
  chapterName: string
  items: CertificationItem[]
  chapterPrevious: number
  chapterCurrent: number
  chapterOrigin: number
  chapterBudget: number
}

function groupByChapter(items: CertificationItem[]): ChapterGroup[] {
  const map = new Map<string, ChapterGroup>()
  for (const item of items) {
    const chId = item.chapter_id || 'unknown'
    if (!map.has(chId)) {
      map.set(chId, {
        chapterId: chId,
        chapterCode: item.chapter_code || '\u2014',
        chapterName: item.chapter_name || 'Sin capitulo',
        items: [],
        chapterPrevious: 0,
        chapterCurrent: 0,
        chapterOrigin: 0,
        chapterBudget: 0,
      })
    }
    const g = map.get(chId)!
    g.items.push(item)
    g.chapterPrevious += item.previous_amount
    g.chapterCurrent += item.certified_amount
    g.chapterOrigin += item.previous_amount + item.certified_amount
    g.chapterBudget += (item.item_quantity || 0) * (item.item_unit_price || 0)
  }
  return Array.from(map.values())
}

// ─── Build Document Definition ──────────────────────────────────────────
function buildCertificationDocDefinition(
  certification: CertificationSummary,
  project: ProjectInfo,
  budget: FullBudget,
  company: CompanyInfo,
  options: CertificationPdfOptions = {},
  logoBase64?: string | null
) {
  const {
    orientation = 'portrait',
    includeIva = false,
    ivaRate = budget.budget.tax_rate || 21,
    ivaIncludedInTotal = false,
    pdfStyles,
  } = options

  // ─── Style overrides ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const COLORS = buildStyleColors(pdfStyles)
  const headerShadow  = pdfStyles?.pdf_header_shadow  !== false
  const rowStriping   = pdfStyles?.pdf_row_striping   !== false
  const logoWidth     = pdfStyles?.pdf_logo_width     ?? 140
  const logoAlign     = (pdfStyles?.pdf_logo_align    ?? 'left') as 'left' | 'center' | 'right'
  const topBarH       = pdfStyles?.pdf_top_bar_height ?? 8
  const fontFamily    = pdfStyles?.pdf_font_family    ?? 'Roboto'
  const hdrFill       = headerShadow ? COLORS.primary : COLORS.white
  const hdrText       = headerShadow ? COLORS.white   : COLORS.primary
  const rowFill       = (i: number) => rowStriping ? (i % 2 === 0 ? COLORS.white : COLORS.light) : COLORS.white

  const cert = certification.certification
  const certItems = certification.items
  const chapters = groupByChapter(certItems)
  // Budget total for certified items only (used in summary table per-chapter rows)
  const certItemsBudgetTotal = certItems.reduce((s, i) => s + (i.item_quantity || 0) * (i.item_unit_price || 0), 0)
  // FULL budget total (for progress calculation) — derived from backend's total_pending = fullBudget - totalCertified
  const fullBudgetTotal = certification.total_certified + certification.total_pending

  const isPortrait = orientation === 'portrait'
  const pageContentWidth = isPortrait ? 515 : 770
  const fs = isPortrait
    ? { detail: 7.5, detailName: 8, header: 6.5 }
    : { detail: 8.5, detailName: 9, header: 7.5 }

  const companyName = company.company_name || 'Empresa Constructora'
  const companyCif = company.company_cif || ''
  const companyAddress = company.company_address || ''
  const companyCity = company.company_city || ''
  const companyProvince = company.company_province || ''
  const companyPostal = company.company_postal_code || ''
  const companyPhone = company.company_phone || ''
  const companyEmail = company.company_email || ''
  const companyProfessional = company.company_professional_number || ''

  const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })

  // ─── Cover Page ─────────────────────────────────────────────────────
  const coverGapLg = isPortrait ? 40 : 15
  const coverGapMd = isPortrait ? 30 : 12
  const coverPage: any[] = [
    { canvas: [{ type: 'rect', x: 0, y: 0, w: pageContentWidth, h: topBarH, color: COLORS.primary }], margin: [0, 0, 0, isPortrait ? 20 : 10] },
    // Company logo (if available)
    ...(logoBase64 ? [{
      image: logoBase64,
      width: logoWidth,
      alignment: logoAlign,
      margin: [0, 0, 0, 8] as [number, number, number, number],
    }] : []),
    { text: companyName.toUpperCase(), fontSize: isPortrait ? 24 : 20, bold: true, color: COLORS.primary, margin: [0, 0, 0, 4] },
    {
      text: [companyCif ? `CIF: ${companyCif}` : '', companyProfessional ? `  |  N. Colegiado: ${companyProfessional}` : ''].filter(Boolean).join(''),
      fontSize: 10, color: COLORS.muted, margin: [0, 0, 0, 2],
    },
    {
      text: [companyAddress, companyPostal, companyCity, companyProvince].filter(Boolean).join(', '),
      fontSize: 10, color: COLORS.muted, margin: [0, 0, 0, 2],
    },
    {
      text: [companyPhone, companyEmail].filter(Boolean).join('  |  '),
      fontSize: 10, color: COLORS.muted, margin: [0, 0, 0, coverGapLg],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: pageContentWidth, y2: 0, lineWidth: 2, lineColor: COLORS.primary }], margin: [0, 0, 0, coverGapLg] },
    { text: 'CERTIFICACIÓN DE OBRA', fontSize: isPortrait ? (pdfStyles?.pdf_title_size ?? 36) : Math.round((pdfStyles?.pdf_title_size ?? 36) * 0.78), bold: true, color: COLORS.dark, alignment: 'right', margin: [0, 0, 0, 4] },
    { text: `N. ${cert.number}`, fontSize: isPortrait ? (pdfStyles?.pdf_subtitle_size ?? 22) : Math.round((pdfStyles?.pdf_subtitle_size ?? 22) * 0.78), color: COLORS.primaryLight, alignment: 'right', margin: [0, 0, 0, coverGapMd] },
    // Info table
    {
      table: {
        widths: [120, '*'],
        body: [
          [
            { text: 'Certificacion:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: cert.name, bold: true, fontSize: 12, color: COLORS.text },
          ],
          [
            { text: 'Proyecto:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: project.name, fontSize: 11, color: COLORS.text },
          ],
          [
            { text: 'Cliente:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: project.client_name || '\u2014', fontSize: 11, color: COLORS.text },
          ],
          [
            { text: 'Periodo:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: `${formatDate(cert.period_start)} al ${formatDate(cert.period_end)}`, fontSize: 11, color: COLORS.text },
          ],
          [
            { text: 'Fecha emision:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: today, fontSize: 11, color: COLORS.text },
          ],
          ...(cert.invoice_number ? [[
            { text: 'Factura asociada:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: cert.invoice_number, fontSize: 12, bold: true, color: COLORS.primary },
          ]] : []),
          [
            { text: 'Avance de obra:', bold: true, color: COLORS.muted, fontSize: 10 },
            { text: `${fmt(fullBudgetTotal > 0 ? (certification.total_certified / fullBudgetTotal) * 100 : 0)}%`, fontSize: 12, bold: true, color: COLORS.accent },
          ],
        ],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => isPortrait ? 6 : 4, paddingBottom: () => isPortrait ? 6 : 4 },
      margin: [0, 0, 0, coverGapLg],
    },
    // Grand total boxes
    {
      table: {
        widths: ['*', '*'],
        body: [
          [
            {
              text: [
                { text: 'ESTA CERTIFICACIÓN: ', fontSize: 11, color: COLORS.white },
                { text: fmtCurrency(certification.total_current), fontSize: 18, bold: true, color: COLORS.white },
              ],
              alignment: 'center', margin: [0, 10, 0, 10],
            },
            {
              text: [
                { text: 'A ORIGEN: ', fontSize: 11, color: COLORS.white },
                { text: fmtCurrency(certification.total_certified), fontSize: 18, bold: true, color: COLORS.white },
              ],
              alignment: 'center', margin: [0, 10, 0, 10],
            },
          ],
        ],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => COLORS.primary },
    },
  ]

  // ─── Detail Pages (by chapter) ────────────────────────────────────────
  const detailPages: any[] = [
    { text: 'DETALLE POR CAPÍTULOS', fontSize: 18, bold: true, color: COLORS.primary, margin: [0, 0, 0, 20], pageBreak: 'before' },
  ]

  // 8 columns (P.U. removed): Cod, Concepto, Ud, Presup., Anterior, Actual, A Origen, Importe
  const detailWidths = isPortrait
    ? [30, '*', 20, 42, 42, 42, 42, 58]
    : [40, '*', 25, 55, 55, 55, 55, 75]

  chapters.forEach((ch, chIdx) => {
    // Chapter banner
    detailPages.push({
      table: {
        widths: ['*'],
        body: [[{
          text: [
            { text: `CAPÍTULO ${ch.chapterCode}   `, bold: true, fontSize: isPortrait ? 10 : 12, color: COLORS.white },
            { text: ch.chapterName.toUpperCase(), fontSize: isPortrait ? 9 : 11, color: COLORS.white },
          ],
          margin: [8, 6, 8, 6],
        }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => COLORS.primary },
      margin: [0, chIdx > 0 ? 16 : 0, 0, 8],
    })

    // Items table — 8 columns (without P.U.)
    const tHdr = pdfStyles?.pdf_table_header_size ?? fs.header
    const tableBody: any[][] = [[
      { text: 'Cod', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, margin: [2, 4, 2, 4] },
      { text: 'Concepto', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, margin: [2, 4, 2, 4] },
      { text: 'Ud', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [1, 4, 1, 4] },
      { text: 'Presup.', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [1, 4, 1, 4] },
      { text: 'Anterior', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [1, 4, 1, 4] },
      { text: 'Actual', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [1, 4, 1, 4] },
      { text: 'A Origen', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [1, 4, 1, 4] },
      { text: 'Importe', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [2, 4, 2, 4] },
    ]]

    ch.items.forEach((item, i) => {
      const fill = rowFill(i)
      const originQty = item.previous_quantity + item.certified_quantity
      tableBody.push([
        { text: item.item_code || '', fontSize: fs.detail, color: COLORS.muted, fillColor: fill, margin: [2, 3, 2, 3] },
        { text: item.item_name || '', fontSize: fs.detailName, color: COLORS.text, fillColor: fill, margin: [2, 3, 2, 3] },
        { text: item.item_unit || '', fontSize: fs.detail, color: COLORS.muted, fillColor: fill, alignment: 'center', margin: [1, 3, 1, 3] },
        { text: fmt(item.item_quantity || 0), fontSize: fs.detail, color: COLORS.text, fillColor: fill, alignment: 'right', margin: [1, 3, 1, 3] },
        { text: fmt(item.previous_quantity), fontSize: fs.detail, color: COLORS.muted, fillColor: fill, alignment: 'right', margin: [1, 3, 1, 3] },
        { text: fmt(item.certified_quantity), fontSize: fs.detail, bold: true, color: COLORS.primary, fillColor: fill, alignment: 'right', margin: [1, 3, 1, 3] },
        { text: fmt(originQty), fontSize: fs.detail, color: COLORS.text, fillColor: fill, alignment: 'right', margin: [1, 3, 1, 3] },
        { text: fmtCurrency(item.certified_amount), fontSize: fs.detail, bold: true, color: COLORS.text, fillColor: fill, alignment: 'right', margin: [2, 3, 2, 3] },
      ])
    })

    // Subtotal
    tableBody.push([
      { text: '', colSpan: 6, fillColor: COLORS.light }, {}, {}, {}, {}, {},
      { text: 'SUBTOTAL:', bold: true, fontSize: fs.detail, color: COLORS.primary, alignment: 'right', fillColor: COLORS.light, margin: [1, 4, 1, 4] },
      { text: fmtCurrency(ch.chapterCurrent), bold: true, fontSize: fs.detail + 1, color: COLORS.primary, alignment: 'right', fillColor: COLORS.light, margin: [2, 4, 2, 4] },
    ])

    detailPages.push({
      table: { headerRows: 1, widths: detailWidths, body: tableBody },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.3,
        vLineWidth: () => 0,
        hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? COLORS.primary : '#e2e8f0',
      },
    })
  })

  // ─── Summary Page ───────────────────────────────────────────────────
  const summaryPage: any[] = [
    { text: 'RESUMEN DE CERTIFICACIÓN', fontSize: 18, bold: true, color: COLORS.primary, margin: [0, 0, 0, 20], pageBreak: 'before' },
  ]

  const summaryColWidths = isPortrait
    ? [30, '*', 65, 65, 65, 65, 65]
    : [40, '*', 90, 90, 90, 90, 90]

  const summaryBody: any[][] = [[
    { text: 'Cap.', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [0, 5, 0, 5] },
    { text: 'Capitulo', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, margin: [0, 5, 0, 5] },
    { text: 'Presup.', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [0, 5, 0, 5] },
    { text: 'Anterior', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [0, 5, 0, 5] },
    { text: 'Actual', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [0, 5, 0, 5] },
    { text: 'A Origen', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [0, 5, 0, 5] },
    { text: 'Pend.', bold: true, fontSize: 8, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [0, 5, 0, 5] },
  ]]

  chapters.forEach((ch, i) => {
    const fill = rowFill(i)
    const pending = ch.chapterBudget - ch.chapterOrigin
    summaryBody.push([
      { text: ch.chapterCode, fontSize: 9, bold: true, color: COLORS.primary, alignment: 'center', fillColor: fill, margin: [0, 4, 0, 4] },
      { text: ch.chapterName, fontSize: 9, color: COLORS.text, fillColor: fill, margin: [0, 4, 0, 4] },
      { text: fmtCurrency(ch.chapterBudget), fontSize: 9, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [0, 4, 0, 4] },
      { text: fmtCurrency(ch.chapterPrevious), fontSize: 9, color: COLORS.muted, alignment: 'right', fillColor: fill, margin: [0, 4, 0, 4] },
      { text: fmtCurrency(ch.chapterCurrent), fontSize: 9, bold: true, color: COLORS.primary, alignment: 'right', fillColor: fill, margin: [0, 4, 0, 4] },
      { text: fmtCurrency(ch.chapterOrigin), fontSize: 9, color: COLORS.accent, alignment: 'right', fillColor: fill, margin: [0, 4, 0, 4] },
      { text: fmtCurrency(pending), fontSize: 9, color: COLORS.amber, alignment: 'right', fillColor: fill, margin: [0, 4, 0, 4] },
    ])
  })

  // Totals row
  summaryBody.push([
    { text: '', fillColor: COLORS.primary },
    { text: 'TOTALES', bold: true, fontSize: 10, color: COLORS.white, fillColor: COLORS.primary, margin: [0, 5, 0, 5] },
    { text: fmtCurrency(fullBudgetTotal), bold: true, fontSize: 9, color: COLORS.white, fillColor: COLORS.primary, alignment: 'right', margin: [0, 5, 0, 5] },
    { text: fmtCurrency(certification.total_previous), bold: true, fontSize: 9, color: COLORS.white, fillColor: COLORS.primary, alignment: 'right', margin: [0, 5, 0, 5] },
    { text: fmtCurrency(certification.total_current), bold: true, fontSize: 9, color: COLORS.white, fillColor: COLORS.primary, alignment: 'right', margin: [0, 5, 0, 5] },
    { text: fmtCurrency(certification.total_certified), bold: true, fontSize: 9, color: COLORS.white, fillColor: COLORS.primary, alignment: 'right', margin: [0, 5, 0, 5] },
    { text: fmtCurrency(certification.total_pending), bold: true, fontSize: 9, color: COLORS.white, fillColor: COLORS.primary, alignment: 'right', margin: [0, 5, 0, 5] },
  ])

  summaryPage.push({
    table: { headerRows: 1, widths: summaryColWidths, body: summaryBody },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1.5 : 0.5,
      vLineWidth: () => 0,
      hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? COLORS.primary : COLORS.border,
    },
    margin: [0, 0, 0, 25],
  })

  // Progress + Total box
  const progressPct = fullBudgetTotal > 0 ? (certification.total_certified / fullBudgetTotal) * 100 : 0
  summaryPage.push({
    table: {
      widths: ['*', 140],
      body: [
        [
          { text: `Avance de obra: ${fmt(progressPct)}%`, fontSize: 11, color: COLORS.text, margin: [8, 8, 8, 8] },
          { text: `${fmtCurrency(certification.total_certified)} / ${fmtCurrency(fullBudgetTotal)}`, fontSize: 10, color: COLORS.muted, alignment: 'right', margin: [8, 8, 8, 8] },
        ],
        [
          { text: 'TOTAL ESTA CERTIFICACIÓN', fontSize: 14, bold: true, color: COLORS.white, fillColor: COLORS.primary, margin: [8, 10, 8, 10] },
          { text: fmtCurrency(certification.total_current), fontSize: 16, bold: true, color: COLORS.white, fillColor: COLORS.primary, alignment: 'right', margin: [8, 10, 8, 10] },
        ],
      ],
    },
    layout: {
      hLineWidth: (i: number) => i === 1 ? 1 : 0,
      vLineWidth: () => 0,
      hLineColor: () => COLORS.border,
    },
    margin: [0, 0, 0, 10],
  })

  // ─── IVA Section ─────────────────────────────────────────────────────
  if (includeIva) {
    const ivaAmount = certification.total_current * (ivaRate / 100)

    if (ivaIncludedInTotal) {
      summaryPage.push({
        table: {
          widths: ['*', 140],
          body: [
            [
              { text: 'Base imponible', fontSize: 10, color: COLORS.text, margin: [8, 6, 8, 6] },
              { text: fmtCurrency(certification.total_current), fontSize: 10, color: COLORS.text, alignment: 'right', margin: [8, 6, 8, 6] },
            ],
            [
              { text: `IVA (${fmt(ivaRate)}%)`, fontSize: 10, color: COLORS.text, margin: [8, 6, 8, 6] },
              { text: fmtCurrency(ivaAmount), fontSize: 10, color: COLORS.text, alignment: 'right', margin: [8, 6, 8, 6] },
            ],
            [
              { text: 'TOTAL CON IVA', fontSize: 13, bold: true, color: COLORS.white, fillColor: COLORS.accent, margin: [8, 8, 8, 8] },
              { text: fmtCurrency(certification.total_current + ivaAmount), fontSize: 14, bold: true, color: COLORS.white, fillColor: COLORS.accent, alignment: 'right', margin: [8, 8, 8, 8] },
            ],
          ],
        },
        layout: {
          hLineWidth: (i: number) => i === 2 ? 1 : 0.3,
          vLineWidth: () => 0,
          hLineColor: () => COLORS.border,
        },
        margin: [0, 10, 0, 20],
      })
    } else {
      summaryPage.push({
        text: [
          { text: 'IVA NO INCLUIDO. ', bold: true, fontSize: 10, color: COLORS.amber },
          { text: `El IVA aplicable (${fmt(ivaRate)}%) asciende a `, fontSize: 9, color: COLORS.muted },
          { text: fmtCurrency(ivaAmount), bold: true, fontSize: 10, color: COLORS.text },
        ],
        margin: [0, 10, 0, 20],
      })
    }
  }

  // Legal text
  summaryPage.push({
    text: [
      { text: 'Asciende la presente certificacion a la expresada cantidad de ', fontSize: 10, color: COLORS.text },
      { text: numberToWords(certification.total_current), bold: true, fontSize: 10, color: COLORS.primary },
      { text: '.', fontSize: 10, color: COLORS.text },
    ],
    margin: [0, 0, 0, 30],
  })

  // Signature area
  const fullAddress = [companyCity, companyProvince].filter(Boolean).join(', ')
  const sigLineWidth = isPortrait ? 140 : 180

  summaryPage.push(
    { text: `En ${fullAddress || '_______________'}, a ${today}`, fontSize: 10, color: COLORS.text, margin: [0, 0, 0, 60] },
    {
      columns: [
        {
          width: '*',
          stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: sigLineWidth, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }] },
            { text: 'La Direccion Facultativa', fontSize: 9, color: COLORS.muted, margin: [0, 4, 0, 0] },
            { text: companyName, fontSize: 8, color: COLORS.muted },
          ],
        },
        {
          width: '*',
          stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: sigLineWidth, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }] },
            { text: 'La Empresa Constructora', fontSize: 9, color: COLORS.muted, margin: [0, 4, 0, 0] },
          ],
        },
        {
          width: '*',
          stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: sigLineWidth, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }] },
            { text: 'La Propiedad', fontSize: 9, color: COLORS.muted, margin: [0, 4, 0, 0] },
            { text: project.client_name || '', fontSize: 8, color: COLORS.muted },
          ],
        },
      ],
    },
  )

  // ─── Document Definition ─────────────────────────────────────────────
  return {
    pageSize: 'A4' as const,
    pageOrientation: orientation,
    pageMargins: [40, 50, 40, 50] as [number, number, number, number],
    content: [...coverPage, ...detailPages, ...summaryPage],
    defaultStyle: { font: fontFamily, fontSize: 10, color: COLORS.text, lineHeight: 1.15 },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: companyName, fontSize: 7, color: COLORS.muted, alignment: 'left', margin: [40, 0, 0, 0] },
        { text: `Certificacion #${cert.number} \u2014 ${cert.name}`, fontSize: 7, color: COLORS.muted, alignment: 'center' },
        { text: `Pagina ${currentPage} de ${pageCount}`, fontSize: 7, color: COLORS.muted, alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 15, 0, 0],
    }),
    header: (currentPage: number) => {
      if (currentPage === 1) return {}
      return {
        columns: [{ canvas: [{ type: 'rect', x: 0, y: 0, w: pageContentWidth, h: Math.max(2, Math.round(topBarH * 0.4)), color: COLORS.primary }], margin: [40, 12, 40, 0] }],
      }
    },
  }
}

/**
 * Generate a PDF Blob for preview (does NOT trigger download)
 */
export async function generateCertificationPdfBlob(
  certification: CertificationSummary,
  project: ProjectInfo,
  budget: FullBudget,
  company: CompanyInfo,
  options?: CertificationPdfOptions
): Promise<Blob> {
  const pdf = await loadPdfMake()
  const fontFamily = options?.pdfStyles?.pdf_font_family ?? 'Roboto'
  const fonts = getFonts(fontFamily)
  const logoBase64 = await fetchImageAsBase64(company.company_logo_url)
  const docDef = buildCertificationDocDefinition(certification, project, budget, company, options, logoBase64)
  return new Promise<Blob>((resolve) => {
    pdf.createPdf(docDef, null, fonts, pdf.vfs).getBlob((blob: Blob) => resolve(blob))
  })
}

/**
 * Generate and directly download certification PDF
 */
export async function generateCertificationPdf(
  certification: CertificationSummary,
  project: ProjectInfo,
  budget: FullBudget,
  company: CompanyInfo
): Promise<void> {
  const cert = certification.certification
  const blob = await generateCertificationPdfBlob(certification, project, budget, company)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Certificacion_${cert.number}_${project.name.replace(/\s+/g, '_')}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
