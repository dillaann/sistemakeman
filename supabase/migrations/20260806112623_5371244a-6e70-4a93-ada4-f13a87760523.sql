DO $$
BEGIN
    -- 1. Atualizar transações vinculadas via work_order_id
    UPDATE public.financial_transactions t
    SET due_date = q.issue_date
    FROM public.work_orders wo
    JOIN public.quotes q ON wo.quote_id = q.id
    WHERE t.work_order_id = wo.id
      AND q.issue_date < '2026-08-01'
      AND t.due_date >= '2026-08-01'
      AND t.type = 'a_receber';

    -- 2. Atualizar transações vinculadas via descrição (casos órfãos ou sem WO vinculada no FT)
    UPDATE public.financial_transactions t
    SET due_date = q.issue_date
    FROM public.quotes q
    WHERE (t.description ILIKE '%' || substring(q.id::text, 1, 8) || '%' OR (t.client_id = q.client_id AND t.amount = q.total))
      AND q.issue_date < '2026-08-01'
      AND t.due_date >= '2026-08-01'
      AND t.type = 'a_receber';
END $$;
