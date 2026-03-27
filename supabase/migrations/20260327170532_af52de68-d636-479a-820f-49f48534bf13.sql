
-- Add ON DELETE CASCADE to quote_items -> quotes
ALTER TABLE public.quote_items DROP CONSTRAINT IF EXISTS quote_items_quote_id_fkey;
ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to work_orders -> quotes
ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_quote_id_fkey;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL;

-- Add ON DELETE CASCADE to work_orders -> clients
ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_client_id_fkey;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to quotes -> clients
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_client_id_fkey;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to sales -> clients
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_client_id_fkey;
ALTER TABLE public.sales ADD CONSTRAINT sales_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to sales -> work_orders
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_work_order_id_fkey;
ALTER TABLE public.sales ADD CONSTRAINT sales_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE SET NULL;

-- Add ON DELETE CASCADE to commissions -> work_orders
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_work_order_id_fkey;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to commissions -> employees
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_employee_id_fkey;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to sales_commissions -> sales
ALTER TABLE public.sales_commissions DROP CONSTRAINT IF EXISTS sales_commissions_sale_id_fkey;
ALTER TABLE public.sales_commissions ADD CONSTRAINT sales_commissions_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to financial_transactions -> clients
ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_client_id_fkey;
ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to financial_transactions -> work_orders
ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_work_order_id_fkey;
ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to employee tables -> employees
ALTER TABLE public.employee_advances DROP CONSTRAINT IF EXISTS employee_advances_employee_id_fkey;
ALTER TABLE public.employee_advances ADD CONSTRAINT employee_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.employee_expenses DROP CONSTRAINT IF EXISTS employee_expenses_employee_id_fkey;
ALTER TABLE public.employee_expenses ADD CONSTRAINT employee_expenses_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.employee_overtime DROP CONSTRAINT IF EXISTS employee_overtime_employee_id_fkey;
ALTER TABLE public.employee_overtime ADD CONSTRAINT employee_overtime_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.employee_saturdays DROP CONSTRAINT IF EXISTS employee_saturdays_employee_id_fkey;
ALTER TABLE public.employee_saturdays ADD CONSTRAINT employee_saturdays_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.employee_vacations DROP CONSTRAINT IF EXISTS employee_vacations_employee_id_fkey;
ALTER TABLE public.employee_vacations ADD CONSTRAINT employee_vacations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.monthly_closings DROP CONSTRAINT IF EXISTS monthly_closings_employee_id_fkey;
ALTER TABLE public.monthly_closings ADD CONSTRAINT monthly_closings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.thirteenth_salary DROP CONSTRAINT IF EXISTS thirteenth_salary_employee_id_fkey;
ALTER TABLE public.thirteenth_salary ADD CONSTRAINT thirteenth_salary_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

-- Add admin DELETE policies to tables that don't have them yet
CREATE POLICY "Admins can delete employee_advances" ON public.employee_advances AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employee_expenses" ON public.employee_expenses AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employee_overtime" ON public.employee_overtime AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employee_saturdays" ON public.employee_saturdays AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employee_vacations" ON public.employee_vacations AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete monthly_closings" ON public.monthly_closings AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete thirteenth_salary" ON public.thirteenth_salary AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete sales_goals" ON public.sales_goals AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete seller_commission_rates" ON public.seller_commission_rates AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
