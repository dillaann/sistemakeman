
-- 1) Restrict vendedor read of clients to only their own
DROP POLICY IF EXISTS "Clients read by admin financeiro vendedor" ON public.clients;
CREATE POLICY "Clients read admin financeiro" ON public.clients
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'financeiro'::app_role));
CREATE POLICY "Clients read vendedor own" ON public.clients
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'vendedor'::app_role) AND (
      EXISTS (SELECT 1 FROM public.quotes q WHERE q.client_id = clients.id AND q.seller_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.sales s WHERE s.client_id = clients.id AND s.seller_id = auth.uid())
    )
  );

-- 2) Scope realtime.messages by topic / role
DROP POLICY IF EXISTS "Authenticated can read realtime" ON realtime.messages;
CREATE POLICY "Realtime read scoped by topic" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN topic ILIKE '%financial%' OR topic ILIKE '%commission%' OR topic ILIKE '%employee%'
        OR topic ILIKE '%payroll%' OR topic ILIKE '%hr%' OR topic ILIKE '%salary%'
        OR topic ILIKE '%fiscal%' OR topic ILIKE '%monthly_closing%' OR topic ILIKE '%weekly_closing%'
        THEN has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'financeiro'::app_role)
      WHEN topic ILIKE '%sales%' OR topic ILIKE '%sale%'
        THEN has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'financeiro'::app_role) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'marketing'::app_role)
      WHEN topic ILIKE '%purchase%' OR topic ILIKE '%supplier%' OR topic ILIKE '%material%'
        THEN has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'financeiro'::app_role)
      WHEN topic ILIKE '%production%' OR topic ILIKE '%work_order%'
        THEN has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'producao'::app_role) OR has_role(auth.uid(),'financeiro'::app_role) OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'vendedor'::app_role)
      ELSE auth.uid() IS NOT NULL
    END
  );

-- 3) Restrict purchase-photos uploads and listing to admin/compras/financeiro
DROP POLICY IF EXISTS "Authenticated users can upload purchase photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read purchase photos" ON storage.objects;

CREATE POLICY "Purchase photos upload admin compras" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'purchase-photos' AND (
      has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'financeiro'::app_role)
    )
  );

CREATE POLICY "Purchase photos list admin compras financeiro" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'purchase-photos' AND (
      has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'compras'::app_role) OR has_role(auth.uid(),'financeiro'::app_role)
    )
  );
