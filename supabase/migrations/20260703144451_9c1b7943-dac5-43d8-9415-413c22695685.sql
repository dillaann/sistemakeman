DROP POLICY IF EXISTS "Clients read admin financeiro vendedor" ON public.clients;
CREATE POLICY "Clients read admin financeiro vendedor producao"
ON public.clients FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'vendedor'::app_role)
  OR has_role(auth.uid(), 'producao'::app_role)
);