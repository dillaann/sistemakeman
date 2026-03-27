
-- Table for materials linked to work orders (internal use by production)
CREATE TABLE public.work_order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  material text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'un',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_order_materials ENABLE ROW LEVEL SECURITY;

-- Only admin, producao, compras can view
CREATE POLICY "Admin producao compras can view wo_materials"
  ON public.work_order_materials FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'producao') OR 
    has_role(auth.uid(), 'compras')
  );

-- Only admin and producao can insert/update/delete
CREATE POLICY "Admin producao can manage wo_materials"
  ON public.work_order_materials FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'producao'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'producao'));

-- Purchase requests table
CREATE TABLE public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente',
  requested_by uuid REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin producao compras can view purchase_requests"
  ON public.purchase_requests FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'producao') OR 
    has_role(auth.uid(), 'compras')
  );

CREATE POLICY "Admin producao can insert purchase_requests"
  ON public.purchase_requests FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'producao'));

CREATE POLICY "Admin compras can update purchase_requests"
  ON public.purchase_requests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'compras'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'compras'));

CREATE POLICY "Admin can delete purchase_requests"
  ON public.purchase_requests FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Add material_status to work_orders for tracking
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS material_status text DEFAULT 'nao_solicitado';
