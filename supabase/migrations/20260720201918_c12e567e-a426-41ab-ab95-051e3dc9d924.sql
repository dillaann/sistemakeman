
-- Counter
CREATE TABLE IF NOT EXISTS public.inventory_item_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.inventory_item_counters TO authenticated;
GRANT ALL ON public.inventory_item_counters TO service_role;
ALTER TABLE public.inventory_item_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inventory counters readable by auth" ON public.inventory_item_counters FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_inventory_code(_date date DEFAULT CURRENT_DATE)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year int := EXTRACT(YEAR FROM _date)::int; v_next int;
BEGIN
  INSERT INTO public.inventory_item_counters(year, last_number) VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = inventory_item_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN 'ALM-' || v_year || '-' || LPAD(v_next::text, 4, '0');
END;$$;

-- Items
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Outro' CHECK (category IN ('Ferro','Tinta','Parafuso','Ferramenta','EPI','Consumível','Outro')),
  unit text NOT NULL DEFAULT 'un',
  current_qty numeric NOT NULL DEFAULT 0,
  min_qty numeric NOT NULL DEFAULT 0,
  location text,
  unit_price numeric NOT NULL DEFAULT 0,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inventory items admin/almox full" ON public.inventory_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role));
CREATE POLICY "Inventory items read producao/compras" ON public.inventory_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'producao'::app_role) OR has_role(auth.uid(),'compras'::app_role));

CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_inventory_item_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := public.next_inventory_code();
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_inventory_items_code BEFORE INSERT ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_item_code();

-- Movements
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('entrada','saida','devolucao','ajuste')),
  quantity numeric NOT NULL,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  client_name text,
  responsible text,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_mov_item ON public.inventory_movements(item_id);
CREATE INDEX idx_inv_mov_wo ON public.inventory_movements(work_order_id);
CREATE INDEX idx_inv_mov_purchase ON public.inventory_movements(purchase_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inv mov admin/almox full" ON public.inventory_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role));
CREATE POLICY "Inv mov read producao/compras" ON public.inventory_movements FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'producao'::app_role) OR has_role(auth.uid(),'compras'::app_role));

CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := CASE
      WHEN NEW.type IN ('entrada','devolucao') THEN NEW.quantity
      WHEN NEW.type = 'saida' THEN -NEW.quantity
      WHEN NEW.type = 'ajuste' THEN NEW.quantity
    END;
    UPDATE public.inventory_items SET current_qty = current_qty + v_delta WHERE id = NEW.item_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := CASE
      WHEN OLD.type IN ('entrada','devolucao') THEN -OLD.quantity
      WHEN OLD.type = 'saida' THEN OLD.quantity
      WHEN OLD.type = 'ajuste' THEN -OLD.quantity
    END;
    UPDATE public.inventory_items SET current_qty = current_qty + v_delta WHERE id = OLD.item_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;$$;
CREATE TRIGGER trg_inventory_movement_apply
  AFTER INSERT OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- Receipts
CREATE TABLE public.inventory_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  expected_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  unit text,
  unit_price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','parcial','recebido')),
  received_at timestamptz,
  received_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_receipt_purchase ON public.inventory_receipts(purchase_id);
CREATE INDEX idx_inv_receipt_status ON public.inventory_receipts(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_receipts TO authenticated;
GRANT ALL ON public.inventory_receipts TO service_role;
ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inv receipts admin/almox/compras full" ON public.inventory_receipts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role) OR has_role(auth.uid(),'compras'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role) OR has_role(auth.uid(),'compras'::app_role));

CREATE TRIGGER trg_inventory_receipts_updated_at BEFORE UPDATE ON public.inventory_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_inventory_receipt_from_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_status = 'pago' AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'pago') THEN
    IF NOT EXISTS (SELECT 1 FROM public.inventory_receipts WHERE purchase_id = NEW.id) THEN
      INSERT INTO public.inventory_receipts (purchase_id, material_name, expected_qty, unit, unit_price, status)
      VALUES (NEW.id, NEW.material, NEW.quantity, NEW.unit, NEW.unit_price, 'aguardando');
    END IF;
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_purchases_create_receipt
  AFTER INSERT OR UPDATE OF payment_status ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.create_inventory_receipt_from_purchase();

-- Requests
CREATE TABLE public.inventory_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  requested_qty numeric NOT NULL DEFAULT 0,
  delivered_qty numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','atendido','faltando','compra_solicitada')),
  requested_by uuid,
  fulfilled_by uuid,
  fulfilled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_req_wo ON public.inventory_requests(work_order_id);
CREATE INDEX idx_inv_req_status ON public.inventory_requests(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_requests TO authenticated;
GRANT ALL ON public.inventory_requests TO service_role;
ALTER TABLE public.inventory_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inv req admin/almox full" ON public.inventory_requests FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role));
CREATE POLICY "Inv req producao insert" ON public.inventory_requests FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'producao'::app_role));
CREATE POLICY "Inv req producao select" ON public.inventory_requests FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'producao'::app_role) OR has_role(auth.uid(),'compras'::app_role));

CREATE TRIGGER trg_inventory_requests_updated_at BEFORE UPDATE ON public.inventory_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Counts
CREATE TABLE public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_date date NOT NULL DEFAULT CURRENT_DATE,
  responsible text,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','finalizado')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_counts TO authenticated;
GRANT ALL ON public.inventory_counts TO service_role;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inv counts admin/almox full" ON public.inventory_counts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role));

CREATE TRIGGER trg_inventory_counts_updated_at BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  system_qty numeric NOT NULL DEFAULT 0,
  physical_qty numeric,
  difference numeric,
  adjustment_reason text CHECK (adjustment_reason IN ('quebra','perda','erro','furto','outro')),
  notes text
);
CREATE INDEX idx_inv_count_item_cid ON public.inventory_count_items(count_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_items TO authenticated;
GRANT ALL ON public.inventory_count_items TO service_role;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inv count items admin/almox full" ON public.inventory_count_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'almoxarifado'::app_role));

CREATE OR REPLACE FUNCTION public.finalize_inventory_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_diff numeric;
BEGIN
  IF NEW.status = 'finalizado' AND OLD.status <> 'finalizado' THEN
    FOR r IN SELECT * FROM public.inventory_count_items WHERE count_id = NEW.id AND physical_qty IS NOT NULL LOOP
      v_diff := r.physical_qty - r.system_qty;
      IF v_diff <> 0 THEN
        INSERT INTO public.inventory_movements (item_id, type, quantity, movement_date, reason, responsible, notes)
        VALUES (r.item_id, 'ajuste', v_diff, NEW.count_date, COALESCE(r.adjustment_reason,'inventario'), NEW.responsible, 'Ajuste de inventário #' || NEW.id::text);
        UPDATE public.inventory_count_items SET difference = v_diff WHERE id = r.id;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_inventory_count_finalize
  AFTER UPDATE OF status ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.finalize_inventory_count();
