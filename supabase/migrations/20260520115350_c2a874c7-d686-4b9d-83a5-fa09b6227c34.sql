DO $$
DECLARE
  v_order_id uuid;
  v_current_total numeric;
  v_target_total numeric := 2532;
  v_factor numeric;
BEGIN
  SELECT id, total
    INTO v_order_id, v_current_total
  FROM public.purchase_orders
  WHERE order_number = 'PED-2026-0183'
     OR (total BETWEEN 2263 AND 2264 AND created_at >= now() - interval '2 hours')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Pedido recente não encontrado para correção.';
    RETURN;
  END IF;

  IF COALESCE(v_current_total, 0) > 0 THEN
    v_factor := v_target_total / v_current_total;

    UPDATE public.purchases
    SET
      unit_price = unit_price * v_factor,
      total = total * v_factor,
      original_price = NULL,
      discount_amount = 0,
      discount_percentage = 0,
      updated_at = now()
    WHERE order_id = v_order_id;
  END IF;

  UPDATE public.purchase_orders
  SET
    total = v_target_total,
    original_total = 0,
    discount_amount = 0,
    updated_at = now()
  WHERE id = v_order_id;

  UPDATE public.financial_transactions
  SET
    amount = v_target_total,
    updated_at = now()
  WHERE purchase_order_id = v_order_id;
END $$;