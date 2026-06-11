ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS collection_date DATE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
