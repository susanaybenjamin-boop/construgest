// ============================================================================
// Shell de escritorio de Construgest (Electron).
//
// Arranca los servicios LOCALES como procesos hijo y muestra la app en una
// ventana propia (sin barra de navegador). Autocontenido, sin Docker:
//
//   [MariaDB] ─ [backend Node :5000] ─ [frontend Next standalone :3000] ─ [Ollama]
//
// MariaDB y Ollama son OPCIONALES: si su binario está bundleado en `runtime/`
// los arranca (e inicializa la BD/descarga el modelo la 1ª vez); si no, asume
// que corren fuera (útil en desarrollo con la MariaDB de Docker y el Ollama del
// host). Backend y frontend se ejecutan con el propio Node de Electron
// (ELECTRON_RUN_AS_NODE) → no hace falta bundlear Node aparte.
// ============================================================================
const { app, BrowserWindow, dialog, shell, ipcMain, safeStorage, screen } = require('electron')
const { spawn } = require('child_process')
const crypto = require('crypto')
const http = require('http')
const https = require('https')
const net = require('net')
const path = require('path')
const fs = require('fs')
const windowState = require('./window-state')

const PORTS = { mariadb: 3308, backend: 5000, frontend: 3000, ollama: 11434 }
const DB = { name: 'construgest', user: 'construgest', password: 'construgest' }
const OLLAMA_MODEL = 'qwen2.5:3b'
// Id único de ESTE arranque: se le pasa al backend y /api/health lo devuelve, para
// comprobar que quien contesta en el puerto 5000 es nuestro hijo y no un extraño.
const INSTANCE_ID = crypto.randomUUID()
const children = []
let win = null
let updating = false   // true mientras se descarga la actualización (bloquea el cierre)

// ── Rutas: en dev la raíz del repo es ../ ; empaquetado, process.resourcesPath ──
const RES = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
const mariaBin = path.join(RES, 'runtime', 'mariadb', 'bin')
const paths = {
  backendEntry: path.join(RES, 'backend', 'src', 'app.js'),
  frontendEntry: path.join(RES, 'frontend', 'server.js'),
  schemaDir: path.join(RES, 'database', 'init'),
  mysqld: path.join(mariaBin, 'mysqld.exe'),
  ollama: path.join(RES, 'runtime', 'ollama', 'ollama.exe'),
  dataDir: path.join(app.getPath('userData'), 'data'),
  storageDir: path.join(app.getPath('userData'), 'storage'),
}

// Log a fichero (userData/logs/construgest.log) para diagnosticar la app
// empaquetada: sin esto, el stdout/stderr de los procesos hijo no se ve.
let logStream = null
try {
  const logDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  logStream = fs.createWriteStream(path.join(logDir, 'construgest.log'), { flags: 'a' })
} catch { /* sin log a fichero */ }
function writeLog(s) { if (logStream) { try { logStream.write(s) } catch { /* ignore */ } } }
function log(...a) { const line = '[construgest] ' + a.join(' '); console.log(line); writeLog(line + '\n') }
function firstExisting(candidates) { return candidates.find((p) => fs.existsSync(p)) || null }

// Nombres de binario varían por versión de MariaDB en Windows.
const installDbBin = firstExisting([
  path.join(mariaBin, 'mariadb-install-db.exe'),
  path.join(mariaBin, 'mysql_install_db.exe'),
])
const clientBin = firstExisting([
  path.join(mariaBin, 'mariadb.exe'),
  path.join(mariaBin, 'mysql.exe'),
])

// ── Helpers de procesos / espera ────────────────────────────────────────────

/**
 * Espera a que una URL HTTP responda.
 *
 * OJO (bug de login del 2026-11-07): esto NO puede conformarse con "algo
 * contesta en el puerto". Si un proceso AJENO tiene el puerto (un backend viejo,
 * otra copia de la app, un proyecto de desarrollo), nuestro hijo muere con
 * EADDRINUSE y el ajeno contesta igual → dábamos "backend listo" y la app
 * trabajaba contra el backend equivocado (login imposible y sin mensaje).
 * Por eso:
 *   - `child`          → si el hijo ha muerto, se falla al instante.
 *   - `expectInstance` → el health check debe devolver NUESTRO id de instancia.
 */
