
-- ============================================
-- QUOTES: Replace permissive policy with role-specific ones
-- ============================================
DROP POLICY IF EXISTS "Authenticated access quotes" ON public.quotes;

-- Admin full access
CREATE POLICY "Admin full access quotes"
ON public.quotes FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Vendedor: only own quotes
CREATE POLICY "Vendedor can view own quotes"
ON public.quotes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'vendedor'::app_role) AND seller_id = auth.uid());

CREATE POLICY "Vendedor can insert own quotes"
ON public.quotes FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'vendedor'::app_role) AND seller_id = auth.uid());

CREATE POLICY "Vendedor can update own quotes"
ON public.quotes FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'vendedor'::app_role) AND seller_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'vendedor'::app_role) AND seller_id = auth.uid());

-- Financeiro: can view all quotes (for financial reporting)
CREATE POLICY "Financeiro can view all quotes"
ON public.quotes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));

-- Producao/Compras: can view all quotes (needed for OS/purchase context)
CREATE POLICY "Producao compras can view quotes"
ON public.quotes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

-- ============================================
-- WORK ORDERS: Replace permissive policy with role-specific ones
-- ============================================
DROP POLICY IF EXISTS "Authenticated access work_orders" ON public.work_orders;

-- Admin full access
CREATE POLICY "Admin full access work_orders"
ON public.work_orders FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Vendedor: only OS linked to their own quotes
CREATE POLICY "Vendedor can view own work_orders"
ON public.work_orders FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'vendedor'::app_role) AND (
    EXISTS (SELECT 1 FROM public.quotes WHERE id = quote_id AND seller_id = auth.uid())
  )
);

-- Financeiro: can view all work orders
CREATE POLICY "Financeiro can view all work_orders"
ON public.work_orders FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role));

-- Financeiro can update work orders (for payment status etc)
CREATE POLICY "Financeiro can update work_orders"
ON public.work_orders FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'financeiro'::app_role))
WITH CHECK (has_role(auth.uid(), 'financeiro'::app_role));

-- Producao: full access to work orders (manages production)
CREATE POLICY "Producao full access work_orders"
ON public.work_orders FOR ALL TO authenticated
USING (has_role(auth.uid(), 'producao'::app_role))
WITH CHECK (has_role(auth.uid(), 'producao'::app_role));

-- Compras: can view all work orders
CREATE POLICY "Compras can view work_orders"
ON public.work_orders FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'compras'::app_role));
