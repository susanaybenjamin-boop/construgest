/**
 * samplePdfPreview.ts — Generates a sample PDF document for the style configurator preview.
 * Uses the same structure as budgetPdfExport.ts but with dummy data.
 */
import type { PdfStyleOptions } from './budgetPdfExport'
import { getFonts, loadPdfMake } from './budgetPdfExport'

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

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

export function buildSampleDocDefinition(pdfStyles?: PdfStyleOptions) {
  const COLORS = buildStyleColors(pdfStyles)
  const headerShadow  = pdfStyles?.pdf_header_shadow  !== false
  const rowStriping   = pdfStyles?.pdf_row_striping   !== false
  const logoWidth     = pdfStyles?.pdf_logo_width     ?? 140
  const logoAlign     = (pdfStyles?.pdf_logo_align    ?? 'left') as 'left' | 'center' | 'right'
  const topBarH       = pdfStyles?.pdf_top_bar_height ?? 8
  const fontFamily    = pdfStyles?.pdf_font_family    ?? 'Roboto'
  const titleSize     = pdfStyles?.pdf_title_size     ?? 36
  const subtitleSize  = pdfStyles?.pdf_subtitle_size  ?? 18
  const tHdr          = pdfStyles?.pdf_table_header_size ?? 9
  const bSz           = pdfStyles?.pdf_body_size      ?? 9
  const hdrFill       = headerShadow ? COLORS.primary : COLORS.white
  const hdrText       = headerShadow ? COLORS.white   : COLORS.primary
  const rowFill       = (i: number) => rowStriping ? (i % 2 === 0 ? COLORS.white : COLORS.light) : COLORS.white

  const contentWidth = 515
  const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })

  // Dummy data
  const companyName = 'CONSTRUCTORA EJEMPLO S.L.'
  const items = [
    { code: '01.01', name: 'Excavación en vaciado', unit: 'm³', qty: 120, price: 18.50 },
    { code: '01.02', name: 'Relleno y compactación', unit: 'm³', qty: 85, price: 12.00 },
    { code: '01.03', name: 'Encofrado de madera', unit: 'm²', qty: 200, price: 24.00 },
    { code: '01.04', name: 'Hormigón HA-25', unit: 'm³', qty: 45, price: 95.00 },
    { code: '01.05', name: 'Acero corrugado B-500', unit: 'kg', qty: 3500, price: 1.20 },
  ]
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  // Cover page
  const coverPage: any[] = [
    {
      canvas: [{ type: 'rect', x: 0, y: 0, w: contentWidth, h: topBarH, color: COLORS.primary }],
      margin: [0, 0, 0, 20],
    },
    // Logo placeholder box
    {
      canvas: [{
        type: 'rect', x: 0, y: 0,
        w: logoWidth, h: Math.round(logoWidth * 0.4),
        color: COLORS.light, r: 4,
      }],
      alignment: logoAlign,
      margin: [0, 0, 0, 8],
    },
    {
      text: [
        { text: 'LOGO ', fontSize: Math.round(logoWidth * 0.09), color: COLORS.muted, bold: true },
      ],
      alignment: logoAlign,
      margin: [0, -Math.round(logoWidth * 0.25), 0, 16],
    },
    {
      text: companyName,
      fontSize: 20, bold: true, color: COLORS.primary, margin: [0, 0, 0, 4],
    },
    {
      text: 'CIF: B-12345678  |  N. Colegiado: 1234',
      fontSize: 10, color: COLORS.muted, margin: [0, 0, 0, 2],
    },
    {
      text: 'Calle Ejemplo 42, 28001 Madrid',
      fontSize: 10, color: COLORS.muted, margin: [0, 0, 0, 2],
    },
    {
      text: '91 000 00 00  |  info@ejemplo.com',
      fontSize: 10, color: COLORS.muted, margin: [0, 0, 0, 30],
    },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 2, lineColor: COLORS.primary }],
      margin: [0, 0, 0, 30],
    },
    {
      text: 'PRESUPUESTO',
      fontSize: titleSize, bold: true, color: COLORS.dark, alignment: 'right', margin: [0, 0, 0, 4],
    },
    {
      text: 'DE EJECUCIÓN MATERIAL',
      fontSize: subtitleSize, color: COLORS.primaryLight, alignment: 'right', margin: [0, 0, 0, 20],
    },
    {
      table: {
        widths: ['*'],
        body: [[{
          text: [
            { text: 'IMPORTE TOTAL: ', fontSize: 14, color: COLORS.white },
            { text: fmtCurrency(total), fontSize: 22, bold: true, color: COLORS.white },
          ],
          alignment: 'center', margin: [0, 12, 0, 12],
        }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => COLORS.primary },
    },
  ]

  // Chapter header
  const chapterBanner = {
    table: {
      widths: ['*'],
      body: [[{
        text: [
          { text: 'CAPÍTULO 01   ', bold: true, fontSize: 14, color: hdrText },
          { text: 'MOVIMIENTO DE TIERRAS', fontSize: 13, color: hdrText },
        ],
        margin: [8, 8, 8, 8],
      }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => hdrFill,
    },
    pageBreak: 'before' as const,
    margin: [0, 0, 0, 12],
  }

  // Items table
  const itemsBody: any[][] = [
    [
      { text: 'Cod.', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, margin: [4, 5, 4, 5] },
      { text: 'Concepto', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, margin: [4, 5, 4, 5] },
      { text: 'Ud.', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'center', margin: [4, 5, 4, 5] },
      { text: 'Cantidad', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [4, 5, 4, 5] },
      { text: 'Precio', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [4, 5, 4, 5] },
      { text: 'Importe', bold: true, fontSize: tHdr, color: hdrText, fillColor: hdrFill, alignment: 'right', margin: [4, 5, 4, 5] },
    ],
  ]

  items.forEach((item, i) => {
    const fill = rowFill(i)
    itemsBody.push([
      { text: item.code, fontSize: bSz - 0.5, color: COLORS.muted, fillColor: fill, margin: [4, 4, 4, 4] },
      { text: item.name, fontSize: bSz + 1, bold: true, color: COLORS.text, fillColor: fill, margin: [4, 4, 4, 4] },
      { text: item.unit, fontSize: bSz, color: COLORS.muted, alignment: 'center', fillColor: fill, margin: [4, 4, 4, 4] },
      { text: fmt(item.qty), fontSize: bSz, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [4, 4, 4, 4] },
      { text: fmtCurrency(item.price), fontSize: bSz, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [4, 4, 4, 4] },
      { text: fmtCurrency(item.qty * item.price), fontSize: bSz, bold: true, color: COLORS.text, alignment: 'right', fillColor: fill, margin: [4, 4, 4, 4] },
    ])
  })

  itemsBody.push([
    { text: '', colSpan: 4, fillColor: COLORS.light }, {}, {}, {},
    { text: 'SUBTOTAL:', bold: true, fontSize: bSz, color: COLORS.primary, alignment: 'right', fillColor: COLORS.light, margin: [4, 6, 4, 6] },
    { text: fmtCurrency(total), bold: true, fontSize: bSz + 1, color: COLORS.primary, alignment: 'right', fillColor: COLORS.light, margin: [4, 6, 4, 6] },
  ])

  const itemsTable = {
    table: {
      headerRows: 1,
      widths: [55, '*', 30, 55, 65, 75],
      body: itemsBody,
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.3,
      vLineWidth: () => 0,
      hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? COLORS.primary : '#e2e8f0',
    },
  }

  return {
    pageSize: 'A4' as const,
    pageOrientation: 'portrait' as const,
    pageMargins: [40, 60, 40, 60] as [number, number, number, number],
    content: [...coverPage, chapterBanner, itemsTable],
    defaultStyle: {
      font: fontFamily,
      fontSize: 10,
      color: COLORS.text,
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: companyName, fontSize: 7, color: COLORS.muted, alignment: 'left', margin: [40, 0, 0, 0] },
        { text: `Presupuesto Ejemplo — ${today}`, fontSize: 7, color: COLORS.muted, alignment: 'center' },
        { text: `Pagina ${currentPage} de ${pageCount}`, fontSize: 7, color: COLORS.muted, alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 20, 0, 0],
    }),
    header: (currentPage: number) => {
      if (currentPage === 1) return {}
      return {
        columns: [{
          canvas: [{ type: 'rect', x: 0, y: 0, w: contentWidth, h: Math.max(2, Math.round(topBarH * 0.4)), color: COLORS.primary }],
          margin: [40, 15, 40, 0],
        }],
      }
    },
  }
}

export async function generateSamplePdfBlob(pdfStyles?: PdfStyleOptions): Promise<Blob> {
  const pdf = await loadPdfMake()
  const fontFamily = pdfStyles?.pdf_font_family ?? 'Roboto'
  const fonts = getFonts(fontFamily)
  const docDef = buildSampleDocDefinition(pdfStyles)
  return new Promise<Blob>((resolve) => {
    pdf.createPdf(docDef, null, fonts, pdf.vfs).getBlob((blob: Blob) => resolve(blob))
  })
}
