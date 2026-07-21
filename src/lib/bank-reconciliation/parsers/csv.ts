import Papa from "papaparse";
import { guessColumnMap, parseTabular, type ColumnMap } from "./tabular";
import type { ParsedStatementEntry } from "../types";

export function parseCSVFile(text: string, map?: ColumnMap): { entries: ParsedStatementEntry[]; headers: string[]; map: ColumnMap } {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const headers = result.meta.fields ?? [];
  const finalMap = map ?? guessColumnMap(headers);
  const entries = parseTabular(result.data, finalMap);
  return { entries, headers, map: finalMap };
}
