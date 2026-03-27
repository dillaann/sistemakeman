
-- Add seller_id column to quotes table
ALTER TABLE public.quotes ADD COLUMN seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
