import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import storage from '../db/storage.js'

const router = Router()

// Sirve ficheros guardados en disco (reemplaza las signed-URLs de Supabase Storage).
// GET /api/files/<bucket>/<ruta...>  -> devuelve el fichero.
// Sin auth: es un servidor local y las <img src> del navegador no envían el JWT.
// (Para producción/red se podría firmar con un token corto; TODO documentado.)
const safe = (p) => path.normalize(String(p)).replace(/^([.][.](\/|\\|$))+/, '').replace(/^[\\/]+/, '')

router.get('/:bucket/*splat', (req, res) => {
  const bucket = safe(req.params.bucket)
  const splat = req.params.splat
  const rest = safe(Array.isArray(splat) ? splat.join('/') : (splat || ''))
  const f = path.join(storage.BASE, bucket, rest)
  fs.access(f, fs.constants.R_OK, (err) => {
    if (err) return res.status(404).json({ error: 'Fichero no encontrado' })
    res.sendFile(f)
  })
})

export default router
