CREATE TABLE public.employee_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  hours NUMERIC NOT NULL DEFAULT 0,
  day_quantity NUMERIC NOT NULL DEFAULT 1,
  daily_rate NUMERIC NOT NULL DEFAULT 0,
  calculated_value NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  month_ref TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access employee_holidays"
ON public.employee_holidays FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Admins can delete employee_holidays"
ON public.employee_holidays FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_employee_holidays_month ON public.employee_holidays(month_ref);
CREATE INDEX idx_employee_holidays_employee ON public.employee_holidays(employee_id);

ALTER TABLE public.monthly_closings ADD COLUMN IF NOT EXISTS total_holidays NUMERIC NOT NULL DEFAULT 0;