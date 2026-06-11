-- Add status_producao column to work_orders if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'status_producao') THEN
    ALTER TABLE public.work_orders ADD COLUMN status_producao text DEFAULT 'aguardando';
  END IF;
END $$;

-- Update existing work_orders to have a default status_producao if they don't
UPDATE public.work_orders SET status_producao = 'aguardando' WHERE status_producao IS NULL;

-- Ensure that when a quote is approved, the work_order is created with status_producao = 'aguardando'
-- This logic usually lives in the application code, but we ensure the DB default is set.
ALTER TABLE public.work_orders ALTER COLUMN status_producao SET DEFAULT 'aguardando';

-- Grant permissions (standard practice in this environment)
GRANT ALL ON public.work_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
