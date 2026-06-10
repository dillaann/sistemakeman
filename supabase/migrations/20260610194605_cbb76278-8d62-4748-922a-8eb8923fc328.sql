-- Update production table to include missing fields for the new UI
ALTER TABLE public.production ADD COLUMN IF NOT EXISTS percent_complete INTEGER DEFAULT 0;
ALTER TABLE public.production ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.production ADD COLUMN IF NOT EXISTS data_entrega TIMESTAMP WITH TIME ZONE;

-- Ensure priority is handled (it already exists in Row definition but let's make sure it's consistent)
-- Existing priority is string, we'll keep it but suggest UI handles Normal, Alta, Urgente

-- Create production_logs table for history if it doesn't exist
CREATE TABLE IF NOT EXISTS public.production_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id UUID NOT NULL REFERENCES public.production(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT ON public.production_logs TO authenticated;
GRANT ALL ON public.production_logs TO service_role;
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view production logs" ON public.production_logs FOR SELECT USING (true);
CREATE POLICY "Users can insert production logs" ON public.production_logs FOR INSERT WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Create occurrences table for notes and events
CREATE TABLE IF NOT EXISTS public.production_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id UUID NOT NULL REFERENCES public.production(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    author_name TEXT
);

GRANT SELECT, INSERT ON public.production_occurrences TO authenticated;
GRANT ALL ON public.production_occurrences TO service_role;
ALTER TABLE public.production_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view occurrences" ON public.production_occurrences FOR SELECT USING (true);
CREATE POLICY "Users can insert occurrences" ON public.production_occurrences FOR INSERT WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
