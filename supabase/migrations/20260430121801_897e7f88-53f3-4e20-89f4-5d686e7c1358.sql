
-- 1. Sequence counters
CREATE TABLE IF NOT EXISTS public.purchase_order_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
ALTER TABLE public.purchase_order_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access purchase_order_counters"
  ON public.purchase_order_counters FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2. purchase_orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE,
  supplier_id uuid,
  client_id uuid,
  work_order_id uuid,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text DEFAULT 'pix',
  payment_status text NOT NULL DEFAULT 'pendente',
  total numeric NOT NULL DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  original_total numeric DEFAULT 0,
  invoice_number text,
  due_date date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access purchase_orders"
  ON public.purchase_orders FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete purchase_orders"
  ON public.purchase_orders FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. next_purchase_order_number
CREATE OR REPLACE FUNCTION public.next_purchase_order_number(_date date DEFAULT CURRENT_DATE)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM _date)::integer;
  v_next integer;
BEGIN
  INSERT INTO public.purchase_order_counters (year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = purchase_order_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN 'PED-' || v_year || '-' || LPAD(v_next::text, 4, '0');
END;
$$;

-- 4. Columns
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS order_id uuid;
CREATE INDEX IF NOT EXISTS idx_purchases_order_id ON public.purchases(order_id);
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS purchase_order_id uuid;
CREATE INDEX IF NOT EXISTS idx_financial_tx_purchase_order_id ON public.financial_transactions(purchase_order_id);

-- 5. Migrate existing purchases (group by supplier+date+payment_method)
DO $$
DECLARE
  r RECORD;
  v_order_id uuid;
  v_order_number text;
  v_year integer;
  v_last integer;
BEGIN
  FOR r IN
    SELECT
      supplier_id,
      purchase_date,
      COALESCE(payment_method, 'pix') AS payment_method,
      SUM(total) AS total_sum,
      SUM(COALESCE(discount_amount, 0)) AS discount_sum,
      (ARRAY_AGG(invoice_number) FILTER (WHERE invoice_number IS NOT NULL))[1] AS invoice_number,
      (ARRAY_AGG(due_date) FILTER (WHERE due_date IS NOT NULL))[1] AS due_date,
      (ARRAY_AGG(payment_status ORDER BY created_at DESC))[1] AS payment_status,
      (ARRAY_AGG(client_id) FILTER (WHERE client_id IS NOT NULL))[1] AS client_id,
      (ARRAY_AGG(work_order_id) FILTER (WHERE work_order_id IS NOT NULL))[1] AS work_order_id,
      (ARRAY_AGG(notes) FILTER (WHERE notes IS NOT NULL))[1] AS notes,
      MIN(created_at) AS created_at
    FROM public.purchases
    WHERE order_id IS NULL
    GROUP BY supplier_id, purchase_date, COALESCE(payment_method, 'pix')
  LOOP
    v_year := EXTRACT(YEAR FROM r.purchase_date)::integer;
    INSERT INTO public.purchase_order_counters (year, last_number)
    VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = purchase_order_counters.last_number + 1
    RETURNING last_number INTO v_last;
    v_order_number := 'PED-' || v_year || '-' || LPAD(v_last::text, 4, '0');

    INSERT INTO public.purchase_orders (
      order_number, supplier_id, client_id, work_order_id,
      purchase_date, payment_method, payment_status,
      total, discount_amount, invoice_number, due_date, notes, created_at
    ) VALUES (
      v_order_number, r.supplier_id, r.client_id, r.work_order_id,
      r.purchase_date, r.payment_method, COALESCE(r.payment_status, 'pendente'),
      r.total_sum, r.discount_sum, r.invoice_number, r.due_date, r.notes, r.created_at
    ) RETURNING id INTO v_order_id;

    UPDATE public.purchases p
    SET order_id = v_order_id
    WHERE p.supplier_id IS NOT DISTINCT FROM r.supplier_id
      AND p.purchase_date = r.purchase_date
      AND COALESCE(p.payment_method, 'pix') = r.payment_method
      AND p.order_id IS NULL;
  END LOOP;
END $$;

-- 6. Consolidate financial transactions per order
DO $$
DECLARE
  o RECORD;
  v_status transaction_status;
  v_paid_date date;
  v_supplier_name text;
  v_old_tx_ids uuid[];
BEGIN
  FOR o IN SELECT * FROM public.purchase_orders LOOP
    SELECT ARRAY_AGG(ft.id)
      INTO v_old_tx_ids
    FROM public.financial_transactions ft
    JOIN public.purchases p ON p.id = ft.purchase_id
    WHERE p.order_id = o.id;

    SELECT
      CASE WHEN BOOL_OR(status = 'pago') THEN 'pago'::transaction_status
           ELSE 'pendente'::transaction_status END,
      MAX(paid_date)
    INTO v_status, v_paid_date
    FROM public.financial_transactions
    WHERE id = ANY(COALESCE(v_old_tx_ids, ARRAY[]::uuid[]));

    IF v_status IS NULL THEN
      v_status := CASE WHEN o.payment_status = 'pago' THEN 'pago'::transaction_status ELSE 'pendente'::transaction_status END;
      v_paid_date := CASE WHEN v_status = 'pago' THEN o.purchase_date ELSE NULL END;
    END IF;

    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = o.supplier_id;

    DELETE FROM public.account_movements
    WHERE financial_transaction_id = ANY(COALESCE(v_old_tx_ids, ARRAY[]::uuid[]));

    DELETE FROM public.financial_transactions
    WHERE id = ANY(COALESCE(v_old_tx_ids, ARRAY[]::uuid[]));

    INSERT INTO public.financial_transactions (
      type, status, description, amount, due_date, paid_date,
      category, payment_method, purchase_order_id, sync_origin, client_id, work_order_id
    ) VALUES (
      'a_pagar'::transaction_type,
      v_status,
      'Compra — ' || COALESCE(v_supplier_name, 'Fornecedor') || ' — Pedido ' || COALESCE(o.order_number, ''),
      o.total,
      COALESCE(o.due_date, o.purchase_date),
      v_paid_date,
      'Compras',
      o.payment_method,
      o.id,
      'purchase_order',
      o.client_id,
      o.work_order_id
    );
  END LOOP;
END $$;
