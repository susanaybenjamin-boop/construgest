// ============================================================================
// OCR 100% local para PDFs escaneados (sin nube). Pipeline:
//   PDF (base64) --pdftoppm--> PNG por página --tesseract(spa)--> texto
// Requiere en la imagen: poppler-utils (pdftoppm) + tesseract-ocr + datos 'spa'
// (ver backend/Dockerfile). El texto resultante lo consume parseBudgetFromText.
// ============================================================================
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, rm, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const execFileP = promisify(execFile)

// ¿Están disponibles las herramientas de OCR? (para degradar con mensaje claro)
export async function ocrAvailable() {
  try {
    await execFileP('pdftoppm', ['-v'])
    await execFileP('tesseract', ['--version'])
    return true
  } catch {
    return false
  }
}

// Convierte un PDF (base64) en texto mediante OCR local.
export async function ocrPdfToText(pdfBase64, { lang = 'spa', dpi = 200, maxPages = 20 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cg-ocr-'))
  try {
    const pdfPath = join(dir, 'in.pdf')
    await writeFile(pdfPath, Buffer.from(pdfBase64, 'base64'))

    // PDF -> PNG por página: out-1.png, out-2.png, ...
    await execFileP('pdftoppm', ['-png', '-r', String(dpi), pdfPath, join(dir, 'out')])

    const pngs = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort()
    let text = ''
    for (const png of pngs.slice(0, maxPages)) {
      const { stdout } = await execFileP(
        'tesseract', [join(dir, png), 'stdout', '-l', lang],
        { maxBuffer: 20 * 1024 * 1024 },
      )
      text += stdout + '\n'
    }
    return text
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