function waitForHttp(url, { timeoutMs = 60000, intervalMs = 500, child = null, expectInstance = null } = {}) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const retry = (err) => {
      if (Date.now() - start > timeoutMs) reject(err)
      else setTimeout(tick, intervalMs)
    }
    const tick = () => {
      if (child && child.exited) {
        return reject(new Error(`el proceso de ${child.tag} murió al arrancar (código ${child.exitInfo})`))
      }
      const req = http.get(url, (res) => {
        if (!expectInstance) { res.resume(); return resolve(true) }
        let body = ''
        res.on('data', (d) => { body += d })
        res.on('end', () => {
          if (res.statusCode !== 200) return retry(new Error(`${url} responde HTTP ${res.statusCode}`))
          let instance = null
          try { instance = JSON.parse(body).instance } catch { /* respuesta no JSON */ }
          if (instance !== expectInstance) {
            // No reintentamos: quien contesta no es nuestro proceso y no va a cambiar.
            return reject(new Error(
              `el puerto de ${url.replace(/\/api\/.*$/, '')} lo tiene OTRO programa `
              + '(no es el backend de esta app). Ciérralo y vuelve a abrir ConstruGest.',
            ))
          }
          resolve(true)
        })
      })
      req.on('error', () => retry(new Error(`timeout esperando ${url}`)))
      req.setTimeout(2000, () => req.destroy())
    }
    tick()
  })
}

/** Espera a que un puerto TCP acepte conexión (MariaDB lista). */
function waitForTcp(port, { timeoutMs = 30000, intervalMs = 500 } = {}) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(port, '127.0.0.1')
      s.on('connect', () => { s.destroy(); resolve(true) })
      s.on('error', () => {
        s.destroy()
        if (Date.now() - start > timeoutMs) reject(new Error(`timeout esperando TCP ${port}`))
        else setTimeout(tick, intervalMs)
      })
    }
    tick()
  })
}

/** Espera a que un puerto TCP quede LIBRE (nadie escuchando). */
function waitForPortFree(port, { timeoutMs = 8000, intervalMs = 300 } = {}) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(port, '127.0.0.1')
      s.on('connect', () => {
        s.destroy()
        if (Date.now() - start > timeoutMs) reject(new Error(`el puerto ${port} sigue ocupado`))
        else setTimeout(tick, intervalMs)
      })
      s.on('error', () => { s.destroy(); resolve(true) })
    }
    tick()
  })
}

/** ¿Hay algo escuchando ya en este puerto? */
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => { s.destroy(); resolve(true) })
    s.on('error', () => { s.destroy(); resolve(false) })
    s.setTimeout(1500, () => { s.destroy(); resolve(false) })
  })
}

/**
 * Windows: mata el árbol de procesos que ESCUCHA en un puerto. Sirve para limpiar
 * huérfanos de una sesión anterior (backend/MariaDB/frontend que quedaron agarrando
 * el puerto tras un cierre forzado, una suspensión o un crash: sin esto, el arranque
 * siguiente choca con EADDRINUSE y la app parece "sin BD/sin backend").
 */
/**
 * Windows: PIDs que escuchan en un puerto, preguntándoselo a PowerShell. Es la
 * red de seguridad de `netstat`: el 2026-11-07 el lanzador NO consiguió
 * identificar al proceso que tenía el 5000 (el log dice "sigue ocupado" sin
 * ningún PID), así que hay una segunda vía para no quedarse a ciegas.
 */
