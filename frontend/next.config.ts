import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Server Node autónomo (.next/standalone) para empaquetar en el .msi (Fase 5).
  output: 'standalone',
}

export default nextConfig
