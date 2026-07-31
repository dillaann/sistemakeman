import { describe, expect, it } from "vitest";
import { analyzeCashFlow, buildCashFlow, buildRecommendations, enumerateDays, type CashFlowEvent } from "@/lib/cashflow";

const d = (s: string) => new Date(`${s}T00:00:00`);

describe("cashflow", () => {
  it("enumera dias inclusivos", () => {
    expect(enumerateDays(d("2026-08-01"), d("2026-08-03"))).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("faz o acumulado bater com o saldo real no dia de hoje", () => {
    const events: CashFlowEvent[] = [
      { date: "2026-08-01", direction: "in", amount: 1000, realized: true, description: "r", source: "financeiro" },
      { date: "2026-08-02", direction: "out", amount: 400, realized: true, description: "p", source: "financeiro" },
      { date: "2026-08-04", direction: "out", amount: 900, realized: false, description: "prev", source: "conta_pagar" },
    ];
    const days = buildCashFlow({
      events,
      start: d("2026-08-01"),
      end: d("2026-08-04"),
      currentBalance: 2000,
      today: d("2026-08-02"),
    });
    expect(days[0].cumulative).toBe(2400); // 1400 abertura + 1000
    expect(days[1].cumulative).toBe(2000); // saldo real hoje
    expect(days[3].cumulative).toBe(1100);
    expect(days[3].isProjected).toBe(true);
  });

  it("identifica dias críticos, pior dia e necessidade de caixa", () => {
    const events: CashFlowEvent[] = [
      { date: "2026-08-02", direction: "out", amount: 3000, realized: false, description: "folha", source: "folha" },
    ];
    const days = buildCashFlow({
      events,
      start: d("2026-08-01"),
      end: d("2026-08-03"),
      currentBalance: 1000,
      today: d("2026-08-01"),
    });
    const analysis = analyzeCashFlow(days, 5000);
    expect(analysis.criticalDays).toHaveLength(3);
    expect(analysis.worstDay?.date).toBe("2026-08-02");
    expect(analysis.worstDay?.cumulative).toBe(-2000);
    expect(analysis.cashNeed).toBe(7000);
    expect(analysis.biggestOutflowDay?.outflow).toBe(3000);
    expect(buildRecommendations(days, analysis).length).toBeGreaterThan(0);
  });

  it("ignora eventos fora do período", () => {
    const days = buildCashFlow({
      events: [{ date: "2026-09-10", direction: "in", amount: 500, realized: false, description: "x", source: "conta_receber" }],
      start: d("2026-08-01"),
      end: d("2026-08-02"),
      currentBalance: 100,
      today: d("2026-08-01"),
    });
    expect(days.every((day) => day.events.length === 0)).toBe(true);
    expect(days[1].cumulative).toBe(100);
  });
});
