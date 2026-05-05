CREATE TABLE IF NOT EXISTS public.employee_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  date date NOT NULL,
  day_quantity numeric NOT NULL DEFAULT 1,
  reason text,
  daily_rate numeric NOT NULL DEFAULT 0,
  calculated_value numeric NOT NULL DEFAULT 0,
  month_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access employee_absences" ON public.employee_absences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins can delete employee_absences" ON public.employee_absences
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.employee_absences
  ADD CONSTRAINT employee_absences_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.monthly_closings
  ADD COLUMN IF NOT EXISTS total_absences numeric NOT NULL DEFAULT 0;