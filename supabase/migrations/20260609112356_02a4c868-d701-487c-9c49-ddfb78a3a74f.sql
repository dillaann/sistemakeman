ALTER TABLE public.salary_installments ADD COLUMN IF NOT EXISTS payable_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.thirteenth_salary ADD COLUMN IF NOT EXISTS financial_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.employee_vacations ADD COLUMN IF NOT EXISTS financial_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL;

-- No need for extra grants as these are existing tables, but good practice to ensure permissions for new columns if needed (not applicable for basic postgrest)