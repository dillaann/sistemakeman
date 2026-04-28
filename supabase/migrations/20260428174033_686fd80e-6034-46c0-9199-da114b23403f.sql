-- Tabela de quinzenas (parcelas) do fechamento mensal de cada funcionário
CREATE TABLE public.salary_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  month_ref text NOT NULL, -- formato YYYY-MM, regime de COMPETÊNCIA (nunca muda)
  installment_number smallint NOT NULL CHECK (installment_number IN (1, 2)),
  amount numeric NOT NULL DEFAULT 0, -- valor líquido a pagar nessa quinzena (editável manualmente)
  expected_date date, -- data prevista (usada em Contas a Pagar)
  payment_date date, -- data REAL do pagamento (regime de caixa, pode estar em mês diferente)
  payment_method text,
  account_id uuid,
  status text NOT NULL DEFAULT 'pendente', -- pendente | pago
  notes text,
  financial_transaction_id uuid, -- vínculo com lançamento de Saída no Financeiro (regime caixa)
  payable_transaction_id uuid, -- vínculo com lançamento em Contas a Pagar (a_pagar pendente)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month_ref, installment_number)
);

ALTER TABLE public.salary_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin financeiro full access salary_installments"
ON public.salary_installments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Authenticated can view salary_installments"
ON public.salary_installments FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_salary_installments_updated_at
BEFORE UPDATE ON public.salary_installments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_salary_installments_month_ref ON public.salary_installments(month_ref);
CREATE INDEX idx_salary_installments_employee ON public.salary_installments(employee_id);