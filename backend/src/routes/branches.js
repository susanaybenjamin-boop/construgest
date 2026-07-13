import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.js'
import supabase from '../db/supabase.js'
import { createNotification } from '../services/notificationService.js'
import {
  notifyBranchesChange,
  notifyBranchesChangeBoth,
  notifyProjectsChange,
} from '../services/realtimeBroadcast.js'

const router = Router()
router.use(authMiddleware)

// POST /api/branches/invite - Enviar invitacion
router.post('/invite', async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email requerido' })

    const myOrgId = req.user.organization_id

    // Buscar usuario destino
    const { data: targetUser } = await supabase
      .from('cons_users')
      .select('id, email, full_name')
      .eq('email', email.toLowerCase().trim())
      .single()

    // Buscar org del usuario destino
    let toUserId = targetUser?.id || null
    let toOrgId = null
    if (targetUser) {
      const { data: membership } = await supabase
        .from('cons_organization_members')
        .select('organization_id')
        .eq('user_id', targetUser.id)
        .single()
      toOrgId = membership?.organization_id || null

      // No puede invitarse a si mismo
      if (toOrgId === myOrgId) {
        return res.status(400).json({ error: 'No puedes invitar a tu propia organizacion' })
      }

      // Verificar si ya existe link activo
      const orgA = myOrgId < toOrgId ? myOrgId : toOrgId
      const orgB = myOrgId < toOrgId ? toOrgId : myOrgId
      const { data: existingLink } = await supabase
        .from('cons_branch_links')
        .select('id')
        .eq('organization_a_id', orgA)
        .eq('organization_b_id', orgB)
        .single()

      if (existingLink) {
        return res.status(400).json({ error: 'Ya existe una vinculacion con esta organizacion' })
      }
    }

    // Verificar invitacion pendiente duplicada
    const { data: existingInvite } = await supabase
      .from('cons_branch_invitations')
      .select('id')
      .eq('from_organization_id', myOrgId)
      .eq('to_email', email.toLowerCase().trim())
      .eq('status', 'pending')
      .single()

    if (existingInvite) {
      return res.status(400).json({ error: 'Ya existe una invitacion pendiente para este email' })
    }

    // Crear invitacion
    const { data: invitation, error } = await supabase
      .from('cons_branch_invitations')
      .insert({
        from_organization_id: myOrgId,
        from_user_id: req.user.id,
        to_email: email.toLowerCase().trim(),
        to_user_id: toUserId,
        to_organization_id: toOrgId,
      })
      .select()
      .single()

    if (error) throw error

    // Realtime: invitación creada — propia org siempre, destino si conocido.
    notifyBranchesChange(myOrgId, 'invitation-create')
    if (toOrgId) notifyBranchesChange(toOrgId, 'invitation-create')

    // Notificar al usuario destino si existe
    if (toUserId) {
      // Obtener nombre de la org que invita
      const { data: fromOrg } = await supabase
        .from('cons_organizations')
        .select('name')
        .eq('id', myOrgId)
        .single()

      await createNotification(
        toUserId,
        'branch_invitation',
        'Nueva invitacion de sucursal',
        `${fromOrg?.name || 'Una organizacion'} te ha invitado como sucursal`,
        { invitation_id: invitation.id }
      )
    }

    res.status(201).json(invitation)
  } catch (err) {
    next(err)
  }
})

