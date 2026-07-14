// ============================================================================
// Versión de la app + comprobación de actualizaciones (estilo Benjagest).
//
// - Versión ACTUAL: la del `backend/package.json` (se bumpea al hacer release).
// - Última RELEASE: se consulta a la API de GitHub Releases del repo
//   (`GITHUB_REPO`, por defecto susanaybenjamin-boop/construgest). Cacheado 1h.
//   Repo privado → hace falta `GITHUB_TOKEN` en el backend; sin él (o sin
//   internet) degrada a `checkedRemote:false` sin romper nada.
//
// Alcance actual (decidido con Benjamin): solo AVISAR de que hay versión nueva.
// La descarga/aplicación automática del binario se cablea en Fase 5 (.msi).
// ============================================================================
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const GITHUB_REPO = process.env.GITHUB_REPO || 'susanaybenjamin-boop/construgest'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hora

let currentVersion = '0.0.0'
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))
  currentVersion = pkg.version || '0.0.0'
} catch { /* deja 0.0.0 */ }

let cache = null // { at: number, data: {...} | null }

export function getCurrentVersion() {
  return currentVersion
}

/** Compara dos versiones semver-lite. >0 si a>b, <0 si a<b, 0 si iguales. */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** Consulta la última release en GitHub (cacheada). Devuelve null si no se pudo. */
async function fetchLatestRelease() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'construgest-updater',
  }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  let data = null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers, signal: ctrl.signal,
    })
    clearTimeout(t)
    if (res.ok) {
      const r = await res.json()
      // Asset del instalador (.msi) para la autoactualización.
      const msi = (r.assets || []).find((a) => /\.msi$/i.test(a.name || ''))
      data = {
        version: String(r.tag_name || '').replace(/^v/i, ''),
        tag: r.tag_name || '',
        url: r.html_url || '',
        notes: r.body || '',
        publishedAt: r.published_at || '',
        downloadUrl: msi?.browser_download_url || null,
        assetName: msi?.name || null,
      }
    } else {
      console.warn(`[version] GitHub releases -> HTTP ${res.status} (repo privado sin token?)`)
    }
  } catch (err) {
    console.warn('[version] no se pudo consultar GitHub:', err.message)
  }

  cache = { at: Date.now(), data }
  return data
}

/**
 * Estado de versión para el endpoint: versión actual, última publicada y si hay
 * actualización disponible.
 */
export async function getVersionStatus() {
  const latest = await fetchLatestRelease()
  const current = currentVersion
  const updateAvailable = !!(latest?.version && compareVersions(latest.version, current) > 0)
  return {
    current,
    latest: latest?.version || null,
    updateAvailable,
    releaseUrl: latest?.url || null,
    downloadUrl: latest?.downloadUrl || null,
    assetName: latest?.assetName || null,
    notes: latest?.notes || null,
    publishedAt: latest?.publishedAt || null,
    checkedRemote: latest !== null,
    repo: GITHUB_REPO,
  }
}

export default { getCurrentVersion, getVersionStatus, compareVersions }
