import { create } from 'zustand'
import api from '@/lib/api'
import type { Certification, CertificationSummary, CertificationOverview } from '@/types'

interface CreateFromWorkLogsPayload {
  budget_id: string
  name: string
  period_start?: string | null
  period_end?: string | null
  notes?: string | null
  selections: Array<{
    work_log_budget_link_id: string
    budget_item_id: string
    consumed_quantity: number
  }>
}

interface CertificationState {
  certifications: CertificationOverview[]
  activeSummary: CertificationSummary | null
  loading: boolean
  error: string | null

  loadCertifications: (projectId: string) => Promise<void>
  createCertification: (budgetId: string, data: Partial<Certification>) => Promise<void>
  createFromWorkLogs: (payload: CreateFromWorkLogsPayload) => Promise<Certification>
  loadSummary: (certId: string) => Promise<void>
  updateCertItem: (certId: string, itemId: string, data: { certified_quantity: number; certified_pct: number; notes?: string }) => Promise<void>
  updateStatus: (certId: string, status: string) => Promise<void>
  deleteCertification: (certId: string) => Promise<void>
}

export const useCertificationStore = create<CertificationState>((set, get) => ({
  certifications: [],
  activeSummary: null,
  loading: false,
  error: null,

  loadCertifications: async (projectId) => {
    set({ loading: true })
    try {
      const { data } = await api.get<CertificationOverview[]>(`/certifications/project/${projectId}/overview`)
      set({ certifications: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  createCertification: async (budgetId, certData) => {
    await api.post(`/certifications/budget/${budgetId}`, certData)
  },

  createFromWorkLogs: async (payload) => {
    const { data } = await api.post<Certification>('/certifications/from-work-logs', payload)
    return data
  },

  loadSummary: async (certId) => {
    set({ loading: true })
    try {
      const { data } = await api.get<CertificationSummary>(`/certifications/${certId}/summary`)
      set({ activeSummary: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  updateCertItem: async (certId, itemId, data) => {
    await api.put(`/certifications/${certId}/items/${itemId}`, data)
    await get().loadSummary(certId)
  },

  updateStatus: async (certId, status) => {
    await api.put(`/certifications/${certId}/status`, { status })
  },

  deleteCertification: async (certId) => {
    await api.delete(`/certifications/${certId}`)
    set((s) => ({ certifications: s.certifications.filter((c) => c.id !== certId) }))
  },
}))
