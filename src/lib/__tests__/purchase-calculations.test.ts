/**
 * Testes de regressão: bug do duplo desconto em compras via foto/IA.
 * Histórico: anteriormente, unit_price era salvo como preço original e
 * total era calculado com desconto, quebrando a invariante total = qty*unit_price
 * e gerando descontos inflados.
 */
import { describe, it, expect } from "vitest";
import {
  calculatePurchaseItems,
  validatePurchaseConsistency,
} from "@/lib/purchase-calculations";

describe("regressão: cálculo de compras (duplo desconto)", () => {
  it("invariante total = quantity × unit_price em todos os itens (sem desconto)", () => {
    const items = calculatePurchaseItems({
      items: [
        { material: "Chapa", quantity: 10, unit_price: 50 },
        { material: "Tubo", quantity: 4, unit_price: 30 },
      ],
    });
    items.forEach((item) => {
      expect(item.total).toBeCloseTo(item.quantity * item.unit_price, 2);
      expect(item.discount_amount).toBe(0);
      expect(item.original_price).toBeNull();
    });
  });

  it("invariante total = quantity × unit_price com desconto rateado", () => {
    // Nota original 1000, paga 800 => fator 0.8
    const items = calculatePurchaseItems({
      items: [
        { material: "Chapa", quantity: 10, unit_price: 50 }, // 500 -> 400
        { material: "Tubo", quantity: 5, unit_price: 100 }, // 500 -> 400
      ],
      original_total: 1000,
      final_total: 800,
    });

    items.forEach((item) => {
      const consistency = validatePurchaseConsistency(item);
      expect(consistency.errors).toEqual([]);
      expect(consistency.valid).toBe(true);
    });

    const totalFinal = items.reduce((s, i) => s + i.total, 0);
    expect(totalFinal).toBeCloseTo(800, 2);
  });

  it("não aplica desconto duas vezes — discount_amount = original − final", () => {
    const items = calculatePurchaseItems({
      items: [{ material: "Chapa", quantity: 10, unit_price: 100 }],
      original_total: 1000,
      final_total: 900,
    });

    expect(items[0].unit_price).toBeCloseTo(90, 2);
    expect(items[0].total).toBeCloseTo(900, 2);
    expect(items[0].original_price).toBe(100);
    expect(items[0].discount_amount).toBeCloseTo(100, 2);
    // Bug antigo: discount era ~100 mas total também era 900 com unit_price=100
    // (=1000), o que dava desconto duplicado quando recalculado.
    expect(items[0].quantity * items[0].unit_price).toBeCloseTo(items[0].total, 2);
  });

  it("rejeita inconsistências históricas (total ≠ qty × unit_price)", () => {
    // Simula um registro corrompido pelo bug antigo
    const result = validatePurchaseConsistency({
      quantity: 10,
      unit_price: 100, // preço original
      total: 900, // mas total é o final (com desconto)
      original_price: null,
      discount_amount: 100,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/total/);
  });

  it("desconto nunca é negativo nem maior que o valor original", () => {
    // final maior que original (não deve gerar desconto negativo)
    const items = calculatePurchaseItems({
      items: [{ material: "X", quantity: 1, unit_price: 100 }],
      original_total: 100,
      final_total: 110, // anomalia: pago mais que o original
    });
    expect(items[0].discount_amount).toBe(0);
    expect(items[0].original_price).toBeNull();
  });

  it("um único item com desconto preserva consistência", () => {
    const items = calculatePurchaseItems({
      items: [{ material: "Solda", quantity: 3, unit_price: 200 }],
      original_total: 600,
      final_total: 540,
    });
    expect(items[0].unit_price).toBeCloseTo(180, 2);
    expect(items[0].total).toBeCloseTo(540, 2);
    expect(items[0].discount_percentage).toBeCloseTo(10, 2);
  });
});