function listenerPidsPowerShell(port) {
  return new Promise((resolve) => {
    let out = ''
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue `
      + "| Where-Object { $_.State -eq 'Listen' -or $_.State -eq 'Bound' } "
      + '| Select-Object -ExpandProperty OwningProcess',
    ], { stdio: ['ignore', 'pipe', 'ignore'] })
    ps.stdout.on('data', (d) => { out += d })
    ps.on('error', () => resolve([]))
    ps.on('close', () => {
      const pids = out.split(/\s+/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s) && s !== '0')
      resolve([...new Set(pids)])
    })
  })
}

/** Mata un conjunto de PIDs con taskkill /T /F. */
function taskkillAll(port, pids) {
  return new Promise((resolve) => {
    if (!pids.length) return resolve(false)
    let pending = pids.length
    for (const pid of pids) {
      log(`Puerto ${port} ocupado por un proceso huérfano (PID ${pid}) → terminándolo`)
      const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
      const done = () => { if (--pending === 0) resolve(true) }
      tk.on('error', done)
      tk.on('close', done)
    }
  })
}

function netstatListenerPids(port) {
  return new Promise((resolve) => {
    let out = ''
    // SIN `-p tcp`: ese filtro lista SOLO IPv4 y se perdía la fila `[::]` de un
    // listener IPv6. `netstat -ano` saca ambas; las líneas UDP no traen LISTENING.
    const ns = spawn('netstat', ['-ano'], { stdio: ['ignore', 'pipe', 'ignore'] })
    ns.stdout.on('data', (d) => { out += d })
    ns.on('error', () => resolve([]))
    ns.on('close', () => {
      const pids = new Set()
      for (const line of out.split('\n')) {
        // "  TCP    127.0.0.1:5000   0.0.0.0:0   LISTENING   21188"
        // "  TCP    [::]:5000        [::]:0      LISTENING   7856"
        const m = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i)
        if (m && Number(m[1]) === port && m[2] !== '0') pids.add(m[2])
      }
      resolve([...pids])
    })
  })
}

async function killPortWindows(port) {
  let pids = await netstatListenerPids(port)
  if (!pids.length) {
    // El 2026-11-07 netstat no dio NINGÚN PID para el 5000 aunque un backend
    // viejo lo tenía tomado (el log: "sigue ocupado", sin línea de huérfano).
    // Segunda vía antes de rendirse.
    pids = await listenerPidsPowerShell(port)
    if (pids.length) log(`Puerto ${port}: netstat no dio PID; PowerShell sí (${pids.join(', ')})`)
  }
  if (!pids.length) {
    log(`Puerto ${port} ocupado pero NO se ha podido identificar el proceso`)
    return false
  }
  return taskkillAll(port, pids)
}

/**
 * Libera los puertos PROPIOS de la app si un huérfano los tiene tomados. Solo en la
 * app empaquetada de Windows: en dev, MariaDB/Ollama corren fuera (Docker/host) y NO
 * se deben tocar. No incluye Ollama (:11434): se reutiliza el del host.
 */
async function freeOwnedPorts() {
  if (!app.isPackaged || process.platform !== 'win32') return
  for (const port of [PORTS.mariadb, PORTS.backend, PORTS.frontend]) {
    if (!(await portInUse(port))) continue
    await killPortWindows(port)
    try {
      await waitForPortFree(port)
    } catch {
      // ANTES: solo se escribía en el log y se seguía arrancando, así que la app
      // acababa hablando con el programa ajeno que tenía el puerto. Ahora se
      // para con un aviso que dice QUÉ pasa y QUÉ hacer.
      log(`el puerto ${port} sigue ocupado → se aborta el arranque`)
      throw new Error(
        `El puerto ${port} está ocupado por otro programa y no se ha podido liberar.\n\n`
        + `ConstruGest necesita los puertos ${PORTS.mariadb} (base de datos), `
        + `${PORTS.backend} (API) y ${PORTS.frontend} (interfaz).\n\n`
        + 'Cierra el programa que lo esté usando (otra copia de ConstruGest, un backend '
        + 'de desarrollo, un servicio que arranque con Windows…) y vuelve a abrir la app.',
      )
    }
  }
}

/** Lanza un comando y espera a que termine con éxito (código 0). */
function runToEnd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    let err = ''
    c.stderr.on('data', (d) => { err += d; process.stderr.write(`  init | ${d}`) })
    c.on('error', reject)
    c.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`${path.basename(cmd)} salió con código ${code}: ${err.slice(-500)}`)))
  })
}

/** Ejecuta SQL en MariaDB conectando como root (pipe por stdin). */
function runClientSql(sqlText, { database } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['--host=127.0.0.1', `--port=${PORTS.mariadb}`, '--user=root', '--binary-mode']
    if (database) args.push(`--database=${database}`)
    const c = spawn(clientBin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let err = ''
    c.stderr.on('data', (d) => { err += d })
    c.on('error', reject)
    c.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`cliente SQL código ${code}: ${err.slice(-500)}`)))
    c.stdin.write(sqlText); c.stdin.end()
  })
}

/** Lanza un script Node usando el runtime de Electron (sin Node externo). */
function spawnNode(entry, extraEnv) {
  const child = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const tag = path.basename(entry)
  child.tag = tag
  child.stdout.on('data', (d) => { process.stdout.write(`  ${tag} | ${d}`); writeLog(`  ${tag} | ${d}`) })
  child.stderr.on('data', (d) => { process.stderr.write(`  ${tag} | ${d}`); writeLog(`  ${tag} | ${d}`) })
  // Marcar la muerte del hijo: sin esto nadie se enteraba de que el backend se
  // había caído (y el shutdown podía hacer taskkill de un PID ya reutilizado).
  child.on('exit', (code, signal) => {
    child.exited = true
    child.exitInfo = code != null ? String(code) : String(signal)
    log(`${tag} ha terminado (${child.exitInfo})`)
  })
  children.push(child)
  return child
}

// ── MariaDB: inicialización de la BD la 1ª vez + arranque ────────────────────

/** Crea la BD, el usuario y aplica el esquema (solo en la 1ª ejecución). */
async function applySchema() {
  log('  creando base de datos y usuario…')
  await runClientSql([
    `CREATE DATABASE IF NOT EXISTS \`${DB.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    `CREATE USER IF NOT EXISTS '${DB.user}'@'localhost' IDENTIFIED BY '${DB.password}';`,
    `CREATE USER IF NOT EXISTS '${DB.user}'@'127.0.0.1' IDENTIFIED BY '${DB.password}';`,
    `GRANT ALL PRIVILEGES ON \`${DB.name}\`.* TO '${DB.user}'@'localhost';`,
    `GRANT ALL PRIVILEGES ON \`${DB.name}\`.* TO '${DB.user}'@'127.0.0.1';`,
    'FLUSH PRIVILEGES;',
  ].join('\n'))

  // Los ficheros del esquema se aplican en orden (mismo que docker-entrypoint).
  for (const f of ['01_schema.sql', '02_seed.sql', '03_seed_demo.sql']) {
    const p = path.join(paths.schemaDir, f)
    if (!fs.existsSync(p)) continue
    log('  aplicando', f)
    await runClientSql(fs.readFileSync(p, 'utf-8'), { database: DB.name })
  }
}

