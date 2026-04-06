
CREATE TABLE public.financial_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'ambos' CHECK (type IN ('entrada', 'saida', 'ambos')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin financeiro full access financial_categories"
ON public.financial_categories
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY "Authenticated can view financial_categories"
ON public.financial_categories
FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.financial_categories (name, type, is_default) VALUES
  ('Venda de Produto', 'entrada', true),
  ('Serviço', 'entrada', true),
  ('Faturamento', 'entrada', true),
  ('Sinal/Entrada', 'entrada', true),
  ('Comissões de Vendedores', 'saida', true),
  ('Compra de Material', 'saida', true),
  ('Folha de Pagamento', 'saida', true),
  ('Marketing', 'saida', true),
  ('Outros', 'ambos', true);
