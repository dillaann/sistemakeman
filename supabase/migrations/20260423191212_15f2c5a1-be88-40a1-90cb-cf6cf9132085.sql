ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'un';
ALTER TABLE public.work_order_items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'un';