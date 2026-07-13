import { create } from 'zustand'
import api from '@/lib/api'
import type { Subcontractor, SubcontractorDocument } from '@/types'

interface SubcontractorsState {
  subcontractors: Subcontractor[]
  activeSubcontractor: Subcontractor | null
  documents: SubcontractorDocument[]
  loading: boolean
  error: string | null
  search: string
  setSearch: (s: string) => void
  loadSubcontractors: (filters?: { search?: string; specialty?: string; is_active?: string }) => Promise<void>
  loadSubcontractor: (id: string) => Promise<void>
  createSubcontractor: (data: Partial<Subcontractor>) => Promise<Subcontractor>
  updateSubcontractor: (id: string, data: Partial<Subcontractor>) => Promise<Subcontractor>
  deleteSubcontractor: (id: string) => Promise<void>
  // Documents
  loadDocuments: (subId: string, projectId?: string) => Promise<void>
  addDocument: (subId: string, data: Partial<SubcontractorDocument>) => Promise<SubcontractorDocument>
  updateDocument: (docId: string, data: Partial<SubcontractorDocument>) => Promise<SubcontractorDocument>
  deleteDocument: (docId: string) => Promise<void>
  getSpecialties: () => Promise<string[]>
}

export const useSubcontractorsStore = create<SubcontractorsState>((set, get) => ({
  subcontractors: [],
  activeSubcontractor: null,
  documents: [],
  loading: false,
  error: null,
  search: '',
  setSearch: (search) => set({ search }),

  loadSubcontractors: async (filters) => {
    set({ loading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (filters?.search) params.set('search', filters.search)
      if (filters?.specialty) params.set('specialty', filters.specialty)
      if (filters?.is_active !== undefined) params.set('is_active', filters.is_active)
      const qs = params.toString()
      const res = await api.get(`/subcontractors${qs ? `?${qs}` : ''}`)
      set({ subcontractors: res.data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  loadSubcontractor: async (id) => {
    set({ loading: true, error: null })
    try {
      const res = await api.get(`/subcontractors/${id}`)
      set({
        activeSubcontractor: res.data.subcontractor,
        documents: res.data.documents,
        loading: false,
      })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  createSubcontractor: async (data) => {
    const res = await api.post('/subcontractors', data)
    set({ subcontractors: [...get().subcontractors, res.data] })
    return res.data
  },

  updateSubcontractor: async (id, data) => {
    const res = await api.put(`/subcontractors/${id}`, data)
    set({
      subcontractors: get().subcontractors.map(s => s.id === id ? res.data : s),
      activeSubcontractor: get().activeSubcontractor?.id === id ? res.data : get().activeSubcontractor,
    })
    return res.data
  },

  deleteSubcontractor: async (id) => {
    await api.delete(`/subcontractors/${id}`)
    set({ subcontractors: get().subcontractors.filter(s => s.id !== id) })
  },

  loadDocuments: async (subId, projectId) => {
    try {
      const qs = projectId ? `?project_id=${projectId}` : ''
      const res = await api.get(`/subcontractors/${subId}/documents${qs}`)
      set({ documents: res.data })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  addDocument: async (subId, data) => {
    const res = await api.post(`/subcontractors/${subId}/documents`, data)
    set({ documents: [...get().documents, res.data] })
    return res.data
  },

  updateDocument: async (docId, data) => {
    const res = await api.put(`/subcontractors/documents/${docId}`, data)
    set({ documents: get().documents.map(d => d.id === docId ? res.data : d) })
    return res.data
  },

  deleteDocument: async (docId) => {
    await api.delete(`/subcontractors/documents/${docId}`)
    set({ documents: get().documents.filter(d => d.id !== docId) })
  },

  getSpecialties: async () => {
    const res = await api.get('/subcontractors/specialties')
    return res.data
  },
}))
