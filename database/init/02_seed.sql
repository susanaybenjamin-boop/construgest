-- ============================================================================
-- Seed mínimo de DESARROLLO para Construgest (DB-4).
-- Se ejecuta después de 01_schema.sql (orden alfabético) al crear el volumen.
--
--   Organización : "Construgest (demo)"
--   Usuario      : admin@construgest.local
--   Contraseña   : construgest        (hash bcrypt generado con bcryptjs, cost 12)
--
-- UUIDs fijos para que sea reproducible y fácil de referenciar en pruebas.
-- Solo datos de desarrollo local; nada de esto va a producción.
-- NOTA: hasta la Fase 2 el backend aún lee de Supabase, así que el login por la
-- app todavía NO usa estos datos; sirven para validar las consultas al migrar.
-- ============================================================================
SET NAMES utf8mb4;

-- Usuario (primero: la organización lo referencia como owner)
INSERT INTO cons_users (id, email, password_hash, full_name, is_active, ai_enabled)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'admin@construgest.local',
  '$2b$12$22BIRhgnwqPUW3vPGPS/UeYMQAB/9IlklKYbku4Y9SLjswGivWocK',
  'Administrador Construgest',
  1, 1
);

-- Organización propiedad de ese usuario
INSERT INTO cons_organizations (id, name, owner_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Construgest (demo)',
  '00000000-0000-0000-0000-000000000002'
);

-- Membresía: el usuario es owner de su organización
INSERT INTO cons_organization_members (id, organization_id, user_id, role)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'owner'
);
