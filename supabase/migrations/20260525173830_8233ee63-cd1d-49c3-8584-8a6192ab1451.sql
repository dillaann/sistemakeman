
DROP POLICY IF EXISTS "Authenticated access work_order_items" ON public.work_order_items;
CREATE POLICY "Work order items admin full"
  ON public.work_order_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Work order items read staff"
  ON public.work_order_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'producao') OR has_role(auth.uid(),'compras'));
CREATE POLICY "Work order items insert financeiro producao"
  ON public.work_order_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'producao'));
CREATE POLICY "Work order items update financeiro producao"
  ON public.work_order_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'producao'))
  WITH CHECK (has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'producao'));
