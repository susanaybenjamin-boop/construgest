import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const AFM_DIR = path.join(process.cwd(), 'node_modules/@foliojs-fork/pdfkit/js/data')

const FONT_FILES = [
  'Courier.afm', 'Courier-Bold.afm', 'Courier-Oblique.afm', 'Courier-BoldOblique.afm',
  'Helvetica.afm', 'Helvetica-Bold.afm', 'Helvetica-Oblique.afm', 'Helvetica-BoldOblique.afm',
  'Times-Roman.afm', 'Times-Bold.afm', 'Times-Italic.afm', 'Times-BoldItalic.afm',
]

let cached: Record<string, string> | null = null

export async function GET() {
  if (!cached) {
    cached = {}
    for (const file of FONT_FILES) {
      try {
        cached[`data/${file}`] = fs.readFileSync(path.join(AFM_DIR, file), 'latin1')
      } catch {
        // ignore missing files
      }
    }
  }
  return NextResponse.json(cached)
}
