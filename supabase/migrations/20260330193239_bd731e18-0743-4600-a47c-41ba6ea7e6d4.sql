
-- Table for financial accounts (Bradesco PJ, Caixa, PIX, etc.)
CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'conta_corrente',
  initial_balance numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin financeiro full access financial_accounts"
  ON public.financial_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

-- Table for account movements
CREATE TABLE public.account_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'entrada', 'saida', 'transferencia_entrada', 'transferencia_saida'
  amount numeric NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  category text,
  description text NOT NULL,
  related_account_id uuid REFERENCES public.financial_accounts(id),
  work_order_id uuid,
  client_id uuid,
  supplier_id uuid,
  financial_transaction_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.account_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin financeiro full access account_movements"
  ON public.account_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

-- Trigger for updated_at on financial_accounts
CREATE TRIGGER update_financial_accounts_updated_at
  BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
