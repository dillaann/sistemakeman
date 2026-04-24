-- Corrige compras históricas onde total != quantity * unit_price
-- Causa: rateio de desconto da nota inteira distorcia o unit_price.
-- Solução: usar o total REAL pago (já com desconto rateado) como base,
-- e recalcular unit_price = total/quantity. original_price (preço de tabela) é mantido.

UPDATE public.purchases
SET 
  unit_price = ROUND((total / NULLIF(quantity, 0))::numeric, 4),
  discount_amount = GREATEST(
    ROUND((quantity * COALESCE(original_price, 0) - total)::numeric, 2),
    0
  ),
  discount_percentage = CASE 
    WHEN COALESCE(original_price, 0) > 0 AND quantity > 0 THEN
      ROUND((((quantity * original_price - total) / NULLIF(quantity * original_price, 0)) * 100)::numeric, 2)
    ELSE 0
  END
WHERE ABS(total - (quantity * unit_price)) > 0.02
  AND quantity > 0;

-- Limpa original_price quando ficou igual ou menor que unit_price (sem desconto real)
UPDATE public.purchases
SET 
  original_price = NULL,
  discount_amount = 0,
  discount_percentage = 0
WHERE original_price IS NOT NULL 
  AND original_price <= unit_price + 0.001;