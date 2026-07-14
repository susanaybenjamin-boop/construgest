import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Server Node autónomo (.next/standalone) para empaquetar en el .msi (Fase 5).
  output: 'standalone',
  // Fija la raíz en esta carpeta: sin esto, si aparece un package-lock.json en un
  // directorio superior, Next lo toma como workspace root y anida el standalone
  // (server.js quedaría en standalone/frontend/), rompiendo el empaquetado.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
}

export default nextConfig
