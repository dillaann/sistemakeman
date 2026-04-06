ALTER TABLE public.work_order_materials 
ADD COLUMN purchase_status text NOT NULL DEFAULT 'pendente';

COMMENT ON COLUMN public.work_order_materials.purchase_status IS 'Status de compra individual: pendente, em_cotacao, comprado';