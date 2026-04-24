-- Para compras com original_price preenchido, decide se ele representa "per unit" ou "total da nota"
-- escolhendo a interpretação cuja diferença para 'total' é menor (mesma heurística do frontend).
WITH calc AS (
  SELECT 
    id,
    quantity,
    unit_price,
    original_price,
    total,
    -- per_unit: original_price * quantity
    (original_price * quantity) AS as_per_unit_total,
    -- as total: original_price (já é o total)
    original_price AS as_total_total,
    ABS((original_price * quantity) - total) AS diff_per_unit,
    ABS(original_price - total) AS diff_total
  FROM public.purchases
  WHERE original_price IS NOT NULL
)
UPDATE public.purchases p
SET 
  discount_amount = GREATEST(
    ROUND(
      CASE 
        WHEN c.diff_total < c.diff_per_unit THEN c.as_total_total - c.total
        ELSE c.as_per_unit_total - c.total
      END::numeric, 2
    ), 0
  ),
  discount_percentage = CASE
    WHEN c.diff_total < c.diff_per_unit AND c.as_total_total > 0 THEN
      ROUND((((c.as_total_total - c.total) / c.as_total_total) * 100)::numeric, 2)
    WHEN c.as_per_unit_total > 0 THEN
      ROUND((((c.as_per_unit_total - c.total) / c.as_per_unit_total) * 100)::numeric, 2)
    ELSE 0
  END,
  -- Normaliza: se original_price era "total da nota", divide por quantity para ficar per-unit
  original_price = CASE
    WHEN c.diff_total < c.diff_per_unit AND c.quantity > 0 THEN
      ROUND((c.original_price / c.quantity)::numeric, 4)
    ELSE c.original_price
  END
FROM calc c
WHERE p.id = c.id;

-- Limpa descontos negativos ou zerados, e original_price <= unit_price (sem desconto real)
UPDATE public.purchases
SET discount_amount = 0, discount_percentage = 0
WHERE discount_amount < 0;

UPDATE public.purchases
SET original_price = NULL, discount_amount = 0, discount_percentage = 0
WHERE original_price IS NOT NULL AND original_price <= unit_price + 0.001;