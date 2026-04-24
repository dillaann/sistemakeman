/**
 * Cálculo de comissão de vendedor.
 * 
 * Regra: toda venda DEVE gerar uma comissão. Se o vendedor não tem taxa
 * cadastrada, usar taxa default (5%) ao invés de não gerar comissão.
 */

export const DEFAULT_COMMISSION_PERCENTAGE = 5;

export interface CommissionInput {
  sale_amount: number;
  /** Percentual cadastrado para o vendedor. null/undefined = usa default. */
  rate_percentage?: number | null;
}

export interface CommissionResult {
  amount: number;
  percentage: number;
  used_default: boolean;
}

export function calculateCommission(input: CommissionInput): CommissionResult {
  const hasRate =
    typeof input.rate_percentage === "number" && input.rate_percentage > 0;
  const percentage = hasRate
    ? (input.rate_percentage as number)
    : DEFAULT_COMMISSION_PERCENTAGE;
  const amount = Math.round(input.sale_amount * (percentage / 100) * 100) / 100;
  return {
    amount,
    percentage,
    used_default: !hasRate,
  };
}
