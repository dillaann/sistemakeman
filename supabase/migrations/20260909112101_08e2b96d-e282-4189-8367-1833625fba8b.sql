ALTER TABLE public.financial_forecasts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'previsto',
  ADD COLUMN IF NOT EXISTS settled_at date,
  ADD COLUMN IF NOT EXISTS settled_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.financial_forecasts
  DROP CONSTRAINT IF EXISTS financial_forecasts_status_check;

ALTER TABLE public.financial_forecasts
  ADD CONSTRAINT financial_forecasts_status_check CHECK (status IN ('previsto','baixado'));

CREATE INDEX IF NOT EXISTS idx_financial_forecasts_status ON public.financial_forecasts(status);