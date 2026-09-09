/**
 * Geração de ocorrências para previsões financeiras (módulo isolado).
 * Todas as datas trafegam como strings YYYY-MM-DD para evitar deslocamento de fuso.
 */

export type ForecastRecurrence =
  | "none"
  | "weekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "custom_months";

const MONTH_STEP: Record<Exclude<ForecastRecurrence, "none" | "weekly" | "custom_months">, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

const MAX_OCCURRENCES = 240;

export const toIso = (y: number, m: number, d: number): string => {
  // m é 1-based. Ajusta o dia para o último dia do mês quando necessário (ex: 31 em fevereiro).
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

export interface GenerateOccurrencesInput {
  recurrence: ForecastRecurrence;
  /** Data da primeira ocorrência (YYYY-MM-DD). */
  startDate: string;
  /** Data limite inclusiva (YYYY-MM-DD). Se ausente, usa o horizonte padrão. */
  endDate?: string | null;
  /** Meses (1-12) em que a previsão ocorre — usado em custom_months. */
  months?: number[];
  /** Horizonte padrão em meses quando não há data de término. */
  defaultHorizonMonths?: number;
}

/** Retorna a lista de datas (YYYY-MM-DD) das ocorrências geradas. */
export function generateOccurrences(input: GenerateOccurrencesInput): string[] {
  const { recurrence, startDate } = input;
  if (!startDate) return [];
  if (recurrence === "none") return [startDate];

  const start = parse(startDate);
  const horizon = input.defaultHorizonMonths ?? 12;
  const limitIso =
    input.endDate && input.endDate.length === 10
      ? input.endDate
      : toIso(
          start.y + Math.floor((start.m - 1 + horizon) / 12),
          ((start.m - 1 + horizon) % 12) + 1,
          start.d,
        );

  const dates: string[] = [];

  if (recurrence === "weekly") {
    const cursor = new Date(start.y, start.m - 1, start.d);
    const limit = (() => {
      const l = parse(limitIso);
      return new Date(l.y, l.m - 1, l.d);
    })();
    while (cursor <= limit && dates.length < MAX_OCCURRENCES) {
      dates.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      );
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  if (recurrence === "custom_months") {
    const months = (input.months ?? []).slice().sort((a, b) => a - b);
    if (months.length === 0) return [startDate];
    const limit = parse(limitIso);
    for (let y = start.y; y <= limit.y && dates.length < MAX_OCCURRENCES; y++) {
      for (const m of months) {
        const iso = toIso(y, m, start.d);
        if (iso < startDate) continue;
        if (iso > limitIso) continue;
        dates.push(iso);
      }
    }
    return dates;
  }

  const step = MONTH_STEP[recurrence];
  let y = start.y;
  let m = start.m;
  while (dates.length < MAX_OCCURRENCES) {
    const iso = toIso(y, m, start.d);
    if (iso > limitIso) break;
    dates.push(iso);
    m += step;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
  }
  return dates;
}

export const RECURRENCE_LABELS: Record<ForecastRecurrence, string> = {
  none: "Sem recorrência",
  weekly: "Semanal",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
  custom_months: "Meses específicos",
};

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
