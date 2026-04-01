
CREATE TABLE public.fiscal_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('nfe_entrada', 'nfe_saida', 'nfse_emitida', 'nfse_recebida')),
  invoice_number text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  entity_name text NOT NULL,
  entity_cnpj text,
  description text,
  service_description text,
  amount numeric NOT NULL DEFAULT 0,
  icms_amount numeric DEFAULT 0,
  taxes text,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'cancelada', 'pendente')),
  payment_status text DEFAULT 'pendente' CHECK (payment_status IN ('pago', 'pendente')),
  payment_date date,
  file_url text,
  quote_id uuid,
  work_order_id uuid,
  purchase_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access fiscal_invoices"
  ON public.fiscal_invoices FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete fiscal_invoices"
  ON public.fiscal_invoices FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_fiscal_invoices_updated_at
  BEFORE UPDATE ON public.fiscal_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('fiscal-invoices', 'fiscal-invoices', true);

CREATE POLICY "Authenticated users can upload fiscal invoices"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'fiscal-invoices');

CREATE POLICY "Anyone can view fiscal invoices"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fiscal-invoices');

CREATE POLICY "Authenticated users can update fiscal invoices"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'fiscal-invoices');

CREATE POLICY "Admins can delete fiscal invoice files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'fiscal-invoices' AND public.has_role(auth.uid(), 'admin'::app_role));
