'use client'

import { useState, forwardRef } from 'react'

interface DecimalInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number
  onChange: (value: number) => void
}

/**
 * Numeric input that supports comma from numpad as decimal separator.
 * - Enter: confirma el valor (dispara blur → onChange).
 * - Escape: descarta lo escrito y restaura el valor previo.
 * - Auto-selects content on focus. Handles trailing period while typing.
 */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onChange, onFocus, onBlur, onKeyDown, ...props }, ref) => {
    const [focused, setFocused] = useState(false)
    const [raw, setRaw] = useState('')

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={focused ? raw : (value != null ? String(value) : '')}
        onFocus={(e) => {
          setFocused(true)
          setRaw(value != null ? String(value) : '')
          setTimeout(() => e.target.select(), 0)
          onFocus?.(e)
        }}
        onChange={(e) => {
          const v = e.target.value.replace(',', '.')
          if (v === '' || v === '.' || /^\d*\.?\d*$/.test(v)) {
            setRaw(v)
            const n = parseFloat(v)
            if (!isNaN(n)) onChange(n)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            // Cancelar cambios: restaurar al valor original y salir del foco.
            e.preventDefault()
            setRaw(value != null ? String(value) : '')
            ;(e.currentTarget as HTMLInputElement).blur()
          }
          onKeyDown?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          const n = parseFloat(raw.replace(',', '.'))
          onChange(isNaN(n) ? 0 : n)
          onBlur?.(e)
        }}
        {...props}
      />
    )
  }
)

DecimalInput.displayName = 'DecimalInput'
