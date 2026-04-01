
-- Add data_conclusao column
ALTER TABLE public.production
ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMP WITH TIME ZONE;

-- Create trigger function to set data_conclusao when status changes to Finalizado
CREATE OR REPLACE FUNCTION public.set_production_data_conclusao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Finalizado' AND (OLD.status IS DISTINCT FROM 'Finalizado') THEN
    NEW.data_conclusao = now();
  END IF;
  -- Clear if moving back from Finalizado
  IF OLD.status = 'Finalizado' AND NEW.status <> 'Finalizado' THEN
    NEW.data_conclusao = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
CREATE TRIGGER trigger_set_production_data_conclusao
BEFORE UPDATE ON public.production
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.set_production_data_conclusao();

-- Backfill existing finalized records using updated_at as best approximation
UPDATE public.production
SET data_conclusao = updated_at
WHERE status = 'Finalizado' AND data_conclusao IS NULL;
