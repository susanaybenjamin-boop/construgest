import { create } from 'zustand'
import api from '@/lib/api'
import {
  Proyecto,
  CONFIG_DEFAULT,
  ElementoEstructural,
  BarraNecesaria,
} from '@/lib/ferrapp/types'
import { getPlantilla } from '@/lib/ferrapp/plantillas'
import { getGeometriaDefault, generarBarrasDesdeGeometria } from '@/lib/ferrapp/generadores'

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

function generarId() {
  return Math.random().toString(36).substring(2, 9)
}

function crearBarraInicial(): BarraNecesaria {
  return { id: generarId(), longitud: 5.0, diametro: 12, cantidad: 10, etiqueta: '' }
}

export function crearElemento(nombre: string, subtipo?: string): ElementoEstructural {
  const plantilla = subtipo ? getPlantilla(subtipo) : null
  const categoria = plantilla?.categoria || 'libre'
  const geometria = subtipo ? getGeometriaDefault(subtipo, categoria) : undefined

  let barrasNecesarias: BarraNecesaria[]
  if (geometria) {
    const barrasGeo = generarBarrasDesdeGeometria(geometria, categoria, subtipo)
    barrasNecesarias = barrasGeo.map((b) => ({ ...b, id: generarId() }))
  } else if (plantilla) {
    barrasNecesarias = plantilla.barrasDefault.map((b) => ({ ...b, id: generarId() }))
  } else {
    barrasNecesarias = [crearBarraInicial()]
  }

  return {
    id: generarId(),
    nombre,
    categoria,
    subtipo: subtipo || undefined,
    geometria,
    barrasNecesarias,
    sobrantesGenerados: [],
    sobrantesConsumidos: [],
    calculado: false,
  }
}

function crearProyectoLocal(nombre: string): Proyecto {
  return {
    id: generarId(),
    nombre,
    config: { ...CONFIG_DEFAULT },
    elementos: [crearElemento('Elemento 1')],
    fechaCreacion: new Date().toISOString(),
    fechaModificacion: new Date().toISOString(),
  }
}

interface FerrappState {
  proyectos: Proyecto[]
  activeProyecto: Proyecto | null
  loading: boolean
  syncStatus: SyncStatus
  etiquetasCustom: Record<string, string[]>

  // Debounce timer
  _saveTimer: ReturnType<typeof setTimeout> | null

  loadProyectos: () => Promise<void>
  loadProyecto: (id: string) => Promise<void>
  createProyecto: (nombre: string) => Promise<Proyecto>
  saveProyecto: (proyecto: Proyecto) => void
  deleteProyecto: (id: string) => Promise<void>

  loadEtiquetas: () => Promise<void>
  saveEtiquetaCustom: (categoria: string, etiqueta: string) => Promise<void>
}

export const useFerrappStore = create<FerrappState>((set, get) => ({
  proyectos: [],
  activeProyecto: null,
  loading: false,
  syncStatus: 'idle',
  etiquetasCustom: {},
  _saveTimer: null,

  loadProyectos: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/ferrapp/proyectos')
      const proyectos = data.map((row: any) => row.data as Proyecto)
      set({ proyectos, loading: false, syncStatus: 'idle' })
    } catch {
      set({ loading: false, syncStatus: 'error' })
    }
  },

  loadProyecto: async (id: string) => {
    set({ loading: true })
    try {
      const { data } = await api.get(`/ferrapp/proyectos/${id}`)
      const proyecto = data.data as Proyecto
      set({ activeProyecto: proyecto, loading: false })
    } catch {
      set({ loading: false, syncStatus: 'error' })
    }
  },

  createProyecto: async (nombre: string) => {
    const proyecto = crearProyectoLocal(nombre)
    try {
      await api.post('/ferrapp/proyectos', {
        id: proyecto.id,
        nombre: proyecto.nombre,
        data: proyecto,
      })
      set((state) => ({
        proyectos: [proyecto, ...state.proyectos],
      }))
    } catch {
      set({ syncStatus: 'error' })
    }
    return proyecto
  },

  saveProyecto: (proyecto: Proyecto) => {
    const updated = { ...proyecto, fechaModificacion: new Date().toISOString() }

    // Optimistic update
    set((state) => ({
      activeProyecto: updated,
      proyectos: state.proyectos.map((p) =>
        p.id === updated.id ? updated : p
      ),
    }))

    // Debounced save to API
    const timer = get()._saveTimer
    if (timer) clearTimeout(timer)
    const newTimer = setTimeout(async () => {
      set({ syncStatus: 'syncing' })
      try {
        await api.put(`/ferrapp/proyectos/${updated.id}`, {
          nombre: updated.nombre,
          data: updated,
        })
        set({ syncStatus: 'idle' })
      } catch {
        set({ syncStatus: 'error' })
      }
    }, 2500)
    set({ _saveTimer: newTimer })
  },

  deleteProyecto: async (id: string) => {
    set((state) => ({
      proyectos: state.proyectos.filter((p) => p.id !== id),
    }))
    try {
      await api.delete(`/ferrapp/proyectos/${id}`)
    } catch {
      set({ syncStatus: 'error' })
    }
  },

  loadEtiquetas: async () => {
    try {
      const { data } = await api.get('/ferrapp/etiquetas')
      set({ etiquetasCustom: data })
    } catch {
      // silent
    }
  },

  saveEtiquetaCustom: async (categoria: string, etiqueta: string) => {
    set((state) => {
      const current = state.etiquetasCustom[categoria] || []
      if (current.includes(etiqueta)) return state
      return {
        etiquetasCustom: {
          ...state.etiquetasCustom,
          [categoria]: [...current, etiqueta],
        },
      }
    })
    try {
      await api.post('/ferrapp/etiquetas', { categoria, etiqueta })
    } catch {
      // silent
    }
  },
}))
