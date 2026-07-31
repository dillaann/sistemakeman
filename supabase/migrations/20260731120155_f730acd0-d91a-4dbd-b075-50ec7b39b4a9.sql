CREATE TABLE public.cashflow_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  min_daily_balance numeric NOT NULL DEFAULT 5000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.cashflow_settings TO authenticated;
GRANT ALL ON public.cashflow_settings TO service_role;

ALTER TABLE public.cashflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cashflow settings"
  ON public.cashflow_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert cashflow settings"
  ON public.cashflow_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update cashflow settings"
  ON public.cashflow_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_cashflow_settings_updated_at
  BEFORE UPDATE ON public.cashflow_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cashflow_settings (min_daily_balance) VALUES (5000);