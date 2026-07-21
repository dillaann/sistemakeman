import type { ParsedStatementEntry, StatementDirection } from "../types";

// pdfjs-dist ESM legacy build works in the browser without a worker when configured.
// We disable the worker to keep the import simple; performance is fine for statements.
async function extractText(file: File): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  try { pdfjs.GlobalWorkerOptions.workerSrc = ""; } catch {}
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: buf,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group text items by their Y coordinate so we reconstruct visual lines.
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      const t = item.transform as number[];
      const y = Math.round(t[5]);
      const x = t[4] as number;
      const str = (item.str as string) ?? "";
      if (!str) continue;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str });
    }
    const ys = Array.from(rows.keys()).sort((a, b) => b - a);
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.str);
      const line = parts.join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    }
  }
  return lines;
}

function parseBRDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseBRNumber(s: string): number | null {
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Line patterns commonly seen in CREDCREA / Sicoob / Sicredi / and most brazilian bank statements:
//   DD/MM/YYYY  <descrição livre>  1.234,56 C   (or D, or - sign, or parentheses)
//   DD/MM/YYYY  <descrição livre>  -1.234,56
//   DD/MM/YYYY  <descrição livre>  1.234,56  9.999,99   (valor + saldo)
const DATE_RE = /(\d{2}\/\d{2}\/\d{4})/;
const AMOUNT_RE = /-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?/g;

interface RawTx { date: string; desc: string; amount: number; direction: StatementDirection; }

function parseLines(lines: string[]): RawTx[] {
  const out: RawTx[] = [];
  let carry: { date: string; parts: string[] } | null = null;

  const flush = () => {
    if (!carry) return;
    const text = carry.parts.join(" ");
    const nums = text.match(AMOUNT_RE) ?? [];
    if (nums.length === 0) { carry = null; return; }

    // Detect direction marker at the end: last token might be "C"/"D" letter, or (value), or -value
    let amountStr: string;
    let dir: StatementDirection | null = null;

    // If line ends with " C" or " D" after last number
    const tail = text.slice(text.lastIndexOf(nums[nums.length - 1]) + nums[nums.length - 1].length).trim();
    if (/^C(RÉD|RED)?$/i.test(tail)) dir = "entrada";
    else if (/^D(ÉB|EB)?$/i.test(tail)) dir = "saida";

    // Prefer the first numeric value on the transaction line — banks usually put
    // "valor  saldo" and the second column is running balance, not the movement.
    amountStr = nums[0];

    // Fallback to sign detection when no C/D marker
    if (!dir) {
      if (amountStr.startsWith("-") || amountStr.startsWith("(")) dir = "saida";
      else {
        // Heuristic on description keywords
        const desc = text.toLowerCase();
        if (/(cred|receb|dep[oó]sito|entrada|pix recebido|ted recebid)/.test(desc)) dir = "entrada";
        else dir = "saida";
      }
    }

    const amt = parseBRNumber(amountStr.replace(/[()-]/g, ""));
    if (amt != null && amt > 0) {
      // Description = original text minus date and trailing amounts/markers
      let desc = text.replace(carry.date, "").trim();
      for (const n of nums) desc = desc.replace(n, "");
      desc = desc.replace(/\s+[CD]\s*$/i, "").replace(/\s+/g, " ").trim();
      out.push({ date: carry.date, desc, amount: amt, direction: dir });
    }
    carry = null;
  };

  for (const line of lines) {
    // Skip obvious header / footer noise
    if (/^(saldo|extrato|per[ií]odo|conta|ag[eê]ncia|p[aá]gina|data\s+hist|hist[oó]rico|cooperado)/i.test(line)) {
      flush();
      continue;
    }
    const dm = line.match(DATE_RE);
    if (dm) {
      // starting a new transaction: flush previous
      flush();
      carry = { date: dm[1], parts: [line] };
    } else if (carry) {
      // continuation of previous transaction (multiline description)
      carry.parts.push(line);
      // If this continuation line has amounts, close the transaction here
      if (AMOUNT_RE.test(line)) {
        AMOUNT_RE.lastIndex = 0;
        flush();
      }
    }
  }
  flush();
  return out;
}

export async function parsePDF(file: File): Promise<ParsedStatementEntry[]> {
  const lines = await extractText(file);
  const raw = parseLines(lines);
  return raw
    .map((r) => {
      const iso = parseBRDate(r.date);
      if (!iso) return null;
      return {
        entry_date: iso,
        direction: r.direction,
        amount: r.amount,
        description: r.desc || null,
        raw: { line: r.desc, source: "pdf" },
      } satisfies ParsedStatementEntry;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}
