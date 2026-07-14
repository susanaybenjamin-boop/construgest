// ─────────────────────────────────────────────────────────────
// Cliente Realtime LOCAL (WebSocket propio) — sustituye al cliente
// de Supabase Realtime. Se conecta al hub del backend en `/ws`
// (ver backend/src/services/realtimeHub.js).
//
// Un ÚNICO socket compartido por toda la app. Los consumidores se
// suscriben a un `topic` y reciben (event, payload). El cliente:
//   · abre la conexión de forma perezosa en la 1ª suscripción,
//   · reconecta con backoff si se cae,
//   · re-suscribe todos los topics activos al (re)conectar,
//   · manda un ping periódico para mantener viva la conexión.
//
// Protocolo (JSON por mensaje), idéntico al del hub:
//   cliente → servidor: { type:'subscribe'|'unsubscribe', topics:[...] } · { type:'ping' }
//   servidor → cliente: { type:'ready' } · { type:'pong' } · { topic, event, payload }
//
// Topics (mismos que antes, contrato con el backend):
//   budget:{budgetId}        · org:{orgId}:projects
//   org:{orgId}:branches     · user:{userId}
// ─────────────────────────────────────────────────────────────
import { getToken } from './tokenStorage'

type Listener = (event: string, payload: unknown) => void

// topic → set de listeners
const listeners = new Map<string, Set<Listener>>()

let ws: WebSocket | null = null
let ready = false
let manualClose = false
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null

/** Deriva la URL del WS a partir de la de la API (mismo host). */
function wsUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
  const base = apiUrl.replace(/\/api\/?$/, '')     // http://localhost:5000
  const wsBase = base.replace(/^http/, 'ws')       // ws://localhost:5000  (http→ws, https→wss)
  const token = getToken() || ''
  return `${wsBase}/ws?token=${encodeURIComponent(token)}`
}

function send(obj: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)) } catch { /* best-effort */ }
  }
}

/** Suscribe en el servidor a los topics que tengan al menos un listener. */
function flushSubscriptions() {
  const topics = [...listeners.keys()]
  if (topics.length > 0) send({ type: 'subscribe', topics })
}

function connect() {
  if (typeof window === 'undefined') return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  if (!getToken()) return // sin sesión no hay a qué suscribirse

  manualClose = false
  ready = false
  ws = new WebSocket(wsUrl())

  ws.onopen = () => {
    reconnectAttempts = 0
    // heartbeat: ping cada 25 s (el server descarta muertos a los 30 s)
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => send({ type: 'ping' }), 25000)
  }

  ws.onmessage = (ev) => {
    let msg: { type?: string; topic?: string; event?: string; payload?: unknown }
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
    if (msg.type === 'ready') {
      ready = true
      flushSubscriptions()
      return
    }
    if (msg.type === 'pong') return
    if (msg.topic && msg.event) {
      const subs = listeners.get(msg.topic)
      if (subs) for (const fn of subs) {
        try { fn(msg.event, msg.payload) } catch { /* aislar fallos de un listener */ }
      }
    }
  }

  ws.onclose = () => {
    ready = false
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
    ws = null
    if (manualClose) return
    if (listeners.size === 0) return // nadie escuchando → no reconectar
    // backoff exponencial con techo (1s, 2s, 4s… máx 15s)
    reconnectAttempts += 1
    const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 15000)
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, delay)
  }

  ws.onerror = () => {
    try { ws?.close() } catch { /* onclose se encargará de reconectar */ }
  }
}

/**
 * Suscribe un listener a un topic. Devuelve la función para desuscribir.
 * Abre la conexión si aún no está abierta.
 */
export function subscribeTopic(topic: string, listener: Listener): () => void {
  let set = listeners.get(topic)
  const isNewTopic = !set
  if (!set) { set = new Set(); listeners.set(topic, set) }
  set.add(listener)

  if (!ws) {
    connect()
  } else if (ready && isNewTopic) {
    // conexión ya viva y es un topic nuevo → suscribir solo ese
    send({ type: 'subscribe', topics: [topic] })
  }

  return () => unsubscribeTopic(topic, listener)
}

/** Quita un listener de un topic; si queda vacío, desuscribe en el servidor. */
export function unsubscribeTopic(topic: string, listener: Listener) {
  const set = listeners.get(topic)
  if (!set) return
  set.delete(listener)
  if (set.size === 0) {
    listeners.delete(topic)
    if (ready) send({ type: 'unsubscribe', topics: [topic] })
  }
}

/** Cierra la conexión y limpia todo (usar al hacer logout). */
export function closeRealtime() {
  manualClose = true
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  listeners.clear()
  ready = false
  if (ws) { try { ws.close() } catch { /* ignore */ } ws = null }
}
