'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import {
  Brain, Users, Zap, DollarSign, Search, TrendingUp,
  ToggleLeft, ToggleRight, ChevronDown,
} from 'lucide-react'

// ── Types ──
interface MCPUser {
  user_id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: string
  app: string
  ai_enabled: boolean
  created_at: string
  org_id: string | null
  org_name: string | null
  source_app: string
  ai_calls: number
  ai_input_tokens: number
  ai_output_tokens: number
  ai_cost: number
  user_quotas: UserQuota[]
}

interface UserQuota {
  app_id: string
  user_id: string
  quota_type: string
  max_calls: number | null
  enabled: boolean
}

interface ConsumptionSummary {
  totals: Array<{
    app_id: string
    total_calls: number
    total_input_tokens: number
    total_output_tokens: number
    total_cost: number
  }>
  byProvider: Array<{
    app_id: string
    provider: string
    calls: number
    input_tokens: number
    output_tokens: number
    cost: number
  }>
}

interface ProviderCredit {
  provider: string
  initial_amount: number
  credit_type: string
  consumed: number
  remaining: number
}

interface DailyTrend {
  app_id: string
  date: string
  calls: number
  input_tokens: number
  output_tokens: number
  cost: number
}

// ── Helpers ──
function formatTokens(n: number | string | null | undefined): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return String(v)
}

function formatCost(n: number | string | null | undefined): string {
  return '$' + (Number(n) || 0).toFixed(4)
}

