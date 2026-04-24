/**
 * Verificação de integridade: toda compra com payment_status='pago' DEVE ter
 * uma transação financeira (financial_transactions) vinculada via purchase_id.
 * 
 * Histórico: 13 compras de março/2026 marcadas como "pago" ficaram sem
 * lançamento no financeiro, distorcendo o fluxo de caixa.
 */

export interface PurchaseRecord {
  id: string;
  payment_status: string;
  total: number;
}

export interface FinancialTransactionRecord {
  id: string;
  purchase_id: string | null;
  amount: number;
}

export interface IntegrityIssue {
  purchase_id: string;
  reason: string;
  amount: number;
}

export function findPaidPurchasesWithoutTransaction(
  purchases: PurchaseRecord[],
  transactions: FinancialTransactionRecord[],
): IntegrityIssue[] {
  const txByPurchase = new Set(
    transactions
      .filter((t) => t.purchase_id)
      .map((t) => t.purchase_id as string),
  );

  return purchases
    .filter((p) => p.payment_status === "pago")
    .filter((p) => !txByPurchase.has(p.id))
    .map((p) => ({
      purchase_id: p.id,
      reason: "Compra marcada como paga sem transação financeira vinculada",
      amount: p.total,
    }));
}
