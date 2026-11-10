-- ════════════════════════════════════════════════════════════════════════════
-- COND-1 — Biblioteca de cláusulas para el capítulo de condiciones.
--
-- El capítulo de condiciones generales (is_legal_text) es texto rico y se
-- escribe a mano cada vez. Esta tabla guarda las cláusulas que se repiten obra
-- tras obra para insertarlas de un clic.
--
-- `body` es HTML y puede llevar HUECOS con la forma  {{etiqueta|valor}}:
--   "...tiene una validez de {{días de validez|30}} días."
-- Al insertar la cláusula, la app pide esos valores y los sustituye, para que
-- no se quede el importe de la obra anterior.
--
-- `block` agrupa (general / economica / exclusion) y `tag` dice de qué tipo de
-- obra es, para poder filtrar (p.ej. "estructura de hormigón").
--
-- La semilla son las cláusulas reales de Benjamin, generalizadas con huecos.
-- Se insertan UNA vez por organización y solo si esa organización no tiene
-- ninguna, así que repetir la migración no duplica nada.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `cons_condition_clauses` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `organization_id` CHAR(36) NOT NULL,
  `block` VARCHAR(32) NOT NULL DEFAULT 'general',
  `tag` VARCHAR(128),
  `title` TEXT NOT NULL,
  `body` TEXT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `cons_condition_clauses_block_check`
    CHECK (`block` IN ('general', 'economica', 'exclusion')),
  CONSTRAINT `cons_condition_clauses_organization_id_fkey`
    FOREIGN KEY (`organization_id`) REFERENCES `cons_organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS `idx_cons_condition_clauses_org`
  ON `cons_condition_clauses` (`organization_id`, `block`, `sort_order`);

-- ── Semilla: las cláusulas de siempre, con huecos donde cambia el dato ──────
INSERT INTO `cons_condition_clauses`
  (`organization_id`, `block`, `tag`, `title`, `body`, `sort_order`)
SELECT o.`id`, s.`block`, s.`tag`, s.`title`, s.`body`, s.`sort_order`
FROM `cons_organizations` o
CROSS JOIN (
  SELECT 'general' AS `block`, NULL AS `tag`,
         'Unidades no presupuestadas' AS `title`,
         '<p>Las unidades de obra no presupuestadas serán objeto de valoración en el momento de su ejecución.</p>' AS `body`,
         10 AS `sort_order`
  UNION ALL SELECT 'general', NULL,
    'Precios sujetos a mercado',
    '<p>Estos precios se incrementarán según subida de mercado desde la fecha de hoy, y se medirán en obra todas las partidas.</p>', 20
  UNION ALL SELECT 'general', NULL,
    'Validez de la oferta',
    '<p>Debido a la fluctuación del mercado, este presupuesto tiene una validez de {{días de validez|30}} días.</p>', 30
  UNION ALL SELECT 'general', NULL,
    'Plazo de ejecución',
    '<p>El plazo de ejecución previsto es de {{plazo|3}} {{unidad de plazo|semanas}} desde el inicio de los trabajos, salvo causas ajenas a esta empresa.</p>', 40
  UNION ALL SELECT 'general', NULL,
    'Garantía',
    '<p>Los trabajos ejecutados tienen una garantía de {{garantía|1}} {{unidad de garantía|año}} desde su finalización.</p>', 50
  UNION ALL SELECT 'exclusion', NULL,
    'Partidas a cero excluidas',
    '<p>LAS PARTIDAS VALORADAS A CERO ESTÁN EXCLUIDAS DE ESTE PRESUPUESTO.</p>', 60
  UNION ALL SELECT 'exclusion', NULL,
    'No incluido en el presupuesto',
    '<p>NO ESTÁN INCLUIDOS EN ESTE PRESUPUESTO {{qué se excluye|LOS PILARES METÁLICOS NI LAS PLACAS DE ANCLAJE DE ESTOS}}.</p>', 70
  UNION ALL SELECT 'exclusion', NULL,
    'No incluye licencias ni tasas',
    '<p>No se incluyen licencias, tasas municipales ni impuestos de obra.</p>', 80
  UNION ALL SELECT 'general', 'estructura de hormigón',
    'Exceso de material sobre lo previsto',
    '<p>EN LA PARTIDA SE PRESUPUESTAN {{cantidad prevista|18}} {{unidad|m³}}. EN EL CASO DE QUE SE NECESITASE MÁS, ESTE SE COBRARÁ A {{precio del exceso|185}} €/{{unidad|m³}} Y SE JUSTIFICARÁ CON LOS ALBARANES DE LLEGADA DE MATERIAL.</p>', 90
  UNION ALL SELECT 'general', 'estructura de hormigón',
    'Vigas descolgadas',
    '<p>Si algún forjado tuviera alguna viga descolgada, esta se cobrará a {{precio|330}} €/ml.</p>', 100
  UNION ALL SELECT 'economica', NULL,
    'Primera factura por hito',
    '<p>Se presentará una primera factura al terminar {{hito|el hormigonado de la losa}}, que incluirá el importe de las partidas ejecutadas hasta ese momento.</p>', 110
  UNION ALL SELECT 'economica', NULL,
    'Factura a la terminación de un hito',
    '<p>Se presentará factura a la terminación de {{hito|los muros}}.</p>', 120
  UNION ALL SELECT 'economica', 'estructura de hormigón',
    'Factura por cada forjado',
    '<p>Se presentará factura al hormigonado de cada forjado.</p>', 130
  UNION ALL SELECT 'economica', NULL,
    'Pago por porcentajes',
    '<p>Forma de pago: {{porcentaje a la firma|40}}% a la firma y el resto a la finalización de los trabajos.</p>', 140
  UNION ALL SELECT 'economica', NULL,
    'Plazo de pago de las facturas',
    '<p>LAS FACTURAS SE ABONARÁN EN UN PLAZO MÁXIMO DE {{plazo de pago|24}} {{unidad|HORAS}} DESDE SU RECEPCIÓN.</p>', 150
  UNION ALL SELECT 'economica', NULL,
    'Impago: paralización de la obra',
    '<p>Si alguna de las facturas emitidas no fuese abonada en el plazo máximo establecido, esto supondrá la paralización inmediata de la obra.</p>', 160
) s
WHERE NOT EXISTS (
  SELECT 1 FROM `cons_condition_clauses` c WHERE c.`organization_id` = o.`id`
);
