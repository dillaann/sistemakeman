
-- Create production table
CREATE TABLE public.production (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Fila de Produção',
  priority TEXT DEFAULT 'normal',
  responsavel UUID REFERENCES public.employees(id),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(os_id)
);

-- Enable RLS
ALTER TABLE public.production ENABLE ROW LEVEL SECURITY;

-- RLS: Admin and Producao can do everything
CREATE POLICY "Admin full access production"
  ON public.production FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Producao full access production"
  ON public.production FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producao'))
  WITH CHECK (public.has_role(auth.uid(), 'producao'));

-- Compras can view production
CREATE POLICY "Compras can view production"
  ON public.production FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'compras'));

-- Trigger to auto-insert production record on new work order
CREATE OR REPLACE FUNCTION public.handle_new_work_order_for_production()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.production WHERE os_id = NEW.id) THEN
    INSERT INTO public.production (os_id, status, priority, responsavel, observacoes)
    VALUES (NEW.id, 'Fila de Produção', NEW.priority, NEW.assigned_to, NEW.internal_notes);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_work_order_created
  AFTER INSERT ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_work_order_for_production();

-- Updated_at trigger
CREATE TRIGGER update_production_updated_at
  BEFORE UPDATE ON public.production
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.production;

-- Migrate existing work orders
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
