import * as XLSX from "xlsx";
import { guessColumnMap, parseTabular, type ColumnMap } from "./tabular";
import type { ParsedStatementEntry } from "../types";

export async function parseXLSXFile(file: File, map?: ColumnMap): Promise<{ entries: ParsedStatementEntry[]; headers: string[]; map: ColumnMap }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const finalMap = map ?? guessColumnMap(headers);
  const entries = parseTabular(rows, finalMap);
  return { entries, headers, map: finalMap };
}