// GET /api/branches/invitations - Listar invitaciones enviadas y recibidas
router.get('/invitations', async (req, res, next) => {
  try {
    const myOrgId = req.user.organization_id

    // Enviadas
    const { data: sent, error: errSent } = await supabase
      .from('cons_branch_invitations')
      .select('*')
      .eq('from_organization_id', myOrgId)
      .order('created_at', { ascending: false })

    if (errSent) throw errSent

    // Recibidas (por email o por user_id)
    const { data: received, error: errRecv } = await supabase
      .from('cons_branch_invitations')
      .select('*')
      .or(`to_user_id.eq.${req.user.id},to_email.eq.${req.user.email}`)
      .order('created_at', { ascending: false })

    if (errRecv) throw errRecv

    // Enriquecer con nombres de org
    const orgIds = [...new Set([
      ...sent.map(i => i.to_organization_id).filter(Boolean),
      ...received.map(i => i.from_organization_id).filter(Boolean),
    ])]

    let orgMap = {}
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('cons_organizations')
        .select('id, name')
        .in('id', orgIds)
      orgMap = Object.fromEntries((orgs || []).map(o => [o.id, o.name]))
    }

    res.json({
      sent: sent.map(i => ({ ...i, to_organization_name: orgMap[i.to_organization_id] || null })),
      received: received.map(i => ({ ...i, from_organization_name: orgMap[i.from_organization_id] || null })),
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/branches/invitations/:id/accept
router.post('/invitations/:id/accept', async (req, res, next) => {
  try {
    const { data: invitation, error } = await supabase
      .from('cons_branch_invitations')
      .select('*')
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .single()

    if (error || !invitation) {
      return res.status(404).json({ error: 'Invitacion no encontrada o ya procesada' })
    }

    // Verificar que el usuario actual es el destinatario
    if (invitation.to_user_id !== req.user.id && invitation.to_email !== req.user.email) {
      return res.status(403).json({ error: 'No tienes permiso para aceptar esta invitacion' })
    }

    const myOrgId = req.user.organization_id
    const fromOrgId = invitation.from_organization_id

    // Ordenar para el constraint CHECK(org_a < org_b)
    const orgA = fromOrgId < myOrgId ? fromOrgId : myOrgId
    const orgB = fromOrgId < myOrgId ? myOrgId : fromOrgId

    // Crear branch_link
    const { data: link, error: linkErr } = await supabase
      .from('cons_branch_links')
      .insert({
        organization_a_id: orgA,
        organization_b_id: orgB,
        invitation_id: invitation.id,
      })
      .select()
      .single()

    if (linkErr) throw linkErr

    // Actualizar invitacion
    await supabase
      .from('cons_branch_invitations')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
        to_user_id: req.user.id,
        to_organization_id: myOrgId,
      })
      .eq('id', invitation.id)

    // Notificar al que invito
    const { data: myOrg } = await supabase
      .from('cons_organizations')
      .select('name')
      .eq('id', myOrgId)
      .single()

    await createNotification(
      invitation.from_user_id,
      'branch_accepted',
      'Invitacion de sucursal aceptada',
      `${myOrg?.name || 'Una organizacion'} ha aceptado tu invitacion de sucursal`,
      { branch_link_id: link.id }
    )

    res.json(link)
    // Ambas orgs deben refrescar invitaciones + sucursales + listado de proyectos.
    notifyBranchesChangeBoth(myOrgId, fromOrgId, 'invitation-accept')
    notifyProjectsChange(myOrgId, 'branch-link-create')
    notifyProjectsChange(fromOrgId, 'branch-link-create')
  } catch (err) {
    next(err)
  }
})

// POST /api/branches/invitations/:id/reject
router.post('/invitations/:id/reject', async (req, res, next) => {
  try {
    const { data: invitation } = await supabase
      .from('cons_branch_invitations')
      .select('*')
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .single()

    if (!invitation) {
      return res.status(404).json({ error: 'Invitacion no encontrada' })
    }

    if (invitation.to_user_id !== req.user.id && invitation.to_email !== req.user.email) {
      return res.status(403).json({ error: 'No tienes permiso' })
    }

    await supabase
      .from('cons_branch_invitations')
      .update({ status: 'rejected', responded_at: new Date().toISOString() })
      .eq('id', req.params.id)

    // Notificar al que invito
    await createNotification(
      invitation.from_user_id,
      'branch_rejected',
      'Invitacion de sucursal rechazada',
      `Tu invitacion de sucursal ha sido rechazada`,
      { invitation_id: invitation.id }
    )

    res.json({ success: true })
    notifyBranchesChange(invitation.from_organization_id, 'invitation-reject')
    notifyBranchesChange(req.user.organization_id, 'invitation-reject')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/branches/invitations/:id - Cancelar invitacion enviada
router.delete('/invitations/:id', async (req, res, next) => {
  try {
    // Resolver to_organization_id antes para notificar también al destinatario
    const { data: inv } = await supabase
      .from('cons_branch_invitations')
      .select('to_organization_id')
      .eq('id', req.params.id)
      .single()

    const { error } = await supabase
      .from('cons_branch_invitations')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .eq('from_user_id', req.user.id)
      .eq('status', 'pending')

    if (error) throw error
    res.json({ success: true })
    notifyBranchesChange(req.user.organization_id, 'invitation-cancel')
    if (inv?.to_organization_id) {
      notifyBranchesChange(inv.to_organization_id, 'invitation-cancel')
    }
  } catch (err) {
    next(err)
  }
})

// GET /api/branches - Listar sucursales activas
router.get('/', async (req, res, next) => {
  try {
    const myOrgId = req.user.organization_id

    // Links donde mi org es A o B
    const { data: linksA } = await supabase
      .from('cons_branch_links')
      .select('*')
      .eq('organization_a_id', myOrgId)

    const { data: linksB } = await supabase
      .from('cons_branch_links')
      .select('*')
      .eq('organization_b_id', myOrgId)

    const allLinks = [...(linksA || []), ...(linksB || [])]

    // Obtener nombres de las orgs vinculadas
    const partnerOrgIds = allLinks.map(l =>
      l.organization_a_id === myOrgId ? l.organization_b_id : l.organization_a_id
    )

    let orgMap = {}
    if (partnerOrgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('cons_organizations')
        .select('id, name')
        .in('id', partnerOrgIds)
      orgMap = Object.fromEntries((orgs || []).map(o => [o.id, o.name]))
    }

    const branches = allLinks.map(l => {
      const partnerOrgId = l.organization_a_id === myOrgId ? l.organization_b_id : l.organization_a_id
      return {
        ...l,
        partner_organization_id: partnerOrgId,
        partner_organization_name: orgMap[partnerOrgId] || 'Desconocida',
      }
    })

    res.json(branches)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/branches/:id - Eliminar vinculo
router.delete('/:id', async (req, res, next) => {
  try {
    const myOrgId = req.user.organization_id

    // Verificar que el link pertenece a mi org
    const { data: link } = await supabase
      .from('cons_branch_links')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (!link || (link.organization_a_id !== myOrgId && link.organization_b_id !== myOrgId)) {
      return res.status(404).json({ error: 'Vinculo no encontrado' })
    }

    // Eliminar visibilidades asociadas (cascade deberia hacerlo, pero por si acaso)
    await supabase
      .from('cons_branch_project_visibility')
      .delete()
      .eq('branch_link_id', req.params.id)

    // Eliminar link
    const { error } = await supabase
      .from('cons_branch_links')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
    notifyBranchesChangeBoth(link.organization_a_id, link.organization_b_id, 'link-delete')
    notifyProjectsChange(link.organization_a_id, 'branch-link-delete')
    notifyProjectsChange(link.organization_b_id, 'branch-link-delete')
  } catch (err) {
    next(err)
  }
})

// PUT /api/branches/visibility - Toggle visibilidad de proyecto
router.put('/visibility', async (req, res, next) => {
  try {
    const { project_id, branch_link_id, visible } = req.body
    if (!project_id || !branch_link_id) {
      return res.status(400).json({ error: 'project_id y branch_link_id requeridos' })
    }

    // Verificar que el proyecto es mio
    const { data: project } = await supabase
      .from('cons_projects')
      .select('id, organization_id')
      .eq('id', project_id)
      .eq('organization_id', req.user.organization_id)
      .single()

    if (!project) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' })
    }

    if (visible) {
      // Upsert visibilidad
      const { error } = await supabase
        .from('cons_branch_project_visibility')
        .upsert({
          project_id,
          branch_link_id,
          visible: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'project_id,branch_link_id' })

      if (error) throw error
    } else {
      // Eliminar fila (sin fila = no visible)
      await supabase
        .from('cons_branch_project_visibility')
        .delete()
        .eq('project_id', project_id)
        .eq('branch_link_id', branch_link_id)
    }

    res.json({ success: true })

    // Notificar a las dos orgs del vínculo: la org dueña del proyecto cambia
    // su listado de "lo que comparto"; la otra cambia su listado de
    // proyectos visibles.
    const { data: linkRow } = await supabase
      .from('cons_branch_links')
      .select('organization_a_id, organization_b_id')
      .eq('id', branch_link_id)
      .single()
    if (linkRow) {
      notifyProjectsChange(linkRow.organization_a_id, 'visibility-change')
      notifyProjectsChange(linkRow.organization_b_id, 'visibility-change')
    }
  } catch (err) {
    next(err)
  }
})

// GET /api/branches/visibility/:linkId - Ver configuracion de visibilidad
router.get('/visibility/:linkId', async (req, res, next) => {
  try {
    const myOrgId = req.user.organization_id

    // Verificar que el link es mio
    const { data: link } = await supabase
      .from('cons_branch_links')
      .select('*')
      .eq('id', req.params.linkId)
      .single()

    if (!link || (link.organization_a_id !== myOrgId && link.organization_b_id !== myOrgId)) {
      return res.status(404).json({ error: 'Vinculo no encontrado' })
    }

    // Obtener mis proyectos
    const { data: projects } = await supabase
      .from('cons_projects')
      .select('id, name')
      .eq('organization_id', myOrgId)
      .order('name')

    // Obtener visibilidades existentes
    const { data: visibilities } = await supabase
      .from('cons_branch_project_visibility')
      .select('*')
      .eq('branch_link_id', req.params.linkId)

    const visMap = Object.fromEntries((visibilities || []).map(v => [v.project_id, v.visible]))

    const result = (projects || []).map(p => ({
      project_id: p.id,
      project_name: p.name,
      visible: visMap[p.id] || false,
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ════════════════════════════════════════════════════════════════════
// COMPARTIR BIBLIOTECA Y PROVEEDORES CON LA SUCURSAL (modo "copy")
// ════════════════════════════════════════════════════════════════════
//
// Ambos endpoints copian filas de la org del usuario a la org partner del
// link especificado. Dedup por nombre normalizado: si ya existe una entrada
// con el mismo nombre en destino, se actualiza con los nuevos datos en lugar
// de crear duplicados. El destinatario recibe una notificación.

const normalizeName = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ')

// Resuelve la org "partner" y verifica que el linkId pertenece al usuario.
async function resolvePartnerOrg(linkId, myOrgId) {
  const { data: link } = await supabase
    .from('cons_branch_links')
    .select('id, organization_a_id, organization_b_id')
    .eq('id', linkId)
    .single()
  if (!link) return null
  if (link.organization_a_id !== myOrgId && link.organization_b_id !== myOrgId) return null
  const partnerOrgId = link.organization_a_id === myOrgId
    ? link.organization_b_id
    : link.organization_a_id
  return { link, partnerOrgId }
}

async function notifyPartnerOwner(partnerOrgId, fromOrgId, type, title, body, data) {
  const { data: fromOrg } = await supabase
    .from('cons_organizations')
    .select('name')
    .eq('id', fromOrgId)
    .single()
  const { data: members } = await supabase
    .from('cons_organization_members')
    .select('user_id')
    .eq('organization_id', partnerOrgId)
    .eq('role', 'owner')
  for (const m of (members || [])) {
    await createNotification(
      m.user_id,
      type,
      title,
      body.replace('{{org}}', fromOrg?.name || 'Una organización'),
      data,
    )
  }
}

// POST /api/branches/:linkId/share-library
// Body: { chapter_ids?: string[], partida_ids?: string[] }
router.post('/:linkId/share-library', async (req, res, next) => {
  try {
    const myOrgId = req.user.organization_id
    const partner = await resolvePartnerOrg(req.params.linkId, myOrgId)
    if (!partner) return res.status(404).json({ error: 'Vínculo no encontrado' })

    const { chapter_ids = [], partida_ids = [] } = req.body || {}
    if (chapter_ids.length === 0 && partida_ids.length === 0) {
      return res.status(400).json({ error: 'Selecciona capítulos o partidas para enviar' })
    }

    // Cargar capítulos seleccionados (solo de mi org)
    let myChapters = []
    if (chapter_ids.length > 0) {
      const { data } = await supabase
        .from('cons_library_chapters')
        .select('id, code, name, sort_order')
        .eq('organization_id', myOrgId)
        .in('id', chapter_ids)
      myChapters = data || []
    }

    // Cargar partidas seleccionadas explícitamente + las que cuelgan de los
    // capítulos seleccionados.
    let myPartidas = []
    const partidaIdsSet = new Set(partida_ids)
    if (partida_ids.length > 0) {
      const { data } = await supabase
        .from('cons_saved_partidas')
        .select('*')
        .eq('organization_id', myOrgId)
        .in('id', partida_ids)
      for (const p of (data || [])) myPartidas.push(p)
    }
    if (myChapters.length > 0) {
      const { data } = await supabase
        .from('cons_saved_partidas')
        .select('*')
        .eq('organization_id', myOrgId)
        .in('library_chapter_id', myChapters.map(c => c.id))
      for (const p of (data || [])) {
        if (!partidaIdsSet.has(p.id)) myPartidas.push(p)
      }
    }

    // Cargar capítulos existentes en destino para dedup por nombre.
    const { data: dstChapters } = await supabase
      .from('cons_library_chapters')
      .select('id, code, name')
      .eq('organization_id', partner.partnerOrgId)
    const dstByName = new Map((dstChapters || []).map(c => [normalizeName(c.name), c]))

    // Mapear chapter_id origen → chapter_id destino (creando o reusando).
    const chapterIdMap = {}
    for (const ch of myChapters) {
      const dup = dstByName.get(normalizeName(ch.name))
      if (dup) {
        chapterIdMap[ch.id] = dup.id
      } else {
        const { data: newCh } = await supabase
          .from('cons_library_chapters')
          .insert({
            organization_id: partner.partnerOrgId,
            code: ch.code,
            name: ch.name,
            sort_order: ch.sort_order || 0,
          })
          .select()
          .single()
        if (newCh) {
          chapterIdMap[ch.id] = newCh.id
          dstByName.set(normalizeName(newCh.name), newCh)
        }
      }
    }

    // Para partidas seleccionadas sueltas cuyo capítulo NO se ha enviado,
    // intentar resolverlo igualmente buscando por nombre del capítulo origen.
    if (myPartidas.length > 0) {
      const orphanChapterIds = [...new Set(
        myPartidas
          .map(p => p.library_chapter_id)
          .filter(id => id && !chapterIdMap[id])
      )]
      if (orphanChapterIds.length > 0) {
        const { data: extra } = await supabase
          .from('cons_library_chapters')
          .select('id, code, name, sort_order')
          .in('id', orphanChapterIds)
        for (const ch of (extra || [])) {
          const dup = dstByName.get(normalizeName(ch.name))
          if (dup) chapterIdMap[ch.id] = dup.id
        }
      }
    }

    // Cargar partidas existentes en destino para dedup por nombre.
    const { data: dstPartidas } = await supabase
      .from('cons_saved_partidas')
      .select('id, name')
      .eq('organization_id', partner.partnerOrgId)
    const dstPartidaByName = new Map((dstPartidas || []).map(p => [normalizeName(p.name), p]))

    let created = 0, updated = 0
    for (const p of myPartidas) {
      const targetChapterId = p.library_chapter_id ? (chapterIdMap[p.library_chapter_id] || null) : null
      const payload = {
        organization_id: partner.partnerOrgId,
        code: p.code,
        chapter_code: p.chapter_code,
        library_chapter_id: targetChapterId,
        name: p.name,
        description: p.description,
        unit: p.unit,
        unit_price: p.unit_price,
        cost_price: p.cost_price,
        tags: p.tags,
        is_auxiliary: !!p.is_auxiliary,
        sort_order: p.sort_order || 0,
        updated_at: new Date().toISOString(),
      }
      const dup = dstPartidaByName.get(normalizeName(p.name))
      if (dup) {
        await supabase.from('cons_saved_partidas').update(payload).eq('id', dup.id)
        updated++
      } else {
        const { data: ins } = await supabase
          .from('cons_saved_partidas')
          .insert(payload)
          .select('id, name')
          .single()
        if (ins) {
          dstPartidaByName.set(normalizeName(ins.name), ins)
          created++
        }
      }
    }

    await notifyPartnerOwner(
      partner.partnerOrgId,
      myOrgId,
      'library_shared',
      'Biblioteca compartida',
      '{{org}} te ha enviado partidas para tu biblioteca',
      { chapters: Object.keys(chapterIdMap).length, partidas_created: created, partidas_updated: updated },
    )

    res.json({
      success: true,
      chapters_imported: Object.keys(chapterIdMap).length,
      partidas_created: created,
      partidas_updated: updated,
    })
    // El destinatario debe refrescar su biblioteca; lo notificamos como
    // cambio en sucursales (su panel de bandeja recibe un blip).
    notifyBranchesChange(partner.partnerOrgId, 'library-shared')
  } catch (err) {
    next(err)
  }
})

// POST /api/branches/:linkId/share-suppliers
// Body: { supplier_ids: string[] }
router.post('/:linkId/share-suppliers', async (req, res, next) => {
  try {
    const myOrgId = req.user.organization_id
    const partner = await resolvePartnerOrg(req.params.linkId, myOrgId)
    if (!partner) return res.status(404).json({ error: 'Vínculo no encontrado' })

    const { supplier_ids = [] } = req.body || {}
    if (supplier_ids.length === 0) {
      return res.status(400).json({ error: 'Selecciona proveedores para enviar' })
    }

    const { data: mySuppliers } = await supabase
      .from('cons_suppliers')
      .select('*')
      .eq('organization_id', myOrgId)
      .in('id', supplier_ids)

    if (!mySuppliers || mySuppliers.length === 0) {
      return res.status(400).json({ error: 'Proveedores no encontrados' })
    }

    // Dedup por nombre normalizado en destino.
    const { data: dstSuppliers } = await supabase
      .from('cons_suppliers')
      .select('id, name')
      .eq('organization_id', partner.partnerOrgId)
    const dstByName = new Map((dstSuppliers || []).map(s => [normalizeName(s.name), s]))

    // ── 1) Upsert de proveedores ─────────────────────────────────
    // src.id → dst.id para luego mapear cons_supplier_materials.
    const supplierIdMap = {}
    let created = 0, updated = 0
    for (const s of mySuppliers) {
      const payload = {
        organization_id: partner.partnerOrgId,
        name: s.name,
        tax_id: s.tax_id,
        contact_name: s.contact_name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        city: s.city,
        province: s.province,
        postal_code: s.postal_code,
        website: s.website,
        category: s.category,
        notes: s.notes,
        rating: s.rating,
        is_active: true,
      }
      const dup = dstByName.get(normalizeName(s.name))
      if (dup) {
        await supabase.from('cons_suppliers').update(payload).eq('id', dup.id)
        supplierIdMap[s.id] = dup.id
        updated++
      } else {
        const { data: ins } = await supabase
          .from('cons_suppliers')
          .insert(payload)
          .select('id, name')
          .single()
        if (ins) {
          dstByName.set(normalizeName(ins.name), ins)
          supplierIdMap[s.id] = ins.id
          created++
        }
      }
    }

    // ── 2) Materiales asociados a esos proveedores ───────────────
    // Cargar las filas pivote cons_supplier_materials de los proveedores
    // origen y los cons_materials referenciados.
    const srcSupplierIds = mySuppliers.map(s => s.id)
    const { data: srcLinks } = await supabase
      .from('cons_supplier_materials')
      .select('id, supplier_id, material_id, unit_price, notes, last_updated, supplier_description')
      .in('supplier_id', srcSupplierIds)

    let materialsCreated = 0, materialsUpdated = 0
    let supplierMaterialsCreated = 0, supplierMaterialsUpdated = 0

    if (srcLinks && srcLinks.length > 0) {
      const srcMaterialIds = [...new Set(srcLinks.map(l => l.material_id))]
      const { data: srcMaterials } = await supabase
        .from('cons_materials')
        .select('*')
        .in('id', srcMaterialIds)

      // Materiales existentes en destino: dedup por nombre normalizado.
      const { data: dstMaterials } = await supabase
        .from('cons_materials')
        .select('id, code, name')
        .eq('organization_id', partner.partnerOrgId)
      const dstMatByName = new Map((dstMaterials || []).map(m => [normalizeName(m.name), m]))
      const dstMatCodes = new Set((dstMaterials || []).map(m => m.code))

      // Crear/actualizar materiales en destino y mapear src.id → dst.id.
      const materialIdMap = {}
      for (const m of (srcMaterials || [])) {
        const dup = dstMatByName.get(normalizeName(m.name))
        if (dup) {
          materialIdMap[m.id] = dup.id
          // No tocamos el material existente: la sucursal puede tener
          // datos suyos (precio de coste, stock, categoría). Solo el link
          // proveedor↔material se actualiza después.
          materialsUpdated++
        } else {
          // Insertar nuevo material en destino. Si el code choca, le
          // añadimos un sufijo incremental para evitar el unique.
          let code = m.code
          let attempt = 0
          while (dstMatCodes.has(code) && attempt < 10) {
            attempt++
            code = `${m.code}-${attempt}`
          }
          const { data: ins } = await supabase
            .from('cons_materials')
            .insert({
              organization_id: partner.partnerOrgId,
              code,
              name: m.name,
              description: m.description,
              unit: m.unit,
              unit_price: m.unit_price,
              sale_price: m.sale_price,
              currency: m.currency,
              brand: m.brand,
              notes: m.notes,
              is_active: true,
            })
            .select('id, code, name')
            .single()
          if (ins) {
            materialIdMap[m.id] = ins.id
            dstMatByName.set(normalizeName(ins.name), ins)
            dstMatCodes.add(ins.code)
            materialsCreated++
          }
        }
      }

      // Cargar pivote existente en destino para dedupe (supplier+material).
      const dstSupplierIds = Object.values(supplierIdMap)
      const { data: dstLinksRaw } = await supabase
        .from('cons_supplier_materials')
        .select('id, supplier_id, material_id')
        .in('supplier_id', dstSupplierIds.length > 0 ? dstSupplierIds : ['00000000-0000-0000-0000-000000000000'])
      const dstLinkKey = new Map(
        (dstLinksRaw || []).map(l => [`${l.supplier_id}::${l.material_id}`, l.id])
      )

      // Para cada link origen, calcular link destino y upsert.
      for (const link of srcLinks) {
        const dstSupplierId = supplierIdMap[link.supplier_id]
        const dstMaterialId = materialIdMap[link.material_id]
        if (!dstSupplierId || !dstMaterialId) continue
        const key = `${dstSupplierId}::${dstMaterialId}`
        const existingId = dstLinkKey.get(key)
        const linkPayload = {
          supplier_id: dstSupplierId,
          material_id: dstMaterialId,
          unit_price: link.unit_price,
          notes: link.notes,
          supplier_description: link.supplier_description,
          last_updated: link.last_updated || new Date().toISOString().slice(0, 10),
        }
        if (existingId) {
          await supabase.from('cons_supplier_materials').update(linkPayload).eq('id', existingId)
          supplierMaterialsUpdated++
        } else {
          const { data: ins } = await supabase
            .from('cons_supplier_materials')
            .insert(linkPayload)
            .select('id')
            .single()
          if (ins) {
            dstLinkKey.set(key, ins.id)
            supplierMaterialsCreated++
          }
        }
      }
    }

    await notifyPartnerOwner(
      partner.partnerOrgId,
      myOrgId,
      'suppliers_shared',
      'Proveedores compartidos',
      '{{org}} te ha enviado proveedores',
      { created, updated, materials_created: materialsCreated, materials_updated: materialsUpdated },
    )

    res.json({
      success: true,
      created,
      updated,
      materials_created: materialsCreated,
      materials_updated: materialsUpdated,
      supplier_materials_created: supplierMaterialsCreated,
      supplier_materials_updated: supplierMaterialsUpdated,
    })
    notifyBranchesChange(partner.partnerOrgId, 'suppliers-shared')
  } catch (err) {
    next(err)
  }
})

export default router
