import type { ParsedStatementEntry } from "../types";

function ofxDate(raw: string): string {
  // OFX date: YYYYMMDD[HHMMSS[.XXX][TZ]]
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function ofxTime(raw: string): string | null {
  if (raw.length < 14) return null;
  const h = raw.slice(8, 10);
  const mi = raw.slice(10, 12);
  const s = raw.slice(12, 14);
  return `${h}:${mi}:${s}`;
}

function extract(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

export function parseOFX(text: string): ParsedStatementEntry[] {
  const entries: ParsedStatementEntry[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const block = b.split(/<\/STMTTRN>/i)[0];
    const dtRaw = extract(block, "DTPOSTED");
    const amtRaw = extract(block, "TRNAMT");
    if (!dtRaw || !amtRaw) continue;
    const amount = parseFloat(amtRaw.replace(",", "."));
    if (Number.isNaN(amount)) continue;
    entries.push({
      entry_date: ofxDate(dtRaw),
      entry_time: ofxTime(dtRaw),
      type: extract(block, "TRNTYPE"),
      direction: amount >= 0 ? "entrada" : "saida",
      amount: Math.abs(amount),
      description: extract(block, "MEMO") || extract(block, "NAME"),
      counterparty_name: extract(block, "NAME"),
      document_number: extract(block, "CHECKNUM"),
      external_id: extract(block, "FITID"),
      raw: { block },
    });
  }
  return entries;
}
