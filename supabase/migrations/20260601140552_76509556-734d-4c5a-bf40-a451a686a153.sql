-- Revoke EXECUTE from public/anon on all SECURITY DEFINER functions

-- Trigger-only functions: revoke from everyone (they run automatically via triggers)
REVOKE EXECUTE ON FUNCTION public.handle_new_work_order_for_production() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_production_data_conclusao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_payment_status_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_financial_transaction_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_account_movement_to_financial_transaction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_financial_transaction_to_account_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- User-facing helper functions: remove anon/public, keep authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.next_purchase_order_number(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_purchase_order_number(date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_team_display_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_display_names() TO authenticated;