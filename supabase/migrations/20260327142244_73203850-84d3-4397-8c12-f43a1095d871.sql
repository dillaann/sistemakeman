
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'a_vista',
  ADD COLUMN IF NOT EXISTS down_payment numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS down_payment_date date,
  ADD COLUMN IF NOT EXISTS remaining_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'aguardando';
