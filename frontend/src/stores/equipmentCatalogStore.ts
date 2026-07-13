import { create } from 'zustand'
import api from '@/lib/api'
import type { EquipmentCatalogItem } from '@/types'

interface EquipmentCatalogState {
  equipment: EquipmentCatalogItem[]
  loading: boolean
  error: string | null
  search: string
  setSearch: (s: string) => void
  loadEquipment: (filters?: { status?: string; type?: string; search?: string }) => Promise<void>
  createEquipment: (data: Partial<EquipmentCatalogItem>) => Promise<EquipmentCatalogItem>
  updateEquipment: (id: string, data: Partial<EquipmentCatalogItem>) => Promise<EquipmentCatalogItem>
  deleteEquipment: (id: string) => Promise<void>
  getCategories: () => Promise<string[]>
}

export const useEquipmentCatalogStore = create<EquipmentCatalogState>((set, get) => ({
  equipment: [],
  loading: false,
  error: null,
  search: '',
  setSearch: (search) => set({ search }),

  loadEquipment: async (filters) => {
    set({ loading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.type) params.set('type', filters.type)
      if (filters?.search) params.set('search', filters.search)
      const qs = params.toString()
      const res = await api.get(`/equipment-catalog${qs ? `?${qs}` : ''}`)
      set({ equipment: res.data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  createEquipment: async (data) => {
    const res = await api.post('/equipment-catalog', data)
    set({ equipment: [...get().equipment, res.data] })
    return res.data
  },

  updateEquipment: async (id, data) => {
    const res = await api.put(`/equipment-catalog/${id}`, data)
    set({ equipment: get().equipment.map(e => e.id === id ? res.data : e) })
    return res.data
  },

  deleteEquipment: async (id) => {
    await api.delete(`/equipment-catalog/${id}`)
    set({ equipment: get().equipment.filter(e => e.id !== id) })
  },

  getCategories: async () => {
    const res = await api.get('/equipment-catalog/categories')
    return res.data
  },
}))
