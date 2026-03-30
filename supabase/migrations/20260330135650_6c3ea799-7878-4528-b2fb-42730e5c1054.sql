INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-photos', 'purchase-photos', true);

CREATE POLICY "Authenticated users can upload purchase photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'purchase-photos');

CREATE POLICY "Authenticated users can read purchase photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'purchase-photos');

CREATE POLICY "Admin and compras can delete purchase photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'purchase-photos' 
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) 
    OR public.has_role(auth.uid(), 'compras'::public.app_role)
  )
);