/** ¿Existe ya una base de datos con ese nombre? (root, sin marcadores frágiles). */
function databaseExists(name) {
  return new Promise((resolve) => {
    const c = spawn(clientBin, [
      '--host=127.0.0.1', `--port=${PORTS.mariadb}`, '--user=root', '-N', '-B',
      '-e', `SHOW DATABASES LIKE '${name}'`,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    c.stdout.on('data', (d) => { out += d })
    c.on('close', () => resolve(out.trim() === name))
    c.on('error', () => resolve(false))
  })
}

/**
 * Arranca MariaDB bundleada; si no está, la asume externa. La inicialización es
 * IDEMPOTENTE y resistente a interrupciones:
 *  - install-db solo si no hay tablas de sistema (`mysql/`). install-db exige un
 *    datadir vacío/nuevo, así que si hay restos de un intento fallido se limpian.
 *  - el esquema se aplica solo si la BD `construgest` aún no existe.
 */
async function startMariaDB() {
  if (!fs.existsSync(paths.mysqld)) {
    log('MariaDB no bundleada → se asume una externa en :' + PORTS.mariadb + ' (dev: Docker)')
    return
  }
  if (!installDbBin || !clientBin) {
    throw new Error('Faltan binarios de MariaDB (install-db / cliente) en runtime/mariadb/bin')
  }

  const systemDir = path.join(paths.dataDir, 'mysql') // tablas de sistema de MariaDB
  if (!fs.existsSync(systemDir)) {
    // Datadir sin inicializar. install-db no acepta un dir con contenido → si hay
    // restos de un arranque anterior fallido, se borran (no hay datos reales).
    if (fs.existsSync(paths.dataDir)) {
      log('Datadir sin inicializar con restos → limpiando')
      fs.rmSync(paths.dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(paths.dataDir, { recursive: true })
    log('Inicializando datadir de MariaDB (1ª vez)…')
    await runToEnd(installDbBin, [`--datadir=${paths.dataDir}`])
  }

  log('Arrancando MariaDB…')
  const child = spawn(paths.mysqld, [
    `--datadir=${paths.dataDir}`,
    `--port=${PORTS.mariadb}`,
    '--bind-address=127.0.0.1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (d) => { process.stdout.write(`  mariadb | ${d}`); writeLog(`  mariadb | ${d}`) })
  child.stderr.on('data', (d) => { process.stderr.write(`  mariadb | ${d}`); writeLog(`  mariadb | ${d}`) })
  children.push(child)

  await waitForTcp(PORTS.mariadb)

  // Esquema idempotente: solo si la BD no existe todavía.
  if (!(await databaseExists(DB.name))) {
    log('Aplicando esquema (BD nueva)…')
    await applySchema()
    log('MariaDB inicializada y esquema aplicado')
  } else {
    log('MariaDB lista (BD ya existente)')
  }
}

// ── Ollama: arranque + descarga del modelo la 1ª vez (no bloqueante) ─────────

/** Arranca Ollama si está bundleado; si no, asume el del host. */
function startOllama() {
  if (!fs.existsSync(paths.ollama)) {
    log('Ollama no bundleado → se asume el del host en :' + PORTS.ollama)
    return
  }
  log('Arrancando Ollama bundleado…')
  const child = spawn(paths.ollama, ['serve'], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (d) => { process.stdout.write(`  ollama | ${d}`); writeLog(`  ollama | ${d}`) })
  child.stderr.on('data', (d) => { process.stderr.write(`  ollama | ${d}`); writeLog(`  ollama | ${d}`) })
  children.push(child)
}

/** Comprueba si el modelo está descargado (GET /api/tags). */
function ollamaHasModel() {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${PORTS.ollama}/api/tags`, (res) => {
      let body = ''
      res.on('data', (d) => { body += d })
      res.on('end', () => {
        try {
          const models = JSON.parse(body).models || []
          resolve(models.some((m) => m.name === OLLAMA_MODEL || m.model === OLLAMA_MODEL))
        } catch { resolve(false) }
      })
    }).on('error', () => resolve(false))
  })
}

/** Descarga el modelo vía la API de Ollama (stream de progreso al log). */
function pullOllamaModel() {
  const payload = JSON.stringify({ name: OLLAMA_MODEL })
  const req = http.request({
    host: '127.0.0.1', port: PORTS.ollama, path: '/api/pull', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, (res) => {
    let lastPct = -1
    res.on('data', (chunk) => {
      // El pull emite líneas JSON {status, total, completed}
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue
        try {
          const j = JSON.parse(line)
          if (j.total && j.completed) {
            const pct = Math.floor((j.completed / j.total) * 100)
            if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; log(`  descargando ${OLLAMA_MODEL}: ${pct}%`) }
          }
        } catch { /* línea parcial */ }
      }
    })
    res.on('end', () => log(`modelo ${OLLAMA_MODEL} listo`))
  })
  req.on('error', (e) => log('fallo al descargar el modelo:', e.message))
  req.write(payload); req.end()
}

/** Asegura el modelo IA (no bloquea el arranque de la ventana). */
async function ensureOllamaModel() {
  try {
    await waitForHttp(`http://127.0.0.1:${PORTS.ollama}/api/tags`, { timeoutMs: 20000 })
  } catch {
    log('Ollama no responde: la IA local no estará disponible hasta que arranque')
    return
  }
  if (await ollamaHasModel()) { log('modelo IA', OLLAMA_MODEL, 'presente'); return }
  log('Descargando modelo IA', OLLAMA_MODEL, '(1ª vez, puede tardar varios minutos)…')
  pullOllamaModel()
}

// ── Orquestación ─────────────────────────────────────────────────────────────

async function startServices() {
  fs.mkdirSync(paths.storageDir, { recursive: true })

  // Limpia huérfanos de una sesión anterior que hayan quedado agarrando nuestros
  // puertos (tras un cierre forzado/suspensión): si no, el backend nuevo choca con
  // EADDRINUSE y la app parece "sin base de datos / sin backend".
  await freeOwnedPorts()

  await startMariaDB()
  startOllama()

  log('Arrancando backend…')
  const backend = spawnNode(paths.backendEntry, {
    INSTANCE_ID,
    PORT: String(PORTS.backend),
    FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
    DB_HOST: '127.0.0.1',
    DB_PORT: String(PORTS.mariadb),
    DB_NAME: DB.name,
    DB_USER: DB.user,
    DB_PASSWORD: DB.password,
    STORAGE_DIR: paths.storageDir,
    FILES_BASE_URL: `http://localhost:${PORTS.backend}/api/files`,
    OLLAMA_HOST: `http://127.0.0.1:${PORTS.ollama}`,
    OLLAMA_MODEL,
    AI_PROVIDER_ORDER: 'local',
    JWT_SECRET: process.env.JWT_SECRET || 'construgest-desktop-secret',
  })
  // "backend listo" solo si contesta NUESTRO backend (id de instancia) y sigue vivo.
  await waitForHttp(`http://127.0.0.1:${PORTS.backend}/api/health`, {
    child: backend,
    expectInstance: INSTANCE_ID,
  })
  log('backend listo')

  log('Arrancando frontend…')
  const frontend = spawnNode(paths.frontendEntry, {
    PORT: String(PORTS.frontend),
    HOSTNAME: '127.0.0.1',
  })
  // El frontend no tiene health check propio: aquí basta con que responda algo
  // (la raíz redirige a /login), pero sí se vigila que el proceso no haya muerto.
  await waitForHttp(`http://127.0.0.1:${PORTS.frontend}`, { child: frontend })
  log('frontend listo')

  // El modelo IA se asegura en segundo plano (no bloquea la ventana).
  ensureOllamaModel()
}

/**
 * MULTIMON: bounds para una subventana (1200x800, recortada al area util)
 * CENTRADA en el monitor donde esta la ventana principal.
 */
function childBoundsOnAppDisplay() {
  const wa = screen.getDisplayMatching(win.getBounds()).workArea
  const width = Math.min(1200, wa.width)
  const height = Math.min(800, wa.height)
  return {
    x: Math.round(wa.x + (wa.width - width) / 2),
    y: Math.round(wa.y + (wa.height - height) / 2),
    width,
    height,
  }
}

function createWindow() {
  // MULTIMON: reabrir en la pantalla/posición donde se cerró (si sigue
  // conectada); sin dato válido → tamaño por defecto centrado en la primaria.
  const state = windowState.restore()
  win = new BrowserWindow({
    width: state ? state.w : 1400,
    height: state ? state.h : 900,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  })
  if (state) {
    // DPI mixto (monitores con distinta escala de Windows): pasar x/y/tamano
    // al constructor aplica MAL el tamano si la posicion cae en un monitor de
    // escala distinta al primario (verificado aqui: pedir 1000x700 en el 2o
    // monitor daba 800x561, dividido por el 1.25 del primario). Workaround
    // verificado: setBounds DOS veces — la 1a lleva la ventana a ese monitor,
    // la 2a, ya alli, aplica el tamano exacto.
    const bounds = { x: state.x, y: state.y, width: state.w, height: state.h }
    win.setBounds(bounds)
    win.setBounds(bounds)
  }
  win.removeMenu()
  win.loadURL(`http://localhost:${PORTS.frontend}`)
  win.once('ready-to-show', () => {
    // Maximizar aquí y no antes: maximize() muestra la ventana, y hacerlo
    // antes de ready-to-show provocaría un destello en blanco.
    if (state && state.maximized) win.maximize()
    win.show()
  })
  windowState.track(win)
  // Las ventanas internas de la app (visor de referencia, comparador, PDF, impresión)
  // deben abrirse DENTRO de Electron, no en el navegador del sistema. Solo las URLs
  // realmente externas (otro host http/https) se delegan al navegador del usuario.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const isInternal =
      url === 'about:blank' ||
      url.startsWith('blob:') ||
      url.startsWith('data:') ||
      url.startsWith(`http://localhost:${PORTS.frontend}`) ||
      url.startsWith(`http://127.0.0.1:${PORTS.frontend}`) ||
      url.startsWith(`http://localhost:${PORTS.backend}`) ||
      url.startsWith(`http://127.0.0.1:${PORTS.backend}`)
    if (isInternal) {
      // MULTIMON: la subventana se abre CENTRADA en el monitor donde esta la
      // app (sin x/y Electron decide, y con 2 monitores puede caer en el otro).
      // Si el monitor es mas pequeno que 1200x800, se recorta a su area util.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...childBoundsOnAppDisplay(),
          autoHideMenuBar: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
          },
        },
      }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  // DPI mixto: el tamano de overrideBrowserWindowOptions tambien se aplica mal
  // si la subventana cae en un monitor de escala distinta al primario (1200x800
  // salia 960x640). Mismo workaround que en la ventana principal: reaplicar los
  // bounds DOS veces con la subventana ya creada.
  win.webContents.on('did-create-window', (child) => {
    const bounds = childBoundsOnAppDisplay()
    child.setBounds(bounds)
    child.setBounds(bounds)
  })
  // Mientras se descarga una actualización (453 MB), impedir cerrar la ventana:
  // si el proceso principal muere, la descarga se corta y el .msi queda a medias.
  win.on('close', (e) => {
    if (updating) {
      e.preventDefault()
      if (!win.isDestroyed()) win.webContents.send('update:progress', { pct: -1, blocked: true })
      return
    }
    // Cierre real (X, Alt+F4, menú): guardar pantalla/posición ANTES de que
    // muera la ventana, para reabrir ahí la próxima vez.
    windowState.saveNow(win)
  })
}

// ── Autoactualización: descargar el .msi de la release y lanzar el instalador ─

/**
 * Descarga una URL a un fichero, siguiendo redirecciones (GitHub → CDN).
 * Escribe a `dest.part` y renombra al final: el instalador NUNCA ve un fichero a
 * medias. Emite progreso (%) por onProgress si hay Content-Length.
 */
function downloadFile(url, dest, onProgress, redirects = 0) {
  const part = dest + '.part'
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('demasiadas redirecciones'))
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(downloadFile(res.headers.location, dest, onProgress, redirects + 1))
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)) }

      const total = Number(res.headers['content-length']) || 0
      let received = 0
      let lastPct = -1
      const f = fs.createWriteStream(part)
      res.on('data', (chunk) => {
        received += chunk.length
        if (total && onProgress) {
          const pct = Math.floor((received / total) * 100)
          if (pct !== lastPct) { lastPct = pct; onProgress(pct, received, total) }
        }
      })
      res.pipe(f)
      f.on('finish', () => f.close(() => {
        try {
          fs.rmSync(dest, { force: true })
          fs.renameSync(part, dest)     // atómico: .part → .msi ya completo
          resolve(dest)
        } catch (e) { reject(e) }
      }))
      f.on('error', (e) => { try { fs.rmSync(part, { force: true }) } catch { /* ignore */ } reject(e) })
    }).on('error', reject)
  })
}

