
-- Add fixed pay fields to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS saturday_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hourly_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_notes text;
