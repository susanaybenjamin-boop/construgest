/**
 * Test del parser v6.0 con el texto real del PDF de Ogijares
 */
import { readFileSync } from 'fs'
import { cleanPdfText, parseBudgetAlgorithmic } from './src/services/budget-parser.js'

const rawText = readFileSync('./test-pdf-output.txt', 'utf-8')

console.log('=== TEST PARSER v6.0 ===\n')
console.log(`Texto original: ${rawText.split('\n').filter(l => l.trim()).length} líneas\n`)

// Paso 1: Limpiar
const { text: cleanedText, logs: cleanLogs } = cleanPdfText(rawText)
console.log('--- LIMPIEZA ---')
cleanLogs.forEach(l => console.log(l))
console.log(`Texto limpio: ${cleanedText.split('\n').filter(l => l.trim()).length} líneas\n`)

// Paso 2: Parser algorítmico
console.log('--- PARSER ---')
const result = parseBudgetAlgorithmic(cleanedText)
result.logs.forEach(l => console.log(l))

// Mostrar resultados
console.log('\n--- RESULTADO ---')
let totalItems = 0
let totalAmount = 0
for (const ch of result.chapters) {
  const chAmount = ch.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  totalAmount += chAmount
  console.log(`\nCAPÍTULO ${ch.code}: ${ch.name} (${ch.items.length} partidas, ${chAmount.toFixed(2)}€)`)
  for (const item of ch.items) {
    const amount = (item.quantity * item.unit_price).toFixed(2)
    console.log(`  ${item.code.padEnd(16)} ${item.unit.padEnd(4)} ${item.quantity.toString().padStart(8)} × ${item.unit_price.toString().padStart(10)} = ${amount.padStart(10)}€  ${item.name.substring(0, 50)}`)
    totalItems++
  }
}

console.log(`\n=== RESUMEN ===`)
console.log(`Total capítulos: ${result.chapters.length}`)
console.log(`Total partidas: ${totalItems}`)
console.log(`Importe total: ${totalAmount.toFixed(2)}€`)

// Comparar con el total esperado del PDF (96.337,89€)
console.log(`\nTotal esperado del PDF: 96.337,89€`)
console.log(`Diferencia: ${(totalAmount - 96337.89).toFixed(2)}€`)
console.log(`Cobertura: ${((totalAmount / 96337.89) * 100).toFixed(1)}%`)
