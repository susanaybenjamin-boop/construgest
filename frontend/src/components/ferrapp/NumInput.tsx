"use client";

import { InputHTMLAttributes, useEffect, useRef, useState } from "react";

/**
 * Input numerico que acepta tanto coma como punto como separador decimal.
 * Usa type="text" + inputMode="decimal" en lugar de type="number"
 * para compatibilidad con teclados españoles (numpad produce ",").
 *
 * Mantiene estado local mientras el usuario edita para permitir
 * valores intermedios como "12." sin que React los borre.
 */
interface NumInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  value: number | string;
  onChange: (valor: number) => void;
  decimals?: boolean; // true = permite decimales (default), false = solo enteros
}

export default function NumInput({ value, onChange, decimals = true, className, ...rest }: NumInputProps) {
  const [display, setDisplay] = useState(String(value));
  const editing = useRef(false);

  // Sincronizar desde prop solo cuando NO estamos editando
  useEffect(() => {
    if (!editing.current) {
      setDisplay(String(value));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      value={display}
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={() => {
        editing.current = false;
        // Limpiar y formatear al salir del input
        const raw = display.replace(",", ".");
        const num = decimals ? parseFloat(raw) : parseInt(raw);
        if (!isNaN(num) && num >= 0) {
          onChange(num);
          setDisplay(String(num));
        } else {
          // Restaurar valor anterior si no es valido
          setDisplay(String(value));
        }
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        setDisplay(raw);
        // Enviar valor al padre si es un numero valido
        const num = decimals ? parseFloat(raw) : parseInt(raw);
        if (!isNaN(num)) onChange(num);
      }}
      onKeyDown={(e) => {
        // Convertir coma a punto al teclear
        if (e.key === ",") {
          e.preventDefault();
          document.execCommand("insertText", false, ".");
        }
        // Bloquear caracteres no numericos
        const permitidas = [
          "Backspace", "Delete", "Tab",
          "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
          "Home", "End", ".", ",", "-",
        ];
        if (
          !permitidas.includes(e.key) &&
          !/^\d$/.test(e.key) &&
          !e.ctrlKey && !e.metaKey
        ) {
          e.preventDefault();
        }
      }}
      className={className}
      {...rest}
    />
  );
}
