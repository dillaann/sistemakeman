-- Remover a restrição que limita a 2 quinzenas
ALTER TABLE public.salary_installments DROP CONSTRAINT IF EXISTS salary_installments_installment_number_check;
