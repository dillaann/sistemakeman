/**
 * Testes de regressão: vendas sem comissão.
 * Histórico: vendas eram inseridas sem registro em sales_commissions quando
 * o vendedor não tinha taxa cadastrada. Agora SEMPRE gera comissão (default 5%).
 */
import { describe, it, expect } from "vitest";
import {
  calculateCommission,
  DEFAULT_COMMISSION_PERCENTAGE,
} from "@/lib/commission-calculations";

describe("regressão: comissão sempre gerada (mesmo sem taxa)", () => {
  it("usa taxa cadastrada quando disponível", () => {
    const r = calculateCommission({ sale_amount: 10000, rate_percentage: 8 });
    expect(r.amount).toBe(800);
    expect(r.percentage).toBe(8);
    expect(r.used_default).toBe(false);
  });

  it("aplica default 5% quando rate_percentage é null", () => {
    const r = calculateCommission({ sale_amount: 7800, rate_percentage: null });
    expect(r.percentage).toBe(DEFAULT_COMMISSION_PERCENTAGE);
    expect(r.amount).toBe(390);
    expect(r.used_default).toBe(true);
  });

  it("aplica default 5% quando rate_percentage é undefined", () => {
    const r = calculateCommission({ sale_amount: 1000 });
    expect(r.percentage).toBe(5);
    expect(r.amount).toBe(50);
    expect(r.used_default).toBe(true);
  });

  it("aplica default 5% quando rate_percentage é 0", () => {
    const r = calculateCommission({ sale_amount: 2000, rate_percentage: 0 });
    expect(r.percentage).toBe(5);
    expect(r.amount).toBe(100);
    expect(r.used_default).toBe(true);
  });

  it("arredonda para 2 casas decimais (centavos)", () => {
    const r = calculateCommission({ sale_amount: 333.33, rate_percentage: 7 });
    expect(r.amount).toBeCloseTo(23.33, 2);
  });

  it("nunca retorna comissão zero quando há valor de venda", () => {
    const r = calculateCommission({ sale_amount: 100, rate_percentage: null });
    expect(r.amount).toBeGreaterThan(0);
  });
});
