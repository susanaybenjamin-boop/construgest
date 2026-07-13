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
