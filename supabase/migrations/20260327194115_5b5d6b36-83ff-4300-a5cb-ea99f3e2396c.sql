CREATE OR REPLACE VIEW public.work_orders_production
WITH (security_invoker = on) AS
SELECT 
  id, quote_id, client_id, status, assigned_to, 
  started_at, completed_at, delivered_at, 
  created_at, updated_at, priority, internal_notes, description
FROM public.work_orders;

GRANT SELECT ON public.work_orders_production TO authenticated;