-- 1. Add missing FK so employee_holidays joins to employees in PostgREST
ALTER TABLE public.employee_holidays
  ADD CONSTRAINT employee_holidays_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

-- 2. Recalculate existing overtime records: value = overtime_hourly_rate * hours (no multiplier)
UPDATE public.employee_overtime AS o
SET calculated_value = ROUND((COALESCE(e.overtime_hourly_rate, 0) * o.hours)::numeric, 2),
    percentage = 0
FROM public.employees e
WHERE o.employee_id = e.id;

-- 3. Recalculate monthly_closings totals for affected months
UPDATE public.monthly_closings mc
SET total_overtime = COALESCE(sub.total, 0)
FROM (
  SELECT employee_id, month_ref, SUM(calculated_value) AS total
  FROM public.employee_overtime
  GROUP BY employee_id, month_ref
) sub
WHERE mc.employee_id = sub.employee_id AND mc.month_ref = sub.month_ref;

-- Recompute net_pay for those closings
UPDATE public.monthly_closings
SET net_pay = base_salary + total_overtime + total_saturdays + total_holidays - total_advances - total_expenses;