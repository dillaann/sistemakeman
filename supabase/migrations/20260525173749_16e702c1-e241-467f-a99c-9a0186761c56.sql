
-- ---------- materials ----------
DROP POLICY IF EXISTS "Authenticated access materials" ON public.materials;
CREATE POLICY "Materials read by staff"
  ON public.materials FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras')
      OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'vendedor')
      OR has_role(auth.uid(),'producao'));
CREATE POLICY "Materials write admin compras"
  ON public.materials FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'));
CREATE POLICY "Materials update admin compras"
  ON public.materials FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'));

-- ---------- purchase_order_counters ----------
DROP POLICY IF EXISTS "Authenticated access purchase_order_counters" ON public.purchase_order_counters;
CREATE POLICY "Counters read admin compras"
  ON public.purchase_order_counters FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras') OR has_role(auth.uid(),'financeiro'));
CREATE POLICY "Counters write admin compras"
  ON public.purchase_order_counters FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'));
CREATE POLICY "Counters update admin compras"
  ON public.purchase_order_counters FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'));

-- ---------- Revoke EXECUTE from API roles on trigger-only SECURITY DEFINER functions ----------
REVOKE EXECUTE ON FUNCTION public.handle_new_work_order_for_production() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_financial_transaction_to_account_movement() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_production_data_conclusao() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_payment_status_update() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.validate_financial_transaction_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_account_movement_to_financial_transaction() FROM anon, authenticated, public;
