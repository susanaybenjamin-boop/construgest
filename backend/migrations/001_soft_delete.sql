-- ════════════════════════════════════════════════════════════════════
-- Soft-delete + papelera para proyectos y presupuestos.
-- Aplicar en Supabase SQL Editor antes de desplegar.
-- ════════════════════════════════════════════════════════════════════

-- Proyectos: papelera con autor y fecha
ALTER TABLE cons_projects
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS cons_projects_deleted_at_idx
  ON cons_projects (deleted_at) WHERE deleted_at IS NOT NULL;

-- Presupuestos: papelera con autor y fecha
ALTER TABLE cons_budgets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS cons_budgets_deleted_at_idx
  ON cons_budgets (deleted_at) WHERE deleted_at IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- Realtime: habilitar la publicación supabase_realtime para las tablas
-- que el frontend escucha. Sin esto, los eventos NO se emiten.
-- Ejecutar SOLO si la tabla aún no está en la publication (idempotente).
-- ════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cons_budgets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cons_budgets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cons_chapters'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cons_chapters;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cons_budget_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cons_budget_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cons_measurements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cons_measurements;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cons_price_breakdown'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cons_price_breakdown;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cons_projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cons_projects;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cons_branch_project_visibility'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cons_branch_project_visibility;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cons_branch_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cons_branch_links;
  END IF;
END $$;

-- REPLICA IDENTITY FULL en estas tablas para que los eventos DELETE
-- traigan la fila completa (no sólo el id) — útil para filtros del cliente.
ALTER TABLE cons_budgets REPLICA IDENTITY FULL;
ALTER TABLE cons_chapters REPLICA IDENTITY FULL;
ALTER TABLE cons_budget_items REPLICA IDENTITY FULL;
ALTER TABLE cons_measurements REPLICA IDENTITY FULL;
