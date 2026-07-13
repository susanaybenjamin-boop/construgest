import { create } from 'zustand'
import api from '@/lib/api'
import { syncProject } from '@/lib/syncService'
import { subscribeToProjects, unsubscribeFromProjects } from '@/lib/realtime'
import type { ProjectInfo, ProjectFile, CreateProjectParams } from '@/types'

interface ProjectState {
  projects: ProjectInfo[]
  activeProject: ProjectInfo | null
  projectFiles: ProjectFile[]
  trashedProjects: ProjectInfo[]
  loading: boolean
  error: string | null

  loadProjects: () => Promise<void>
  createProject: (params: CreateProjectParams) => Promise<ProjectInfo>
  loadProject: (id: string) => Promise<void>
  updateProject: (id: string, params: Partial<ProjectInfo>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  loadProjectFiles: (projectId: string) => Promise<void>
  deleteFile: (projectId: string, fileId: string) => Promise<void>
  setActiveProject: (project: ProjectInfo | null) => void

  // Papelera
  loadTrash: () => Promise<void>
  restoreProject: (id: string) => Promise<void>
  permanentDeleteProject: (id: string) => Promise<void>

  startRealtime: (orgId: string) => void
  stopRealtime: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  projectFiles: [],
  trashedProjects: [],
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get<ProjectInfo[]>('/projects')
      set({ projects: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  createProject: async (params) => {
    const { data } = await api.post<ProjectInfo>('/projects', params)
    set((s) => ({ projects: [data, ...s.projects] }))
    syncProject(data) // fire-and-forget sync to local disk
    return data
  },

  loadProject: async (id) => {
    set({ loading: true })
    try {
      const { data } = await api.get<ProjectInfo>(`/projects/${id}`)
      set({ activeProject: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  updateProject: async (id, params) => {
    const { data } = await api.put<ProjectInfo>(`/projects/${id}`, params)
    set((s) => ({
      activeProject: data,
      projects: s.projects.map((p) =>
        p.id === id && !p.source ? { ...data, source: p.source } : p
      ),
    }))
    syncProject(data) // fire-and-forget sync to local disk
  },

  deleteProject: async (id) => {
    await api.delete(`/projects/${id}`)
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProject: s.activeProject?.id === id ? null : s.activeProject,
    }))
  },

  loadProjectFiles: async (projectId) => {
    const { data } = await api.get<ProjectFile[]>(`/projects/${projectId}/files`)
    set({ projectFiles: data })
  },

  deleteFile: async (projectId, fileId) => {
    await api.delete(`/projects/${projectId}/files/${fileId}`)
    set((s) => ({
      projectFiles: s.projectFiles.filter((f) => f.id !== fileId),
    }))
  },

  setActiveProject: (project) => set({ activeProject: project }),

  loadTrash: async () => {
    const { data } = await api.get<ProjectInfo[]>('/projects/trash')
    set({ trashedProjects: data })
  },

  restoreProject: async (id) => {
    await api.post(`/projects/${id}/restore`)
    set((s) => ({ trashedProjects: s.trashedProjects.filter(p => p.id !== id) }))
    // Refrescar la lista activa para que aparezca el restaurado.
    get().loadProjects().catch(() => { /* tolerar */ })
  },

  permanentDeleteProject: async (id) => {
    await api.delete(`/projects/${id}/permanent`)
    set((s) => ({ trashedProjects: s.trashedProjects.filter(p => p.id !== id) }))
  },

  startRealtime: (orgId) => {
    subscribeToProjects(orgId, () => {
      // Recargar lista cuando alguien crea/edita/borra proyectos o cambia
      // visibilidad/vínculo de sucursal.
      get().loadProjects().catch(() => { /* tolerar */ })
    })
  },

  stopRealtime: () => {
    unsubscribeFromProjects()
  },
}))
