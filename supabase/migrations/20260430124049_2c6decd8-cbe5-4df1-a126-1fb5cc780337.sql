ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD CONSTRAINT purchase_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD CONSTRAINT purchase_orders_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE SET NULL;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;