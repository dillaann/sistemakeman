ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'final';

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_client_type_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_client_type_check CHECK (client_type IN ('construtora', 'final'));

ALTER TABLE public.financial_transactions ALTER COLUMN due_date DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_purchase_order_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status = 'pago' THEN
    UPDATE public.financial_transactions
    SET status = 'pago'::transaction_status,
        paid_date = COALESCE(paid_date, NEW.purchase_date, CURRENT_DATE),
        updated_at = now()
    WHERE purchase_order_id = NEW.id
      AND type = 'a_pagar'
      AND status <> 'pago'::transaction_status;
  ELSE
    UPDATE public.financial_transactions
    SET status = 'pendente'::transaction_status,
        paid_date = NULL,
        updated_at = now()
    WHERE purchase_order_id = NEW.id
      AND type = 'a_pagar'
      AND status = 'pago'::transaction_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_purchase_order_payment_status ON public.purchase_orders;

CREATE TRIGGER trg_sync_purchase_order_payment_status
AFTER INSERT OR UPDATE OF payment_status ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_order_payment_status();