/** Lanza el instalador MSI (major-upgrade por UpgradeCode) y cierra la app. */
function launchInstaller(dest) {
  log('Lanzando instalador…', dest)
  const child = spawn('msiexec', ['/i', dest], { detached: true, stdio: 'ignore' })
  child.on('error', (e) => log('no se pudo lanzar msiexec:', e.message))
  child.unref()
  // Margen para que msiexec tome el fichero antes de que muera el proceso padre.
  setTimeout(() => { shutdown(); app.quit() }, 1500)
}

// El frontend (dentro de Electron) pide actualizar: descarga el .msi (con la
// ventana bloqueada para que la descarga no se interrumpa) y lanza el instalador.
ipcMain.handle('update:install', async (_e, url) => {
  if (!url) throw new Error('sin URL de descarga')
  const dest = path.join(app.getPath('temp'), 'ConstruGest-update.msi')
  updating = true
  const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload) }
  try {
    log('Descargando actualización…', url)
    await downloadFile(url, dest, (pct, recv, total) => send('update:progress', { pct, recv, total }))
    const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0
    if (!size) throw new Error('la descarga quedó vacía')
    log(`Actualización descargada (${(size / 1048576).toFixed(0)} MB).`)
    send('update:progress', { pct: 100, recv: size, total: size })
  } catch (e) {
    updating = false
    log('Fallo en la actualización:', e.message)
    send('update:error', e.message)
    throw e
  }
  updating = false          // descarga completa: ya se puede cerrar para instalar
  launchInstaller(dest)
  return { started: true }
})

