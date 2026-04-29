ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS daily_rate numeric DEFAULT 0;
UPDATE public.employees SET daily_rate = COALESCE(saturday_value, 0) WHERE daily_rate IS NULL OR daily_rate = 0;