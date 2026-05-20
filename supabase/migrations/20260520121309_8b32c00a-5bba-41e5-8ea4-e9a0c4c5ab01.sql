CREATE OR REPLACE FUNCTION public.enforce_purchase_no_auto_discount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  source_unit_price numeric;
  safe_quantity numeric;
BEGIN
  safe_quantity := COALESCE(NEW.quantity, 0);

  -- If old clients still send original_price/discount fields, treat original_price
  -- as the real unit price typed/extracted and never reduce the saved value.
  source_unit_price := CASE
    WHEN COALESCE(NEW.original_price, 0) > 0 THEN NEW.original_price
    ELSE COALESCE(NEW.unit_price, 0)
  END;

  NEW.unit_price := source_unit_price;
  NEW.total := ROUND((safe_quantity * source_unit_price)::numeric, 2);
  NEW.original_price := NULL;
  NEW.discount_amount := 0;
  NEW.discount_percentage := 0;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_purchase_no_auto_discount ON public.purchases;
CREATE TRIGGER trg_enforce_purchase_no_auto_discount
BEFORE INSERT OR UPDATE ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.enforce_purchase_no_auto_discount();

CREATE OR REPLACE FUNCTION public.sync_purchase_order_total_from_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  affected_order_id uuid;
  corrected_total numeric;
BEGIN
  affected_order_id := COALESCE(NEW.order_id, OLD.order_id);

  IF affected_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(ROUND(SUM(total)::numeric, 2), 0)
    INTO corrected_total
  FROM public.purchases
  WHERE order_id = affected_order_id;

  UPDATE public.purchase_orders
  SET
    total = corrected_total,
    original_total = 0,
    discount_amount = 0,
    updated_at = now()
  WHERE id = affected_order_id;

  UPDATE public.financial_transactions
  SET
    amount = corrected_total,
    updated_at = now()
  WHERE purchase_order_id = affected_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_purchase_order_total_from_items ON public.purchases;
CREATE TRIGGER trg_sync_purchase_order_total_from_items
AFTER INSERT OR UPDATE OR DELETE ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.sync_purchase_order_total_from_items();

-- Corrige imediatamente o pedido reportado: PED-2026-0184 / Ferro Mil.
UPDATE public.purchases p
SET
  unit_price = COALESCE(NULLIF(p.original_price, 0), p.unit_price),
  total = ROUND((p.quantity * COALESCE(NULLIF(p.original_price, 0), p.unit_price))::numeric, 2),
  original_price = NULL,
  discount_amount = 0,
  discount_percentage = 0,
  updated_at = now()
FROM public.purchase_orders po
WHERE p.order_id = po.id
  AND po.order_number = 'PED-2026-0184';

UPDATE public.purchase_orders po
SET
  total = totals.corrected_total,
  original_total = 0,
  discount_amount = 0,
  updated_at = now()
FROM (
  SELECT order_id, ROUND(SUM(total)::numeric, 2) AS corrected_total
  FROM public.purchases
  WHERE order_id IN (
    SELECT id FROM public.purchase_orders WHERE order_number = 'PED-2026-0184'
  )
  GROUP BY order_id
) totals
WHERE po.id = totals.order_id;

UPDATE public.financial_transactions ft
SET
  amount = po.total,
  updated_at = now()
FROM public.purchase_orders po
WHERE ft.purchase_order_id = po.id
  AND po.order_number = 'PED-2026-0184';