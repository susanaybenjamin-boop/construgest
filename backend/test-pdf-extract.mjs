/**
 * PDF Text Extraction Script
 * Uses pdfjs-dist with position-aware extraction, shadow text deduplication,
 * intelligent spacing based on gap analysis.
 */

import { readFileSync, writeFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// -- Configuration --
const LINE_TOLERANCE = 3;
const DEDUP_X_TOLERANCE = 3;
const TAB_GAP = 15;
const WORD_GAP = 2;

const PDF_PATH = 'C:/Users/benja/Desktop/OBRAS/Vivienda Ogijares_ajustada_Presupuesto y mediciones.pdf';
const OUTPUT_PATH = 'C:/Users/benja/Desktop/construgest-web/backend/test-pdf-output.txt';

// -- Helpers --

function deduplicateItems(items) {
  const kept = [];
  for (const item of items) {
    const isDup = kept.some(
      (k) =>
        Math.abs(k.y - item.y) < LINE_TOLERANCE &&
        Math.abs(k.x - item.x) < DEDUP_X_TOLERANCE &&
        k.str === item.str
    );
    if (!isDup) {
      kept.push(item);
    }
  }
  return kept;
}

function buildLinesFromItems(items) {
  if (items.length === 0) return [];

  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  let currentLine = [items[0]];
  let currentY = items[0].y;

  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    if (Math.abs(item.y - currentY) <= LINE_TOLERANCE) {
      currentLine.push(item);
    } else {
      lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  lines.push(currentLine);

  const textLines = [];
  for (const lineItems of lines) {
    lineItems.sort((a, b) => a.x - b.x);

    let lineText = '';
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (i === 0) {
        lineText += item.str;
      } else {
        const prev = lineItems[i - 1];
        const prevEnd = prev.x + prev.width;
        const gap = item.x - prevEnd;

        if (gap > TAB_GAP) {
          lineText += '    ' + item.str;
        } else if (gap > WORD_GAP) {
          lineText += ' ' + item.str;
        } else {
          lineText += item.str;
        }
      }
    }
    textLines.push(lineText);
  }

  return textLines;
}

// -- Main --

async function main() {
  console.log('Loading PDF: ' + PDF_PATH);

  const data = new Uint8Array(readFileSync(PDF_PATH));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  const totalPages = doc.numPages;
  console.log('PDF loaded - ' + totalPages + ' pages\n');

  const allLines = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items = textContent.items
      .filter((it) => it.str && it.str.trim().length > 0)
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        width: it.width,
      }));

    const unique = deduplicateItems(items);
    const pageLines = buildLinesFromItems(unique);

    allLines.push('--- PAGE ' + pageNum + ' ---');
    allLines.push(...pageLines);
    allLines.push('');

    if (pageNum % 10 === 0 || pageNum === totalPages) {
      process.stdout.write('  Processed ' + pageNum + '/' + totalPages + ' pages\r');
    }
  }

  console.log('\n');

  const fullText = allLines.join('\n');
  writeFileSync(OUTPUT_PATH, fullText, 'utf-8');
  console.log('Full text saved to: ' + OUTPUT_PATH);

  const preview = allLines.slice(0, 200);
  console.log('\n================================================================');
  console.log('  FIRST 200 LINES');
  console.log('================================================================\n');
  for (const line of preview) {
    console.log(line);
  }
  console.log('\n================================================================');

  console.log('\nTotal pages:  ' + totalPages);
  console.log('Total lines:  ' + allLines.length);
  console.log('Output file:  ' + OUTPUT_PATH);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