// ── Login rápido con PIN (solo escritorio) ───────────────────────────────────
//
// Tras el primer login normal el usuario crea un PIN. Guardamos sus credenciales
// CIFRADAS con safeStorage (DPAPI en Windows: solo este usuario de Windows puede
// descifrarlas) y, dentro del blob, un hash del PIN (scrypt+sal). En arranques
// posteriores, el PIN correcto libera las credenciales y el frontend hace login.
// NO toca el backend ni el JWT: es puramente comodidad de escritorio.
const PIN_VAULT = () => path.join(app.getPath('userData'), 'pin-vault.dat')
const MAX_PIN_FAILS = 10

function pinAvailable() {
  try { return safeStorage.isEncryptionAvailable() } catch { return false }
}
function readVault() {
  try {
    const buf = fs.readFileSync(PIN_VAULT())
    return JSON.parse(safeStorage.decryptString(buf))
  } catch { return null }
}
function writeVault(obj) {
  fs.writeFileSync(PIN_VAULT(), safeStorage.encryptString(JSON.stringify(obj)))
}
function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex')
}

ipcMain.handle('pin:status', () => {
  return { available: pinAvailable(), hasPin: fs.existsSync(PIN_VAULT()) }
})

ipcMain.handle('pin:set', (_e, { pin, email, password }) => {
  if (!pinAvailable()) return { ok: false, reason: 'no-encryption' }
  if (!pin || String(pin).length < 4 || !email || !password) return { ok: false, reason: 'invalid' }
  const salt = crypto.randomBytes(16).toString('hex')
  writeVault({ email, password, salt, hash: hashPin(pin, salt), fails: 0 })
  return { ok: true }
})

