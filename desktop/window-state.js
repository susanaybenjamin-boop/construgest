// ============================================================================
// MULTIMON — Recuerda en qué pantalla y posición se cerró la ventana principal
// y la reabre AHÍ si esa pantalla sigue conectada; si no hay dato o esa
// pantalla ya no existe, el caller cae al comportamiento por defecto
// (centrada en la principal). Comportamiento portado de Benjagest
// (`WindowGeometry`), con las mismas lecciones aprendidas:
//
//  - Criterio LENIENTE al restaurar (como VS Code/WhatsApp): solo se descarta
//    lo guardado si el rectángulo no toca NINGUNA pantalla conectada (monitor
//    desenchufado). No se "corrige" la posición: se aplica tal cual.
//  - Se guarda la posición ACTUAL (getBounds), que identifica el monitor
//    INCLUSO maximizada, pero el tamaño "restaurado" (getNormalBounds) para
//    que al des-maximizar no quede a pantalla completa.
//  - Guardado con debounce en move/resize: un cierre forzado o un crash
//    tampoco pierden la posición.
//
// Persistencia en userData/window-state.json. Todo best-effort: si algo
// falla, no rompe ni el arranque ni el cierre.
// ============================================================================
const { app, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const FILE = () => path.join(app.getPath('userData'), 'window-state.json')

/** ¿El rectángulo guardado toca alguna pantalla conectada? (bounds directos). */
function intersectsAnyDisplay(r) {
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds
    return r.x < b.x + b.width && r.x + r.w > b.x
      && r.y < b.y + b.height && r.y + r.h > b.y
  })
}

/**
 * Lee el estado guardado. Devuelve `{x, y, w, h, maximized}` si hay dato
 * válido y cae en una pantalla conectada; `null` si no (el caller centra en
 * la principal con el tamaño por defecto).
 */
function restore() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE(), 'utf-8'))
    if (![s.x, s.y, s.w, s.h].every(Number.isFinite) || s.w <= 0 || s.h <= 0) return null
    if (!intersectsAnyDisplay(s)) return null
    return {
      x: Math.round(s.x),
      y: Math.round(s.y),
      w: Math.round(s.w),
      h: Math.round(s.h),
      maximized: !!s.maximized,
    }
  } catch {
    return null // sin fichero o corrupto → defaults
  }
}

/** Guarda el estado actual de la ventana. Best-effort. */
function saveNow(win) {
  try {
    // Minimizada no se guarda: en Windows la posición apunta fuera de
    // pantalla (-32000) y pisaría el último estado bueno del debounce.
    if (!win || win.isDestroyed() || win.isMinimized()) return
    const b = win.getBounds()       // posición ACTUAL → identifica el monitor
    const n = win.getNormalBounds() // tamaño restaurado (no el maximizado)
    fs.writeFileSync(FILE(), JSON.stringify({
      x: b.x, y: b.y, w: n.width, h: n.height, maximized: win.isMaximized(),
    }))
  } catch { /* best-effort */ }
}

/** Engancha el guardado con debounce a los movimientos/redimensionados. */
function track(win) {
  let timer = null
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(() => saveNow(win), 500)
  }
  win.on('move', later)
  win.on('resize', later)
  win.on('maximize', later)
  win.on('unmaximize', later)
  win.on('closed', () => clearTimeout(timer))
}

module.exports = { restore, saveNow, track }
