// ─────────────────────────────────────────────────────────────
// Almacenamiento del token JWT por PESTAÑA (sessionStorage),
// no por origen. Permite tener varias cuentas abiertas en
// pestañas distintas del mismo navegador.
//
// Comportamiento:
// - Token vive en sessionStorage → cada pestaña su propia sesión.
// - Migración silenciosa: si una versión vieja de la app dejó el
//   token en localStorage, se copia a sessionStorage la primera
//   vez y se borra del localStorage. Así un usuario logado no se
//   desloguea al desplegar este cambio, y futuras pestañas
//   arrancan limpias (login obligatorio en cada una).
// - Una pestaña nunca "hereda" automáticamente la sesión de otra
//   ni de la sesión persistida — es lo que evita el bug de
//   "abrir otra cuenta abre la misma".
// ─────────────────────────────────────────────────────────────

const KEY = 'token'
let migrated = false

function migrateOnce() {
  if (migrated || typeof window === 'undefined') return
  migrated = true
  try {
    const sessionTok = window.sessionStorage.getItem(KEY)
    const localTok = window.localStorage.getItem(KEY)
    if (!sessionTok && localTok) {
      window.sessionStorage.setItem(KEY, localTok)
    }
    // Limpiar localStorage en cualquier caso para que no se "filtre"
    // a pestañas nuevas.
    if (localTok) window.localStorage.removeItem(KEY)
  } catch { /* navegadores bloqueando storage: ignorar */ }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  migrateOnce()
  try {
    return window.sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  migrateOnce()
  try {
    window.sessionStorage.setItem(KEY, token)
  } catch { /* ignore */ }
}

export function clearToken(): void {
  if (typeof window === 'undefined') return
  migrateOnce()
  try {
    window.sessionStorage.removeItem(KEY)
    // Defensa: borrar también del localStorage por si quedó algún
    // residuo de la versión anterior.
    window.localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}
