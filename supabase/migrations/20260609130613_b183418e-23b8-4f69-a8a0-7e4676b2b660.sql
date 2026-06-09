-- 1) Add explicit UPDATE policy for purchase-photos bucket to control overwrites
DROP POLICY IF EXISTS "Purchase photos update admin compras financeiro" ON storage.objects;
CREATE POLICY "Purchase photos update admin compras financeiro"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'purchase-photos'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
)
WITH CHECK (
  bucket_id = 'purchase-photos'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
);

-- 2) Replace substring-based realtime topic gating with exact channel allowlist
DROP POLICY IF EXISTS "Realtime read scoped by topic" ON realtime.messages;
CREATE POLICY "Realtime read scoped by topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE topic
    WHEN 'dashboard-realtime' THEN
      has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)
    WHEN 'quotes-ft-changes' THEN
      has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)
    WHEN 'quotes-wo-changes' THEN
      has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role)
    WHEN 'marketing-sales-realtime' THEN
      has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR has_role(auth.uid(), 'marketing'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role)
    WHEN 'production-realtime' THEN
      has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR has_role(auth.uid(), 'compras'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role)
    ELSE false
  END
);