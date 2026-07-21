
-- Sessions
CREATE TABLE public.bank_reconciliation_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  statement_balance NUMERIC,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_reconciliation_sessions TO authenticated;
GRANT ALL ON public.bank_reconciliation_sessions TO service_role;
ALTER TABLE public.bank_reconciliation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/Financeiro manage reconciliation sessions"
  ON public.bank_reconciliation_sessions FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE TRIGGER trg_bank_recon_sessions_updated
  BEFORE UPDATE ON public.bank_reconciliation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Statement entries
CREATE TABLE public.bank_statement_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.bank_reconciliation_sessions(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  entry_time TIME,
  type TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('entrada','saida')),
  amount NUMERIC NOT NULL,
  description TEXT,
  counterparty_name TEXT,
  counterparty_document TEXT,
  pix_key TEXT,
  bank TEXT,
  agency TEXT,
  account TEXT,
  document_number TEXT,
  external_id TEXT,
  raw JSONB,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','conciliado','ignorado','adicionado')),
  matched_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  match_score NUMERIC,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_stmt_entries_session ON public.bank_statement_entries(session_id);
CREATE INDEX idx_bank_stmt_entries_date ON public.bank_statement_entries(entry_date);
CREATE INDEX idx_bank_stmt_entries_matched ON public.bank_statement_entries(matched_transaction_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_entries TO authenticated;
GRANT ALL ON public.bank_statement_entries TO service_role;
ALTER TABLE public.bank_statement_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/Financeiro manage statement entries"
  ON public.bank_statement_entries FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE TRIGGER trg_bank_stmt_entries_updated
  BEFORE UPDATE ON public.bank_statement_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Actions log
CREATE TABLE public.bank_reconciliation_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.bank_reconciliation_sessions(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  statement_entry_id UUID REFERENCES public.bank_statement_entries(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  before JSONB,
  after JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_recon_actions_session ON public.bank_reconciliation_actions(session_id);
GRANT SELECT, INSERT ON public.bank_reconciliation_actions TO authenticated;
GRANT ALL ON public.bank_reconciliation_actions TO service_role;
ALTER TABLE public.bank_reconciliation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/Financeiro read reconciliation actions"
  ON public.bank_reconciliation_actions FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "Admin/Financeiro insert reconciliation actions"
  ON public.bank_reconciliation_actions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
