
ALTER TABLE public.purchases 
ADD COLUMN client_id uuid,
ADD COLUMN work_order_id uuid;
