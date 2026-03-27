
-- Allow admins to delete profiles
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete quotes
CREATE POLICY "Admins can delete quotes"
ON public.quotes
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete quote_items
CREATE POLICY "Admins can delete quote_items"
ON public.quote_items
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete work_orders
CREATE POLICY "Admins can delete work_orders"
ON public.work_orders
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete clients
CREATE POLICY "Admins can delete clients"
ON public.clients
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete financial_transactions
CREATE POLICY "Admins can delete financial_transactions"
ON public.financial_transactions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete materials
CREATE POLICY "Admins can delete materials"
ON public.materials
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete employees
CREATE POLICY "Admins can delete employees"
ON public.employees
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete commissions
CREATE POLICY "Admins can delete commissions"
ON public.commissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete sales
CREATE POLICY "Admins can delete sales"
ON public.sales
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete sales_commissions  
CREATE POLICY "Admins can delete sales_commissions"
ON public.sales_commissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
