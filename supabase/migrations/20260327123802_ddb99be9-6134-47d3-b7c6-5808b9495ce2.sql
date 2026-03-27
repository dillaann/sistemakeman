
-- Add vendedor to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

-- Create sales table
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  work_order_id UUID REFERENCES public.work_orders(id),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  delivery_deadline DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sales goals table
CREATE TABLE public.sales_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  month_ref TEXT NOT NULL,
  goal_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(seller_id, month_ref)
);

-- Create seller commissions config table
CREATE TABLE public.seller_commission_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL UNIQUE,
  percentage NUMERIC NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sales commissions table
CREATE TABLE public.sales_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  paid_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_commission_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_commissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for sales
CREATE POLICY "Admins can manage all sales" ON public.sales FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sellers can view own sales" ON public.sales FOR SELECT TO authenticated USING (seller_id = auth.uid());
CREATE POLICY "Sellers can insert own sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());
CREATE POLICY "Financeiro can view all sales" ON public.sales FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'financeiro'));

-- RLS for sales_goals
CREATE POLICY "Admins can manage goals" ON public.sales_goals FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sellers can view own goals" ON public.sales_goals FOR SELECT TO authenticated USING (seller_id = auth.uid());

-- RLS for seller_commission_rates
CREATE POLICY "Admins can manage rates" ON public.seller_commission_rates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sellers can view own rate" ON public.seller_commission_rates FOR SELECT TO authenticated USING (seller_id = auth.uid());

-- RLS for sales_commissions
CREATE POLICY "Admins can manage commissions" ON public.sales_commissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sellers can view own commissions" ON public.sales_commissions FOR SELECT TO authenticated USING (seller_id = auth.uid());

-- Enable realtime for sales
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
