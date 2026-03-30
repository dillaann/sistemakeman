ALTER TABLE public.financial_transactions
ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sync_origin text NOT NULL DEFAULT 'system';

CREATE INDEX IF NOT EXISTS idx_financial_transactions_account_id ON public.financial_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_movements_financial_transaction_id ON public.account_movements(financial_transaction_id);

CREATE OR REPLACE FUNCTION public.sync_account_movement_to_financial_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id uuid;
BEGIN
  IF NEW.financial_transaction_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type NOT IN ('entrada', 'saida') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.financial_transactions (
    type,
    status,
    description,
    amount,
    due_date,
    paid_date,
    client_id,
    work_order_id,
    category,
    account_id,
    sync_origin
  ) VALUES (
    CASE WHEN NEW.type = 'entrada' THEN 'a_receber'::transaction_type ELSE 'a_pagar'::transaction_type END,
    'pago'::transaction_status,
    NEW.description,
    NEW.amount,
    NEW.date,
    NEW.date,
    NEW.client_id,
    NEW.work_order_id,
    NEW.category,
    NEW.account_id,
    'account_movement'
  ) RETURNING id INTO v_transaction_id;

  UPDATE public.account_movements
  SET financial_transaction_id = v_transaction_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_financial_transaction_to_account_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sync_origin = 'account_movement' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pago' AND NEW.account_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.account_movements WHERE financial_transaction_id = NEW.id
    ) THEN
      UPDATE public.account_movements
      SET
        account_id = NEW.account_id,
        type = CASE WHEN NEW.type = 'a_receber' THEN 'entrada' ELSE 'saida' END,
        amount = NEW.amount,
        date = COALESCE(NEW.paid_date, NEW.due_date),
        category = NEW.category,
        description = NEW.description,
        client_id = NEW.client_id,
        work_order_id = NEW.work_order_id,
        notes = NULL
      WHERE financial_transaction_id = NEW.id;
    ELSE
      INSERT INTO public.account_movements (
        account_id,
        type,
        amount,
        date,
        category,
        description,
        client_id,
        work_order_id,
        financial_transaction_id
      ) VALUES (
        NEW.account_id,
        CASE WHEN NEW.type = 'a_receber' THEN 'entrada' ELSE 'saida' END,
        NEW.amount,
        COALESCE(NEW.paid_date, NEW.due_date),
        NEW.category,
        NEW.description,
        NEW.client_id,
        NEW.work_order_id,
        NEW.id
      );
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.account_movements WHERE financial_transaction_id = NEW.id
  ) AND (NEW.status <> 'pago' OR NEW.account_id IS NULL) THEN
    DELETE FROM public.account_movements WHERE financial_transaction_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_movement_to_financial_transaction ON public.account_movements;
CREATE TRIGGER trg_sync_account_movement_to_financial_transaction
AFTER INSERT ON public.account_movements
FOR EACH ROW
EXECUTE FUNCTION public.sync_account_movement_to_financial_transaction();

DROP TRIGGER IF EXISTS trg_sync_financial_transaction_to_account_movement ON public.financial_transactions;
CREATE TRIGGER trg_sync_financial_transaction_to_account_movement
AFTER INSERT OR UPDATE ON public.financial_transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_financial_transaction_to_account_movement();