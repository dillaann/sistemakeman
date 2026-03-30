
-- Add origem_venda to quotes table (nullable initially so existing data isn't broken)
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS origem_venda text DEFAULT 'empresa';

-- Add origem_venda to work_orders table
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS origem_venda text DEFAULT 'empresa';

-- Add origem_venda to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS origem_venda text DEFAULT 'empresa';
