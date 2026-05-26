-- Drop existing restrictive policies for clients
DROP POLICY IF EXISTS "Clients read admin financeiro" ON public.clients;
DROP POLICY IF EXISTS "Clients read vendedor own" ON public.clients;
DROP POLICY IF EXISTS "Clients insert by admin financeiro vendedor" ON public.clients;
DROP POLICY IF EXISTS "Clients update by admin financeiro" ON public.clients;

-- 1. SELECT: Admin, Financeiro and Vendedor can read all clients
CREATE POLICY "Clients read admin financeiro vendedor"
ON public.clients
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'financeiro'::app_role) OR 
  has_role(auth.uid(), 'vendedor'::app_role)
);

-- 2. INSERT: Admin, Financeiro and Vendedor can insert
-- We add created_by column if it doesn't exist to track ownership
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'clients' AND COLUMN_NAME = 'created_by') THEN
    ALTER TABLE public.clients ADD COLUMN created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid();
  END IF;
END $$;

CREATE POLICY "Clients insert access"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'financeiro'::app_role) OR 
  has_role(auth.uid(), 'vendedor'::app_role)
);

-- 3. UPDATE: Admin/Financeiro full access, Vendedor only their own
CREATE POLICY "Clients update access"
ON public.clients
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'financeiro'::app_role) OR 
  (has_role(auth.uid(), 'vendedor'::app_role) AND created_by = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'financeiro'::app_role) OR 
  (has_role(auth.uid(), 'vendedor'::app_role) AND created_by = auth.uid())
);
