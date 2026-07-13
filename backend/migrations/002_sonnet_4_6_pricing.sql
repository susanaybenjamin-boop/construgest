-- ════════════════════════════════════════════════════════════════════
-- Pricing para claude-sonnet-4-6 (sustituye a claude-sonnet-4-20250514
-- que Anthropic retira el 15-jun-2026).
--
-- Sonnet 4.6 tiene el MISMO precio que Sonnet 4 ($3/M input, $15/M output).
-- La fila vieja se deja en la tabla por integridad referencial con
-- cons_ai_consumption (historial de consumo); no se borra.
--
-- Aplicar en Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════

INSERT INTO cons_ai_pricing (model, provider, input_price_per_million, output_price_per_million, updated_at)
VALUES ('claude-sonnet-4-6', 'anthropic', 3.00, 15.00, NOW())
ON CONFLICT (model) DO UPDATE
  SET input_price_per_million = EXCLUDED.input_price_per_million,
      output_price_per_million = EXCLUDED.output_price_per_million,
      updated_at = NOW();

-- Verificación: deberías ver la fila nueva y la vieja conviviendo.
-- SELECT model, input_price_per_million, output_price_per_million, updated_at
-- FROM cons_ai_pricing
-- WHERE model LIKE 'claude-sonnet%'
-- ORDER BY updated_at DESC;
