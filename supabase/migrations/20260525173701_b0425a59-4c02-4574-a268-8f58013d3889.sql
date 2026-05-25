
-- =========================================================================
-- 1. Helper: drop overly permissive policies and replace by role-based ones
-- =========================================================================

-- ---------- clients ----------
DROP POLICY IF EXISTS "Authenticated access clients" ON public.clients;
CREATE POLICY "Clients read by admin financeiro vendedor"
  ON public.clients FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'vendedor'));
CREATE POLICY "Clients insert by admin financeiro vendedor"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'vendedor'));
CREATE POLICY "Clients update by admin financeiro"
  ON public.clients FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'));

-- ---------- employees ----------
DROP POLICY IF EXISTS "Authenticated access employees" ON public.employees;
CREATE POLICY "Employees full access admin financeiro"
  ON public.employees FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'));

-- ---------- commissions ----------
DROP POLICY IF EXISTS "Authenticated access commissions" ON public.commissions;
CREATE POLICY "Commissions full access admin financeiro"
  ON public.commissions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'));

-- ---------- payroll detail tables ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employee_absences','employee_advances','employee_overtime',
    'employee_saturdays','employee_holidays','employee_expenses',
    'employee_vacations','monthly_closings','thirteenth_salary'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated access %1$s" ON public.%1$s', t);
    EXECUTE format($f$
      CREATE POLICY "%1$s admin financeiro full" ON public.%1$s
      FOR ALL TO authenticated
      USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'))
      WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'))
    $f$, t);
  END LOOP;
END$$;

-- ---------- salary_installments / salary_payments ----------
DROP POLICY IF EXISTS "Authenticated can view salary_installments" ON public.salary_installments;
DROP POLICY IF EXISTS "Authenticated can view salary_payments" ON public.salary_payments;

-- ---------- weekly_closings (rewrite) ----------
DROP POLICY IF EXISTS "Weekly closings are viewable by authenticated users" ON public.weekly_closings;
DROP POLICY IF EXISTS "Weekly closings can be deleted by admin/financeiro" ON public.weekly_closings;
DROP POLICY IF EXISTS "Weekly closings can be inserted by admin/financeiro" ON public.weekly_closings;
DROP POLICY IF EXISTS "Weekly closings can be updated by admin/financeiro" ON public.weekly_closings;
CREATE POLICY "Weekly closings admin financeiro full"
  ON public.weekly_closings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'));

-- ---------- financial_transactions ----------
DROP POLICY IF EXISTS "Authenticated access financial" ON public.financial_transactions;
CREATE POLICY "Financial transactions admin financeiro full"
  ON public.financial_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'));

-- ---------- fiscal_invoices ----------
DROP POLICY IF EXISTS "Authenticated access fiscal_invoices" ON public.fiscal_invoices;
CREATE POLICY "Fiscal invoices admin financeiro full"
  ON public.fiscal_invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'));

-- ---------- suppliers ----------
DROP POLICY IF EXISTS "Authenticated access suppliers" ON public.suppliers;
CREATE POLICY "Suppliers read admin financeiro compras"
  ON public.suppliers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'compras'));
CREATE POLICY "Suppliers write admin compras"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'));
CREATE POLICY "Suppliers update admin compras"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras'));

-- ---------- purchases / purchase_orders ----------
DROP POLICY IF EXISTS "Authenticated access purchases" ON public.purchases;
CREATE POLICY "Purchases admin compras financeiro full"
  ON public.purchases FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras') OR has_role(auth.uid(),'financeiro'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras') OR has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "Authenticated access purchase_orders" ON public.purchase_orders;
CREATE POLICY "Purchase orders admin compras financeiro full"
  ON public.purchase_orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras') OR has_role(auth.uid(),'financeiro'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'compras') OR has_role(auth.uid(),'financeiro'));

-- ---------- quote_items (mirror quotes policies) ----------
DROP POLICY IF EXISTS "Authenticated access quote_items" ON public.quote_items;
CREATE POLICY "Quote items admin full"
  ON public.quote_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Quote items financeiro view"
  ON public.quote_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'financeiro'));
CREATE POLICY "Quote items producao compras view"
  ON public.quote_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'producao') OR has_role(auth.uid(),'compras'));
CREATE POLICY "Quote items vendedor own select"
  ON public.quote_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'vendedor') AND EXISTS (
    SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.seller_id = auth.uid()
  ));
CREATE POLICY "Quote items vendedor own insert"
  ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'vendedor') AND EXISTS (
    SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.seller_id = auth.uid()
  ));
CREATE POLICY "Quote items vendedor own update"
  ON public.quote_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'vendedor') AND EXISTS (
    SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.seller_id = auth.uid()
  ))
  WITH CHECK (has_role(auth.uid(),'vendedor') AND EXISTS (
    SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.seller_id = auth.uid()
  ));

-- =========================================================================
-- 2. Storage: fiscal-invoices bucket private + restricted policies
-- =========================================================================
UPDATE storage.buckets SET public = false WHERE id = 'fiscal-invoices';

DROP POLICY IF EXISTS "Anyone can view fiscal invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload fiscal invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update fiscal invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete fiscal invoices" ON storage.objects;

CREATE POLICY "Fiscal invoices read admin financeiro"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fiscal-invoices'
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro')));
CREATE POLICY "Fiscal invoices insert admin financeiro"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fiscal-invoices'
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro')));
CREATE POLICY "Fiscal invoices update admin financeiro"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fiscal-invoices'
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro')));
CREATE POLICY "Fiscal invoices delete admin financeiro"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fiscal-invoices'
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro')));

-- =========================================================================
-- 3. Realtime.messages: only authenticated users can subscribe
-- =========================================================================
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read realtime" ON realtime.messages;
CREATE POLICY "Authenticated can read realtime"
  ON realtime.messages FOR SELECT TO authenticated USING (true);

-- =========================================================================
-- 4. Revoke EXECUTE from anon on SECURITY DEFINER helpers in public schema
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.next_purchase_order_number(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.next_purchase_order_number(date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
