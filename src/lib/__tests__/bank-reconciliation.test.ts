import { describe, it, expect } from "vitest";
import { matchEntries, scorePair } from "@/lib/bank-reconciliation/matching";
import { fuzzyRatio } from "@/lib/bank-reconciliation/fuzzy";
import { parseOFX } from "@/lib/bank-reconciliation/parsers/ofx";
import type { FinancialTxCandidate, ParsedStatementEntry } from "@/lib/bank-reconciliation/types";

const entry = (over: Partial<ParsedStatementEntry> = {}): ParsedStatementEntry => ({
  entry_date: "2026-07-10",
  direction: "entrada",
  amount: 850,
  description: "PIX RECEBIDO ERICK",
  counterparty_name: "ERICK SILVA",
  ...over,
});

const tx = (over: Partial<FinancialTxCandidate> = {}): FinancialTxCandidate => ({
  id: "t1",
  type: "a_receber",
  amount: 850,
  due_date: "2026-07-10",
  description: "Recebimento PIX Erick",
  client_name: "Vale - Erick",
  ...over,
});

describe("fuzzyRatio", () => {
  it("matches similar names", () => {
    expect(fuzzyRatio("Vale - Erick", "ERICK SILVA")).toBeGreaterThan(0.2);
    expect(fuzzyRatio("Empresa ABC", "ABC LTDA")).toBeGreaterThan(0.2);
  });
});

describe("scorePair", () => {
  it("high score on exact amount + same day + fuzzy name", () => {
    const r = scorePair(entry(), tx(), false);
    expect(r.score).toBeGreaterThan(60);
  });
  it("rejects different amounts", () => {
    const r = scorePair(entry(), tx({ amount: 900 }), false);
    expect(r.score).toBe(-Infinity);
  });
  it("rejects opposite direction", () => {
    const r = scorePair(entry({ direction: "saida" }), tx(), false);
    expect(r.score).toBe(-Infinity);
  });
});

describe("matchEntries", () => {
  it("assigns best candidate greedily", () => {
    const results = matchEntries([entry()], [tx()]);
    expect(results).toHaveLength(1);
    expect(results[0].top[0].transactionId).toBe("t1");
  });
  it("leaves entries with no candidate unmatched", () => {
    const results = matchEntries([entry()], []);
    expect(results[0].transactionId).toBeNull();
  });
});

describe("parseOFX", () => {
  it("parses a simple OFX block", () => {
    const ofx = `<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260710<TRNAMT>850.00<FITID>ABC1<MEMO>PIX Erick</STMTTRN></OFX>`;
    const parsed = parseOFX(ofx);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].amount).toBe(850);
    expect(parsed[0].direction).toBe("entrada");
    expect(parsed[0].entry_date).toBe("2026-07-10");
  });
});
