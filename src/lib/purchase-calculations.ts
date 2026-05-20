/**
 * Cálculo de compras preservando o valor final digitado pelo usuário.
 * 
 * Regras críticas (cobertas por testes de regressão):
 * 1. Invariante: total === quantity * unit_price (sempre, com tolerância de centavos)
 * 2. Se houver final_total digitado, ele é o total soberano do pedido.
 * 3. original_price e discount_amount não são usados para alterar o valor salvo.
 * 4. Nunca reduzir automaticamente o valor digitado como "desconto".
 */

export interface RawPurchaseItem {
  material: string;
  quantity: number;
  unit?: string;
  /** Preço unitário digitado ou extraído da nota. */
  unit_price: number;
  client_id?: string | null;
  work_order_id?: string | null;
}

export interface CalculatedPurchaseItem {
  material: string;
  quantity: number;
  unit: string;
  /** Preço unitário final, preservando o total digitado. */
  unit_price: number;
  /** Mantido para compatibilidade; não usado para desconto automático. */
  original_price: number | null;
  /** Sempre = quantity * unit_price. */
  total: number;
  discount_amount: number;
  discount_percentage: number;
  client_id: string | null;
  work_order_id: string | null;
}

export interface CalculatePurchaseInput {
  items: RawPurchaseItem[];
  /** Campo legado; não reduz valores automaticamente. */
  original_total?: number | null;
  /** Total digitado pelo usuário. Se ausente, usa soma dos itens. */
  final_total?: number | null;
}

export function calculatePurchaseItems(
  input: CalculatePurchaseInput,
): CalculatedPurchaseItem[] {
  const items = input.items.filter((i) => i.material);
  if (items.length === 0) return [];

  const itemsTotal = items.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0),
    0,
  );

  const typedFinalTotal =
    input.final_total && input.final_total > 0 ? input.final_total : itemsTotal;
  const totalFactor = itemsTotal > 0 ? typedFinalTotal / itemsTotal : 1;

  return items.map((item) => {
    const qty = item.quantity || 1;
    const typedUnitPrice = item.unit_price || 0;
    const finalUnitPrice = typedUnitPrice * totalFactor;
    const itemFinalTotal = qty * finalUnitPrice;

    return {
      material: item.material,
      quantity: qty,
      unit: item.unit ?? "un",
      unit_price: finalUnitPrice,
      original_price: null,
      total: itemFinalTotal,
      discount_amount: 0,
      discount_percentage: 0,
      client_id: item.client_id ?? null,
      work_order_id: item.work_order_id ?? null,
    };
  });
}

/**
 * Verifica se um registro de compra está consistente:
 * - total === quantity * unit_price (com tolerância de R$ 0,01)
 * - discount_amount não é negativo
 * - discount_amount não excede o valor original
 */
export function validatePurchaseConsistency(purchase: {
  quantity: number;
  unit_price: number;
  total: number;
  original_price?: number | null;
  discount_amount?: number | null;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const expectedTotal = purchase.quantity * purchase.unit_price;
  if (Math.abs(expectedTotal - purchase.total) > 0.01) {
    errors.push(
      `total (${purchase.total}) ≠ quantity × unit_price (${expectedTotal.toFixed(2)})`,
    );
  }

  const discount = purchase.discount_amount ?? 0;
  if (discount < 0) {
    errors.push(`discount_amount negativo: ${discount}`);
  }

  if (purchase.original_price && purchase.original_price > 0) {
    const maxDiscount = purchase.quantity * purchase.original_price;
    // O desconto não pode ser maior que o valor original total do item.
    if (discount > maxDiscount + 0.01) {
      errors.push(
        `discount_amount (${discount}) > qty × original_price (${maxDiscount.toFixed(2)})`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
