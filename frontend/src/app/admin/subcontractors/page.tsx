'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSubcontractorsStore } from '@/stores/subcontractorsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import type { Subcontractor, SubcontractorDocument } from '@/types'
import {
  Search, Plus, Trash2, Edit3, Loader2, X, ChevronDown, ChevronRight,
  Phone, Mail, MapPin, Star, Shield, FileText, AlertTriangle, Calendar,
  CheckCircle, XCircle, Clock, HardHat,
} from 'lucide-react'

const DOC_TYPE_LABELS: Record<string, string> = {
  tc1: 'TC1',
  tc2: 'TC2',
  seguro_rc: 'Seguro RC',
  seguro_accidentes: 'Seguro Accidentes',
  plan_seguridad: 'Plan de Seguridad',
  evaluacion_riesgos: 'Evaluación de Riesgos',
  formacion_prl: 'Formación PRL',
  rea: 'REA',
  certificado_corriente_ss: 'Certificado SS',
  certificado_corriente_hacienda: 'Certificado Hacienda',
  libro_subcontratacion: 'Libro Subcontratación',
  contrato: 'Contrato',
  otro: 'Otro',
}

const DOC_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  valid: { label: 'Válido', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  expired: { label: 'Caducado', color: 'bg-red-100 text-red-700', icon: XCircle },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  rejected: { label: 'Rechazado', color: 'bg-gray-100 text-gray-600', icon: XCircle },
}

const SPECIALTIES = [
  'Albañilería', 'Estructura', 'Fontanería', 'Electricidad', 'Climatización',
  'Pintura', 'Carpintería', 'Cristalería', 'Impermeabilización', 'Excavación',
  'Ferralla', 'Soldadura', 'Telecomunicaciones', 'Seguridad', 'Limpieza', 'Otro',
]

