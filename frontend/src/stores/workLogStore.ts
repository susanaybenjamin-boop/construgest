import { create } from 'zustand'
import api from '@/lib/api'
import type {
  WorkLog, FullWorkLog, WorkLogLabor, WorkLogMaterial,
  WorkLogEquipment, WorkLogBudgetLink, CostControlData, CostSummaryData,
} from '@/types'

interface WorkLogState {
  workLogs: WorkLog[]
  activeWorkLog: FullWorkLog | null
  costControl: CostControlData | null
  costSummary: CostSummaryData | null
  loading: boolean
  error: string | null

  loadWorkLogs: (projectId: string) => Promise<void>
  loadFullWorkLog: (id: string) => Promise<void>
  createWorkLog: (projectId: string, data: Partial<WorkLog>) => Promise<WorkLog>
  updateWorkLog: (id: string, data: Partial<WorkLog>) => Promise<void>
  deleteWorkLog: (id: string) => Promise<void>

  // Labor
  addLabor: (workLogId: string, data: Partial<WorkLogLabor>) => Promise<void>
  updateLabor: (entryId: string, data: Partial<WorkLogLabor>) => Promise<void>
  deleteLabor: (entryId: string) => Promise<void>

  // Materials
  addMaterial: (workLogId: string, data: Partial<WorkLogMaterial>) => Promise<void>
  updateMaterial: (entryId: string, data: Partial<WorkLogMaterial>) => Promise<void>
  deleteMaterial: (entryId: string) => Promise<void>

  // Equipment
  addEquipment: (workLogId: string, data: Partial<WorkLogEquipment>) => Promise<void>
  updateEquipment: (entryId: string, data: Partial<WorkLogEquipment>) => Promise<void>
  deleteEquipment: (entryId: string) => Promise<void>

  // Budget Links
  addBudgetLink: (workLogId: string, data: Partial<WorkLogBudgetLink>) => Promise<void>
  updateBudgetLink: (linkId: string, data: Partial<WorkLogBudgetLink>) => Promise<void>
  deleteBudgetLink: (linkId: string) => Promise<void>

  // Cost Control
  loadCostControl: (projectId: string) => Promise<void>
  loadCostSummary: (projectId: string, from?: string, to?: string) => Promise<void>
}

export const useWorkLogStore = create<WorkLogState>((set, get) => ({
  workLogs: [],
  activeWorkLog: null,
  costControl: null,
  costSummary: null,
  loading: false,
  error: null,

  loadWorkLogs: async (projectId) => {
    set({ loading: true, workLogs: [], activeWorkLog: null })
    try {
      const { data } = await api.get<WorkLog[]>(`/work-logs/project/${projectId}`)
      set({ workLogs: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  loadFullWorkLog: async (id) => {
    set({ loading: true })
    try {
      const { data } = await api.get<FullWorkLog>(`/work-logs/${id}/full`)
      set({ activeWorkLog: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  createWorkLog: async (projectId, logData) => {
    const { data } = await api.post<WorkLog>('/work-logs', {
      project_id: projectId,
      ...logData,
    })
    set((s) => ({ workLogs: [data, ...s.workLogs] }))
    return data
  },

  updateWorkLog: async (id, logData) => {
    const { data } = await api.put<WorkLog>(`/work-logs/${id}`, logData)
    set((s) => ({
      workLogs: s.workLogs.map((l) => (l.id === id ? data : l)),
      activeWorkLog: s.activeWorkLog?.workLog.id === id
        ? { ...s.activeWorkLog, workLog: data }
        : s.activeWorkLog,
    }))
  },

  deleteWorkLog: async (id) => {
    await api.delete(`/work-logs/${id}`)
    set((s) => ({
      workLogs: s.workLogs.filter((l) => l.id !== id),
      activeWorkLog: s.activeWorkLog?.workLog.id === id ? null : s.activeWorkLog,
    }))
  },

  // ─── Labor ───────────────────────────────────────────────
  addLabor: async (workLogId, data) => {
    await api.post(`/work-logs/${workLogId}/labor`, data)
    await get().loadFullWorkLog(workLogId)
  },

  updateLabor: async (entryId, data) => {
    await api.put(`/work-logs/labor/${entryId}`, data)
    const active = get().activeWorkLog
    if (active) await get().loadFullWorkLog(active.workLog.id)
  },

  deleteLabor: async (entryId) => {
    await api.delete(`/work-logs/labor/${entryId}`)
    const active = get().activeWorkLog
    if (active) await get().loadFullWorkLog(active.workLog.id)
  },

  // ─── Materials ───────────────────────────────────────────
  addMaterial: async (workLogId, data) => {
    await api.post(`/work-logs/${workLogId}/materials`, data)
    await get().loadFullWorkLog(workLogId)
  },

  updateMaterial: async (entryId, data) => {
    await api.put(`/work-logs/materials/${entryId}`, data)
    const active = get().activeWorkLog
    if (active) await get().loadFullWorkLog(active.workLog.id)
  },

  deleteMaterial: async (entryId) => {
    await api.delete(`/work-logs/materials/${entryId}`)
    const active = get().activeWorkLog
    if (active) await get().loadFullWorkLog(active.workLog.id)
  },

  // ─── Equipment ───────────────────────────────────────────
  addEquipment: async (workLogId, data) => {
    await api.post(`/work-logs/${workLogId}/equipment`, data)
    await get().loadFullWorkLog(workLogId)
  },

  updateEquipment: async (entryId, data) => {
    await api.put(`/work-logs/equipment/${entryId}`, data)
    const active = get().activeWorkLog
    if (active) await get().loadFullWorkLog(active.workLog.id)
  },

  deleteEquipment: async (entryId) => {
    await api.delete(`/work-logs/equipment/${entryId}`)
    const active = get().activeWorkLog
    if (active) await get().loadFullWorkLog(active.workLog.id)
  },

  // ─── Budget Links ───────────────────────────────────────
  addBudgetLink: async (workLogId, data) => {
    await api.post(`/work-logs/${workLogId}/budget-links`, data)
    await get().loadFullWorkLog(workLogId)
  },

  updateBudgetLink: async (linkId, data) => {
    await api.put(`/work-logs/budget-links/${linkId}`, data)
    const active = get().activeWorkLog
    if (active) await get().loadFullWorkLog(active.workLog.id)
  },

  deleteBudgetLink: async (linkId) => {
    await api.delete(`/work-logs/budget-links/${linkId}`)
    const active = get().activeWorkLog
    if (active) await get().loadFullWorkLog(active.workLog.id)
  },

  // ─── Cost Control ───────────────────────────────────────
  loadCostControl: async (projectId) => {
    try {
      const { data } = await api.get<CostControlData>(`/work-logs/project/${projectId}/cost-control`)
      set({ costControl: data })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  loadCostSummary: async (projectId, from, to) => {
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const qs = params.toString()
      const { data } = await api.get<CostSummaryData>(`/work-logs/project/${projectId}/cost-summary${qs ? `?${qs}` : ''}`)
      set({ costSummary: data })
    } catch (err: any) {
      set({ error: err.message })
    }
  },
}))
