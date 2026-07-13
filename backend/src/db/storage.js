// ============================================================================
// Capa de almacenamiento en DISCO local, compatible con supabase.storage.
// Reemplaza `supabase.storage.from(bucket).upload/download/remove/createSignedUrl...`.
// Los ficheros se guardan en STORAGE_DIR/<bucket>/<path>. Las "URLs firmadas" apuntan
// al endpoint /api/files del backend, que los sirve desde disco (para <img src>, etc.).
// ============================================================================
import fs from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage-data')
const FILE_BASE = process.env.FILES_BASE_URL || 'http://localhost:5000/api/files'

// Evita path traversal (../) fuera del bucket.
const safe = (p) => path.normalize(String(p)).replace(/^([.][.](\/|\\|$))+/, '').replace(/^[\\/]+/, '')
const full = (bucket, p) => path.join(BASE, safe(bucket), safe(p))

function bucketApi(bucket) {
  return {
    async upload(p, buffer, opts = {}) {
      try {
        const f = full(bucket, p)
        await fs.mkdir(path.dirname(f), { recursive: true })
        if (opts.upsert === false) {
          try { await fs.access(f); return { data: null, error: { message: 'The resource already exists', statusCode: '409' } } } catch { /* no existe: seguimos */ }
        }
        await fs.writeFile(f, buffer)
        return { data: { path: p }, error: null }
      } catch (e) { return { data: null, error: { message: e.message } } }
    },
    update(p, buffer, opts = {}) { return this.upload(p, buffer, { ...opts, upsert: true }) },
    async download(p) {
      try {
        const buf = await fs.readFile(full(bucket, p))
        return { data: new Blob([buf]), error: null } // Blob global (Node 18+): tiene .arrayBuffer()
      } catch (e) { return { data: null, error: { message: e.message } } }
    },
    async remove(paths) {
      const arr = Array.isArray(paths) ? paths : [paths]
      for (const p of arr) { try { await fs.unlink(full(bucket, p)) } catch { /* ya no está */ } }
      return { data: null, error: null }
    },
    async createSignedUrl(p /*, expiresIn, opts */) {
      return { data: { signedUrl: `${FILE_BASE}/${safe(bucket)}/${safe(p)}` }, error: null }
    },
    async createSignedUrls(paths /*, expiresIn */) {
      return { data: (paths || []).map((p) => ({ path: p, signedUrl: `${FILE_BASE}/${safe(bucket)}/${safe(p)}`, error: null })), error: null }
    },
    getPublicUrl(p) { return { data: { publicUrl: `${FILE_BASE}/${safe(bucket)}/${safe(p)}` } } },
  }
}

const storage = { from: bucketApi, BASE }
export default storage
