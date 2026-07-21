import { parseLocalDate } from "@/lib/utils";
import { fuzzyRatio, onlyDigits } from "./fuzzy";
import type { FinancialTxCandidate, MatchResult, ParsedStatementEntry } from "./types";

export const WEIGHTS = {
  amountEqual: 50,
  sameDay: 20,
  oneDay: 12,
  twoDay: 6,
  farDay: -50,
  nameFuzzyMax: 15,
  documentEqual: 100,
  pixEqual: 100,
  docNumberEqual: 80,
  sameBank: 5,
  descKeywordMax: 10,
  reused: -20,
};

const AMOUNT_TOLERANCE = 0.01;

function dayDiff(a: string, b: string): number {
  const da = parseLocalDate(a);
  const db = parseLocalDate(b);
  if (!da || !db) return 9999;
  return Math.round(Math.abs(da.getTime() - db.getTime()) / 86400000);
}

function descKeywordScore(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const keys = ["pix", "ted", "doc", "boleto", "tarifa", "juros", "rendimento", "transferencia", "deposito"];
  const na = (a || "").toLowerCase();
  const nb = (b || "").toLowerCase();
  let hits = 0;
  for (const k of keys) if (na.includes(k) && nb.includes(k)) hits++;
  return Math.min(WEIGHTS.descKeywordMax, hits * 5);
}

export function scorePair(
  entry: ParsedStatementEntry,
  tx: FinancialTxCandidate,
  reused: boolean,
): { score: number; breakdown: string[] } {
  const breakdown: string[] = [];
  const expectedType = entry.direction === "entrada" ? "a_receber" : "a_pagar";
  if (tx.type !== expectedType) return { score: -Infinity, breakdown: ["tipo divergente"] };
  if (Math.abs(Number(tx.amount) - Number(entry.amount)) > AMOUNT_TOLERANCE) {
    return { score: -Infinity, breakdown: ["valor divergente"] };
  }

  let score = WEIGHTS.amountEqual;
  breakdown.push(`+${WEIGHTS.amountEqual} valor igual`);

  const txDate = tx.paid_date || tx.due_date;
  const diff = dayDiff(entry.entry_date, txDate);
  if (diff === 0) { score += WEIGHTS.sameDay; breakdown.push(`+${WEIGHTS.sameDay} mesmo dia`); }
  else if (diff === 1) { score += WEIGHTS.oneDay; breakdown.push(`+${WEIGHTS.oneDay} ±1 dia`); }
  else if (diff === 2) { score += WEIGHTS.twoDay; breakdown.push(`+${WEIGHTS.twoDay} ±2 dias`); }
  else if (diff > 5) { score += WEIGHTS.farDay; breakdown.push(`${WEIGHTS.farDay} data distante`); }

  const partyName = entry.counterparty_name || entry.description;
  const txName = tx.client_name || tx.supplier_name || tx.description;
  const nameSim = fuzzyRatio(partyName, txName);
  if (nameSim > 0) {
    const add = Math.round(nameSim * WEIGHTS.nameFuzzyMax);
    if (add > 0) { score += add; breakdown.push(`+${add} nome (${(nameSim * 100).toFixed(0)}%)`); }
  }

  const entryDoc = onlyDigits(entry.counterparty_document);
  if (entryDoc && entryDoc.length >= 11) {
    // No direct doc on tx; rely on description containing it
    if ((tx.description || "").replace(/\D+/g, "").includes(entryDoc)) {
      score += WEIGHTS.documentEqual;
      breakdown.push(`+${WEIGHTS.documentEqual} CPF/CNPJ igual`);
    }
  }

  const entryDocNum = (entry.document_number || "").trim();
  if (entryDocNum && (tx.description || "").includes(entryDocNum)) {
    score += WEIGHTS.docNumberEqual;
    breakdown.push(`+${WEIGHTS.docNumberEqual} documento igual`);
  }

  const dk = descKeywordScore(entry.description, tx.description);
  if (dk > 0) { score += dk; breakdown.push(`+${dk} descrição similar`); }

  if (reused) { score += WEIGHTS.reused; breakdown.push(`${WEIGHTS.reused} já usado`); }

  return { score, breakdown };
}

export interface MatchingOptions {
  suggestThreshold?: number; // default 90
  pendingThreshold?: number; // default 40
  gap?: number; // min gap above 2nd best to auto-suggest
}

export function matchEntries(
  entries: ParsedStatementEntry[],
  txs: FinancialTxCandidate[],
  opts: MatchingOptions = {},
): MatchResult[] {
  const suggestThreshold = opts.suggestThreshold ?? 90;
  const gap = opts.gap ?? 20;

  const used = new Set<string>();
  const results: MatchResult[] = [];

  const scored = entries.map((entry, entryIndex) => {
    const pairs = txs.map((tx) => ({
      transactionId: tx.id,
      ...scorePair(entry, tx, false),
    }));
    const valid = pairs.filter((p) => p.score !== -Infinity).sort((a, b) => b.score - a.score);
    return { entryIndex, entry, valid };
  });

  // Greedy assign by highest score first.
  const order = [...scored].sort((a, b) => (b.valid[0]?.score ?? -Infinity) - (a.valid[0]?.score ?? -Infinity));

  for (const item of order) {
    const best = item.valid.find((p) => !used.has(p.transactionId));
    const secondScore = item.valid.filter((p) => p.transactionId !== best?.transactionId)[0]?.score ?? -Infinity;
    if (best && best.score >= suggestThreshold && best.score - secondScore >= gap) {
      used.add(best.transactionId);
      results.push({
        entryIndex: item.entryIndex,
        transactionId: best.transactionId,
        score: best.score,
        breakdown: best.breakdown,
        top: item.valid.slice(0, 3).map((p) => ({ transactionId: p.transactionId, score: p.score, breakdown: p.breakdown })),
      });
    } else {
      results.push({
        entryIndex: item.entryIndex,
        transactionId: null,
        score: best?.score ?? 0,
        breakdown: best?.breakdown ?? [],
        top: item.valid.slice(0, 3).map((p) => ({ transactionId: p.transactionId, score: p.score, breakdown: p.breakdown })),
      });
    }
  }

  return results.sort((a, b) => a.entryIndex - b.entryIndex);
}
