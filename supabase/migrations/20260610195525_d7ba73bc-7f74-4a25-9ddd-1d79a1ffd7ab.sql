-- Insert missing financial transactions for purchases that are marked as 'pago' but don't have a linked transaction
INSERT INTO public.financial_transactions (
    type,
    description,
    amount,
    due_date,
    paid_date,
    category,
    status,
    payment_method,
    client_id,
    work_order_id,
    purchase_id,
    sync_origin
)
SELECT 
    'a_pagar'::public.transaction_type,
    'Compra: ' || p.material || ' - ' || COALESCE(s.name, 'Fornecedor'),
    p.total,
    COALESCE(p.due_date, p.purchase_date),
    p.purchase_date,
    'Compras',
    'pago'::public.transaction_status,
    COALESCE(p.payment_method, 'pix'),
    p.client_id,
    p.work_order_id,
    p.id,
    'migration_fix'
FROM public.purchases p
LEFT JOIN public.suppliers s ON p.supplier_id = s.id
LEFT JOIN public.financial_transactions ft ON ft.purchase_id = p.id
WHERE p.payment_status = 'pago' 
  AND p.order_id IS NULL -- Skip items that belong to a purchase order (handled separately or already synced)
  AND ft.id IS NULL;

-- Handle items that might have been marked as paid without creating a transaction
-- This ensures the system stays consistent
