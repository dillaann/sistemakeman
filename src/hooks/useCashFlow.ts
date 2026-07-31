import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { localDateString } from "@/lib/utils";
import type { CashFlowEvent } from "@/lib/cashflow";

/**
 * Saldo real atual das contas ativas:
 * saldo inicial + movimentações de entrada - movimentações de saída.
 */
export function useCurrentBalance() {
  return useQuery({
    queryKey: ["cashflow-current-balance"],
    queryFn: async () => {
      const [{ data: accounts, error: accErr }, movements] = await Promise.all([
        supabase.from("financial_accounts").select("id, initial_balance").eq("active", true),
        fetchAllRows<{ account_id: string; type: string; amount: number }>(() =>
          supabase.from("account_movements").select("account_id, type, amount"),
        ),
      ]);
      if (accErr) throw accErr;
      const activeIds = new Set((accounts ?? []).map((a) => a.id));
      const initial = (accounts ?? []).reduce((s, a) => s + Number(a.initial_balance ?? 0), 0);
      const moved = movements
        .filter((m) => activeIds.has(m.account_id))
        .reduce((s, m) => s + (m.type === "entrada" ? Number(m.amount) : -Number(m.amount)), 0);
      return initial + moved;
    },
  });
}

export function useCashFlowSettings() {
  return useQuery({
    queryKey: ["cashflow-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cashflow_settings")
        .select("id, min_daily_balance")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

interface Range {
  start: Date;
  end: Date;
}

/** Reúne todos os eventos de caixa (realizados e previstos) do período. */
export function useCashFlowEvents({ start, end }: Range) {
  const from = localDateString(start);
  const to = localDateString(end);

  return useQuery({
    queryKey: ["cashflow-events", from, to],
    queryFn: async (): Promise<CashFlowEvent[]> => {
      const [transactions, installments, purchases] = await Promise.all([
        fetchAllRows<{
          id: string;
          type: string;
          status: string;
          amount: number;
          due_date: string;
          paid_date: string | null;
          description: string;
          category: string | null;
          purchase_id: string | null;
          exclude_from_totals: boolean;
        }>(() =>
          supabase
            .from("financial_transactions")
            .select("id, type, status, amount, due_date, paid_date, description, category, purchase_id, exclude_from_totals")
            .neq("status", "cancelado"),
        ),
        fetchAllRows<{
          id: string;
          amount: number;
          status: string;
          expected_date: string | null;
          payment_date: string | null;
          financial_transaction_id: string | null;
          payable_transaction_id: string | null;
          installment_number: number;
          month_ref: string;
        }>(() =>
          supabase
            .from("salary_installments")
            .select(
              "id, amount, status, expected_date, payment_date, financial_transaction_id, payable_transaction_id, installment_number, month_ref",
            ),
        ),
        fetchAllRows<{
          id: string;
          total: number;
          payment_status: string;
          due_date: string | null;
          purchase_date: string;
          material: string;
        }>(() =>
          supabase
            .from("purchases")
            .select("id, total, payment_status, due_date, purchase_date, material")
            .neq("payment_status", "pago"),
        ),
      ]);

      const events: CashFlowEvent[] = [];
      const linkedPurchaseIds = new Set(transactions.map((t) => t.purchase_id).filter(Boolean) as string[]);

      for (const t of transactions) {
        if (t.exclude_from_totals) continue;
        const isIn = t.type === "a_receber";
        const realized = t.status === "pago";
        const date = realized ? t.paid_date : t.due_date;
        if (!date || date < from || date > to) continue;
        events.push({
          date,
          direction: isIn ? "in" : "out",
          amount: Number(t.amount ?? 0),
          realized,
          description: t.description || (isIn ? "Recebimento" : "Pagamento"),
          source: realized ? "financeiro" : isIn ? "conta_receber" : "conta_pagar",
        });
      }

      // Quinzenas de funcionários que ainda não geraram lançamento financeiro.
      for (const inst of installments) {
        if (inst.financial_transaction_id || inst.payable_transaction_id) continue;
        const realized = inst.status === "pago";
        const date = realized ? inst.payment_date : inst.expected_date;
        if (!date || date < from || date > to) continue;
        events.push({
          date,
          direction: "out",
          amount: Number(inst.amount ?? 0),
          realized,
          description: `Folha - ${inst.installment_number}ª quinzena ${inst.month_ref}`,
          source: "folha",
        });
      }

      // Compras pendentes que ainda não possuem saída financeira vinculada.
      for (const p of purchases) {
        if (linkedPurchaseIds.has(p.id)) continue;
        const date = p.due_date || p.purchase_date;
        if (!date || date < from || date > to) continue;
        events.push({
          date,
          direction: "out",
          amount: Number(p.total ?? 0),
          realized: false,
          description: `Compra - ${p.material}`,
          source: "compra",
        });
      }

      return events;
    },
  });
}
