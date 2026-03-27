
-- Horas extras por funcionário
CREATE TABLE public.employee_overtime (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  hours numeric NOT NULL,
  percentage numeric NOT NULL DEFAULT 50, -- 50%, 100%, etc.
  calculated_value numeric NOT NULL DEFAULT 0,
  description text,
  month_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_overtime ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access employee_overtime" ON public.employee_overtime FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sábados trabalhados por funcionário
CREATE TABLE public.employee_saturdays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  hours numeric NOT NULL,
  calculated_value numeric NOT NULL DEFAULT 0,
  description text,
  month_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_saturdays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access employee_saturdays" ON public.employee_saturdays FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add overtime and saturday totals to monthly_closings
ALTER TABLE public.monthly_closings 
  ADD COLUMN IF NOT EXISTS total_overtime numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_saturdays numeric NOT NULL DEFAULT 0;
