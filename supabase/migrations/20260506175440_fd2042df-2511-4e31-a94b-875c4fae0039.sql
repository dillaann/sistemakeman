ALTER TABLE public.salary_installments 
ADD COLUMN period_start DATE,
ADD COLUMN period_end DATE;

COMMENT ON COLUMN public.salary_installments.period_start IS 'Data de início do período da quinzena';
COMMENT ON COLUMN public.salary_installments.period_end IS 'Data de fim do período da quinzena';