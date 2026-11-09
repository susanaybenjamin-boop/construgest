'use client'

// PRES-1 — Pantalla de Clientes: la ficha que se reutiliza en cada obra y que
// alimenta la portada del presupuesto. El formulario vive en su propio
// componente (ClientFormDialog), igual que el selector del proyecto.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Search, Loader2, Users, Archive, RotateCcw } from 'lucide-react'
import api from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import type { Client } from '@/types'
import ClientFormDialog from '@/components/clients/ClientFormDialog'

export default function ClientsPage() {
  const { addToast } = useNotificationStore()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await api.get<Client[]>(`/clients${verInactivos ? '?all=true' : ''}`)
      setClients(resp.data)
    } catch (e) {
      const r = e as { response?: { data?: { error?: string } }; message?: string }
      addToast('error', `No se pudieron cargar los clientes: ${r?.response?.data?.error || r?.message || 'error'}`)
    } finally {
      setLoading(false)
    }
  }, [addToast, verInactivos])

  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => [c.name, c.legal_name, c.tax_id, c.city, c.contact_name]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
  }, [clients, query])

  const alGuardar = () => { cargar() }

  const darDeBaja = async (c: Client) => {
    try {
      await api.delete(`/clients/${c.id}`)
      addToast('success', `${c.name} dado de baja`)
      cargar()
    } catch (e) {
      const r = e as { response?: { data?: { error?: string } }; message?: string }
      addToast('error', `No se pudo dar de baja: ${r?.response?.data?.error || r?.message || 'error'}`)
    }
  }

  const reactivar = async (c: Client) => {
    try {
      await api.put(`/clients/${c.id}`, { is_active: true })
      addToast('success', `${c.name} reactivado`)
      cargar()
    } catch (e) {
      const r = e as { response?: { data?: { error?: string } }; message?: string }
      addToast('error', `No se pudo reactivar: ${r?.response?.data?.error || r?.message || 'error'}`)
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
            <p className="text-sm text-gray-500 mt-1">
              La ficha se reutiliza en cada obra y sale en la portada del presupuesto
            </p>
          </div>
          <button
            onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl transition shadow-sm font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo cliente
          </button>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, NIF, ciudad o contacto…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
              className="rounded border-gray-300"
            />
            Ver dados de baja
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando clientes…
          </div>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Users className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700">
              {query ? 'Ningún cliente coincide con la búsqueda' : 'Todavía no hay clientes'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {query
                ? 'Prueba con otro texto.'
                : 'Crea una ficha y asígnala a la obra desde Ajustes del proyecto.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">NIF / CIF</th>
                <th className="text-left px-4 py-3">Dirección fiscal</th>
                <th className="text-left px-4 py-3">Contacto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.map((c) => (
                <tr key={c.id} className={`hover:bg-gray-50 ${c.is_active ? '' : 'opacity-60'}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.legal_name && <p className="text-xs text-gray-500">{c.legal_name}</p>}
                    {!c.is_active && <span className="text-xs text-gray-400">dado de baja</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.tax_id || <span className="text-amber-600">falta</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {[c.address, c.postal_code, c.city, c.province].filter(Boolean).join(', ')
                      || <span className="text-amber-600">falta</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {[c.contact_name, c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditing(c); setDialogOpen(true) }}
                        className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-lg transition flex items-center gap-1.5 text-xs font-medium"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </button>
                      {c.is_active ? (
                        <button
                          onClick={() => darDeBaja(c)}
                          className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-600 rounded-lg transition flex items-center gap-1.5 text-xs font-medium"
                          title="Deja de aparecer en el selector. Las obras que la usan no se tocan."
                        >
                          <Archive className="w-3.5 h-3.5" />
                          Dar de baja
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivar(c)}
                          className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-600 rounded-lg transition flex items-center gap-1.5 text-xs font-medium"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ClientFormDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        client={editing}
        onSaved={alGuardar}
      />
    </div>
  )
}
