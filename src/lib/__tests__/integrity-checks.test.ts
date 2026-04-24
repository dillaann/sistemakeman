/**
 * Testes de regressão: compras pagas sem transação financeira.
 */
import { describe, it, expect } from "vitest";
import { findPaidPurchasesWithoutTransaction } from "@/lib/integrity-checks";

describe("regressão: compra paga sem transação financeira", () => {
  it("não reporta nada quando todas as compras pagas têm transação", () => {
    const issues = findPaidPurchasesWithoutTransaction(
      [
        { id: "p1", payment_status: "pago", total: 100 },
        { id: "p2", payment_status: "pago", total: 200 },
      ],
      [
        { id: "t1", purchase_id: "p1", amount: 100 },
        { id: "t2", purchase_id: "p2", amount: 200 },
      ],
    );
    expect(issues).toEqual([]);
  });

  it("reporta compra paga sem transação financeira (regressão real)", () => {
    const issues = findPaidPurchasesWithoutTransaction(
      [
        { id: "p1", payment_status: "pago", total: 1835.5 },
        { id: "p2", payment_status: "pago", total: 100 },
      ],
      [{ id: "t1", purchase_id: "p2", amount: 100 }],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].purchase_id).toBe("p1");
    expect(issues[0].amount).toBe(1835.5);
  });

  it("ignora compras pendentes (não precisam de transação ainda)", () => {
    const issues = findPaidPurchasesWithoutTransaction(
      [{ id: "p1", payment_status: "pendente", total: 500 }],
      [],
    );
    expect(issues).toEqual([]);
  });

  it("ignora transações sem purchase_id (despesas avulsas)", () => {
    const issues = findPaidPurchasesWithoutTransaction(
      [{ id: "p1", payment_status: "pago", total: 100 }],
      [{ id: "t1", purchase_id: null, amount: 100 }],
    );
    expect(issues).toHaveLength(1);
  });

  it("detecta múltiplas compras órfãs em lote (cenário março/2026)", () => {
    const purchases = Array.from({ length: 13 }, (_, i) => ({
      id: `p${i}`,
      payment_status: "pago",
      total: 141.15,
    }));
    const issues = findPaidPurchasesWithoutTransaction(purchases, []);
    expect(issues).toHaveLength(13);
    const totalOrfao = issues.reduce((s, i) => s + i.amount, 0);
    expect(totalOrfao).toBeCloseTo(1834.95, 2);
  });
});
