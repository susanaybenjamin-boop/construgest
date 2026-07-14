// ════════════════════════════════════════════════════════════════════
// Hub de Realtime LOCAL (WebSocket propio) — sustituye a Supabase Realtime.
//
// Un único servidor WS montado sobre el mismo http.Server de Express (ruta /ws).
// El cliente se conecta con su JWT (?token=...), se suscribe a topics y recibe
// los eventos que el backend publica en cada mutación. Autocontenido: sin nube.
//
// Protocolo (JSON por mensaje):
//   cliente → servidor: { type:'subscribe'|'unsubscribe', topics:[...] } · { type:'ping' }
//   servidor → cliente: { type:'ready' } al conectar · { type:'pong' } ·
//                       { topic, event, payload } en cada publicación
//
// Topics (mismos que antes, para no romper el contrato del frontend):
//   budget:{budgetId}        → cambios en un presupuesto (payload: {kind, ts})
//   org:{orgId}:projects     → cambios en proyectos de una org
//   org:{orgId}:branches     → invitaciones / vínculos de sucursal
//   user:{userId}            → notificaciones (payload: la notificación)
// ════════════════════════════════════════════════════════════════════
import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

// topic → Set<ws>
const topics = new Map()

function addSub(ws, topic) {
  if (!topics.has(topic)) topics.set(topic, new Set())
  topics.get(topic).add(ws)
  ws._topics.add(topic)
}
function removeSub(ws, topic) {
  topics.get(topic)?.delete(ws)
  ws._topics.delete(topic)
}
function dropClient(ws) {
  for (const t of ws._topics || []) topics.get(t)?.delete(ws)
  ws._topics?.clear()
}

// Seguridad: un cliente solo se suscribe a lo suyo. `user:{id}` lleva datos
// (la notificación) → estricto al propio usuario. `org:{id}:*` → su propia org.
// `budget:{id}` solo lleva un ping "cambió" (sin datos) → se permite.
function canSubscribe(user, topic) {
  if (topic.startsWith('user:')) return topic === `user:${user.id}`
  if (topic.startsWith('org:')) return topic.startsWith(`org:${user.organization_id}:`)
  if (topic.startsWith('budget:')) return true
  return false
}

/** Publica un evento a todos los clientes suscritos a `topic`. Best-effort. */
export function publish(topic, event, payload) {
  const subs = topics.get(topic)
  if (!subs || subs.size === 0) return
  const msg = JSON.stringify({ topic, event, payload: payload || {} })
  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(msg) } catch { /* best-effort */ }
    }
  }
}

/** Monta el servidor WebSocket sobre el http.Server de Express. */
export function initRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
    // Auth por JWT en el query string (?token=...). Sin token válido → cerrar.
    let user
    try {
      const url = new URL(req.url, 'http://localhost')
      user = jwt.verify(url.searchParams.get('token') || '', JWT_SECRET)
    } catch {
      ws.close(4001, 'unauthorized')
      return
    }
    ws._user = { id: user.id, organization_id: user.organization_id }
    ws._topics = new Set()
    ws._alive = true
    ws.on('pong', () => { ws._alive = true })

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg.type === 'subscribe' && Array.isArray(msg.topics)) {
        for (const t of msg.topics) if (typeof t === 'string' && canSubscribe(ws._user, t)) addSub(ws, t)
      } else if (msg.type === 'unsubscribe' && Array.isArray(msg.topics)) {
        for (const t of msg.topics) if (typeof t === 'string') removeSub(ws, t)
      } else if (msg.type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong' })) } catch { /* ignore */ }
      }
    })

    ws.on('close', () => dropClient(ws))
    ws.on('error', () => dropClient(ws))

    try { ws.send(JSON.stringify({ type: 'ready' })) } catch { /* ignore */ }
  })

  // Heartbeat: descarta conexiones muertas (cada 30 s).
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws._alive === false) { dropClient(ws); ws.terminate(); continue }
      ws._alive = false
      try { ws.ping() } catch { /* ignore */ }
    }
  }, 30000)
  wss.on('close', () => clearInterval(interval))

  console.log('[realtime] WebSocket hub montado en /ws')
  return wss
}

export default { initRealtime, publish }
