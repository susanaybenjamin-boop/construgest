import { create } from 'zustand'
import api from '@/lib/api'

export interface VersionInfo {
  current: string
  latest: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  downloadUrl: string | null
  assetName: string | null
  notes: string | null
  publishedAt: string | null
  checkedRemote: boolean
  repo?: string
}

interface VersionState {
  info: VersionInfo | null
  loading: boolean
  dismissed: boolean
  load: (force?: boolean) => Promise<void>
  dismiss: () => void
}

// Estado de versión de la app (actual vs. última release en GitHub). Lo consume
// el banner de "nueva versión" del layout admin y la sección "Acerca de".
export const useVersionStore = create<VersionState>((set, get) => ({
  info: null,
  loading: false,
  dismissed: false,

  load: async (force = false) => {
    if (!force && (get().info || get().loading)) return
    set({ loading: true })
    try {
      const { data } = await api.get<VersionInfo>('/version')
      set({ info: data })
    } catch {
      /* sin conexión al backend: se ignora */
    } finally {
      set({ loading: false })
    }
  },

  dismiss: () => set({ dismissed: true }),
}))
