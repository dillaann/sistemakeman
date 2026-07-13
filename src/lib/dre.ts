import { parseLocalDate } from "@/lib/utils";
import { getDateRange, type PeriodMode } from "@/components/MonthFilter";

/**
 * DRE (Demonstrativo de Resultado do Exercício) calculation engine.
 *
 * Each line is sourced from a SINGLE origin module so the DRE reconciles
 * exactly with those modules. Regimes are never mixed WITHIN a line:
 *  - Receita Bruta  → orçamentos aprovados por data de emissão (competência)
 *  - Compras (CSP)  → compras pagas por data de pagamento (caixa)
 *  - Folha          → fechamentos mensais do RH por mês de referência
 *  - Comissões      → comissões aprovadas/pagas por data de criação
 *  - Marketing      → campanhas que intersectam o período
 *  - Adm/Outras     → saídas financeiras pagas por data de pagamento (caixa)
 */

export interface DateRange {
  start: Date;
  end: Date;
}

export interface DRESources {
  quotes: Array<{ total: number | string; issue_date: string | null; status: string }>;
  transactions: Array<{
    type: string;
    status: string;
    amount: number | string;
    category: string | null;
    due_date: string | null;
    paid_date: string | null;
  }>;
  closings: Array<{ net_pay: number | string; month_ref: string }>;
  commissions: Array<{ amount: number | string; status: string; created_at: string }>;
  campaigns: Array<{ amount_invested: number | string; start_date: string; end_date: string | null }>;
}

export interface DREResult {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  csp: number;
  lucroBruto: number;
  despFolha: number;
  despComissoes: number;
  despMarketing: number;
  despAdmin: number;
  despOutras: number;
  totalDespOp: number;
  resultadoOp: number;
  resultadoLiquido: number;
}

// ---- Category classification (normalized: trim + lowercase, accent-insensitive) ----
const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const CSP_CATEGORIES = ["compras", "compra"];
// These are represented by dedicated module lines → must NOT be recounted in Adm/Outras
const HANDLED_ELSEWHERE = [
  "compras",
  "compra",
  "comissoes de vendedores",
  "marketing",
  "folha de pagamento",
];
const ADMIN_CATEGORIES = [
  "despesas da empresa",
  "almoco de funcionarios",
  "gasolina",
  "pedagio",
  "tarifa bancaria",
  "impostos",
  "divida",
  "juros mrv",
  "prestador de servicos",
  "pagamentos",
];

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

const inRange = (dateStr: string | null | undefined, range: DateRange): boolean => {
  const d = parseLocalDate(dateStr ?? undefined);
  if (!d) return false;
  return d >= range.start && d <= range.end;
};

