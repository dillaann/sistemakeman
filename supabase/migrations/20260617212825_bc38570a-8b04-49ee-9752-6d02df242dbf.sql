-- 1. Remove overly-permissive blanket policy on production (any authenticated user)
DROP POLICY IF EXISTS "Authenticated users can manage production" ON public.production;

-- 2. Lock down production_logs to authenticated users with production-related roles
DROP POLICY IF EXISTS "Users can view production logs" ON public.production_logs;
DROP POLICY IF EXISTS "Users can insert production logs" ON public.production_logs;

CREATE POLICY "Production staff can view production logs"
ON public.production_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'producao'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'vendedor'::app_role)
);

CREATE POLICY "Production staff can insert production logs"
ON public.production_logs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'producao'::app_role)
  )
);

-- 3. Lock down production_occurrences the same way
DROP POLICY IF EXISTS "Users can view occurrences" ON public.production_occurrences;
DROP POLICY IF EXISTS "Users can insert occurrences" ON public.production_occurrences;

CREATE POLICY "Production staff can view occurrences"
ON public.production_occurrences
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'producao'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'vendedor'::app_role)
);

CREATE POLICY "Production staff can insert occurrences"
ON public.production_occurrences
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'producao'::app_role)
  )
);