
CREATE TABLE public.salary_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month_ref text NOT NULL,
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'pix',
  account_id uuid REFERENCES public.financial_accounts(id),
  notes text,
  financial_transaction_id uuid REFERENCES public.financial_transactions(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin financeiro full access salary_payments"
  ON public.salary_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Authenticated can view salary_payments"
  ON public.salary_payments FOR SELECT TO authenticated
  USING (true);
