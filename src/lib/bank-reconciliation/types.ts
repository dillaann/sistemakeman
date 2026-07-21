export type StatementDirection = "entrada" | "saida";

export interface ParsedStatementEntry {
  entry_date: string; // YYYY-MM-DD
  entry_time?: string | null;
  type?: string | null;
  direction: StatementDirection;
  amount: number;
  description?: string | null;
  counterparty_name?: string | null;
  counterparty_document?: string | null;
  pix_key?: string | null;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  document_number?: string | null;
  external_id?: string | null;
  raw?: Record<string, unknown>;
}

export interface FinancialTxCandidate {
  id: string;
  type: "a_receber" | "a_pagar";
  amount: number;
  due_date: string;
  paid_date?: string | null;
  description?: string | null;
  category?: string | null;
  status?: string | null;
  client_name?: string | null;
  supplier_name?: string | null;
}

export interface MatchResult {
  entryIndex: number;
  transactionId: string | null;
  score: number;
  breakdown: string[];
  top: Array<{ transactionId: string; score: number; breakdown: string[] }>;
}
