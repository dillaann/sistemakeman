
-- Add 'compras' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'compras';

-- Create suppliers table
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cpf_cnpj text,
  phone text,
  email text,
  products text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access suppliers" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Create purchases table
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  material text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'un',
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  invoice_number text,
  payment_method text DEFAULT 'pix',
  payment_status text NOT NULL DEFAULT 'pendente',
  due_date date,
  discount_percentage numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access purchases" ON public.purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete purchases" ON public.purchases FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
