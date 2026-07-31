REVOKE ALL ON FUNCTION public.next_paint_sheet_number(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_inventory_code(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_inventory_receipt_from_purchase() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_inventory_count() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.next_paint_sheet_number(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_inventory_code(date) TO authenticated, service_role;