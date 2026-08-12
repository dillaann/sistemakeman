WITH first_tx AS (
    SELECT 
        work_order_id,
        MIN(due_date) as min_due
    FROM public.financial_transactions
    WHERE type = 'a_receber'
      AND work_order_id IS NOT NULL
    GROUP BY work_order_id
)
UPDATE public.work_orders wo
SET delivered_at = (ft.min_due + interval '12 hours'),
    updated_at = now()
FROM first_tx ft
WHERE wo.id = ft.work_order_id
  AND (
    (EXTRACT(MONTH FROM wo.delivered_at) != EXTRACT(MONTH FROM ft.min_due))
    OR (EXTRACT(YEAR FROM wo.delivered_at) != EXTRACT(YEAR FROM ft.min_due))
  );