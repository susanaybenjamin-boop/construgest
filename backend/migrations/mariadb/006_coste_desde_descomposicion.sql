-- ════════════════════════════════════════════════════════════════════════════
-- A1 — El coste de la partida sale de su descomposición.
--
-- A partir de ahora, si una partida tiene líneas en `cons_price_breakdown`, su
-- `cost_price` ES la suma de esas líneas y el backend lo recalcula solo. Pero
-- las partidas que YA tenían descomposición arrastran un coste tecleado a mano
-- que puede no cuadrar: si no se arreglan aquí, la pantalla enseñaría un coste
-- de solo lectura que no coincide con el desglose que tiene justo debajo.
--
-- Esta migración pone al día esas partidas. Solo toca las que TIENEN
-- descomposición; las de coste manual no se rozan.
--
-- Al ejecutarla en el equipo de Benjamin (2026-11-15) afectaba a 2 partidas:
--   - "QA partida" (P1):                    3,00 €  ->  16,00 €
--   - "TRATAMIENTO DE FISURAS FINAS" (01.03): 0,00 € ->  18,77 €
--
-- OJO: `cost_price` alimenta el margen de la fila, el de las certificaciones y
-- el del panel de la obra. Es lo que se busca (que el margen diga la verdad),
-- pero significa que algún margen cambiará después de aplicarla.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE `cons_budget_items` i
JOIN (
  SELECT budget_item_id, ROUND(SUM(quantity * unit_cost), 2) AS suma
  FROM `cons_price_breakdown`
  GROUP BY budget_item_id
) b ON b.budget_item_id = i.id
SET i.cost_price = b.suma
WHERE ABS(i.cost_price - b.suma) > 0.005;
