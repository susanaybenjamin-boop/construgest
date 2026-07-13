'use client'

import { useEffect, useState } from 'react'
import { useBranchStore } from '@/stores/branchStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useProjectStore } from '@/stores/projectStore'
import {
  GitBranch, Plus, Trash2, Check, X, Eye, EyeOff,
  Send, Loader2, ChevronRight, Mail, Share2,
} from 'lucide-react'
import type { BranchLink } from '@/types'
import BranchShareModal from '@/components/branches/BranchShareModal'

export default function BranchesPage() {
  const {
    branches, sentInvitations, receivedInvitations, visibility,
    loading, loadBranches, loadInvitations, sendInvite,
    acceptInvitation, rejectInvitation, cancelInvitation,
    deleteBranch, loadVisibility, toggleVisibility,
  } = useBranchStore()
  const { addToast } = useNotificationStore()
  const loadProjects = useProjectStore(s => s.loadProjects)
  const [inviteEmail, setInviteEmail] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [sending, setSending] = useState(false)
  const [selectedLink, setSelectedLink] = useState<BranchLink | null>(null)
  const [shareLink, setShareLink] = useState<BranchLink | null>(null)

  useEffect(() => {
    loadBranches()
    loadInvitations()
  }, [])

  useEffect(() => {
    if (selectedLink) {
      loadVisibility(selectedLink.id)
    }
  }, [selectedLink])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setSending(true)
    try {
      await sendInvite(inviteEmail.trim())
      addToast('success', 'Invitacion enviada')
      setInviteEmail('')
      setShowInviteModal(false)
      loadInvitations()
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Error al enviar invitacion')
    } finally {
      setSending(false)
    }
  }

  const handleAccept = async (id: string) => {
    try {
      await acceptInvitation(id)
      addToast('success', 'Invitacion aceptada')
      loadBranches()
      loadInvitations()
      loadProjects()
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Error')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await rejectInvitation(id)
      addToast('info', 'Invitacion rechazada')
      loadInvitations()
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Error')
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelInvitation(id)
      addToast('info', 'Invitacion cancelada')
      loadInvitations()
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este vinculo de sucursal? Los proyectos compartidos dejaran de ser visibles.')) return
    try {
      await deleteBranch(id)
      addToast('success', 'Sucursal desvinculada')
      loadBranches()
      loadProjects()
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Error')
    }
  }

  const pendingReceived = receivedInvitations.filter(i => i.status === 'pending')
  const pendingSent = sentInvitations.filter(i => i.status === 'pending')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-purple-600" />
            </div>
            Sucursales
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona tus vinculos con otras organizaciones</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Invitar sucursal
        </button>
      </div>

      {/* Invitaciones recibidas pendientes */}
      {pendingReceived.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Invitaciones recibidas ({pendingReceived.length})
          </h2>
          <div className="space-y-2">
            {pendingReceived.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {inv.from_organization_name || 'Organizacion'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(inv.id)}
                    className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleReject(inv.id)}
                    className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sucursales activas */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Sucursales activas</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-200">
            <GitBranch className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No tienes sucursales vinculadas</p>
            <p className="text-xs text-gray-400 mt-1">Invita a otra organizacion para compartir proyectos</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {branches.map((branch) => (
              <div key={branch.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between hover:shadow-sm transition">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{branch.partner_organization_name}</p>
                    <p className="text-xs text-gray-500">
                      Vinculada desde {new Date(branch.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShareLink(branch)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    title="Enviar biblioteca o proveedores a esta sucursal"
                  >
                    <Share2 className="w-4 h-4" />
                    Enviar
                  </button>
                  <button
                    onClick={() => setSelectedLink(selectedLink?.id === branch.id ? null : branch)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition"
                  >
                    <Eye className="w-4 h-4" />
                    Visibilidad
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${selectedLink?.id === branch.id ? 'rotate-90' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleDelete(branch.id)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel de visibilidad */}
      {selectedLink && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Visibilidad de proyectos para {selectedLink.partner_organization_name}
          </h3>
          <p className="text-xs text-gray-500 mb-4">Activa los proyectos que quieres compartir con esta sucursal</p>
          {visibility.length === 0 ? (
            <p className="text-sm text-gray-400">No tienes proyectos</p>
          ) : (
            <div className="space-y-2">
              {visibility.map((v) => (
                <div key={v.project_id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-sm font-medium text-gray-700">{v.project_name}</span>
                  <button
                    onClick={() => toggleVisibility(v.project_id, selectedLink.id, !v.visible)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      v.visible
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                    }`}
                  >
                    {v.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {v.visible ? 'Visible' : 'Oculto'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invitaciones enviadas pendientes */}
      {pendingSent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Invitaciones enviadas pendientes</h2>
          <div className="space-y-2">
            {pendingSent.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.to_email}</p>
                  <p className="text-xs text-gray-500">
                    Enviada {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleCancel(inv.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de envío de biblioteca / proveedores */}
      {shareLink && (
        <BranchShareModal link={shareLink} onClose={() => setShareLink(null)} />
      )}

      {/* Modal de invitacion */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Invitar sucursal</h2>
            <p className="text-sm text-gray-500 mb-4">Introduce el email del usuario de la otra organizacion</p>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@empresa.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleInvite}
                disabled={sending || !inviteEmail.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 transition disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar invitacion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
