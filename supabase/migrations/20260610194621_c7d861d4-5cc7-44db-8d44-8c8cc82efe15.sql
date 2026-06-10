ALTER TABLE public.employee_vacations ADD COLUMN IF NOT EXISTS financial_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_vacations TO authenticated;
GRANT ALL ON public.employee_vacations TO service_role;
