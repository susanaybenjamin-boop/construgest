import 'dotenv/config'
import { createServer } from 'http'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { initRealtime } from './services/realtimeHub.js'
import { getVersionStatus, getCurrentVersion } from './services/version.js'

// Route imports
import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import budgetRoutes from './routes/budgets.js'
import certificationRoutes from './routes/certifications.js'
import expenseRoutes from './routes/expenses.js'
import materialRoutes from './routes/materials.js'
import planRoutes from './routes/plans.js'
import aiRoutes from './routes/ai.js'
import libraryRoutes from './routes/library.js'
import suppliersRoutes from './routes/suppliers.js'
import settingsRoutes from './routes/settings.js'
import workLogRoutes from './routes/workLogs.js'
import supplierMaterialRoutes from './routes/supplierMaterials.js'
import workersRoutes from './routes/workers.js'
import equipmentCatalogRoutes from './routes/equipmentCatalog.js'
import subcontractorsRoutes from './routes/subcontractors.js'
import adminRoutes from './routes/admin.js'
import branchRoutes from './routes/branches.js'
import mailboxRoutes from './routes/mailbox.js'
import notificationRoutes from './routes/notifications.js'
import filesRoutes from './routes/files.js'

const app = express()
const PORT = process.env.PORT || 5000

// CORS - manual implementation for Express 5 compatibility.
// App autohospedada en local: se permite cualquier localhost (el frontend Next
// corre en :3000) y, opcionalmente, un FRONTEND_URL configurado.
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else if (origin && origin.startsWith('http://localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Expose-Headers', 'X-Renewed-Token')
  res.setHeader('Access-Control-Max-Age', '86400')

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  next()
})
app.use(express.json({ limit: '50mb' }))

// Security headers (cross-origin policies relajadas: permitimos llamadas
// desde frontends en otros dominios — el control real lo hace CORS arriba).
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false,
}))

// En local no hay proxy inverso, pero dejamos trust proxy por si se despliega
// tras uno (nginx/traefik) para que el rate limiter use la IP real del cliente.
app.set('trust proxy', 1)

// Rate limit global: backstop anti-bucle-descontrolado. App LOCAL de un solo
// usuario → el límite es alto (una importación de presupuesto hace cientos de
// llamadas legítimas seguidas). Configurable con RATE_LIMIT.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT) || 6000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' },
})
app.use('/api/', globalLimiter)

// Rate limit más estricto para IA: cada llamada cuesta. 30 req/min/IP.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Has alcanzado el límite de peticiones a IA. Espera un minuto.' },
})

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'construgest-api' })
})
// `instance` lo pasa el lanzador de escritorio (INSTANCE_ID) para poder distinguir
// NUESTRO backend de otro proceso cualquiera que tenga tomado el puerto.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    pid: process.pid,
    instance: process.env.INSTANCE_ID || null,
    timestamp: new Date().toISOString(),
  })
})
// Versión actual + comprobación de actualizaciones (GitHub Releases). Público.
app.get('/api/version', async (req, res) => {
  try {
    // ?force=1 → se salta la caché de 1 h (botón "Comprobar" de Acerca de).
    const force = req.query.force === '1' || req.query.force === 'true'
    res.json(await getVersionStatus({ force }))
  } catch {
    res.json({ current: getCurrentVersion(), latest: null, updateAvailable: false, checkedRemote: false })
  }
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/budgets', budgetRoutes)
app.use('/api/certifications', certificationRoutes)
app.use('/api/expenses', expenseRoutes)
app.use('/api/materials', materialRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/ai', aiLimiter, aiRoutes)
app.use('/api/library', libraryRoutes)
app.use('/api/suppliers', suppliersRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/work-logs', workLogRoutes)
app.use('/api/supplier-materials', supplierMaterialRoutes)
app.use('/api/workers', workersRoutes)
app.use('/api/equipment-catalog', equipmentCatalogRoutes)
app.use('/api/subcontractors', subcontractorsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/branches', branchRoutes)
app.use('/api/mailbox', mailboxRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/files', filesRoutes)

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message)
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
  })
})

// http.Server explícito para poder montar el WebSocket (Realtime local) encima.
const server = createServer(app)

// Si el listen falla (puerto ocupado), hay que decirlo CLARO y salir. Antes no
// había manejador: el error salía por el 'error' del WebSocketServer (ws reemite
// los del http.Server) y el proceso moría con un volcado de Node ilegible,
// mientras el lanzador daba "backend listo" porque el OTRO proceso del puerto
// contestaba al health check. Resultado: login imposible y sin mensaje.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `FATAL: el puerto ${PORT} ya está ocupado por otro proceso, así que esta API no `
      + 'puede arrancar. Cierra lo que esté usando ese puerto (otra copia de ConstruGest, '
      + 'un backend de desarrollo, un servicio que arranque con Windows…).',
    )
  } else {
    console.error(`FATAL: el servidor no pudo arrancar (${err.code || 'error'}): ${err.message}`)
  }
  process.exit(1)
})

initRealtime(server)
server.listen(PORT, () => {
  console.log(`ConstruGest API running on port ${PORT}`)
})

export default app
