import { create } from 'zustand'
import api from '@/lib/api'
import { subscribeToBranches, unsubscribeFromBranches } from '@/lib/realtime'
import type { BranchInvitation, BranchLink, BranchProjectVisibility } from '@/types'

interface BranchState {
  branches: BranchLink[]
  sentInvitations: BranchInvitation[]
  receivedInvitations: BranchInvitation[]
  visibility: BranchProjectVisibility[]
  loading: boolean

  loadBranches: () => Promise<void>
  loadInvitations: () => Promise<void>
  sendInvite: (email: string) => Promise<void>
  acceptInvitation: (id: string) => Promise<void>
  rejectInvitation: (id: string) => Promise<void>
  cancelInvitation: (id: string) => Promise<void>
  deleteBranch: (id: string) => Promise<void>
  loadVisibility: (linkId: string) => Promise<void>
  toggleVisibility: (projectId: string, branchLinkId: string, visible: boolean) => Promise<void>

  startRealtime: (orgId: string) => void
  stopRealtime: () => void
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  sentInvitations: [],
  receivedInvitations: [],
  visibility: [],
  loading: false,

  loadBranches: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/branches')
      set({ branches: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  loadInvitations: async () => {
    try {
      const { data } = await api.get('/branches/invitations')
      set({ sentInvitations: data.sent, receivedInvitations: data.received })
    } catch { /* ignore */ }
  },

  sendInvite: async (email) => {
    await api.post('/branches/invite', { email })
  },

  acceptInvitation: async (id) => {
    await api.post(`/branches/invitations/${id}/accept`)
  },

  rejectInvitation: async (id) => {
    await api.post(`/branches/invitations/${id}/reject`)
  },

  cancelInvitation: async (id) => {
    await api.delete(`/branches/invitations/${id}`)
  },

  deleteBranch: async (id) => {
    await api.delete(`/branches/${id}`)
  },

  loadVisibility: async (linkId) => {
    const { data } = await api.get(`/branches/visibility/${linkId}`)
    set({ visibility: data })
  },

  toggleVisibility: async (projectId, branchLinkId, visible) => {
    await api.put('/branches/visibility', { project_id: projectId, branch_link_id: branchLinkId, visible })
    set((s) => ({
      visibility: s.visibility.map(v =>
        v.project_id === projectId ? { ...v, visible } : v
      ),
    }))
  },

  startRealtime: (orgId) => {
    subscribeToBranches(orgId, () => {
      // Refrescar invitaciones y vínculos en cuanto cambien.
      get().loadInvitations().catch(() => { /* tolerar */ })
      get().loadBranches().catch(() => { /* tolerar */ })
    })
  },

  stopRealtime: () => {
    unsubscribeFromBranches()
  },
}))
