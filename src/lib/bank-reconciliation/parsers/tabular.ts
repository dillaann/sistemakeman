import type { ParsedStatementEntry, StatementDirection } from "../types";
import { parseLocalDate, localDateString } from "@/lib/utils";

export interface ColumnMap {
  date: string;
  amount: string;
  description?: string;
  type?: string;
  counterparty?: string;
  document?: string;
  direction?: string; // column containing "C"/"D" or "entrada"/"saida"
  credit?: string; // separate credit column
  debit?: string; // separate debit column
}

function parseNumber(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return NaN;
  if (typeof raw === "number") return raw;
  let s = String(raw).trim();
  s = s.replace(/[R$\s]/g, "");
  // Brazilian format: 1.234,56
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(s);
}

function parseDate(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date) return localDateString(raw);
  const s = String(raw).trim();
  // dd/mm/yyyy
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = parseLocalDate(s);
  return d ? localDateString(d) : null;
}

export function guessColumnMap(headers: string[]): ColumnMap {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const find = (...keys: string[]) => headers.find((h) => keys.some((k) => norm(h).includes(k))) ?? "";
  const credit = find("credito", "entrada", "receita");
  const debit = find("debito", "saida", "despesa");
  return {
    date: find("data", "dt"),
    amount: find("valor", "montante", "vlr"),
    description: find("historico", "descricao", "descrição", "memo"),
    type: find("tipo", "operacao"),
    counterparty: find("favorecido", "pagador", "recebedor", "nome"),
    document: find("documento", "doc", "num"),
    direction: find("c/d", "d/c", "sinal"),
    credit,
    debit,
  };
}

export function parseTabular(rows: Record<string, unknown>[], map: ColumnMap): ParsedStatementEntry[] {
  const out: ParsedStatementEntry[] = [];
  for (const row of rows) {
    const dateStr = parseDate(row[map.date]);
    if (!dateStr) continue;

    let amount: number;
    let direction: StatementDirection;

    if (map.credit && map.debit && (row[map.credit] || row[map.debit])) {
      const c = parseNumber(row[map.credit]);
      const d = parseNumber(row[map.debit]);
      if (!Number.isNaN(c) && c > 0) { amount = c; direction = "entrada"; }
      else if (!Number.isNaN(d) && d > 0) { amount = d; direction = "saida"; }
      else continue;
    } else {
      const raw = parseNumber(row[map.amount]);
      if (Number.isNaN(raw)) continue;
      if (map.direction && row[map.direction] != null) {
        const d = String(row[map.direction]).toLowerCase();
        direction = d.startsWith("c") || d.includes("entrada") || d.includes("cred") ? "entrada" : "saida";
        amount = Math.abs(raw);
      } else {
        direction = raw >= 0 ? "entrada" : "saida";
        amount = Math.abs(raw);
      }
    }

    out.push({
      entry_date: dateStr,
      direction,
      amount,
      description: map.description ? String(row[map.description] ?? "") : null,
      type: map.type ? String(row[map.type] ?? "") : null,
      counterparty_name: map.counterparty ? String(row[map.counterparty] ?? "") : null,
      document_number: map.document ? String(row[map.document] ?? "") : null,
      raw: row,
    });
  }
  return out;
}
