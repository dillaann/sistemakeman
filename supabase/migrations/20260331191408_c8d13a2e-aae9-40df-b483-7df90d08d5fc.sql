
-- Create work_order_items table to store items copied from quote_items
CREATE TABLE public.work_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  quote_item_id UUID REFERENCES public.quote_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.work_order_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view
CREATE POLICY "Authenticated access work_order_items" ON public.work_order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Admins can delete
CREATE POLICY "Admins can delete work_order_items" ON public.work_order_items
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Backfill: copy items from quote_items to work_order_items for existing OS that have a quote_id
INSERT INTO public.work_order_items (work_order_id, quote_item_id, description, quantity, unit_price, total)
SELECT wo.id, qi.id, qi.description, qi.quantity, qi.unit_price, qi.total
FROM public.work_orders wo
JOIN public.quote_items qi ON qi.quote_id = wo.quote_id
WHERE wo.quote_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.work_order_items woi WHERE woi.work_order_id = wo.id
);
