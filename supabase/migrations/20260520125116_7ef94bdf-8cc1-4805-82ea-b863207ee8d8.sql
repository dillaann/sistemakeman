-- Recreate / ensure trigger function recalculates quote payment_status reliably
CREATE OR REPLACE FUNCTION public.handle_payment_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_work_order_id UUID;
    v_quote_id UUID;
    v_total_paid NUMERIC;
    v_quote_total NUMERIC;
    v_new_status TEXT;
    v_os_finished BOOLEAN;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_work_order_id := OLD.work_order_id;
    ELSE
        v_work_order_id := NEW.work_order_id;
    END IF;

    IF v_work_order_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT quote_id, total INTO v_quote_id, v_quote_total
    FROM work_orders
    WHERE id = v_work_order_id;

    IF v_quote_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM financial_transactions
    WHERE work_order_id = v_work_order_id
      AND status = 'pago'
      AND type = 'a_receber';

    SELECT (status IN ('aguardando_instalacao', 'entregue')) INTO v_os_finished
    FROM work_orders
    WHERE id = v_work_order_id;

    IF v_total_paid >= v_quote_total AND v_quote_total > 0 THEN
        IF v_os_finished THEN
            v_new_status := 'concluido_pago';
        ELSE
            v_new_status := 'pago_total';
        END IF;
    ELSIF v_total_paid > 0 THEN
        v_new_status := 'pagamento_parcial';
    ELSE
        IF EXISTS (
            SELECT 1 FROM financial_transactions
            WHERE work_order_id = v_work_order_id
              AND status = 'pendente'
              AND type = 'a_receber'
              AND due_date > CURRENT_DATE
        ) THEN
            v_new_status := 'entrada_pendente';
        ELSE
            v_new_status := 'aguardando';
        END IF;
    END IF;

    UPDATE quotes
    SET
        payment_status = v_new_status,
        down_payment = v_total_paid,
        remaining_amount = GREATEST(v_quote_total - v_total_paid, 0),
        updated_at = NOW()
    WHERE id = v_quote_id;

    RETURN NULL;
END;
$$;

-- Attach trigger (was missing). Fires after any change on financial_transactions.
DROP TRIGGER IF EXISTS trg_sync_quote_payment_status ON public.financial_transactions;
CREATE TRIGGER trg_sync_quote_payment_status
AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_payment_status_update();

-- Fix Alice's data: she had 5,950 entry registered on the quote but no paid txn
-- and the Saldo still showed full 11,900. Convert: create paid entry txn for 5,950
-- and reduce the pending Saldo to 5,950.
DO $$
DECLARE
    v_quote_id UUID := '1a398ec3-926b-4110-bf91-c7cefe794136';
    v_wo_id UUID;
    v_client_id UUID;
    v_saldo_id UUID;
BEGIN
    SELECT id, client_id INTO v_wo_id, v_client_id
    FROM work_orders WHERE quote_id = v_quote_id;

    IF v_wo_id IS NULL THEN RETURN; END IF;

    -- Find existing pending saldo
    SELECT id INTO v_saldo_id
    FROM financial_transactions
    WHERE work_order_id = v_wo_id
      AND status = 'pendente'
      AND type = 'a_receber'
    ORDER BY created_at ASC
    LIMIT 1;

    -- Only fix if no paid txn yet
    IF NOT EXISTS (
        SELECT 1 FROM financial_transactions
        WHERE work_order_id = v_wo_id AND status = 'pago' AND type = 'a_receber'
    ) THEN
        INSERT INTO financial_transactions (
            type, description, amount, due_date, paid_date, status, category, work_order_id, client_id
        ) VALUES (
            'a_receber', 'Entrada - Alice (Orçamento ' || substring(v_quote_id::text,1,8) || ')',
            5950, CURRENT_DATE, CURRENT_DATE, 'pago', 'Faturamento - pix', v_wo_id, v_client_id
        );

        IF v_saldo_id IS NOT NULL THEN
            UPDATE financial_transactions
            SET amount = 5950
            WHERE id = v_saldo_id;
        END IF;
    END IF;
END $$;