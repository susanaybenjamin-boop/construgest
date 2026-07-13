-- ============================================================================
-- Seed DEMO de desarrollo (DB-4 extendido): un proyecto con presupuesto completo,
-- un parte de trabajo y una certificación. Sirve para probar budgets/workLogs/
-- certifications con datos reales. Solo desarrollo local. UUIDs fijos.
-- Pertenece a la organización/usuario del 02_seed.sql.
-- ============================================================================
SET NAMES utf8mb4;
SET @org  = '00000000-0000-0000-0000-000000000001';
SET @user = '00000000-0000-0000-0000-000000000002';

-- Proyecto
INSERT INTO cons_projects (id, organization_id, created_by, name, status)
VALUES ('00000000-0000-0000-0000-000000000010', @org, @user, 'Obra Demo', 'active');

-- Presupuesto
INSERT INTO cons_budgets (id, project_id, name, version, status)
VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'Presupuesto v1', 1, 'draft');

-- Capítulo
INSERT INTO cons_chapters (id, budget_id, code, name, sort_order)
VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', '01', 'Movimiento de tierras', 1);

-- Partida
INSERT INTO cons_budget_items (id, chapter_id, code, name, sort_order)
VALUES ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000030', '01.01', 'Excavación en zanja', 1);

-- Medición
INSERT INTO cons_measurements (id, budget_item_id, sort_order)
VALUES ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000040', 1);

-- Parte de trabajo + enlace a la partida
INSERT INTO cons_work_logs (id, project_id, date, created_by)
VALUES ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '2026-07-13', '00000000-0000-0000-0000-000000000002');

INSERT INTO cons_work_log_budget_links (id, work_log_id, budget_item_id)
VALUES ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000040');

-- Certificación
INSERT INTO cons_certifications (id, budget_id, number, name)
VALUES ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000020', 1, 'Certificación nº 1');
