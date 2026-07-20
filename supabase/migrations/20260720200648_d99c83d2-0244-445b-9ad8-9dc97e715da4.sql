
-- Counter for paint sheet numbering
CREATE TABLE public.paint_sheet_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.paint_sheet_counters TO authenticated;
GRANT ALL ON public.paint_sheet_counters TO service_role;
ALTER TABLE public.paint_sheet_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paint_sheet_counters admin producao" ON public.paint_sheet_counters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao'));

CREATE OR REPLACE FUNCTION public.next_paint_sheet_number(_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM _date)::integer;
  v_next integer;
BEGIN
  INSERT INTO public.paint_sheet_counters (year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = paint_sheet_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN 'PT-' || v_year || '-' || LPAD(v_next::text, 4, '0');
END;
$$;

-- Paint sheets
CREATE TABLE public.paint_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_number text NOT NULL UNIQUE,
  sheet_date date NOT NULL DEFAULT CURRENT_DATE,
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  responsible text,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','em_pintura','finalizado')),
  completed_at timestamptz,
  attachment_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_paint_sheets_work_order ON public.paint_sheets(work_order_id);
CREATE INDEX idx_paint_sheets_status ON public.paint_sheets(status);
CREATE INDEX idx_paint_sheets_date ON public.paint_sheets(sheet_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paint_sheets TO authenticated;
GRANT ALL ON public.paint_sheets TO service_role;
ALTER TABLE public.paint_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paint_sheets admin producao" ON public.paint_sheets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao'));

CREATE TRIGGER update_paint_sheets_updated_at
  BEFORE UPDATE ON public.paint_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_paint_sheet_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finalizado' AND (OLD.status IS DISTINCT FROM 'finalizado') THEN
    NEW.completed_at = now();
  ELSIF NEW.status <> 'finalizado' AND OLD.status = 'finalizado' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_paint_sheet_completed_at
  BEFORE UPDATE ON public.paint_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_paint_sheet_completed_at();

-- Paint sheet items
CREATE TABLE public.paint_sheet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.paint_sheets(id) ON DELETE CASCADE,
  item_number integer NOT NULL,
  part_name text,
  quantity numeric,
  width numeric,
  height numeric,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_paint_sheet_items_sheet ON public.paint_sheet_items(sheet_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paint_sheet_items TO authenticated;
GRANT ALL ON public.paint_sheet_items TO service_role;
ALTER TABLE public.paint_sheet_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paint_sheet_items admin producao" ON public.paint_sheet_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao'));

-- Storage policies (bucket created via storage tool)
CREATE POLICY "paint-sheets storage admin producao select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'paint-sheets' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao')));
CREATE POLICY "paint-sheets storage admin producao insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'paint-sheets' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao')));
CREATE POLICY "paint-sheets storage admin producao update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'paint-sheets' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao')));
CREATE POLICY "paint-sheets storage admin producao delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'paint-sheets' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao')));
