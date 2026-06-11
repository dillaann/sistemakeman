-- Add phone column to production table
ALTER TABLE public.production ADD COLUMN IF NOT EXISTS phone TEXT;

-- Grant permissions (standard practice)
GRANT ALL ON public.production TO authenticated;
GRANT ALL ON public.production TO service_role;

-- Ensure RLS is enabled and policies exist
ALTER TABLE public.production ENABLE ROW LEVEL SECURITY;

-- Policy for viewing production
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'production' AND policyname = 'Authenticated users can manage production'
    ) THEN
        CREATE POLICY "Authenticated users can manage production" ON public.production
            FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;
