'use client'

// PRES-1 — Alta/edición de una ficha de cliente.
// Vive en su propio fichero (regla nº3: una pantalla/diálogo por fichero) y lo
// usan tanto la pantalla de Clientes como el selector de los ajustes del proyecto.

import { useEffect, useState } from 'react'
import { X, Loader2, Save } from 'lucide-react'
import api from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import type { Client } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Ficha a editar; sin ella, el diálogo crea una nueva. */
  client?: Client | null
  /** Nombre con el que precargar el alta (p.ej. el client_name que ya tenía la obra). */
  initialName?: string
  onSaved: (client: Client) => void
}

const VACIO = {
  name: '', legal_name: '', tax_id: '', contact_name: '', phone: '', email: '',
  address: '', postal_code: '', city: '', province: '', country: 'ES', notes: '',
}

export default function ClientFormDialog({ isOpen, onClose, client, initialName, onSaved }: Props) {
  const { addToast } = useNotificationStore()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...VACIO })

  useEffect(() => {
    if (!isOpen) return
    if (client) {
      setForm({
        name: client.name || '',
        legal_name: client.legal_name || '',
        tax_id: client.tax_id || '',
        contact_name: client.contact_name || '',
        phone: client.phone || '',
        email: client.email || '',
        address: client.address || '',
        postal_code: client.postal_code || '',
        city: client.city || '',
        province: client.province || '',
        country: client.country || 'ES',
        notes: client.notes || '',
      })
    } else {
      setForm({ ...VACIO, name: initialName || '' })
    }
  }, [isOpen, client, initialName])

  if (!isOpen) return null

  const guardar = async () => {
    if (!form.name.trim()) {
      addToast('error', 'El nombre del cliente es obligatorio')
      return
    }
    setSaving(true)
    try {
      const resp = client
        ? await api.put<Client>(`/clients/${client.id}`, form)
        : await api.post<Client>('/clients', form)
      addToast('success', client ? 'Ficha actualizada' : 'Cliente creado')
      onSaved(resp.data)
      onClose()
    } catch (e) {
      const r = e as { response?: { data?: { error?: string } }; message?: string }
      addToast('error', `No se pudo guardar: ${r?.response?.data?.error || r?.message || 'error desconocido'}`)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm'
  const campo = (label: string, key: keyof typeof form, placeholder = '', type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={inputClass}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {client ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Estos datos salen en la portada del presupuesto
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              placeholder="COMUNIDAD DE PROPIETARIOS EDIFICIO X"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Como lo llamas tú; es el que se ve en las listas.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {campo('Razón social', 'legal_name', 'Si es distinta del nombre')}
            {campo('NIF / CIF', 'tax_id', 'H19544071')}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Dirección fiscal</h3>
            <div className="space-y-3">
              {campo('Dirección', 'address', 'C/ Omeya 14')}
              <div className="grid grid-cols-3 gap-3">
                {campo('C.P.', 'postal_code', '18006')}
                {campo('Ciudad', 'city', 'Granada')}
                {campo('Provincia', 'province', 'Granada')}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Contacto</h3>
            <div className="grid grid-cols-3 gap-3">
              {campo('Persona de contacto', 'contact_name', 'Presidente, administrador…')}
              {campo('Teléfono', 'phone', '600 123 456')}
              {campo('Email', 'email', 'cliente@email.com', 'email')}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas internas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="No salen en el presupuesto"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {client ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
