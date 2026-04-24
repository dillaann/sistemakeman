/**
 * Validação de datas para o sistema.
 * 
 * Regras críticas:
 * 1. Datas em formato YYYY-MM-DD devem ser válidas (sem mês 13, dia 32, etc).
 * 2. Datas de compra/transação não podem estar mais de N anos no passado
 *    quando a data de criação é recente (typo de ano: 2024 em vez de 2026).
 * 3. Datas não podem estar no futuro (exceto datas de vencimento/agendamento).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

export interface DateConsistencyInput {
  /** Data informada pelo usuário (ex: purchase_date). YYYY-MM-DD */
  event_date: string | null | undefined;
  /** Data de criação no banco (created_at). ISO string. */
  created_at: string | Date;
  /** Anos máximos de defasagem aceitos entre event_date e created_at. */
  max_year_lag?: number;
}

export function validateEventDateAgainstCreation(
  input: DateConsistencyInput,
): { valid: boolean; reason?: string } {
  const { event_date, created_at } = input;
  const maxLag = input.max_year_lag ?? 1;

  if (!isValidIsoDate(event_date ?? "")) {
    return { valid: false, reason: "event_date inválido (formato YYYY-MM-DD)" };
  }

  const created =
    created_at instanceof Date ? created_at : new Date(created_at);
  if (Number.isNaN(created.getTime())) {
    return { valid: false, reason: "created_at inválido" };
  }

  const eventYear = Number(event_date!.slice(0, 4));
  const createdYear = created.getFullYear();
  const lag = createdYear - eventYear;

  if (lag > maxLag) {
    return {
      valid: false,
      reason: `event_date (${event_date}) está ${lag} anos antes de created_at (${createdYear}). Provável typo.`,
    };
  }

  if (lag < -1) {
    return {
      valid: false,
      reason: `event_date (${event_date}) está ${-lag} anos no futuro em relação a created_at.`,
    };
  }

  return { valid: true };
}
