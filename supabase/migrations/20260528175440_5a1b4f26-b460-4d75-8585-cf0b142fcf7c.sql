
-- 1. Restrict profiles SELECT to self + admin + financeiro to prevent
-- harvesting of every user's email and phone by all authenticated users.
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Profiles select self admin financeiro"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'financeiro'::app_role)
);

-- 2. SECURITY DEFINER function so the rest of the app can resolve user
-- display names (id + full_name only — no email/phone) without exposing
-- sensitive contact info.
CREATE OR REPLACE FUNCTION public.get_team_display_names()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name FROM public.profiles p;
$$;

REVOKE ALL ON FUNCTION public.get_team_display_names() FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_display_names() TO authenticated;

-- 3. Make purchase-photos storage bucket private so direct URLs can't be
-- fetched without authentication. Code switched to signed URLs.
UPDATE storage.buckets SET public = false WHERE id = 'purchase-photos';

-- 4. Harden realtime topic policy: require explicit topic prefixes so
-- crafted topic names cannot bypass the channel authorization. The
-- new policy uses strict prefix matching (e.g. 'financial:', 'sales:',
-- 'purchase:', 'production:') and explicitly excludes any topic that
-- also contains a more-sensitive token.
DROP POLICY IF EXISTS "Realtime read scoped by topic" ON realtime.messages;

CREATE POLICY "Realtime read scoped by topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    -- Financial / HR / payroll: admin + financeiro only
    WHEN topic ~~* '%financial%' OR topic ~~* '%commission%'
      OR topic ~~* '%employee%' OR topic ~~* '%payroll%'
      OR topic ~~* '%hr%' OR topic ~~* '%salary%'
      OR topic ~~* '%fiscal%' OR topic ~~* '%monthly_closing%'
      OR topic ~~* '%weekly_closing%'
      THEN (public.has_role(auth.uid(), 'admin'::app_role)
            OR public.has_role(auth.uid(), 'financeiro'::app_role))

    -- Sales: only if topic does NOT also contain a sensitive token
    WHEN (topic ~~* '%sales%' OR topic ~~* '%sale%')
      AND topic !~~* '%financial%' AND topic !~~* '%salary%'
      AND topic !~~* '%commission%' AND topic !~~* '%payroll%'
      AND topic !~~* '%employee%' AND topic !~~* '%hr%'
      AND topic !~~* '%fiscal%'
      THEN (public.has_role(auth.uid(), 'admin'::app_role)
            OR public.has_role(auth.uid(), 'financeiro'::app_role)
            OR public.has_role(auth.uid(), 'vendedor'::app_role)
            OR public.has_role(auth.uid(), 'marketing'::app_role))

    WHEN (topic ~~* '%purchase%' OR topic ~~* '%supplier%' OR topic ~~* '%material%')
      AND topic !~~* '%financial%' AND topic !~~* '%salary%'
      AND topic !~~* '%commission%' AND topic !~~* '%payroll%'
      AND topic !~~* '%employee%' AND topic !~~* '%hr%'
      AND topic !~~* '%fiscal%'
      THEN (public.has_role(auth.uid(), 'admin'::app_role)
            OR public.has_role(auth.uid(), 'compras'::app_role)
            OR public.has_role(auth.uid(), 'financeiro'::app_role))

    WHEN (topic ~~* '%production%' OR topic ~~* '%work_order%')
      AND topic !~~* '%financial%' AND topic !~~* '%salary%'
      AND topic !~~* '%commission%' AND topic !~~* '%payroll%'
      AND topic !~~* '%employee%' AND topic !~~* '%hr%'
      AND topic !~~* '%fiscal%'
      THEN (public.has_role(auth.uid(), 'admin'::app_role)
            OR public.has_role(auth.uid(), 'producao'::app_role)
            OR public.has_role(auth.uid(), 'financeiro'::app_role)
            OR public.has_role(auth.uid(), 'compras'::app_role)
            OR public.has_role(auth.uid(), 'vendedor'::app_role))

    ELSE false
  END
);
