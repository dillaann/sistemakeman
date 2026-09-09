CREATE TABLE public.financial_forecasts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('entrada','saida')),
  amount numeric NOT NULL DEFAULT 0,
  forecast_date date NOT NULL,
  category text,
  notes text,
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','weekly','monthly','bimonthly','quarterly','semiannual','annual','custom_months')),
  series_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_forecasts TO authenticated;
GRANT ALL ON public.financial_forecasts TO service_role;

ALTER TABLE public.financial_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage forecasts"
ON public.financial_forecasts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_financial_forecasts_date ON public.financial_forecasts (forecast_date);
CREATE INDEX idx_financial_forecasts_series ON public.financial_forecasts (series_id);

CREATE TRIGGER update_financial_forecasts_updated_at
BEFORE UPDATE ON public.financial_forecasts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();