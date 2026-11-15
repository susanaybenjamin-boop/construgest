import React from 'react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(2)}%`
}

/**
 * Parse a number from locale string (handles Spanish comma-decimal and numpad comma).
 * "1,5" → 1.5 | "1.234,56" → 1234.56 | "3.5" → 3.5 | "" → 0
 */
/**
 * onKeyDown handler for numeric inputs: converts numpad comma to period.
 * Use on any <input type="number"> to accept the comma key as decimal separator.
 */
export function handleDecimalKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === ',') {
    e.preventDefault()
    document.execCommand('insertText', false, '.')
    return
  }
  // Enter confirma el valor: blur dispara el onBlur del input que hace
  // la persistencia. Evita tener que hacer click fuera.
  if (e.key === 'Enter') {
    e.preventDefault()
    ;(e.currentTarget as HTMLInputElement).blur()
  }
}

export function parseLocaleNumber(value: string | number): number {
  if (typeof value === 'number') return value
  const str = String(value).trim()
  if (!str) return 0
  if (str.includes(',')) {
    // Spanish format: dots are thousands separators, comma is decimal
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(str) || 0
}

// ─── Importe en letra ───────────────────────────────────────────────────
// Lo usan el total del presupuesto, las certificaciones y el CUADRO DE PRECIOS
// Nº 1, donde el importe en letra es la cifra que manda si no cuadra con la
// cifra en números. Antes estaba DUPLICADO en los dos servicios de PDF, con el
// mismo fallo en los dos.
//
// Trampas del español que la versión anterior se comía:
//   - Del 21 al 29 va en UNA palabra: VEINTITRÉS, no "VEINTE Y TRES".
//   - El singular es EURO y CÉNTIMO: 1 € es "UN EURO", no "UN EUROS".
//   - Un importe redondo de millones lleva "DE": "DOS MILLONES DE EUROS",
//     pero "DOS MILLONES QUINIENTOS MIL EUROS" (sin "de") si hay resto.

const LETRAS_UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const LETRAS_DIECI = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const LETRAS_VEINTI = ['VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
const LETRAS_DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const LETRAS_CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

/** Convierte un grupo de 0 a 999 a letra. */
function grupoALetra(num: number): string {
  if (num === 0) return ''
  if (num === 100) return 'CIEN'
  let resultado = ''
  let r = num
  if (r >= 100) {
    resultado += LETRAS_CENTENAS[Math.floor(r / 100)] + ' '
    r %= 100
  }
  if (r >= 20 && r < 30) {
    resultado += LETRAS_VEINTI[r - 20]
  } else if (r >= 30) {
    resultado += LETRAS_DECENAS[Math.floor(r / 10)]
    if (r % 10 !== 0) resultado += ' Y ' + LETRAS_UNIDADES[r % 10]
  } else if (r >= 10) {
    resultado += LETRAS_DIECI[r - 10]
  } else if (r > 0) {
    resultado += LETRAS_UNIDADES[r]
  }
  return resultado.trim()
}

/**
 * Importe en letra y en mayúsculas, con sus euros y sus céntimos.
 * Ej.: 23,15 -> "VEINTITRÉS EUROS CON QUINCE CÉNTIMOS"
 */
export function amountToWords(n: number): string {
  const valor = Math.abs(Number(n) || 0)
  const entero = Math.floor(valor)
  const centimos = Math.round((valor - entero) * 100)

  let texto = ''
  if (entero >= 1000000) {
    const millones = Math.floor(entero / 1000000)
    texto += (millones === 1 ? 'UN MILLÓN' : grupoALetra(millones) + ' MILLONES') + ' '
  }
  const resto = entero % 1000000
  if (resto >= 1000) {
    const miles = Math.floor(resto / 1000)
    texto += (miles === 1 ? 'MIL' : grupoALetra(miles) + ' MIL') + ' '
  }
  const ultimos = resto % 1000
  if (ultimos > 0) texto += grupoALetra(ultimos)

  texto = texto.trim() || 'CERO'

  // "DOS MILLONES DE EUROS", pero "DOS MILLONES QUINIENTOS MIL EUROS"
  const millonesRedondos = entero >= 1000000 && resto === 0
  texto += millonesRedondos ? ' DE EUROS' : entero === 1 ? ' EURO' : ' EUROS'

  if (centimos > 0) {
    texto += ' CON ' + grupoALetra(centimos) + (centimos === 1 ? ' CÉNTIMO' : ' CÉNTIMOS')
  }

  return (Number(n) || 0) < 0 ? 'MENOS ' + texto : texto
}
