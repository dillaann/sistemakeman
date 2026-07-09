
CREATE OR REPLACE FUNCTION public.sync_marketing_campaign_to_financial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id uuid;
  v_status transaction_status;
  v_paid date;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.financial_transaction_id IS NOT NULL THEN
      DELETE FROM public.financial_transactions WHERE id = OLD.financial_transaction_id;
    END IF;
    RETURN OLD;
  END IF;

  v_status := CASE WHEN NEW.payment_status = 'pago' THEN 'pago'::transaction_status ELSE 'pendente'::transaction_status END;
  v_paid := CASE WHEN NEW.payment_status = 'pago' THEN NEW.start_date ELSE NULL END;

  IF NEW.financial_transaction_id IS NOT NULL THEN
    UPDATE public.financial_transactions
    SET description = 'Marketing - ' || NEW.name,
        amount = NEW.amount_invested,
        due_date = NEW.start_date,
        status = v_status,
        paid_date = v_paid,
        category = 'Marketing',
        updated_at = now()
    WHERE id = NEW.financial_transaction_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.financial_transactions (
    type, status, description, amount, due_date, paid_date, category, sync_origin
  ) VALUES (
    'a_pagar'::transaction_type,
    v_status,
    'Marketing - ' || NEW.name,
    NEW.amount_invested,
    NEW.start_date,
    v_paid,
    'Marketing',
    'marketing'
  ) RETURNING id INTO v_transaction_id;

  NEW.financial_transaction_id := v_transaction_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_marketing_insert ON public.marketing_campaigns;
CREATE TRIGGER trg_sync_marketing_insert
BEFORE INSERT ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_campaign_to_financial();

DROP TRIGGER IF EXISTS trg_sync_marketing_update ON public.marketing_campaigns;
CREATE TRIGGER trg_sync_marketing_update
AFTER UPDATE ON public.marketing_campaigns
FOR EACH ROW
WHEN (
  OLD.amount_invested IS DISTINCT FROM NEW.amount_invested
  OR OLD.name IS DISTINCT FROM NEW.name
  OR OLD.start_date IS DISTINCT FROM NEW.start_date
  OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
  OR OLD.financial_transaction_id IS DISTINCT FROM NEW.financial_transaction_id
)
EXECUTE FUNCTION public.sync_marketing_campaign_to_financial();

DROP TRIGGER IF EXISTS trg_sync_marketing_delete ON public.marketing_campaigns;
CREATE TRIGGER trg_sync_marketing_delete
AFTER DELETE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_campaign_to_financial();

-- Backfill existing campaigns that have no linked financial transaction
DO $$
DECLARE
  r RECORD;
  v_id uuid;
BEGIN
  FOR r IN SELECT * FROM public.marketing_campaigns WHERE financial_transaction_id IS NULL LOOP
    INSERT INTO public.financial_transactions (
      type, status, description, amount, due_date, paid_date, category, sync_origin
    ) VALUES (
      'a_pagar'::transaction_type,
      CASE WHEN r.payment_status = 'pago' THEN 'pago'::transaction_status ELSE 'pendente'::transaction_status END,
      'Marketing - ' || r.name,
      r.amount_invested,
      r.start_date,
      CASE WHEN r.payment_status = 'pago' THEN r.start_date ELSE NULL END,
      'Marketing',
      'marketing'
    ) RETURNING id INTO v_id;
    UPDATE public.marketing_campaigns SET financial_transaction_id = v_id WHERE id = r.id;
  END LOOP;
END $$;
