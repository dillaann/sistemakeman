-- Recreate trigger for auto-inserting production records
DROP TRIGGER IF EXISTS on_work_order_created ON public.work_orders;

CREATE TRIGGER on_work_order_created
  AFTER INSERT ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_work_order_for_production();

-- Also create trigger for updated_at
DROP TRIGGER IF EXISTS update_production_updated_at ON public.production;

CREATE TRIGGER update_production_updated_at
  BEFORE UPDATE ON public.production
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate any existing work orders that don't have production records
INSERT INTO public.production (os_id, status, priority, responsavel, observacoes)
SELECT wo.id, 
  CASE wo.status
    WHEN 'aguardando' THEN 'Fila de Produção'
    WHEN 'em_producao' THEN 'Em Andamento'
    WHEN 'concluido' THEN 'Finalizado'
    WHEN 'entregue' THEN 'Finalizado'
    ELSE 'Fila de Produção'
  END,
  wo.priority,
  wo.assigned_to,
  wo.internal_notes
FROM public.work_orders wo
WHERE NOT EXISTS (SELECT 1 FROM public.production p WHERE p.os_id = wo.id);