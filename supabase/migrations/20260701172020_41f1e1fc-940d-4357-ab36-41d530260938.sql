DROP POLICY IF EXISTS "Authenticated can view financial_categories" ON public.financial_categories;

CREATE POLICY "Roled users can view financial_categories"
ON public.financial_categories
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
);