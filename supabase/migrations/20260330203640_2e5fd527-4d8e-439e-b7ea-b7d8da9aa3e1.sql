
CREATE POLICY "Marketing can view marketing sales"
ON public.sales
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'marketing'::app_role)
  AND origem_venda = 'marketing'
);
