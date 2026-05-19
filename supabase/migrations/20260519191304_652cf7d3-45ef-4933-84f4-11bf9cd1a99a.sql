-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_payment_status_update()
RETURNS TRIGGER AS $$
DECLARE
    v_work_order_id UUID;
    v_quote_id UUID;
    v_total_paid NUMERIC;
    v_quote_total NUMERIC;
    v_new_status TEXT;
    v_os_finished BOOLEAN;
BEGIN
    -- Get the work_order_id from the transaction
    IF (TG_OP = 'DELETE') THEN
        v_work_order_id := OLD.work_order_id;
    ELSE
        v_work_order_id := NEW.work_order_id;
    END IF;

    -- If no work_order_id, nothing to do
    IF v_work_order_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Find the quote linked to this work order
    SELECT quote_id, total INTO v_quote_id, v_quote_total 
    FROM work_orders 
    WHERE id = v_work_order_id;

    -- If no quote, nothing to do
    IF v_quote_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Calculate total paid for this work order
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid 
    FROM financial_transactions 
    WHERE work_order_id = v_work_order_id 
    AND status = 'pago' 
    AND type = 'a_receber';

    -- Check if OS is finished (for concluido_pago status)
    SELECT (status IN ('aguardando_instalacao', 'entregue')) INTO v_os_finished
    FROM work_orders
    WHERE id = v_work_order_id;

    -- Determine new status
    IF v_total_paid >= v_quote_total THEN
        IF v_os_finished THEN
            v_new_status := 'concluido_pago';
        ELSE
            v_new_status := 'pago_total';
        END IF;
    ELSIF v_total_paid > 0 THEN
        v_new_status := 'pagamento_parcial';
    ELSE
        -- Check if there are future pending entries
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

    -- Update the quote
    UPDATE quotes 
    SET 
        payment_status = v_new_status,
        down_payment = v_total_paid,
        remaining_amount = GREATEST(total - v_total_paid, 0),
        updated_at = NOW()
    WHERE id = v_quote_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger on financial_transactions
DROP TRIGGER IF EXISTS tr_update_quote_payment_status ON public.financial_transactions;
CREATE TRIGGER tr_update_quote_payment_status
AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_payment_status_update();

-- 3. Fix Anderson's data
-- Insert missing entrance payment
INSERT INTO financial_transactions (
    type, description, amount, due_date, paid_date, status, category, work_order_id, client_id, payment_method
) VALUES (
    'a_receber', 'Entrada - Anderson santo amar (Orçamento 5752bdc3)', 28600, '2026-05-14', '2026-05-14', 'pago', 'Faturamento', 'c2917ee1-8e76-49a2-9cf5-f99fc9a7d920', 'ebc9b0b7-fef0-41db-82e5-4a1d65a03715', 'pix'
);
-- Adjust pending balance transaction
UPDATE financial_transactions 
SET amount = 28600 
WHERE id = 'a4d7ed4a-0d56-43e5-b73e-22a8632b3742';

-- 4. Fix Jorge's data
-- Insert missing entrance payment
INSERT INTO financial_transactions (
    type, description, amount, due_date, paid_date, status, category, work_order_id, client_id, payment_method
) VALUES (
    'a_receber', 'Entrada - Jorge - Clínica  Palhoça Sorriso (Orçamento 20f4e6df)', 2900, '2026-05-15', '2026-05-15', 'pago', 'Faturamento', 'beccd8a0-71cb-40e6-b68b-0a9a2f2fcd10', '8dc891b1-2ba9-4b25-b5a2-2da33c31fe14', 'pix'
);
-- Adjust pending balance transaction
UPDATE financial_transactions 
SET amount = 2900 
WHERE id = '625b4350-0efc-4671-bd6a-875087536943';

-- 5. Global sync for all approved quotes
UPDATE quotes q
SET 
    payment_status = CASE 
        WHEN sub.paid_total >= q.total THEN 
            CASE WHEN EXISTS (SELECT 1 FROM work_orders w2 WHERE w2.quote_id = q.id AND w2.status IN ('aguardando_instalacao', 'entregue')) THEN 'concluido_pago' ELSE 'pago_total' END
        WHEN sub.paid_total > 0 THEN 'pagamento_parcial'
        WHEN EXISTS (SELECT 1 FROM financial_transactions ft2 JOIN work_orders w3 ON ft2.work_order_id = w3.id WHERE w3.quote_id = q.id AND ft2.status = 'pendente' AND ft2.type = 'a_receber' AND ft2.due_date > CURRENT_DATE) THEN 'entrada_pendente'
        ELSE 'aguardando'
    END,
    down_payment = sub.paid_total,
    remaining_amount = GREATEST(q.total - sub.paid_total, 0)
FROM (
    SELECT w.quote_id, SUM(CASE WHEN ft.status = 'pago' AND ft.type = 'a_receber' THEN ft.amount ELSE 0 END) as paid_total
    FROM work_orders w
    JOIN financial_transactions ft ON w.id = ft.work_order_id
    GROUP BY w.quote_id
) sub
WHERE q.id = sub.quote_id AND q.status = 'aprovado';
