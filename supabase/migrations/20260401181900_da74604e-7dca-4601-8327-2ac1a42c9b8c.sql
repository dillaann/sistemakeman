
-- Add issue_date column to quotes
ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS issue_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing quotes with created_at date
UPDATE public.quotes
SET issue_date = (created_at AT TIME ZONE 'America/Sao_Paulo')::date
WHERE issue_date = CURRENT_DATE AND created_at < now() - interval '1 day';
