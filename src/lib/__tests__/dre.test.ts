import { describe, it, expect } from "vitest";
import { calcDRE, monthKeysInRange, type DRESources } from "@/lib/dre";

const range = { start: new Date(2026, 3, 1), end: new Date(2026, 3, 30, 23, 59, 59, 999) }; // Abril/2026

const baseSources: DRESources = {
  quotes: [
    { total: 100000, issue_date: "2026-04-10", status: "aprovado" }, // conta
    { total: 50000, issue_date: "2026-04-15", status: "pendente" }, // ignorado (não aprovado)
    { total: 999, issue_date: "2026-03-31", status: "aprovado" }, // fora do período
  ],
  transactions: [
    // Compras pagas em abril → CSP
    { type: "a_pagar", status: "pago", amount: 20000, category: "Compras", due_date: "2026-04-05", paid_date: "2026-04-05" },
    // Compra pendente → não entra (não paga)
    { type: "a_pagar", status: "pendente", amount: 5000, category: "Compras", due_date: "2026-04-20", paid_date: null },
    // Despesa administrativa paga
    { type: "a_pagar", status: "pago", amount: 3000, category: "Gasolina", due_date: "2026-04-08", paid_date: "2026-04-08" },
    // Outra despesa (categoria não mapeada)
    { type: "a_pagar", status: "pago", amount: 1000, category: "Vale", due_date: "2026-04-09", paid_date: "2026-04-09" },
    // Marketing como transação → NÃO deve recontar (vem do módulo de campanhas)
    { type: "a_pagar", status: "pago", amount: 7777, category: "Marketing", due_date: "2026-04-02", paid_date: "2026-04-02" },
    // Folha como transação → NÃO deve recontar (vem dos fechamentos)
    { type: "a_pagar", status: "pago", amount: 8888, category: "Folha de Pagamento", due_date: "2026-04-03", paid_date: "2026-04-03" },
    // Cancelamento de receita → dedução
    { type: "a_receber", status: "cancelado", amount: 2000, category: "Faturamento", due_date: "2026-04-12", paid_date: null },
  ],
  closings: [
    { net_pay: 40000, month_ref: "2026-04" }, // conta
    { net_pay: 12345, month_ref: "2026-03" }, // fora do período
  ],
  commissions: [
    { amount: 5000, status: "aprovada", created_at: "2026-04-11" }, // conta
    { amount: 3000, status: "paga", created_at: "2026-04-18" }, // conta
    { amount: 1500, status: "pendente", created_at: "2026-04-19" }, // ignorado
  ],
  campaigns: [
    { amount_invested: 6000, start_date: "2026-04-01", end_date: "2026-04-30" }, // conta
    { amount_invested: 500, start_date: "2026-02-01", end_date: "2026-02-28" }, // fora
  ],
};

describe("calcDRE", () => {
  const dre = calcDRE(baseSources, range);

  it("Receita Bruta = orçamentos aprovados por emissão no período", () => {
    expect(dre.receitaBruta).toBe(100000);
  });

  it("Deduções = cancelamentos de receita no período", () => {
    expect(dre.deducoes).toBe(2000);
  });

  it("Receita Líquida = Bruta - Deduções", () => {
    expect(dre.receitaLiquida).toBe(98000);
  });

  it("CSP = compras PAGAS por data de pagamento (exclui pendentes)", () => {
    expect(dre.csp).toBe(20000);
  });

  it("Lucro Bruto = Receita Líquida - CSP", () => {
    expect(dre.lucroBruto).toBe(78000);
  });

  it("Folha = fechamentos do mês de referência", () => {
    expect(dre.despFolha).toBe(40000);
  });

  it("Comissões = aprovadas + pagas no período", () => {
    expect(dre.despComissoes).toBe(8000);
  });

  it("Marketing = campanhas que intersectam o período", () => {
    expect(dre.despMarketing).toBe(6000);
  });

  it("Despesas Administrativas = saídas pagas em categorias admin", () => {
    expect(dre.despAdmin).toBe(3000);
  });

  it("Outras Despesas exclui Compras/Marketing/Folha/Comissões e admin", () => {
    // Apenas o 'Vale' (1000) deve restar; Marketing e Folha não recontam.
    expect(dre.despOutras).toBe(1000);
  });

  it("Total Despesas Operacionais soma todas as despesas", () => {
    expect(dre.totalDespOp).toBe(40000 + 8000 + 6000 + 3000 + 1000);
  });

  it("Resultado Operacional = Lucro Bruto - Total Despesas", () => {
    expect(dre.resultadoOp).toBe(78000 - 58000);
  });

  it("Resultado Líquido igual ao Operacional", () => {
    expect(dre.resultadoLiquido).toBe(20000);
  });
});

describe("monthKeysInRange", () => {
  it("cobre todos os meses de um trimestre", () => {
    const q = { start: new Date(2026, 0, 1), end: new Date(2026, 2, 31, 23, 59, 59, 999) };
    expect(monthKeysInRange(q)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});