export default function SubcontractorsPage() {
  const { addToast } = useNotificationStore()
  const {
    subcontractors, documents, loading, loadSubcontractors,
    loadSubcontractor, createSubcontractor, updateSubcontractor,
    deleteSubcontractor, addDocument, updateDocument, deleteDocument,
  } = useSubcontractorsStore()

  const [search, setSearch] = useState('')
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Subcontractor>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showDocModal, setShowDocModal] = useState(false)
  const [docForm, setDocForm] = useState<Partial<SubcontractorDocument>>({})

  useEffect(() => { loadSubcontractors() }, [])

  const filtered = useMemo(() => {
    let list = subcontractors
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(sc =>
        sc.name.toLowerCase().includes(s) ||
        (sc.tax_id && sc.tax_id.toLowerCase().includes(s)) ||
        (sc.specialty && sc.specialty.toLowerCase().includes(s))
      )
    }
    if (filterSpecialty) list = list.filter(sc => sc.specialty === filterSpecialty)
    return list
  }, [subcontractors, search, filterSpecialty])

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', tax_id: '', contact_name: '', phone: '', email: '', address: '', city: '', province: '', postal_code: '', specialty: '', rating: 0, is_active: true, notes: '' })
    setShowModal(true)
  }

  const openEdit = (sc: Subcontractor) => {
    setEditingId(sc.id)
    setForm({ ...sc })
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      if (!form.name?.trim()) { addToast('error', 'El nombre es obligatorio'); return }
      if (editingId) {
        await updateSubcontractor(editingId, form)
        addToast('success', 'Subcontratista actualizado')
      } else {
        await createSubcontractor(form)
        addToast('success', 'Subcontratista creado')
      }
      setShowModal(false)
      loadSubcontractors()
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name} y todos sus documentos?`)) return
    try {
      await deleteSubcontractor(id)
      addToast('success', 'Subcontratista eliminado')
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      await loadSubcontractor(id)
    }
  }

  const openAddDoc = () => {
    setDocForm({ doc_type: 'contrato', name: '', expiry_date: '', status: 'pending', notes: '' })
    setShowDocModal(true)
  }

  const handleSaveDoc = async () => {
    if (!expandedId) return
    try {
      if (!docForm.name?.trim() || !docForm.doc_type) { addToast('error', 'Nombre y tipo son obligatorios'); return }
      await addDocument(expandedId, docForm)
      addToast('success', 'Documento añadido')
      setShowDocModal(false)
      await loadSubcontractor(expandedId)
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('¿Eliminar este documento?')) return
    try {
      await deleteDocument(docId)
      addToast('success', 'Documento eliminado')
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  const handleToggleDocStatus = async (doc: SubcontractorDocument) => {
    const nextStatus = doc.status === 'valid' ? 'expired' : doc.status === 'pending' ? 'valid' : 'valid'
    try {
      await updateDocument(doc.id, { status: nextStatus })
      if (expandedId) await loadSubcontractor(expandedId)
    } catch (e: any) {
      addToast('error', e.message || 'Error')
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gray-50 -mx-6 px-6 pt-6 -mt-6 pb-4 lg:-mx-8 lg:px-8 lg:pt-8 lg:-mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subcontratistas</h1>
            <p className="text-gray-500 text-sm mt-1">Gestión de subcontratas y documentación PRL</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Buscar subcontratista..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select value={filterSpecialty} onChange={e => setFilterSpecialty(e.target.value)} className="text-sm border rounded-lg px-3 py-2">
          <option value="">Todas las especialidades</option>
          {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={openCreate} className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Añadir Subcontratista
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">Total activos</p>
          <p className="text-2xl font-bold text-gray-900">{subcontractors.filter(s => s.is_active).length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">Especialidades</p>
          <p className="text-2xl font-bold text-gray-900">{new Set(subcontractors.filter(s => s.specialty).map(s => s.specialty)).size}</p>
        </div>
        <div className="bg-white rounded-lg border p-4 flex items-center gap-2">
          <div>
            <p className="text-xs text-gray-500">Valoración media</p>
            <p className="text-2xl font-bold text-gray-900">
              {subcontractors.length > 0
                ? (subcontractors.reduce((s, sc) => s + sc.rating, 0) / subcontractors.length).toFixed(1)
                : '—'}
            </p>
          </div>
          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <HardHat className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay subcontratistas</p>
          <p className="text-sm mt-1">Añade subcontratas para gestionar su documentación PRL</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(sc => (
            <div key={sc.id} className="bg-white rounded-lg border overflow-hidden">
              {/* Row */}
              <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(sc.id)}>
                <button className="p-0.5">
                  {expandedId === sc.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{sc.name}</span>
                    {sc.tax_id && <span className="text-xs text-gray-400">{sc.tax_id}</span>}
                    {!sc.is_active && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">INACTIVO</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    {sc.specialty && <span>{sc.specialty}</span>}
                    {sc.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{sc.phone}</span>}
                    {sc.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{sc.email}</span>}
                    {sc.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{sc.city}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className={`w-3.5 h-3.5 ${i <= sc.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                  ))}
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(sc)} className="p-1.5 hover:bg-gray-100 rounded"><Edit3 className="w-4 h-4 text-gray-400" /></button>
                  <button onClick={() => handleDelete(sc.id, sc.name)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                </div>
              </div>

              {/* Expanded: PRL Documents */}
              {expandedId === sc.id && (
                <div className="border-t bg-gray-50 px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-orange-500" />
                      Documentación PRL
                    </h4>
                    <button onClick={openAddDoc} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                      <Plus className="w-3.5 h-3.5" /> Añadir documento
                    </button>
                  </div>

                  {documents.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Sin documentos registrados</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {documents.map(doc => {
                        const cfg = DOC_STATUS_CONFIG[doc.status]
                        const isExpiringSoon = doc.expiry_date && new Date(doc.expiry_date) <= new Date(Date.now() + 30 * 24 * 3600 * 1000) && doc.status === 'valid'
                        return (
                          <div key={doc.id} className={`bg-white rounded-lg border px-3 py-2.5 flex items-center gap-3 ${isExpiringSoon ? 'border-orange-300 bg-orange-50/50' : ''}`}>
                            <button onClick={() => handleToggleDocStatus(doc)} className="shrink-0" title={`Estado: ${cfg.label}`}>
                              <cfg.icon className={`w-5 h-5 ${cfg.color.includes('green') ? 'text-green-500' : cfg.color.includes('red') ? 'text-red-500' : cfg.color.includes('yellow') ? 'text-yellow-500' : 'text-gray-400'}`} />
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-800">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                                {isExpiringSoon && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
                              </div>
                              <p className="text-xs text-gray-500 truncate">{doc.name}</p>
                              {doc.expiry_date && (
                                <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                                  <Calendar className="w-3 h-3" />
                                  Caduca: {new Date(doc.expiry_date).toLocaleDateString('es-ES')}
                                </p>
                              )}
                            </div>
                            <button onClick={() => handleDeleteDoc(doc.id)} className="p-1 hover:bg-red-50 rounded shrink-0">
                              <Trash2 className="w-3.5 h-3.5 text-gray-300 hover:text-red-500" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Subcontractor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editingId ? 'Editar Subcontratista' : 'Nuevo Subcontratista'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / Razón social *</label>
                  <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CIF/NIF</label>
                  <input value={form.tax_id || ''} onChange={e => setForm({ ...form, tax_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Persona de contacto</label>
                  <input value={form.contact_name || ''} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Especialidad</label>
                  <select value={form.specialty || ''} onChange={e => setForm({ ...form, specialty: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Sin especialidad</option>
                    {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                  <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
                <input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ciudad</label>
                  <input value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Provincia</label>
                  <input value={form.province || ''} onChange={e => setForm({ ...form, province: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">C.P.</label>
                  <input value={form.postal_code || ''} onChange={e => setForm({ ...form, postal_code: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valoración</label>
                  <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <button key={i} type="button" onClick={() => setForm({ ...form, rating: i })}>
                        <Star className={`w-5 h-5 ${i <= (form.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                    <span className="text-sm text-gray-700">Activo</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingId ? 'Guardar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Document Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">Añadir Documento PRL</h3>
              <button onClick={() => setShowDocModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de documento *</label>
                <select value={docForm.doc_type || 'contrato'} onChange={e => setDocForm({ ...docForm, doc_type: e.target.value as SubcontractorDocument['doc_type'] })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / Descripción *</label>
                <input value={docForm.name || ''} onChange={e => setDocForm({ ...docForm, name: e.target.value })} placeholder="Ej: TC1 Marzo 2026" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de caducidad</label>
                  <input type="date" value={docForm.expiry_date || ''} onChange={e => setDocForm({ ...docForm, expiry_date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                  <select value={docForm.status || 'pending'} onChange={e => setDocForm({ ...docForm, status: e.target.value as SubcontractorDocument['status'] })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="pending">Pendiente</option>
                    <option value="valid">Válido</option>
                    <option value="expired">Caducado</option>
                    <option value="rejected">Rechazado</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea value={docForm.notes || ''} onChange={e => setDocForm({ ...docForm, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={() => setShowDocModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleSaveDoc} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Añadir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
