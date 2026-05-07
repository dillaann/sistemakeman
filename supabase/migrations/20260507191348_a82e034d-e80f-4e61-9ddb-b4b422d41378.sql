-- Adicionar colunas na tabela employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'mensal' CHECK (payment_type IN ('mensal', 'semanal'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS weekly_salary NUMERIC DEFAULT 0;

-- Criar tabela de fechamentos semanais
CREATE TABLE IF NOT EXISTS public.weekly_closings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month_ref TEXT NOT NULL, -- formato YYYY-MM
  week_number INTEGER NOT NULL, -- 1 a 5
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  weeks_worked NUMERIC DEFAULT 1, -- 1 para completa, 0.5 para parcial
  base_value NUMERIC DEFAULT 0,
  overtime_value NUMERIC DEFAULT 0,
  saturday_value NUMERIC DEFAULT 0,
  holiday_value NUMERIC DEFAULT 0,
  absence_value NUMERIC DEFAULT 0,
  advances_value NUMERIC DEFAULT 0,
  net_pay NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  payment_date DATE,
  payment_method TEXT,
  financial_account_id UUID REFERENCES public.financial_accounts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weekly_closings ENABLE ROW LEVEL SECURITY;

-- Create policies (assuming similar to other HR tables)
CREATE POLICY "Weekly closings are viewable by authenticated users" ON public.weekly_closings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Weekly closings can be inserted by admin/financeiro" ON public.weekly_closings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Weekly closings can be updated by admin/financeiro" ON public.weekly_closings FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Weekly closings can be deleted by admin/financeiro" ON public.weekly_closings FOR DELETE USING (auth.role() = 'authenticated');

-- Adicionar vínculo de semana nas tabelas de eventos para funcionários semanais
ALTER TABLE public.employee_overtime ADD COLUMN IF NOT EXISTS weekly_closing_id UUID REFERENCES public.weekly_closings(id) ON DELETE SET NULL;
ALTER TABLE public.employee_saturdays ADD COLUMN IF NOT EXISTS weekly_closing_id UUID REFERENCES public.weekly_closings(id) ON DELETE SET NULL;
ALTER TABLE public.employee_holidays ADD COLUMN IF NOT EXISTS weekly_closing_id UUID REFERENCES public.weekly_closings(id) ON DELETE SET NULL;
ALTER TABLE public.employee_absences ADD COLUMN IF NOT EXISTS weekly_closing_id UUID REFERENCES public.weekly_closings(id) ON DELETE SET NULL;
ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS weekly_closing_id UUID REFERENCES public.weekly_closings(id) ON DELETE SET NULL;

-- Trigger para updated_at
CREATE TRIGGER update_weekly_closings_updated_at
BEFORE UPDATE ON public.weekly_closings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
