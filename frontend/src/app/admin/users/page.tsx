'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import {
  Users, Shield, ShieldOff, Trash2, Loader2,
  Search, UserCheck, UserX, Calendar, Building2, Mail,
  Brain, BrainCog, Zap, ArrowDownUp, DollarSign, RefreshCw,
} from 'lucide-react'
import api from '@/lib/api'

interface AppUser {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  is_active: boolean
  ai_enabled: boolean
  created_at: string
  organization_id: string | null
  organization_name: string | null
  role: string | null
  ai_calls: number
  ai_input_tokens: number
  ai_output_tokens: number
  ai_estimated_cost: number
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuthStore()
  const { addToast } = useNotificationStore()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [toggling, setToggling] = useState<string | null>(null)
  const [togglingAI, setTogglingAI] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const fetchUsers = async () => {
    try {
      const { data } = await api.get<AppUser[]>('/admin/users')
      setUsers(data)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        setForbidden(true)
      } else {
        addToast('error', 'Error al cargar usuarios')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const toggleActive = async (userId: string) => {
    setToggling(userId)
    try {
      const { data } = await api.put<{ id: string; is_active: boolean }>(`/admin/users/${userId}/toggle-active`)
      setUsers(prev => prev.map(u => u.id === data.id ? { ...u, is_active: data.is_active } : u))
      addToast('success', data.is_active ? 'Usuario activado' : 'Usuario desactivado')
    } catch {
      addToast('error', 'Error al cambiar estado del usuario')
    } finally {
      setToggling(null)
    }
  }

  const toggleAI = async (userId: string) => {
    setTogglingAI(userId)
    try {
      const { data } = await api.put<{ id: string; ai_enabled: boolean }>(`/admin/users/${userId}/toggle-ai`)
      setUsers(prev => prev.map(u => u.id === data.id ? { ...u, ai_enabled: data.ai_enabled } : u))
      addToast('success', data.ai_enabled ? 'IA activada para el usuario' : 'IA desactivada para el usuario')
    } catch {
      addToast('error', 'Error al cambiar acceso IA')
    } finally {
      setTogglingAI(null)
    }
  }

  const deleteUser = async (userId: string) => {
    setDeleting(userId)
    try {
      await api.delete(`/admin/users/${userId}`)
      setUsers(prev => prev.filter(u => u.id !== userId))
      addToast('success', 'Usuario eliminado')
      setConfirmDelete(null)
    } catch {
      addToast('error', 'Error al eliminar usuario')
    } finally {
      setDeleting(null)
    }
  }

  const filtered = users.filter(u => {
    const matchesSearch = !search ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.organization_name || '').toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' ||
      (filter === 'active' && u.is_active) ||
      (filter === 'inactive' && !u.is_active)
    return matchesSearch && matchesFilter
  })

  const activeCount = users.filter(u => u.is_active).length
  const inactiveCount = users.filter(u => !u.is_active).length

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-36 bg-gray-200 rounded-lg animate-pulse" />
          <div className="flex gap-3">
            <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-32 bg-blue-100 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="flex gap-3 mb-4">
          <div className="h-8 w-24 bg-blue-100 rounded-full animate-pulse" />
          <div className="h-8 w-24 bg-gray-100 rounded-full animate-pulse" />
          <div className="h-8 w-24 bg-gray-100 rounded-full animate-pulse" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-1" />
                <div className="h-3 w-44 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="h-5 w-16 bg-green-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
        <Shield className="w-12 h-12" />
        <p className="text-lg font-medium">Acceso restringido</p>
        <p className="text-sm">Solo el superadministrador puede gestionar usuarios</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Users className="w-7 h-7 text-blue-600" />
          Usuarios Registrados
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona todos los usuarios de la plataforma
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
              <p className="text-xs text-gray-500">Activos</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <UserX className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{inactiveCount}</p>
              <p className="text-xs text-gray-500">Inactivos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, email u organización..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Organización</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Registro</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Consumo IA</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">IA</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(u => {
              const isCurrentUser = u.id === currentUser?.id
              return (
                <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${!u.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {u.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {u.full_name}
                          {isCurrentUser && (
                            <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                              T&uacute;
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {u.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span className="truncate max-w-[180px]">{u.organization_name || 'Sin organización'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(u.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.ai_calls > 0 ? (
                      <div className="text-xs">
                        <p className="font-medium text-gray-900">{u.ai_calls} llamadas</p>
                        <p className="text-gray-500">{formatTokens(u.ai_input_tokens + u.ai_output_tokens)} tokens</p>
                        {u.ai_estimated_cost > 0 && (
                          <p className="text-amber-600 font-medium">${u.ai_estimated_cost.toFixed(4)}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => !isCurrentUser && toggleAI(u.id)}
                      disabled={isCurrentUser || togglingAI === u.id}
                      title={u.ai_enabled ? 'Desactivar IA' : 'Activar IA'}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer disabled:cursor-default ${
                        u.ai_enabled
                          ? 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                          : 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {togglingAI === u.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : u.ai_enabled ? (
                        <Brain className="w-3 h-3" />
                      ) : (
                        <BrainCog className="w-3 h-3" />
                      )}
                      {u.ai_enabled ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      u.is_active
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!isCurrentUser && (
                        <>
                          <button
                            onClick={() => toggleActive(u.id)}
                            disabled={toggling === u.id}
                            title={u.is_active ? 'Desactivar usuario' : 'Activar usuario'}
                            className={`p-2 rounded-lg transition-colors ${
                              u.is_active
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-green-600 hover:bg-green-50'
                            } disabled:opacity-50`}
                          >
                            {toggling === u.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : u.is_active ? (
                              <ShieldOff className="w-4 h-4" />
                            ) : (
                              <Shield className="w-4 h-4" />
                            )}
                          </button>

                          {confirmDelete === u.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteUser(u.id)}
                                disabled={deleting === u.id}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                              >
                                {deleting === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirmar'}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(u.id)}
                              title="Eliminar usuario"
                              className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No se encontraron usuarios
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Provider Credits */}
      <ProviderCreditsPanel />

      {/* Global AI Consumption */}
      <GlobalAIConsumption />
    </div>
  )
}

interface ProviderCredit {
  provider: string
  credit_type: string
  initial_amount: number
  currency: string
  tracked_consumption: number
  current_amount: number
}

function ProviderCreditsPanel() {
  const { addToast } = useNotificationStore()
  const [credits, setCredits] = useState<ProviderCredit[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const fetchCredits = () => {
    api.get<ProviderCredit[]>('/admin/provider-credits')
      .then(res => setCredits(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCredits() }, [])

  const saveCredit = async (provider: string) => {
    try {
      await api.put(`/admin/provider-credits/${provider}`, { initial_amount: parseFloat(editValue) })
      setEditing(null)
      fetchCredits()
      addToast('success', 'Saldo actualizado')
    } catch {
      addToast('error', 'Error al actualizar saldo')
    }
  }

  const providerLabels: Record<string, string> = { anthropic: 'Claude (Anthropic)', gemini: 'Gemini (Google)', groq: 'Groq (Llama)' }
  const providerColors: Record<string, string> = {
    anthropic: 'from-orange-500 to-amber-500',
    gemini: 'from-blue-500 to-cyan-500',
    groq: 'from-green-500 to-emerald-500',
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-600" />
        Saldo por Proveedor
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {credits.map(c => {
          const isCredit = c.credit_type === 'credit'
          const symbol = c.currency === 'EUR' ? '\u20AC' : '$'
          const isLow = isCredit && c.current_amount < 1

          return (
            <div key={c.provider} className="relative overflow-hidden rounded-xl border border-gray-200 p-4">
              <div className={`absolute inset-0 opacity-5 bg-gradient-to-br ${providerColors[c.provider] || 'from-gray-400 to-gray-500'}`} />
              <div className="relative">
                <p className="text-sm font-semibold text-gray-700">{providerLabels[c.provider] || c.provider}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isCredit ? 'Credito restante' : 'Coste acumulado'}
                  {' \u00B7 '}{c.currency}
                </p>

                <p className={`text-2xl font-bold mt-2 ${
                  isCredit
                    ? (isLow ? 'text-red-600' : 'text-green-700')
                    : 'text-gray-900'
                }`}>
                  {symbol}{Math.abs(c.current_amount).toFixed(2)}
                </p>

                {isLow && (
                  <p className="text-xs text-red-500 mt-1 font-medium">Saldo bajo - recarga pronto</p>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-400">
                    {isCredit ? 'Credito inicial' : 'Pre-tracking'}: {symbol}{parseFloat(String(c.initial_amount)).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-400">
                    Consumo tracking: {symbol}{c.tracked_consumption.toFixed(4)}
                  </div>
                </div>

                {editing === c.provider ? (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="number"
                      step="0.01"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      className="w-24 px-2 py-1 border rounded text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => saveCredit(c.provider)}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditing(c.provider); setEditValue(String(c.initial_amount)) }}
                    className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {isCredit ? 'Actualizar credito' : 'Resetear tras pago'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GlobalAIConsumption() {
  const [data, setData] = useState<{
    total_calls: number
    total_input_tokens: number
    total_output_tokens: number
    total_estimated_cost: number
    by_organization: { organization_id: string; organization_name: string; calls: number; input_tokens: number; output_tokens: number; estimated_cost: number; key_source: string }[]
    by_provider: { provider: string; calls: number; input_tokens: number; output_tokens: number; estimated_cost: number }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month')

  useEffect(() => {
    api.get(`/admin/ai-consumption?period=${period}`)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [period])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          Consumo IA Global
        </h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['week', 'month', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => { setLoading(true); setPeriod(p) }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p === 'week' ? '7 dias' : p === 'month' ? '30 dias' : 'Todo'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
      ) : !data || data.total_calls === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin consumo en este periodo</p>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-purple-700">{data.total_calls}</p>
              <p className="text-xs text-purple-500">Llamadas</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-blue-700">{formatTokens(data.total_input_tokens)}</p>
              <p className="text-xs text-blue-500">Tokens entrada</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-green-700">{formatTokens(data.total_output_tokens)}</p>
              <p className="text-xs text-green-500">Tokens salida</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-amber-700">${data.total_estimated_cost.toFixed(4)}</p>
              <p className="text-xs text-amber-500">Coste estimado</p>
            </div>
          </div>

          {/* By provider */}
          {data.by_provider.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" /> Por proveedor
              </h3>
              <div className="space-y-1.5">
                {data.by_provider.map(p => (
                  <div key={p.provider} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-gray-700 capitalize">{p.provider}</span>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{p.calls} llamadas</span>
                      <span>{formatTokens(p.input_tokens + p.output_tokens)} tokens</span>
                      {p.estimated_cost > 0 && <span className="text-amber-600 font-medium">${p.estimated_cost.toFixed(4)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By organization */}
          {data.by_organization.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <ArrowDownUp className="w-4 h-4 text-blue-500" /> Por organizacion
              </h3>
              <div className="space-y-1.5">
                {data.by_organization
                  .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens))
                  .map(o => (
                  <div key={o.organization_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">{o.organization_name}</span>
                      {o.key_source === 'master' && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">keys compartidas</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{o.calls} llamadas</span>
                      <span>{formatTokens(o.input_tokens + o.output_tokens)} tokens</span>
                      {o.estimated_cost > 0 && <span className="text-amber-600 font-medium">${o.estimated_cost.toFixed(4)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
