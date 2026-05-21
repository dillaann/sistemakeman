DROP TRIGGER IF EXISTS trg_enforce_purchase_no_auto_discount ON public.purchases;
DROP TRIGGER IF EXISTS trg_sync_purchase_order_total_from_items ON public.purchases;
DROP FUNCTION IF EXISTS public.enforce_purchase_no_auto_discount() CASCADE;
DROP FUNCTION IF EXISTS public.sync_purchase_order_total_from_items() CASCADE;