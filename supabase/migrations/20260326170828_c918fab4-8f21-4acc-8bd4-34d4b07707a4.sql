ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS internal_notes text;