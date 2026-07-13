import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/supabase.js'
import { createNotification } from '../services/notificationService.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
router.use(authMiddleware)

const ATTACHMENT_KINDS = ['file', 'budget', 'certification', 'project_file', 'work_log', 'expense']

// Enriquece una lista de adjuntos con datos del recurso referenciado
async function enrichAttachments(attachments) {
  if (!attachments || attachments.length === 0) return []

  const grouped = { budget: [], certification: [], project_file: [], work_log: [], expense: [] }
  for (const a of attachments) {
    if (grouped[a.kind] && a.ref_id) grouped[a.kind].push(a.ref_id)
  }

  const fetchMap = async (kind, table, cols) => {
    if (grouped[kind].length === 0) return {}
    const { data } = await supabase.from(table).select(cols).in('id', grouped[kind])
    return Object.fromEntries((data || []).map(r => [r.id, r]))
  }

  const [budgets, certs, pfiles, wlogs, exps] = await Promise.all([
    fetchMap('budget', 'cons_budgets', 'id, name, project_id'),
    fetchMap('certification', 'cons_certifications', 'id, number, period_start, period_end, project_id'),
    fetchMap('project_file', 'cons_project_files', 'id, original_name, project_id, storage_path, file_type'),
    fetchMap('work_log', 'cons_work_logs', 'id, date, project_id, description'),
    fetchMap('expense', 'cons_project_expenses', 'id, concept, amount, date, project_id'),
  ])

  const maps = { budget: budgets, certification: certs, project_file: pfiles, work_log: wlogs, expense: exps }
  return attachments.map(a => ({
    ...a,
    resource: a.kind !== 'file' && a.ref_id ? maps[a.kind]?.[a.ref_id] || null : null,
  }))
}

// GET /api/mailbox/search-users?q= - Autocompletado de usuarios
router.get('/search-users', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim()
    if (q.length < 2) return res.json([])

    const { data: contacts } = await supabase
      .from('cons_mailbox_contacts')
      .select('contact_user_id')
      .eq('owner_user_id', req.user.id)

    const contactIds = (contacts || []).map(c => c.contact_user_id)

    const { data: users, error } = await supabase
      .from('cons_users')
      .select('id, email, full_name, avatar_url')
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
      .neq('id', req.user.id)
      .limit(10)

    if (error) throw error

    const sorted = (users || []).sort((a, b) => {
      const aIsContact = contactIds.includes(a.id) ? 0 : 1
      const bIsContact = contactIds.includes(b.id) ? 0 : 1
      return aIsContact - bIsContact
    }).map(u => ({
      ...u,
      is_contact: contactIds.includes(u.id),
    }))

    res.json(sorted)
  } catch (err) {
    next(err)
  }
})

// GET /api/mailbox/unread-count
router.get('/unread-count', async (req, res, next) => {
  try {
    const { count, error } = await supabase
      .from('cons_mailbox_messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', req.user.id)
      .eq('read', false)
      .is('deleted_at_to', null)
      .is('purged_at_to', null)

    if (error) throw error
    res.json({ count: count || 0 })
  } catch (err) {
    next(err)
  }
})

// GET /api/mailbox/contacts - Listar contactos guardados
router.get('/contacts', async (req, res, next) => {
  try {
    const { data: contacts, error } = await supabase
      .from('cons_mailbox_contacts')
      .select('id, contact_user_id, created_at')
      .eq('owner_user_id', req.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const userIds = contacts.map(c => c.contact_user_id)
    let userMap = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('cons_users')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds)
      userMap = Object.fromEntries((users || []).map(u => [u.id, u]))
    }

    res.json(contacts.map(c => ({
      ...c,
      user: userMap[c.contact_user_id] || null,
    })))
  } catch (err) {
    next(err)
  }
})

