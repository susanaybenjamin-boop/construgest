import { create } from 'zustand'
import api from '@/lib/api'
import type { Material, MaterialCategory, ComparisonData } from '@/types'

interface MaterialsState {
  materials: Material[]
  categories: MaterialCategory[]
  loading: boolean
  error: string | null
  search: string

  setSearch: (q: string) => void
  loadMaterials: () => Promise<void>
  loadCategories: () => Promise<void>
  createMaterial: (data: Partial<Material>) => Promise<void>
  updateMaterial: (id: string, data: Partial<Material>) => Promise<void>
  deleteMaterial: (id: string) => Promise<void>
  fetchNextCode: (prefix: string) => Promise<string>
  fetchPrefixes: () => Promise<{ prefix: string; count: number }[]>
  groupMaterials: (materialIds: string[]) => Promise<void>
  ungroupMaterial: (materialId: string) => Promise<void>
  loadComparison: () => Promise<ComparisonData>
}

export const useMaterialsStore = create<MaterialsState>((set, get) => ({
  materials: [],
  categories: [],
  loading: false,
  error: null,
  search: '',

  setSearch: (q) => set({ search: q }),

  loadMaterials: async () => {
    set({ loading: true })
    try {
      const search = get().search
      const params = search ? `?search=${encodeURIComponent(search)}` : ''
      const { data } = await api.get<Material[]>(`/materials${params}`)
      set({ materials: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  loadCategories: async () => {
    try {
      const { data } = await api.get<MaterialCategory[]>('/materials/categories')
      set({ categories: data })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  createMaterial: async (materialData) => {
    await api.post('/materials', materialData)
    await get().loadMaterials()
  },

  updateMaterial: async (id, materialData) => {
    await api.put(`/materials/${id}`, materialData)
    await get().loadMaterials()
  },

  deleteMaterial: async (id) => {
    await api.delete(`/materials/${id}`)
    set((s) => ({ materials: s.materials.filter((m) => m.id !== id) }))
  },

  fetchNextCode: async (prefix) => {
    const { data } = await api.get<{ next_code: string }>(`/materials/next-code?prefix=${encodeURIComponent(prefix)}`)
    return data.next_code
  },

  fetchPrefixes: async () => {
    const { data } = await api.get<{ prefix: string; count: number }[]>('/materials/prefixes')
    return data
  },

  groupMaterials: async (materialIds) => {
    await api.put('/materials/group', { material_ids: materialIds })
  },

  ungroupMaterial: async (materialId) => {
    await api.delete(`/materials/ungroup/${materialId}`)
  },

  loadComparison: async () => {
    const { data } = await api.get<ComparisonData>('/materials/comparison')
    return data
  },
}))
