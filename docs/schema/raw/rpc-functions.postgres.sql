-- ============================================================================
-- Funciones RPC de Construgest en el proyecto Supabase "APP360" (Postgres 17).
-- Extraídas 2026-07-13 (Fase 0). NO ejecutar en MariaDB tal cual: son PL/pgSQL.
-- En la migración se reimplementan en el backend Node (Fase 2/3).
-- Referenciadas por el backend vía supabase.rpc(...):
--   equipmentCatalog.js  -> rpc_list/get/create/update/delete_equipment
--   subcontractors.js    -> rpc_*_subcontractor(s), rpc_*_sub_document(s),
--                           rpc_get_expiring_documents, rpc_get_sub_specialties
--   workers.js           -> rpc_list/get/create/update/delete_worker
--   (mcp_check_quota / mcp_check_and_record_usage: cuotas de IA compartidas)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mcp_check_and_record_usage(p_app_id text, p_org_id text, p_user_id uuid, p_provider text, p_model text, p_input_tokens integer DEFAULT 0, p_output_tokens integer DEFAULT 0, p_estimated_cost numeric DEFAULT 0, p_key_source text DEFAULT 'env'::text, p_operation text DEFAULT 'chat'::text, p_tool_calls integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_check JSONB;
  v_daily_quota RECORD;
  v_daily_usage RECORD;
  v_today DATE := CURRENT_DATE;
BEGIN
  v_check := mcp_check_quota(p_app_id, p_org_id, p_user_id);
  IF NOT (v_check->>'allowed')::BOOLEAN THEN
    RETURN v_check;
  END IF;

  INSERT INTO mcp_ai_consumption (
    app_id, org_id, user_id, provider, model,
    input_tokens, output_tokens, estimated_cost,
    key_source, operation, tool_calls
  ) VALUES (
    p_app_id, p_org_id, p_user_id, p_provider, p_model,
    p_input_tokens, p_output_tokens, p_estimated_cost,
    p_key_source, p_operation, p_tool_calls
  );

  SELECT * INTO v_daily_quota FROM mcp_ai_quotas
    WHERE app_id = p_app_id AND org_id = p_org_id AND quota_type = 'daily';
  IF v_daily_quota IS NOT NULL AND v_daily_quota.max_calls IS NOT NULL THEN
    SELECT COUNT(*) as calls INTO v_daily_usage
    FROM mcp_ai_consumption
    WHERE app_id = p_app_id AND org_id = p_org_id AND created_at >= v_today;
    IF v_daily_usage.calls > v_daily_quota.max_calls AND COALESCE(v_daily_quota.credits_extra, 0) > 0 THEN
      UPDATE mcp_ai_quotas SET credits_extra = credits_extra - 1, updated_at = NOW()
      WHERE app_id = p_app_id AND org_id = p_org_id AND quota_type = 'daily';
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'recorded', true);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.mcp_check_quota(p_app_id text, p_org_id text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_daily_quota  RECORD;
  v_monthly_quota RECORD;
  v_user_daily   RECORD;
  v_user_monthly RECORD;
  v_daily_usage  RECORD;
  v_monthly_usage RECORD;
  v_user_daily_usage RECORD;
  v_user_monthly_usage RECORD;
  v_today        DATE := CURRENT_DATE;
  v_month_start  DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_is_bypass    BOOLEAN := FALSE;
  v_user_enabled BOOLEAN := TRUE;
BEGIN
  -- 1. Verificar user-level enable/disable
  IF p_user_id IS NOT NULL THEN
    SELECT enabled INTO v_user_enabled FROM mcp_ai_user_quotas
      WHERE app_id = p_app_id AND user_id = p_user_id AND quota_type = 'daily' LIMIT 1;
    IF v_user_enabled IS NOT NULL AND NOT v_user_enabled THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'user_disabled');
    END IF;
  END IF;

  -- 2. Cuotas de org
  SELECT * INTO v_daily_quota FROM mcp_ai_quotas
    WHERE app_id = p_app_id AND org_id = p_org_id AND quota_type = 'daily';
  SELECT * INTO v_monthly_quota FROM mcp_ai_quotas
    WHERE app_id = p_app_id AND org_id = p_org_id AND quota_type = 'monthly';

  -- Kill switch org
  IF (v_daily_quota IS NOT NULL AND NOT v_daily_quota.enabled) OR
     (v_monthly_quota IS NOT NULL AND NOT v_monthly_quota.enabled) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ai_disabled');
  END IF;

  -- Bypass
  IF p_user_id IS NOT NULL THEN
    IF (v_daily_quota IS NOT NULL AND p_user_id = ANY(v_daily_quota.bypass_user_ids)) OR
       (v_monthly_quota IS NOT NULL AND p_user_id = ANY(v_monthly_quota.bypass_user_ids)) THEN
      v_is_bypass := TRUE;
    END IF;
  END IF;

  -- 3. Cuotas POR USUARIO
  IF p_user_id IS NOT NULL AND NOT v_is_bypass THEN
    SELECT * INTO v_user_daily FROM mcp_ai_user_quotas
      WHERE app_id = p_app_id AND user_id = p_user_id AND quota_type = 'daily';
    SELECT * INTO v_user_monthly FROM mcp_ai_user_quotas
      WHERE app_id = p_app_id AND user_id = p_user_id AND quota_type = 'monthly';

    IF v_user_daily IS NOT NULL AND v_user_daily.max_calls IS NOT NULL THEN
      SELECT COUNT(*) as calls INTO v_user_daily_usage
      FROM mcp_ai_consumption
      WHERE app_id = p_app_id AND user_id = p_user_id AND created_at >= v_today;
      IF v_user_daily_usage.calls >= v_user_daily.max_calls THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'user_daily_limit',
          'current', v_user_daily_usage.calls, 'limit', v_user_daily.max_calls);
      END IF;
    END IF;

    IF v_user_monthly IS NOT NULL AND v_user_monthly.max_calls IS NOT NULL THEN
      SELECT COUNT(*) as calls INTO v_user_monthly_usage
      FROM mcp_ai_consumption
      WHERE app_id = p_app_id AND user_id = p_user_id AND created_at >= v_month_start;
      IF v_user_monthly_usage.calls >= v_user_monthly.max_calls THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'user_monthly_limit',
          'current', v_user_monthly_usage.calls, 'limit', v_user_monthly.max_calls);
      END IF;
    END IF;
  END IF;

  -- 4. Cuotas de ORG
  IF NOT v_is_bypass THEN
    IF v_daily_quota IS NULL AND v_monthly_quota IS NULL THEN
      RETURN jsonb_build_object('allowed', true, 'reason', 'no_quotas');
    END IF;

    IF v_daily_quota IS NOT NULL AND v_daily_quota.max_calls IS NOT NULL THEN
      SELECT COUNT(*) as calls INTO v_daily_usage
      FROM mcp_ai_consumption
      WHERE app_id = p_app_id AND org_id = p_org_id AND created_at >= v_today;
      IF v_daily_usage.calls >= v_daily_quota.max_calls AND COALESCE(v_daily_quota.credits_extra, 0) <= 0 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit',
          'current', v_daily_usage.calls, 'limit', v_daily_quota.max_calls);
      END IF;
    END IF;

    IF v_monthly_quota IS NOT NULL AND v_monthly_quota.max_calls IS NOT NULL THEN
      SELECT COUNT(*) as calls INTO v_monthly_usage
      FROM mcp_ai_consumption
      WHERE app_id = p_app_id AND org_id = p_org_id AND created_at >= v_month_start;
      IF v_monthly_usage.calls >= v_monthly_quota.max_calls AND COALESCE(v_monthly_quota.credits_extra, 0) <= 0 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'monthly_limit',
          'current', v_monthly_usage.calls, 'limit', v_monthly_quota.max_calls);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'within_limits');
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_equipment(p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO cons_equipment_catalog (organization_id, name, code, type, category, hourly_rate, daily_rate, supplier_id, license_plate, serial_number, maintenance_next, status, notes, photo_url)
  VALUES (
    (p_data->>'organization_id')::uuid, p_data->>'name', p_data->>'code',
    COALESCE(p_data->>'type', 'propia'), p_data->>'category',
    COALESCE((p_data->>'hourly_rate')::numeric, 0), COALESCE((p_data->>'daily_rate')::numeric, 0),
    (p_data->>'supplier_id')::uuid, p_data->>'license_plate', p_data->>'serial_number',
    (p_data->>'maintenance_next')::date, COALESCE(p_data->>'status', 'available'),
    p_data->>'notes', p_data->>'photo_url'
  ) RETURNING id INTO v_id;
  RETURN (SELECT row_to_json(e.*) FROM cons_equipment_catalog e WHERE e.id = v_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_sub_document(p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.cons_subcontractor_documents (subcontractor_id, project_id, doc_type, name, file_path, expiry_date, status, notes)
  VALUES (
    (p_data->>'subcontractor_id')::uuid, (p_data->>'project_id')::uuid,
    p_data->>'doc_type', p_data->>'name', p_data->>'file_path',
    (p_data->>'expiry_date')::date, COALESCE(p_data->>'status', 'pending'), p_data->>'notes'
  ) RETURNING id INTO v_id;
  RETURN (SELECT row_to_json(d.*) FROM public.cons_subcontractor_documents d WHERE d.id = v_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_subcontractor(p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.cons_subcontractors (organization_id, name, tax_id, contact_name, phone, email, address, city, province, postal_code, specialty, rating, is_active, notes)
  VALUES (
    (p_data->>'organization_id')::uuid, p_data->>'name', p_data->>'tax_id',
    p_data->>'contact_name', p_data->>'phone', p_data->>'email',
    p_data->>'address', p_data->>'city', p_data->>'province', p_data->>'postal_code',
    p_data->>'specialty', COALESCE((p_data->>'rating')::int, 3),
    COALESCE((p_data->>'is_active')::boolean, true), p_data->>'notes'
  ) RETURNING id INTO v_id;
  RETURN (SELECT row_to_json(s.*) FROM public.cons_subcontractors s WHERE s.id = v_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_worker(p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO cons_workers (organization_id, name, dni, role, specialty, hourly_rate, phone, email, emergency_contact, is_subcontracted, subcontractor_id, certifications, status, photo_url, hire_date, end_date, notes)
  VALUES (
    (p_data->>'organization_id')::uuid, p_data->>'name', p_data->>'dni',
    COALESCE(p_data->>'role', 'Peón'), p_data->>'specialty',
    COALESCE((p_data->>'hourly_rate')::numeric, 0), p_data->>'phone', p_data->>'email',
    p_data->>'emergency_contact', COALESCE((p_data->>'is_subcontracted')::boolean, false),
    (p_data->>'subcontractor_id')::uuid, COALESCE(p_data->'certifications', '[]'::jsonb),
    COALESCE(p_data->>'status', 'active'), p_data->>'photo_url',
    (p_data->>'hire_date')::date, (p_data->>'end_date')::date, p_data->>'notes'
  ) RETURNING id INTO v_id;
  RETURN (SELECT row_to_json(w.*) FROM cons_workers w WHERE w.id = v_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_equipment(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  DELETE FROM cons_equipment_catalog WHERE id = p_id;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_sub_document(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  DELETE FROM public.cons_subcontractor_documents WHERE id = p_id;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_subcontractor(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  DELETE FROM public.cons_subcontractors WHERE id = p_id;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_worker(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  DELETE FROM cons_workers WHERE id = p_id;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_equipment(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT row_to_json(e.*) FROM cons_equipment_catalog e WHERE e.id = p_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_expiring_documents(p_org_id uuid, p_days integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(d.*), '[]'::json)
    FROM public.cons_subcontractor_documents d
    JOIN public.cons_subcontractors s ON d.subcontractor_id = s.id
    WHERE s.organization_id = p_org_id
      AND d.expiry_date IS NOT NULL
      AND d.expiry_date <= CURRENT_DATE + (p_days || ' days')::interval
      AND d.status != 'rejected'
  );
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_sub_specialties(p_org_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(DISTINCT s.specialty), '[]'::json)
    FROM public.cons_subcontractors s
    WHERE s.organization_id = p_org_id AND s.specialty IS NOT NULL
  );
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_subcontractor(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN json_build_object(
    'subcontractor', (SELECT row_to_json(s.*) FROM public.cons_subcontractors s WHERE s.id = p_id),
    'documents', COALESCE((SELECT json_agg(d.*) FROM public.cons_subcontractor_documents d WHERE d.subcontractor_id = p_id), '[]'::json)
  );
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_worker(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT row_to_json(w.*) FROM cons_workers w WHERE w.id = p_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_list_equipment(p_org_id uuid, p_status text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(e.*), '[]'::json)
    FROM cons_equipment_catalog e
    WHERE e.organization_id = p_org_id
      AND (p_status IS NULL OR e.status = p_status)
      AND (p_type IS NULL OR e.type = p_type)
      AND (p_search IS NULL OR e.name ILIKE '%' || p_search || '%' OR e.category ILIKE '%' || p_search || '%')
  );
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_list_sub_documents(p_sub_id uuid, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(d.*), '[]'::json)
    FROM public.cons_subcontractor_documents d
    WHERE d.subcontractor_id = p_sub_id
      AND (p_project_id IS NULL OR d.project_id = p_project_id)
  );
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_list_subcontractors(p_org_id uuid, p_specialty text DEFAULT NULL::text, p_is_active text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(s.*), '[]'::json)
    FROM public.cons_subcontractors s
    WHERE s.organization_id = p_org_id
      AND (p_specialty IS NULL OR s.specialty ILIKE '%' || p_specialty || '%')
      AND (p_is_active IS NULL OR s.is_active = (p_is_active = 'true'))
      AND (p_search IS NULL OR s.name ILIKE '%' || p_search || '%' OR s.tax_id ILIKE '%' || p_search || '%' OR s.contact_name ILIKE '%' || p_search || '%')
  );
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_list_workers(p_org_id uuid, p_status text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(w.*), '[]'::json)
    FROM cons_workers w
    WHERE w.organization_id = p_org_id
      AND (p_status IS NULL OR w.status = p_status)
      AND (p_role IS NULL OR w.role = p_role)
      AND (p_search IS NULL OR w.name ILIKE '%' || p_search || '%' OR w.dni ILIKE '%' || p_search || '%' OR w.specialty ILIKE '%' || p_search || '%')
  );
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_equipment(p_id uuid, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE cons_equipment_catalog SET
    name = COALESCE(p_data->>'name', name), code = COALESCE(p_data->>'code', code),
    type = COALESCE(p_data->>'type', type), category = COALESCE(p_data->>'category', category),
    hourly_rate = COALESCE((p_data->>'hourly_rate')::numeric, hourly_rate),
    daily_rate = COALESCE((p_data->>'daily_rate')::numeric, daily_rate),
    license_plate = COALESCE(p_data->>'license_plate', license_plate),
    serial_number = COALESCE(p_data->>'serial_number', serial_number),
    maintenance_next = CASE WHEN p_data ? 'maintenance_next' THEN (p_data->>'maintenance_next')::date ELSE maintenance_next END,
    status = COALESCE(p_data->>'status', status), notes = COALESCE(p_data->>'notes', notes),
    photo_url = COALESCE(p_data->>'photo_url', photo_url), updated_at = now()
  WHERE id = p_id;
  RETURN (SELECT row_to_json(e.*) FROM cons_equipment_catalog e WHERE e.id = p_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_sub_document(p_id uuid, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.cons_subcontractor_documents SET
    doc_type = COALESCE(p_data->>'doc_type', doc_type),
    name = COALESCE(p_data->>'name', name),
    file_path = COALESCE(p_data->>'file_path', file_path),
    expiry_date = CASE WHEN p_data ? 'expiry_date' THEN (p_data->>'expiry_date')::date ELSE expiry_date END,
    status = COALESCE(p_data->>'status', status),
    notes = COALESCE(p_data->>'notes', notes), updated_at = now()
  WHERE id = p_id;
  RETURN (SELECT row_to_json(d.*) FROM public.cons_subcontractor_documents d WHERE d.id = p_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_subcontractor(p_id uuid, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.cons_subcontractors SET
    name = COALESCE(p_data->>'name', name), tax_id = COALESCE(p_data->>'tax_id', tax_id),
    contact_name = COALESCE(p_data->>'contact_name', contact_name),
    phone = COALESCE(p_data->>'phone', phone), email = COALESCE(p_data->>'email', email),
    address = COALESCE(p_data->>'address', address), city = COALESCE(p_data->>'city', city),
    province = COALESCE(p_data->>'province', province), postal_code = COALESCE(p_data->>'postal_code', postal_code),
    specialty = COALESCE(p_data->>'specialty', specialty),
    rating = COALESCE((p_data->>'rating')::int, rating),
    is_active = COALESCE((p_data->>'is_active')::boolean, is_active),
    notes = COALESCE(p_data->>'notes', notes), updated_at = now()
  WHERE id = p_id;
  RETURN (SELECT row_to_json(s.*) FROM public.cons_subcontractors s WHERE s.id = p_id);
END;
$function$;


-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_worker(p_id uuid, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE cons_workers SET
    name = COALESCE(p_data->>'name', name), dni = COALESCE(p_data->>'dni', dni),
    role = COALESCE(p_data->>'role', role), specialty = COALESCE(p_data->>'specialty', specialty),
    hourly_rate = COALESCE((p_data->>'hourly_rate')::numeric, hourly_rate),
    phone = COALESCE(p_data->>'phone', phone), email = COALESCE(p_data->>'email', email),
    emergency_contact = COALESCE(p_data->>'emergency_contact', emergency_contact),
    is_subcontracted = COALESCE((p_data->>'is_subcontracted')::boolean, is_subcontracted),
    subcontractor_id = CASE WHEN p_data ? 'subcontractor_id' THEN (p_data->>'subcontractor_id')::uuid ELSE subcontractor_id END,
    certifications = COALESCE(p_data->'certifications', certifications),
    status = COALESCE(p_data->>'status', status), photo_url = COALESCE(p_data->>'photo_url', photo_url),
    hire_date = CASE WHEN p_data ? 'hire_date' THEN (p_data->>'hire_date')::date ELSE hire_date END,
    end_date = CASE WHEN p_data ? 'end_date' THEN (p_data->>'end_date')::date ELSE end_date END,
    notes = COALESCE(p_data->>'notes', notes), updated_at = now()
  WHERE id = p_id;
  RETURN (SELECT row_to_json(w.*) FROM cons_workers w WHERE w.id = p_id);
END;
$function$;
