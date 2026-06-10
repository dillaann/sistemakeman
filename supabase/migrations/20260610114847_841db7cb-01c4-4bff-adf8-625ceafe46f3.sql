ALTER TABLE public.work_orders ADD COLUMN is_legacy BOOLEAN DEFAULT false;
UPDATE public.work_orders SET is_legacy = true;