// ============================================================================
// Shell de escritorio de Construgest (Electron).
//
// Arranca los servicios LOCALES como procesos hijo y muestra la app en una
// ventana propia (sin barra de navegador). Autocontenido, sin Docker:
//
//   [MariaDB] ─ [backend Node :5000] ─ [frontend Next standalone :3000] ─ [Ollama]
//
// MariaDB y Ollama son OPCIONALES: si su binario está bundleado en `runtime/`
// los arranca; si no, asume que corren fuera (útil en desarrollo con la MariaDB
// de Docker y el Ollama del host). Backend y frontend se ejecutan con el propio
// Node de Electron (ELECTRON_RUN_AS_NODE) → no hace falta bundlear Node aparte.
// ============================================================================
const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')

const PORTS = { mariadb: 3308, backend: 5000, frontend: 3000 }
const children = []
let win = null

// ── Rutas: en dev la raíz del repo es ../ ; empaquetado, process.resourcesPath ──
const RES = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
const paths = {
  backendEntry: path.join(RES, 'backend', 'src', 'app.js'),
  frontendEntry: path.join(RES, 'frontend', 'server.js'),
  schemaDir: path.join(RES, 'database', 'init'),
  mysqld: path.join(RES, 'runtime', 'mariadb', 'bin', 'mysqld.exe'),
  ollama: path.join(RES, 'runtime', 'ollama', 'ollama.exe'),
  dataDir: path.join(app.getPath('userData'), 'data'),
  storageDir: path.join(app.getPath('userData'), 'storage'),
}

function log(...a) { console.log('[construgest]', ...a) }

/** Espera a que una URL responda (health check). */
function waitForHttp(url, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(true) })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`timeout esperando ${url}`))
        else setTimeout(tick, intervalMs)
      })
      req.setTimeout(2000, () => req.destroy())
    }
    tick()
  })
}

/** Lanza un script Node usando el runtime de Electron (sin Node externo). */
function spawnNode(entry, extraEnv) {
  const child = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => process.stdout.write(`  ${path.basename(entry)} | ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`  ${path.basename(entry)} | ${d}`))
  children.push(child)
  return child
}

/** Arranca MariaDB si está bundleada; si no, asume una externa (Docker en dev). */
async function startMariaDB() {
  if (!fs.existsSync(paths.mysqld)) {
    log('MariaDB no bundleada → se asume una externa en el puerto', PORTS.mariadb, '(dev: Docker)')
    return
  }
  fs.mkdirSync(paths.dataDir, { recursive: true })
  // TODO(F5-3): inicializar el datadir la 1ª vez (mysql_install_db) y aplicar
  // database/init/*.sql. Aquí solo se deja el andamiaje del arranque.
  log('Arrancando MariaDB bundleada…')
  const child = spawn(paths.mysqld, [
    `--datadir=${paths.dataDir}`,
    `--port=${PORTS.mariadb}`,
    '--bind-address=127.0.0.1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (d) => process.stdout.write(`  mariadb | ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`  mariadb | ${d}`))
  children.push(child)
}

/** Arranca Ollama si está bundleado; si no, asume el del host. */
function startOllama() {
  if (!fs.existsSync(paths.ollama)) {
    log('Ollama no bundleado → se asume el del host en :11434')
    return
  }
  log('Arrancando Ollama bundleado…')
  const child = spawn(paths.ollama, ['serve'], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (d) => process.stdout.write(`  ollama | ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`  ollama | ${d}`))
  children.push(child)
}

async function startServices() {
  fs.mkdirSync(paths.storageDir, { recursive: true })

  await startMariaDB()
  startOllama()

  log('Arrancando backend…')
  spawnNode(paths.backendEntry, {
    PORT: String(PORTS.backend),
    FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
    DB_HOST: '127.0.0.1',
    DB_PORT: String(PORTS.mariadb),
    DB_NAME: 'construgest',
    DB_USER: 'construgest',
    DB_PASSWORD: 'construgest',
    STORAGE_DIR: paths.storageDir,
    FILES_BASE_URL: `http://localhost:${PORTS.backend}/api/files`,
    OLLAMA_HOST: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'qwen2.5:3b',
    AI_PROVIDER_ORDER: 'local',
    JWT_SECRET: process.env.JWT_SECRET || 'construgest-desktop-secret',
  })
  await waitForHttp(`http://127.0.0.1:${PORTS.backend}/api/health`)
  log('backend listo')

  log('Arrancando frontend…')
  spawnNode(paths.frontendEntry, {
    PORT: String(PORTS.frontend),
    HOSTNAME: '127.0.0.1',
  })
  await waitForHttp(`http://127.0.0.1:${PORTS.frontend}`)
  log('frontend listo')
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  })
  win.removeMenu()
  win.loadURL(`http://localhost:${PORTS.frontend}`)
  win.once('ready-to-show', () => win.show())
  // Enlaces externos → navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
}

app.whenReady().then(async () => {
  try {
    await startServices()
    createWindow()
  } catch (err) {
    log('ERROR al arrancar:', err.message)
    dialog.showErrorBox('ConstruGest', `No se pudieron arrancar los servicios:\n${err.message}`)
    app.quit()
  }
})

function shutdown() {
  for (const c of children) { try { c.kill() } catch { /* best-effort */ } }
}
app.on('window-all-closed', () => { shutdown(); app.quit() })
app.on('before-quit', shutdown)
process.on('exit', shutdown)
