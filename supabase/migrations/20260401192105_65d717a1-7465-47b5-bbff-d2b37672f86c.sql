
CREATE OR REPLACE FUNCTION public.validate_financial_transaction_status()
RETURNS trigger AS $$
BEGIN
  -- If due_date is in the future and status is 'pago', force to 'pendente'
  IF NEW.due_date > CURRENT_DATE AND NEW.status = 'pago' THEN
    RAISE LOG 'Future date detected for transaction ID % (Due Date: %, Status: pago). Changing status to pendente.', NEW.id, NEW.due_date;
    NEW.status := 'pendente';
    NEW.paid_date := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER before_insert_update_financial_transaction_status
BEFORE INSERT OR UPDATE ON public.financial_transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_financial_transaction_status();