ipcMain.handle('pin:unlock', (_e, { pin }) => {
  const v = readVault()
  if (!v) return { ok: false, reason: 'no-pin' }
  const ok = crypto.timingSafeEqual(
    Buffer.from(hashPin(pin, v.salt), 'hex'),
    Buffer.from(v.hash, 'hex'),
  )
  if (ok) {
    if (v.fails) { v.fails = 0; writeVault(v) }
    return { ok: true, email: v.email, password: v.password }
  }
  v.fails = (v.fails || 0) + 1
  if (v.fails >= MAX_PIN_FAILS) {
    try { fs.rmSync(PIN_VAULT(), { force: true }) } catch { /* ignore */ }
    return { ok: false, reason: 'wiped' }
  }
  writeVault(v)
  return { ok: false, reason: 'bad-pin', remaining: MAX_PIN_FAILS - v.fails }
})

ipcMain.handle('pin:clear', () => {
  try { fs.rmSync(PIN_VAULT(), { force: true }) } catch { /* ignore */ }
  return { ok: true }
})

// Una sola instancia: dos ConstruGest a la vez se pisan los puertos (la segunda
// mataría los servicios de la primera al limpiar huérfanos). La segunda solo
// trae al frente la ventana que ya está abierta.
const hasInstanceLock = app.requestSingleInstanceLock()
if (!hasInstanceLock) {
  log('ya hay otra instancia de ConstruGest abierta → se cierra esta')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })
}

app.whenReady().then(async () => {
  if (!hasInstanceLock) return
  try {
    await startServices()
    createWindow()
  } catch (err) {
    log('ERROR al arrancar:', err.message)
    dialog.showErrorBox('ConstruGest', `No se pudieron arrancar los servicios:\n\n${err.message}`)
    app.quit()
  }
})

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) {
    // Un hijo que ya murió no se mata: su PID puede estar reutilizado por otro
    // proceso del sistema y el taskkill /T se llevaría a un inocente.
    if (c.exited) continue
    try {
      // En Windows, matar el árbol (/T) con /F arrastra los subprocesos y es más
      // fiable que SIGTERM: evita dejar MariaDB/backend/frontend huérfanos.
      if (process.platform === 'win32' && c.pid) {
        spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        c.kill()
      }
    } catch { /* best-effort */ }
  }
}
app.on('window-all-closed', () => { shutdown(); app.quit() })
app.on('before-quit', shutdown)
process.on('exit', shutdown)
