-- Corrige compras com purchase_date em 2024-04 que foram criadas em 2026-04
-- (erro de digitação no ano durante o registro via foto/IA).
-- O ano correto é 2026, mantendo dia e mês.
UPDATE public.purchases
SET purchase_date = (purchase_date + INTERVAL '2 years')::date
WHERE created_at >= '2026-04-01'
  AND created_at < '2026-05-01'
  AND purchase_date >= '2024-04-01'
  AND purchase_date < '2024-05-01';