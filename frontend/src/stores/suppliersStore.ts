import { create } from 'zustand'
import api from '@/lib/api'
import type { Supplier } from '@/types'

interface SuppliersState {
  suppliers: Supplier[]
  loading: boolean
  error: string | null

  loadSuppliers: () => Promise<void>
  createSupplier: (data: Partial<Supplier>) => Promise<void>
  updateSupplier: (id: string, data: Partial<Supplier>) => Promise<void>
  deleteSupplier: (id: string) => Promise<void>
}

export const useSuppliersStore = create<SuppliersState>((set, get) => ({
  suppliers: [],
  loading: false,
  error: null,

  loadSuppliers: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get<Supplier[]>('/suppliers')
      set({ suppliers: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  createSupplier: async (supplierData) => {
    await api.post('/suppliers', supplierData)
    await get().loadSuppliers()
  },

  updateSupplier: async (id, supplierData) => {
    await api.put(`/suppliers/${id}`, supplierData)
    await get().loadSuppliers()
  },

  deleteSupplier: async (id) => {
    await api.delete(`/suppliers/${id}`)
    set((s) => ({ suppliers: s.suppliers.filter((sup) => sup.id !== id) }))
  },
}))
