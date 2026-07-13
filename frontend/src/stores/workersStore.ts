import { create } from 'zustand'
import api from '@/lib/api'
import type { Worker } from '@/types'

interface WorkersState {
  workers: Worker[]
  loading: boolean
  error: string | null
  search: string
  setSearch: (s: string) => void
  loadWorkers: (filters?: { status?: string; role?: string; search?: string }) => Promise<void>
  createWorker: (data: Partial<Worker>) => Promise<Worker>
  updateWorker: (id: string, data: Partial<Worker>) => Promise<Worker>
  deleteWorker: (id: string) => Promise<void>
  getRoles: () => Promise<string[]>
}

export const useWorkersStore = create<WorkersState>((set, get) => ({
  workers: [],
  loading: false,
  error: null,
  search: '',
  setSearch: (search) => set({ search }),

  loadWorkers: async (filters) => {
    set({ loading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.role) params.set('role', filters.role)
      if (filters?.search) params.set('search', filters.search)
      const qs = params.toString()
      const res = await api.get(`/workers${qs ? `?${qs}` : ''}`)
      set({ workers: res.data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  createWorker: async (data) => {
    const res = await api.post('/workers', data)
    set({ workers: [...get().workers, res.data] })
    return res.data
  },

  updateWorker: async (id, data) => {
    const res = await api.put(`/workers/${id}`, data)
    set({ workers: get().workers.map(w => w.id === id ? res.data : w) })
    return res.data
  },

  deleteWorker: async (id) => {
    await api.delete(`/workers/${id}`)
    set({ workers: get().workers.filter(w => w.id !== id) })
  },

  getRoles: async () => {
    const res = await api.get('/workers/roles')
    return res.data
  },
}))
