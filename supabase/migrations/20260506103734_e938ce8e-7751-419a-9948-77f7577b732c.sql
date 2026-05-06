
-- 1. Corrigir registros onde a transação "Saldo" foi incorretamente marcada como paga
-- Critério: existe uma "Entrada"/"Recebimento" pago E uma "Saldo" pago, e q.down_payment < q.total
-- (significa que o quote registra apenas a entrada como recebida)

WITH bad_saldos AS (
  SELECT ft.id as ft_id, q.id as q_id, q.total - q.down_payment as expected_saldo
  FROM financial_transactions ft
  JOIN work_orders wo ON wo.id = ft.work_order_id
  JOIN quotes q ON q.id = wo.quote_id
  WHERE ft.type = 'a_receber'
    AND ft.status = 'pago'
    AND ft.description ILIKE 'Saldo -%'
    AND q.down_payment > 0
    AND q.down_payment < q.total
    AND EXISTS (
      SELECT 1 FROM financial_transactions ft2
      WHERE ft2.work_order_id = ft.work_order_id
        AND ft2.type = 'a_receber'
        AND ft2.status = 'pago'
        AND ft2.id <> ft.id
        AND (ft2.description ILIKE 'Entrada -%' OR ft2.description ILIKE 'Recebimento -%')
    )
)
UPDATE financial_transactions ft
SET status = 'pendente', paid_date = NULL,
    amount = bs.expected_saldo
FROM bad_saldos bs
WHERE ft.id = bs.ft_id;

-- 2. Atualizar status dos quotes afetados (incluindo Jussamara especificamente)
UPDATE quotes q
SET payment_status = 'pagamento_parcial',
    remaining_amount = q.total - q.down_payment
WHERE q.payment_type = 'entrada_restante'
  AND q.down_payment > 0
  AND q.down_payment < q.total
  AND q.payment_status = 'pago_total';