/** All "YYYY-MM" month keys covered by the range (inclusive). */
export function monthKeysInRange(range: DateRange): string[] {
  const keys: string[] = [];
  const d = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
  while (d <= last) {
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return keys;
}

export function calcDRE(sources: DRESources, range: DateRange): DREResult {
  const { quotes, transactions, closings, commissions, campaigns } = sources;
  const monthKeys = new Set(monthKeysInRange(range));
  const rangeStartStr = `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}-${String(range.start.getDate()).padStart(2, "0")}`;
  const rangeEndStr = `${range.end.getFullYear()}-${String(range.end.getMonth() + 1).padStart(2, "0")}-${String(range.end.getDate()).padStart(2, "0")}`;

  // 1. Receita Bruta — approved quotes by issue_date (competência)
  const receitaBruta = quotes
    .filter((q) => q.status === "aprovado" && inRange(q.issue_date, range))
    .reduce((s, q) => s + num(q.total), 0);

  // 2. Deduções — cancelled receivables in the period (cancelamentos/devoluções)
  const deducoes = transactions
    .filter((t) => t.type === "a_receber" && t.status === "cancelado" && inRange(t.due_date, range))
    .reduce((s, t) => s + num(t.amount), 0);

  const receitaLiquida = receitaBruta - deducoes;

  // 3. CSP — purchases PAID in the period, by paid_date (caixa)
  const paidPayables = transactions.filter(
    (t) => t.type === "a_pagar" && t.status === "pago" && inRange(t.paid_date, range),
  );
  const csp = paidPayables
    .filter((t) => CSP_CATEGORIES.includes(norm(t.category)))
    .reduce((s, t) => s + num(t.amount), 0);

  const lucroBruto = receitaLiquida - csp;

  // 4. Folha — monthly closings whose month_ref falls in the period (competência)
  const despFolha = closings
    .filter((c) => monthKeys.has(c.month_ref))
    .reduce((s, c) => s + num(c.net_pay), 0);

  // 5. Comissões — approved/paid commissions by created_at
  const despComissoes = commissions
    .filter((c) => (c.status === "aprovada" || c.status === "paga") && inRange(c.created_at, range))
    .reduce((s, c) => s + num(c.amount), 0);

  // 6. Marketing — campaigns overlapping the period (same rule as Marketing module)
  const despMarketing = campaigns
    .filter((c) => {
      const cStart = c.start_date;
      const cEnd = c.end_date || c.start_date;
      return cStart <= rangeEndStr && cEnd >= rangeStartStr;
    })
    .reduce((s, c) => s + num(c.amount_invested), 0);

  // 7. Despesas Administrativas — paid payables in admin categories
  const despAdmin = paidPayables
    .filter((t) => ADMIN_CATEGORIES.includes(norm(t.category)))
    .reduce((s, t) => s + num(t.amount), 0);

  // 8. Outras Despesas — remaining paid payables not handled elsewhere nor admin
  const despOutras = paidPayables
    .filter((t) => {
      const c = norm(t.category);
      return !HANDLED_ELSEWHERE.includes(c) && !ADMIN_CATEGORIES.includes(c);
    })
    .reduce((s, t) => s + num(t.amount), 0);

  const totalDespOp = despFolha + despComissoes + despMarketing + despAdmin + despOutras;
  const resultadoOp = lucroBruto - totalDespOp;
  const resultadoLiquido = resultadoOp;

  return {
    receitaBruta,
    deducoes,
    receitaLiquida,
    csp,
    lucroBruto,
    despFolha,
    despComissoes,
    despMarketing,
    despAdmin,
    despOutras,
    totalDespOp,
    resultadoOp,
    resultadoLiquido,
  };
}

/** Compute the range for the previous equivalent period. */
export function previousPeriodRange(refDate: Date, mode: PeriodMode): { refDate: Date; range: DateRange } {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  let prev: Date;
  switch (mode) {
    case "month": prev = new Date(y, m - 1, 1); break;
    case "trimestre": prev = new Date(y, m - 3, 1); break;
    case "semestre": prev = new Date(y, m - 6, 1); break;
    case "ano": prev = new Date(y - 1, m, 1); break;
  }
  return { refDate: prev, range: getDateRange(prev, mode) };
}

/** Compute the range for the same period one year earlier. */
export function sameLastYearRange(refDate: Date, mode: PeriodMode): { refDate: Date; range: DateRange } {
  const prev = new Date(refDate.getFullYear() - 1, refDate.getMonth(), 1);
  return { refDate: prev, range: getDateRange(prev, mode) };
}

export interface DRELineDef {
  label: string;
  key: keyof DREResult;
  kind: "receita" | "deducao" | "subtotal" | "custo" | "despesa" | "total" | "final";
  indent?: number;
}

export const DRE_LINES: DRELineDef[] = [
  { label: "Receita Bruta de Serviços", key: "receitaBruta", kind: "receita" },
  { label: "(-) Deduções da Receita", key: "deducoes", kind: "deducao", indent: 1 },
  { label: "= Receita Líquida", key: "receitaLiquida", kind: "subtotal" },
  { label: "(-) Custos dos Serviços Prestados", key: "csp", kind: "custo", indent: 1 },
  { label: "= Lucro Bruto", key: "lucroBruto", kind: "subtotal" },
  { label: "(-) Folha de Pagamento", key: "despFolha", kind: "despesa", indent: 1 },
  { label: "(-) Comissões de Vendedores", key: "despComissoes", kind: "despesa", indent: 1 },
  { label: "(-) Despesas com Marketing", key: "despMarketing", kind: "despesa", indent: 1 },
  { label: "(-) Despesas Administrativas", key: "despAdmin", kind: "despesa", indent: 1 },
  { label: "(-) Outras Despesas", key: "despOutras", kind: "despesa", indent: 1 },
  { label: "= Total Despesas Operacionais", key: "totalDespOp", kind: "total" },
  { label: "= Resultado Operacional (EBITDA)", key: "resultadoOp", kind: "subtotal" },
  { label: "= Resultado Líquido do Período", key: "resultadoLiquido", kind: "final" },
];