// POST /api/mailbox/contacts - Guardar contacto
router.post('/contacts', async (req, res, next) => {
  try {
    const { contact_user_id } = req.body
    if (!contact_user_id) return res.status(400).json({ error: 'contact_user_id requerido' })

    const { data, error } = await supabase
      .from('cons_mailbox_contacts')
      .upsert({
        owner_user_id: req.user.id,
        contact_user_id,
      }, { onConflict: 'owner_user_id,contact_user_id' })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/mailbox/contacts/:id - Eliminar contacto
router.delete('/contacts/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('cons_mailbox_contacts')
      .delete()
      .eq('id', req.params.id)
      .eq('owner_user_id', req.user.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/mailbox - Enviar mensaje (acepta multipart con adjuntos)
router.post('/', upload.array('files', 10), async (req, res, next) => {
  try {
    const { to_user_id, subject, body, budget_id, project_id } = req.body
    let references = []
    if (req.body.references) {
      try {
        references = typeof req.body.references === 'string' ? JSON.parse(req.body.references) : req.body.references
        if (!Array.isArray(references)) references = []
      } catch {
        references = []
      }
    }

    if (!to_user_id || !subject) {
      return res.status(400).json({ error: 'Destinatario y asunto requeridos' })
    }

    const { data: toMembership } = await supabase
      .from('cons_organization_members')
      .select('organization_id')
      .eq('user_id', to_user_id)
      .single()

    const { data: message, error } = await supabase
      .from('cons_mailbox_messages')
      .insert({
        from_user_id: req.user.id,
        from_organization_id: req.user.organization_id,
        to_user_id,
        to_organization_id: toMembership?.organization_id || null,
        subject,
        body: body || null,
        budget_id: budget_id || null,
        project_id: project_id || null,
      })
      .select()
      .single()

    if (error) throw error

    // Subir archivos físicos al storage
    const files = req.files || []
    const attachmentsToInsert = []

    for (const f of files) {
      const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase()
      const storedName = `${randomUUID()}.${ext}`
      const storagePath = `mailbox/${message.id}/${storedName}`

      const { error: upErr } = await supabase.storage
        .from('construgest-files')
        .upload(storagePath, f.buffer, { contentType: f.mimetype, upsert: false })

      if (!upErr) {
        attachmentsToInsert.push({
          message_id: message.id,
          kind: 'file',
          label: f.originalname,
          file_path: storagePath,
          file_size: f.size,
          mime_type: f.mimetype,
        })
      }
    }

    // Referencias internas: resolver project_id + copiar físicamente si es project_file
    const sharedAccessToInsert = []
    const projectIdsShared = new Set()

    const refGroups = { budget: [], certification: [], project_file: [], work_log: [], expense: [] }
    for (const ref of references) {
      if (!ref || !ref.kind || !ATTACHMENT_KINDS.includes(ref.kind) || !ref.ref_id || !ref.label) continue
      if (ref.kind === 'file') continue
      if (refGroups[ref.kind]) refGroups[ref.kind].push(ref)
    }

    const resolveBatch = async (kind, table, cols) => {
      if (refGroups[kind].length === 0) return {}
      const ids = refGroups[kind].map(r => r.ref_id)
      const { data } = await supabase.from(table).select(cols).in('id', ids)
      return Object.fromEntries((data || []).map(r => [r.id, r]))
    }

    const [budgetMap, certMap, fileMap, wlogMap, expMap] = await Promise.all([
      resolveBatch('budget', 'cons_budgets', 'id, project_id'),
      resolveBatch('certification', 'cons_certifications', 'id, project_id'),
      resolveBatch('project_file', 'cons_project_files', 'id, project_id, storage_path, original_name, file_type, file_size'),
      resolveBatch('work_log', 'cons_work_logs', 'id, project_id'),
      resolveBatch('expense', 'cons_project_expenses', 'id, project_id'),
    ])

    for (const ref of refGroups.budget) {
      const r = budgetMap[ref.ref_id]; if (!r) continue
      attachmentsToInsert.push({ message_id: message.id, kind: 'budget', ref_id: ref.ref_id, label: String(ref.label).slice(0, 300) })
      sharedAccessToInsert.push({ message_id: message.id, user_id: to_user_id, kind: 'budget', ref_id: ref.ref_id, project_id: r.project_id })
      if (r.project_id) projectIdsShared.add(r.project_id)
    }
    for (const ref of refGroups.certification) {
      const r = certMap[ref.ref_id]; if (!r) continue
      attachmentsToInsert.push({ message_id: message.id, kind: 'certification', ref_id: ref.ref_id, label: String(ref.label).slice(0, 300) })
      sharedAccessToInsert.push({ message_id: message.id, user_id: to_user_id, kind: 'certification', ref_id: ref.ref_id, project_id: r.project_id })
      if (r.project_id) projectIdsShared.add(r.project_id)
    }
    for (const ref of refGroups.work_log) {
      const r = wlogMap[ref.ref_id]; if (!r) continue
      attachmentsToInsert.push({ message_id: message.id, kind: 'work_log', ref_id: ref.ref_id, label: String(ref.label).slice(0, 300) })
      sharedAccessToInsert.push({ message_id: message.id, user_id: to_user_id, kind: 'work_log', ref_id: ref.ref_id, project_id: r.project_id })
      if (r.project_id) projectIdsShared.add(r.project_id)
    }
    for (const ref of refGroups.expense) {
      const r = expMap[ref.ref_id]; if (!r) continue
      attachmentsToInsert.push({ message_id: message.id, kind: 'expense', ref_id: ref.ref_id, label: String(ref.label).slice(0, 300) })
      sharedAccessToInsert.push({ message_id: message.id, user_id: to_user_id, kind: 'expense', ref_id: ref.ref_id, project_id: r.project_id })
      if (r.project_id) projectIdsShared.add(r.project_id)
    }

    // project_file: copia física al bucket de mailbox (el destinatario no necesita acceso al archivo original)
    for (const ref of refGroups.project_file) {
      const r = fileMap[ref.ref_id]; if (!r || !r.storage_path) continue
      try {
        const { data: dl, error: dlErr } = await supabase.storage.from('construgest-files').download(r.storage_path)
        if (dlErr || !dl) continue
        const buf = Buffer.from(await dl.arrayBuffer())
        const ext = (r.original_name || '').split('.').pop() || 'bin'
        const storedName = `${randomUUID()}.${ext.toLowerCase()}`
        const copiedPath = `mailbox/${message.id}/${storedName}`
        const { error: upErr } = await supabase.storage
          .from('construgest-files')
          .upload(copiedPath, buf, { contentType: r.file_type || 'application/octet-stream', upsert: false })
        if (upErr) continue
        attachmentsToInsert.push({
          message_id: message.id,
          kind: 'file',
          label: String(ref.label || r.original_name || 'archivo').slice(0, 300),
          file_path: copiedPath,
          file_size: r.file_size || buf.length,
          mime_type: r.file_type || 'application/octet-stream',
        })
      } catch (e) {
        console.error('[mailbox] copy project_file failed:', e.message)
      }
    }

    // Registrar acceso a proyectos (para que la navegación del destinatario no de 403 al cargar el proyecto padre)
    for (const pid of projectIdsShared) {
      sharedAccessToInsert.push({ message_id: message.id, user_id: to_user_id, kind: 'project', ref_id: pid, project_id: pid })
    }

    if (attachmentsToInsert.length > 0) {
      await supabase.from('cons_mailbox_attachments').insert(attachmentsToInsert)
    }
    if (sharedAccessToInsert.length > 0) {
      await supabase.from('cons_mailbox_shared_access').upsert(sharedAccessToInsert, {
        onConflict: 'user_id,kind,ref_id,message_id',
        ignoreDuplicates: true,
      })
    }

    const { data: sender } = await supabase
      .from('cons_users')
      .select('full_name')
      .eq('id', req.user.id)
      .single()

    await createNotification(
      to_user_id,
      'mailbox_message',
      'Nuevo mensaje',
      `${sender?.full_name || 'Alguien'}: ${subject}`,
      { message_id: message.id }
    )

    res.status(201).json(message)
  } catch (err) {
    next(err)
  }
})

// Helper para añadir attachments_count a listas de mensajes
async function withAttachmentsCount(messages) {
  if (!messages || messages.length === 0) return []
  const ids = messages.map(m => m.id)
  const { data: atts } = await supabase
    .from('cons_mailbox_attachments')
    .select('message_id')
    .in('message_id', ids)
  const counts = {}
  for (const a of atts || []) counts[a.message_id] = (counts[a.message_id] || 0) + 1
  return messages.map(m => ({ ...m, attachments_count: counts[m.id] || 0 }))
}

// GET /api/mailbox/inbox - Bandeja de entrada
router.get('/inbox', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_mailbox_messages')
      .select('*')
      .eq('to_user_id', req.user.id)
      .is('deleted_at_to', null)
      .is('purged_at_to', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    const senderIds = [...new Set(data.map(m => m.from_user_id))]
    let senderMap = {}
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from('cons_users')
        .select('id, full_name, email')
        .in('id', senderIds)
      senderMap = Object.fromEntries((senders || []).map(u => [u.id, u]))
    }

    const enriched = await withAttachmentsCount(data.map(m => ({
      ...m,
      from_user: senderMap[m.from_user_id] || null,
    })))
    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

// GET /api/mailbox/sent - Mensajes enviados
router.get('/sent', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('cons_mailbox_messages')
      .select('*')
      .eq('from_user_id', req.user.id)
      .is('deleted_at_from', null)
      .is('purged_at_from', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    const recipientIds = [...new Set(data.map(m => m.to_user_id))]
    let recipientMap = {}
    if (recipientIds.length > 0) {
      const { data: recipients } = await supabase
        .from('cons_users')
        .select('id, full_name, email')
        .in('id', recipientIds)
      recipientMap = Object.fromEntries((recipients || []).map(u => [u.id, u]))
    }

    const enriched = await withAttachmentsCount(data.map(m => ({
      ...m,
      to_user: recipientMap[m.to_user_id] || null,
    })))
    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

// GET /api/mailbox/trash - Papelera (mensajes soft-deleted por este usuario, en ambos lados)
router.get('/trash', async (req, res, next) => {
  try {
    const uid = req.user.id
    const { data, error } = await supabase
      .from('cons_mailbox_messages')
      .select('*')
      .or(
        `and(to_user_id.eq.${uid},deleted_at_to.not.is.null,purged_at_to.is.null),` +
        `and(from_user_id.eq.${uid},deleted_at_from.not.is.null,purged_at_from.is.null)`
      )
      .order('created_at', { ascending: false })

    if (error) throw error

    const userIds = [...new Set([...data.map(m => m.from_user_id), ...data.map(m => m.to_user_id)])]
    let userMap = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('cons_users')
        .select('id, full_name, email')
        .in('id', userIds)
      userMap = Object.fromEntries((users || []).map(u => [u.id, u]))
    }

    const enriched = await withAttachmentsCount(data.map(m => ({
      ...m,
      from_user: userMap[m.from_user_id] || null,
      to_user: userMap[m.to_user_id] || null,
      // Útil para el frontend: saber qué lado del mensaje es "tuyo"
      side: m.from_user_id === uid ? 'sent' : 'inbox',
      trashed_at: m.from_user_id === uid ? m.deleted_at_from : m.deleted_at_to,
    })))
    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

// GET /api/mailbox/attachments/:id/download - Signed URL del adjunto de archivo
router.get('/attachments/:id/download', async (req, res, next) => {
  try {
    const { data: att, error } = await supabase
      .from('cons_mailbox_attachments')
      .select('id, kind, file_path, label, message_id')
      .eq('id', req.params.id)
      .single()

    if (error || !att || att.kind !== 'file' || !att.file_path) {
      return res.status(404).json({ error: 'Adjunto no encontrado' })
    }

    const { data: msg } = await supabase
      .from('cons_mailbox_messages')
      .select('from_user_id, to_user_id')
      .eq('id', att.message_id)
      .single()

    if (!msg || (msg.from_user_id !== req.user.id && msg.to_user_id !== req.user.id)) {
      return res.status(403).json({ error: 'Sin acceso' })
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('construgest-files')
      .createSignedUrl(att.file_path, 300, { download: att.label })

    if (signErr || !signed) return res.status(500).json({ error: 'No se pudo generar URL' })
    res.json({ url: signed.signedUrl })
  } catch (err) {
    next(err)
  }
})

// GET /api/mailbox/:id - Ver mensaje (marca como leido)
router.get('/:id', async (req, res, next) => {
  try {
    const { data: message, error } = await supabase
      .from('cons_mailbox_messages')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error || !message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' })
    }

    if (message.from_user_id !== req.user.id && message.to_user_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a este mensaje' })
    }

    if (message.to_user_id === req.user.id && !message.read) {
      await supabase
        .from('cons_mailbox_messages')
        .update({ read: true })
        .eq('id', message.id)
      message.read = true

      // Marcar notificación vinculada como leída
      await supabase
        .from('cons_notifications')
        .update({ read: true })
        .eq('user_id', req.user.id)
        .eq('type', 'mailbox_message')
        .eq('data->>message_id', message.id)
    }

    const userIds = [message.from_user_id, message.to_user_id]
    const { data: users } = await supabase
      .from('cons_users')
      .select('id, full_name, email')
      .in('id', userIds)
    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]))

    const { data: rawAtts } = await supabase
      .from('cons_mailbox_attachments')
      .select('id, kind, ref_id, label, file_path, file_size, mime_type, created_at')
      .eq('message_id', message.id)
      .order('created_at', { ascending: true })

    const attachments = await enrichAttachments(rawAtts || [])

    res.json({
      ...message,
      from_user: userMap[message.from_user_id] || null,
      to_user: userMap[message.to_user_id] || null,
      attachments,
    })
  } catch (err) {
    next(err)
  }
})

// Helper: carga el mensaje y verifica que el usuario es emisor o receptor.
// Devuelve { message, side } donde side es 'from' o 'to', o null si no hay acceso.
async function loadMessageForUser(messageId, userId) {
  const { data: message } = await supabase
    .from('cons_mailbox_messages')
    .select('id, from_user_id, to_user_id, deleted_at_from, deleted_at_to, purged_at_from, purged_at_to')
    .eq('id', messageId)
    .single()

  if (!message) return { message: null, side: null }
  if (message.from_user_id === userId) return { message, side: 'from' }
  if (message.to_user_id === userId) return { message, side: 'to' }
  return { message: null, side: null }
}

// Helper: hard delete físico de la fila + archivos del storage.
async function hardDeleteMessage(messageId) {
  const { data: atts } = await supabase
    .from('cons_mailbox_attachments')
    .select('file_path')
    .eq('message_id', messageId)
    .eq('kind', 'file')

  const paths = (atts || []).map(a => a.file_path).filter(Boolean)
  if (paths.length > 0) {
    await supabase.storage.from('construgest-files').remove(paths)
  }
  await supabase.from('cons_mailbox_messages').delete().eq('id', messageId)
}

// DELETE /api/mailbox/:id - Mover a papelera (soft delete en el lado del usuario)
router.delete('/:id', async (req, res, next) => {
  try {
    const { message, side } = await loadMessageForUser(req.params.id, req.user.id)
    if (!message) return res.status(404).json({ error: 'Mensaje no encontrado' })

    const patch = side === 'from'
      ? { deleted_at_from: new Date().toISOString() }
      : { deleted_at_to: new Date().toISOString() }

    const { error } = await supabase
      .from('cons_mailbox_messages')
      .update(patch)
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true, trashed: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/mailbox/:id/restore - Sacar de papelera
router.post('/:id/restore', async (req, res, next) => {
  try {
    const { message, side } = await loadMessageForUser(req.params.id, req.user.id)
    if (!message) return res.status(404).json({ error: 'Mensaje no encontrado' })

    const patch = side === 'from'
      ? { deleted_at_from: null, purged_at_from: null }
      : { deleted_at_to: null, purged_at_to: null }

    const { error } = await supabase
      .from('cons_mailbox_messages')
      .update(patch)
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/mailbox/:id/permanent - Eliminar definitivamente de tu lado.
// Si el otro lado ya purgó (o nunca tuvo acceso efectivo), se hace hard delete fisico.
router.delete('/:id/permanent', async (req, res, next) => {
  try {
    const { message, side } = await loadMessageForUser(req.params.id, req.user.id)
    if (!message) return res.status(404).json({ error: 'Mensaje no encontrado' })

    const now = new Date().toISOString()
    const mySide = side === 'from'
      ? { deleted_at_from: message.deleted_at_from || now, purged_at_from: now }
      : { deleted_at_to: message.deleted_at_to || now, purged_at_to: now }

    // ¿El otro lado ya estaba purgado?
    const otherPurged = side === 'from' ? message.purged_at_to : message.purged_at_from
    if (otherPurged) {
      await hardDeleteMessage(req.params.id)
      return res.json({ success: true, hardDeleted: true })
    }

    const { error } = await supabase
      .from('cons_mailbox_messages')
      .update(mySide)
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true, hardDeleted: false })
  } catch (err) {
    next(err)
  }
})

export default router
