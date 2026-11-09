'use client'

// PRES-1 — Selector de ficha de cliente para los ajustes del proyecto.
// Muestra la ficha elegida tal y como saldrá en la portada del presupuesto, para
// que se vea de un vistazo si falta el NIF o la dirección.

import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import type { Client } from '@/types'
import ClientFormDialog from './ClientFormDialog'

interface Props {
  value: string | null | undefined
  onChange: (clientId: string | null) => void
  /** client_name que ya tenía la obra, para precargar el alta. */
  fallbackName?: string | null
}

export default function ClientPicker({ value, onChange, fallbackName }: Props) {
  const { addToast } = useNotificationStore()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await api.get<Client[]>('/clients')
      setClients(resp.data)
    } catch {
      addToast('error', 'No se pudo cargar la lista de clientes')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { cargar() }, [cargar])

  const seleccionado = clients.find((c) => c.id === value) || null

  const alGuardar = (c: Client) => {
    setClients((prev) => {
      const resto = prev.filter((x) => x.id !== c.id)
      return [...resto, c].sort((a, b) => a.name.localeCompare(b.name))
    })
    onChange(c.id)
  }

  const inputClass = 'w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition'

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
        <div className="flex gap-2">
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputClass}
            disabled={loading}
          >
            <option value="">— Sin cliente asignado —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.tax_id ? ` · ${c.tax_id}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition flex items-center gap-1.5 text-sm font-medium whitespace-nowrap"
            title="Crear una ficha de cliente nueva"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Nuevo
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          La ficha se reutiliza en todas las obras de ese cliente.
        </p>
      </div>

      {seleccionado && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm text-gray-700 space-y-0.5">
              <p className="font-semibold text-gray-900">{seleccionado.legal_name || seleccionado.name}</p>
              {seleccionado.tax_id
                ? <p>NIF/CIF: {seleccionado.tax_id}</p>
                : <p className="text-amber-600">Sin NIF/CIF — no saldrá en el presupuesto</p>}
              {(seleccionado.address || seleccionado.city) ? (
                <p>
                  {[seleccionado.address, seleccionado.postal_code, seleccionado.city, seleccionado.province]
                    .filter(Boolean).join(', ')}
                </p>
              ) : (
                <p className="text-amber-600">Sin dirección fiscal</p>
              )}
              {seleccionado.contact_name && <p className="text-gray-500">Contacto: {seleccionado.contact_name}</p>}
            </div>
            <button
              type="button"
              onClick={() => { setEditing(seleccionado); setDialogOpen(true) }}
              className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-lg transition flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar ficha
            </button>
          </div>
        </div>
      )}

      <ClientFormDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        client={editing}
        initialName={editing ? undefined : (fallbackName || '')}
        onSaved={alGuardar}
      />
    </div>
  )
}
