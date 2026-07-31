import { localDateString, parseLocalDate } from "@/lib/utils";

/** Origem de um evento de caixa (usado para rastreabilidade e detalhamento). */
export type CashFlowSource =
  | "financeiro"
  | "conta_receber"
  | "conta_pagar"
  | "folha"
  | "marketing"
  | "compra";

export interface CashFlowEvent {
  /** Data no formato YYYY-MM-DD (sempre local, nunca UTC). */
  date: string;
  direction: "in" | "out";
  amount: number;
  /** true = já efetivado (pago/recebido). false = previsto. */
  realized: boolean;
  description: string;
  source: CashFlowSource;
}

export interface CashFlowDay {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  /** Saldo acumulado ao final do dia. */
  cumulative: number;
  isPast: boolean;
  isToday: boolean;
  /** true quando o dia é projetado (futuro). */
  isProjected: boolean;
  events: CashFlowEvent[];
}

export interface CashFlowAnalysis {
  minBalance: number;
  /** Dias com saldo acumulado abaixo do mínimo configurado. */
  criticalDays: CashFlowDay[];
  /** Dias com saldo acumulado negativo. */
  negativeDays: CashFlowDay[];
  worstDay: CashFlowDay | null;
  biggestOutflowDay: CashFlowDay | null;
  /** Quanto precisa entrar para que nenhum dia fique abaixo do mínimo. */
  cashNeed: number;
  totalInflow: number;
  totalOutflow: number;
  finalBalance: number;
}

/** Gera a lista de datas (YYYY-MM-DD) entre start e end, inclusivo. */
export function enumerateDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  // Guarda contra intervalos invertidos ou absurdos (proteção de loop infinito).
  let guard = 0;
  while (cursor.getTime() <= last.getTime() && guard < 1000) {
    days.push(localDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return days;
}

interface BuildCashFlowInput {
  events: CashFlowEvent[];
  start: Date;
  end: Date;
  /** Saldo real das contas na data de hoje. */
  currentBalance: number;
  today?: Date;
}

/**
 * Monta o fluxo diário. O saldo acumulado é calculado de forma que,
 * no dia de hoje, o acumulado seja exatamente o saldo real das contas:
 * os dias passados são reconstruídos para trás e os futuros projetados para frente.
 */
export function buildCashFlow({ events, start, end, currentBalance, today }: BuildCashFlowInput): CashFlowDay[] {
  const todayStr = localDateString(today ?? new Date());
  const dates = enumerateDays(start, end);
  if (dates.length === 0) return [];

  const byDate = new Map<string, CashFlowEvent[]>();
  for (const ev of events) {
    if (!ev?.date || !Number.isFinite(ev.amount)) continue;
    if (ev.date < dates[0] || ev.date > dates[dates.length - 1]) continue;
    const list = byDate.get(ev.date) ?? [];
    list.push(ev);
    byDate.set(ev.date, list);
  }

  // Soma dos fluxos já realizados dentro do período até hoje (inclusive),
  // usada para reconstruir o saldo de abertura do período.
  let realizedNetUpToToday = 0;
  for (const ev of events) {
    if (ev.date < dates[0] || ev.date > todayStr) continue;
    if (!ev.realized) continue;
    realizedNetUpToToday += ev.direction === "in" ? ev.amount : -ev.amount;
  }

  let running = currentBalance - realizedNetUpToToday;

  return dates.map((date) => {
    const dayEvents = byDate.get(date) ?? [];
    const inflow = dayEvents.filter((e) => e.direction === "in").reduce((s, e) => s + e.amount, 0);
    const outflow = dayEvents.filter((e) => e.direction === "out").reduce((s, e) => s + e.amount, 0);
    const net = inflow - outflow;
    running += net;
    return {
      date,
      inflow,
      outflow,
      net,
      cumulative: running,
      isPast: date < todayStr,
      isToday: date === todayStr,
      isProjected: date > todayStr,
      events: dayEvents,
    };
  });
}

export function analyzeCashFlow(days: CashFlowDay[], minBalance: number): CashFlowAnalysis {
  const criticalDays = days.filter((d) => d.cumulative < minBalance);
  const negativeDays = days.filter((d) => d.cumulative < 0);
  const worstDay = days.reduce<CashFlowDay | null>(
    (worst, d) => (!worst || d.cumulative < worst.cumulative ? d : worst),
    null,
  );
  const biggestOutflowDay = days.reduce<CashFlowDay | null>(
    (max, d) => (d.outflow > 0 && (!max || d.outflow > max.outflow) ? d : max),
    null,
  );
  const lowest = worstDay?.cumulative ?? 0;
  const cashNeed = lowest < minBalance ? minBalance - lowest : 0;

  return {
    minBalance,
    criticalDays,
    negativeDays,
    worstDay,
    biggestOutflowDay,
    cashNeed,
    totalInflow: days.reduce((s, d) => s + d.inflow, 0),
    totalOutflow: days.reduce((s, d) => s + d.outflow, 0),
    finalBalance: days.length ? days[days.length - 1].cumulative : 0,
  };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => parseLocalDate(d)?.toLocaleDateString("pt-BR") ?? d;

/** Recomendações automáticas derivadas exclusivamente da projeção calculada. */
export function buildRecommendations(days: CashFlowDay[], analysis: CashFlowAnalysis): string[] {
  const tips: string[] = [];
  const future = days.filter((d) => !d.isPast);

  const nextSeven = future.slice(0, 7);
  const sevenIn = nextSeven.reduce((s, d) => s + d.inflow, 0);
  const sevenOut = nextSeven.reduce((s, d) => s + d.outflow, 0);
  if (sevenOut > sevenIn) {
    tips.push(
      `Nos próximos 7 dias as saídas superam as entradas em ${brl(sevenOut - sevenIn)} — considere antecipar algum recebimento.`,
    );
  }

  const totalToReceive = future.reduce((s, d) => s + d.inflow, 0);
  const firstCritical = analysis.criticalDays.find((d) => !d.isPast);
  if (totalToReceive > 0 && firstCritical) {
    tips.push(
      `Você tem ${brl(totalToReceive)} a receber até ${br(days[days.length - 1].date)} — priorize cobrar os clientes em atraso para cobrir as saídas de ${br(firstCritical.date)}.`,
    );
  }

  const big = analysis.biggestOutflowDay;
  if (big && !big.isPast) {
    const main = [...big.events]
      .filter((e) => e.direction === "out")
      .sort((a, b) => b.amount - a.amount)[0];
    tips.push(
      `A maior saída do período é em ${br(big.date)} com ${brl(big.outflow)}${main ? ` (${main.description})` : ""} — garanta esse valor em caixa antes dessa data.`,
    );
  }

  if (analysis.cashNeed > 0) {
    tips.push(
      `Para não ficar abaixo do mínimo é preciso reforçar o caixa em ${brl(analysis.cashNeed)} até ${br(analysis.worstDay?.date ?? days[days.length - 1].date)}.`,
    );
  }

  if (tips.length === 0) {
    tips.push("Projeção saudável: nenhum dia do período fica abaixo do saldo mínimo configurado.");
  }
  return tips;
}