// ── Component ──
export default function MCPPage() {
  const { isSuperAdmin } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'users' | 'consumption' | 'credits'>('users')
  const [users, setUsers] = useState<MCPUser[]>([])
  const [search, setSearch] = useState('')
  const [appFilter, setAppFilter] = useState('all')
  const [consumption, setConsumption] = useState<ConsumptionSummary | null>(null)
  const [credits, setCredits] = useState<ProviderCredit[]>([])
  const [trend, setTrend] = useState<DailyTrend[]>([])
  const [period, setPeriod] = useState('month')
  const [selectedUser, setSelectedUser] = useState<MCPUser | null>(null)
  const [quotaForm, setQuotaForm] = useState({ maxCalls: '', quotaType: 'daily', targetAppId: 'construgest' })
  const [editingCredit, setEditingCredit] = useState<string | null>(null)
  const [creditEditValue, setCreditEditValue] = useState('')

  const loadUsers = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (appFilter !== 'all') params.app = appFilter
      if (search) params.search = search
      const { data } = await api.get('/admin/mcp/users', { params })
      setUsers(data || [])
    } catch { /* silent */ }
  }, [appFilter, search])

  const loadConsumption = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/mcp/consumption', {
        params: { period, app_id: appFilter !== 'all' ? appFilter : undefined },
      })
      setConsumption(data)
    } catch { /* silent */ }
  }, [period, appFilter])

  const loadCredits = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/mcp/provider-credits')
      setCredits(data || [])
    } catch { /* silent */ }
  }, [])

  const loadTrend = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/mcp/trend', {
        params: { days: 30, app_id: appFilter !== 'all' ? appFilter : undefined },
      })
      setTrend(data || [])
    } catch { /* silent */ }
  }, [appFilter])

  useEffect(() => {
    Promise.all([loadUsers(), loadConsumption(), loadCredits(), loadTrend()])
      .finally(() => setLoading(false))
  }, [loadUsers, loadConsumption, loadCredits, loadTrend])

  async function toggleAI(u: MCPUser) {
    try {
      await api.put(`/admin/mcp/users/${u.user_id}/toggle-ai`, {
        sourceApp: u.source_app,
        enabled: !u.ai_enabled,
      })
      loadUsers()
    } catch { /* silent */ }
  }

  async function updateApp(u: MCPUser, newApp: string) {
    try {
      await api.put(`/admin/mcp/users/${u.user_id}/app`, {
        sourceApp: u.source_app,
        app: newApp,
      })
      loadUsers()
    } catch { /* silent */ }
  }

  async function saveCredit(provider: string) {
    try {
      await api.put('/admin/mcp/provider-credits', {
        provider,
        initialAmount: parseFloat(creditEditValue) || 0,
        creditType: 'credit',
      })
      setEditingCredit(null)
      loadCredits()
    } catch { /* silent */ }
  }

  async function saveUserQuota() {
    if (!selectedUser) return
    try {
      await api.put(`/admin/mcp/users/${selectedUser.user_id}/quotas`, {
        targetAppId: quotaForm.targetAppId,
        quotaType: quotaForm.quotaType,
        maxCalls: quotaForm.maxCalls ? parseInt(quotaForm.maxCalls) : null,
        enabled: true,
      })
      setSelectedUser(null)
      loadUsers()
    } catch { /* silent */ }
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-slate-500">Acceso denegado</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 w-full bg-slate-200 rounded animate-pulse" />
      </div>
    )
  }

  const totalCalls = consumption?.totals?.reduce((s, t) => s + Number(t.total_calls), 0) || 0
  const totalCost = consumption?.totals?.reduce((s, t) => s + Number(t.total_cost), 0) || 0
  const totalTokens = consumption?.totals?.reduce((s, t) => s + Number(t.total_input_tokens) + Number(t.total_output_tokens), 0) || 0
  const usersApp180 = users.filter(u => u.source_app === 'app180').length
  const usersConst = users.filter(u => u.source_app === 'construgest').length

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Brain className="w-6 h-6 text-purple-600" />
          Control IA Centralizado (MCP)
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Gestiona usuarios, consumo y cuotas de IA en app180 y construgest
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Users className="w-3.5 h-3.5" /> Usuarios
          </div>
          <p className="text-2xl font-bold text-slate-900">{users.length}</p>
          <p className="text-xs text-slate-400">app180: {usersApp180} | construgest: {usersConst}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-purple-500 text-xs mb-1">
            <Zap className="w-3.5 h-3.5" /> Llamadas
          </div>
          <p className="text-2xl font-bold text-purple-600">{totalCalls}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-blue-500 text-xs mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> Tokens
          </div>
          <p className="text-2xl font-bold text-blue-600">{formatTokens(totalTokens)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-amber-500 text-xs mb-1">
            <DollarSign className="w-3.5 h-3.5" /> Costo
          </div>
          <p className="text-2xl font-bold text-amber-600">{formatCost(totalCost)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          { key: 'users' as const, label: 'Usuarios' },
          { key: 'consumption' as const, label: 'Consumo' },
          { key: 'credits' as const, label: 'Creditos' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-lg transition-all ${
              tab === t.key
                ? 'bg-white text-slate-900 font-medium shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Usuarios ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                placeholder="Buscar por email o nombre..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="relative">
              <select
                value={appFilter}
                onChange={e => setAppFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas las apps</option>
                <option value="app180">app180</option>
                <option value="construgest">construgest</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-slate-600">Usuario</th>
                    <th className="text-left p-3 font-medium text-slate-600 hidden lg:table-cell">Org</th>
                    <th className="text-center p-3 font-medium text-slate-600">App</th>
                    <th className="text-right p-3 font-medium text-slate-600">Consumo IA</th>
                    <th className="text-center p-3 font-medium text-slate-600">IA</th>
                    <th className="text-center p-3 font-medium text-slate-600">Cuota</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map(u => {
                    const dailyQuota = u.user_quotas?.find(q => q.quota_type === 'daily' && q.app_id === u.source_app)
                    return (
                      <tr key={`${u.user_id}-${u.source_app}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                {(u.full_name || u.email || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">{u.full_name || 'Sin nombre'}</p>
                              <p className="text-xs text-slate-400 truncate">{u.email}</p>
                            </div>
                            <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              u.source_app === 'app180'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {u.source_app}
                            </span>
                          </div>
                        </td>

                        <td className="p-3 hidden lg:table-cell">
                          <span className="text-xs text-slate-500">{u.org_name || '-'}</span>
                        </td>

                        <td className="p-3 text-center">
                          <select
                            value={u.app || u.source_app}
                            onChange={e => updateApp(u, e.target.value)}
                            className="text-xs border rounded px-2 py-1 bg-white"
                          >
                            <option value="app180">app180</option>
                            <option value="construgest">construgest</option>
                            <option value="ambas">ambas</option>
                          </select>
                        </td>

                        <td className="p-3 text-right">
                          <div className="text-xs space-y-0.5">
                            <p><span className="text-purple-600 font-semibold">{u.ai_calls}</span> calls</p>
                            <p><span className="text-blue-600">{formatTokens(u.ai_input_tokens + u.ai_output_tokens)}</span> tok</p>
                            {u.ai_cost > 0 && <p className="text-amber-600 font-medium">{formatCost(u.ai_cost)}</p>}
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <button onClick={() => toggleAI(u)} className="transition-colors">
                            {u.ai_enabled ? (
                              <ToggleRight className="w-6 h-6 text-green-500" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-slate-300" />
                            )}
                          </button>
                        </td>

                        <td className="p-3 text-center">
                          {dailyQuota ? (
                            <button
                              onClick={() => {
                                setSelectedUser(u)
                                setQuotaForm({ maxCalls: String(dailyQuota.max_calls || ''), quotaType: 'daily', targetAppId: u.source_app })
                              }}
                              className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium hover:bg-purple-200 transition-colors"
                            >
                              {dailyQuota.max_calls}/dia
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedUser(u)
                                setQuotaForm({ maxCalls: '', quotaType: 'daily', targetAppId: u.source_app })
                              }}
                              className="text-xs text-slate-400 hover:text-blue-600 transition-colors"
                            >
                              + cuota
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">No se encontraron usuarios</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quota Modal */}
          {selectedUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
                <h3 className="font-semibold text-slate-900">
                  Cuota para {selectedUser.full_name || selectedUser.email}
                </h3>
                <p className="text-xs text-slate-500">
                  App: {selectedUser.source_app} | Org: {selectedUser.org_name || '-'}
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Tipo</label>
                    <select
                      value={quotaForm.quotaType}
                      onChange={e => setQuotaForm({ ...quotaForm, quotaType: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="daily">Diaria</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">App destino</label>
                    <select
                      value={quotaForm.targetAppId}
                      onChange={e => setQuotaForm({ ...quotaForm, targetAppId: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="app180">app180</option>
                      <option value="construgest">construgest</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Max llamadas ({quotaForm.quotaType === 'daily' ? 'por dia' : 'por mes'})
                    </label>
                    <input
                      type="number"
                      value={quotaForm.maxCalls}
                      onChange={e => setQuotaForm({ ...quotaForm, maxCalls: e.target.value })}
                      placeholder="Sin limite"
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-slate-400 mt-1">Vacio = usa cuota de org</p>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="px-4 py-2 text-sm rounded-lg border hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveUserQuota}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Consumo ── */}
      {tab === 'consumption' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
            {[
              { value: 'day', label: 'Hoy' },
              { value: 'month', label: 'Este mes' },
              { value: 'all', label: 'Todo' },
            ].map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  period === p.value ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-500'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* By App */}
          <div className="grid sm:grid-cols-2 gap-4">
            {consumption?.totals?.map(t => (
              <div key={t.app_id} className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                    t.app_id === 'app180' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {t.app_id}
                  </span>
                  <span className="text-sm font-bold text-amber-600">{formatCost(Number(t.total_cost))}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xl font-bold text-purple-600">{Number(t.total_calls)}</p>
                    <p className="text-xs text-slate-400">Llamadas</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-blue-600">{formatTokens(Number(t.total_input_tokens))}</p>
                    <p className="text-xs text-slate-400">Input</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-green-600">{formatTokens(Number(t.total_output_tokens))}</p>
                    <p className="text-xs text-slate-400">Output</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* By Provider */}
          {consumption?.byProvider && consumption.byProvider.length > 0 && (
            <div className="bg-white rounded-xl border p-5 shadow-sm space-y-3">
              <h3 className="font-semibold text-slate-900">Por Proveedor</h3>
              {consumption.byProvider.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      p.app_id === 'app180' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>{p.app_id}</span>
                    <span className="font-medium text-slate-700 capitalize">{p.provider}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-purple-600">{p.calls} calls</span>
                    <span className="text-blue-600">{formatTokens(p.input_tokens + p.output_tokens)} tok</span>
                    <span className="text-amber-600 font-semibold">{formatCost(p.cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Trend */}
          {trend.length > 0 && (
            <div className="bg-white rounded-xl border p-5 shadow-sm space-y-3">
              <h3 className="font-semibold text-slate-900">Ultimos 30 dias</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-left p-2">App</th>
                      <th className="text-right p-2">Llamadas</th>
                      <th className="text-right p-2">Tokens</th>
                      <th className="text-right p-2">Costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {trend.slice(0, 30).map((t, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-600">{t.date}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            t.app_id === 'app180' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>{t.app_id}</span>
                        </td>
                        <td className="p-2 text-right text-purple-600">{t.calls}</td>
                        <td className="p-2 text-right text-blue-600">{formatTokens(t.input_tokens + t.output_tokens)}</td>
                        <td className="p-2 text-right text-amber-600">{formatCost(t.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Creditos ── */}
      {tab === 'credits' && (
        <div className="grid sm:grid-cols-3 gap-4">
          {credits.map(c => {
            const pct = c.initial_amount > 0 ? Math.max(0, Math.round((c.remaining / c.initial_amount) * 100)) : 0
            const isLow = pct < 20
            return (
              <div key={c.provider} className="bg-white rounded-xl border p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 capitalize">{c.provider}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.credit_type === 'credit' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  }`}>{c.credit_type}</span>
                </div>

                <div className="text-center py-3">
                  <p className={`text-3xl font-bold ${isLow ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCost(c.remaining)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">restante</p>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${isLow ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-slate-400">
                  <span>Inicial: {formatCost(c.initial_amount)}</span>
                  <span>Usado: {formatCost(c.consumed)}</span>
                </div>

                {editingCredit === c.provider ? (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <input
                      type="number"
                      step="0.01"
                      value={creditEditValue}
                      onChange={e => setCreditEditValue(e.target.value)}
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
                      onClick={() => setEditingCredit(null)}
                      className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingCredit(c.provider); setCreditEditValue(String(c.initial_amount)) }}
                    className="text-xs text-blue-500 hover:text-blue-700 pt-2 border-t border-slate-100"
                  >
                    {c.credit_type === 'credit' ? 'Actualizar credito' : 'Resetear tras pago'}
                  </button>
                )}
              </div>
            )
          })}
          {credits.length === 0 && (
            <p className="text-slate-400 text-sm col-span-3 text-center py-12">
              No hay creditos de proveedores configurados
            </p>
          )}
        </div>
      )}
    </div>
  )
}
