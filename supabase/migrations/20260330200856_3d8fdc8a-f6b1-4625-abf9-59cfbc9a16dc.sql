
CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  platform text NOT NULL DEFAULT 'meta_ads',
  amount_invested numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  objective text DEFAULT 'leads',
  notes text,
  leads_generated integer DEFAULT 0,
  clicks integer DEFAULT 0,
  impressions integer DEFAULT 0,
  payment_status text DEFAULT 'pendente',
  financial_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin marketing full access marketing_campaigns" ON public.marketing_campaigns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role));

CREATE POLICY "Admins can delete marketing_campaigns" ON public.marketing_campaigns
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.marketing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cac_limit numeric DEFAULT 500,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access marketing_settings" ON public.marketing_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Marketing can view settings" ON public.marketing_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'marketing'::app_role));

INSERT INTO public.marketing_settings (cac_limit) VALUES (500);
