ALTER TABLE public.financial_transactions ADD COLUMN purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL;

CREATE INDEX idx_financial_transactions_purchase_id ON public.financial_transactions(purchase_id);