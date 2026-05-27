DROP POLICY IF EXISTS "Realtime read scoped by topic" ON realtime.messages;

CREATE POLICY "Realtime read scoped by topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN ((topic ~~* '%financial%'::text) OR (topic ~~* '%commission%'::text) OR (topic ~~* '%employee%'::text) OR (topic ~~* '%payroll%'::text) OR (topic ~~* '%hr%'::text) OR (topic ~~* '%salary%'::text) OR (topic ~~* '%fiscal%'::text) OR (topic ~~* '%monthly_closing%'::text) OR (topic ~~* '%weekly_closing%'::text)) THEN (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
    WHEN ((topic ~~* '%sales%'::text) OR (topic ~~* '%sale%'::text)) THEN (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role) OR has_role(auth.uid(), 'marketing'::app_role))
    WHEN ((topic ~~* '%purchase%'::text) OR (topic ~~* '%supplier%'::text) OR (topic ~~* '%material%'::text)) THEN (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
    WHEN ((topic ~~* '%production%'::text) OR (topic ~~* '%work_order%'::text)) THEN (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR has_role(auth.uid(), 'compras'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role))
    ELSE false
  END
);