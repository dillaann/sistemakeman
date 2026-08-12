UPDATE public.work_orders wo
SET delivered_at = (ft.due_date + interval '12 hours'),
    updated_at = now()
FROM public.financial_transactions ft
WHERE ft.work_order_id = wo.id
  AND ft.type = 'a_receber'
  AND (
    (EXTRACT(MONTH FROM wo.delivered_at) != EXTRACT(MONTH FROM ft.due_date))
    OR (EXTRACT(YEAR FROM wo.delivered_at) != EXTRACT(YEAR FROM ft.due_date))
  );