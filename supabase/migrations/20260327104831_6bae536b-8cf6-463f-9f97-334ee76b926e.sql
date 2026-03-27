
-- Adiantamentos e vales dos funcionários
CREATE TABLE public.employee_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL DEFAULT 'adiantamento', -- 'adiantamento' or 'vale'
  description text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  month_ref text NOT NULL, -- formato 'YYYY-MM'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access employee_advances" ON public.employee_advances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Gastos vinculados a funcionários
CREATE TABLE public.employee_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  category text NOT NULL, -- 'EPI', 'Uniforme', 'Ferramentas', 'Combustível', 'Outro'
  description text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  month_ref text NOT NULL, -- formato 'YYYY-MM'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access employee_expenses" ON public.employee_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fechamento mensal
CREATE TABLE public.monthly_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month_ref text NOT NULL, -- formato 'YYYY-MM'
  base_salary numeric NOT NULL DEFAULT 0,
  total_advances numeric NOT NULL DEFAULT 0,
  total_expenses numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  paid_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, month_ref)
);

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access monthly_closings" ON public.monthly_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);
