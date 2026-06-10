-- Step 1: Add new columns to quotes table
ALTER TABLE public.quotes 
ADD COLUMN IF NOT EXISTS billing_date DATE,
ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'Aguardando entrada';

-- Step 2: Add new columns to work_orders table
ALTER TABLE public.work_orders
ADD COLUMN IF NOT EXISTS billing_date DATE,
ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'Aguardando entrada',
ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(10,2) DEFAULT 0;

-- Step 3: Grant permissions (standard procedure)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
GRANT ALL ON public.work_orders TO service_role;

-- Step 4: Ensure RLS is active (it should be, but let's be explicit)
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- No new policies needed if existing ones cover the roles, 
-- but ensuring they are accessible.
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quotes' AND policyname = 'Vendedores podem gerenciar orçamentos') THEN
        CREATE POLICY "Vendedores podem gerenciar orçamentos" ON public.quotes FOR ALL USING (auth.uid() = seller_id OR auth.uid() = created_by) WITH CHECK (auth.uid() = seller_id OR auth.uid() = created_by);
    END IF;
END $$;
