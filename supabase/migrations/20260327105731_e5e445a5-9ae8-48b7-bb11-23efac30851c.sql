
-- Férias dos funcionários
CREATE TABLE public.employee_vacations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days integer NOT NULL,
  base_salary numeric NOT NULL DEFAULT 0,
  vacation_value numeric NOT NULL DEFAULT 0, -- salário/30 * dias
  constitutional_third numeric NOT NULL DEFAULT 0, -- 1/3 constitucional
  total_value numeric NOT NULL DEFAULT 0,
  reference_period text, -- ex: '2025-03 a 2026-03'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_vacations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access employee_vacations" ON public.employee_vacations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Décimo terceiro
CREATE TABLE public.thirteenth_salary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year integer NOT NULL,
  monthly_provision numeric NOT NULL DEFAULT 0, -- salário / 12
  first_installment numeric NOT NULL DEFAULT 0,
  first_installment_paid boolean NOT NULL DEFAULT false,
  first_installment_date date,
  second_installment numeric NOT NULL DEFAULT 0,
  second_installment_paid boolean NOT NULL DEFAULT false,
  second_installment_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, year)
);

ALTER TABLE public.thirteenth_salary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access thirteenth_salary" ON public.thirteenth_salary FOR ALL TO authenticated USING (true) WITH CHECK (true);
